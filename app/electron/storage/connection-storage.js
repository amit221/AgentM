const BaseStorage = require('./base-storage');

/**
 * Dedicated storage manager for database connections
 */
class ConnectionStorage extends BaseStorage {
  constructor() {
    super('connections.json', {
      enableEncryption: true,
      enableBackup: true,
      validateData: (data) => this.validateConnectionData(data)
    });
  }

  /**
   * Get default connection data structure
   */
  getDefaultData() {
    return {
      savedConnections: [],
      lastActiveConnection: null,
      connectionPreferences: {
        autoConnect: false,
        rememberLastDatabase: true
      }
    };
  }

  /**
   * Get data version for migration purposes
   */
  getDataVersion() {
    return '2.0.0';
  }

  /**
   * Validate connection data structure
   */
  validateConnectionData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Data must be an object' };
    }

    if (!Array.isArray(data.savedConnections)) {
      return { valid: false, error: 'savedConnections must be an array' };
    }

    // Validate each connection
    for (const conn of data.savedConnections) {
      if (!conn.id || !conn.connectionString) {
        return { valid: false, error: 'Each connection must have id and connectionString' };
      }
      if (typeof conn.name !== 'string' || !conn.name.trim()) {
        return { valid: false, error: 'Each connection must have a valid name' };
      }
      // databaseType is optional, will default to 'mongodb' if not present
    }

    return { valid: true };
  }

  /**
   * Encrypt sensitive connection data
   */
  encryptData(data) {
    if (!data || !data.savedConnections) return data;

    const encryptedData = { ...data };
    encryptedData.savedConnections = data.savedConnections.map(conn => ({
      ...conn,
      connectionString: this.encrypt(conn.connectionString)
    }));

    return encryptedData;
  }

  /**
   * Decrypt sensitive connection data
   */
  decryptData(data) {
    if (!data || !data.savedConnections) return data;

    const decryptedData = { ...data };
    decryptedData.savedConnections = data.savedConnections.map(conn => ({
      ...conn,
      connectionString: this.decrypt(conn.connectionString)
    }));

    return decryptedData;
  }

  /**
   * Detect database type from connection string
   */
  detectDatabaseType(connectionString) {
    if (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://')) {
      return 'mongodb';
    }
    if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
      return 'postgresql';
    }
    // Default to MongoDB for backward compatibility
    return 'mongodb';
  }

  /**
   * Add a new connection
   */
  async addConnection(connectionData) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      // Generate ID if not provided
      if (!connectionData.id) {
        connectionData.id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Detect database type if not provided
      if (!connectionData.databaseType) {
        connectionData.databaseType = this.detectDatabaseType(connectionData.connectionString);
      }

      // Check for duplicate connection strings
      const existingConnection = data.savedConnections.find(
        conn => conn.connectionString === connectionData.connectionString
      );

      if (existingConnection) {
        // Update existing connection instead of adding duplicate
        existingConnection.name = connectionData.name || existingConnection.name;
        existingConnection.databaseType = connectionData.databaseType || existingConnection.databaseType;
        existingConnection.lastUsed = new Date().toISOString();
      } else {
        // Add new connection
        const newConnection = {
          id: connectionData.id,
          name: connectionData.name,
          connectionString: connectionData.connectionString,
          databaseType: connectionData.databaseType,
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString()
        };

        data.savedConnections.push(newConnection);
      }

      return await this.save(data);
    } catch (error) {
      console.error('Error adding connection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove a connection
   */
  async removeConnection(connectionId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      const originalLength = data.savedConnections.length;
      
      data.savedConnections = data.savedConnections.filter(conn => conn.id !== connectionId);
      
      if (data.savedConnections.length === originalLength) {
        return { success: false, error: 'Connection not found' };
      }

      // Clear last active connection if it was the removed one
      if (data.lastActiveConnection === connectionId) {
        data.lastActiveConnection = null;
      }

      return await this.save(data);
    } catch (error) {
      console.error('Error removing connection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a connection
   */
  async updateConnection(connectionId, updates) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      const connectionIndex = data.savedConnections.findIndex(conn => conn.id === connectionId);
      
      if (connectionIndex === -1) {
        return { success: false, error: 'Connection not found' };
      }

      // Update connection with new data
      data.savedConnections[connectionIndex] = {
        ...data.savedConnections[connectionIndex],
        ...updates,
        lastModified: new Date().toISOString()
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating connection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all connections
   */
  async getConnections() {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error, connections: [] };
      }

      return { 
        success: true, 
        connections: result.data.savedConnections || [],
        preferences: result.data.connectionPreferences || {}
      };
    } catch (error) {
      console.error('Error getting connections:', error);
      return { success: false, error: error.message, connections: [] };
    }
  }

  /**
   * Set last active connection
   */
  async setLastActiveConnection(connectionId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.lastActiveConnection = connectionId;

      // Update last used timestamp for the connection
      const connection = data.savedConnections.find(conn => conn.id === connectionId);
      if (connection) {
        connection.lastUsed = new Date().toISOString();
      }

      return await this.save(data);
    } catch (error) {
      console.error('Error setting last active connection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update last used timestamp by connection string
   */
  async updateLastUsedByConnectionString(connectionString) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      // Find connection by connection string and update lastUsed
      const connection = data.savedConnections.find(conn => conn.connectionString === connectionString);
      if (connection) {
        connection.lastUsed = new Date().toISOString();
        return await this.save(data);
      } else {
        return { success: false, error: 'Connection not found' };
      }
    } catch (error) {
      console.error('Error updating last used timestamp:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update connection preferences
   */
  async updatePreferences(preferences) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.connectionPreferences = {
        ...data.connectionPreferences,
        ...preferences
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating connection preferences:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate data from old settings format
   */
  async migrateFromOldFormat(oldConnectionState) {
    try {
      if (!oldConnectionState || !oldConnectionState.savedConnections) {
        return { success: true, migrated: false };
      }

      const result = await this.load();
      const data = result.success ? result.data : this.getDefaultData();

      // Process old connections
      const migratedConnections = oldConnectionState.savedConnections.map(conn => {
        if (typeof conn === 'string') {
          // Legacy string format
          return {
            id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: this.formatConnectionNameFromString(conn),
            connectionString: conn,
            databaseType: this.detectDatabaseType(conn),
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString()
          };
        } else {
          // Object format - ensure it has required fields
          return {
            id: conn.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: conn.name || this.formatConnectionNameFromString(conn.connectionString),
            connectionString: conn.connectionString,
            databaseType: conn.databaseType || this.detectDatabaseType(conn.connectionString),
            createdAt: conn.createdAt || new Date().toISOString(),
            lastUsed: conn.lastUsed || new Date().toISOString()
          };
        }
      });

      // Merge with existing connections (avoid duplicates)
      const existingConnectionStrings = new Set(
        data.savedConnections.map(conn => conn.connectionString)
      );

      const newConnections = migratedConnections.filter(
        conn => !existingConnectionStrings.has(conn.connectionString)
      );

      data.savedConnections = [...data.savedConnections, ...newConnections];

      const saveResult = await this.save(data);
      return { 
        success: saveResult.success, 
        migrated: newConnections.length > 0,
        migratedCount: newConnections.length,
        error: saveResult.error
      };
    } catch (error) {
      console.error('Error migrating connection data:', error);
      return { success: false, error: error.message, migrated: false };
    }
  }

  /**
   * Helper to format connection name from connection string
   */
  formatConnectionNameFromString(connectionString) {
    if (!connectionString) return 'Database Connection';
    
    try {
      if (connectionString.includes('mongodb+srv://')) {
        const match = connectionString.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^\/]+)/);
        if (match) {
          return `${match[3]} (Atlas)`;
        }
      } else if (connectionString.includes('mongodb://')) {
        const match = connectionString.match(/mongodb:\/\/(?:[^:]+:[^@]+@)?([^\/]+)/);
        if (match) {
          return match[1];
        }
      } else if (connectionString.includes('postgresql://') || connectionString.includes('postgres://')) {
        const match = connectionString.match(/postgres(?:ql)?:\/\/(?:[^:]+:[^@]+@)?([^\/]+)/);
        if (match) {
          return `${match[1]} (PostgreSQL)`;
        }
      }
      return 'Database Connection';
    } catch {
      return 'Database Connection';
    }
  }
}

module.exports = ConnectionStorage;