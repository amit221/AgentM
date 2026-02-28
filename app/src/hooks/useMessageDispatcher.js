/**
 * Unified message dispatcher hook
 * Replaces 30+ addMessageToQueue calls with a clean, typed interface
 * Now conversation-aware - reads/writes messages from QueryContext per conversation
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { 
  shouldMessageBeAnimated, 
  hasMessageAnimation 
} from '../utils/displayHelpers';
import {
  createUserMessage,
  createAgentResponse,
  createAgentError,
  createQueryDisplay,
  createQueryResult,
  createQueryError,
  createInfoMessage,
  createWarningMessage,
  createErrorMessage,
  createSuccessMessage,
  createOperationStarted,
  createOperationStopped,
  createParameterSuccess,
  createParameterFailed,
  createParameterManualRequired,
  createDangerousQueryWarning,
  createSafeQueryApplied,
  createFixAttempt,
  createOptimizationSuggestion,
  createEditorPlacement,
  MessageTypes
} from '../utils/messageFactory';

/**
 * Disable animations on messages to prevent re-animation on re-renders
 * Following cursor rules: encapsulate conditional logic in named functions
 */
function disableAnimationsOnMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  
  return messages.map(msg => ({
    ...msg,
    disableAnimation: true,
    showTypewriter: false
  }));
}

/**
 * Compare two message arrays to determine if they're functionally equivalent
 * This is more reliable than JSON.stringify since it handles functions and callbacks properly
 */
function areMessagesEqual(messages1, messages2) {
  if (!Array.isArray(messages1) || !Array.isArray(messages2)) {
    return messages1 === messages2;
  }
  
  if (messages1.length !== messages2.length) {
    return false;
  }
  
  for (let i = 0; i < messages1.length; i++) {
    const msg1 = messages1[i];
    const msg2 = messages2[i];
    
    // Compare core message properties (ignore functions like onComplete)
    if (
      msg1?.id !== msg2?.id ||
      msg1?.content !== msg2?.content ||
      msg1?.isUser !== msg2?.isUser ||
      msg1?.isQuery !== msg2?.isQuery ||
      msg1?.isResult !== msg2?.isResult ||
      msg1?.queryData !== msg2?.queryData ||
      msg1?.level !== msg2?.level ||
      msg1?.timestamp !== msg2?.timestamp ||
      msg1?.showTypewriter !== msg2?.showTypewriter
    ) {
      return false;
    }
    
    // For result messages, compare resultData (but not deeply since it can be large)
    if (msg1?.isResult && msg2?.isResult) {
      if (msg1?.resultData?.success !== msg2?.resultData?.success ||
          msg1?.resultData?.error !== msg2?.resultData?.error ||
          msg1?.resultData?.count !== msg2?.resultData?.count) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Message dispatcher hook that provides a unified interface for all message operations
 * Now conversation-aware - manages messages per conversation via QueryContext
 */
export const useMessageDispatcher = () => {
  // Conversation context - will be set by the parent component
  const conversationContextRef = useRef({
    conversationId: null,
    updateUIState: null,
    activeConversation: null
  });
  
  // Operation context - tracks which conversation each operation belongs to
  const operationContextRef = useRef({
    currentOperationConversationId: null,
    allConversations: null
  });
  
  const messageQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  

  
  // State to track when messages should be re-memoized
  const [messageVersion, setMessageVersion] = useState(0);

  // Get messages from a specific conversation (defaults to current conversation)
  const getMessagesFromConversation = useCallback((targetConversationId = null) => {
    const context = conversationContextRef.current;
    const operationContext = operationContextRef.current;
    
    // Determine which conversation to get messages from
    const conversationId = targetConversationId || context.conversationId;
    if (!conversationId) {
      return [];
    }
    
    // If requesting current conversation, use the cached activeConversation
    if (conversationId === context.conversationId) {
      const freshConversation = context.activeConversation;
      if (!freshConversation?.uiState?.chatMessages) {
        return [];
      }
      return freshConversation.uiState.chatMessages;
    }
    
    // For different conversations, look in allConversations
    const allConversations = operationContext.allConversations;
    if (allConversations && Array.isArray(allConversations)) {
      const targetConversation = allConversations.find(conv => conv.id === conversationId);
      if (targetConversation?.uiState?.chatMessages) {
        return targetConversation.uiState.chatMessages;
      }
    }
    
    return [];
  }, []);

  // Get current messages from conversation context (for backward compatibility)
  const getCurrentMessages = useCallback(() => {
    return getMessagesFromConversation();
  }, [getMessagesFromConversation]);

    // Note: Removed complex updateMessages function - now using simple direct updates

  // Set conversation context (called by parent component)
  const setConversationContext = useCallback((conversationId, updateUIState, activeConversation) => {
    const previousContext = conversationContextRef.current;
    const currentOperationConversationId = operationContextRef.current.currentOperationConversationId;
    
    // Only update if something actually changed
    const hasChanged = 
      previousContext.conversationId !== conversationId ||
      previousContext.updateUIState !== updateUIState ||
      previousContext.activeConversation?.id !== activeConversation?.id ||
      !areMessagesEqual(
        previousContext.activeConversation?.uiState?.chatMessages || [],
        activeConversation?.uiState?.chatMessages || []
      );
    
    if (!hasChanged) {
      return; // Skip update if nothing changed
    }
    
    conversationContextRef.current = {
      conversationId,
      updateUIState,
      activeConversation
    };
    
    // Keep existing allConversations - it will be updated separately via setAllConversations
    // Don't override it here with just the active conversation
    
     // 🔧 Only update message version if messages actually changed
     const messagesChanged = !areMessagesEqual(
       previousContext.activeConversation?.uiState?.chatMessages || [],
       activeConversation?.uiState?.chatMessages || []
     );
     
     if (messagesChanged) {
       setMessageVersion(prev => prev + 1);
     }
   }, []);

  // Start an operation - capture the specified or current conversation ID
  const startOperation = useCallback((operationId, targetConversationId = null) => {
    const conversationId = targetConversationId || conversationContextRef.current.conversationId;
    const previousOperationId = operationContextRef.current.currentOperationConversationId;
    operationContextRef.current.currentOperationConversationId = conversationId;
  }, []);

  // End an operation - clear the operation context
  const endOperation = useCallback(() => {
    const previousOperationConversationId = operationContextRef.current.currentOperationConversationId;
    operationContextRef.current.currentOperationConversationId = null;
  }, []);

  // Set all conversations for cross-conversation messaging
  const setAllConversations = useCallback((allConversations) => {
    operationContextRef.current.allConversations = allConversations;
  }, []);

  // Check if there's an active operation
  const hasActiveOperation = useCallback(() => {
    return operationContextRef.current.currentOperationConversationId !== null;
  }, []);

  // Get current chat messages (for compatibility with existing code) - memoized to prevent unnecessary re-renders
  const chatMessages = useMemo(() => {
    const context = conversationContextRef.current;
    
    if (!context.conversationId) {
      return [];
    }
    
    const freshConversation = context.activeConversation;
    if (!freshConversation?.uiState?.chatMessages) {
      return [];
    }
    return freshConversation.uiState.chatMessages;
  }, [messageVersion]);

  // Simple dispatch function - adds message directly to target conversation
  const dispatch = useCallback((message, targetConversationId = null) => {
    const context = conversationContextRef.current;
    const operationContext = operationContextRef.current;
    
    // Determine target conversation ID (simple logic)
    let conversationId = targetConversationId;
    if (!conversationId) {
      // Use operation conversation if active, otherwise current conversation
      conversationId = operationContext.currentOperationConversationId || context.conversationId;
    }
    
    if (!conversationId || !context.updateUIState) {
      console.warn('Message dispatcher: No target conversation for message');
      return;
    }
    

    
    // Get current messages for target conversation
    const allConversations = operationContext.allConversations || [];
    const targetConversation = allConversations.find(conv => conv.id === conversationId);
    const currentMessages = targetConversation?.uiState?.chatMessages || [];
    
    // 🔧 FIX: Disable animations on existing messages when adding new ones
    const messagesWithDisabledAnimations = disableAnimationsOnMessages(currentMessages);
    
    // Add message directly to target conversation
    const newMessages = [...messagesWithDisabledAnimations, message];
    context.updateUIState(conversationId, {
      chatMessages: newMessages
    });
    
    // Update UI if this is the active conversation
    if (conversationId === context.conversationId) {
      setMessageVersion(prev => prev + 1);
    }
  }, []);

  // Simple message processing - no queue needed since we add directly
  const processMessage = useCallback((message, targetConversationId = null) => {
    const shouldAnimate = shouldMessageBeAnimated(message);
    const messageWithCallback = shouldAnimate && hasMessageAnimation(message) 
      ? { ...message, onComplete: () => {} } // Simple callback for animations
      : message;
      
    dispatch(messageWithCallback, targetConversationId);
  }, [dispatch]);

  // Convenience methods for common message types
  const commands = useMemo(() => ({
    // User interactions
    userMessage: (content, options = {}) => {
      const message = createUserMessage(content, options);
      processMessage(message, options.targetConversationId);
    },

    // Agent responses
    agentResponse: (content, options = {}) => {
      const message = createAgentResponse(content, options);
      processMessage(message, options.targetConversationId);
    },

    agentError: (error, options = {}) => {
      const message = createAgentError(error, options);
      processMessage(message, options.targetConversationId);
    },

             // Query operations
    showQuery: (queryData, options = {}) => {
      if (!queryData || typeof queryData !== 'string' || !queryData.trim()) {
        console.warn('🚨 showQuery called with invalid queryData:', queryData);
        return;
      }
      
      const message = createQueryDisplay(queryData, options);
      processMessage(message, options.targetConversationId);
    },

    showResult: (resultData, options = {}) => {
      // Remove any existing result messages first
      utilities.removeAllResultMessages();
      const message = createQueryResult(resultData, options);
      processMessage(message, options.targetConversationId);
    },

    queryError: (error, options = {}) => {
      const message = createQueryError(error, options);
      processMessage(message, options.targetConversationId);
    },

    // System notifications (replaces pushChat function)
    info: (content, options = {}) => {
      const message = createInfoMessage(content, options);
      processMessage(message, options.targetConversationId);
    },

    warning: (content, options = {}) => {
      const message = createWarningMessage(content, options);
      processMessage(message, options.targetConversationId);
    },

    error: (content, options = {}) => {
      const message = createErrorMessage(content, options);
      processMessage(message, options.targetConversationId);
    },

    success: (content, options = {}) => {
      const message = createSuccessMessage(content, options);
      processMessage(message, options.targetConversationId);
    },

    // Operation status
    operationStarted: (operation, options = {}) => {
      const message = createOperationStarted(operation, options);
      processMessage(message, options.targetConversationId);
    },

    operationStopped: (options = {}) => {
      const message = createOperationStopped(options);
      processMessage(message, options.targetConversationId);
    },

    // Parameter handling
    parameterSuccess: (content, options = {}) => {
      const message = createParameterSuccess(content, options);
      processMessage(message, options.targetConversationId);
    },

    parameterFailed: (reason, options = {}) => {
      const message = createParameterFailed(reason, options);
      processMessage(message, options.targetConversationId);
    },

    parameterManualRequired: (content = null, options = {}) => {
      const message = createParameterManualRequired({ content, ...options });
      processMessage(message, options.targetConversationId);
    },

    // Query safety
    dangerousQueryWarning: (query, safeQuery = null, options = {}) => {
      const message = createDangerousQueryWarning(query, safeQuery, options);
      processMessage(message, options.targetConversationId);
    },

    safeQueryApplied: (options = {}) => {
      const message = createSafeQueryApplied(options);
      processMessage(message, options.targetConversationId);
    },

    // Error fixing
    fixAttempt: (options = {}) => {
      const message = createFixAttempt(options);
      processMessage(message, options.targetConversationId);
    },

    optimizationSuggestion: (content, options = {}) => {
      const message = createOptimizationSuggestion(content, options);
      processMessage(message, options.targetConversationId);
    },

    // Editor interaction
    editorPlacement: (options = {}) => {
      const message = createEditorPlacement(options);
      processMessage(message, options.targetConversationId);
    },

    // Legacy support - replaces the old pushChat function
    pushChat: (content, level = 'info', options = {}) => {
      let message;
      switch (level) {
        case 'error':
          message = createErrorMessage(content, options);
          break;
        case 'warning':
          message = createWarningMessage(content, options);
          break;
        case 'success':
          message = createSuccessMessage(content, options);
          break;
        case 'info':
        default:
          message = createInfoMessage(content, options);
          break;
      }
      processMessage(message, options.targetConversationId);
    },

    // Batch operations
    dispatchMany: (messages, targetConversationId = null) => {
      messages.forEach(msg => {
        if (typeof msg === 'string') {
          commands.info(msg, { targetConversationId });
        } else if (msg.type) {
          processMessage(msg, targetConversationId);
        } else {
          processMessage(msg, targetConversationId);
        }
      });
    },

    // Step messages (for complex agent workflows)
    stepMessage: (content, options = {}) => {
      const message = createAgentResponse(content, { showTypewriter: true, ...options });
      processMessage(message, options.targetConversationId);
    },

    // Atomic operation: Add query followed by assistant message (ensures correct order)
    agentResponseWithQuery: (assistantMessage, queryData, options = {}) => {
      // Create both messages with consecutive IDs to ensure order
      const queryMessage = createQueryDisplay(queryData, options);
      const agentMessage = createAgentResponse(assistantMessage, options);
      
      // Ensure agent message has higher ID than query message
      if (agentMessage.id <= queryMessage.id) {
        agentMessage.id = queryMessage.id + 1;
      }
      
      // Add both messages in a single atomic operation to prevent race conditions
      const context = conversationContextRef.current;
      const operationContext = operationContextRef.current;
      
      // Determine target conversation ID
      const conversationId = options.targetConversationId || 
        operationContext.currentOperationConversationId || 
        context.conversationId;
      
      if (!conversationId || !context.updateUIState) {
        console.warn('Message dispatcher: No target conversation for agentResponseWithQuery');
        return;
      }
      
      // Get current messages for target conversation
      const allConversations = operationContext.allConversations || [];
      const targetConversation = allConversations.find(conv => conv.id === conversationId);
      const currentMessages = targetConversation?.uiState?.chatMessages || [];
      
      // Disable animations on existing messages
      const messagesWithDisabledAnimations = disableAnimationsOnMessages(currentMessages);
      
      // Add both messages atomically in the correct order (query first, then explanation)
      const newMessages = [...messagesWithDisabledAnimations, queryMessage, agentMessage];
      
      // Update conversation state with both messages at once
      context.updateUIState(conversationId, {
        chatMessages: newMessages
      });
      
      // Update UI if this is the active conversation
      if (conversationId === context.conversationId) {
        setMessageVersion(prev => prev + 1);
      }
    }
  }), [processMessage]);

  // Message management utilities
  const utilities = useMemo(() => ({
    // Clear all messages
    clearMessages: () => {
      const context = conversationContextRef.current;
      if (context.conversationId && context.updateUIState) {
        context.updateUIState(context.conversationId, {
          chatMessages: []
        });
        setMessageVersion(prev => prev + 1);
      }
    },

    // Set messages directly (for restoration)
    // This bypasses routing logic since we're restoring messages to their original conversation
    setMessages: (messages) => {
      const context = conversationContextRef.current;
      if (!context.conversationId || !context.updateUIState) {
        console.warn('Message dispatcher: No conversation context set for setMessages');
        return;
      }
      

      
      // 🔧 FIX: Ensure restored messages don't re-animate
      const messagesWithDisabledAnimations = disableAnimationsOnMessages(messages || []);
      
      // Update the current conversation's messages directly without routing
      context.updateUIState(context.conversationId, {
        chatMessages: messagesWithDisabledAnimations
      });
      
      // Update message version to trigger re-memoization
      setMessageVersion(prev => prev + 1);
    },

    // Get current queue length (for debugging)
    getQueueLength: () => messageQueueRef.current.length,

    // Check if processing (for debugging)
    isProcessing: () => isProcessingQueueRef.current,

    // Force process queue (for testing)
    forceProcessQueue: () => {
      if (!isProcessingQueueRef.current) {
        processMessageQueue();
      }
    },

    // Remove last message (for undo scenarios)
    removeLastMessage: () => {
      const currentMessages = getCurrentMessages();
      updateMessages(currentMessages.slice(0, -1));
    },

    // Update a specific message (by ID)
    updateMessage: (messageId, updates) => {
      const currentMessages = getCurrentMessages();
      const updatedMessages = currentMessages.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      );
      updateMessages(updatedMessages);
    },

    // Filter messages by type
    getMessagesByType: (type) => {
      return chatMessages.filter(msg => msg.type === type);
    },

    // Get message count
    getMessageCount: () => chatMessages.length,

    // Check if there are any result messages
    hasResults: () => chatMessages.some(msg => msg.isResult),

    // Get last message
    getLastMessage: () => chatMessages[chatMessages.length - 1] || null,

    // Remove all result messages
    removeAllResultMessages: () => {
      const context = conversationContextRef.current;
      const operationContext = operationContextRef.current;
      
      // Determine target conversation (same logic as dispatch)
      const conversationId = operationContext.currentOperationConversationId || context.conversationId;
      
      if (conversationId && context.updateUIState) {
        const allConversations = operationContext.allConversations || [];
        const targetConversation = allConversations.find(conv => conv.id === conversationId);
        const currentMessages = targetConversation?.uiState?.chatMessages || [];
        const filteredMessages = currentMessages.filter(msg => !msg?.isResult);
        
        // 🔧 FIX: Disable animations on remaining messages
        const messagesWithDisabledAnimations = disableAnimationsOnMessages(filteredMessages);
        
        context.updateUIState(conversationId, {
          chatMessages: messagesWithDisabledAnimations
        });
        
        if (conversationId === context.conversationId) {
          setMessageVersion(prev => prev + 1);
        }
      }
    }
  }), [chatMessages]);

  return {
    // Core state
    chatMessages,
    
    // Core dispatch function (for custom messages)
    dispatch,
    
    // Conversation context management
    setConversationContext,
    setAllConversations,
    
    // Operation context management
    startOperation,
    endOperation,
    hasActiveOperation,
    
    // Convenience command methods
    ...commands,
    
    // Utility methods
    ...utilities
  };
};

export default useMessageDispatcher;
