const { BaseDatabaseBuilder } = require('./base-database-builder');

/**
 * MongoDBDatabaseBuilder - MongoDB-specific implementation
 * 
 * Handles all MongoDB-specific operations for spreadsheet imports.
 */
class MongoDBDatabaseBuilder extends BaseDatabaseBuilder {
  constructor(dbConnection) {
    super(dbConnection);
  }

  /**
   * Get database type name for logging
   */
  getDatabaseTypeName() {
    return 'MongoDB';
  }

  /**
   * Get the MongoDB client for a connection
   */
  getClient(connectionId) {
    return this.dbConnection.clients?.get(connectionId);
  }

  /**
   * Get MongoDB database reference
   */
  getDatabase(connectionId, databaseName) {
    const client = this.getClient(connectionId);
    if (!client) {
      throw new Error(`No active MongoDB connection found for ID: ${connectionId}`);
    }
    return client.db(databaseName);
  }

  /**
   * Create a collection (MongoDB creates collections automatically on first insert,
   * but we can create it explicitly for consistency)
   */
  async createTable(connectionId, database, collectionName, columns, mapping) {
    // MongoDB doesn't require explicit collection creation
    // Collections are created automatically on first insert
    console.log(`📊 Collection ${collectionName} will be created on first insert`);
  }

  /**
   * Insert a batch of documents into MongoDB
   */
  async insertBatch(connectionId, database, collectionName, columns, documents) {
    if (documents.length === 0) return 0;
    
    const db = this.getDatabase(connectionId, database);
    const collection = db.collection(collectionName);
    
    try {
      const result = await collection.insertMany(documents, { ordered: false });
      return result.insertedCount || documents.length;
    } catch (error) {
      // Handle bulk write errors (some documents may have been inserted)
      if (error.result && error.result.insertedCount) {
        console.warn(`⚠️ Partial insert: ${error.result.insertedCount} of ${documents.length} documents`);
        return error.result.insertedCount;
      }
      throw error;
    }
  }

  /**
   * Create indexes on a MongoDB collection
   */
  async createIndexes(connectionId, database, collectionName, indexes) {
    const db = this.getDatabase(connectionId, database);
    const collection = db.collection(collectionName);
    
    for (const index of indexes) {
      try {
        await collection.createIndex(index.fields, index.options || {});
        console.log(`  ✅ Created index:`, index.fields);
      } catch (error) {
        console.warn(`  ⚠️ Failed to create index:`, error.message);
      }
    }
  }
}

module.exports = MongoDBDatabaseBuilder;

