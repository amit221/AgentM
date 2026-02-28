import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  hasPersistedConversationData,
  shouldDisplayInitialLoader 
} from '../utils/displayHelpers';

/**
 * Custom hook for managing conversation lifecycle and state transitions
 * Consolidates multiple useEffects from QueryViewChatUI for better organization
 */
export default function useConversationLifecycle({
  // Context dependencies
  safeActiveConversationId,
  conversations,
  allConversations,
  isFullyReady,
  
  // State management functions
  shouldRestoreFromGlobalState,
  saveCurrentUIStateToGlobal,
  
  // Message management
  messages,
  
  // UI state setters
  setIsRestoring,
  
  // Loading state
  isLoading
}) {
  // Animation state
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  
  // Initial loader state for persisted data
  const [isInitialMinLoaderActive, setIsInitialMinLoaderActive] = useState(false);
  const [hasInitialLoaderMaxWaitElapsed, setHasInitialLoaderMaxWaitElapsed] = useState(false);
  
  // Refs for cleanup and tracking
  const initialLoaderTimerRef = useRef(null);
  const initialLoaderMaxWaitRef = useRef(null);
  const lastConversationIdRef = useRef(null);
  const initializedConversationRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  // Helper callback
  const hasPersistedConversationDataCallback = useCallback(hasPersistedConversationData, []);
  
  // 1. Animation State Management
  useEffect(() => {
    if (isFullyReady) {
      setIsAnimationComplete(true);
      setShowCompletionAnimation(false);
    } else {
      // Reset animation state when connection is lost
      setShowCompletionAnimation(false);
      setIsAnimationComplete(false);
    }
  }, [isFullyReady]);
  
  // 2. Initial Loader Management for Persisted Data
  useEffect(() => {
    const conv = conversations.find(c => c.id === safeActiveConversationId);
    const openingOldTab = hasPersistedConversationDataCallback(conv) && messages.chatMessages.length === 0;
    
    if (openingOldTab && !isInitialMinLoaderActive) {
      // Only set if not already active to prevent infinite loops

      setIsInitialMinLoaderActive(true);
      
      // Clear any existing timers
      if (initialLoaderTimerRef.current) {

        clearTimeout(initialLoaderTimerRef.current);
      }
      if (initialLoaderMaxWaitRef.current) {
        clearTimeout(initialLoaderMaxWaitRef.current);
      }
      
      // Set timer to clear the loader
      initialLoaderTimerRef.current = setTimeout(() => {

        setIsInitialMinLoaderActive(false);
        initialLoaderTimerRef.current = null;
      }, 1000);

      // Start max-wait timer to prevent indefinite spinner
      setHasInitialLoaderMaxWaitElapsed(false);
      initialLoaderMaxWaitRef.current = setTimeout(() => {
        setHasInitialLoaderMaxWaitElapsed(true);
        initialLoaderMaxWaitRef.current = null;
      }, 3000);
    } else if (!openingOldTab && isInitialMinLoaderActive) {
      // Clear loader if conditions no longer met

      setIsInitialMinLoaderActive(false);
      if (initialLoaderTimerRef.current) {
        clearTimeout(initialLoaderTimerRef.current);
        initialLoaderTimerRef.current = null;
      }
    }
    
    return () => {
      if (initialLoaderTimerRef.current) {
        clearTimeout(initialLoaderTimerRef.current);
        initialLoaderTimerRef.current = null;
      }
      if (initialLoaderMaxWaitRef.current) {
        clearTimeout(initialLoaderMaxWaitRef.current);
        initialLoaderMaxWaitRef.current = null;
      }
    };
  }, [safeActiveConversationId, hasPersistedConversationDataCallback, messages.chatMessages.length, isInitialMinLoaderActive]);
  
  // 3. Conversation State Transitions (Tab Switching)
  useEffect(() => {
    const previousId = lastConversationIdRef.current;
    const nextId = safeActiveConversationId;
    if (!nextId && previousId == null) return;
    if (previousId === nextId) return;

    // Save previous tab state to global context
    if (previousId) {
      saveCurrentUIStateToGlobal(previousId);
    }

    // Restore next tab state from global context

    setIsRestoring(true, nextId); // Pass the target conversation ID
    const restore = () => {
      const nextConversation = allConversations.find(conv => conv.id === nextId);
      
      if (shouldRestoreFromGlobalState(nextId) && nextConversation?.uiState) {
        // Restore from global state - input state is now automatically handled per conversation
        const { chatMessages: savedMessages } = nextConversation.uiState;
        
        if (Array.isArray(savedMessages) && savedMessages.length > 0) {
          // Disable animations for restored messages to prevent re-animation on tab switch
          const messagesWithoutAnimation = savedMessages.map(msg => ({
            ...msg,
            showTypewriter: false,
            disableAnimation: true
          }));
          messages.setMessages([...messagesWithoutAnimation]);
        } else {
          messages.clearMessages();
        }
      } else {
        // Reset to empty state for new/empty conversations - input state is automatically handled
        messages.clearMessages();
      }
      

      setIsRestoring(false, nextId); // Pass the target conversation ID
    };
    
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(restore);
    } else {
      restore();
    }

    lastConversationIdRef.current = nextId || null;
    // Reset initialization tracking when switching conversations
    initializedConversationRef.current = null;
  }, [safeActiveConversationId, shouldRestoreFromGlobalState, saveCurrentUIStateToGlobal, allConversations, messages, setIsRestoring]);
  
  // 4. Auto-scroll to Bottom on New Messages (one-time scroll for new messages only)
  const previousMessageCountRef = useRef(0);
  const scrollTimeoutRef = useRef(null);
  
  /**
   * Determines if we should scroll to a new message
   */
  function shouldScrollToNewMessage(currentCount, previousCount, lastMessage) {
    const hasNewMessage = currentCount > previousCount;
    const hasValidMessage = Boolean(lastMessage);
    const isNotResult = !lastMessage?.isResult;
    
    return hasNewMessage && hasValidMessage && isNotResult;
  }
  
  useEffect(() => {
    const currentMessageCount = messages.chatMessages.length;
    const lastMessage = messages.chatMessages[currentMessageCount - 1];
    

    
    if (shouldScrollToNewMessage(currentMessageCount, previousMessageCountRef.current, lastMessage)) {
      // Clear any pending scroll
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Immediate scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      
      // Follow-up scroll after a short delay to ensure DOM is fully rendered
      // This handles cases where multiple messages are added atomically
      scrollTimeoutRef.current = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        scrollTimeoutRef.current = null;
      }, 100);
    }
    
    previousMessageCountRef.current = currentMessageCount;
    
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [messages.chatMessages.length]);  // 🔧 FIXED: Use length only, not the array itself
  
  // Auto-scroll when loading starts (to show loading dots)
  const loadingScrollTimeoutRef = useRef(null);
  
  useEffect(() => {
    if (isLoading) {
      // Clear any pending scroll
      if (loadingScrollTimeoutRef.current) {
        clearTimeout(loadingScrollTimeoutRef.current);
      }
      
      // Immediate scroll
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      
      // Follow-up scroll to ensure we're at the bottom
      loadingScrollTimeoutRef.current = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        loadingScrollTimeoutRef.current = null;
      }, 100);
    }
    
    return () => {
      if (loadingScrollTimeoutRef.current) {
        clearTimeout(loadingScrollTimeoutRef.current);
        loadingScrollTimeoutRef.current = null;
      }
    };
  }, [isLoading]);
  
  // 5. Debounced UI State Save on Message Changes (replaces periodic save for better performance)
  useEffect(() => {
    if (safeActiveConversationId && messages.chatMessages.length > 0) {
      // Debounce the save to avoid excessive updates - only saves when messages actually change
      const saveTimeout = setTimeout(() => {
        saveCurrentUIStateToGlobal(safeActiveConversationId);
      }, 500);
      
      return () => clearTimeout(saveTimeout);
    }
  }, [messages.chatMessages.length, safeActiveConversationId, saveCurrentUIStateToGlobal]);  // 🔧 FIXED: Use length only
  
  // 6. Chat Initialization from Conversation History
  useEffect(() => {
    // Avoid infinite loops by checking if we've already initialized this conversation
    if (initializedConversationRef.current === safeActiveConversationId) return;
    
    // If there are already live messages (including results), don't overwrite them
    if (messages.chatMessages.length > 0) return;

    if (conversations.length === 0) {
      messages.clearMessages();
      initializedConversationRef.current = null;
      return;
    }

    // Load chat history from the active conversation
    const activeConv = conversations.find(conv => conv.id === safeActiveConversationId);
    if (activeConv) {
      const messagesToRestore = [];
      let messageId = 1;

      // 1) Restore persisted query history
      (activeConv.queries || []).forEach((queryItem) => {
        if (queryItem.prompt) {
          messagesToRestore.push({
            id: messageId++,
            content: queryItem.prompt,
            isUser: true,
            timestamp: new Date(queryItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            showTypewriter: false
          });
        }

        messagesToRestore.push({
          id: messageId++,
          content: 'I\'ll generate a MongoDB query for that request.',
          isUser: false,
          timestamp: new Date(queryItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          showTypewriter: false
        });

        if (queryItem.generatedQuery) {
          messagesToRestore.push({
            id: messageId++,
            content: '',
            isUser: false,
            isQuery: true,
            queryData: queryItem.generatedQuery
          });
        }
      });

      // 2) Restore in-progress prompt (not yet in history) so tab switches don't appear to "lose" it
      if (activeConv.currentPrompt && typeof activeConv.currentPrompt === 'string' && activeConv.currentPrompt.trim().length > 0) {
        const lastUserMessage = [...messagesToRestore].reverse().find(m => m.isUser === true);
        const isDuplicate = lastUserMessage && String(lastUserMessage.content || '') === activeConv.currentPrompt;
        if (!isDuplicate) {
          messagesToRestore.push({
            id: messageId++,
            content: activeConv.currentPrompt,
            isUser: true,
            timestamp: new Date(activeConv.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            showTypewriter: false
          });
          // Mirror the standard assistant acknowledgement so the subsequent generated query (if any) has context
          messagesToRestore.push({
            id: messageId++,
            content: 'I\'ll generate a MongoDB query for that request.',
            isUser: false,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            showTypewriter: false
          });
        }
      }

      // 3) Restore the latest generated query & its result from conversation state
      if (activeConv.currentGeneratedQuery) {
        messagesToRestore.push({
          id: messageId++,
          content: '',
          isUser: false,
          isQuery: true,
          queryData: activeConv.currentGeneratedQuery
        });
      }
      if (activeConv.currentResults) {
        const cr = activeConv.currentResults;
        const resultData = {
          query: activeConv.currentGeneratedQuery || '',
          results: cr.operation === 'script' ? cr.result : (cr.documents || []),
          count: typeof cr.count === 'number' ? cr.count : Array.isArray(cr.documents) ? cr.documents.length : 0,
          executionTime: cr.executionTime || 0,
          operation: cr.operation
        };
        messagesToRestore.push({
          id: messageId++,
          content: '',
          isUser: false,
          isResult: true,
          resultData
        });
      }

      messages.setMessages(messagesToRestore);
      initializedConversationRef.current = safeActiveConversationId;
    } else if (!safeActiveConversationId) {
      messages.clearMessages();
      initializedConversationRef.current = null;
    }
  }, [conversations, safeActiveConversationId, messages]);
  
  return {
    // Animation state
    showCompletionAnimation,
    isAnimationComplete,
    
    // Loader state
    isInitialMinLoaderActive,
    hasInitialLoaderMaxWaitElapsed,
    
    // Refs for external use
    messagesEndRef,
    
    // Computed state helpers
    shouldDisplayInitialLoader: shouldDisplayInitialLoader({
      isRestoring: false, // This would need to be passed in if needed
      isInitialMinLoaderActive,
      hasInitialLoaderMaxWaitElapsed
    })
  };
}
