import React, { useCallback, useState, useEffect, useRef, useMemo, useContext } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';

import QueryContext, { useQuery } from '../../context/QueryContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useClipboard } from '../../context/ClipboardContext';

import ConversationTabs from '../conversations/ConversationTabs';
import ChatContainer from '../chat/ChatContainer';
import WelcomeScreen from '../welcome/WelcomeScreen';
import SchemaGenerationProgress from '../SchemaGenerationProgress';
import useMessageDispatcher from '../../hooks/useMessageDispatcher';
import useQueryOperations from '../../hooks/useQueryOperations';
import useConversationLifecycle from '../../hooks/useConversationLifecycle';
import useConversationManager from '../../hooks/useConversationManager';
import useUIStateManager from '../../hooks/useUIStateManager';
import useDangerousQueryHandler from '../../hooks/useDangerousQueryHandler';

/**
 * Disable animations on messages to prevent re-animation
 * Following cursor rules: encapsulate conditional logic in named functions
 */
function disableMessageAnimations(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  
  return messages.map(msg => ({
    ...msg,
    showTypewriter: false,
    disableAnimation: true
  }));
}

// Guard component to check context availability
const QueryViewChatUIGuard = () => {
  const rawQueryContext = useContext(QueryContext);
  
  if (!rawQueryContext) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress size={24} />
        <Typography sx={{ ml: 2 }}>Loading...</Typography>
      </Box>
    );
  }
  
  return <QueryViewChatUIInner />;
};

// Main Chat UI Component - Pure Orchestrator
const QueryViewChatUIInner = () => {
  // Track what's causing re-renders
  const renderTracker = React.useRef({
    renderCount: 0,
    queryContext: null,
    selectedDatabase: null,
    activeConnections: null
  });
  
  renderTracker.current.renderCount++;
  
  // Context dependencies
  const queryContext = useQuery();
  const databaseContext = useDatabase();
  const { selectedDatabase, activeConnections, schemaGenStatus: allSchemaGenStatus, generateCollectionIndex, getConnectionDatabaseType } = databaseContext;
  const { addNotification } = useClipboard();
  
  // Debug what's causing re-renders
  const contextChanged = queryContext !== renderTracker.current.queryContext;
  const dbChanged = selectedDatabase !== renderTracker.current.selectedDatabase;
  const connectionsChanged = activeConnections !== renderTracker.current.activeConnections;
  

  
  renderTracker.current.queryContext = queryContext;
  renderTracker.current.selectedDatabase = selectedDatabase;
  renderTracker.current.activeConnections = activeConnections;
  
  // Check if user is connected to a database
  const isConnected = activeConnections && activeConnections.length > 0;
  const hasSelectedDatabase = Boolean(selectedDatabase);
  const isFullyReady = isConnected && hasSelectedDatabase;
  
  // Initialize message dispatcher first
  const messages = useMessageDispatcher();
  const lastContextUpdateRef = useRef(null);

  // Initialize conversation management
  const conversationManager = useConversationManager({
    allConversations: queryContext.conversations,
    activeConversationId: queryContext.activeConversationId,
    selectedDatabase,
    activeConnections,
    setActiveConversation: queryContext.setActiveConversation,
    addConversation: queryContext.addConversation,
    removeConversation: queryContext.removeConversation,
    setConversationDatabase: queryContext.setConversationDatabase,
    renameConversation: queryContext.renameConversation,
    addNotification,
    messages: messages
  });

  // Get active conversation first (needed for useEffect dependencies) - memoized to prevent object recreation
  const activeConversation = useMemo(() => {
    const found = queryContext.conversations.find(conv => conv.id === conversationManager.safeActiveConversationId);
    return found;
  }, [queryContext.conversations, conversationManager.safeActiveConversationId]);

  // Get schema generation status for current conversation's database
  const conversationDatabase = activeConversation?.database;
  const schemaGenStatus = conversationDatabase ? allSchemaGenStatus[conversationDatabase] : null;

  // Update message dispatcher with conversation context
  useEffect(() => {
    const conversationId = conversationManager.safeActiveConversationId;
    const updateFn = queryContext.updateConversationUIState;
    
    // Create a stable key to track if we should update
    const currentKey = `${conversationId}_${activeConversation?.id}_${activeConversation?.uiState?.chatMessages?.length || 0}`;
    
    // Only update if the key has actually changed
    if (lastContextUpdateRef.current === currentKey) {
      return;
    }
    
    if (conversationId && 
        updateFn && 
        activeConversation &&
        activeConversation.id === conversationId &&
        typeof updateFn === 'function' &&
        messages.setConversationContext) {
      
      try {
        messages.setConversationContext(conversationId, updateFn, activeConversation);
        messages.setAllConversations(queryContext.conversations);
        lastContextUpdateRef.current = currentKey;
      } catch (error) {
        console.error('Error updating message dispatcher context:', error);
      }
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, activeConversation?.id, activeConversation?.uiState?.chatMessages?.length, messages.setConversationContext]);

  // Initialize conversation lifecycle
  const shouldRestoreFromGlobalState = useCallback((conversationId) => {
    const conversation = queryContext.conversations.find(conv => conv.id === conversationId);
    return conversation?.uiState && (
      conversation.uiState.chatMessages.length > 0 || 
      conversation.uiState.inputState.agentValue || 
      conversation.uiState.inputState.queryValue
    );
  }, [queryContext.conversations]);

  // Get input state from active conversation
  const conversationInputState = activeConversation?.uiState?.inputState || {
    agentValue: '',
    queryValue: '',
    mode: 'agent'
  };

  // Functions to update conversation input state
  const setAgentInputValue = useCallback((value) => {
    const conversationId = conversationManager.safeActiveConversationId;
    if (conversationId) {
      // Get current input state from the active conversation
      const activeConv = queryContext.conversations.find(conv => conv.id === conversationId);
      const currentInputState = activeConv?.uiState?.inputState || {
        agentValue: '',
        queryValue: '',
        mode: 'agent'
      };
      
      queryContext.updateConversationUIState(conversationId, {
        inputState: {
          ...currentInputState,
          agentValue: value
        }
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, queryContext.conversations]);

  const setQueryInputValue = useCallback((value) => {
    const conversationId = conversationManager.safeActiveConversationId;
    if (conversationId) {
      // Get current input state from the active conversation
      const activeConv = queryContext.conversations.find(conv => conv.id === conversationId);
      const currentInputState = activeConv?.uiState?.inputState || {
        agentValue: '',
        queryValue: '',
        mode: 'agent'
      };
      
      queryContext.updateConversationUIState(conversationId, {
        inputState: {
          ...currentInputState,
          queryValue: value
        }
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, queryContext.conversations]);

  const setInputMode = useCallback((mode) => {
    const conversationId = conversationManager.safeActiveConversationId;
    if (conversationId) {
      // Get current input state from the active conversation
      const activeConv = queryContext.conversations.find(conv => conv.id === conversationId);
      const currentInputState = activeConv?.uiState?.inputState || {
        agentValue: '',
        queryValue: '',
        mode: 'agent'
      };
      
      queryContext.updateConversationUIState(conversationId, {
        inputState: {
          ...currentInputState,
          mode: mode
        }
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, queryContext.conversations]);

  // Get current input values from conversation state
  const agentInputValue = conversationInputState.agentValue;
  const queryInputValue = conversationInputState.queryValue;
  const inputMode = conversationInputState.mode;

  // Get loading state from active conversation
  const conversationLoadingState = activeConversation?.uiState?.loadingState || {
    isLoading: false,
    currentOperationId: null,
    currentAbortController: null
  };
  


  // Check for background operations in other conversations
  const backgroundOperations = useMemo(() => {
    return queryContext.conversations
      .filter(conv => conv.id !== conversationManager.safeActiveConversationId)
      .filter(conv => conv.uiState?.loadingState?.isLoading === true)
      .map(conv => ({
        id: conv.id,
        name: conv.name || `Tab ${conv.id.slice(-4)}`
      }));
  }, [queryContext.conversations, conversationManager.safeActiveConversationId]);

  // Get loading state from active conversation and ensure it's properly tracked
  const [isLoading, setIsLoadingState] = useState(false);
  
  useEffect(() => {
    setIsLoadingState(Boolean(conversationLoadingState.isLoading));
  }, [activeConversation?.id, conversationLoadingState.isLoading]);

  // Functions to update conversation loading state
  const setIsLoading = useCallback((loading, targetConversationId = null) => {
    const conversationId = targetConversationId || conversationManager.safeActiveConversationId;

    if (conversationId) {

      
      // Get the target conversation's loading state
      const targetConversation = queryContext.conversations.find(conv => conv.id === conversationId);
      const targetLoadingState = targetConversation?.uiState?.loadingState || {
        isLoading: false,
        currentOperationId: null,
        currentAbortController: null
      };
      
      // Update the conversation's UI state with loading state
      queryContext.updateConversationUIState(conversationId, {
        loadingState: {
          ...targetLoadingState,
          isLoading: loading
        }
      });

      // Force update the loading state in the current component
      if (conversationId === conversationManager.safeActiveConversationId) {
        setIsLoadingState(loading);
      }
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, queryContext.conversations]);



  const setCurrentOperationId = useCallback((operationId, targetConversationId = null) => {
    const conversationId = targetConversationId || conversationManager.safeActiveConversationId;
    if (conversationId) {
      // Get the target conversation's loading state
      const targetConversation = queryContext.conversations.find(conv => conv.id === conversationId);
      const targetLoadingState = targetConversation?.uiState?.loadingState || {
        isLoading: false,
        currentOperationId: null,
        currentAbortController: null
      };
      
      queryContext.updateConversationUIState(conversationId, {
        loadingState: {
          ...targetLoadingState,
          currentOperationId: operationId
        }
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, queryContext.conversations]);

  const setCurrentAbortController = useCallback((abortController, targetConversationId = null) => {
    const conversationId = targetConversationId || conversationManager.safeActiveConversationId;
    if (conversationId) {
      // Get the target conversation's loading state
      const targetConversation = queryContext.conversations.find(conv => conv.id === conversationId);
      const targetLoadingState = targetConversation?.uiState?.loadingState || {
        isLoading: false,
        currentOperationId: null,
        currentAbortController: null
      };
      
      queryContext.updateConversationUIState(conversationId, {
        loadingState: {
          ...targetLoadingState,
          currentAbortController: abortController
        }
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState, queryContext.conversations]);

  // Function to update conversation's restoring state (conversation-aware)
  const setIsRestoring = useCallback((restoring, targetConversationId = null) => {
    const conversationId = targetConversationId || conversationManager.safeActiveConversationId;

    
    if (conversationId) {
      queryContext.updateConversationUIState(conversationId, { 
        isRestoring: restoring 
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState]);

  // Get restoring state from active conversation
  const isRestoring = activeConversation?.uiState?.isRestoring || false;
  


  // Get dangerous query state from active conversation
  const pendingDangerousQuery = activeConversation?.uiState?.pendingDangerousQuery || '';
  
  // Function to update conversation's dangerous query state
  const setPendingDangerousQuery = useCallback((query) => {
    if (conversationManager.safeActiveConversationId) {
      queryContext.updateConversationUIState(conversationManager.safeActiveConversationId, { 
        pendingDangerousQuery: query 
      });
    }
  }, [conversationManager.safeActiveConversationId, queryContext.updateConversationUIState]);

  // Simplified saveCurrentUIStateToGlobal since input state is now automatically stored
  const saveCurrentUIStateToGlobal = useCallback((conversationId) => {
    if (!conversationId) return;
    
    // Only save chat messages since input state is now automatically stored per conversation
    // 🔧 FIX: Ensure all saved messages have animations disabled
    const currentUIState = {
      chatMessages: disableMessageAnimations(messages.chatMessages)
    };
    
    queryContext.updateConversationUIState(conversationId, currentUIState);
  }, [messages.chatMessages, queryContext.updateConversationUIState]);

  // Initialize conversation lifecycle
  const conversationState = useConversationLifecycle({
    safeActiveConversationId: conversationManager.safeActiveConversationId,
    conversations: conversationManager.conversations,
    allConversations: queryContext.conversations,
    isFullyReady,
    shouldRestoreFromGlobalState,
    saveCurrentUIStateToGlobal,
    messages,
    setIsRestoring,
    isLoading
  });

  // Initialize UI state management helper
  const uiState = useUIStateManager({
    activeConversation: queryContext.activeConversation,
    isFullyReady,
    messages,
    conversationState,
    // Pass the state and setters directly
    agentInputValue,
    setAgentInputValue,
    queryInputValue,
    setQueryInputValue,
    inputMode,
    setInputMode,
    isLoading: isLoading,
    setIsLoading,
    currentAbortController: conversationLoadingState.currentAbortController,
    setCurrentAbortController,
    currentOperationId: conversationLoadingState.currentOperationId,
    setCurrentOperationId,
    isRestoring,
    setIsRestoring,
    pendingDangerousQuery,
    setPendingDangerousQuery
  });

  // Initialize query operations
  const queryOps = useQueryOperations({
    activeConnections,
    selectedDatabase,
    safeActiveConversationId: conversationManager.safeActiveConversationId,
    settings: queryContext.settings,
    addNotification,
    activeConversation,
    updateCurrentQuery: queryContext.updateCurrentQuery,
    updateCurrentResults: queryContext.updateCurrentResults,
    resetErrorFixAttempts: queryContext.resetErrorFixAttempts,
    addQueryToHistory: queryContext.addQueryToHistory,
    allConversations: queryContext.conversations,
    createOptimizationMessage: queryContext.createOptimizationMessage,
    agentStart: queryContext.agentStart,
    agentFixQuery: queryContext.agentFixError,
    agentDecide: queryContext.agentDecide,
    messages,
    setCurrentInputValue: uiState.setCurrentInputValue,
    setQueryInputValue: setQueryInputValue,
    setInputMode: setInputMode,
    setIsLoading: setIsLoading,
    setCurrentAbortController: setCurrentAbortController,
    setCurrentOperationId: setCurrentOperationId,
    pendingDangerousQuery: pendingDangerousQuery,
    setPendingDangerousQuery: setPendingDangerousQuery,
    queryContext: queryContext,
    getConnectionDatabaseType: getConnectionDatabaseType
  });
  
  // Initialize dangerous query handler
  const dangerousQueryHandler = useDangerousQueryHandler({
    settings: queryContext.settings,
    messages,
    queryOps,
    pendingDangerousQuery: pendingDangerousQuery,
    setPendingDangerousQuery: setPendingDangerousQuery,
    setCurrentInputValue: uiState.setCurrentInputValue,
    updateCurrentQuery: queryContext.updateCurrentQuery,
    safeActiveConversationId: conversationManager.safeActiveConversationId
  });

  // Create a stable queryOperations object using refs to avoid constant re-creation
  const queryOperationsRef = useRef({});
  
  // Update the ref with current functions but keep the object reference stable
  useEffect(() => {
    queryOperationsRef.current = {
      ...queryOps,
      handleDangerousQueryConfirm: dangerousQueryHandler.handleDangerousQueryConfirm,
      handleDangerousQueryCancel: dangerousQueryHandler.handleDangerousQueryCancel,
      handleUseSafeQueryVersion: dangerousQueryHandler.handleUseSafeQueryVersion
    };
  });

  // Track memoized message references - declare BEFORE using
  const memoizedMessagesRef = React.useRef();

  // Memoize messages to prevent new array creation causing re-renders
  const memoizedMessages = useMemo(() => {
    const messages = activeConversation?.uiState?.chatMessages;
    memoizedMessagesRef.current = messages;
    return messages || []; // Return stable empty array reference
  }, [activeConversation?.uiState?.chatMessages]);

  // Create a stable memoized object that doesn't change reference
  const memoizedQueryOperations = useMemo(() => {
    // Return a proxy object that always calls the latest functions from the ref
    return new Proxy({}, {
      get(target, prop) {
        return queryOperationsRef.current[prop];
      },
      has(target, prop) {
        return prop in queryOperationsRef.current;
      },
      ownKeys(target) {
        return Object.keys(queryOperationsRef.current);
      }
    });
  }, []); // Empty dependency array - this object never changes reference!

  // Trigger schema generation when conversation database changes
  useEffect(() => {
    const conversationDatabase = activeConversation?.database;
    
    // Get connectionId: prefer stored one, but ensure it's still active
    let connectionId = activeConversation?.connectionId;
    
    // If stored connection is not active anymore, use first active connection
    if (connectionId && !activeConnections?.includes(connectionId)) {
      console.warn(`⚠️ Stored connection ${connectionId} is not active, using first active connection`);
      connectionId = activeConnections?.[0];
    } else if (!connectionId) {
      // No stored connection, use first active
      connectionId = activeConnections?.[0];
    }
    
    if (!conversationDatabase) {
      return; // No database selected yet
    }
    
    if (!connectionId) {
      // ConnectionId might not be set yet (race condition during tab creation)
      // This useEffect will re-run when connectionId is added
      console.log('⏭️ Waiting for connectionId to be set...', {
        database: conversationDatabase,
        storedConnectionId: activeConversation?.connectionId,
        activeConnections
      });
      return;
    }
    
    const triggerSchemaGeneration = async () => {
      try {
        // Check if schemas already exist
        const existing = await window.electronAPI.storage.loadCollectionSchemas(conversationDatabase);
        
        // Determine if generation is needed
        const needsGeneration = 
          !existing.success ||                              // 1. Load failed
          !existing.schemas ||                              // 2. No schemas object
          Object.keys(existing.schemas).length === 0 ||    // 3. Empty schemas {}
          Object.values(existing.schemas).every(s => !s);  // 4. All null/undefined
        
        if (!needsGeneration) {
          console.log(`✅ Schemas already exist for ${conversationDatabase}`);
          return;
        }
        
        console.log(`🔄 Triggering schema generation for ${conversationDatabase}...`, {
          connectionId,
          isActive: activeConnections?.includes(connectionId),
          activeConnections
        });
        
        // DatabaseContext's generateCollectionIndex now handles concurrent request prevention
        await generateCollectionIndex(connectionId, conversationDatabase, false);
        
      } catch (error) {
        console.error('❌ Schema generation failed:', error);
      }
    };
    
    triggerSchemaGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.database, activeConversation?.connectionId, activeConversation?.id, activeConnections]);
  
  // Listen for programmatic query execution events (from QueryList)
  useEffect(() => {
    const handleExecuteQuery = (event) => {
      const { conversationId, query } = event.detail;
      
      // Only execute if this is for the current active conversation
      if (conversationId === conversationManager.safeActiveConversationId && query) {
        queryOps.handleRunQuery(query);
      }
    };

    window.addEventListener('executeQuery', handleExecuteQuery);
    return () => window.removeEventListener('executeQuery', handleExecuteQuery);
  }, [conversationManager.safeActiveConversationId, queryOps.handleRunQuery]);

  // Render - Pure Orchestration
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Conversation Tabs */}
      <ConversationTabs
        conversations={conversationManager.conversations}
        activeId={conversationManager.safeActiveConversationId}
        onTabChange={conversationManager.handleTabChange}
        onAddConversation={conversationManager.handleAddConversation}
        onCloseConversation={conversationManager.handleCloseConversation}
      />

      {/* Main Content Area */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default'
      }}>
        {/* Schema Generation Progress - Part of normal layout flow */}
        {schemaGenStatus?.isGenerating && (
          <Box sx={{ px: 2, pt: 2 }}>
            <SchemaGenerationProgress status={schemaGenStatus} />
          </Box>
        )}

        {uiState.shouldShowInitialLoaderState && (
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            p: 3
          }}>
            <Box sx={{ textAlign: 'center' }}>
              <CircularProgress size={28} sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">Loading conversation…</Typography>
            </Box>
          </Box>
        )}

        {uiState.shouldDisplayWelcomeScreen(uiState.showWelcome, isRestoring, uiState.shouldShowInitialLoaderState) && (
          <WelcomeScreen
            isConnected={isConnected}
            hasSelectedDatabase={hasSelectedDatabase}
            isFullyReady={isFullyReady}
            isAnimationComplete={conversationState.isAnimationComplete}
            onSend={queryOps.handleSendMessage}
            isLoading={isLoading}
            inputValue={uiState.currentInputValue}
            onInputChange={uiState.setCurrentInputValue}
            mode={inputMode}
            onModeChange={setInputMode}
            onStop={uiState.handleStopOperation}
          />
        )}

        {uiState.shouldDisplayChatInterface(uiState.showWelcome, isRestoring, uiState.shouldShowInitialLoaderState) && (
          <ChatContainer
            messages={memoizedMessages}
            isLoading={isLoading}
            queryOperations={memoizedQueryOperations}
            messagesEndRef={conversationState.messagesEndRef}
            conversationId={conversationManager.safeActiveConversationId}
            onSend={queryOps.handleSendMessage}
            inputValue={uiState.currentInputValue}
            onInputChange={uiState.setCurrentInputValue}
            mode={inputMode}
            onModeChange={setInputMode}
            onStop={uiState.handleStopOperation}
            schemaGenStatus={schemaGenStatus}
          />
        )}

        {uiState.shouldDisplayRestoreLoader(isRestoring, uiState.shouldShowInitialLoaderState) && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
            <Typography variant="body2" color="text.secondary">Switching…</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// Export the guard component as the default
const QueryViewChatUI = QueryViewChatUIGuard;
export default QueryViewChatUI;
