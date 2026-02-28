import React, { useState, useMemo } from 'react';
import {
  Box,
  Tabs,
  Tab,
  IconButton,
  TextField,
  Typography,
  Chip,
  Button,
  useTheme
} from '@mui/material';
import {
  Add as AddIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useQuery } from '../../context/QueryContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useClipboard } from '../../context/ClipboardContext';
import { generateConnectionDisplayName } from '../../utils/connectionUtils';
import { getDatabaseBranding } from '../../utils/databaseLogos';
import TabConnectionDialog from '../dialogs/TabConnectionDialog';
import { Avatar } from '@mui/material';

const ConversationTabs = () => {
  const { 
    conversations, 
    activeConversationId, 
    setActiveConversation, 
    addConversation, 
    removeConversation,
    renameConversation,
    setConversationDatabase,
    updateConversation
  } = useQuery();
  
  const { activeConnections, selectedDatabase, connections, savedConnections } = useDatabase();
  const { addNotification } = useClipboard();
  
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  // Helper function to get connection name (similar to DatabaseTree)
  const getConnectionName = (connectionString) => {
    // Try to find the connection name from saved connections
    const savedConn = savedConnections.find(conn => {
      const connString = typeof conn === 'string' ? conn : conn.connectionString;
      return connString === connectionString;
    });
    
    if (savedConn && typeof savedConn === 'object' && savedConn.name) {
      return savedConn.name;
    }
    
    // Use our secure utility function for generating display names
    return generateConnectionDisplayName(connectionString);
  };


  // Helper function to create conversation with specific connection and database
  const createConversationWithSelection = (connectionId, connectionName, database) => {
    const conversationId = `conversation_${Date.now()}`;
    
    console.log('🔍 Creating conversation:', { conversationId: conversationId.slice(-8), database, connectionId });
    
    // Create conversation with the specific connectionId
    addConversation(conversationId, null, null, connectionId);
    setActiveConversation(conversationId);
    setConversationDatabase(conversationId, database);
    
    // Name the tab with just the database name
    const tabName = database;
    renameConversation(conversationId, tabName);
    
    // Set connection ID and name for proper tracking
    updateConversation(conversationId, { connectionId, connectionName });
    
    return conversationId;
  };

  const handleAddConversation = () => {
    // Check if we have any active connections
    if (activeConnections.length === 0) {
      addNotification('Please connect to a database first.', 'warning');
      return;
    }

    // Always show the connection/database selection dialog when creating a new tab
    setShowConnectionDialog(true);
  };

  const handleDialogConfirm = ({ connectionId, connectionName, database }) => {
    createConversationWithSelection(connectionId, connectionName, database);
  };

  const handleCloseConversation = (conversationId, e) => {
    e.stopPropagation();
    // Allow closing all conversations, including the last one
    removeConversation(conversationId);
  };

  const handleStartRename = (conversation, e) => {
    e.stopPropagation();
    setEditingTabId(conversation.id);
    setEditingName(conversation.name);
  };

  const handleSaveRename = (conversationId) => {
    if (editingName.trim()) {
      renameConversation(conversationId, editingName.trim());
    }
    setEditingTabId(null);
    setEditingName('');
  };

  const handleCancelRename = () => {
    setEditingTabId(null);
    setEditingName('');
  };

  const handleKeyPress = (e, conversationId) => {
    if (e.key === 'Enter') {
      handleSaveRename(conversationId);
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };

  const formatTabName = (conversation) => {
    // Show only the database name, not the connection name or conversation ID
    return conversation.database || conversation.name;
  };

  // Get database branding for a conversation
  const getConversationBranding = (conversation) => {
    if (!conversation?.connectionId) return null;
    
    const connection = connections[conversation.connectionId];
    if (!connection) return null;
    
    return getDatabaseBranding(connection.connectionString, connection.databaseType);
  };

  const theme = useTheme();
  
  // Safe activeConversationId to prevent MUI Tabs errors
  const safeActiveConversationId = useMemo(() => {
    if (conversations.length === 0) return false; // MUI Tabs needs false when no tabs
    
    // Check if activeConversationId exists in current conversations
    const exists = conversations.some(conv => conv.id === activeConversationId);
    if (exists) {
      return activeConversationId;
    }
    
    // If not, return the first conversation ID
    return conversations[0].id;
  }, [conversations, activeConversationId]);

  return (
    <Box 
      sx={{ 
        borderBottom: 1, 
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 2,
        py: 1
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
          {conversations.length > 0 ? (
            <Tabs
              value={safeActiveConversationId}
              onChange={(_, newValue) => setActiveConversation(newValue)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTab-root': {
                  minHeight: 40,
                  textTransform: 'none',
                  minWidth: 120,
                  maxWidth: 200, // Reduced from 250 to give more space for buttons
                  padding: '8px 8px', // Reduce horizontal padding
                  cursor: 'pointer',
                }
              }}
            >
              {conversations.map((conversation) => {
                const branding = getConversationBranding(conversation);
                
                return (
                <Tab
                  key={conversation.id}
                  value={conversation.id}
                  label={
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 0.75, 
                      minWidth: 0, 
                      width: '100%',
                      maxWidth: '100%'
                    }}>
                      
                      {/* Database Logo */}
                      {branding && (
                        <Avatar
                          src={branding.logo}
                          alt={branding.providerName}
                          sx={{
                            width: 16,
                            height: 16,
                            flexShrink: 0,
                            bgcolor: 'background.default',
                            border: 1,
                            borderColor: 'divider',
                            '& img': {
                              objectFit: 'contain',
                              p: 0.25
                            }
                          }}
                        />
                      )}
                      
                      {/* Tab Name - Flexible but limited */}
                      <Box sx={{ flex: 1, minWidth: 0, maxWidth: 120 }}>
                      {editingTabId === conversation.id ? (
                        <TextField
                          size="small"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleSaveRename(conversation.id)}
                          onKeyDown={(e) => handleKeyPress(e, conversation.id)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                          variant="standard"
                          sx={{ 
                            width: '100%',
                            '& .MuiInput-input': { 
                              fontSize: '0.75rem',
                              p: 0 
                            } 
                          }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{ 
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            lineHeight: 1.2
                          }}
                          title={formatTabName(conversation)}
                          onDoubleClick={(e) => handleStartRename(conversation, e)}
                        >
                          {formatTabName(conversation)}
                        </Typography>
                      )}
                    </Box>

                    {/* Close Button - Always visible */}
                    {editingTabId !== conversation.id && (
                      <Box sx={{ 
                        display: 'flex', 
                        flexShrink: 0,
                        alignItems: 'center'
                      }}>
                        <Box
                          component="span"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloseConversation(conversation.id, e);
                          }}
                          sx={{ 
                            p: 0.25, 
                            fontSize: '0.625rem',
                            cursor: 'pointer',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 16,
                            minHeight: 16,
                            '&:hover': { 
                              backgroundColor: 'action.hover',
                              color: 'error.main' 
                            }
                          }}
                        >
                          <CloseIcon fontSize="inherit" />
                        </Box>
                      </Box>
                    )}
                  </Box>
                }
              />
              );
            })}
            </Tabs>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              No active conversations
            </Typography>
          )}
          
          {/* Add New Tab Button */}
          <IconButton
            onClick={handleAddConversation}
            size="small"
            sx={{ ml: 1 }}
            title="New conversation"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
        
        {/* Tab Count */}
        <Chip
          label={`${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
          sx={{ ml: 2 }}
        />
      </Box>
      
      {/* Connection Selection Dialog */}
      <TabConnectionDialog
        open={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
        onConfirm={handleDialogConfirm}
      />
    </Box>
  );
};

export default ConversationTabs;