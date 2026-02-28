import { useCallback } from 'react';
import { normalizeResults } from '../utils/results';
import { useClipboard } from '../context/ClipboardContext';
import { useQuery } from '../context/QueryContext';
import { useDatabase } from '../context/DatabaseContext';
import { getDefaultQueryLimit } from '../utils/settingsUtils';

/**
 * Extract timeout from query comments
 * Looks for patterns like:
 * // timeout: 120
 * // timeout: 300
 * @param {string} query - The query string
 * @returns {number|null} - Timeout in seconds or null if not found
 */
function extractTimeoutFromQuery(query) {
  if (!query || typeof query !== 'string') return null;
  
  // Look for timeout in comments (both single line and multi-line)
  const timeoutMatch = query.match(/(?:\/\/|\/\*)\s*timeout\s*:\s*(\d+)/i);
  if (timeoutMatch) {
    const timeout = parseInt(timeoutMatch[1], 10);
    return timeout > 0 ? timeout : null;
  }
  
  return null;
}

/**
 * Centralized query execution with consistent normalization, notifications,
 * conversation results update, and history logging.
 */
export function useExecuteQuery() {
  const { addNotification } = useClipboard();
  const { updateCurrentResults, addQueryToHistory, agentFixError, updateCurrentQuery, activeConversation, settings } = useQuery();
  const { getConnectionDatabaseType } = useDatabase();

  const execute = useCallback(
    async ({ conversationId, connectionId, database, query, prompt, timeoutSeconds = null }) => {
      if (!connectionId) {
        addNotification('Please connect to a database first.', 'warning');
        return { success: false, error: 'no_connection' };
      }
      if (!database) {
        addNotification('Please select a database first.', 'warning');
        return { success: false, error: 'no_database' };
      }
      if (!query || typeof query !== 'string' || !query.trim()) {
        return { success: false, error: 'invalid_query' };
      }

      try {
        // Check for timeout override in query comments
        const queryTimeout = extractTimeoutFromQuery(query);
        const finalTimeout = queryTimeout || timeoutSeconds;

        
        const raw = await window.electronAPI.database.executeRawQuery(
          conversationId || 'default', // conversationId
          connectionId,
          database,
          query,
          null, // operationId 
          finalTimeout // timeout in seconds
        );

        if (raw?.success) {
          const results = normalizeResults(raw);
          if (conversationId) {
            updateCurrentResults(conversationId, results);
            addQueryToHistory(conversationId, {
              prompt: prompt,
              generatedQuery: query,
              results,
              database,
              operation: raw.operation || 'find',
              timestamp: new Date().toISOString(),
            });
          }
          return { success: true, results, raw };
        }

        addNotification(`Error executing query: ${raw?.error || 'Unknown error'}`, 'error');
        if (conversationId) updateCurrentResults(conversationId, null);
        return { success: false, error: raw?.error || 'unknown', rawError: raw };
      } catch (error) {
        addNotification(`Error executing query: ${error.message}`, 'error');
        if (conversationId) updateCurrentResults(conversationId, null);
        return { success: false, error: error.message };
      }
    },
    [addNotification, updateCurrentResults, addQueryToHistory]
  );

  // Execute query with automatic error fixing
  const executeWithAutoFix = useCallback(
    async ({ conversationId, connectionId, database, query, prompt, onErrorFixAttempt, onErrorFixSuccess, onErrorFixFailure }) => {
      // First, try normal execution
      const result = await execute({ conversationId, connectionId, database, query, prompt });
      
      // If successful, return immediately
      if (result.success) {
        return result;
      }
      
      // If there's an error and we have a conversation ID, try to fix it
      if (!result.success && conversationId && onErrorFixAttempt) {
        try {
          onErrorFixAttempt(result.error);
          
          // Get database type from connection
          const databaseType = getConnectionDatabaseType?.(connectionId) || 'mongodb';
          
          // Get conversation context for error fixing with correct database type
          const fixResult = await agentFixError(conversationId, query, result.error, database, null, [], null, activeConversation, getDefaultQueryLimit(settings), databaseType);
          
          if (fixResult?.success && fixResult?.query?.text) {
            const fixedQuery = fixResult.query.text;
            
            // Update the current query
            updateCurrentQuery(conversationId, fixedQuery);
            
            if (onErrorFixSuccess) {
              onErrorFixSuccess(fixedQuery, fixResult?.assistant_message);
            }
            
            return { 
              success: false, 
              error: result.error, 
              fixedQuery: fixedQuery,
              fixExplanation: fixResult?.assistant_message,
              originalError: true
            };
          } else {
            if (onErrorFixFailure) {
              onErrorFixFailure(fixResult?.error || 'Could not generate fix');
            }
          }
        } catch (aiError) {
          console.error('Error trying to fix query:', aiError);
          if (onErrorFixFailure) {
            onErrorFixFailure(aiError.message);
          }
        }
      }
      
      return result;
    },
    [execute, agentFixError, updateCurrentQuery, getConnectionDatabaseType]
  );

  return { execute, executeWithAutoFix };
}


