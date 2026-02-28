import React from 'react';
import { Box, Typography, Button, Alert, CircularProgress, Paper } from '@mui/material';
import { CheckCircle as ConnectedIcon, CloudOff as DisconnectedIcon } from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { useQuery } from '../../context/QueryContext';
import { generateConnectionDisplayName } from '../../utils/connectionUtils';
import { getDatabaseDisplayName } from '../../utils/databaseTypeUtils';

const ConnectionStatus = () => {
  const { connections, activeConnections, disconnect, savedConnections, connectionError, isLoading } = useDatabase();
  const { conversations, removeConversation } = useQuery();
  
  const getConnectionName = (connectionString) => {
    const savedConn = savedConnections.find(conn => {
      const connString = typeof conn === 'string' ? conn : conn.connectionString;
      return connString === connectionString;
    });
    
    if (savedConn && typeof savedConn === 'object' && savedConn.name) {
      return savedConn.name;
    }
    return generateConnectionDisplayName(connectionString);
  };

  const handleDisconnect = (connectionId) => {
    const conversationsToClose = conversations.filter(conv => conv.connectionId === connectionId);
    conversationsToClose.forEach(conv => removeConversation(conv.id));
    disconnect(connectionId);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Loading State */}
      {isLoading && (
        <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ py: 0.5 }}>
          <Typography variant="body2">Connecting...</Typography>
        </Alert>
      )}

      {/* Error State */}
      {connectionError && !isLoading && activeConnections.length === 0 && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          <Typography variant="body2">{connectionError}</Typography>
        </Alert>
      )}

      {/* Not Connected State */}
      {activeConnections.length === 0 && !isLoading && !connectionError && (
        <Paper
          sx={{ 
            p: 1.5, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1.5,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover'
          }}
        >
          <DisconnectedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary">
            Not connected
          </Typography>
        </Paper>
      )}

      {/* Active Connections - Compact */}
      {activeConnections.map(connId => {
        const conn = connections[connId];
        if (!conn) return null;

        return (
          <Paper
            key={connId}
            sx={{ 
              p: 1.5, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5,
              border: 1,
              borderColor: 'success.main',
              bgcolor: 'success.50'
            }}
          >
            <ConnectedIcon sx={{ fontSize: 20, color: 'success.main' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {conn.name || getConnectionName(conn.connectionString)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {getDatabaseDisplayName(conn.databaseType)} • {conn.databases?.length || 0} databases
              </Typography>
            </Box>
            <Button onClick={() => handleDisconnect(connId)} size="small" color="error" variant="text">
              Disconnect
            </Button>
          </Paper>
        );
      })}
    </Box>
  );
};

export default ConnectionStatus;