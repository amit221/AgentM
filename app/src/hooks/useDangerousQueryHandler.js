import { useCallback } from 'react';
import { extractCollectionName, suggestSafeQuery } from '../utils/queryValidation';
import { getDefaultQueryLimit } from '../utils/settingsUtils';
import { shouldWarnAboutQuerySafety } from '../utils/displayHelpers';

/**
 * Hook to handle dangerous query warnings and confirmations
 * Extracts dangerous query logic from QueryViewChatUI
 */
const useDangerousQueryHandler = ({
  // Dependencies
  settings,
  messages,
  queryOps,
  pendingDangerousQuery,
  setPendingDangerousQuery,
  setCurrentInputValue,
  updateCurrentQuery,
  safeActiveConversationId
}) => {
  
  const shouldShowDangerousQueryWarningCallback = useCallback(shouldWarnAboutQuerySafety, []);

  const showDangerousQueryWarning = useCallback((query) => {
    const collectionName = extractCollectionName(query);
    const safeQuery = suggestSafeQuery(query, getDefaultQueryLimit(settings));
    const hasSafeVersion = safeQuery !== query && (
      safeQuery.includes('.limit(') || safeQuery.includes('$limit')
    );

    if (hasSafeVersion) {
      // Automatically apply the safe version instead of showing warning
      
      // Update the current conversation's query with the safe version
      if (safeActiveConversationId) {
        updateCurrentQuery(safeActiveConversationId, safeQuery);
      }
      
      // Add message showing the safe version was applied
      messages.safeQueryApplied();
      
      // Return the safe query so the parent can execute it
      return { applied: true, safeQuery };
    } else {
      // Fallback to showing warning if we can't create a safe version
      messages.dangerousQueryWarning(query, null);
      setPendingDangerousQuery(query);
      return { applied: false, safeQuery: null };
    }
  }, [settings, messages, setPendingDangerousQuery, safeActiveConversationId, updateCurrentQuery]);

  const handleDangerousQueryConfirm = useCallback(() => {
    if (pendingDangerousQuery) {
      queryOps.executeQueryDirectly(pendingDangerousQuery);
      
      // Add confirmation message
      messages.warning('Proceeding with original query as requested...');
      
      setPendingDangerousQuery('');
    }
  }, [pendingDangerousQuery, queryOps, messages, setPendingDangerousQuery]);

  const handleDangerousQueryCancel = useCallback(() => {
    messages.success('Query execution cancelled for safety.');
    setPendingDangerousQuery('');
  }, [messages, setPendingDangerousQuery]);

  const handleUseSafeQueryVersion = useCallback((safeQuery) => {
    if (safeQuery) {
      // Update the input with the safe version
      setCurrentInputValue(safeQuery);
      // Update the current conversation's query
      if (safeActiveConversationId) {
        updateCurrentQuery(safeActiveConversationId, safeQuery);
      }
      
      // Add message showing the safe version was applied
      messages.safeQueryApplied();

      // Show the safe query
      messages.showQuery(safeQuery);
      
      setPendingDangerousQuery('');
    }
  }, [setCurrentInputValue, safeActiveConversationId, updateCurrentQuery, messages, setPendingDangerousQuery]);

  return {
    shouldShowDangerousQueryWarningCallback,
    showDangerousQueryWarning,
    handleDangerousQueryConfirm,
    handleDangerousQueryCancel,
    handleUseSafeQueryVersion
  };
};

export default useDangerousQueryHandler;
