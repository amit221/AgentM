/**
 * Display helper functions following cursor rules
 * All conditional logic extracted from inline usage to named functions
 */

import { isDangerousReadQuery } from './queryValidation';

// Connection state helpers
export function shouldShowReadyInterface(isFullyReady) {
  return Boolean(isFullyReady);
}

export function shouldShowDatabaseSelection(isConnected, hasSelectedDatabase) {
  return Boolean(isConnected) && !Boolean(hasSelectedDatabase);
}

export function shouldShowConnectionSetup(isConnected, hasSelectedDatabase) {
  return !Boolean(isConnected);
}

// Message rendering helpers
export function shouldRenderAsResult(message) {
  return Boolean(message?.isResult);
}

export function shouldRenderAsQuery(message) {
  return Boolean(message?.isQuery);
}

export function shouldAnimateMessage(message) {
  return !Boolean(message?.disableAnimation);
}

// UI state helpers
export function shouldDisplayInitialLoader(state) {
  const { 
    isRestoring, 
    isInitialMinLoaderActive, 
    hasInitialLoaderMaxWaitElapsed, 
    showWelcome, 
    hasPersistedData 
  } = state;
  
  if (isRestoring) return true;
  if (isInitialMinLoaderActive) return true;
  if (hasInitialLoaderMaxWaitElapsed) return false;
  if (!showWelcome) return false;
  
  return Boolean(hasPersistedData);
}

export function shouldDisplayWelcomeScreen(showWelcome, isRestoring, shouldShowInitialLoader) {
  return Boolean(showWelcome) && !Boolean(isRestoring) && !Boolean(shouldShowInitialLoader);
}

export function shouldDisplayChatInterface(showWelcome, isRestoring, shouldShowInitialLoader) {
  return !Boolean(showWelcome) && !Boolean(isRestoring) && !Boolean(shouldShowInitialLoader);
}

export function shouldDisplayRestoreLoader(isRestoring, shouldShowInitialLoader) {
  return Boolean(isRestoring) && !Boolean(shouldShowInitialLoader);
}

// Animation helpers
export function shouldShowWithOpacity(isAnimationComplete) {
  return Boolean(isAnimationComplete);
}

export function getTransitionDelay(isAnimationComplete) {
  return isAnimationComplete ? '0.3s' : '0s';
}

export function shouldShowLoadingIndicator(isLoading) {
  return Boolean(isLoading);
}

// Query validation helpers
export function shouldWarnAboutQuerySafety(queryString) {
  if (!isValidQueryString(queryString)) return false;
  return isDangerousReadQuery(queryString);
}

export function isValidQueryString(queryString) {
  return Boolean(queryString) && typeof queryString === 'string' && queryString.trim().length > 0;
}

// Message queue helpers
export function shouldMessageBeAnimated(message) {
  if (!message) return false;
  return Boolean(message.showTypewriter || message.isQuery || message.isResult);
}

export function hasMessageAnimation(message) {
  if (!message) return false;
  return Boolean(message.showTypewriter);
}

export function isMessageTypewriter(message) {
  if (!message) return false;
  return Boolean(message.showTypewriter && message.content);
}

// Input mode helpers
export function shouldDisplayAsQuery(mode) {
  return mode === 'query';
}

export function getCurrentInputValue(mode, agentValue, queryValue) {
  return mode === 'agent' ? agentValue : queryValue;
}

export function setInputValueByMode(mode, value, setAgentValue, setQueryValue) {
  if (mode === 'agent') {
    setAgentValue(value);
  } else {
    setQueryValue(value);
  }
}

// Conversation data helpers
export function hasQueriesInConversation(conversation) {
  return Boolean(conversation) && Array.isArray(conversation.queries) && conversation.queries.length > 0;
}

export function hasCurrentPrompt(conversation) {
  return Boolean(conversation) && typeof conversation.currentPrompt === 'string' && conversation.currentPrompt.trim().length > 0;
}

export function hasCurrentGeneratedQuery(conversation) {
  return Boolean(conversation) && typeof conversation.currentGeneratedQuery === 'string' && conversation.currentGeneratedQuery.trim().length > 0;
}

export function hasCurrentResults(conversation) {
  return Boolean(conversation?.currentResults);
}

export function hasPersistedConversationData(conversation) {
  if (!conversation) return false;
  
  if (hasQueriesInConversation(conversation)) return true;
  if (hasCurrentPrompt(conversation)) return true;
  if (hasCurrentGeneratedQuery(conversation)) return true;
  if (hasCurrentResults(conversation)) return true;
  
  return false;
}

// Message sorting helpers
export function sortMessagesByTimestamp(messages) {
  if (!Array.isArray(messages)) return [];
  return [...messages].sort((a, b) => a.id - b.id);
}

// Validation helpers
export function validateConnection(activeConnections) {
  return Boolean(activeConnections) && activeConnections.length > 0;
}

export function validateDatabaseSelection(selectedDatabase) {
  return Boolean(selectedDatabase);
}

export function validateQuery(query) {
  return Boolean(query) && typeof query === 'string' && query.trim().length > 0;
}
