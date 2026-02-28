import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, Box, Typography, IconButton, CircularProgress, Paper } from '@mui/material';
import { ContentCopy as CopyIcon, PlayArrow as ExecuteIcon, Delete as DeleteIcon } from '@mui/icons-material';
import Tooltip from '../ui/Tooltip';
import { copyToClipboard } from '../../utils/clipboard';
import { generateConnectionDisplayName } from '../../utils/connectionUtils';
import { useQuery } from '../../context/QueryContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useNavigation } from '../../context/NavigationContext';

/**
 * Generic list for queries: shows prompt and generatedQuery with top-right actions.
 * Actions: Delete (provided by caller), Run (opens new tab and executes), Copy (to clipboard)
 */
const QueryList = ({ items, onDelete }) => {
  const { openConversation, conversations, updateConversation } = useQuery();
  const { activeConnections, setSelectedDatabase, connections, savedConnections } = useDatabase();
  const { navigateTo } = useNavigation();
  const [busyIds, setBusyIds] = useState(new Set());
  
  // Ref for message update timeout cleanup
  const messageTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to get connection name for a query
  const getConnectionName = (query) => {
    // Use the stored conversationId if available
    const conversationId = query.conversationId;
    if (conversationId) {
      const conversation = conversations.find(conv => conv.id === conversationId);
      if (conversation?.connectionName) {
        return conversation.connectionName;
      }
    }
    
    // Fallback: try to find the conversation that contains this query (for older queries)
    const conversation = conversations.find(conv => 
      conv.queries && conv.queries.some(q => q.id === query.id)
    );
    
    if (conversation?.connectionName) {
      return conversation.connectionName;
    }
    
    // Try to get connection name from active connections using database name
    if (query.database && activeConnections.length > 0) {
      // Find the first active connection that has this database
      for (const connectionId of activeConnections) {
        const connection = connections[connectionId];
        if (connection && connection.databases && connection.databases.includes(query.database)) {
          // Try to find saved connection name
          const savedConn = savedConnections.find(conn => {
            const connString = typeof conn === 'string' ? conn : conn.connectionString;
            return connString === connection.connectionString;
          });
          
          if (savedConn && typeof savedConn === 'object' && savedConn.name) {
            return savedConn.name;
          }
          
          // Generate display name from connection string
          return generateConnectionDisplayName(connection.connectionString);
        }
      }
    }
    
    // Fallback to database name if no connection name found
    return query.database || 'Unknown Database';
  };


  // Helper function to generate a better title for the query
  const getQueryTitle = (query) => {
    const connectionName = getConnectionName(query);
    const databaseName = query.database || 'Unknown Database';
    
    // Simple format: ConnectionName - DatabaseName
    return `${connectionName} - ${databaseName}`;
  };

  const handleRun = async (item) => {
    if (!item) return;
    
    setBusyIds((prev) => new Set([...prev, item.id]));
    
    try {
      // Set DB and open the conversation tab
      await setSelectedDatabase(item.database);
      const convId = openConversation({ 
        database: item.database, 
        prompt: item.prompt, 
        generatedQuery: item.generatedQuery,
        conversationCount: conversations?.length + 1 
      });
      
      // Navigate to the query page
      navigateTo('query');
      
      // Create a query message component to show the query without auto-running
      messageTimeoutRef.current = setTimeout(() => {
        const assistantMessage = {
          id: `msg_${Date.now()}_text`,
          type: 'assistant',
          content: item.prompt || 'Here\'s the query from your history:',
          timestamp: new Date().toISOString(),
          showTypewriter: false,
          disableAnimation: true
        };
        
        const queryMessage = {
          id: `msg_${Date.now()}_query`,
          isQuery: true,
          queryData: item.generatedQuery,
          timestamp: new Date().toISOString(),
          showTypewriter: false,
          disableAnimation: true
        };
        
        // Update conversation with messages
        updateConversation(convId, {
          uiState: {
            chatMessages: [assistantMessage, queryMessage],
            inputState: {
              agentValue: '',
              queryValue: '',
              mode: 'agent'
            }
          }
        });
      }, 100);
      
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleCopy = async (text) => {
    await copyToClipboard(text || '');
  };

  return (
    <>
      {items.map((q) => (
        <Card key={q.id}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1, pr: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  {getQueryTitle(q)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip content="Delete">
                  <IconButton size="small" color="error" onClick={() => onDelete?.(q)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip content={busyIds.has(q.id) ? 'Running…' : 'Run'}>
                  <IconButton size="small" disabled={busyIds.has(q.id)} onClick={() => handleRun(q)}>
                    {busyIds.has(q.id) ? <CircularProgress size={16} /> : <ExecuteIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip content="Copy">
                  <IconButton size="small" onClick={() => handleCopy(q.generatedQuery)}>
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            <Paper sx={{ bgcolor: 'action.hover', p: 1.5, mt: 1 }}>
              <Box component="pre" sx={{ fontSize: '0.8rem', fontFamily: 'monospace', m: 0, whiteSpace: 'pre-wrap' }}>
                <Box component="code">{q.generatedQuery}</Box>
              </Box>
            </Paper>
          </CardContent>
        </Card>
      ))}
    </>
  );
};

export default QueryList;


