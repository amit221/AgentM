import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Paper,
  Chip,
  IconButton
} from '@mui/material';
import {
  Cable as ConnectionIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import ConnectionHistory from '../connection/ConnectionHistory';
import ConnectionStatus from '../connection/ConnectionStatus';
import ConnectionPanel from '../connection/ConnectionPanel';
import { useDatabase } from '../../context/DatabaseContext';

const ConnectionsDialog = ({ open, onClose }) => {
  const {
    savedConnections = [],
    activeConnections = [],
    connect,
    disconnect,
    removeSavedConnection
  } = useDatabase();

  const [currentConnectionString, setCurrentConnectionString] = useState('');

  // Helper functions to encapsulate conditional logic
  const findConnectionByName = (connectionString) => {
    if (!savedConnections || !Array.isArray(savedConnections)) {
      return null;
    }
    return savedConnections.find(conn =>
      (typeof conn === 'string' ? conn : conn.connectionString) === connectionString
    );
  };

  const getConnectionDisplayName = (connection) => {
    if (connection && typeof connection === 'object') {
      return connection.name;
    }
    return 'Quick Connection';
  };

  const shouldShowActiveConnectionsChip = () => {
    return activeConnections && Array.isArray(activeConnections) && activeConnections.length > 0;
  };

  const getActiveConnectionsCount = () => {
    return activeConnections && Array.isArray(activeConnections) ? activeConnections.length : 0;
  };

  const getActiveConnectionsLabel = () => {
    const count = getActiveConnectionsCount();
    return `${count} active connection${count !== 1 ? 's' : ''}`;
  };

  const handleConnect = async (connectionString) => {
    if (!connectionString?.trim() || !connect) return;

    const connection = findConnectionByName(connectionString);
    const connectionName = getConnectionDisplayName(connection);

    try {
      const result = await connect(connectionString, {}, connectionName);
      return result;
    } catch (error) {
      console.error('Error connecting to database:', error);
      return { success: false, error: error.message };
    }
  };

  const handleClose = () => {
    setCurrentConnectionString('');
    if (onClose) {
      onClose();
    }
  };

  // Don't render if dialog is not open
  if (!open) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '80vh', maxHeight: '800px' }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ConnectionIcon sx={{ color: 'icon.connection' }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Connection Manager
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Manage your database connections (MongoDB, PostgreSQL, Supabase)
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Connection Status Summary */}
            {shouldShowActiveConnectionsChip() && (
              <Chip
                label={getActiveConnectionsLabel()}
                color="success"
                variant="filled"
                size="small"
              />
            )}

            {/* Close Button */}
            <IconButton
              onClick={handleClose}
              size="small"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: 'action.hover',
                  color: 'text.primary',
                }
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, overflow: 'auto' }}>
        <Box sx={{ maxWidth: '6xl', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Connection Management */}
          <ConnectionHistory
            onSelectConnection={handleConnect}
            savedConnections={savedConnections}
            onRemoveConnection={removeSavedConnection}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectionsDialog;
