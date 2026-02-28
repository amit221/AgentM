import React, { createContext, useContext, useReducer, useEffect, useMemo, useRef } from 'react';
import { generateConnectionDisplayName } from '../utils/connectionUtils';

// Helper function to format connection name from connection string
// Now uses the centralized utility that supports MongoDB, PostgreSQL, and Supabase
function formatConnectionNameFromString(connectionString) {
  return generateConnectionDisplayName(connectionString);
}

// Initial state
const initialState = {
  connections: {}, // Map of connection IDs to connection states
  activeConnections: [], // List of active connection IDs
  savedConnections: [], // List of saved connection objects {id, name, connectionString}
  collections: {},  // Map of database name to array of collections
  selectedDatabase: null, // Currently selected database
  isLoading: false,
  connectionError: null, // Error message from last connection attempt
  collectionSchemas: {}, // Map of database name to collection schemas
  pgMetadata: {}, // Map of database name to PostgreSQL metadata (views, functions, enum types)
  schemaLastUpdated: {}, // Map of database name to last schema update timestamp
  // NEW: Schema generation progress state (per-database)
  schemaGenStatus: {} // Map of database name to generation status
};

// Action types
const ActionTypes = {
  ADD_CONNECTION: 'ADD_CONNECTION',
  REMOVE_CONNECTION: 'REMOVE_CONNECTION',
  UPDATE_CONNECTION: 'UPDATE_CONNECTION',
  SET_COLLECTIONS: 'SET_COLLECTIONS',
  SET_LOADING: 'SET_LOADING',
  SET_CONNECTION_ERROR: 'SET_CONNECTION_ERROR',
  SET_SAVED_CONNECTIONS: 'SET_SAVED_CONNECTIONS',
  ADD_SAVED_CONNECTION: 'ADD_SAVED_CONNECTION',
  UPDATE_SAVED_CONNECTION: 'UPDATE_SAVED_CONNECTION',
  REMOVE_SAVED_CONNECTION: 'REMOVE_SAVED_CONNECTION',
  SET_SELECTED_DATABASE: 'SET_SELECTED_DATABASE',
  SET_COLLECTION_SCHEMAS: 'SET_COLLECTION_SCHEMAS',
  UPDATE_SCHEMA_TIMESTAMP: 'UPDATE_SCHEMA_TIMESTAMP',
  UPDATE_SCHEMA_GEN_STATUS: 'UPDATE_SCHEMA_GEN_STATUS'
};

// Reducer function
function databaseReducer(state, action) {
  switch (action.type) {
    case ActionTypes.ADD_CONNECTION:
      return {
        ...state,
        connections: {
          ...state.connections,
          [action.payload.id]: action.payload.connection
        },
        activeConnections: [...state.activeConnections, action.payload.id]
      };
    case ActionTypes.REMOVE_CONNECTION:
      const { [action.payload]: removedConnection, ...remainingConnections } = state.connections;
      return {
        ...state,
        connections: remainingConnections,
        activeConnections: state.activeConnections.filter(id => id !== action.payload)
      };
    case ActionTypes.UPDATE_CONNECTION:
      return {
        ...state,
        connections: {
          ...state.connections,
          [action.payload.id]: {
            ...state.connections[action.payload.id],
            ...action.payload.updates
          }
        }
      };
    case ActionTypes.SET_COLLECTIONS:
      return {
        ...state,
        collections: {
          ...state.collections,
          [action.payload.database]: action.payload.collections ? action.payload.collections.sort((a, b) => a.localeCompare(b)) : null
        }
      };
    case ActionTypes.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case ActionTypes.SET_CONNECTION_ERROR:
      return { ...state, connectionError: action.payload };
    case ActionTypes.SET_SAVED_CONNECTIONS:
      // Ensure all connections have proper structure and remove duplicates
      const normalizedConnections = action.payload.map(conn => {
        if (typeof conn === 'string') {
          // Handle legacy string format
          return {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: formatConnectionNameFromString(conn),
            connectionString: conn
          };
        }
        return conn;
      });
      
      // Remove duplicates by connection string and sort by name
      const uniqueConnections = normalizedConnections.filter((conn, index, self) => 
        index === self.findIndex(c => c.connectionString === conn.connectionString)
      ).sort((a, b) => a.name.localeCompare(b.name));
      
      return { ...state, savedConnections: uniqueConnections };
      
    case ActionTypes.ADD_SAVED_CONNECTION:
      // Validate that name is provided
      if (!action.payload.name || !action.payload.name.trim()) {
        console.error('Cannot add connection without a name:', action.payload);
        return state;
      }
      
      // Only add if connection string doesn't already exist
      const existingConn = state.savedConnections.find(conn => conn.connectionString === action.payload.connectionString);
      if (!existingConn) {
        const newConnection = {
          id: action.payload.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: action.payload.name.trim(),
          connectionString: action.payload.connectionString,
          lastUsed: action.payload.lastUsed || new Date().toISOString()
        };
        return {
          ...state,
          savedConnections: [...state.savedConnections, newConnection].sort((a, b) => a.name.localeCompare(b.name))
        };
      } else {
        // Update existing connection with ALL new fields (not just lastUsed)
        const updatedConnections = state.savedConnections.map(conn => 
          conn.connectionString === action.payload.connectionString 
            ? { 
                ...conn, 
                ...action.payload,
                id: conn.id, // Keep original ID
                lastUsed: action.payload.lastUsed || new Date().toISOString() 
              }
            : conn
        ).sort((a, b) => a.name.localeCompare(b.name));
        return {
          ...state,
          savedConnections: updatedConnections
        };
      }
      
    case ActionTypes.UPDATE_SAVED_CONNECTION:
      // Update an existing saved connection by ID
      const updatedConnections = state.savedConnections.map(conn => 
        conn.id === action.payload.id 
          ? { ...conn, ...action.payload.updates, lastModified: new Date().toISOString() }
          : conn
      ).sort((a, b) => a.name.localeCompare(b.name));
      
      return {
        ...state,
        savedConnections: updatedConnections
      };
      
    case ActionTypes.REMOVE_SAVED_CONNECTION:
      return {
        ...state,
        savedConnections: state.savedConnections.filter(conn => conn.id !== action.payload)
      };
    case ActionTypes.SET_SELECTED_DATABASE:
      return {
        ...state,
        selectedDatabase: action.payload
      };
    case ActionTypes.SET_COLLECTION_SCHEMAS:
      return {
        ...state,
        collectionSchemas: {
          ...state.collectionSchemas,
          [action.payload.database]: action.payload.schemas
        },
        // Store PostgreSQL metadata (views, functions, enum types) separately
        pgMetadata: {
          ...state.pgMetadata,
          [action.payload.database]: action.payload.metadata || null
        }
      };
    case ActionTypes.UPDATE_SCHEMA_TIMESTAMP:
      return {
        ...state,
        schemaLastUpdated: {
          ...state.schemaLastUpdated,
          [action.payload.database]: action.payload.timestamp
        }
      };
    case ActionTypes.UPDATE_SCHEMA_GEN_STATUS:
      // action.payload should have { database, status }
      const { database: dbName, status } = action.payload;
      return {
        ...state,
        schemaGenStatus: {
          ...state.schemaGenStatus,
          [dbName]: {
            ...(state.schemaGenStatus[dbName] || {}),
            ...status
          }
        }
      };
    case 'CLEAR_ALL_SCHEMAS':
      return {
        ...state,
        collectionSchemas: {},
        schemaLastUpdated: {}
      };
    default:
      return state;
  }
}

// Create context
const DatabaseContext = createContext(null);

// Context provider component
export function DatabaseProvider({ children }) {
  const [state, dispatch] = useReducer(databaseReducer, initialState);
  
  // Keep a ref to current state for actions to access
  const stateRef = useRef(state);
  stateRef.current = state;

  // Track databases currently being indexed (prevent concurrent generation)
  const generatingDatabasesRef = useRef(new Set());

  // Listen for progress updates from Electron
  useEffect(() => {
    const handleProgressUpdate = (progressData) => {
      const isComplete = progressData.isComplete || progressData.progress >= 100;
      
      // progressData should include database name
      const database = progressData.database;
      
      if (!database) {
        console.warn('Progress update missing database name:', progressData);
        return;
      }
      
      // Keep isGenerating true when complete so component can show "All done!" message
      // The component will auto-hide after 3 seconds
      dispatch({
        type: ActionTypes.UPDATE_SCHEMA_GEN_STATUS,
        payload: {
          database,
          status: {
            isGenerating: true, // Always true so component keeps showing
            currentPhase: isComplete ? 'complete' : 'schemas',
            progress: progressData.progress,
            message: progressData.message,
            collectionsProcessed: progressData.collectionsProcessed,
            collectionsTotal: progressData.collectionsTotal,
            estimatedTimeRemaining: progressData.estimatedTimeRemaining,
            isComplete: progressData.isComplete,
            canQueryNow: isComplete
          }
        }
      });
    };

    // Add listener via window.electronAPI
    if (window.electronAPI && window.electronAPI.database && window.electronAPI.database.onSchemaGenerationProgress) {
      const unsubscribe = window.electronAPI.database.onSchemaGenerationProgress(handleProgressUpdate);
      return unsubscribe;
    }
  }, []);

  // Load saved connections on mount
  useEffect(() => {
    const loadSavedConnections = async () => {
      try {
        const result = await window.electronAPI.storage.loadConnectionState();
        
        if (result.success && result.connectionState) {
          const { savedConnections = [] } = result.connectionState;
          
          // Handle both old string format and new object format
          const processedConnections = savedConnections.map(conn => {
            if (typeof conn === 'string') {
              // Legacy format - convert to new format with auto-generated name
              return {
                id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: formatConnectionNameFromString(conn.trim()) || 'Legacy Connection',
                connectionString: conn.trim()
              };
            } else if (conn && conn.connectionString) {
              // New format - ensure it has all required fields
              return {
                id: conn.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: conn.name || formatConnectionNameFromString(conn.connectionString) || 'Unnamed Connection',
                connectionString: conn.connectionString
              };
            }
            return null;
          }).filter(Boolean);
          
          dispatch({ type: ActionTypes.SET_SAVED_CONNECTIONS, payload: processedConnections });
        }
      } catch (error) {
        console.warn('Failed to load saved connections:', error);
      }
    };

    loadSavedConnections();
  }, []);

  // Save connection state when it changes
  useEffect(() => {
    const saveConnectionState = async () => {
      try {
        const stateToSave = {
          savedConnections: state.savedConnections
        };
        
        // Always save connection state, even if empty - this fixes data loss issues
        await window.electronAPI.storage.saveConnectionState(stateToSave);
        console.log('💾 Saved connection state:', state.savedConnections.length, 'connections');
      } catch (error) {
        console.warn('Failed to save connection state:', error);
      }
    };

    // Debounce saving to avoid excessive writes
    const timeoutId = setTimeout(saveConnectionState, 500);
    return () => clearTimeout(timeoutId);
  }, [state.savedConnections]); // Depend on the entire array - React will detect changes

  // Auto-load collections when we have both a connection and a selected database
  useEffect(() => {
    const autoLoadCollections = async () => {
      if (state.selectedDatabase && state.activeConnections.length > 0) {
        const connectionId = state.activeConnections[0];
        const collectionKey = `${connectionId}:${state.selectedDatabase}`;
        
        // Only load collections if we don't already have them
        if (!state.collections[collectionKey]) {
          try {
            const result = await window.electronAPI.database.listCollections(connectionId, state.selectedDatabase);
            if (result.success) {
              dispatch({ 
                type: ActionTypes.SET_COLLECTIONS, 
                payload: { 
                  database: collectionKey, 
                  collections: result.collections.sort((a, b) => a.localeCompare(b)) 
                } 
              });
            }
          } catch (error) {
            console.error('Error auto-loading collections:', error);
          }
        }
      }
    };

    autoLoadCollections();
  }, [state.selectedDatabase, state.activeConnections.length]);

  // Action creators (memoized to prevent infinite loops in useEffect dependencies)
  const actions = useMemo(() => ({
    addConnection: (id, connection) =>
      dispatch({ type: ActionTypes.ADD_CONNECTION, payload: { id, connection } }),

    removeConnection: (id) =>
      dispatch({ type: ActionTypes.REMOVE_CONNECTION, payload: id }),

    updateConnection: (id, updates) =>
      dispatch({ type: ActionTypes.UPDATE_CONNECTION, payload: { id, updates } }),

    // Helper to get database type for a connection
    getConnectionDatabaseType: (connectionId) => {
      const connection = stateRef.current.connections[connectionId];
      return connection?.databaseType || 'mongodb';
    },

    setCollections: (database, collections) =>
      dispatch({ type: ActionTypes.SET_COLLECTIONS, payload: { database, collections } }),

    setLoading: (loading) =>
      dispatch({ type: ActionTypes.SET_LOADING, payload: loading }),

    setConnectionError: (error) =>
      dispatch({ type: ActionTypes.SET_CONNECTION_ERROR, payload: error }),

    setSavedConnections: (connections) =>
      dispatch({ type: ActionTypes.SET_SAVED_CONNECTIONS, payload: connections }),

    addSavedConnection: (connectionData) =>
      dispatch({ type: ActionTypes.ADD_SAVED_CONNECTION, payload: connectionData }),

    removeSavedConnection: (connectionId) =>
      dispatch({ type: ActionTypes.REMOVE_SAVED_CONNECTION, payload: connectionId }),

    updateSavedConnection: (connectionId, updates) => {
      // Use dedicated UPDATE action for cleaner state management
      dispatch({ 
        type: ActionTypes.UPDATE_SAVED_CONNECTION, 
        payload: { id: connectionId, updates } 
      });
    },

    setSelectedDatabase: (database) => {
      dispatch({ type: ActionTypes.SET_SELECTED_DATABASE, payload: database });
      
      // Automatically load collections for the selected database in the background (non-blocking)
      if (database && stateRef.current.activeConnections.length > 0) {
        const connectionId = stateRef.current.activeConnections[0];
        const collectionKey = `${connectionId}:${database}`;
        
        // Only load collections if we don't already have them
        if (!stateRef.current.collections[collectionKey]) {
          // Load collections in the background without blocking the UI
          window.electronAPI.database.listCollections(connectionId, database)
            .then(result => {
              if (result.success) {
                dispatch({ 
                  type: ActionTypes.SET_COLLECTIONS, 
                  payload: { 
                    database: collectionKey, 
                    collections: result.collections.sort((a, b) => a.localeCompare(b)) 
                  } 
                });
              }
            })
            .catch(error => {
              console.error('Error auto-loading collections for selected database:', error);
            });
        }

        // Automatically generate schemas for the selected database
        actions.generateCollectionIndex(connectionId, database)
          .then(result => {
            if (!result.success) {
              console.warn(`⚠️ Failed to auto-generate schemas for database ${database}:`, result.error);
            }
          })
          .catch(error => {
            console.error('Error auto-generating schemas for selected database:', error);
          });
      }
    },

    setCollectionSchemas: (database, schemas, metadata = null) =>
      dispatch({ type: ActionTypes.SET_COLLECTION_SCHEMAS, payload: { database, schemas, metadata } }),

    updateSchemaTimestamp: (database) =>
      dispatch({ type: ActionTypes.UPDATE_SCHEMA_TIMESTAMP, payload: { database, timestamp: new Date().toISOString() } }),

    clearAllSchemas: () => {
      dispatch({ type: ActionTypes.SET_COLLECTION_SCHEMAS, payload: { database: null, schemas: null } });
      // Reset the entire collectionSchemas object
      dispatch({ type: 'CLEAR_ALL_SCHEMAS' });
    },

    // Async actions
    generateCollectionIndex: async (connectionId, database, silent = false) => {
      // Prevent concurrent schema generation for the same database
      if (generatingDatabasesRef.current.has(database)) {
        console.log(`⏭️ Schema generation already in progress for ${database}, skipping duplicate request`);
        return { success: true, message: 'Already generating schemas' };
      }

      // Mark database as generating immediately (before any async operations)
      generatingDatabasesRef.current.add(database);
      console.log(`🔒 Locked schema generation for ${database}`);

      if (!silent) {
        actions.setLoading(true);
      }
      
      try {
        // Check if we're still connected (use ref to get current state)
        if (!stateRef.current.activeConnections.includes(connectionId)) {
          console.error(`❌ Connection ${connectionId} not in activeConnections:`, stateRef.current.activeConnections);
          generatingDatabasesRef.current.delete(database);
          throw new Error('Not connected to MongoDB');
        }

        // First try to load existing schemas
        const existingSchemas = await window.electronAPI.database.loadCollectionSchemas(database);
        
        // Check if schemas exist and are less than 24 hours old
        // Note: existingSchemas.schemas can be an empty object {} if no tables/collections exist
        if (existingSchemas.success && existingSchemas.schemas !== null && existingSchemas.lastUpdated) {
          const lastUpdate = new Date(existingSchemas.lastUpdated);
          const now = new Date();
          const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
          
          if (hoursSinceUpdate < 24) {
            // Load schemas and PostgreSQL metadata (views, functions, enum types)
            actions.setCollectionSchemas(database, existingSchemas.schemas, existingSchemas.metadata);
            actions.updateSchemaTimestamp(database);
            
            if (existingSchemas.metadata) {
              console.log(`📊 Loaded PostgreSQL metadata: ${Object.keys(existingSchemas.metadata.views || {}).length} views, ${existingSchemas.metadata.functions?.length || 0} functions, ${Object.keys(existingSchemas.metadata.enumTypes || {}).length} enum types`);
            }
            
            // Mark indexing as complete (even if schemas are empty - means no tables exist)
            if (!silent) {
              actions.updateSchemaGenStatus({
                database,
                status: {
                  isGenerating: false,
                  currentPhase: 'complete',
                  progress: 100,
                  message: 'Schemas loaded from cache',
                  collectionsProcessed: Object.keys(existingSchemas.schemas || {}).length,
                  collectionsTotal: Object.keys(existingSchemas.schemas || {}).length,
                  estimatedTimeRemaining: 0,
                  isComplete: true,
                  canQueryNow: true
                }
              });
            }
            
            generatingDatabasesRef.current.delete(database);
            console.log(`🔓 Unlocked schema generation for ${database} (schemas already exist)`);
            return { success: true, schemas: existingSchemas.schemas, metadata: existingSchemas.metadata };
          }
        }

        // Show progress UI - Start (only if not silent)
        if (!silent) {
          actions.updateSchemaGenStatus({
            database,
            status: {
              isGenerating: true,
              currentPhase: 'schemas',
              progress: 0,
              message: 'Starting schema indexing...',
              collectionsProcessed: 0,
              collectionsTotal: 0,
              estimatedTimeRemaining: 0,
              isComplete: false,
              canQueryNow: false
            }
          });
        }

        console.log(`🔄 Starting schema generation... ${silent ? '(silent mode)' : ''}`);

        // Generate schemas (Electron handles metadata generation internally)
        const result = await window.electronAPI.database.generateCollectionIndex(connectionId, database, silent);
        
        if (!result.success) {
          console.error('❌ Schema generation failed:', result.error);
          throw new Error(result.error || 'Schema generation failed');
        }
        
        console.log('✅ Schema generation complete');
        console.log(`📊 Generated schemas for ${Object.keys(result.schemas || {}).length} collections`);
        if (result.metadata) {
          console.log(`✅ PostgreSQL metadata: ${Object.keys(result.metadata.views || {}).length} views, ${result.metadata.functions?.length || 0} functions, ${Object.keys(result.metadata.enumTypes || {}).length} enum types`);
        }
        
        // Don't override the completion status from Electron progress updates
        // The Electron progress handler will send the "All done!" message
        // and it will auto-hide after 3 seconds
        
        // Store schemas and PostgreSQL metadata (views, functions, enum types)
        actions.setCollectionSchemas(database, result.schemas, result.metadata);
        actions.updateSchemaTimestamp(database);
        
        // Unlock after successful completion
        generatingDatabasesRef.current.delete(database);
        console.log(`🔓 Unlocked schema generation for ${database} (completed successfully)`);
        
        return result;
      } catch (error) {
        console.error('Error generating collection index:', error);
        
        // Unlock on error
        generatingDatabasesRef.current.delete(database);
        console.log(`🔓 Unlocked schema generation for ${database} (error)`);

        
        // Error state (only if not silent)
        if (!silent) {
          actions.updateSchemaGenStatus({
            database,
            status: {
              isGenerating: false,
              currentPhase: null,
              progress: 0,
              message: 'Schema generation failed',
              canQueryNow: false
            }
          });
        }
        
        return { success: false, error: error.message };
      } finally {
        if (!silent) {
          actions.setLoading(false);
        }
      }
    },

    // Async actions
    connect: async (connectionString, options = {}, connectionName = null) => {
      actions.setLoading(true);
      actions.setConnectionError(null); // Clear any previous errors

      try {
        // Check if there's already an active connection with the same connection string (use ref)
        const existingActiveConnection = stateRef.current.activeConnections.find(connId => {
          const connection = stateRef.current.connections[connId];
          return connection && connection.connectionString === connectionString;
        });

        if (existingActiveConnection) {
          const error = 'A connection with this connection string is already active';
          actions.setConnectionError(error);
          actions.setLoading(false);
          return { 
            success: false, 
            error,
            existingConnectionId: existingActiveConnection
          };
        }

        // Convert 'supabase' to 'postgresql' for backend (uses same adapter)
        const backendDatabaseType = options.databaseType === 'supabase' ? 'postgresql' : (options.databaseType || undefined);
        const backendOptions = { 
          ...options, 
          databaseType: backendDatabaseType
        };
        
        const result = await window.electronAPI.database.connect(connectionString, backendOptions);
        
        if (result.success) {
          const connectionId = result.connectionId;
          // Keep the original databaseType from UI (supabase) for branding, or use detected type
          const databaseType = options.databaseType || result.databaseType || 'mongodb';
          
          // Load databases
          const dbResult = await window.electronAPI.database.listDatabases(connectionId);
          
          if (dbResult.success) {
            // Use the provided connection name (now required)
            const name = connectionName;
            
            actions.addConnection(connectionId, {
              connectionString,
              name, // Store the name directly in the active connection
              databaseType, // Store the database type
              databases: dbResult.databases,
              status: 'connected'
            });
            
            // Add to saved connections if not already there
            actions.addSavedConnection({
              name,
              connectionString,
              databaseType,
              lastUsed: new Date().toISOString()
            });
            
            // Clear any connection errors on success
            actions.setConnectionError(null);
          }
          
          return { success: true, connectionId };
        } else {
          actions.setConnectionError(result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        const errorMessage = error.message;
        actions.setConnectionError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        actions.setLoading(false);
      }
    },

    disconnect: async (connectionId) => {
      try {
        await window.electronAPI.database.disconnect(connectionId);
        actions.removeConnection(connectionId);
        return { success: true };
      } catch (error) {
        console.error('Error disconnecting:', error);
        return { success: false, error: error.message };
      }
    },

    refreshDatabases: async (connectionId, expandedDatabases = new Set()) => {
      try {
        const connection = stateRef.current.connections[connectionId];
        if (!connection) {
          return { success: false, error: 'Connection not found' };
        }

        // Reload databases for this connection
        const dbResult = await window.electronAPI.database.listDatabases(connectionId);
        
        if (dbResult.success) {
          actions.updateConnection(connectionId, {
            databases: dbResult.databases,
            status: 'connected'
          });

          // Also refresh collections for any expanded databases
          const refreshPromises = [];
          for (const expandedKey of expandedDatabases) {
            if (expandedKey.startsWith(`${connectionId}:`)) {
              const dbName = expandedKey.split(':')[1];
              // Only refresh if the database still exists
              if (dbResult.databases.includes(dbName)) {
                refreshPromises.push(
                  window.electronAPI.database.listCollections(connectionId, dbName)
                    .then(result => {
                      if (result.success) {
                        actions.setCollections(expandedKey, result.collections.sort((a, b) => a.localeCompare(b)));
                      }
                      return { database: dbName, success: result.success, error: result.error };
                    })
                    .catch(error => ({ database: dbName, success: false, error: error.message }))
                );
              } else {
                // Database was deleted, remove its collections from state
                actions.setCollections(expandedKey, []);
              }
            }
          }

          // Wait for all collection refreshes to complete
          if (refreshPromises.length > 0) {
            const collectionResults = await Promise.all(refreshPromises);
            const failedCollections = collectionResults.filter(r => !r.success);
            
            if (failedCollections.length > 0) {
              console.warn('Some collections failed to refresh:', failedCollections);
            }
          }

          return { success: true, databases: dbResult.databases };
        } else {
          return { success: false, error: dbResult.error };
        }
      } catch (error) {
        console.error('Error refreshing databases:', error);
        return { success: false, error: error.message };
      }
    },

    updateSchemaGenStatus: (payload) =>
      dispatch({ type: ActionTypes.UPDATE_SCHEMA_GEN_STATUS, payload })
  }), []); // Empty deps - actions are stable, state accessed via ref

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => {
    return {
      ...state,
      ...actions
    };
  }, [state, actions]);

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

// Custom hook to use the database context
export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}

export default DatabaseContext;