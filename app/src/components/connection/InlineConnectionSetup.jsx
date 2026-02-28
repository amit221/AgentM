import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  History as HistoryIcon,
  Computer as LocalIcon,
  Cloud as CloudIcon
} from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { useNavigation } from '../../context/NavigationContext';
import { generateConnectionDisplayName } from '../../utils/connectionUtils';
import ConnectionEditModal from './ConnectionEditModal';

const SmartConnectionStart = () => {
  const { savedConnections, connect, isLoading, addSavedConnection } = useDatabase();
  const { navigateTo, openConnectionsDialog } = useNavigation();
  const [connecting, setConnecting] = useState(null);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);

  const handleConnectToSaved = async (connection) => {
    setConnecting(connection.id);
    try {
      await connect(connection.connectionString, {}, connection.name);
    } finally {
      setConnecting(null);
    }
  };

  const handleAddNewConnection = () => {
    setConnectionModalOpen(true);
  };

  const handleSaveConnection = async (connectionData, mode) => {
    try {
      if (mode === 'create') {
        addSavedConnection(connectionData);
        setConnectionModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to save connection:', error);
    }
  };

  const quickStartOptions = [
    {
      id: 'local',
      title: 'Local MongoDB',
      subtitle: 'localhost:27017',
      icon: LocalIcon,
      action: () => connect('mongodb://localhost:27017', {}, 'Local MongoDB')
    }
  ];

  // Check if user has saved connections
  const hasSavedConnections = savedConnections && savedConnections.length > 0;

  return (
    <Box sx={{ 
      maxWidth: '400px', 
      width: '100%',
      mx: 'auto',
      textAlign: 'center'
    }}>
      {/* Header */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 300 }}>
          Welcome! I am AgentM
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
          Your AI assistant for database queries
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Connect to start exploring your data
        </Typography>
      </Box>

      {/* Recent/Saved Connections */}
      {hasSavedConnections && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ mb: 2, fontWeight: 500, textAlign: 'left' }}>
            Recent Connections
          </Typography>
          <List sx={{ 
            bgcolor: 'background.paper', 
            borderRadius: 1, 
            border: 1, 
            borderColor: 'divider',
            p: 0
          }}>
            {savedConnections.slice(0, 3).map((connection, index) => (
              <React.Fragment key={connection.id}>
                {index > 0 && <Divider />}
                <ListItem disablePadding>
                  <ListItemButton 
                    onClick={() => handleConnectToSaved(connection)}
                    disabled={isLoading || connecting === connection.id}
                  >
                    <ListItemIcon>
                      {connecting === connection.id ? (
                        <CircularProgress size={20} />
                      ) : (
                        <HistoryIcon />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={connection.name}
                      secondary={connection.name}
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                </ListItem>
              </React.Fragment>
            ))}
          </List>
          
          {savedConnections.length > 3 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              +{savedConnections.length - 3} more in Connections tab
            </Typography>
          )}
        </Box>
      )}

      {/* Quick Start Options - Only show if no saved connections */}
      {!hasSavedConnections && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ mb: 2, fontWeight: 500, textAlign: 'left' }}>
            Quick Start
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {quickStartOptions.map((option) => {
              const IconComponent = option.icon;
              return (
                <Button
                  key={option.id}
                  variant="outlined"
                  onClick={option.action}
                  disabled={isLoading}
                  sx={{
                    p: 2,
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    height: 'auto'
                  }}
                  startIcon={<IconComponent />}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {option.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.subtitle}
                    </Typography>
                  </Box>
                </Button>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Add New Connection */}
      <Button
        variant="contained"
        fullWidth
        onClick={handleAddNewConnection}
        startIcon={<AddIcon />}
        sx={{ mb: 2 }}
      >
        Add New Connection
      </Button>

      {/* Help Text */}
      <Typography variant="caption" color="text.secondary">
        Need help connecting? Visit the{' '}
        <Typography
          component="span"
          variant="caption"
          sx={{
            color: 'primary.main',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
          onClick={() => {
            if (openConnectionsDialog) {
              openConnectionsDialog();
            } else {
              navigateTo('connections');
            }
          }}
        >
          Connections tab
        </Typography>
      </Typography>

      {/* Connection Edit Modal */}
      <ConnectionEditModal
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        onSave={handleSaveConnection}
        connection={null}
        mode="create"
      />
    </Box>
  );
};

export default SmartConnectionStart;
