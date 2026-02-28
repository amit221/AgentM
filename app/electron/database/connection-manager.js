const MongoDBAdapter = require('./adapters/mongodb-adapter');
// Future adapters will be imported here:
// const PostgreSQLAdapter = require('./adapters/postgresql-adapter');

/**
 * ConnectionManager - Multi-database orchestrator
 * 
 * Manages connections across different database types (MongoDB, PostgreSQL, etc.)
 * Routes operations to the appropriate database adapter based on connection type.
 * 
 * Architecture:
 * - Each connection has a databaseType ('mongodb', 'postgresql', etc.)
 * - Each database type has its own adapter instance
 * - ConnectionManager maps connectionId -> adapter instance
 * - All operations are delegated to the appropriate adapter
 */
class ConnectionManager {
  constructor() {
    // Map of database types to adapter instances
    this.adapters = new Map();
    
    // Map of connection IDs to their database types
    this.connectionTypes = new Map();
    
    // Settings storage (shared across all adapters)
    this.settingsStorage = null;
    
    // Initialize MongoDB adapter (always available)
    this.initializeMongoDBAdapter();
  }

  /**
   * Initialize MongoDB adapter
   */
  initializeMongoDBAdapter() {
    const mongoAdapter = new MongoDBAdapter();
    this.adapters.set('mongodb', mongoAdapter);
    console.log('✅ MongoDB adapter initialized');
  }

  /**
   * Initialize PostgreSQL adapter (lazy loading)
   */
  initializePostgreSQLAdapter() {
    if (!this.adapters.has('postgresql')) {
      try {
        const PostgreSQLAdapter = require('./adapters/postgresql-adapter');
        const pgAdapter = new PostgreSQLAdapter();
        this.adapters.set('postgresql', pgAdapter);
        
        // Share settings storage if available
        if (this.settingsStorage) {
          pgAdapter.setSettingsStorage(this.settingsStorage);
        }
        
        console.log('✅ PostgreSQL adapter initialized');
      } catch (error) {
        console.error('❌ Failed to initialize PostgreSQL adapter:', error);
        throw new Error(`PostgreSQL adapter not available: ${error.message}`);
      }
    }
  }

  /**
   * Set settings storage for all adapters
   */
  setSettingsStorage(settingsStorage) {
    this.settingsStorage = settingsStorage;
    
    // Share with all initialized adapters
    for (const [type, adapter] of this.adapters) {
      adapter.setSettingsStorage(settingsStorage);
    }
  }

  /**
   * Get adapter for a specific database type
   */
  getAdapterForType(databaseType) {
    // Normalize database type
    const normalizedType = databaseType.toLowerCase();
    
    // Lazy load adapters as needed
    if (normalizedType === 'postgresql' && !this.adapters.has('postgresql')) {
      this.initializePostgreSQLAdapter();
    }
    
    const adapter = this.adapters.get(normalizedType);
    if (!adapter) {
      throw new Error(`No adapter available for database type: ${databaseType}`);
    }
    
    return adapter;
  }

  /**
   * Get adapter for a specific connection ID
   */
  getAdapterForConnection(connectionId) {
    const databaseType = this.connectionTypes.get(connectionId);
    if (!databaseType) {
      throw new Error(`No database type found for connection: ${connectionId}`);
    }
    
    return this.getAdapterForType(databaseType);
  }

  /**
   * Detect database type from connection string
   */
  detectDatabaseType(connectionString) {
    if (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://')) {
      return 'mongodb';
    }
    if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
      // Detect Supabase by checking for .supabase.co in the connection string
      if (connectionString.includes('.supabase.co')) {
        return 'postgresql'; // Still use PostgreSQL adapter, but mark as Supabase for UI
      }
      return 'postgresql';
    }
    // Check for Supabase project URLs (https://[project-ref].supabase.co)
    // These should be rejected as they are not connection strings
    if (connectionString.includes('.supabase.co')) {
      return 'postgresql'; // Treat as PostgreSQL but will fail connection
    }
    
    // Default to MongoDB for backward compatibility
    return 'mongodb';
  }

  // ===== CONNECTION MANAGEMENT =====

  /**
   * Connect to a database
   * @param {string} connectionString - Database connection string
   * @param {Object} options - Connection options
   * @param {string} options.databaseType - Explicit database type (optional, will be auto-detected)
   * @returns {Promise<{success: boolean, connectionId?: string, databaseType?: string, error?: string}>}
   */
  async connect(connectionString, options = {}) {
    try {
      // Determine database type (explicit or auto-detect)
      const databaseType = options.databaseType || this.detectDatabaseType(connectionString);
      
      console.log(`🔗 Connecting to ${databaseType} database...`);
      
      // Get appropriate adapter
      const adapter = this.getAdapterForType(databaseType);
      
      // Connect using the adapter
      const result = await adapter.connect(connectionString, options);
      
      if (result.success && result.connectionId) {
        // Track connection type
        this.connectionTypes.set(result.connectionId, databaseType);
        console.log(`✅ Connected to ${databaseType} (${result.connectionId})`);
        
        return {
          ...result,
          databaseType
        };
      }
      
      return result;
    } catch (error) {
      console.error('❌ Connection error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Disconnect from a database
   */
  async disconnect(connectionId) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      const result = await adapter.disconnect(connectionId);
      
      if (result.success) {
        // Clean up connection type tracking
        this.connectionTypes.delete(connectionId);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Disconnect error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test a connection
   */
  async testConnection(connectionId) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.testConnection(connectionId);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get connection status for all connections
   */
  getConnectionStatus() {
    const allStatuses = [];
    
    // Gather status from all adapters
    for (const [type, adapter] of this.adapters) {
      const status = adapter.getConnectionStatus();
      allStatuses.push({
        databaseType: type,
        ...status
      });
    }
    
    // Combine into a unified status
    const totalConnections = allStatuses.reduce((sum, s) => sum + (s.totalConnections || 0), 0);
    const allConnections = allStatuses.flatMap(s => s.activeConnections || []);
    
    return {
      isConnected: totalConnections > 0,
      totalConnections,
      activeConnections: allConnections,
      byDatabaseType: allStatuses
    };
  }

  // ===== DATABASE OPERATIONS =====

  /**
   * List all databases/schemas
   */
  async listDatabases(connectionId) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      const result = await adapter.listDatabases(connectionId);
      
      if (result.success) {
        return {
          ...result,
          databaseType: this.connectionTypes.get(connectionId)
        };
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List all collections/tables in a database
   */
  async listCollections(connectionId, databaseName, options = {}) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      const result = await adapter.listCollections(connectionId, databaseName, options);
      
      if (result.success) {
        return {
          ...result,
          databaseType: this.connectionTypes.get(connectionId)
        };
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get connection options
   */
  getConnectionOptions(connectionId) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      if (adapter.getConnectionOptions) {
        return adapter.getConnectionOptions(connectionId);
      }
      return { isSupabase: false };
    } catch (error) {
      return { isSupabase: false };
    }
  }

  /**
   * Create a new database/schema
   */
  async createDatabase(connectionId, databaseName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.createDatabase(connectionId, databaseName);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a database/schema
   */
  async deleteDatabase(connectionId, databaseName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.deleteDatabase(connectionId, databaseName);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== QUERY EXECUTION =====

  /**
   * Execute a raw query string (conversation-aware)
   */
  async executeRawQuery(conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = 30) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      const result = await adapter.executeRawQuery(conversationId, connectionId, databaseName, queryString, operationId, timeoutSeconds);
      
      return {
        ...result,
        databaseType: this.connectionTypes.get(connectionId)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        databaseType: this.connectionTypes.get(connectionId)
      };
    }
  }

  /**
   * Execute a script (multiple queries/statements)
   */
  async executeScript(conversationId, connectionId, databaseName, script, operationId = null, timeoutSeconds = 60) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      const result = await adapter.executeScript(conversationId, connectionId, databaseName, script, operationId, timeoutSeconds);
      
      return {
        ...result,
        databaseType: this.connectionTypes.get(connectionId)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        databaseType: this.connectionTypes.get(connectionId)
      };
    }
  }

  /**
   * Cancel an ongoing operation
   */
  async cancelOperation(operationId) {
    // Try to cancel on all adapters (since we don't track which adapter owns which operation)
    const results = [];
    
    for (const [type, adapter] of this.adapters) {
      try {
        const result = await adapter.cancelOperation(operationId);
        if (result.success) {
          results.push({ type, ...result });
        }
      } catch (error) {
        // Ignore errors - operation might not exist in this adapter
      }
    }
    
    if (results.length > 0) {
      return { success: true, cancelledOn: results };
    }
    
    return { success: false, error: 'Operation not found' };
  }

  // ===== SCHEMA OPERATIONS =====

  /**
   * Generate schema information for all collections/tables in a database
   */
  async generateCollectionIndex(connectionId, databaseName, silent = false, mainWindow = null) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.generateCollectionIndex(connectionId, databaseName, silent, mainWindow);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get schema for a specific collection/table
   */
  async getSchema(connectionId, databaseName, collectionName, sampleSize = 100) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.getSchema(connectionId, databaseName, collectionName, sampleSize);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Load stored schemas for a database
   */
  async loadCollectionSchemas(databaseName) {
    // Schemas are stored per database name, not per connection
    // We'll try MongoDB adapter first (for backward compatibility), then others
    
    if (this.adapters.has('mongodb')) {
      const mongoAdapter = this.adapters.get('mongodb');
      return await mongoAdapter.loadCollectionSchemas(databaseName);
    }
    
    // If no MongoDB adapter, use the first available adapter
    const firstAdapter = this.adapters.values().next().value;
    if (firstAdapter) {
      return await firstAdapter.loadCollectionSchemas(databaseName);
    }
    
    return {
      success: false,
      error: 'No database adapters available'
    };
  }

  // ===== COLLECTION/TABLE OPERATIONS =====

  /**
   * Get statistics for a collection/table
   */
  async getCollectionStats(connectionId, databaseName, collectionName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.getCollectionStats(connectionId, databaseName, collectionName);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a collection/table
   */
  async deleteCollection(connectionId, databaseName, collectionName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.deleteCollection(connectionId, databaseName, collectionName);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Duplicate a collection/table
   */
  async duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null, progressCallback = null) {
    try {
      const adapter = this.getAdapterForConnection(targetConnectionId);
      return await adapter.duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId, progressCallback);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Duplicate a database with method selection
   * @param {string} targetConnectionId - Target connection ID
   * @param {string} sourceDatabaseName - Source database name
   * @param {string} targetDatabaseName - Target database name
   * @param {string} sourceConnectionId - Source connection ID (optional, defaults to targetConnectionId)
   * @param {string} method - Duplication method ('auto', 'dump_restore', 'document_copy', 'template')
   * @param {Function} progressCallback - Progress callback function
   */
  async duplicateDatabaseWithMethod(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, method = 'auto', progressCallback = null) {
    try {
      const adapter = this.getAdapterForConnection(targetConnectionId);
      return await adapter.duplicateDatabaseWithMethod(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId, method, progressCallback);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Duplicate a database (legacy method for backward compatibility)
   */
  async duplicateDatabase(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    try {
      const adapter = this.getAdapterForConnection(targetConnectionId);
      return await adapter.duplicateDatabase(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId, progressCallback);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if dump/restore tools are available
   */
  async checkDumpRestoreAvailability() {
    // Try to check on all initialized adapters
    const results = {};
    
    for (const [type, adapter] of this.adapters) {
      try {
        if (adapter.checkDumpRestoreAvailability) {
          results[type] = await adapter.checkDumpRestoreAvailability();
        }
      } catch (error) {
        results[type] = { available: false, error: error.message };
      }
    }
    
    return results;
  }

  // ===== INDEX OPERATIONS =====

  /**
   * Create an index on a collection/table
   */
  async createIndex(connectionId, databaseName, collectionName, keys, options = {}) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.createIndex(connectionId, databaseName, collectionName, keys, options);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Drop an index from a collection/table
   */
  async dropIndex(connectionId, databaseName, collectionName, indexName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.dropIndex(connectionId, databaseName, collectionName, indexName);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== EXPORT/IMPORT OPERATIONS =====

  /**
   * Get collections/tables for export from a database
   * Works for both MongoDB (collections) and PostgreSQL (tables)
   */
  async getCollectionsForExport(connectionId, databaseName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      const result = await adapter.listCollections(connectionId, databaseName);
      
      if (result.success) {
        // Both adapters return 'collections' array with table/collection names
        return result.collections || [];
      }
      
      console.error('Failed to get collections for export:', result.error);
      return [];
    } catch (error) {
      console.error('Error getting collections for export:', error);
      return [];
    }
  }

  /**
   * Get collection/table metadata for export
   */
  async getCollectionMetadata(connectionId, databaseName, collectionName) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.getCollectionStats(connectionId, databaseName, collectionName);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if export tools are available for a connection
   * If connectionId is not provided, returns generic availability info
   */
  async checkExportToolsAvailability(connectionId = null) {
    try {
      // If no connectionId provided, return basic availability
      if (!connectionId) {
        // Return a combined availability from all adapters
        const results = {};
        for (const [type, adapter] of this.adapters) {
          try {
            const availability = await adapter.checkExportToolsAvailability();
            results[type] = availability;
          } catch (e) {
            results[type] = { available: false, error: e.message };
          }
        }
        return {
          success: true,
          mongodump: results.mongodb?.mongodump || false,
          mongoexport: results.mongodb?.mongoexport || false,
          pg_dump: results.postgresql?.tools?.pg_dump || false,
          customExport: true
        };
      }
      
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.checkExportToolsAvailability();
    } catch (error) {
      return {
        success: false,
        available: false,
        mongodump: false,
        mongoexport: false,
        pg_dump: false,
        customExport: true,
        error: error.message
      };
    }
  }

  /**
   * Export a database
   * Supports both direct options object and (connectionId, options) signature
   */
  async exportDatabase(optionsOrConnectionId, maybeOptions = null, maybeProgressCallback = null, maybeOperationId = null) {
    try {
      // Handle both call signatures:
      // 1. exportDatabase(options, progressCallback, operationId) - options contains connectionId
      // 2. exportDatabase(connectionId, options, progressCallback, operationId)
      let connectionId, options, progressCallback, operationId;
      
      if (typeof optionsOrConnectionId === 'object' && optionsOrConnectionId.connectionId) {
        // Called with (options, progressCallback, operationId)
        options = optionsOrConnectionId;
        connectionId = options.connectionId;
        progressCallback = maybeOptions;      // 2nd arg is progressCallback
        operationId = maybeProgressCallback;  // 3rd arg is operationId
      } else if (typeof optionsOrConnectionId === 'string') {
        // Called with (connectionId, options, progressCallback, operationId)
        connectionId = optionsOrConnectionId;
        options = maybeOptions;
        progressCallback = maybeProgressCallback;
        operationId = maybeOperationId;
      } else {
        throw new Error('Invalid arguments: expected options object with connectionId or (connectionId, options)');
      }
      
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.exportDatabase(options, progressCallback, operationId);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if import tools are available for a connection
   */
  async checkImportToolsAvailability(connectionId) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.checkImportToolsAvailability();
    } catch (error) {
      return {
        success: false,
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Import a database
   */
  async importDatabase(connectionId, options, progressCallback = null, operationId = null) {
    try {
      const adapter = this.getAdapterForConnection(connectionId);
      return await adapter.importDatabase(options, progressCallback, operationId);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== POSTGRESQL CLIENT TOOLS MANAGEMENT =====

  /**
   * Get or initialize the PostgreSQL adapter for tools management
   */
  _getPostgreSQLAdapter() {
    let adapter = this.adapters.get('postgresql');
    if (!adapter) {
      // Initialize PostgreSQL adapter if not already done
      this.initializePostgreSQLAdapter();
      adapter = this.adapters.get('postgresql');
    }
    return adapter;
  }

  /**
   * Download PostgreSQL client tools (pg_dump, pg_restore, psql)
   */
  async downloadPgTools(progressCallback = null) {
    try {
      const adapter = this._getPostgreSQLAdapter();
      if (!adapter) {
        return {
          success: false,
          error: 'PostgreSQL adapter not available'
        };
      }
      return await adapter.downloadPgTools(progressCallback);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get PostgreSQL client tools status
   */
  async getPgToolsStatus() {
    try {
      const adapter = this._getPostgreSQLAdapter();
      if (!adapter) {
        return {
          success: false,
          error: 'PostgreSQL adapter not available'
        };
      }
      return await adapter.getPgToolsStatus();
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove downloaded PostgreSQL client tools
   */
  async removePgTools() {
    try {
      const adapter = this._getPostgreSQLAdapter();
      if (!adapter) {
        return {
          success: false,
          error: 'PostgreSQL adapter not available'
        };
      }
      return await adapter.removePgTools();
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get database type for a connection
   */
  getDatabaseType(connectionId) {
    return this.connectionTypes.get(connectionId) || null;
  }

  /**
   * Get all active connection IDs
   */
  getActiveConnections() {
    return Array.from(this.connectionTypes.keys());
  }

  /**
   * Get connections grouped by database type
   */
  getConnectionsByType() {
    const byType = {};
    
    for (const [connectionId, type] of this.connectionTypes) {
      if (!byType[type]) {
        byType[type] = [];
      }
      byType[type].push(connectionId);
    }
    
    return byType;
  }

  /**
   * Cleanup all connections and resources
   */
  async cleanup() {
    console.log('🧹 Starting ConnectionManager cleanup...');
    
    // Cleanup all adapters
    for (const [type, adapter] of this.adapters) {
      try {
        console.log(`🧹 Cleaning up ${type} adapter...`);
        await adapter.cleanup();
      } catch (error) {
        console.warn(`Warning cleaning up ${type} adapter:`, error.message);
      }
    }
    
    // Clear tracking maps
    this.connectionTypes.clear();
    
    console.log('✅ ConnectionManager cleanup completed');
  }
}

module.exports = ConnectionManager;

