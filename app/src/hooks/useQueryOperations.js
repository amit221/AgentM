import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  shouldWarnAboutQuerySafety, 
  isValidQueryString,
  validateConnection,
  validateDatabaseSelection,
  validateQuery
} from '../utils/displayHelpers';
import { 
  extractCollectionName, 
  suggestSafeQuery, 
  isDangerousReadQuery,
  isReadOperation
} from '../utils/queryValidation';
import { getDefaultQueryLimit } from '../utils/settingsUtils';

/**
 * Custom hook for managing query operations and execution
 * Extracted from QueryViewChatUI for better separation of concerns
 */
export default function useQueryOperations({
  // Dependencies from contexts
  activeConnections,
  selectedDatabase,
  safeActiveConversationId,
  settings,
  addNotification,
  activeConversation,
  
  // Query context functions
  updateCurrentQuery,
  updateCurrentResults,
  resetErrorFixAttempts,
  addQueryToHistory,
  allConversations,
  createOptimizationMessage,
  
  // AI context functions
  agentStart,
  agentFixQuery,
  agentDecide,
  
  // Message dispatcher
  messages,
  
  // Input management
  setCurrentInputValue,
  setQueryInputValue,
  setInputMode,
  
  // Loading states
  setIsLoading,
  setCurrentAbortController,
  setCurrentOperationId,
  
  // Dangerous query state (managed at component level)
  pendingDangerousQuery,
  setPendingDangerousQuery,
  
  // Query context for direct updates
  queryContext,
  
  // Database context function for getting connection type
  getConnectionDatabaseType
}) {
  // Track the conversation ID for the current operation to ensure loading states go to correct conversation
  const operationConversationRef = useRef(null);
  
  // Refs for timeout cleanup
  const errorFixTimeoutRef = useRef(null);
  const zeroResultsTimeoutRef = useRef(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (errorFixTimeoutRef.current) {
        clearTimeout(errorFixTimeoutRef.current);
      }
      if (zeroResultsTimeoutRef.current) {
        clearTimeout(zeroResultsTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to get the correct database for a conversation
  // Following cursor rules: encapsulate conditional logic in named functions
  const getConversationDatabase = useCallback((conversationId) => {
    if (!conversationId) return selectedDatabase;
    
    const conversation = allConversations.find(conv => conv.id === conversationId);
    const conversationDatabase = conversation?.database;
    
    // Auto-bind conversations without a database to the current selectedDatabase
    if (!conversationDatabase && selectedDatabase && queryContext?.setConversationDatabase) {
      console.log('🔍 Auto-binding conversation to database:', {
        conversationId: conversationId.slice(-8),
        database: selectedDatabase
      });
      
      // Automatically bind the conversation to the current selected database
      queryContext.setConversationDatabase(conversationId, selectedDatabase);
      return selectedDatabase;
    }
    
    // Debug: Log when there's a mismatch between conversation and selected database
    if (conversationDatabase && conversationDatabase !== selectedDatabase) {
      console.log('🔍 Database Context:', {
        conversationId: conversationId.slice(-8),
        conversationDB: conversationDatabase,
        selectedDB: selectedDatabase,
        using: conversationDatabase
      });
    }
    
    // Use conversation's database if it exists, otherwise fall back to global selectedDatabase
    return conversationDatabase || selectedDatabase;
  }, [allConversations, selectedDatabase, queryContext]);

  // Note: pendingDangerousQuery is now managed at the component level
  // and passed in via props to avoid state conflicts

  // Operation-aware loading state setters that update the correct conversation
  const setOperationLoading = useCallback((loading) => {
    const targetConversationId = operationConversationRef.current || safeActiveConversationId;
    if (targetConversationId) {

      setIsLoading(loading, targetConversationId);
    }
  }, [setIsLoading, safeActiveConversationId]);

  const setOperationAbortController = useCallback((controller) => {
    const targetConversationId = operationConversationRef.current || safeActiveConversationId;
    if (targetConversationId) {
      setCurrentAbortController(controller, targetConversationId);
    }
  }, [setCurrentAbortController, safeActiveConversationId]);

  const setOperationId = useCallback((operationId) => {
    const targetConversationId = operationConversationRef.current || safeActiveConversationId;
    if (targetConversationId) {
      setCurrentOperationId(operationId, targetConversationId);
    }
  }, [setCurrentOperationId, safeActiveConversationId]);

  // Simple error fixing flow - get clean conversation context
  const getConversationContextForErrorFix = async (conversationId, database) => {
    try {
      const conversation = allConversations.find(conv => conv.id === conversationId);
      if (!conversation) return { allSchemas: {}, allIndexes: {}, lastMessages: [] };

      // Get clean conversation history - exclude error fix attempts and optimization messages
      const lastMessages = messages.chatMessages
        .filter(msg => {
          // Include user messages
          if (msg.isUser) return true;
          
          // Include assistant responses but exclude error fix related messages
          if (!msg.isUser && msg.content && !msg.isQuery && !msg.isResult) {
            // Exclude optimization suggestions
            if (msg.content.includes("❌ I couldn't fix this error automatically")) return false;
            // Exclude AI fix attempt notifications
            if (msg.content.includes("🤖 Sending error to AI")) return false;
            // Exclude fix success messages
            if (msg.content.includes("✅ I found a potential fix")) return false;
            return true;
          }
          
          // Include queries as context
          if (msg.isQuery && msg.queryData) return true;
          
          return false;
        })
        .slice(-30) // Keep reasonable context window
        .map(msg => {
          if (msg.isUser) {
            return { role: 'user', content: msg.content };
          } else if (msg.isQuery && msg.queryData) {
            return { role: 'assistant', content: `I generated this query: ${msg.queryData}` };
          } else {
            return { role: 'assistant', content: msg.content };
          }
        });

      // Empty schemas for now - can be populated later if needed
      const allSchemas = {};
      const allIndexes = {};

      return { allSchemas, allIndexes, lastMessages };
    } catch (error) {
      console.error('Error getting conversation context:', error);
      return { allSchemas: {}, allIndexes: {}, lastMessages: [] };
    }
  };

  // Auto parameter filling logic
  const tryAutoParameterFill = useCallback(
    async (conversationId, queryText, availableParams = [], options = {}) => {
      try {
        if (!queryText || !queryText.includes('{{')) {
          return { success: false, query: queryText };
        }

        const { silent = false } = options;
        
        if (!silent) {
          messages.parameterManualRequired();
        }

        // For now, return the original query (parameter filling logic would go here)
        return { success: false, query: queryText };
      } catch (error) {
        console.error('Parameter fill error:', error);
        if (!options.silent) {
          messages.parameterFailed(error.message);
        }
        return { success: false, query: queryText, error: error.message };
      }
    },
    [messages]
  );

  // Show dangerous query warning (delegated to useDangerousQueryHandler)
  const showDangerousQueryWarning = (query, isAIGenerated = false) => {
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
      
      // Execute the safe query directly (this will show the query component)
      // Preserve the isAIGenerated flag since this is still an AI-generated query, just made safe
      executeQueryDirectly(safeQuery, null, isAIGenerated);
      return { applied: true, safeQuery };
    } else {
      // Fallback to showing warning if we can't create a safe version
      messages.dangerousQueryWarning(query, null);
      setPendingDangerousQuery(query);
      return { applied: false, safeQuery: null };
    }
  };

  // Core query execution logic
  const executeQueryDirectly = async (query, timeoutSeconds = null, isAIGenerated = false) => {
    console.log('⚡ executeQueryDirectly called:', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      isAIGenerated,
      timeoutSeconds
    });
    
    if (!isValidQueryString(query)) {
      messages.queryError('Invalid query format');
      return;
    }

    const conversationDatabase = getConversationDatabase(safeActiveConversationId);
    
    if (!validateConnection(activeConnections, addNotification) ||
        !validateDatabaseSelection(conversationDatabase, addNotification)) {
      return;
    }

    // Capture the conversation ID for this operation
    operationConversationRef.current = safeActiveConversationId;

    setOperationLoading(true);

    const abortController = new AbortController();
    setOperationAbortController(abortController);

    // Check if there's already an active operation context (before try block)
    const hadActiveOperation = messages.hasActiveOperation && messages.hasActiveOperation();
    const shouldStartNewOperation = !hadActiveOperation;

    try {
      // Start operation context to ensure all messages go to the correct conversation
      // But only if there isn't already an active operation
      const operationId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setOperationId(operationId);
      
      if (shouldStartNewOperation) {
        messages.startOperation(operationId, safeActiveConversationId);
      }
      
      // Get current conversation context for result tracking
      const currentConv = allConversations.find(conv => conv.id === safeActiveConversationId);
      const prompt = currentConv?.currentPrompt || '';

      // Get the connection ID for this conversation
      // Use conversation's bound connectionId if available, otherwise fall back to first active connection
      const conversationConnectionId = currentConv?.connectionId || activeConnections[0];
      
      if (!conversationConnectionId) {
        addNotification('No connection available for this conversation', 'error');
        return;
      }

      // Execute query via electron API using the correct method
      // Prioritize chat timeout over settings timeout
      const finalTimeout = (timeoutSeconds !== null && timeoutSeconds !== undefined) 
        ? timeoutSeconds 
        : (settings?.queryTimeout || 60);
      
      const raw = await window.electronAPI.database.executeRawQuery(
        safeActiveConversationId,  // Pass conversation ID for shell-per-conversation
        conversationConnectionId,  // Use conversation's specific connection
        conversationDatabase,
        query,
        operationId,
        finalTimeout
      );

      // Check if the operation was cancelled
      if (raw?.cancelled) {
        messages.warning('Query execution was cancelled');
        return;
      }
      if (!raw?.success) {
        // Try to get the actual error from different possible locations
        let errorMessage = 'Query execution failed';
        
        if (raw?.error && raw.error !== 'Query execution failed') {
          // Use the error field if it's not the generic message
          errorMessage = raw.error;
        } else if (raw?.result?.output) {
          // Try to extract actual error from the output
          errorMessage = raw.result.output;
        } else if (raw?.documents?.[0]?.output) {
          // Try to extract from documents output
          errorMessage = raw.documents[0].output;
        } else if (raw?.error) {
          // Fall back to the error field even if generic
          errorMessage = raw.error;
        }
        

        
        // SIMPLIFIED: Always show error as result for debugging
        const errorResultData = {
          query,
          results: raw.documents || [{ output: errorMessage }],
          documents: raw.documents || [{ output: errorMessage }],
          count: raw.count || 1,
          executionTime: raw.executionTime || 0,
          success: false,
          error: errorMessage,
          type: 'error',
          operation: 'query',
          database: conversationDatabase // Include database even for errors
        };
        
        const currentConv = allConversations.find(conv => conv.id === safeActiveConversationId);
        
        if (currentConv) {
          updateCurrentResults(currentConv.id, errorResultData);
        }
        
        messages.showResult(errorResultData);

                 // Simple AI Error Fix Flow
         errorFixTimeoutRef.current = setTimeout(async () => {
           const errorFixAttempts = currentConv?.errorFixAttempts || 0;

           // Only attempt fix once per error and if AI function is available
           if (errorFixAttempts === 0 && agentFixQuery && typeof agentFixQuery === 'function') {
             try {
               // Show user that AI is working on the fix
               messages.info('🤖 Analyzing error and attempting to generate a fix...');
               setOperationLoading(true);
               
               // Get clean conversation context
               const { allSchemas, allIndexes, lastMessages } = await getConversationContextForErrorFix(currentConv.id, conversationDatabase);
               
               // Add the current error to the conversation context
               const contextWithError = [
                 ...lastMessages,
                 { role: 'assistant', content: `I generated this query: ${query}` },
                 { role: 'assistant', content: `The query failed with error: ${errorMessage}` }
               ];
               
               // Get database type from connection
               const connectionId = currentConv?.connectionId || activeConnections?.[0];
               const databaseType = getConnectionDatabaseType?.(connectionId) || 'mongodb';
               
               // Call AI to fix the error with correct database type
               const fixResult = await agentFixQuery(
                 currentConv.id, 
                 query, 
                 errorMessage, 
                 conversationDatabase, 
                 allSchemas, 
                 contextWithError, 
                 allIndexes,
                 currentConv,           // conversation context
                 getDefaultQueryLimit(settings), // defaultLimit
                 databaseType           // database type (mongodb or postgresql)
               );
               
               setOperationLoading(false);
               
              // Handle AI response - follow same pattern as normal agent flow
              if (fixResult && !fixResult.error) {
                // Handle assistant message and query atomically to ensure correct order
                if (fixResult.assistant_message && fixResult.query?.text) {
                  messages.agentResponseWithQuery(fixResult.assistant_message, fixResult.query.text, { targetConversationId: currentConv.id });
                  updateCurrentQuery(currentConv.id, fixResult.query.text);
                } else {
                  // Handle them separately if only one is present
                  if (fixResult.assistant_message) {
                    messages.agentResponse(fixResult.assistant_message, { targetConversationId: currentConv.id });
                  }
                  
                  if (fixResult.query?.text) {
                    updateCurrentQuery(currentConv.id, fixResult.query.text);
                    messages.showQuery(fixResult.query.text, { targetConversationId: currentConv.id });
                  }
                }
                
                // Show any step messages
                if (Array.isArray(fixResult.messages)) {
                  for (const m of fixResult.messages) {
                    if (!m?.content) continue;
                    messages.stepMessage(m.content, { targetConversationId: currentConv.id });
                  }
                }
                 
               } else {
                 messages.optimizationSuggestion(createOptimizationMessage(errorMessage));
               }
               
             } catch (fixError) {
               console.error('🚨 Error during AI fix attempt:', fixError);
               setOperationLoading(false);
               messages.optimizationSuggestion(createOptimizationMessage(errorMessage));
             }
           } else {
             // Show optimization suggestions as fallback
             messages.optimizationSuggestion(createOptimizationMessage(errorMessage));
           }
         }, 100);
        
        return;
      }

      const resultData = raw.operation === 'script'
        ? { operation: 'script', result: raw.result, count: raw.count, executionTime: raw.executionTime, database: conversationDatabase }
        : { documents: raw.result, count: raw.count, executionTime: raw.executionTime, database: conversationDatabase };

      if (currentConv) {
        updateCurrentResults(currentConv.id, resultData);
        resetErrorFixAttempts(currentConv.id);
        
        const queryHistoryEntry = {
          prompt,
          generatedQuery: query,
          results: resultData,
          database: conversationDatabase,
          operation: raw.operation || 'find',
          timestamp: new Date().toISOString(),
          ai: isAIGenerated, // Mark if query was generated by AI
        };
        
        console.log('💾 Saving query to history:', {
          conversationId: currentConv.id.slice(-8),
          query: query.substring(0, 100),
          ai: isAIGenerated,
          count: resultData.count,
          operation: raw.operation || 'find'
        });
        
        addQueryToHistory(currentConv.id, queryHistoryEntry);
      }

      const queryResult = { 
        query, 
        results: raw.result, 
        count: raw.count, 
        executionTime: raw.executionTime, 
        operation: raw.operation,
        database: conversationDatabase // Include database for widget creation
      };
      
      // Show the query result (message dispatcher will handle removing old results)
      const targetConversationId = operationConversationRef.current || safeActiveConversationId;
      messages.showResult(queryResult, { targetConversationId });
      
      // Debug: Log query execution details
      console.log('🔍 Query execution debug:', {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        isAIGenerated,
        count: raw.count,
        hasAgentDecide: !!agentDecide,
        agentDecideType: typeof agentDecide,
        targetConversationId: targetConversationId?.slice(-8),
        willCallAgentDecide: isAIGenerated && raw.count === 0 && agentDecide && typeof agentDecide === 'function'
      });
      
      // Check if query returned no results and was AI-generated - call agentDecide
      if (isAIGenerated && raw.count === 0 && agentDecide && typeof agentDecide === 'function') {
        console.log('✅ Conditions met for agentDecide call - query returned 0 results and was AI-generated');
        
        // Show a message to the user that we detected an issue and will try to fix it
        messages.info(
          '⚠️ This query returned no results. There might be a mistake in the query. I\'ll analyze it and try to suggest a fix.',
          { targetConversationId }
        );
        
        // Start a new operation context for the agentDecide call
        const zeroResultsOperationId = `zero_results_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        messages.startOperation(zeroResultsOperationId, targetConversationId);
        
        // Store previous operation conversation to restore later
        const previousOperationConversation = operationConversationRef.current;
        
        // Set loading state for the agentDecide call
        operationConversationRef.current = targetConversationId;
        setOperationLoading(true);
        setOperationId(zeroResultsOperationId);
        
        // Also update conversation UI state with loading state
        if (queryContext && typeof queryContext.updateConversationUIState === 'function') {
          queryContext.updateConversationUIState(targetConversationId, {
            loadingState: {
              isLoading: true,
              currentOperationId: zeroResultsOperationId,
              currentAbortController: null
            }
          });
        }
        
        zeroResultsTimeoutRef.current = setTimeout(async () => {
          try {
            console.log('🚀 Starting agentDecide call for zero results...');
            const currentConv = allConversations.find(conv => conv.id === targetConversationId);
            if (!currentConv) {
              console.warn('⚠️ No conversation found for targetConversationId:', targetConversationId);
              setOperationLoading(false);
              setOperationId(null);
              if (queryContext && typeof queryContext.updateConversationUIState === 'function') {
                queryContext.updateConversationUIState(targetConversationId, {
                  loadingState: {
                    isLoading: false,
                    currentOperationId: null,
                    currentAbortController: null
                  }
                });
              }
              if (messages.hasActiveOperation && messages.hasActiveOperation()) {
                messages.endOperation();
              }
              operationConversationRef.current = previousOperationConversation;
              return;
            }
            console.log('✅ Found conversation:', currentConv.id.slice(-8));
            
            // Get conversation context for agent decide
            const lastMsgs = messages.chatMessages
              .filter(msg => msg.isUser || (!msg.isUser && !msg.isQuery && !msg.isResult))
              .slice(-30)
              .map(msg => ({ role: msg.isUser ? 'user' : 'assistant', content: msg.content }));
            
            // Get schemas and indexes for the conversation
            const schemasResult = await window.electronAPI.storage.loadCollectionSchemas(conversationDatabase);
            const schemas = schemasResult.success ? schemasResult.schemas : null;
            const allSchemas = {};
            const allIndexes = {};
            
            if (schemas) {
              Object.entries(schemas).forEach(([collName, info]) => {
                if (info && info.schema) {
                  allSchemas[collName] = {
                    schema: info.schema,
                    fieldDescriptions: info.fieldDescriptions || []
                  };
                  if (Array.isArray(info.indexes)) {
                    allIndexes[collName] = info.indexes;
                  }
                }
              });
            }
            
            // Get database type from connection to ensure correct query syntax
            const connectionId = currentConv?.connectionId || activeConnections?.[0];
            const databaseType = getConnectionDatabaseType?.(connectionId) || 'mongodb';
            
            // Get PostgreSQL metadata if applicable
            let pgMetadata = null;
            if (databaseType === 'postgresql') {
              try {
                const metadataResult = await window.electronAPI.storage.loadPgMetadata(conversationDatabase);
                if (metadataResult?.success && metadataResult?.metadata) {
                  pgMetadata = metadataResult.metadata;
                  console.log('✅ Loaded PostgreSQL metadata for agentDecide:', {
                    views: Object.keys(pgMetadata.views || {}).length,
                    functions: pgMetadata.functions?.length || 0,
                    enumTypes: Object.keys(pgMetadata.enumTypes || {}).length
                  });
                }
              } catch (err) {
                console.warn('⚠️ Failed to load PostgreSQL metadata:', err);
              }
            }
            
            // Call agentDecide to inform about no results
            const noResultsMessage = `The query "${query}" returned no results. Please help me understand why and suggest what to do next.`;
            
            console.log('📤 Calling agentDecide with:', {
              conversationId: targetConversationId?.slice(-8),
              message: noResultsMessage.substring(0, 100),
              database: conversationDatabase,
              databaseType,
              schemasCount: Object.keys(allSchemas).length,
              indexesCount: Object.keys(allIndexes).length,
              lastMessagesCount: lastMsgs.length,
              hasPgMetadata: !!pgMetadata
            });
            
            const decideResult = await agentDecide(
              targetConversationId,
              noResultsMessage,
              conversationDatabase,
              true, // allow writes
              allSchemas,
              lastMsgs,
              allIndexes,
              currentConv,
              getDefaultQueryLimit(settings),
              databaseType, // Pass database type to ensure correct syntax
              pgMetadata // Pass PostgreSQL metadata if available
            );
            
            console.log('📥 agentDecide response received:', {
              success: decideResult?.success,
              hasError: !!decideResult?.error,
              hasAssistantMessage: !!decideResult?.assistant_message,
              hasQuery: !!decideResult?.query?.text,
              hasMessages: Array.isArray(decideResult?.messages) && decideResult.messages.length > 0
            });
            
            // Handle agent response
            if (decideResult && !decideResult.error && decideResult.success !== false) {
              console.log('✅ Processing successful agentDecide response');
              if (decideResult.assistant_message) {
                messages.agentResponse(decideResult.assistant_message, { targetConversationId });
              }
              
              if (decideResult.query?.text) {
                updateCurrentQuery(targetConversationId, decideResult.query.text);
                messages.showQuery(decideResult.query.text, { targetConversationId });
              }
              
              // Handle step messages
              if (Array.isArray(decideResult.messages)) {
                for (const m of decideResult.messages) {
                  if (!m?.content) continue;
                  messages.stepMessage(m.content, { targetConversationId });
                }
              }
            } else {
              console.warn('⚠️ agentDecide returned error or failure:', {
                error: decideResult?.error,
                success: decideResult?.success
              });
            }
          } catch (err) {
            console.error('❌ Error calling agentDecide for no results:', err);
            console.error('Error stack:', err.stack);
          } finally {
            // Clear loading state
            setOperationLoading(false);
            setOperationAbortController(null);
            setOperationId(null);
            
            if (queryContext && typeof queryContext.updateConversationUIState === 'function') {
              queryContext.updateConversationUIState(targetConversationId, {
                loadingState: {
                  isLoading: false,
                  currentOperationId: null,
                  currentAbortController: null
                }
              });
            }
            
            // End the operation
            if (messages.hasActiveOperation && messages.hasActiveOperation()) {
              messages.endOperation();
            }
            
            // Restore previous operation conversation reference
            operationConversationRef.current = previousOperationConversation;
          }
        }, 100);
      } else {
        // Debug why the condition wasn't met
        if (raw.count === 0) {
          console.log('⚠️ Query returned 0 results but agentDecide not called. Reasons:', {
            isAIGenerated,
            hasAgentDecide: !!agentDecide,
            agentDecideType: typeof agentDecide,
            reason: !isAIGenerated ? 'Query was not AI-generated' : 
                    !agentDecide ? 'agentDecide function not available' :
                    typeof agentDecide !== 'function' ? 'agentDecide is not a function' : 'Unknown'
          });
        }
      }
      
      // End operation AFTER showing result to ensure proper message routing
      
      // End the operation immediately after showing result since routing is now handled at dispatch time
      if (messages.hasActiveOperation && messages.hasActiveOperation()) {
        messages.endOperation();
      }
      // Clear the operation conversation reference
      operationConversationRef.current = null;
    } finally {
      // Clean up loading state
      setOperationLoading(false);
      setOperationAbortController(null);
      setOperationId(null);
    }
  };

  // Main query execution entry point
  const handleRunQuery = async (query, timeoutSeconds = null, isAIGenerated = false) => {
    const wasExplicitlySet = arguments.length >= 3 && arguments[2] !== undefined;
    
    // If isAIGenerated wasn't explicitly set, try to determine if this query was AI-generated
    if (!isAIGenerated && safeActiveConversationId) {
      const currentConv = allConversations.find(conv => conv.id === safeActiveConversationId);
      
      console.log('🔍 Checking if query was AI-generated:', {
        conversationId: safeActiveConversationId?.slice(-8),
        hasCurrentGeneratedQuery: !!currentConv?.currentGeneratedQuery,
        currentGeneratedQueryPreview: currentConv?.currentGeneratedQuery?.substring(0, 50),
        queryPreview: query.substring(0, 50),
        queryHistoryLength: currentConv?.queries?.length || 0
      });
      
      // Check if this query matches the current generated query (set by AI)
      if (currentConv?.currentGeneratedQuery) {
        const normalizedCurrent = currentConv.currentGeneratedQuery.trim().replace(/\s+/g, ' ');
        const normalizedQuery = query.trim().replace(/\s+/g, ' ');
        
        if (normalizedCurrent === normalizedQuery) {
          isAIGenerated = true;
          console.log('✅ Detected AI-generated query from currentGeneratedQuery (exact match)');
        } else {
          // Try partial match (query might be a subset or have minor differences)
          if (normalizedCurrent.includes(normalizedQuery) || normalizedQuery.includes(normalizedCurrent)) {
            console.log('⚠️ Query partially matches currentGeneratedQuery but not exactly');
          }
        }
      }
      
      // If still not detected, check query history
      if (!isAIGenerated) {
        const queryHistory = currentConv?.queries || [];
        const normalizedQuery = query.trim().replace(/\s+/g, ' ');
        
        const matchingHistoryEntry = queryHistory.find(q => {
          if (!q.generatedQuery) return false;
          const normalizedHistory = q.generatedQuery.trim().replace(/\s+/g, ' ');
          return normalizedHistory === normalizedQuery;
        });
        
        if (matchingHistoryEntry) {
          console.log('🔍 Found matching history entry:', {
            hasAiFlag: matchingHistoryEntry.ai !== undefined,
            aiValue: matchingHistoryEntry.ai,
            timestamp: matchingHistoryEntry.timestamp
          });
          
          if (matchingHistoryEntry.ai === true) {
            isAIGenerated = true;
            console.log('✅ Detected AI-generated query from history (ai flag was true)');
          } else {
            console.log('⚠️ Query found in history but ai flag is false or missing');
          }
        } else {
          console.log('⚠️ Query not found in history');
        }
      }
    }
    
    console.log('🎯 handleRunQuery called:', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      isAIGenerated,
      timeoutSeconds,
      wasExplicitlySet: arguments.length >= 3 && arguments[2] !== undefined
    });
    
    if (!query || typeof query !== 'string' || !query.trim()) {
      console.warn('⚠️ handleRunQuery: Invalid query');
      return;
    }
    
    const conversationDatabase = getConversationDatabase(safeActiveConversationId);
    
    if (!validateConnection(activeConnections, addNotification) ||
        !validateDatabaseSelection(conversationDatabase, addNotification)) {
      return;
    }

    // Check if this is a dangerous read query without limits
    if (shouldWarnAboutQuerySafety(query)) {
      showDangerousQueryWarning(query, isAIGenerated);
      return;
    }

    // If not dangerous, execute directly
    executeQueryDirectly(query, timeoutSeconds, isAIGenerated);
  };

  // Main message sending logic
  const handleSendMessage = async (message, mode, timeoutSeconds = null) => {
    if (!message.trim()) return;

    if (!validateConnection(activeConnections, addNotification)) {
      return;
    }

    const conversationDatabase = getConversationDatabase(safeActiveConversationId);

    if (!validateDatabaseSelection(conversationDatabase, addNotification)) {
      return;
    }

    if (!validateQuery(message, addNotification)) {
      return;
    }

    const conversationId = safeActiveConversationId;
    if (!conversationId) {
      addNotification('No active conversation', 'error');
      return;
    }

    // Capture the conversation ID for this operation
    operationConversationRef.current = conversationId;

    // Start operation context for agent operations
    const operationId = `${mode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    messages.startOperation(operationId, conversationId);

    // Add appropriate message type based on mode
    if (mode === 'query') {
      // In query mode, add user message first, then show the query component
      messages.userMessage(message, { targetConversationId: conversationId });
      messages.showQuery(message, { targetConversationId: conversationId });
      updateCurrentQuery(conversationId, message);
    } else {
      // In agent mode, add as user message
      messages.userMessage(message, { targetConversationId: conversationId });
    }
    
    // Clear input after sending message
    setCurrentInputValue('');

    // Initialize operation state
    operationConversationRef.current = conversationId;
    
    if (mode === 'agent') {
      // For agent mode, set up loading state here since we're doing AI processing
      // Update conversation UI state with loading state
      if (queryContext && typeof queryContext.updateConversationUIState === 'function') {
        queryContext.updateConversationUIState(conversationId, {
          loadingState: {
            isLoading: true,
            currentOperationId: operationId,
            currentAbortController: null
          }
        });
      }
      
      setOperationLoading(true);
      const abortController = new AbortController();
      setOperationAbortController(abortController);
      
      // Track if we're going to execute a query (so we don't end operation prematurely)
      let willExecuteQuery = false;
      
      // Agent Mode - send to AI for processing
      try {
        // Get the conversation's specific connectionId
        const currentConv = allConversations.find(conv => conv.id === conversationId);
        const conversationConnectionId = currentConv?.connectionId || activeConnections[0];
        
        if (!conversationConnectionId) {
          addNotification('No connection available for this conversation', 'error');
          messages.endOperation();
          return;
        }

        const lastMsgs = messages.chatMessages
          .filter(msg => msg.isUser || (!msg.isUser && !msg.isQuery && !msg.isResult))
          .slice(-30)
          .map(msg => ({ role: msg.isUser ? 'user' : 'assistant', content: msg.content }));

        const decide = await agentStart(conversationId, message, conversationDatabase, conversationConnectionId, lastMsgs, activeConversation, getDefaultQueryLimit(settings));

        if (!decide || decide.success === false || decide.error) {
          const errMsg = decide?.error || 'Agent request failed';
          messages.agentError(errMsg, { targetConversationId: conversationId });
          addNotification(errMsg, 'error');
          return;
        }

        // Handle assistant message and query atomically to ensure correct order
        if (decide?.assistant_message && decide?.query?.text) {
          messages.agentResponseWithQuery(decide.assistant_message, decide.query.text, { targetConversationId: conversationId });
          updateCurrentQuery(conversationId, decide.query.text);
        } else {
          // Handle them separately if only one is present
          if (decide?.assistant_message) {
            messages.agentResponse(decide.assistant_message, { targetConversationId: conversationId });
          }
          
          if (decide?.query?.text) {
            updateCurrentQuery(conversationId, decide.query.text);
            messages.showQuery(decide.query.text, { targetConversationId: conversationId });
          }
        }
        
        // Handle step messages
        if (Array.isArray(decide?.messages)) {
          for (const m of decide.messages) {
            if (!m?.content) continue;
            messages.stepMessage(m.content, { targetConversationId: conversationId });
          }
        }
        
        // Handle parameter autofill and auto-execution if query was provided
        if (decide?.query?.text) {

          const aiParams = Array.isArray(decide?.query?.parameters) ? decide.query.parameters : [];
          if (aiParams.length > 0) {
            const autoRes = await tryAutoParameterFill(conversationId, decide.query.text, aiParams, { silent: true });
            if (autoRes?.success && autoRes.query) {
              updateCurrentQuery(conversationId, autoRes.query);
              messages.showQuery(autoRes.query, { targetConversationId: conversationId });
              
              if (settings?.autoExecuteQueries && isReadOperation(autoRes.query)) {
                // Double-check that this is truly a read operation before auto-executing
                if (!isReadOperation(autoRes.query)) {
                  console.warn('🚨 Auto-execute blocked: Query is not a read operation:', autoRes.query);
                  return;
                }
                
            willExecuteQuery = true;
            // Add a small delay to ensure the query message is displayed before execution
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('🤖 Auto-executing AI-generated query (with params):', autoRes.query.substring(0, 100));
            await handleRunQuery(autoRes.query, timeoutSeconds, true); // Mark as AI-generated
              }
            }
            } else if (settings?.autoExecuteQueries && isReadOperation(decide.query.text)) {
            // Double-check that this is truly a read operation before auto-executing
            if (!isReadOperation(decide.query.text)) {
              console.warn('🚨 Auto-execute blocked: Query is not a read operation:', decide.query.text);
              return;
            }
            
            willExecuteQuery = true;
            // Add a small delay to ensure the AI response and query are displayed before execution
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('🤖 Auto-executing AI-generated query:', decide.query.text.substring(0, 100));
            await handleRunQuery(decide.query.text, timeoutSeconds, true); // Mark as AI-generated
          }
        }
      } catch (err) {
        messages.agentError(err?.message || 'Unknown error', { targetConversationId: conversationId });
      } finally {
        // Update conversation UI state to clear loading state
        if (queryContext && typeof queryContext.updateConversationUIState === 'function') {
          queryContext.updateConversationUIState(conversationId, {
            loadingState: {
              isLoading: false,
              currentOperationId: null,
              currentAbortController: null
            }
          });
        }
        
        setOperationLoading(false);
        setOperationAbortController(null);
        setOperationId(null);
        
        // Only end operation if we didn't execute a query
        // If we executed a query, let executeQueryDirectly handle ending the operation
        if (!willExecuteQuery) {
          messages.endOperation();
          // Clear the operation conversation reference
          operationConversationRef.current = null;
        }
      }
    } else {
      // Query Mode - attempt auto-parameter fill and run query
      // Note: Loading state is managed by executeQueryDirectly, not here
      try {
        const autoRes = await tryAutoParameterFill(conversationId, message, []);
        if (autoRes?.success && autoRes.query) {
          updateCurrentQuery(conversationId, autoRes.query);
          const lastMessage = messages.getLastMessage();
          if (lastMessage && lastMessage.isQuery) {
            messages.updateMessage(lastMessage.id, { queryData: autoRes.query }, { targetConversationId: conversationId });
          }
          await handleRunQuery(autoRes.query, timeoutSeconds);
        } else {
          await handleRunQuery(message, timeoutSeconds);
        }
      } catch (error) {
        // Handle any errors that occur during query execution
        messages.queryError(error?.message || 'Query execution failed');
        addNotification(error?.message || 'Query execution failed', 'error');
      } finally {
        // Clean up operation state (loading state is managed by executeQueryDirectly)
        // Note: Don't end operation here - executeQueryDirectly handles operation cleanup
        // This finally block is just for any other cleanup that might be needed
      }
      return;
    }
  };

  // Handle query editing
  const handleEditQuery = (query) => {
    // Set both the value and mode in a single update
    const conversationId = safeActiveConversationId;
    if (conversationId) {
      // Get current input state from the active conversation
      const activeConv = allConversations.find(conv => conv.id === conversationId);
      const currentInputState = activeConv?.uiState?.inputState || {
        agentValue: '',
        queryValue: '',
        mode: 'agent'
      };
      
      // Update both mode and value in a single state update
      queryContext.updateConversationUIState(conversationId, {
        inputState: {
          ...currentInputState,
          mode: 'query',
          queryValue: query
        }
      });

      // Focus the query input after the update
      requestAnimationFrame(() => {
        const mongoEditor = document.querySelector('.cm-content');
        if (mongoEditor) {
          mongoEditor.focus();
        }
      });
    }
  };

  // Helper to move a query into the input area and guide the user to replace parameters
  const promptUserToReplaceParams = useCallback((queryText) => {
    if (!queryText || typeof queryText !== 'string') return;
    setCurrentInputValue(queryText);
    setInputMode('query');
    messages.parameterManualRequired();
  }, [messages, setCurrentInputValue, setInputMode]);

  return {
    // Core query operations
    handleSendMessage,
    handleRunQuery,
    executeQueryDirectly,
    handleEditQuery,
    
    // Parameter handling
    tryAutoParameterFill,
    promptUserToReplaceParams,
    
    // Safety handling (basic warning only, full handling delegated to useDangerousQueryHandler)
    showDangerousQueryWarning,
    
    // Utility
    getConversationContextForErrorFix
  };
}
