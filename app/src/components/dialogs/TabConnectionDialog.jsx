import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  Cable as ConnectionIcon
} from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { generateConnectionDisplayName } from '../../utils/connectionUtils';
import { getDatabaseBranding } from '../../utils/databaseLogos';
import { Avatar } from '@mui/material';

const TabConnectionDialog = ({ open, onClose, onConfirm }) => {
  const { 
    connections, 
    activeConnections, 
    savedConnections 
  } = useDatabase();
  
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedDatabase, setSelectedDatabase] = useState('');

  // Helper function to check if we have valid selections
  const canCreateTab = (connectionId, database) => {
    return Boolean(connectionId && database);
  };

  // Helper function to get connection display name
  const getConnectionDisplayName = (connectionId) => {
    const connection = connections[connectionId];
    if (!connection) return 'Unknown Connection';
    
    // Try to find saved connection name first
    const savedConn = savedConnections.find(conn => {
      const connString = typeof conn === 'string' ? conn : conn.connectionString;
      return connString === connection.connectionString;
    });
    
    if (savedConn && typeof savedConn === 'object' && savedConn.name) {
      return savedConn.name;
    }
    
    return generateConnectionDisplayName(connection.connectionString);
  };

  // Helper function to check if connection has databases
  const hasAvailableDatabases = (connectionId) => {
    const connection = connections[connectionId];
    return connection && connection.databases && connection.databases.length > 0;
  };

  // Get available databases for selected connection
  const availableDatabases = useMemo(() => {
    if (!selectedConnectionId) return [];
    const connection = connections[selectedConnectionId];
    return connection?.databases || [];
  }, [selectedConnectionId, connections]);

  // Helper function to check if only one connection is active
  const hasSingleActiveConnection = () => {
    return activeConnections.length === 1;
  };

  // Reset database selection when connection changes
  React.useEffect(() => {
    setSelectedDatabase('');
  }, [selectedConnectionId]);

  // Reset form when dialog opens and auto-select if only one connection
  React.useEffect(() => {
    if (open) {
      // Auto-select connection if there's only one
      if (hasSingleActiveConnection()) {
        setSelectedConnectionId(activeConnections[0]);
      } else {
        setSelectedConnectionId('');
      }
      setSelectedDatabase('');
    }
  }, [open, activeConnections]);

  const handleConfirm = () => {
    if (!canCreateTab(selectedConnectionId, selectedDatabase)) return;
    
    const connection = connections[selectedConnectionId];
    const connectionName = getConnectionDisplayName(selectedConnectionId);
    
    onConfirm({
      connectionId: selectedConnectionId,
      connectionName,
      connectionString: connection.connectionString,
      database: selectedDatabase
    });
    
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // Check if we have any active connections
  const hasActiveConnections = activeConnections.length > 0;

  return (
    <Dialog 
      open={open} 
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { minHeight: 400 }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DatabaseIcon color="primary" />
          <Typography variant="h6">
            New Tab - Select Connection & Database
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        {!hasActiveConnections ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No active connections found. Please connect to a database first.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Connection Selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                1. Select Connection
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Connection</InputLabel>
                <Select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  label="Connection"
                >
                  {activeConnections.map((connId) => {
                    const connection = connections[connId];
                    const branding = connection ? getDatabaseBranding(connection.connectionString, connection.databaseType) : null;
                    
                    return (
                    <MenuItem key={connId} value={connId}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        {branding ? (
                          <Avatar
                            src={branding.logo}
                            alt={branding.providerName}
                            sx={{
                              width: 20,
                              height: 20,
                              bgcolor: 'background.default',
                              border: 1,
                              borderColor: 'divider',
                              '& img': {
                                objectFit: 'contain',
                                p: 0.25
                              }
                            }}
                          />
                        ) : (
                          <ConnectionIcon fontSize="small" color="primary" />
                        )}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2">
                            {getConnectionDisplayName(connId)}
                          </Typography>
                          {hasAvailableDatabases(connId) && (
                            <Typography variant="caption" color="text.secondary">
                              {connections[connId].databases.length} database{connections[connId].databases.length !== 1 ? 's' : ''}
                            </Typography>
                          )}
                        </Box>
                        <Chip 
                          label="Connected" 
                          size="small" 
                          color="success" 
                          variant="outlined"
                        />
                      </Box>
                    </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Box>

            <Divider />

            {/* Database Selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                2. Select Database
              </Typography>
              <FormControl fullWidth disabled={!selectedConnectionId}>
                <InputLabel>Database</InputLabel>
                <Select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  label="Database"
                >
                  {availableDatabases.map((dbName) => (
                    <MenuItem key={dbName} value={dbName}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DatabaseIcon fontSize="small" color="primary" />
                        <Typography variant="body2">{dbName}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {selectedConnectionId && availableDatabases.length === 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  No databases found for this connection.
                </Alert>
              )}
            </Box>

            {/* Preview */}
            {canCreateTab(selectedConnectionId, selectedDatabase) && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Preview
                  </Typography>
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'action.hover', 
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider'
                  }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      New tab will be created for:
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {getConnectionDisplayName(selectedConnectionId)} - {selectedDatabase}
                    </Typography>
                  </Box>
                </Box>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleConfirm}
          variant="contained"
          disabled={!canCreateTab(selectedConnectionId, selectedDatabase)}
        >
          Create Tab
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TabConnectionDialog;
