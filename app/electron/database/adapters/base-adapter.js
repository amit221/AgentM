/**
 * BaseAdapter - Abstract base class for all database adapters
 * 
 * This class defines the interface that all database adapters must implement.
 * Each database type (MongoDB, PostgreSQL, etc.) should extend this class
 * and provide implementations for all abstract methods.
 * 
 * Key Design Principles:
 * - Database-agnostic interface for common operations
 * - Database-specific implementations in child classes
 * - Consistent error handling and response formats
 * - Support for conversation-based query execution
 */

class BaseAdapter {
  constructor() {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is an abstract class and cannot be instantiated directly');
    }
    
    this.clients = new Map(); // Map of connection IDs to database clients
    this.connectionStrings = new Map(); // Map of connection IDs to connection strings
    this.settingsStorage = null;
  }

  /**
   * Set settings storage for accessing application settings
   */
  setSettingsStorage(settingsStorage) {
    this.settingsStorage = settingsStorage;
  }

  /**
   * Get the database type identifier
   * @returns {string} - 'mongodb', 'postgresql', etc.
   */
  getDatabaseType() {
    throw new Error('getDatabaseType() must be implemented by subclass');
  }

  // ===== CONNECTION MANAGEMENT =====

  /**
   * Connect to a database
   * @param {string} connectionString - Database connection string
   * @param {Object} options - Connection options (timeout, poolSize, etc.)
   * @returns {Promise<{success: boolean, connectionId?: string, error?: string}>}
   */
  async connect(connectionString, options = {}) {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from a database
   * @param {string} connectionId - Connection ID to disconnect
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async disconnect(connectionId) {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Test if a connection is still active
   * @param {string} connectionId - Connection ID to test
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection(connectionId) {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Get connection status information
   * @returns {Object} - Status information about all connections
   */
  getConnectionStatus() {
    throw new Error('getConnectionStatus() must be implemented by subclass');
  }

  // ===== DATABASE OPERATIONS =====

  /**
   * List all databases/schemas accessible from the connection
   * @param {string} connectionId - Connection ID
   * @returns {Promise<{success: boolean, databases?: string[], error?: string}>}
   */
  async listDatabases(connectionId) {
    throw new Error('listDatabases() must be implemented by subclass');
  }

  /**
   * List all collections/tables in a database
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database/schema name
   * @returns {Promise<{success: boolean, collections?: string[], error?: string}>}
   */
  async listCollections(connectionId, databaseName) {
    throw new Error('listCollections() must be implemented by subclass');
  }

  /**
   * Create a new database/schema
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name to create
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async createDatabase(connectionId, databaseName) {
    throw new Error('createDatabase() must be implemented by subclass');
  }

  /**
   * Delete a database/schema
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteDatabase(connectionId, databaseName) {
    throw new Error('deleteDatabase() must be implemented by subclass');
  }

  // ===== QUERY EXECUTION =====

  /**
   * Execute a raw query string (conversation-aware)
   * @param {string} conversationId - Conversation ID for query isolation
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} queryString - Raw query string (native to the database)
   * @param {string} operationId - Optional operation ID for cancellation
   * @param {number} timeoutSeconds - Query timeout in seconds
   * @returns {Promise<{success: boolean, result?: any, count?: number, executionTime?: number, databaseType: string, error?: string}>}
   */
  async executeRawQuery(conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = 30) {
    throw new Error('executeRawQuery() must be implemented by subclass');
  }

  /**
   * Execute a script (multiple queries/statements)
   * @param {string} conversationId - Conversation ID
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} script - Script content
   * @param {string} operationId - Optional operation ID for cancellation
   * @param {number} timeoutSeconds - Script timeout in seconds
   * @returns {Promise<{success: boolean, result?: any, executionTime?: number, databaseType: string, error?: string}>}
   */
  async executeScript(conversationId, connectionId, databaseName, script, operationId = null, timeoutSeconds = 60) {
    throw new Error('executeScript() must be implemented by subclass');
  }

  /**
   * Cancel an ongoing operation
   * @param {string} operationId - Operation ID to cancel
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cancelOperation(operationId) {
    throw new Error('cancelOperation() must be implemented by subclass');
  }

  // ===== SCHEMA OPERATIONS =====

  /**
   * Generate schema information for all collections/tables in a database
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {boolean} silent - If true, don't send progress updates
   * @returns {Promise<{success: boolean, schemas?: Object, metadata?: Object, error?: string}>}
   */
  async generateCollectionIndex(connectionId, databaseName, silent = false) {
    throw new Error('generateCollectionIndex() must be implemented by subclass');
  }

  /**
   * Get schema for a specific collection/table
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} collectionName - Collection/table name
   * @returns {Promise<{success: boolean, schema?: Object, error?: string}>}
   */
  async getSchema(connectionId, databaseName, collectionName) {
    throw new Error('getSchema() must be implemented by subclass');
  }

  /**
   * Load stored schemas for a database
   * @param {string} databaseName - Database name
   * @returns {Promise<{success: boolean, schemas?: Object, metadata?: Object, error?: string}>}
   */
  async loadCollectionSchemas(databaseName) {
    try {
      if (!this.settingsStorage) {
        return { success: false, error: 'Settings storage not available' };
      }
      
      const result = await this.settingsStorage.loadCollectionSchemas(databaseName);
      return result;
    } catch (error) {
      console.error('Error loading collection schemas:', error);
      return { success: false, error: error.message };
    }
  }

  // ===== COLLECTION/TABLE OPERATIONS =====

  /**
   * Get statistics for a collection/table
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} collectionName - Collection/table name
   * @returns {Promise<{success: boolean, stats?: Object, error?: string}>}
   */
  async getCollectionStats(connectionId, databaseName, collectionName) {
    throw new Error('getCollectionStats() must be implemented by subclass');
  }

  /**
   * Delete a collection/table
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} collectionName - Collection/table name
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteCollection(connectionId, databaseName, collectionName) {
    throw new Error('deleteCollection() must be implemented by subclass');
  }

  /**
   * Duplicate a collection/table
   * @param {string} targetConnectionId - Target connection ID
   * @param {string} sourceDatabaseName - Source database name
   * @param {string} sourceCollectionName - Source collection/table name
   * @param {string} targetDatabaseName - Target database name
   * @param {string} targetCollectionName - Target collection/table name
   * @param {string} sourceConnectionId - Source connection ID (if different from target)
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null, progressCallback = null) {
    throw new Error('duplicateCollection() must be implemented by subclass');
  }

  // ===== INDEX OPERATIONS =====

  /**
   * Create an index on a collection/table
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} collectionName - Collection/table name
   * @param {Object} keys - Index keys/columns
   * @param {Object} options - Index options (unique, sparse, etc.)
   * @returns {Promise<{success: boolean, indexName?: string, error?: string}>}
   */
  async createIndex(connectionId, databaseName, collectionName, keys, options = {}) {
    throw new Error('createIndex() must be implemented by subclass');
  }

  /**
   * Drop an index from a collection/table
   * @param {string} connectionId - Connection ID
   * @param {string} databaseName - Database name
   * @param {string} collectionName - Collection/table name
   * @param {string} indexName - Index name to drop
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async dropIndex(connectionId, databaseName, collectionName, indexName) {
    throw new Error('dropIndex() must be implemented by subclass');
  }

  // ===== EXPORT/IMPORT OPERATIONS =====

  /**
   * Check if export tools are available for this database type
   * @returns {Promise<{success: boolean, available: boolean, tools?: Object, error?: string}>}
   */
  async checkExportToolsAvailability() {
    throw new Error('checkExportToolsAvailability() must be implemented by subclass');
  }

  /**
   * Export a database
   * @param {Object} options - Export options
   * @param {Function} progressCallback - Progress callback function
   * @param {string} operationId - Operation ID for cancellation
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async exportDatabase(options, progressCallback = null, operationId = null) {
    throw new Error('exportDatabase() must be implemented by subclass');
  }

  /**
   * Check if import tools are available for this database type
   * @returns {Promise<{success: boolean, available: boolean, tools?: Object, error?: string}>}
   */
  async checkImportToolsAvailability() {
    throw new Error('checkImportToolsAvailability() must be implemented by subclass');
  }

  /**
   * Import a database
   * @param {Object} options - Import options
   * @param {Function} progressCallback - Progress callback function
   * @param {string} operationId - Operation ID for cancellation
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async importDatabase(options, progressCallback = null, operationId = null) {
    throw new Error('importDatabase() must be implemented by subclass');
  }

  // ===== UTILITY METHODS =====

  /**
   * Get connection string (sanitized for logging)
   * @param {string} connectionId - Connection ID
   * @param {boolean} silent - If true, don't log warnings
   * @returns {string|null} - Connection string or null if not found
   */
  getConnectionString(connectionId, silent = false) {
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString && !silent) {
      console.error(`Connection string not found for connectionId: ${connectionId}`);
    }
    return connectionString;
  }

  /**
   * Get server info from connection string
   * @param {string} connectionId - Connection ID
   * @returns {Object|null} - Server info (host, port, database) or null
   */
  getServerInfo(connectionId) {
    const connectionString = this.getConnectionString(connectionId, true);
    if (!connectionString) return null;
    
    // Subclasses can override this to parse their specific connection string format
    return { host: 'unknown', port: 'unknown', database: 'unknown' };
  }

  /**
   * Cleanup all connections and resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log(`🧹 Starting ${this.getDatabaseType()} adapter cleanup...`);
    
    // Close all connections
    for (const [connectionId, client] of this.clients) {
      try {
        console.log(`🔌 Closing connection: ${connectionId}`);
        await this.disconnect(connectionId);
      } catch (error) {
        console.warn(`Warning closing connection ${connectionId}:`, error.message);
      }
    }
    
    this.clients.clear();
    this.connectionStrings.clear();
    
    console.log(`✅ ${this.getDatabaseType()} adapter cleanup completed`);
  }
}

module.exports = BaseAdapter;

