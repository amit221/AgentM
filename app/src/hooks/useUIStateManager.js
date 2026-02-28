import { useCallback, useMemo, useRef } from 'react';
import {
  shouldDisplayInitialLoader,
  shouldDisplayWelcomeScreen,
  shouldDisplayChatInterface,
  shouldDisplayRestoreLoader,
  hasPersistedConversationData,
  getCurrentInputValue,
  setInputValueByMode
} from '../utils/displayHelpers';

/**
 * Hook to manage UI state and display logic
 * Extracts UI state management from QueryViewChatUI
 */
const useUIStateManager = ({
  // Dependencies
  activeConversation,
  isFullyReady,
  messages,
  conversationState,
  
  // State passed from parent (to avoid circular dependency)
  agentInputValue,
  setAgentInputValue,
  queryInputValue,
  setQueryInputValue,
  inputMode,
  setInputMode,
  isLoading,
  setIsLoading,
  currentAbortController,
  setCurrentAbortController,
  currentOperationId,
  setCurrentOperationId,
  isRestoring,
  setIsRestoring,
  pendingDangerousQuery,
  setPendingDangerousQuery
}) => {
  
  // Input value management
  const currentInputValue = getCurrentInputValue(inputMode, agentInputValue, queryInputValue);
  
  const setCurrentInputValue = useCallback((value) => {
    setInputValueByMode(inputMode, value, setAgentInputValue, setQueryInputValue);
  }, [inputMode, setAgentInputValue, setQueryInputValue]);

  // UI display logic
  const hasActiveChat = messages.chatMessages.length > 0;
  const showWelcome = !hasActiveChat;
  
  const hasPersistedConversationDataCallback = useCallback(hasPersistedConversationData, []);
  
  const shouldShowInitialLoaderState = useMemo(() => {
    if (!conversationState) return false;
    
    return shouldDisplayInitialLoader({
      isRestoring,
      isInitialMinLoaderActive: conversationState.isInitialMinLoaderActive,
      hasInitialLoaderMaxWaitElapsed: conversationState.hasInitialLoaderMaxWaitElapsed,
      showWelcome,
      hasPersistedData: hasPersistedConversationDataCallback(activeConversation)
    });
  }, [
    isRestoring, 
    conversationState?.isInitialMinLoaderActive, 
    conversationState?.hasInitialLoaderMaxWaitElapsed, 
    showWelcome, 
    activeConversation, 
    hasPersistedConversationDataCallback,
    conversationState
  ]);

  // Stop operation handler
  const handleStopOperation = useCallback(async () => {
    if (currentOperationId) {
      try {
        await window.electronAPI.database.cancelOperation(currentOperationId);
        
        setCurrentOperationId(null);
        setCurrentAbortController(null);
        setIsLoading(false);
        
        messages.operationStopped();
      } catch (error) {
        console.error('Error cancelling operation:', error);
        setCurrentOperationId(null);
        setCurrentAbortController(null);
        setIsLoading(false);
        
        messages.warning('Failed to cancel operation cleanly, but stopped locally');
      }
    }
  }, [currentOperationId, messages]);

  return {
    // Input state
    agentInputValue,
    setAgentInputValue,
    queryInputValue,
    setQueryInputValue,
    inputMode,
    setInputMode,
    currentInputValue,
    setCurrentInputValue,
    
    // Loading state
    isLoading,
    setIsLoading,
    currentAbortController,
    setCurrentAbortController,
    currentOperationId,
    setCurrentOperationId,
    isRestoring,
    setIsRestoring,
    
    // Dangerous query state
    pendingDangerousQuery,
    setPendingDangerousQuery,
    
    // Display state
    showWelcome,
    shouldShowInitialLoaderState,
    
    // Display logic functions
    shouldDisplayWelcomeScreen: (showWelcome, isRestoring, shouldShowInitialLoaderState) => 
      shouldDisplayWelcomeScreen(showWelcome, isRestoring, shouldShowInitialLoaderState),
    shouldDisplayChatInterface: (showWelcome, isRestoring, shouldShowInitialLoaderState) => 
      shouldDisplayChatInterface(showWelcome, isRestoring, shouldShowInitialLoaderState),
    shouldDisplayRestoreLoader: (isRestoring, shouldShowInitialLoaderState) => 
      shouldDisplayRestoreLoader(isRestoring, shouldShowInitialLoaderState),
    
    // Handlers
    handleStopOperation
  };
};

export default useUIStateManager;
