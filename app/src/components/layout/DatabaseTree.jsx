import React, { useState } from 'react';
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Paper,
  Tooltip
} from '@mui/material';
import {
  ExpandMore,
  ChevronRight,
  Cable as ConnectionIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { useClipboard } from '../../context/ClipboardContext';
import { useQuery } from '../../context/QueryContext';
import { useEffect, useRef } from 'react';
import ContextMenu from '../menus/ContextMenu';
import PasteDialog from '../dialogs/PasteDialog';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import RenameDialog from '../dialogs/RenameDialog';
import CreateDatabaseDialog from '../dialogs/CreateDatabaseDialog';
import ExportDialog from '../dialogs/ExportDialog';
import ImportDialog from '../dialogs/ImportDialog';
import CollectionStatsTooltip from './CollectionStatsTooltip';
import CollectionInfoDialog from '../dialogs/CollectionInfoDialog';
import DetailedProgressDialog from '../dialogs/DetailedProgressDialog';
import { generateConnectionDisplayName } from '../../utils/connectionUtils';
import { getDefaultQueryLimit, generateCollectionQuery } from '../../utils/settingsUtils';
import { getTerminology, isRelationalDatabase, supportsFeature, getDatabaseDisplayName, getPostgreSQLObjectLabels, getPostgreSQLObjectQuery, PostgreSQLObjectTypes } from '../../utils/databaseTypeUtils';
import { getDatabaseBranding } from '../../utils/databaseLogos';

const DatabaseTree = ({ setCurrentView }) => {
  const { 
    connections,
    activeConnections,
    savedConnections,
    collections,
    setCollections,
    connect,
    getConnectionDatabaseType,
    disconnect,
    refreshDatabases,
    isLoading,
    connectionError,
    selectedDatabase,
    setSelectedDatabase
  } = useDatabase();

  const {
    addConversation,
    setActiveConversation,
    setConversationDatabase,
    renameConversation,
    updateConversation,
    updateCurrentQuery,
    updateConversationUIState,
    openConversation,
    conversations,
    removeConversation,
    settings
  } = useQuery();



  const {
    copyItem,
    deleteDatabase,
    deleteCollection,
    clipboardItem,
    showNotification,
    pasteDatabase,
    pasteCollection,
    renameDatabase
  } = useClipboard();

  const [expandedDatabases, setExpandedDatabases] = useState(new Set());
  const [expandedConnections, setExpandedConnections] = useState(new Set());
  const [expandedObjectCategories, setExpandedObjectCategories] = useState(new Set()); // Track expanded PostgreSQL object categories
  const [pgObjects, setPgObjects] = useState({}); // Store PostgreSQL objects by connection:database key

  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, items: [] });
  const [pasteDialog, setPasteDialog] = useState({
    isOpen: false,
    type: '',
    sourceName: '',
    targetConnectionId: '',
    targetDatabaseName: ''
  });
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });
  const [importDialog, setImportDialog] = useState({
    isOpen: false,
    connectionId: '',
    databaseName: '',
    databaseType: 'mongodb'
  });
  const [exportDialog, setExportDialog] = useState({
    isOpen: false,
    connectionId: '',
    databaseName: '',
    databaseType: 'mongodb'
  });
  const [collectionStats, setCollectionStats] = useState({
    isVisible: false,
    data: null,
    loading: false,
    connectionId: null,
    databaseName: null,
    collectionName: null,
    position: { x: 0, y: 0 }
  });
  const [hoverTimer, setHoverTimer] = useState(null);
  const [hideTimer, setHideTimer] = useState(null);
  const [collectionInfoDialog, setCollectionInfoDialog] = useState({
    open: false,
    database: null,
    collections: [],
    selectedCollection: null,
    connectionId: null,
    databaseType: 'mongodb'
  });
  const [renameDialog, setRenameDialog] = useState({
    isOpen: false,
    connectionId: '',
    currentName: '',
    type: 'database'
  });
  const [createDatabaseDialog, setCreateDatabaseDialog] = useState({
    isOpen: false,
    connectionId: '',
    connectionName: ''
  });
  const [importProgressDialog, setImportProgressDialog] = useState({
    isOpen: false,
    progress: null,
    operationId: null
  });



  // Listen for import progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.database.onImportProgress((data) => {
      if (data.operationId === importProgressDialog.operationId) {
        console.log('📊 Import progress update:', data.progress);
        
        setImportProgressDialog(prev => ({
          ...prev,
          progress: data.progress
        }));

        // Auto-close on completion
        if (data.progress.stage === 'import_completed' || data.progress.stage === 'completed') {
          console.log('✅ Import stage completed, will auto-close dialog in 2s');
          setTimeout(() => {
            setImportProgressDialog(prev => ({
              ...prev,
              isOpen: false,
              progress: null,
              operationId: null
            }));
          }, 2000);
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [importProgressDialog.operationId]);



  const toggleConnection = (connId) => {
    const newExpanded = new Set(expandedConnections);
    if (newExpanded.has(connId)) {
      newExpanded.delete(connId);
    } else {
      newExpanded.add(connId);
    }
    setExpandedConnections(newExpanded);
  };

  const toggleDatabase = async (connId, dbName) => {
    const newExpanded = new Set(expandedDatabases);
    const key = `${connId}:${dbName}`;
    
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
      // Fetch collections if we don't have them yet
      const collectionKey = `${connId}:${dbName}`;
      if (!collections[collectionKey]) {
        try {
          const result = await window.electronAPI.database.listCollections(connId, dbName);
          if (result.success) {
            setCollections(collectionKey, result.collections.sort((a, b) => a.localeCompare(b)));
            
            // Store PostgreSQL objects if available
            if (result.objects) {
              setPgObjects(prev => ({
                ...prev,
                [collectionKey]: result.objects
              }));
              // Auto-expand Tables category for PostgreSQL
              setExpandedObjectCategories(prev => new Set([...prev, `${collectionKey}:tables`]));
            }
          }
        } catch (error) {
          console.error('Error fetching collections:', error);
        }
      }
    }
    setExpandedDatabases(newExpanded);
  };

  // Toggle PostgreSQL object category expansion
  const toggleObjectCategory = (connId, dbName, category) => {
    const key = `${connId}:${dbName}:${category}`;
    setExpandedObjectCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const getConnectionName = (connectionString) => {
    // Try to find the connection name from saved connections
    const savedConn = savedConnections.find(conn => {
      const connString = typeof conn === 'string' ? conn : conn.connectionString;
      // Normalize both strings by trimming whitespace for better matching
      return connString?.trim() === connectionString?.trim();
    });
    
    if (savedConn && typeof savedConn === 'object' && savedConn.name) {
      return savedConn.name;
    }
    
    // Use our secure utility function for generating display names
    return generateConnectionDisplayName(connectionString);
  };

  // Helper function to check if we can create a tab for a database
  const canCreateTabForDatabase = (connectionId, database) => {
    return Boolean(connectionId && database && connections[connectionId]);
  };

  // Helper function to create a new tab for a specific database
  const createTabForDatabase = (connectionId, database) => {
    if (!canCreateTabForDatabase(connectionId, database)) return;

    const conversationId = `conversation_${Date.now()}`;
    const connection = connections[connectionId];
    const connectionName = getConnectionName(connection.connectionString);
    
    console.log(`📝 Creating tab for database "${database}" with connectionId: ${connectionId}`);
    
    // Create conversation with the specific connectionId
    addConversation(conversationId, null, null, connectionId);
    setActiveConversation(conversationId);
    setConversationDatabase(conversationId, database);
    
    // Name the tab with the database and conversation id
    const tabName = `${database} (${conversationId})`;
    renameConversation(conversationId, tabName);
    
    // Store connection info with the conversation
    updateConversation(conversationId, { 
      connectionId,
      connectionName 
    });
    
    console.log(`✅ Tab created with stored connectionId: ${connectionId}`);
    
    // Switch to query view if not already there
    if (setCurrentView) {
      setCurrentView('query');
    }
    
    return conversationId;
  };

  // Handle double-click on database to create new tab
  const handleDatabaseDoubleClick = (connectionId, database) => {
    createTabForDatabase(connectionId, database);
  };

  // Handle double-click on collection to create new tab with find query
  const handleCollectionDoubleClick = async (connectionId, database, collectionName) => {
    if (!canCreateTabForDatabase(connectionId, database)) return;

    const connection = connections[connectionId];
    const connectionName = getConnectionName(connection.connectionString);
    const databaseType = getConnectionDatabaseType(connectionId);
    const terminology = getTerminology(databaseType);
    
    // Get the default limit from settings
    const limit = getDefaultQueryLimit(settings);
    const findQuery = generateCollectionQuery(collectionName, limit, databaseType);
    
    console.log(`📝 Creating tab for ${terminology.collection} "${collectionName}" in database "${database}" with limit ${limit}`);
    
    try {
      // Set the selected database
      await setSelectedDatabase(database);
      
      // Use openConversation helper - same as QueryList does
      const conversationId = openConversation({ 
        database: database, 
        prompt: '', 
        generatedQuery: findQuery,
        conversationCount: conversations.length + 1 
      });
      
      // Override the name to just be the collection name
      renameConversation(conversationId, collectionName);
      
      // Create an assistant message 
      const assistantMessage = {
        id: `msg_${Date.now()}_text`,
        type: 'assistant',
        content: `I'll help you find the last ${limit} ${terminology.documents} of the **${collectionName}** ${terminology.collection}.`,
        timestamp: new Date().toISOString(),
        showTypewriter: false,
        disableAnimation: true
      };
      
      // Create a query message component
      const queryMessage = {
        id: `msg_${Date.now()}_query`,
        isQuery: true, // This makes it render as QueryDisplay
        queryData: findQuery, // The actual query text
        timestamp: new Date().toISOString(),
        showTypewriter: false,
        disableAnimation: true
      };
      
      // Store connection info and initialize UI state with both messages
      updateConversation(conversationId, { 
        connectionId,
        connectionName,
        uiState: {
          chatMessages: [assistantMessage, queryMessage], // Show message + query component
          inputState: {
            agentValue: '',
            queryValue: '', // Keep input empty
            mode: 'agent'
          }
        }
      });
      
      // Navigate to query view
      if (setCurrentView) {
        setCurrentView('query');
      }
      
      console.log(`✅ Tab created for collection: ${collectionName}`);
      
      return conversationId;
    } catch (error) {
      console.error('Error creating collection tab:', error);
    }
  };

  // Handle double-click on PostgreSQL object (view, function, sequence, etc.)
  const handlePgObjectDoubleClick = async (connectionId, database, objectType, objectInfo) => {
    if (!canCreateTabForDatabase(connectionId, database)) return;

    const connection = connections[connectionId];
    const connectionName = getConnectionName(connection.connectionString);
    const objectLabels = getPostgreSQLObjectLabels();
    const label = objectLabels[objectType];
    const limit = getDefaultQueryLimit(settings);
    
    // Get the appropriate query for this object type
    const query = getPostgreSQLObjectQuery(objectType, objectInfo.name, objectInfo, limit);
    const displayName = objectInfo.fullSignature || objectInfo.name;
    
    console.log(`📝 Creating tab for ${label.singular} "${displayName}" in database "${database}"`);
    
    try {
      await setSelectedDatabase(database);
      
      const conversationId = openConversation({ 
        database: database, 
        prompt: '', 
        generatedQuery: query,
        conversationCount: conversations.length + 1 
      });
      
      renameConversation(conversationId, displayName);
      
      // Create appropriate message based on object type
      let messageContent;
      if (objectType === PostgreSQLObjectTypes.TABLES || objectType === PostgreSQLObjectTypes.VIEWS || objectType === PostgreSQLObjectTypes.MATERIALIZED_VIEWS) {
        messageContent = `Showing data from the **${displayName}** ${label.singular.toLowerCase()}.`;
      } else if (objectType === PostgreSQLObjectTypes.FUNCTIONS) {
        messageContent = `Showing the definition of **${displayName}** function.`;
      } else if (objectType === PostgreSQLObjectTypes.SEQUENCES) {
        messageContent = `Showing the current state of **${displayName}** sequence.`;
      } else if (objectType === PostgreSQLObjectTypes.TYPES) {
        const typeDesc = objectInfo.typeKind === 'enum' ? 'enum values' : 'structure';
        messageContent = `Showing ${typeDesc} for the **${displayName}** type.`;
      } else {
        messageContent = `Querying **${displayName}**.`;
      }
      
      const assistantMessage = {
        id: `msg_${Date.now()}_text`,
        type: 'assistant',
        content: messageContent,
        timestamp: new Date().toISOString(),
        showTypewriter: false,
        disableAnimation: true
      };
      
      const queryMessage = {
        id: `msg_${Date.now()}_query`,
        isQuery: true,
        queryData: query,
        timestamp: new Date().toISOString(),
        showTypewriter: false,
        disableAnimation: true
      };
      
      updateConversation(conversationId, { 
        connectionId,
        connectionName,
        uiState: {
          chatMessages: [assistantMessage, queryMessage],
          inputState: {
            agentValue: '',
            queryValue: '',
            mode: 'agent'
          }
        }
      });
      
      if (setCurrentView) {
        setCurrentView('query');
      }
      
      console.log(`✅ Tab created for ${label.singular}: ${displayName}`);
      return conversationId;
    } catch (error) {
      console.error(`Error creating ${label.singular} tab:`, error);
    }
  };

  // Paste handlers
  const handlePasteDatabase = (connectionId, databaseName = null) => {
    if (!clipboardItem || clipboardItem.type !== 'database') {
      showNotification('No database in clipboard to paste', 'error');
      return;
    }

    setPasteDialog({
      isOpen: true,
      type: 'database',
      sourceName: clipboardItem.name,
      targetConnectionId: connectionId,
      targetDatabaseName: databaseName
    });
  };

  const handlePasteCollection = (connectionId, databaseName) => {
    if (!clipboardItem || clipboardItem.type !== 'collection') {
      showNotification('No collection in clipboard to paste', 'error');
      return;
    }

    setPasteDialog({
      isOpen: true,
      type: 'collection',
      sourceName: clipboardItem.name,
      targetConnectionId: connectionId,
      targetDatabaseName: databaseName
    });
  };

  const handlePasteConfirm = async (targetName, options = {}) => {
    // Get the current paste dialog state before closing it
    const currentPasteDialog = pasteDialog;
    setPasteDialog(prev => ({ ...prev, isOpen: false }));

    if (currentPasteDialog.type === 'database') {
      const success = await pasteDatabase(currentPasteDialog.targetConnectionId, targetName, options);
      if (success) {
        // Refresh the database list for the target connection
        await refreshDatabases(currentPasteDialog.targetConnectionId, expandedDatabases);
      }
    } else if (currentPasteDialog.type === 'collection') {
      const success = await pasteCollection(currentPasteDialog.targetConnectionId, currentPasteDialog.targetDatabaseName, targetName);
      if (success) {
        // Refresh the collections for the target database
        const result = await window.electronAPI.database.listCollections(currentPasteDialog.targetConnectionId, currentPasteDialog.targetDatabaseName);
        if (result.success) {
          const collectionKey = `${currentPasteDialog.targetConnectionId}:${currentPasteDialog.targetDatabaseName}`;
          setCollections(collectionKey, result.collections.sort((a, b) => a.localeCompare(b)));
        }
      }
    }
  };

  // Helper function to close tabs using a specific connection
  const handleDisconnectWithTabs = (connectionId, connectionName) => {
    // Find all conversations using this connection and close them (match by connectionId, not name)
    const conversationsToClose = conversations.filter(conv => 
      conv.connectionId === connectionId
    );
    
    // Close all tabs using this connection
    conversationsToClose.forEach(conv => {
      removeConversation(conv.id);
    });
    
    // Then disconnect the connection
    disconnect(connectionId);
  };

  // Collection stats handlers
  const handleCollectionHover = async (e, connId, dbName, collectionName) => {
    // Clear any existing timers
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      setHideTimer(null);
    }

    // If this is the same collection already being shown, don't restart
    if (collectionStats.isVisible && 
        collectionStats.connectionId === connId && 
        collectionStats.databaseName === dbName && 
        collectionStats.collectionName === collectionName) {
      return;
    }

    // Hide current tooltip immediately if showing different collection
    if (collectionStats.isVisible) {
      setCollectionStats(prev => ({ ...prev, isVisible: false }));
    }

    // Get the position of the collection element
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Set a timer to show stats after 1 second
    const timer = setTimeout(async () => {
      setCollectionStats({
        isVisible: true,
        data: null,
        loading: true,
        connectionId: connId,
        databaseName: dbName,
        collectionName: collectionName,
        position: { x: rect.right + 10, y: rect.top }
      });

      try {
        const result = await window.electronAPI.database.getCollectionStats(connId, dbName, collectionName);
        
        setCollectionStats(prev => ({
          ...prev,
          data: result.success ? result.stats : { error: result.error },
          loading: false
        }));
      } catch (error) {
        console.error('❌ Error fetching collection stats:', error);
        setCollectionStats(prev => ({
          ...prev,
          data: { error: error.message },
          loading: false
        }));
      }
    }, 1000);

    setHoverTimer(timer);
  };

  const handleCollectionLeave = () => {
    // Clear the timer when mouse leaves
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    
    // Clear any existing hide timer
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    
    // Hide stats after a short delay to allow moving to tooltip
    const timer = setTimeout(() => {
      setCollectionStats(prev => ({
        ...prev,
        isVisible: false,
        data: null,
        loading: false
      }));
    }, 200);
    
    setHideTimer(timer);
  };

  const handleTooltipEnter = () => {
    // Keep tooltip visible when hovering over it
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      setHoverTimer(null);
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      setHideTimer(null);
    }
  };

  const handleTooltipLeave = () => {
    // Hide tooltip when leaving it
    setCollectionStats(prev => ({
      ...prev,
      isVisible: false,
      data: null,
      loading: false
    }));
  };

  // Rename handlers
  const handleRenameDatabase = (connectionId, databaseName) => {
    setRenameDialog({
      isOpen: true,
      connectionId,
      currentName: databaseName,
      type: 'database'
    });
  };

  const handleRenameConfirm = async (newName) => {
    const { connectionId, currentName } = renameDialog;
    setRenameDialog(prev => ({ ...prev, isOpen: false }));

    const success = await renameDatabase(connectionId, currentName, newName);
    if (success) {
      // Refresh the database list for the connection
      await refreshDatabases(connectionId, expandedDatabases);
    }
  };

  // Export handlers
  const handleExportDatabase = (connectionId, databaseName) => {
    const databaseType = getConnectionDatabaseType(connectionId);
    setExportDialog({
      isOpen: true,
      connectionId,
      databaseName,
      databaseType
    });
  };

  const handleExportConfirm = async (exportOptions) => {
    // Don't close dialog - let the dialog handle progress display
    try {
      const operationId = `export-${Date.now()}`;
      const result = await window.electronAPI.database.exportDatabase(exportOptions, operationId);
      
      if (result.success) {
        showNotification(
          `Successfully exported ${exportOptions.collections.length} collection${exportOptions.collections.length === 1 ? '' : 's'}`,
          'success'
        );
      } else {
        showNotification(result.error || 'Export failed', 'error');
      }
      
      // Return result to dialog for progress display
      return result;
    } catch (error) {
      console.error('Export error:', error);
      showNotification(`Export failed: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  };

  // Import handlers
  const handleImportDatabase = (connectionId, databaseName) => {
    const databaseType = getConnectionDatabaseType(connectionId);
    setImportDialog({
      isOpen: true,
      connectionId,
      databaseName,
      databaseType
    });
  };

  const handleImportConfirm = async (importOptions) => {
    // Don't close dialog - let the dialog handle progress display
    try {
      const operationId = `import-${Date.now()}`;
      
      const result = await window.electronAPI.database.importDatabase(importOptions, operationId);
      
      console.log('📥 Import completed:', result);
      
      if (result.success) {
        showNotification(
          result.message || `Successfully imported ${result.importedFiles} file(s)`,
          'success'
        );
        
        // Refresh collections for the database
        const collectionKey = `${importOptions.connectionId}:${importOptions.databaseName}`;
        console.log('🔄 Refreshing collections for:', collectionKey);
        
        const collectionsResult = await window.electronAPI.database.listCollections(
          importOptions.connectionId,
          importOptions.databaseName
        );
        
        console.log('📋 Collections fetched:', collectionsResult);
        
        if (collectionsResult.success) {
          console.log('✅ Setting collections:', collectionsResult.collections);
          setCollections(collectionKey, collectionsResult.collections.sort((a, b) => a.localeCompare(b)));
        } else {
          console.error('❌ Failed to fetch collections:', collectionsResult.error);
        }
      } else {
        showNotification(result.error || 'Import failed', 'error');
      }
      
      // Return result to dialog for progress display
      return result;
    } catch (error) {
      console.error('Import error:', error);
      showNotification(`Import failed: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  };

  // Create database handler
  const handleCreateDatabaseConfirm = async (databaseName) => {
    const { connectionId } = createDatabaseDialog;
    setCreateDatabaseDialog(prev => ({ ...prev, isOpen: false }));

    try {
      const result = await window.electronAPI.database.createDatabase(connectionId, databaseName);
      
      if (result.success) {
        showNotification(`Database "${databaseName}" created successfully`, 'success');
        // Refresh the database list for the connection
        await refreshDatabases(connectionId, expandedDatabases);
        // Expand the connection if not already expanded
        setExpandedConnections(prev => new Set([...prev, connectionId]));
      } else {
        showNotification(result.error || 'Failed to create database', 'error');
      }
    } catch (error) {
      console.error('Error creating database:', error);
      showNotification('Failed to create database', 'error');
    }
  };

  const handleCloseStats = () => {
    setCollectionStats(prev => ({
      ...prev,
      isVisible: false,
      data: null,
      loading: false
    }));
  };

  // Context menu handlers
  const handleConnectionContextMenu = (e, connId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const menuItems = [
      {
        label: 'Create New Database',
        icon: '➕',
        onClick: () => {
          const connection = activeConnections.find(conn => conn.id === connId);
          const connectionName = connection?.name || generateConnectionDisplayName(connId, savedConnections);
          setCreateDatabaseDialog({
            isOpen: true,
            connectionId: connId,
            connectionName
          });
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Refresh Databases',
        icon: '🔄',
        onClick: async () => {
          try {
            await refreshDatabases(connId, expandedDatabases);
            showNotification('Databases refreshed successfully', 'success');
          } catch (error) {
            showNotification('Failed to refresh databases', 'error');
            console.error('Error refreshing databases:', error);
          }
        }
      }
    ];

    // Add paste database option if there's a database in clipboard
    if (clipboardItem && clipboardItem.type === 'database') {
      menuItems.push(
        {
          type: 'separator'
        },
        {
          label: `Paste Database: ${clipboardItem.name}`,
          icon: '📋',
          onClick: () => handlePasteDatabase(connId)
        }
      );
    }

    menuItems.push(
      {
        type: 'separator'
      },
      {
        label: 'Disconnect',
        icon: '🔌',
        onClick: async () => {
          const conn = connections[connId];
          setConfirmDialog({
            isOpen: true,
            title: 'Close Connection',
            message: 'Are you sure you want to close this connection? All tabs using this connection will be closed.',
            onConfirm: () => {
              handleDisconnectWithTabs(connId, conn?.name);
              setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            },
            type: 'warning'
          });
        }
      }
    );

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      items: menuItems
    });
  };

  const handleDatabaseContextMenu = (e, connId, dbName) => {
    e.preventDefault();
    e.stopPropagation();
    
    const databaseType = getConnectionDatabaseType(connId);
    const terminology = getTerminology(databaseType);
    
    const menuItems = [
      {
        label: `Refresh ${terminology.Collections}`,
        icon: '🔄',
        onClick: async () => {
          try {
            const result = await window.electronAPI.database.listCollections(connId, dbName);
            if (result.success) {
              const collectionKey = `${connId}:${dbName}`;
              setCollections(collectionKey, result.collections.sort((a, b) => a.localeCompare(b)));
              showNotification(`${terminology.Collections} refreshed for database "${dbName}"`, 'success');
            } else {
              showNotification(`Failed to refresh ${terminology.collections}`, 'error');
            }
          } catch (error) {
            showNotification(`Failed to refresh ${terminology.collections}`, 'error');
            console.error(`Error refreshing ${terminology.collections}:`, error);
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Copy Database Name',
        icon: '📝',
        onClick: () => {
          navigator.clipboard.writeText(dbName);
          showNotification(`Database name "${dbName}" copied to clipboard`, 'success');
        }
      },
      {
        label: 'Copy Database',
        icon: '📋',
        onClick: () => copyItem({
          type: 'database',
          name: dbName,
          connectionId: connId,
          databaseName: dbName
        })
      },
      {
        label: 'Export Database',
        icon: '📤',
        onClick: () => handleExportDatabase(connId, dbName)
      },
      {
        label: 'Import Database',
        icon: '📥',
        onClick: () => handleImportDatabase(connId, dbName)
      },
      {
        type: 'separator'
      },
      {
        label: 'Rename Database',
        icon: '✏️',
        onClick: () => handleRenameDatabase(connId, dbName)
      }
    ];

    // Add paste options if there's something in clipboard
    if (clipboardItem) {
      menuItems.push({
        type: 'separator'
      });

      if (clipboardItem.type === 'database') {
        menuItems.push({
          label: `Paste Database: ${clipboardItem.name}`,
          icon: '📋',
          onClick: () => handlePasteDatabase(connId)
        });
      }

      if (clipboardItem.type === 'collection') {
        menuItems.push({
          label: `Paste ${terminology.Collection}: ${clipboardItem.name}`,
          icon: '📋',
          onClick: () => handlePasteCollection(connId, dbName)
        });
      }
    }

    menuItems.push(
      {
        type: 'separator'
      },
      {
        label: 'Delete Database',
        icon: '🗑️',
        onClick: async () => {
          setConfirmDialog({
            isOpen: true,
            title: 'Delete Database',
            message: `Are you sure you want to delete the database "${dbName}" and all its ${terminology.collections}? This action cannot be undone.`,
            onConfirm: async () => {
              const result = await deleteDatabase(connId, dbName);
              if (result) {
                // Refresh the database list
                const conn = connections[connId];
                if (conn) {
                  try {
                    const dbResult = await window.electronAPI.database.listDatabases(connId);
                    if (dbResult.success) {
                      // Update the connection with new database list
                      conn.databases = dbResult.databases;
                      // Remove collections cache for this database
                      const collectionKey = `${connId}:${dbName}`;
                      setCollections(collectionKey, null);
                    }
                  } catch (error) {
                    console.error('Error refreshing database list:', error);
                  }
                }
              }
              setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            },
            type: 'danger'
          });
        }
      }
    );

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      items: menuItems
    });
  };

  const handleCollectionContextMenu = (e, connId, dbName, collectionName) => {
    e.preventDefault();
    e.stopPropagation();
    
    const databaseType = getConnectionDatabaseType(connId);
    const terminology = getTerminology(databaseType);
    
    const menuItems = [
      {
        label: `${terminology.Collection} Info`,
        icon: 'ℹ️',
        onClick: () => {
          setCollectionInfoDialog({
            open: true,
            database: dbName,
            collections: collections[`${connId}:${dbName}`] || [],
            selectedCollection: collectionName,
            connectionId: connId,
            databaseType: databaseType
          });
        }
      },
      {
        type: 'separator'
      },
      {
        label: `Copy ${terminology.Collection} Name`,
        icon: '📝',
        onClick: () => {
          navigator.clipboard.writeText(collectionName);
          showNotification(`${terminology.Collection} name "${collectionName}" copied to clipboard`, 'success');
        }
      },
      {
        label: `Copy ${terminology.Collection}`,
        icon: '📋',
        onClick: () => copyItem({
          type: 'collection',
          name: collectionName,
          connectionId: connId,
          databaseName: dbName,
          collectionName: collectionName
        })
      }
    ];

    // Add paste collection option if there's a collection in clipboard
    if (clipboardItem && clipboardItem.type === 'collection') {
      menuItems.push(
        {
          type: 'separator'
        },
        {
          label: `Paste ${terminology.Collection}: ${clipboardItem.name}`,
          icon: '📋',
          onClick: () => handlePasteCollection(connId, dbName)
        }
      );
    }

    menuItems.push(
      {
        type: 'separator'
      },
      {
        label: `Delete ${terminology.Collection}`,
        icon: '🗑️',
        onClick: async () => {
          setConfirmDialog({
            isOpen: true,
            title: `Delete ${terminology.Collection}`,
            message: `Are you sure you want to delete the ${terminology.collection} "${collectionName}"? This action cannot be undone.`,
            onConfirm: async () => {
              const result = await deleteCollection(connId, dbName, collectionName);
              if (result.success) {
                // Refresh the collections list
                try {
                  const collectionResult = await window.electronAPI.database.listCollections(connId, dbName);
                  if (collectionResult.success) {
                    const collectionKey = `${connId}:${dbName}`;
                    setCollections(collectionKey, collectionResult.collections.sort((a, b) => a.localeCompare(b)));
                  }
                } catch (error) {
                  console.error('Error refreshing collections:', error);
                }
                
                // If connection was lost, refresh the page or handle accordingly
                if (result.connectionLost) {
                  window.location.reload();
                }
              }
              setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            },
            type: 'danger'
          });
        }
      }
    );

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      items: menuItems
    });
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      {/* Header */}
      <Paper sx={{ p: 2, borderRadius: 0, elevation: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Connections
          </Typography>
          {/* Refresh Button */}
          {activeConnections.length > 0 && (
            <Tooltip title="Refresh all databases">
              <IconButton
                size="small"
                onClick={async () => {
                  for (const connId of activeConnections) {
                    await refreshDatabases(connId, expandedDatabases);
                  }
                  showNotification('Databases refreshed successfully', 'success');
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {/* Connection Dropdown */}
        <FormControl fullWidth size="small" disabled={isLoading}>
          <Select
            value=""
            displayEmpty
            onChange={async (e) => {
              if (e.target.value) {
                const connectionString = e.target.value;
                // Find the connection name
                const savedConn = savedConnections.find(conn => {
                  const connString = typeof conn === 'string' ? conn : conn.connectionString;
                  return connString === connectionString;
                });
                const connectionName = savedConn && typeof savedConn === 'object' 
                  ? savedConn.name 
                  : getConnectionName(connectionString);
                
                await connect(connectionString, {}, connectionName);
              }
            }}
            startAdornment={isLoading && <CircularProgress size={16} sx={{ mr: 1 }} />}
          >
            <MenuItem value="">
              {isLoading ? 'Connecting...' : 'Select a connection'}
            </MenuItem>
            {savedConnections.map((conn, index) => {
              // Handle both old string format and new object format
              const connectionString = typeof conn === 'string' ? conn : conn.connectionString;
              const displayName = typeof conn === 'string' ? getConnectionName(conn) : conn.name;
              const connBranding = getDatabaseBranding(connectionString, conn.databaseType);
              const key = `dropdown_${index}_${conn.id || btoa(connectionString).replace(/[^a-zA-Z0-9]/g, '')}`;
              return (
                <MenuItem key={key} value={connectionString}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      component="img"
                      src={connBranding.logo}
                      alt={connBranding.providerName}
                      sx={{
                        width: 18,
                        height: 18,
                        objectFit: 'contain'
                      }}
                    />
                    {displayName}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        
        {/* Connection Error Display */}
        {connectionError && (
          <Alert severity="error" sx={{ mt: 1, fontSize: '0.75rem' }}>
            {connectionError}
          </Alert>
        )}
      </Paper>

      {/* Connection Tree */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, bgcolor: 'background.paper' }}>
        {activeConnections.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <ConnectionIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              No active connections
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
              Select a connection from the dropdown above
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 1 }}>
            {/* Active Connections */}
            {activeConnections.map(connId => {
              const conn = connections[connId];
              if (!conn) return null;
              
              const branding = getDatabaseBranding(conn.connectionString, getConnectionDatabaseType(connId));

              return (
                <Box key={connId} sx={{ mb: 1.5 }}>
                  {/* Connection Header */}
                  <Box 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      p: 1.5, 
                      cursor: 'pointer',
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      transition: 'all 0.15s ease',
                      '&:hover': { 
                        bgcolor: 'action.hover',
                        borderColor: 'primary.main'
                      }
                    }}
                    onClick={() => toggleConnection(connId)}
                    onContextMenu={(e) => handleConnectionContextMenu(e, connId)}
                  >
                    <IconButton size="small" sx={{ mr: 1, p: 0.25 }}>
                      {expandedConnections.has(connId) ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
                    </IconButton>
                    <Box
                      component="img"
                      src={branding.logo}
                      alt={branding.providerName}
                      sx={{
                        width: 20,
                        height: 20,
                        mr: 1,
                        flexShrink: 0,
                        objectFit: 'contain'
                      }}
                    />
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        flex: 1, 
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        mr: 1
                      }}
                      title={conn.name || getConnectionName(conn.connectionString)}
                    >
                      {conn.name || getConnectionName(conn.connectionString)}
                    </Typography>
                    <Tooltip title="Close connection">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({
                            isOpen: true,
                            title: 'Close Connection',
                            message: 'Are you sure you want to close this connection? All tabs using this connection will be closed.',
                            onConfirm: () => {
                              handleDisconnectWithTabs(connId, conn.name);
                              setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                            },
                            type: 'warning'
                          });
                        }}
                        sx={{ 
                          color: 'error.main',
                          flexShrink: 0
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  
                  {/* Databases */}
                  {expandedConnections.has(connId) && conn.databases && conn.databases.length > 0 && (
                    <Box sx={{ pl: 2 }}>
                      {conn.databases.map((dbName, index) => (
                        <Box key={dbName} sx={{ mb: 0.5, mt: index === 0 ? 1 : 0 }}>
                          <Box
                            onClick={async () => {
                              await setSelectedDatabase(dbName);
                              toggleDatabase(connId, dbName);
                            }}
                            onDoubleClick={() => handleDatabaseDoubleClick(connId, dbName)}
                            onContextMenu={(e) => handleDatabaseContextMenu(e, connId, dbName)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              p: 1,
                              borderRadius: 1,
                              cursor: 'pointer',
                              bgcolor: 'transparent',
                              borderLeft: selectedDatabase === dbName ? 2 : 0,
                              borderColor: 'primary.main',
                              transition: 'all 0.15s ease',
                              '&:hover': { 
                                bgcolor: 'action.hover'
                              }
                            }}
                          >
                            <IconButton
                              size="small"
                              sx={{ mr: 1, p: 0.25 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDatabase(connId, dbName);
                              }}
                            >
                              {expandedDatabases.has(`${connId}:${dbName}`) ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
                            </IconButton>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                flex: 1, 
                                fontWeight: selectedDatabase === dbName ? 500 : 400,
                                color: selectedDatabase === dbName ? 'primary.600' : 'text.primary'
                              }}
                            >
                              {dbName}
                            </Typography>
                          </Box>
                          
                          {/* Collections/Tables/Objects */}
                          {expandedDatabases.has(`${connId}:${dbName}`) && (() => {
                            const connDbType = getConnectionDatabaseType(connId);
                            const connTerminology = getTerminology(connDbType);
                            const collectionKey = `${connId}:${dbName}`;
                            const objects = pgObjects[collectionKey];
                            const isPostgreSQL = isRelationalDatabase(connDbType);
                            
                            // Render PostgreSQL categorized objects
                            if (isPostgreSQL && objects) {
                              const objectLabels = getPostgreSQLObjectLabels();
                              const categories = [
                                { key: 'tables', items: objects.tables || [] },
                                { key: 'views', items: objects.views || [] },
                                { key: 'materializedViews', items: objects.materializedViews || [] },
                                { key: 'functions', items: objects.functions || [] },
                                { key: 'sequences', items: objects.sequences || [] },
                                { key: 'types', items: objects.types || [] }
                              ].filter(cat => cat.items.length > 0);
                              
                              return (
                                <Box sx={{ pl: 4 }}>
                                  {categories.map(({ key: catKey, items }) => {
                                    const label = objectLabels[catKey];
                                    const categoryKey = `${collectionKey}:${catKey}`;
                                    const isExpanded = expandedObjectCategories.has(categoryKey);
                                    
                                    return (
                                      <Box key={catKey} sx={{ mb: 0.5 }}>
                                        {/* Category Header */}
                                        <Box 
                                          sx={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 0.5, 
                                            p: 0.5,
                                            cursor: 'pointer',
                                            borderRadius: 1,
                                            '&:hover': { bgcolor: 'action.hover' }
                                          }}
                                          onClick={() => toggleObjectCategory(connId, dbName, catKey)}
                                        >
                                          <IconButton size="small" sx={{ p: 0.25 }}>
                                            {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
                                          </IconButton>
                                          <Typography 
                                            variant="caption" 
                                            sx={{ 
                                              fontWeight: 500, 
                                              color: 'text.secondary',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 0.5
                                            }}
                                          >
                                            <span style={{ fontSize: '0.9em' }}>{label.icon}</span>
                                            {label.plural}
                                          </Typography>
                                          <Chip 
                                            label={items.length} 
                                            size="small" 
                                            sx={{ 
                                              height: 16, 
                                              fontSize: '0.65rem',
                                              '& .MuiChip-label': { px: 0.75 }
                                            }} 
                                          />
                                          {catKey === 'tables' && items.length > 0 && (
                                            <Tooltip title="View table schemas and indexes">
                                              <IconButton
                                                size="small"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setCollectionInfoDialog({
                                                    open: true,
                                                    database: dbName,
                                                    collections: items.map(t => t.name),
                                                    selectedCollection: null,
                                                    connectionId: connId,
                                                    databaseType: connDbType
                                                  });
                                                }}
                                                sx={{ p: 0.25, ml: 'auto' }}
                                              >
                                                <InfoIcon sx={{ fontSize: 14 }} />
                                              </IconButton>
                                            </Tooltip>
                                          )}
                                        </Box>
                                        
                                        {/* Category Items */}
                                        {isExpanded && (
                                          <Box sx={{ pl: 2 }}>
                                            {items.map((item, idx) => (
                                              <Box 
                                                key={`${catKey}-${item.name}-${idx}`}
                                                sx={{ 
                                                  display: 'flex', 
                                                  alignItems: 'center', 
                                                  gap: 1, 
                                                  py: 0.5,
                                                  px: 1, 
                                                  ml: 1,
                                                  borderRadius: 1,
                                                  cursor: 'pointer',
                                                  transition: 'all 0.15s ease',
                                                  bgcolor: 'transparent',
                                                  '&:hover': { 
                                                    bgcolor: 'action.hover',
                                                    transform: 'translateX(2px)'
                                                  }
                                                }}
                                                onDoubleClick={() => {
                                                  if (catKey === 'tables') {
                                                    handleCollectionDoubleClick(connId, dbName, item.name);
                                                  } else {
                                                    handlePgObjectDoubleClick(connId, dbName, catKey, item);
                                                  }
                                                }}
                                                onContextMenu={(e) => {
                                                  if (catKey === 'tables') {
                                                    handleCollectionContextMenu(e, connId, dbName, item.name);
                                                  }
                                                  // TODO: Add context menus for other object types
                                                }}
                                                onMouseEnter={(e) => {
                                                  if (catKey === 'tables') {
                                                    handleCollectionHover(e, connId, dbName, item.name);
                                                  }
                                                }}
                                                onMouseLeave={catKey === 'tables' ? handleCollectionLeave : undefined}
                                              >
                                                <Typography 
                                                  variant="body2" 
                                                  sx={{ 
                                                    fontWeight: 400,
                                                    fontSize: '0.75rem',
                                                    color: 'text.primary',
                                                    transition: 'all 0.15s ease',
                                                    lineHeight: 1.2,
                                                    fontFamily: catKey === 'functions' ? 'monospace' : 'inherit'
                                                  }}
                                                  title={catKey === 'functions' ? item.fullSignature : item.name}
                                                >
                                                  {catKey === 'functions' 
                                                    ? `${item.objectName}(${item.arguments ? '...' : ''})`
                                                    : item.objectName || item.name
                                                  }
                                                  {catKey === 'types' && item.typeKind && (
                                                    <Typography 
                                                      component="span" 
                                                      sx={{ 
                                                        ml: 0.5, 
                                                        fontSize: '0.65rem', 
                                                        color: 'text.disabled' 
                                                      }}
                                                    >
                                                      ({item.typeKind})
                                                    </Typography>
                                                  )}
                                                </Typography>
                                              </Box>
                                            ))}
                                          </Box>
                                        )}
                                      </Box>
                                    );
                                  })}
                                  {categories.length === 0 && (
                                    <Typography variant="caption" color="text.disabled" sx={{ ml: 2, p: 0.5 }}>
                                      No objects found
                                    </Typography>
                                  )}
                                </Box>
                              );
                            }
                            
                            // Render MongoDB collections (flat list)
                            return (
                            <Box sx={{ pl: 4 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.5, justifyContent: 'space-between' }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                  {connTerminology.Collections} ({collections[collectionKey]?.length || 0})
                                </Typography>
                                {collections[collectionKey] && collections[collectionKey].length > 0 && (
                                  <Tooltip title={`View ${connTerminology.collection} schemas and indexes`}>
                                    <IconButton
                                      size="small"
                                      onClick={() => setCollectionInfoDialog({
                                        open: true,
                                        database: dbName,
                                        collections: collections[collectionKey] || [],
                                        selectedCollection: null,
                                        connectionId: connId,
                                        databaseType: connDbType
                                      })}
                                      sx={{ p: 0.25 }}
                                    >
                                      <InfoIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                              {collections[collectionKey] ? (
                                collections[collectionKey].map(collection => (
                                  <Box 
                                    key={collection} 
                                    sx={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 1, 
                                      py: 0.75,
                                      px: 1, 
                                      ml: 2,
                                      borderRadius: 1,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      bgcolor: 'transparent',
                                      '&:hover': { 
                                        bgcolor: 'action.hover',
                                        transform: 'translateX(2px)'
                                      }
                                    }}
                                    onDoubleClick={() => handleCollectionDoubleClick(connId, dbName, collection)}
                                    onContextMenu={(e) => handleCollectionContextMenu(e, connId, dbName, collection)}
                                    onMouseEnter={(e) => handleCollectionHover(e, connId, dbName, collection)}
                                    onMouseLeave={handleCollectionLeave}


                                  >
                                    <Typography 
                                      variant="body2" 
                                      className="collection-text"
                                      sx={{ 
                                        fontWeight: 500,
                                        fontSize: '0.8rem',
                                        color: 'text.primary',
                                        transition: 'all 0.15s ease',
                                        lineHeight: 1.3
                                      }}
                                    >
                                      {collection}
                                    </Typography>
                                  </Box>
                                ))
                              ) : (
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 2, p: 0.5 }}>
                                  Loading {connTerminology.collections}...
                                </Typography>
                              )}
                            </Box>
                            );
                          })()}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Collection Stats Tooltip */}
      <CollectionStatsTooltip
        stats={collectionStats.loading ? null : collectionStats.data}
        isVisible={collectionStats.isVisible}
        position={collectionStats.position}
        onMouseEnter={handleTooltipEnter}
        onMouseLeave={handleTooltipLeave}
      />

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenu.items}
        onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, items: [] })}
      />

      {/* Paste Dialog */}
      <PasteDialog
        isOpen={pasteDialog.isOpen}
        onClose={() => setPasteDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handlePasteConfirm}
        type={pasteDialog.type}
        sourceName={pasteDialog.sourceName}
        defaultName={`${pasteDialog.sourceName}_copy`}
      />

      {/* Export Dialog */}
      <ExportDialog
        isOpen={exportDialog.isOpen}
        onClose={() => setExportDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleExportConfirm}
        connectionId={exportDialog.connectionId}
        databaseName={exportDialog.databaseName}
        databaseType={exportDialog.databaseType}
      />

      {/* Import Dialog */}
      <ImportDialog
        isOpen={importDialog.isOpen}
        onClose={() => setImportDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleImportConfirm}
        connectionId={importDialog.connectionId}
        databaseName={importDialog.databaseName}
        databaseType={importDialog.databaseType}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      {/* Collection Info Dialog */}
      <CollectionInfoDialog
        open={collectionInfoDialog.open}
        onClose={() => setCollectionInfoDialog({ open: false, database: null, collections: [], selectedCollection: null, connectionId: null, databaseType: 'mongodb' })}
        database={collectionInfoDialog.database}
        collections={collectionInfoDialog.collections}
        selectedCollection={collectionInfoDialog.selectedCollection}
        connectionId={collectionInfoDialog.connectionId}
        databaseType={collectionInfoDialog.databaseType}
      />

      {/* Rename Dialog */}
      <RenameDialog
        isOpen={renameDialog.isOpen}
        onClose={() => setRenameDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleRenameConfirm}
        type={renameDialog.type}
        currentName={renameDialog.currentName}
      />

      {/* Create Database Dialog */}
      <CreateDatabaseDialog
        isOpen={createDatabaseDialog.isOpen}
        onClose={() => setCreateDatabaseDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleCreateDatabaseConfirm}
        connectionName={createDatabaseDialog.connectionName}
      />
    </Box>
  );
};

export default DatabaseTree;