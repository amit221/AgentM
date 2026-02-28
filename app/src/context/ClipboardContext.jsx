import React, { createContext, useContext, useState, useMemo } from 'react';
import DetailedProgressDialog from '../components/dialogs/DetailedProgressDialog';

const ClipboardContext = createContext();

export const useClipboard = () => {
  const context = useContext(ClipboardContext);
  if (!context) {
    throw new Error('useClipboard must be used within a ClipboardProvider');
  }
  return context;
};

// Safe version that doesn't throw during development hot reloading
export const useClipboardSafe = () => {
  const context = useContext(ClipboardContext);
  return context;
};

export const ClipboardProvider = ({ children }) => {
  const [clipboardItem, setClipboardItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [isOperationInProgress, setIsOperationInProgress] = useState(false);
  const [operationProgress, setOperationProgress] = useState({ 
    isVisible: false, 
    title: '', 
    message: '', 
    progress: 0, 
    isIndeterminate: false 
  });
  const [detailedProgress, setDetailedProgress] = useState({
    isVisible: false,
    title: '',
    data: null
  });

  const copyItem = (item) => {
    setClipboardItem(item);
    showNotification(`Copied ${item.type}: ${item.name}`, 'success');
  };

  const clearClipboard = () => {
    setClipboardItem(null);
  };

  const startDrag = (data) => {
    setIsDragging(true);
    setDragData(data);
  };

  const endDrag = () => {
    setIsDragging(false);
    setDragData(null);
  };

  const showNotification = (message, type = 'info') => {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: Date.now()
    };
    
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove notification after 3 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 3000);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const showProgress = (title, message, isIndeterminate = true) => {
    setOperationProgress({
      isVisible: true,
      title,
      message,
      progress: 0,
      isIndeterminate
    });
    setIsOperationInProgress(true);
  };

  const updateProgress = (progress, message) => {
    setOperationProgress(prev => ({
      ...prev,
      progress,
      message: message || prev.message,
      isIndeterminate: false
    }));
  };

  const hideProgress = () => {
    setOperationProgress({
      isVisible: false,
      title: '',
      message: '',
      progress: 0,
      isIndeterminate: false
    });
    setIsOperationInProgress(false);
  };

  const showDetailedProgress = (title) => {
    setDetailedProgress({
      isVisible: true,
      title,
      data: null
    });
    setIsOperationInProgress(true);
  };

  const updateDetailedProgress = (data) => {
    setDetailedProgress(prev => ({
      ...prev,
      data
    }));
  };

  const hideDetailedProgress = () => {
    setDetailedProgress({
      isVisible: false,
      title: '',
      data: null
    });
    setIsOperationInProgress(false);
  };

  const pasteDatabase = async (targetConnectionId, targetDatabaseName, options = {}) => {
    if (!clipboardItem || clipboardItem.type !== 'database') {
      showNotification('No database in clipboard to paste', 'error');
      return false;
    }

    try {
      const method = options.method || 'auto';
      const methodLabel = method === 'dump_restore' ? 'mongodump/mongorestore' : 
                         method === 'document_copy' ? 'document-by-document' : 'auto-selected method';
      
      showDetailedProgress(`Copying Database: ${clipboardItem.name} → ${targetDatabaseName} (${methodLabel})`);
      
      // Set up progress listener
      const unsubscribe = window.electronAPI.database.onDuplicateProgress((progress) => {
        updateDetailedProgress(progress);
      });

      // Use the enhanced method-aware API
      const result = await window.electronAPI.database.duplicateDatabaseWithMethod(
        targetConnectionId,
        clipboardItem.databaseName,
        targetDatabaseName,
        clipboardItem.connectionId, // Pass the source connection ID
        method
      );

      // Clean up listener
      unsubscribe();
      
      // Wait a moment to show completion
      setTimeout(() => {
        hideDetailedProgress();
      }, 2000);

      if (result.success) {
        // Create smart notification message based on method
        const isFastMode = result.method === 'dump_restore';
        let message = `Database copied successfully! ${result.copiedCollections}/${result.totalCollections} collections`;
        
        // Only show document count for slow mode where it's meaningful
        if (!isFastMode && result.totalDocuments !== undefined) {
          message += `, ${result.totalDocuments} documents copied`;
        } else if (isFastMode) {
          message += ` copied using fast mode`;
        }
        
        showNotification(message, 'success');
        if (result.errors && result.errors.length > 0) {
          showNotification(
            `Some collections failed to copy: ${result.errors.map(e => e.collection).join(', ')}`,
            'warning'
          );
        }
        
        // Trigger database list refresh for the target connection
        if (window.refreshDatabaseList) {
          window.refreshDatabaseList(targetConnectionId);
        }
        
        return true;
      } else {
        showNotification(`Failed to copy database: ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      hideDetailedProgress();
      showNotification(`Error copying database: ${error.message}`, 'error');
      return false;
    }
  };

  const pasteCollection = async (targetConnectionId, targetDatabaseName, targetCollectionName) => {
    if (!clipboardItem || clipboardItem.type !== 'collection') {
      showNotification('No collection in clipboard to paste', 'error');
      return false;
    }

    try {
      showDetailedProgress(`Copying Collection: ${clipboardItem.name} → ${targetCollectionName}`);
      
      // Set up progress listener
      const unsubscribe = window.electronAPI.database.onDuplicateCollectionProgress((progress) => {
        // Transform collection progress to match database progress format
        updateDetailedProgress({
          stage: progress.stage,
          currentCollection: targetCollectionName,
          copiedCollections: progress.stage === 'completed' ? 1 : 0,
          totalCollections: 1,
          currentDocuments: progress.copiedDocuments || 0,
          totalDocuments: progress.totalDocuments || 0,
          errors: []
        });
      });

      const result = await window.electronAPI.database.duplicateCollection(
        targetConnectionId,
        clipboardItem.databaseName,
        clipboardItem.collectionName,
        targetDatabaseName,
        targetCollectionName,
        clipboardItem.connectionId // Pass the source connection ID
      );

      // Clean up listener
      unsubscribe();
      
      // Wait a moment to show completion
      setTimeout(() => {
        hideDetailedProgress();
      }, 2000);

      if (result.success) {
        showNotification(
          `Collection copied successfully! ${result.documentsCopied} documents copied`,
          'success'
        );
        
        // Trigger database list refresh for the target connection
        if (window.refreshDatabaseList) {
          window.refreshDatabaseList(targetConnectionId);
        }
        
        return true;
      } else {
        showNotification(`Failed to copy collection: ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      hideDetailedProgress();
      showNotification(`Error copying collection: ${error.message}`, 'error');
      return false;
    }
  };

  const deleteDatabase = async (connectionId, databaseName) => {
    try {
      showProgress('Deleting Database', `Deleting database "${databaseName}" and all its collections...`);
      
      const result = await window.electronAPI.database.deleteDatabase(connectionId, databaseName);

      hideProgress();

      if (result.success) {
        showNotification(
          `Database deleted successfully! ${result.deletedCollections} collections removed`,
          'success'
        );
        if (result.errors && result.errors.length > 0) {
          showNotification(
            `Some collections failed to delete: ${result.errors.map(e => e.collection).join(', ')}`,
            'warning'
          );
        }
        
        // Trigger database list refresh for the connection
        if (window.refreshDatabaseList) {
          window.refreshDatabaseList(connectionId);
        }
        
        return true;
      } else {
        showNotification(`Failed to delete database: ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      hideProgress();
      showNotification(`Error deleting database: ${error.message}`, 'error');
      return false;
    }
  };

  const deleteCollection = async (connectionId, databaseName, collectionName) => {
    try {
      showProgress('Deleting Collection', `Deleting collection "${collectionName}"...`);
      
      const result = await window.electronAPI.database.deleteCollection(connectionId, databaseName, collectionName);

      hideProgress();

      if (result.success) {
        const message = result.message 
          ? `${result.message}` 
          : `Collection deleted successfully! ${result.documentsDeleted} documents removed`;
        showNotification(message, 'success');
        return { success: true, connectionLost: result.connectionLost };
      } else {
        showNotification(`Failed to delete collection: ${result.error}`, 'error');
        return { success: false, error: result.error, connectionLost: result.connectionLost };
      }
    } catch (error) {
      hideProgress();
      showNotification(`Error deleting collection: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  };

  const renameDatabase = async (connectionId, oldDatabaseName, newDatabaseName) => {
    try {
      showDetailedProgress(`Renaming Database: ${oldDatabaseName} → ${newDatabaseName}`);
      
      // Set up progress listener
      const unsubscribe = window.electronAPI.database.onRenameProgress((progress) => {
        updateDetailedProgress(progress);
      });

      const result = await window.electronAPI.database.renameDatabase(connectionId, oldDatabaseName, newDatabaseName);

      // Clean up listener
      unsubscribe();
      
      // Wait a moment to show completion
      setTimeout(() => {
        hideDetailedProgress();
      }, 2000);

      if (result.success) {
        showNotification(
          `Database renamed successfully! ${result.renamedCollections}/${result.totalCollections} collections moved`,
          'success'
        );
        if (result.errors && result.errors.length > 0) {
          showNotification(
            `Some collections failed to move: ${result.errors.map(e => e.collection).join(', ')}`,
            'warning'
          );
        }
        
        // Trigger database list refresh for the connection
        if (window.refreshDatabaseList) {
          window.refreshDatabaseList(connectionId);
        }
        
        return true;
      } else {
        showNotification(`Failed to rename database: ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      hideDetailedProgress();
      showNotification(`Error renaming database: ${error.message}`, 'error');
      return false;
    }
  };

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => {
    return {
      clipboardItem,
      isDragging,
      dragData,
      notifications,
      isOperationInProgress,
      operationProgress,
      detailedProgress,
      copyItem,
      clearClipboard,
      startDrag,
      endDrag,
      showNotification,
      addNotification: showNotification, // Alias for showNotification
      removeNotification,
      showProgress,
      updateProgress,
      hideProgress,
      showDetailedProgress,
      updateDetailedProgress,
      hideDetailedProgress,
      pasteDatabase,
      pasteCollection,
      deleteDatabase,
      deleteCollection,
      renameDatabase
    };
  }, [
    clipboardItem,
    isDragging,
    dragData,
    notifications,
    isOperationInProgress,
    operationProgress,
    detailedProgress,
    copyItem,
    clearClipboard,
    startDrag,
    endDrag,
    showNotification,
    removeNotification,
    showProgress,
    updateProgress,
    hideProgress,
    showDetailedProgress,
    updateDetailedProgress,
    hideDetailedProgress,
    pasteDatabase,
    pasteCollection,
    deleteDatabase,
    deleteCollection,
    renameDatabase
  ]);

  return (
    <ClipboardContext.Provider value={value}>
      {children}
      
      {/* Detailed Progress Dialog */}
      <DetailedProgressDialog
        isOpen={detailedProgress.isVisible}
        title={detailedProgress.title}
        progress={detailedProgress.data}
        onCancel={() => hideDetailedProgress()}
      />
    </ClipboardContext.Provider>
  );
};