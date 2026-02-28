const MongoDBDatabaseBuilder = require('./mongodb-database-builder');
const PostgreSQLDatabaseBuilder = require('./postgresql-database-builder');

/**
 * DatabaseBuilderFactory - Creates the appropriate database builder based on connection type
 * 
 * This factory pattern allows easy addition of new database types without
 * modifying existing code. Each database type has its own builder class
 * that extends BaseDatabaseBuilder.
 */
class DatabaseBuilderFactory {
  constructor(dbConnection) {
    this.dbConnection = dbConnection;
    this.builders = new Map();
  }

  /**
   * Get the database type for a connection
   */
  getDatabaseType(connectionId) {
    return this.dbConnection.connectionTypes?.get(connectionId) || 'mongodb';
  }

  /**
   * Get or create a builder for the specified database type
   */
  getBuilder(databaseType) {
    const normalizedType = databaseType.toLowerCase();
    
    if (!this.builders.has(normalizedType)) {
      const builder = this.createBuilder(normalizedType);
      this.builders.set(normalizedType, builder);
    }
    
    return this.builders.get(normalizedType);
  }

  /**
   * Get the appropriate builder for a connection ID
   */
  getBuilderForConnection(connectionId) {
    const dbType = this.getDatabaseType(connectionId);
    return this.getBuilder(dbType);
  }

  /**
   * Create a new builder instance for the specified database type
   */
  createBuilder(databaseType) {
    switch (databaseType) {
      case 'mongodb':
        return new MongoDBDatabaseBuilder(this.dbConnection);
      
      case 'postgresql':
        return new PostgreSQLDatabaseBuilder(this.dbConnection);
      
      // Add more database types here:
      // case 'mysql':
      //   return new MySQLDatabaseBuilder(this.dbConnection);
      // case 'sqlite':
      //   return new SQLiteDatabaseBuilder(this.dbConnection);
      
      default:
        throw new Error(`Unsupported database type: ${databaseType}`);
    }
  }

  /**
   * Execute AI design using the appropriate builder
   */
  async executeDesign(filePath, design, connectionId, database, progressCallback) {
    const builder = this.getBuilderForConnection(connectionId);
    return builder.executeDesign(filePath, design, connectionId, database, progressCallback);
  }

  /**
   * Execute simple direct import using the appropriate builder
   */
  async executeSimpleDirectImport(filePath, connectionId, database, progressCallback) {
    const builder = this.getBuilderForConnection(connectionId);
    return builder.executeSimpleDirectImport(filePath, connectionId, database, progressCallback);
  }

  /**
   * Check if a database type is supported
   */
  isSupported(databaseType) {
    const supportedTypes = ['mongodb', 'postgresql'];
    return supportedTypes.includes(databaseType.toLowerCase());
  }

  /**
   * Get list of supported database types
   */
  getSupportedTypes() {
    return ['mongodb', 'postgresql'];
  }
}

// For backward compatibility, export a class that can be instantiated the same way
// but internally uses the factory
class DatabaseBuilder {
  constructor(dbConnection) {
    this.factory = new DatabaseBuilderFactory(dbConnection);
  }

  async executeDesign(filePath, design, connectionId, database, progressCallback) {
    return this.factory.executeDesign(filePath, design, connectionId, database, progressCallback);
  }

  async executeSimpleDirectImport(filePath, connectionId, database, progressCallback) {
    return this.factory.executeSimpleDirectImport(filePath, connectionId, database, progressCallback);
  }

  getBuilderForConnection(connectionId) {
    return this.factory.getBuilderForConnection(connectionId);
  }

  isSupported(databaseType) {
    return this.factory.isSupported(databaseType);
  }
}

module.exports = DatabaseBuilder;
