import { useCallback, useMemo } from 'react';

/**
 * Hook to manage conversation state and operations
 * Extracts conversation management logic from QueryViewChatUI
 */
const useConversationManager = ({
  // Context dependencies
  allConversations,
  activeConversationId,
  selectedDatabase,
  activeConnections = [],
  
  // Context functions
  setActiveConversation,
  addConversation,
  removeConversation,
  setConversationDatabase,
  renameConversation,
  addNotification,
  
  // Message management
  messages
}) => {
  // Filter conversations to show only those for the current database
  const conversations = useMemo(() => allConversations, [allConversations]);

  // Safe activeConversationId - use first available conversation if current one doesn't exist
  const safeActiveConversationId = useMemo(() => {
    if (conversations.length === 0) return null;
    
    const exists = conversations.some(conv => conv.id === activeConversationId);
    return exists ? activeConversationId : conversations[0].id;
  }, [activeConversationId, conversations]);

  // Handle tab switching
  const handleTabChange = useCallback((newTabId) => {
    setActiveConversation(newTabId);
  }, [setActiveConversation]);

  // Handle adding new conversation
  const handleAddConversation = useCallback(() => {
    if (!selectedDatabase) {
      addNotification('Please select a database first.', 'warning');
      return;
    }
    
    const newConvId = `conversation_${Date.now()}`;
    // Use the first active connection as the default connection for new conversations
    const connectionId = activeConnections.length > 0 ? activeConnections[0] : null;
    addConversation(newConvId, null, null, connectionId);
    setActiveConversation(newConvId);
    setConversationDatabase(newConvId, selectedDatabase);
    
    // Name the tab with database and full conversation id
    const tabName = `${selectedDatabase} (${newConvId})`;
    renameConversation(newConvId, tabName);
    
    // Clear chat for new conversation
    messages.clearMessages();
  }, [selectedDatabase, activeConnections, addConversation, setActiveConversation, setConversationDatabase, renameConversation, addNotification, messages]);

  // Handle closing conversation
  const handleCloseConversation = useCallback((convId) => {
    removeConversation(convId);
    
    // Clear chat messages if this was the active conversation
    if (convId === safeActiveConversationId) {
      messages.clearMessages();
    }
  }, [removeConversation, safeActiveConversationId, messages]);

  return {
    conversations,
    safeActiveConversationId,
    handleTabChange,
    handleAddConversation,
    handleCloseConversation
  };
};

export default useConversationManager;
