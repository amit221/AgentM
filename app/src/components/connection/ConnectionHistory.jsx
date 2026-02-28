import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Paper,
  Tooltip,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Cable as ConnectionIcon
} from '@mui/icons-material';
import { Avatar } from '@mui/material';
import { useDatabase } from '../../context/DatabaseContext';
import { useClipboard } from '../../context/ClipboardContext';
import { useQuery } from '../../context/QueryContext';
import ContextMenu from '../menus/ContextMenu';
import ConnectionEditModal from './ConnectionEditModal';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { 
  maskConnectionCredentials, 
  hasEmbeddedCredentials, 
  generateConnectionDisplayName 
} from '../../utils/connectionUtils';
import { getDatabaseBranding, detectDatabaseInfo } from '../../utils/databaseLogos';

const ConnectionHistory = ({ onSelectConnection, savedConnections = [], onRemoveConnection }) => {
  const { addSavedConnection, updateSavedConnection, activeConnections, connections, disconnect } = useDatabase();
  const { showNotification } = useClipboard();
  const { conversations, removeConversation } = useQuery();
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: { x: 0, y: 0 }, items: [] });
  const [editModal, setEditModal] = useState({ isOpen: false, connection: null, mode: 'create' });
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'warning'
  });
  const [connectingStates, setConnectingStates] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Ref for refresh timeout cleanup
  const refreshTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const getConnectionInfo = (connectionString, databaseType = null) => {
    if (!connectionString) return { type: 'Unknown', host: 'Unknown', hasAuth: false, icon: ConnectionIcon };
    
    try {
      const dbInfo = detectDatabaseInfo(connectionString);
      const branding = getDatabaseBranding(connectionString, databaseType);
      
      let type = branding.providerName;
      let host = 'Unknown';
      let icon = ConnectionIcon;
      
      // Extract host information
      if (connectionString.includes('mongodb+srv://')) {
        const match = connectionString.match(/mongodb\+srv:\/\/(?:[^:]+:[^@]+@)?([^\/]+)/);
        host = match ? match[1] : 'Unknown';
      } else if (connectionString.includes('mongodb://')) {
        const match = connectionString.match(/mongodb:\/\/(?:[^:]+:[^@]+@)?([^\/]+)/);
        host = match ? match[1] : 'Unknown';
      } else if (connectionString.includes('postgresql://') || connectionString.includes('postgres://')) {
        const match = connectionString.match(/postgres(ql)?:\/\/(?:[^:]+:[^@]+@)?([^\/:]+)/);
        host = match ? match[2] : 'Unknown';
      }
      
      return {
        type,
        host,
        hasAuth: hasEmbeddedCredentials(connectionString),
        icon: ConnectionIcon, // Keep icon for now, we'll use logo image instead
        branding
      };
    } catch {
      return { type: 'Database', host: 'Unknown', hasAuth: false, icon: ConnectionIcon, branding: getDatabaseBranding(null, databaseType) };
    }
  };

  const getConnectionStatus = (connection) => {
    // Check if this connection is currently active by matching connection string
    // The activeConnections array contains database connection IDs, not saved connection IDs
    // So we need to check if any active connection has the same connection string
    const isActive = activeConnections.some(activeConnId => {
      const activeConnection = connections[activeConnId];
      return activeConnection && activeConnection.connectionString === connection.connectionString;
    });
    
    // Format the lastUsed date
    let lastUsedDisplay = 'Never';
    if (connection.lastUsed) {
      try {
        const lastUsedDate = new Date(connection.lastUsed);
        const now = new Date();
        const diffMs = now - lastUsedDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
          lastUsedDisplay = 'Today';
        } else if (diffDays === 1) {
          lastUsedDisplay = 'Yesterday';
        } else if (diffDays < 7) {
          lastUsedDisplay = `${diffDays} days ago`;
        } else if (diffDays < 30) {
          const weeks = Math.floor(diffDays / 7);
          lastUsedDisplay = `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else {
          lastUsedDisplay = lastUsedDate.toLocaleDateString();
        }
      } catch (error) {
        console.warn('Error parsing lastUsed date:', error);
        lastUsedDisplay = 'Unknown';
      }
    }
    
    return {
      isActive,
      lastUsed: lastUsedDisplay,
      status: isActive ? 'connected' : 'disconnected'
    };
  };

  // Handle save/edit connection
  const handleSaveConnection = async (connectionData, mode) => {
    try {
      if (mode === 'create') {
        addSavedConnection(connectionData);
        showNotification(`Connection "${connectionData.name}" created successfully`, 'success');
      } else {
        updateSavedConnection(connectionData.id, connectionData);
        showNotification(`Connection "${connectionData.name}" updated successfully`, 'success');
      }
    } catch (error) {
      throw new Error(error.message || 'Failed to save connection');
    }
  };

  // Handle edit connection
  const handleEditConnection = (connection) => {
    setEditModal({
      isOpen: true,
      connection,
      mode: 'edit'
    });
  };

  // Handle create new connection
  const handleCreateConnection = () => {
    setEditModal({
      isOpen: true,
      connection: null,
      mode: 'create'
    });
  };

  // Handle connection with loading state
  const handleConnect = async (connection) => {
    setConnectingStates(prev => ({ ...prev, [connection.id]: true }));
    
    try {
      // Pass connection string and options
      const result = await onSelectConnection(connection.connectionString, {
        databaseType: connection.databaseType
      });
      
      // Check if the result indicates a successful connection
      // If result is undefined/null (like from setCurrentConnectionString), treat as success for UI purposes
      if (result === undefined || result === null || (result && result.success)) {
        // Only show notification if this is actually a connection attempt (result has success property)
        if (result && typeof result === 'object' && 'success' in result) {
          showNotification(`Connected to "${connection.name}" successfully`, 'success');
          
          // Refresh connection data to update lastUsed timestamp
          refreshTimeoutRef.current = setTimeout(() => {
            setRefreshKey(prev => prev + 1);
          }, 100);
        }
        
        return { success: true };
      } else {
        const errorMessage = result?.error || 'Connection failed';
        showNotification(`Failed to connect to "${connection.name}": ${errorMessage}`, 'error');
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      showNotification(`Failed to connect to "${connection.name}": ${error.message}`, 'error');
      return { success: false, error: error.message };
    } finally {
      setConnectingStates(prev => ({ ...prev, [connection.id]: false }));
    }
  };

  // Handle disconnection
  const handleDisconnect = async (connection) => {
    try {
      // Find the active connection ID that matches this connection string
      const activeConnId = activeConnections.find(activeConnId => {
        const activeConnection = connections[activeConnId];
        return activeConnection && activeConnection.connectionString === connection.connectionString;
      });
      
      if (activeConnId) {
        // Find all conversations using this connection and close them (match by connectionId, not name)
        const conversationsToClose = conversations.filter(conv => 
          conv.connectionId === activeConnId
        );
        
        // Close all tabs using this connection
        conversationsToClose.forEach(conv => {
          removeConversation(conv.id);
        });
        
        await disconnect(activeConnId);
        showNotification(`Disconnected from "${connection.name}" successfully`, 'success');
      }
    } catch (error) {
      showNotification(`Failed to disconnect from "${connection.name}": ${error.message}`, 'error');
    }
  };

  // Handle delete connection with confirmation
  const handleDeleteConnection = (connection) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Connection',
      message: `Are you sure you want to delete the connection "${connection.name}"?\n\nThis action cannot be undone.`,
      onConfirm: () => {
        onRemoveConnection(connection.id);
        showNotification(`Connection "${connection.name}" deleted successfully`, 'success');
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      type: 'danger'
    });
  };

  // Context menu handler for connections
  const handleConnectionContextMenu = (e, connection) => {
    e.preventDefault();
    e.stopPropagation();
    
    const menuItems = [
      {
        label: 'Edit Connection',
        icon: '✏️',
        onClick: () => handleEditConnection(connection)
      },
      {
        type: 'separator'
      },
      {
        label: 'Copy Connection Name',
        icon: '📝',
        onClick: () => {
          navigator.clipboard.writeText(connection.name);
          showNotification(`Connection name "${connection.name}" copied to clipboard`, 'success');
        }
      },
      {
        label: 'Copy Connection String (Masked)',
        icon: '📋',
        onClick: () => {
          const maskedString = maskConnectionCredentials(connection.connectionString);
          navigator.clipboard.writeText(maskedString);
          showNotification('Masked connection string copied to clipboard', 'success');
        }
      },
      {
        label: 'Copy Connection String (Full)',
        icon: '🔓',
        onClick: () => {
          navigator.clipboard.writeText(connection.connectionString);
          showNotification('Full connection string copied to clipboard', 'warning');
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Delete Connection',
        icon: '🗑️',
        className: 'text-red-600 dark:text-red-400',
        onClick: () => handleDeleteConnection(connection)
      }
    ];

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      items: menuItems
    });
  };

  if (savedConnections.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Empty State */}
        <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
          <ConnectionIcon sx={{ fontSize: 40, mb: 1, opacity: 0.5 }} />
          <Typography variant="body2" sx={{ mb: 2 }}>No saved connections</Typography>
          <Button onClick={handleCreateConnection} variant="outlined" size="small" startIcon={<AddIcon />}>
            Add Connection
          </Button>
        </Box>

        <ConnectionEditModal
          isOpen={editModal.isOpen}
          onClose={() => setEditModal({ isOpen: false, connection: null, mode: 'create' })}
          onSave={handleSaveConnection}
          connection={editModal.connection}
          mode={editModal.mode}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Saved ({savedConnections.length})
        </Typography>
        <Button onClick={handleCreateConnection} variant="text" size="small" startIcon={<AddIcon />}>
          Add
        </Button>
      </Box>

      {/* Connections List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {savedConnections.map((connection) => {
              // Handle both old string format and new object format
              const connectionObj = typeof connection === 'string' 
                ? { id: btoa(connection), name: 'Legacy Connection', connectionString: connection }
                : connection;

              // Get database type from connection if available, or detect from connection string
              const activeConnId = activeConnections.find(id => {
                const activeConn = connections[id];
                return activeConn && activeConn.connectionString === connectionObj.connectionString;
              });
              const activeConn = activeConnId ? connections[activeConnId] : null;
              const databaseType = activeConn?.databaseType || connectionObj.databaseType || null;
              
              const connectionInfo = getConnectionInfo(connectionObj.connectionString, databaseType);
              const connectionStatus = getConnectionStatus(connectionObj);
              const IconComponent = connectionInfo.icon;

              return (
                <Paper
                  key={connectionObj.id}
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    bgcolor: connectionStatus.isActive ? 'primary.50' : 'background.paper',
                    border: 1,
                    borderColor: connectionStatus.isActive ? 'primary.200' : 'divider',
                    borderRadius: 1,
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: connectionStatus.isActive ? 'primary.100' : 'action.hover',
                      '& .connection-actions': { opacity: 1 }
                    }
                  }}
                  onContextMenu={(e) => handleConnectionContextMenu(e, connectionObj)}
                >
                  {/* Icon + Name */}
                  <Avatar
                    src={connectionInfo.branding?.logo}
                    alt={connectionInfo.branding?.providerName || 'Database'}
                    sx={{ width: 28, height: 28, bgcolor: 'transparent', '& img': { objectFit: 'contain' } }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                        {connectionObj.name}
                      </Typography>
                      {connectionStatus.isActive && (
                        <Box sx={{ width: 6, height: 6, bgcolor: 'success.main', borderRadius: '50%' }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace' }}>
                      {connectionInfo.host}
                    </Typography>
                  </Box>
                  
                  {/* Actions */}
                  <Box className="connection-actions" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: { xs: 1, md: 0 }, transition: 'opacity 0.2s' }}>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => handleEditConnection(connectionObj)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Button
                      onClick={() => connectionStatus.isActive ? handleDisconnect(connectionObj) : handleConnect(connectionObj)}
                      variant={connectionStatus.isActive ? "outlined" : "contained"}
                      size="small"
                      disabled={connectingStates[connectionObj.id] && !connectionStatus.isActive}
                      color={connectionStatus.isActive ? "error" : "primary"}
                      sx={{ minWidth: 'auto', px: 1.5 }}
                    >
                      {connectingStates[connectionObj.id] && !connectionStatus.isActive ? (
                        <CircularProgress size={14} />
                      ) : connectionStatus.isActive ? 'Disconnect' : 'Connect'}
                    </Button>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDeleteConnection(connectionObj)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Paper>
          );
        })}
      </Box>

      {/* Edit Modal */}
      <ConnectionEditModal
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, connection: null, mode: 'create' })}
        onSave={handleSaveConnection}
        connection={editModal.connection}
        mode={editModal.mode}
      />

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenu.items}
        onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, items: [] })}
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
    </Box>
  );
};

export default ConnectionHistory;