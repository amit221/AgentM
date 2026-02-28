import React, { createContext, useContext, useReducer, useEffect, useMemo, useState } from 'react';
import httpClient from '../utils/httpClient';
import { useDatabase } from './DatabaseContext';
import { getDefaultQueryLimit, getDefaultSettings } from '../utils/settingsUtils';
import { TokenCounter } from '../utils/tokenCounter';
import metadataService from '../services/MetadataService';
import { sampleResults } from '../utils/resultSampler';

// Note: Agent API calls now use httpClient.agentRequest() which correctly routes to v1/agent

// Local storage key used as a fallback when Electron storage is unavailable
const LOCAL_STORAGE_KEY = 'agentm-conversations-state-v1';

// Build a safe, compact snapshot for persistence (omit heavy/ephemeral fields like results and UI state)
function buildPersistableSnapshot(state) {
  const sanitizedConversations = (state.conversations || []).map(conv => {
    const { currentResults, uiState, ...convWithoutTransient } = conv;
    return {
      ...convWithoutTransient,
      // Remove results from each saved query item
      queries: Array.isArray(conv.queries)
        ? conv.queries.map(q => {
            const { results, ...rest } = q || {};
            return rest;
          })
        : []
    };
  });

  const sanitizedHistory = (state.queryHistory || []).map(q => {
    const { results, ...rest } = q || {};
    return rest;
  }).slice(-50);

  // Favorites are generally small; keep as-is
  const favorites = Array.isArray(state.favorites) ? state.favorites : [];

  return {
    conversations: sanitizedConversations,
    activeConversationId: state.activeConversationId,
    queryHistory: sanitizedHistory,
    favorites
  };
}

function hasMeaningfulUserData(saved) {
  if (!saved || typeof saved !== 'object') return false;
  const conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
  const favorites = Array.isArray(saved.favorites) ? saved.favorites : [];
  const history = Array.isArray(saved.queryHistory) ? saved.queryHistory : [];

  // Any favorites or history count as meaningful
  if (favorites.length > 0 || history.length > 0) return true;

  // Multiple conversations is meaningful
  if (conversations.length > 1) return true;

  // Single conversation with queries, prompt, or non-default name is meaningful
  if (conversations.length === 1) {
    const c = conversations[0] || {};
    const hasQueries = Array.isArray(c.queries) && c.queries.length > 0;
    const hasPrompt = typeof c.currentPrompt === 'string' && c.currentPrompt.trim().length > 0;
    const nonDefaultName = typeof c.name === 'string' && c.name !== 'Query Session 1';
    if (hasQueries || hasPrompt || nonDefaultName) return true;
  }

  return false;
}

// Initial state
const initialState = {
  conversations: [
    {
      id: 'default',
      name: 'Query Session 1',
      database: '',
      connectionId: null, // Track which connection this conversation belongs to
      queries: [],
      currentPrompt: '',
      currentGeneratedQuery: '',
      currentResults: null,
      isActive: true,
      createdAt: new Date().toISOString(),
          relevantCollections: [], // List of collections identified as relevant to the current prompt
          collectionSchemas: null, // Schemas for the relevant collections
          summary: '',
          agentState: '',
          errorFixAttempts: 0, // Track how many times we've tried to fix errors
          includeResultsInNextMessage: false, // Flag to include current results in next agent message
          // UI state for persistence across view navigation
          uiState: {
            chatMessages: [],
            inputState: {
              agentValue: '',
              queryValue: '',
              mode: 'agent'
            }
          }
    }
  ],
  activeConversationId: 'default',
  queryHistory: [], // Global query history across all conversations
  favorites: [] // Global favorites list
};

// Action types
const ActionTypes = {
  ADD_CONVERSATION: 'ADD_CONVERSATION',
  SET_ACTIVE_CONVERSATION: 'SET_ACTIVE_CONVERSATION',
  REMOVE_CONVERSATION: 'REMOVE_CONVERSATION',
  UPDATE_CONVERSATION: 'UPDATE_CONVERSATION',
  ADD_QUERY_TO_HISTORY: 'ADD_QUERY_TO_HISTORY',
  REMOVE_FROM_HISTORY: 'REMOVE_FROM_HISTORY',
  UPDATE_CURRENT_PROMPT: 'UPDATE_CURRENT_PROMPT',
  UPDATE_CURRENT_QUERY: 'UPDATE_CURRENT_QUERY',
  UPDATE_CURRENT_RESULTS: 'UPDATE_CURRENT_RESULTS',
  CLEAR_CONVERSATION_QUERIES: 'CLEAR_CONVERSATION_QUERIES',
  RENAME_CONVERSATION: 'RENAME_CONVERSATION',
  SET_CONVERSATION_DATABASE: 'SET_CONVERSATION_DATABASE',
  SET_CONVERSATION_CONNECTION: 'SET_CONVERSATION_CONNECTION',
  LOAD_SAVED_STATE: 'LOAD_SAVED_STATE',
  ADD_TO_FAVORITES: 'ADD_TO_FAVORITES',
  REMOVE_FROM_FAVORITES: 'REMOVE_FROM_FAVORITES',
  SET_RELEVANT_COLLECTIONS: 'SET_RELEVANT_COLLECTIONS',
  SET_COLLECTION_SCHEMAS: 'SET_COLLECTION_SCHEMAS',
  UPDATE_CONVERSATION_UI_STATE: 'UPDATE_CONVERSATION_UI_STATE',
  UPDATE_RECENT_COLLECTIONS: 'UPDATE_RECENT_COLLECTIONS',
  CLEAR_ALL_CONVERSATION_SCHEMAS: 'CLEAR_ALL_CONVERSATION_SCHEMAS'
};

// Reducer function
function queryReducer(state, action) {
  switch (action.type) {
    case ActionTypes.ADD_CONVERSATION: {
      const id = action.payload?.id || `conversation_${Date.now()}`;
      const newConversation = {
        id,
        name: `Session ${state.conversations.length + 1}`,
        database: '',
        connectionId: action.payload?.connectionId || null, // Store which connection this conversation uses
        queries: [],
        currentPrompt: action.payload?.prompt || '',
        currentGeneratedQuery: action.payload?.query || '',
        currentResults: null,
        isActive: false,
        createdAt: new Date().toISOString(),
        relevantCollections: [], // List of collections identified as relevant to the current prompt
        collectionSchemas: null, // Schemas for the relevant collections
        errorFixAttempts: 0,
        includeResultsInNextMessage: false, // Initialize flag for new conversations
        // Initialize UI state for new conversation
        uiState: {
          chatMessages: [],
          inputState: {
            agentValue: '',
            queryValue: '',
            mode: 'agent'
          }
        }
      };
      return {
        ...state,
        conversations: [...state.conversations, newConversation]
      };
    }

    case ActionTypes.SET_ACTIVE_CONVERSATION: {
      return {
        ...state,
        activeConversationId: action.payload,
        conversations: state.conversations.map(conv => ({
          ...conv,
          isActive: conv.id === action.payload
        }))
      };
    }

    case ActionTypes.REMOVE_CONVERSATION: {
      const filteredConversations = state.conversations.filter(conv => conv.id !== action.payload);

      // Always keep at least one conversation to satisfy storage validation
      let conversationsAfterRemoval = filteredConversations;
      let newActiveId = filteredConversations.length > 0 ? filteredConversations[0].id : null;

      if (filteredConversations.length === 0) {
        const id = `conversation_${Date.now()}`;
        const newConv = {
          id,
          name: 'Query Session 1',
          database: '',
          connectionId: null, // No connection assigned yet
          queries: [],
          currentPrompt: '',
          currentGeneratedQuery: '',
          currentResults: null,
          isActive: true,
          createdAt: new Date().toISOString(),
          relevantCollections: [],
          collectionSchemas: null,
          errorFixAttempts: 0,
          includeResultsInNextMessage: false, // Initialize flag
          // Initialize UI state for fallback conversation
          uiState: {
            chatMessages: [],
            inputState: {
              agentValue: '',
              queryValue: '',
              mode: 'agent'
            }
          }
        };
        conversationsAfterRemoval = [newConv];
        newActiveId = id;
      }

      return {
        ...state,
        conversations: conversationsAfterRemoval.map(conv => ({
          ...conv,
          isActive: conv.id === newActiveId
        })),
        activeConversationId: newActiveId
      };
    }

    case ActionTypes.UPDATE_CONVERSATION: {
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.id
            ? { ...conv, ...action.payload.updates }
            : conv
        )
      };
    }

    case ActionTypes.ADD_QUERY_TO_HISTORY: {
      const { conversationId, query } = action.payload;
      
      // Remove results from query before saving to history
      const { results, ...queryWithoutResults } = query;
      const queryWithTimestamp = {
        ...queryWithoutResults,
        id: `query_${Date.now()}`,
        timestamp: new Date().toISOString(),
        conversationId: conversationId // Store conversation ID for lookup
      };

      // Keep only the last 50 queries in history
      const updatedHistory = [...state.queryHistory, queryWithTimestamp].slice(-50);

      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, queries: [...conv.queries, queryWithTimestamp] }
            : conv
        ),
        queryHistory: updatedHistory
      };
    }

    case ActionTypes.REMOVE_FROM_HISTORY: {
      const removeId = action.payload;
      return {
        ...state,
        queryHistory: state.queryHistory.filter((q) => q.id !== removeId),
        conversations: state.conversations.map((conv) => ({
          ...conv,
          queries: Array.isArray(conv.queries) ? conv.queries.filter((q) => q.id !== removeId) : [],
        })),
      };
    }

    case ActionTypes.UPDATE_CURRENT_PROMPT: {
      const { conversationId, prompt } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, currentPrompt: prompt }
            : conv
        )
      };
    }

    case ActionTypes.UPDATE_CURRENT_QUERY: {
      const { conversationId, query } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, currentGeneratedQuery: query || '' }
            : conv
        )
      };
    }

    case ActionTypes.UPDATE_CURRENT_RESULTS: {
      const { conversationId, results } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, currentResults: results }
            : conv
        )
      };
    }

    case ActionTypes.CLEAR_CONVERSATION_QUERIES: {
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload
            ? { 
                ...conv, 
                queries: [], 
                currentPrompt: '',
                currentGeneratedQuery: '',
                currentResults: null
              }
            : conv
        )
      };
    }

    case ActionTypes.RENAME_CONVERSATION: {
      const { conversationId, name } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, name }
            : conv
        )
      };
    }

    case ActionTypes.SET_CONVERSATION_DATABASE: {
      const { conversationId, database } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, database }
            : conv
        )
      };
    }

    case ActionTypes.SET_CONVERSATION_CONNECTION: {
      const { conversationId, connectionId } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, connectionId }
            : conv
        )
      };
    }

    case ActionTypes.ADD_TO_FAVORITES: {
      const query = action.payload;
      const isAlreadyFavorite = state.favorites.some(fav => fav.id === query.id);
      if (isAlreadyFavorite) return state;
      
      return {
        ...state,
        favorites: [...state.favorites, { ...query, addedToFavoritesAt: new Date().toISOString() }]
      };
    }

    case ActionTypes.REMOVE_FROM_FAVORITES: {
      return {
        ...state,
        favorites: state.favorites.filter(query => query.id !== action.payload)
      };
    }

    case ActionTypes.LOAD_SAVED_STATE: {
      const { conversations, activeConversationId, queryHistory, favorites } = action.payload;
      
      // If we have saved conversations, use them; otherwise keep initial state
      if (conversations && conversations.length > 0) {
        // Clean up conversations: remove currentResults and normalize query fields (migration)
        const cleanedConversations = conversations.map(conv => {
          const { currentResults, ...cleanConv } = conv;
          const normalizedQueries = (conv.queries || []).map(q => {
            const { results, ...cleanQuery } = q || {};
            // Normalize legacy `query` -> `generatedQuery`
            if (!cleanQuery.generatedQuery && typeof cleanQuery.query === 'string') {
              cleanQuery.generatedQuery = cleanQuery.query;
            }
            return cleanQuery;
          });

        return {
            ...cleanConv,
            currentResults: null, // Reset current results on load
            currentGeneratedQuery: conv.currentGeneratedQuery || conv.query || '', // Ensure it's always a string; migrate legacy `query`
            queries: normalizedQueries,
            includeResultsInNextMessage: false, // Initialize flag for loaded conversations
            // Migration: Add connectionId if it doesn't exist
            connectionId: conv.connectionId !== undefined ? conv.connectionId : null,
            // Ensure UI state exists (for migration from old conversations)
            uiState: conv.uiState ? {
              chatMessages: Array.isArray(conv.uiState.chatMessages) ? conv.uiState.chatMessages : [],
              inputState: conv.uiState.inputState ? {
                agentValue: conv.uiState.inputState.agentValue || '',
                queryValue: conv.uiState.inputState.queryValue || '',
                mode: conv.uiState.inputState.mode || 'agent'
              } : {
                agentValue: '',
                queryValue: '',
                mode: 'agent'
              }
            } : {
              chatMessages: [],
              inputState: {
                agentValue: '',
                queryValue: '',
                mode: 'agent'
              }
            }
          };
        });

        // Clean up queryHistory: remove results if they exist (migration)
        const cleanedHistory = (queryHistory || []).map(q => {
          const { results, ...cleanQuery } = q || {};
          if (!cleanQuery.generatedQuery && typeof cleanQuery.query === 'string') {
            cleanQuery.generatedQuery = cleanQuery.query;
          }
          return cleanQuery;
        }).slice(-50);

        // Normalize favorites (migration)
        const normalizedFavorites = (favorites || []).map(f => {
          const fav = { ...(f || {}) };
          if (!fav.generatedQuery && typeof fav.query === 'string') {
            fav.generatedQuery = fav.query;
          }
          return fav;
        });

        // Ensure activeConversationId is valid - fix mismatch between conv- and conversation_ prefixes
        let validActiveConversationId = activeConversationId;
        
        // Check if the saved activeConversationId exists in the cleaned conversations
        const activeExists = cleanedConversations.some(conv => conv.id === activeConversationId);
        if (!activeExists) {
          // If not, try to find a similar ID with different prefix (conv- vs conversation_)
          if (activeConversationId && activeConversationId.startsWith('conv-')) {
            const timestamp = activeConversationId.replace('conv-', '');
            const alternativeId = `conversation_${timestamp}`;
            const alternativeExists = cleanedConversations.some(conv => conv.id === alternativeId);
            if (alternativeExists) {
              validActiveConversationId = alternativeId;
            } else {
              validActiveConversationId = cleanedConversations[0]?.id || state.activeConversationId;
            }
          } else {
            validActiveConversationId = cleanedConversations[0]?.id || state.activeConversationId;
          }
        }

        return {
          ...state,
          conversations: cleanedConversations,
          activeConversationId: validActiveConversationId,
          queryHistory: cleanedHistory,
          favorites: normalizedFavorites
        };
      }
      
      return state;
    }

    case ActionTypes.SET_RELEVANT_COLLECTIONS: {
      const { conversationId, collections } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, relevantCollections: collections }
            : conv
        )
      };
    }

    case ActionTypes.SET_COLLECTION_SCHEMAS: {
      const { conversationId, schemas } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, collectionSchemas: schemas }
            : conv
        )
      };
    }

    case ActionTypes.CLEAR_ALL_CONVERSATION_SCHEMAS: {
      return {
        ...state,
        conversations: state.conversations.map(conv => ({
          ...conv,
          collectionSchemas: null
        }))
      };
    }

    case ActionTypes.UPDATE_CONVERSATION_UI_STATE: {
      const { conversationId, uiState } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, uiState: { ...conv.uiState, ...uiState } }
            : conv
        )
      };
    }

    case ActionTypes.UPDATE_RECENT_COLLECTIONS: {
      const { conversationId, collections } = action.payload;
      return {
        ...state,
        conversations: state.conversations.map(conv => {
          if (conv.id === conversationId) {
            // Keep track of last 5 recently used collections
            const existing = conv.recentCollections || [];
            const updated = [...collections, ...existing.filter(c => !collections.includes(c))];
            return {
              ...conv,
              recentCollections: updated.slice(0, 5)
            };
          }
          return conv;
        })
      };
    }

    default:
      return state;
  }
}

// Create context
const QueryContext = createContext();

// Context provider component
export function QueryProvider({ children }) {
  const [state, dispatch] = useReducer(queryReducer, initialState);
  const [settings, setSettings] = useState(getDefaultSettings());
  
  // Get database context for schema generation status
  let databaseContext = null;
  try {
    databaseContext = useDatabase();
  } catch (error) {
    // DatabaseContext not available in this scope
    console.warn('DatabaseContext not available in QueryProvider');
  }
  
  // Load settings on startup
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await window.electronAPI?.storage?.loadSettings();
        if (result?.success && result.settings) {
          setSettings(prevSettings => ({
            ...prevSettings,
            ...result.settings
          }));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  // Load saved conversations, history, and favorites on startup
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        // Prefer Electron storage if available
        if (window.electronAPI?.storage?.loadConversations) {
          const result = await window.electronAPI.storage.loadConversations();
          if (isMounted && result?.success && result?.conversations) {
            const electronData = result.conversations;

            // If Electron storage looks empty/default, try localStorage fallback
            if (!hasMeaningfulUserData(electronData)) {
              try {
                const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
                if (raw) {
                  const parsed = JSON.parse(raw);
                  if (parsed && typeof parsed === 'object' && hasMeaningfulUserData(parsed)) {
                    // Use richer local snapshot
                    dispatch({ type: ActionTypes.LOAD_SAVED_STATE, payload: parsed });
                    // Best-effort sync back to Electron
                    try {
                      await window.electronAPI.storage.saveConversations(parsed);
                    } catch (_) {}
                    return;
                  }
                }
              } catch (lsErr) {
                console.warn('Local fallback load failed:', lsErr);
              }
            }

            // Use Electron-provided data
            dispatch({ type: ActionTypes.LOAD_SAVED_STATE, payload: electronData });
            return;
          }
        }

        // Fallback: load from localStorage if Electron is unavailable or failed
        try {
          const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              dispatch({ type: ActionTypes.LOAD_SAVED_STATE, payload: parsed });
            }
          }
        } catch (lsErr) {
          console.warn('Local fallback load failed:', lsErr);
        }
      } catch (error) {
        console.error('Failed to load conversations from storage:', error);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Persist conversations, history, and favorites on change
  useEffect(() => {
    // PERFORMANCE FIX: Debounce saves to prevent constant storage writes during typing
    const saveTimeout = setTimeout(() => {
      (async () => {
        try {
          const snapshot = buildPersistableSnapshot(state);

          // Always keep a browser fallback cache for dev/browser use
          try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
          } catch (lsErr) {
            console.warn('Local fallback save failed:', lsErr);
          }

          // Primary persistence through Electron when available
          if (window.electronAPI?.storage?.saveConversations) {
            await window.electronAPI.storage.saveConversations(snapshot);
          }
        } catch (error) {
          console.error('Failed to save conversations to storage:', error);
        }
      })();
    }, 2000); // Save after 2 seconds of inactivity
    
    return () => clearTimeout(saveTimeout);
  }, [state.conversations, state.activeConversationId, state.queryHistory, state.favorites]);

  // Helper functions for error fix logic following cursor rules
  const shouldAttemptErrorFix = (conversationId) => {
    const conversation = state.conversations.find(c => c.id === conversationId);
    return conversation && conversation.errorFixAttempts < 1;
  };

  const incrementErrorFixAttempts = (conversationId) => {
    dispatch({
      type: ActionTypes.UPDATE_CONVERSATION,
      payload: {
        id: conversationId,
        updates: { errorFixAttempts: (state.conversations.find(c => c.id === conversationId)?.errorFixAttempts || 0) + 1 }
      }
    });
  };

  const resetErrorFixAttempts = (conversationId) => {
    dispatch({
      type: ActionTypes.UPDATE_CONVERSATION,
      payload: {
        id: conversationId,
        updates: { errorFixAttempts: 0 }
      }
    });
  };

  const createOptimizationMessage = (errorMessage) => {
    const suggestions = [];
    
    // Parse error message and suggest optimizations
    const errorLower = errorMessage.toLowerCase();
    
    if (errorLower.includes('index') || errorLower.includes('scan') || errorLower.includes('slow')) {
      suggestions.push('• Consider adding an index on the queried fields');
      suggestions.push('• Use compound indexes for multi-field queries');
    }
    
    if (errorLower.includes('timeout') || errorLower.includes('time limit')) {
      suggestions.push('• Add a limit() clause to reduce result set size');
      suggestions.push('• Use pagination with skip() and limit()');
      suggestions.push('• Consider using aggregation with $match early in pipeline');
    }
    
    if (errorLower.includes('memory') || errorLower.includes('sort')) {
      suggestions.push('• Use indexes to support sorting operations');
      suggestions.push('• Reduce the number of documents being sorted');
      suggestions.push('• Consider using aggregation with $sort after $match');
    }
    
    if (errorLower.includes('collection') || errorLower.includes('namespace')) {
      suggestions.push('• Verify the collection name is correct');
      suggestions.push('• Check if you\'re connected to the right database');
    }
    
    if (errorLower.includes('syntax') || errorLower.includes('parse')) {
      suggestions.push('• Check MongoDB query syntax documentation');
      suggestions.push('• Verify proper use of operators and brackets');
    }
    
    // Default suggestions if no specific patterns found
    if (suggestions.length === 0) {
      suggestions.push('• Review your query syntax and structure');
      suggestions.push('• Consider adding appropriate indexes');
      suggestions.push('• Try limiting the result set size');
    }
    
    return `❌ I couldn't fix this error automatically. Here are some optimization suggestions:

${suggestions.join('\n')}

📖 For more help, check the MongoDB documentation or consider:
• Using explain() to analyze query performance
• Checking database logs for additional details
• Testing with a smaller dataset first`;
  };

  // Action creators - memoized to prevent context value recreation
  const actions = useMemo(() => {
    return {
      openConversation: ({ database, prompt = '', generatedQuery = '', conversationCount } = {}) => {
      const id = `conversation_${Date.now()}`;
      dispatch({ type: ActionTypes.ADD_CONVERSATION, payload: { id, prompt, query: generatedQuery } });
      dispatch({ type: ActionTypes.SET_ACTIVE_CONVERSATION, payload: id });
      if (database) {
        dispatch({ type: ActionTypes.SET_CONVERSATION_DATABASE, payload: { conversationId: id, database } });
      }
      // Name the tab with database if provided
      const name = database ? `${database} (${id})` : `Session ${conversationCount || 1}`;
      dispatch({ type: ActionTypes.RENAME_CONVERSATION, payload: { conversationId: id, name } });
      return id;
    },
    // Agent: stateless decide call
    agentDecide: async (conversationId, userInput, database, allowWrites, relevantSchemas, lastMessages, relevantIndexes, conversation, defaultLimit, databaseType = 'mongodb', pgMetadata = null) => {
      try {
        const summary = conversation?.summary || '';
        const agentState = conversation?.agentState || '';
        
        // Sample and include query results if requested
        let queryResults = null;
        const currentConv = state.conversations.find(c => c.id === conversationId);
        
        console.log('🔍 Checking if results should be included:', {
          conversationId,
          hasConv: !!currentConv,
          includeFlag: currentConv?.includeResultsInNextMessage,
          currentResults: currentConv?.currentResults,
          hasDocuments: !!currentConv?.currentResults?.documents,
          documentsCount: currentConv?.currentResults?.documents?.length,
          resultsKeys: currentConv?.currentResults ? Object.keys(currentConv.currentResults) : []
        });
        
        if (currentConv?.includeResultsInNextMessage && currentConv?.currentResults?.documents) {
          const sampled = sampleResults(currentConv.currentResults.documents);
          if (sampled.total_count > 0) {
            queryResults = sampled;
            console.log('✅ Including query results in agent context', {
              totalCount: sampled.total_count,
              sampled: sampled.sampled,
              tokenCount: sampled.token_count,
              sampleInfo: sampled.sample_info
            });
          }
        }
        
        // Build knowledge object, including PostgreSQL metadata if available
        const knowledge = { 
          collection_schemas: relevantSchemas || null, 
          collection_indexes: relevantIndexes || null,
          pg_metadata: pgMetadata || null // PostgreSQL: views, functions, enum types
        };
        if (queryResults) {
          knowledge.query_results = queryResults;
          console.log('📦 Added query_results to knowledge object');
        }
        
        console.log('🚀 Sending agent request with:', {
          databaseType,
          hasQueryResults: !!knowledge.query_results,
          queryResultsCount: knowledge.query_results?.total_count,
          querySampled: knowledge.query_results?.sampled,
          hasPgMetadata: !!pgMetadata,
          pgViews: pgMetadata ? Object.keys(pgMetadata.views || {}).length : 0,
          pgFunctions: pgMetadata?.functions?.length || 0,
          pgEnumTypes: pgMetadata ? Object.keys(pgMetadata.enumTypes || {}).length : 0
        });
        
        const res = await httpClient.agentRequest('/decide', {
          method: 'POST',
          body: {
            session_id: conversationId,
            user_input: userInput,
            type: databaseType, // Required: 'mongodb' or 'postgresql'
            conversation: { summary, last_messages: Array.isArray(lastMessages) ? lastMessages : [] },
            app_context: { database, allow_writes: Boolean(allowWrites ?? true), default_limit: defaultLimit },
            knowledge,
            agent_state: agentState,
            client_info: { capabilities: ['run_query_locally'] }
          }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Agent request failed');
        if (data && (data.success === false || data.error)) {
          throw new Error(data.error || 'Agent reported failure');
        }

        // Store summary and agent state, and clear the include results flag
        actions.updateConversation(conversationId, {
          summary: data?.conversation?.summary || summary,
          agentState: data?.agent_state || agentState,
          currentGeneratedQuery: data?.query?.text || '',
          includeResultsInNextMessage: false // Clear flag after use
        });

        return data;
      } catch (err) {
        console.error('Agent decide failed:', err);
        
        return { success: false, error: err?.message || 'Agent decide failed' };
      }
    },

    // Agent: report local execution error for repair suggestions using agent/decide
    agentFixError: async (conversationId, failedQuery, errorMessage, database, relevantSchemas, lastMessages, relevantIndexes, conversation, defaultLimit, databaseType = 'mongodb', pgMetadata = null) => {
      try {
        // Format the error as a user message to the agent
        const errorUserInput = `The query "${failedQuery}" failed with error: ${errorMessage}. Please fix this query.`;
        
        const result = await actions.agentDecide(
          conversationId, 
          errorUserInput, 
          database, 
          true, // allow writes
          relevantSchemas, 
          lastMessages, 
          relevantIndexes,
          conversation,
          defaultLimit,
          databaseType,
          pgMetadata
        );
        
        return result;
      } catch (err) {
        console.error('Agent fix error failed:', err);
        return { success: false, error: err?.message || 'Agent fix error failed' };
      }
    },
    addConversation: (id, prompt, query, connectionId = null) => 
      dispatch({ type: ActionTypes.ADD_CONVERSATION, payload: { id, prompt, query, connectionId } }),

    setActiveConversation: (conversationId) => 
      dispatch({ type: ActionTypes.SET_ACTIVE_CONVERSATION, payload: conversationId }),

    removeConversation: (conversationId) => 
      dispatch({ type: ActionTypes.REMOVE_CONVERSATION, payload: conversationId }),

    updateConversation: (conversationId, updates) => 
      dispatch({ 
        type: ActionTypes.UPDATE_CONVERSATION, 
        payload: { id: conversationId, updates } 
      }),

    addQueryToHistory: (conversationId, query) => 
      dispatch({ 
        type: ActionTypes.ADD_QUERY_TO_HISTORY, 
        payload: { conversationId, query } 
      }),

    removeFromHistory: (queryId) =>
      dispatch({
        type: ActionTypes.REMOVE_FROM_HISTORY,
        payload: queryId,
      }),

    updateCurrentPrompt: (conversationId, prompt) => 
      dispatch({ 
        type: ActionTypes.UPDATE_CURRENT_PROMPT, 
        payload: { conversationId, prompt } 
      }),

    updateCurrentQuery: (conversationId, query) => 
      dispatch({ 
        type: ActionTypes.UPDATE_CURRENT_QUERY, 
        payload: { conversationId, query } 
      }),

    updateCurrentResults: (conversationId, results) => 
      dispatch({ 
        type: ActionTypes.UPDATE_CURRENT_RESULTS, 
        payload: { conversationId, results } 
      }),

    clearConversationQueries: (conversationId) => 
      dispatch({ type: ActionTypes.CLEAR_CONVERSATION_QUERIES, payload: conversationId }),

    renameConversation: (conversationId, name) => 
      dispatch({ 
        type: ActionTypes.RENAME_CONVERSATION, 
        payload: { conversationId, name } 
      }),

    setConversationDatabase: (conversationId, database) => 
      dispatch({ 
        type: ActionTypes.SET_CONVERSATION_DATABASE, 
        payload: { conversationId, database } 
      }),

    setConversationConnection: (conversationId, connectionId) => 
      dispatch({ 
        type: ActionTypes.SET_CONVERSATION_CONNECTION, 
        payload: { conversationId, connectionId } 
      }),

    addToFavorites: (query) =>
      dispatch({
        type: ActionTypes.ADD_TO_FAVORITES,
        payload: query
      }),

    removeFromFavorites: (queryId) =>
      dispatch({
        type: ActionTypes.REMOVE_FROM_FAVORITES,
        payload: queryId
      }),

    setRelevantCollections: (conversationId, collections) =>
      dispatch({
        type: ActionTypes.SET_RELEVANT_COLLECTIONS,
        payload: { conversationId, collections }
      }),

    setCollectionSchemas: (conversationId, schemas) =>
      dispatch({
        type: ActionTypes.SET_COLLECTION_SCHEMAS,
        payload: { conversationId, schemas }
      }),

    clearAllConversationSchemas: () =>
      dispatch({
        type: ActionTypes.CLEAR_ALL_CONVERSATION_SCHEMAS
      }),

    updateConversationUIState: (conversationId, uiState) =>
      dispatch({
        type: ActionTypes.UPDATE_CONVERSATION_UI_STATE,
        payload: { conversationId, uiState }
      }),

    toggleIncludeResults: (conversationId, include) =>
      dispatch({
        type: ActionTypes.UPDATE_CONVERSATION,
        payload: { id: conversationId, updates: { includeResultsInNextMessage: include } }
      }),

    // NEW: Agent-first flow. Always start with agent decide
    agentStart: async (conversationId, userInput, database, connectionId, lastMessages = [], conversation, defaultLimit) => {
      try {
        // Get updateSchemaGenStatus from DatabaseContext if available
        const updateSchemaGenStatus = databaseContext?.updateSchemaGenStatus;
        
        // 1) Ensure relevant schemas exist locally
        const schemasResult = await window.electronAPI.storage.loadCollectionSchemas(database);
        let schemas = schemasResult.success ? schemasResult.schemas : null;

        // Check if indexing has completed (even if schemas are empty - means no tables exist)
        const schemaGenStatus = databaseContext?.schemaGenStatus?.[database];
        const indexingComplete = schemaGenStatus?.canQueryNow || schemaGenStatus?.isComplete;
        const isIndexing = schemaGenStatus?.isGenerating;

        // If no schemas or they're empty, check if indexing has completed
        // (DatabaseContext.selectDatabase auto-generates schemas)
        if (!schemas || Object.keys(schemas).length === 0) {
          if (indexingComplete) {
            // Indexing completed but no tables found - this is valid (empty database)
            console.log('ℹ️ Indexing completed but no tables/collections found in database. Proceeding with empty schemas.');
            schemas = {}; // Use empty schemas object
          } else if (isIndexing) {
            // Still indexing - wait for it to complete
            console.warn('⚠️ No schemas available yet. Database is still indexing.');
            throw new Error('Database schemas not ready. Please wait for indexing to complete.');
          } else {
            // Not indexing and no schemas - indexing may not have started yet
          console.warn('⚠️ No schemas available yet. Database may still be indexing.');
          throw new Error('Database schemas not ready. Please wait for indexing to complete.');
          }
        }

        // Extract schema and indexes for each collection
        const allSchemas = {};
        const allIndexes = {};
        Object.entries(schemas).forEach(([collName, info]) => {
          if (info && info.schema) {
            // Include schema structure with field descriptions for AI context
            allSchemas[collName] = {
              schema: info.schema,
              fieldDescriptions: info.fieldDescriptions || []
            };
            if (Array.isArray(info.indexes)) {
              allIndexes[collName] = info.indexes;
            }
          }
        });

        // 2) Load metadata (should already exist from DatabaseContext.generateCollectionIndex)
        let metadata = schemasResult.metadata;

        // 3) NEW: Token checking and smart collection selection
        let schemasToSend = allSchemas;
        let indexesToSend = allIndexes;
        
        const tokenCounter = new TokenCounter('gpt-4');
        
        try {
          if (tokenCounter.exceedsTokenBudget(allSchemas, 10000)) {
            console.log('⚠️ Schemas exceed 10K token budget, using smart selection...');
            
            // Get recent collections from conversation context
            const recentCollections = conversation?.recentCollections || [];
            
            // Call backend to select relevant collections
            if (metadata) {
              const backendUrl = localStorage.getItem('backend-url') || 
                                (typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__ : 'http://localhost:8787');
              const selectionResponse = await httpClient.request(`${backendUrl}/api/v1/metadata/select-collections`, {
                method: 'POST',
                body: {
                  userQuery: userInput,
                  metadata: metadata,
                  recentCollections: recentCollections
                }
              });
              
              const selectionData = await selectionResponse.json();
              
              if (selectionData && selectionData.success) {
                const selectedCollections = selectionData.selected;
                console.log(`✅ Selected ${selectedCollections.length} collections:`, selectedCollections);
                console.log(`📝 Selection reasoning: ${selectionData.reasoning}`);
                
                // Filter schemas to only selected collections
                schemasToSend = Object.fromEntries(
                  Object.entries(allSchemas).filter(([name]) => selectedCollections.includes(name))
                );
                
                // Filter indexes to only selected collections
                indexesToSend = Object.fromEntries(
                  Object.entries(allIndexes).filter(([name]) => selectedCollections.includes(name))
                );
                
                console.log(`📊 Sending ${Object.keys(schemasToSend).length} collections to agent`);
              } else {
                console.warn('⚠️ Collection selection failed, sending all schemas');
              }
            } else {
              console.warn('⚠️ No metadata available, sending all schemas despite token budget');
            }
          } else {
            console.log(`✅ Schemas within token budget (${tokenCounter.estimateSchemaTokens(allSchemas)} tokens), sending all`);
          }
        } finally {
          tokenCounter.cleanup();
        }

        // 4) Start with agent decide (with filtered or all schemas)
        // Get database type for the connection
        const databaseType = databaseContext?.getConnectionDatabaseType?.(connectionId) || 'mongodb';
        // Get PostgreSQL metadata (views, functions, enum types) if available
        const pgMetadata = databaseContext?.pgMetadata?.[database] || schemasResult.metadata || null;
        
        const decide = await actions.agentDecide(conversationId, userInput, database, true, schemasToSend, lastMessages, indexesToSend, conversation, defaultLimit, databaseType, pgMetadata);
        
        // 5) NEW: Track which collections were used for next time
        if (decide.success && decide.response) {
          const usedCollections = actions.extractUsedCollections(decide.response);
          if (usedCollections.length > 0) {
            dispatch({
              type: ActionTypes.UPDATE_RECENT_COLLECTIONS,
              payload: { conversationId, collections: usedCollections }
            });
          }
        }
        
        return decide;
      } catch (error) {
        console.error('Error in agentStart:', error);
        return { success: false, error: error.message };
      }
    },

    // Helper to extract collection names from agent response
    extractUsedCollections: (agentResponse) => {
      const collections = new Set();
      
      // Extract from query if present
      if (agentResponse.query) {
        const collectionMatches = agentResponse.query.match(/db\.(\w+)\./g);
        if (collectionMatches) {
          collectionMatches.forEach(match => {
            const collName = match.replace('db.', '').replace('.', '');
            collections.add(collName);
          });
        }
      }
      
      // Extract from collection field if present
      if (agentResponse.collection) {
        collections.add(agentResponse.collection);
      }
      
      return Array.from(collections);
    }
  };
  }, [dispatch, databaseContext, state]);

  // Computed values
  const activeConversation = useMemo(() => {
    return state.conversations.find(conv => conv.id === state.activeConversationId);
  }, [state.conversations, state.activeConversationId]);
  
  // Settings management functions
  const reloadSettings = async () => {
    try {
      const result = await window.electronAPI?.storage?.loadSettings();
      if (result?.success && result.settings) {
        setSettings(prevSettings => ({
          ...prevSettings,
          ...result.settings
        }));
        return { success: true, settings: result.settings };
      }
      return { success: false, error: 'Failed to load settings' };
    } catch (error) {
      console.error('Error reloading settings:', error);
      return { success: false, error: error.message };
    }
  };

  const updateSettings = async (newSettings) => {
    try {
      await window.electronAPI?.storage?.saveSettings(newSettings);
      setSettings(prevSettings => ({
        ...prevSettings,
        ...newSettings
      }));
      return { success: true };
    } catch (error) {
      console.error('Error updating settings:', error);
      return { success: false, error: error.message };
    }
  };

  // Context value - memoized to prevent unnecessary re-renders
  const contextValue = useMemo(() => {
    
    return {
      ...state,
      ...actions,
      activeConversation,
      settings,
      reloadSettings,
      updateSettings,
      shouldAttemptErrorFix,
      incrementErrorFixAttempts,
      resetErrorFixAttempts,
      createOptimizationMessage
    };
  }, [
    state,
    actions,
    activeConversation,
    settings,
    reloadSettings,
    updateSettings,
    shouldAttemptErrorFix,
    incrementErrorFixAttempts,
    resetErrorFixAttempts,
    createOptimizationMessage
  ]);

  return (
    <QueryContext.Provider value={contextValue}>
      {children}
    </QueryContext.Provider>
  );
}

// Custom hook to use the context
export function useQuery() {
  const context = useContext(QueryContext);
  if (!context) {
    throw new Error('useQuery must be used within a QueryProvider');
  }
  return context;
}

export default QueryContext;