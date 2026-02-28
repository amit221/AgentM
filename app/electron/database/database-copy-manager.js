const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class DatabaseCopyManager {
  constructor(databaseConnection) {
    this.databaseConnection = databaseConnection;
    this.activeOperations = new Map(); // Map of operation IDs to cancellable processes
  }

  // Get reference to clients and connection strings from main database connection
  get clients() {
    return this.databaseConnection.clients;
  }

  get connectionStrings() {
    return this.databaseConnection.connectionStrings;
  }

  /**
   * Duplicate an entire database using document-by-document copying
   */
  async duplicateDatabase(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    try {
      const targetClient = this.clients.get(targetConnectionId);
      if (!targetClient) {
        throw new Error('Target connection not found');
      }

      // Determine source client - if sourceConnectionId is provided, use it; otherwise use target (same connection)
      const sourceClient = sourceConnectionId ? this.clients.get(sourceConnectionId) : targetClient;
      if (!sourceClient) {
        throw new Error('Source connection not found');
      }

      const sourceDb = sourceClient.db(sourceDatabaseName);
      const targetDb = targetClient.db(targetDatabaseName);

      // Check if target database already exists and has collections
      let existingCollections = [];
      try {
        existingCollections = await targetDb.listCollections().toArray();
      } catch (error) {
        // Database doesn't exist yet, which is fine
      }

      // If target database exists and has collections, drop them first to avoid duplicates
      if (existingCollections.length > 0) {
        console.log(`Target database '${targetDatabaseName}' already exists with ${existingCollections.length} collections. Clearing existing collections...`);
        
        for (const existingCollection of existingCollections) {
          try {
            await targetDb.collection(existingCollection.name).drop();
          } catch (error) {
            // Collection might not exist or might have been dropped already
            console.warn(`Could not drop collection ${existingCollection.name}:`, error.message);
          }
        }
      }

      // Get all collections from source database
      const collections = await sourceDb.listCollections().toArray();
      
      // Use atomic counters for thread safety
      const stats = {
        copiedCollections: 0,
        totalDocuments: 0,
        errors: []
      };

      // Report initial progress
      if (progressCallback) {
        progressCallback({
          stage: 'initializing',
          currentCollection: null,
          copiedCollections: stats.copiedCollections,
          totalCollections: collections.length,
          currentDocuments: 0,
          totalDocuments: stats.totalDocuments,
          errors: [...stats.errors]
        });
      }

      // Process collections with limited parallelism for better performance
      const maxConcurrency = Math.min(3, collections.length); // Max 3 concurrent collections
      const semaphore = { count: maxConcurrency };
      
      const processCollection = async (collectionInfo, index) => {
        // Wait for semaphore
        while (semaphore.count <= 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        semaphore.count--;
        
        try {
          // Report progress before starting collection
          if (progressCallback) {
            progressCallback({
              stage: 'copying_collection',
              currentCollection: collectionInfo.name,
              copiedCollections: stats.copiedCollections,
              totalCollections: collections.length,
              currentDocuments: 0,
              totalDocuments: stats.totalDocuments,
              errors: [...stats.errors]
            });
          }

          const result = await this.duplicateCollection(
            targetConnectionId, 
            sourceDatabaseName, 
            collectionInfo.name, 
            targetDatabaseName, 
            collectionInfo.name,
            sourceConnectionId, // Pass source connection ID (or null for same connection)
            (docProgress) => {
              // Forward document-level progress (throttled)
              if (progressCallback && docProgress.copiedDocuments % 5000 === 0) {
                progressCallback({
                  stage: 'copying_documents',
                  currentCollection: collectionInfo.name,
                  copiedCollections: stats.copiedCollections,
                  totalCollections: collections.length,
                  currentDocuments: docProgress.copiedDocuments,
                  totalDocuments: stats.totalDocuments + docProgress.totalDocuments,
                  errors: [...stats.errors]
                });
              }
            }
          );
          
          if (result.success) {
            stats.copiedCollections++;
            stats.totalDocuments += result.documentsCopied || 0;
            
            // Report progress after completing collection
            if (progressCallback) {
              progressCallback({
                stage: 'collection_completed',
                currentCollection: collectionInfo.name,
                copiedCollections: stats.copiedCollections,
                totalCollections: collections.length,
                currentDocuments: result.documentsCopied || 0,
                totalDocuments: stats.totalDocuments,
                errors: [...stats.errors]
              });
            }
          } else {
            stats.errors.push({ collection: collectionInfo.name, error: result.error });
          }
        } catch (error) {
          stats.errors.push({ collection: collectionInfo.name, error: error.message });
        } finally {
          semaphore.count++;
        }
      };

      // Process collections with controlled concurrency
      const promises = collections.map((collectionInfo, index) => 
        processCollection(collectionInfo, index)
      );
      
      await Promise.all(promises);

      // Report final progress
      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          currentCollection: null,
          copiedCollections: stats.copiedCollections,
          totalCollections: collections.length,
          currentDocuments: 0,
          totalDocuments: stats.totalDocuments,
          errors: [...stats.errors]
        });
      }

      return {
        success: true,
        copiedCollections: stats.copiedCollections,
        totalCollections: collections.length,
        totalDocuments: stats.totalDocuments,
        errors: stats.errors.length > 0 ? stats.errors : undefined
      };
    } catch (error) {
      console.error('Error duplicating database:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Duplicate a single collection
   */
  async duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null, progressCallback = null) {
    try {
      const targetClient = this.clients.get(targetConnectionId);
      if (!targetClient) {
        throw new Error('Target connection not found');
      }

      // Determine source client - if sourceConnectionId is provided, use it; otherwise use target (same connection)
      const sourceClient = sourceConnectionId ? this.clients.get(sourceConnectionId) : targetClient;
      if (!sourceClient) {
        throw new Error('Source connection not found');
      }

      const sourceDb = sourceClient.db(sourceDatabaseName);
      const targetDb = targetClient.db(targetDatabaseName);
      
      const sourceCollection = sourceDb.collection(sourceCollectionName);
      const targetCollection = targetDb.collection(targetCollectionName);

      // Check if target collection already exists and drop it to avoid duplicates
      try {
        const collections = await targetDb.listCollections({ name: targetCollectionName }).toArray();
        if (collections.length > 0) {
          console.log(`Target collection '${targetCollectionName}' already exists. Dropping it to avoid duplicates...`);
          await targetCollection.drop();
        }
      } catch (error) {
        // Collection doesn't exist yet, which is fine
      }

      // Get document count first (with timeout to avoid hanging)
      const totalDocuments = await sourceCollection.countDocuments({}, { maxTimeMS: 30000 });
      
      // Report initial progress
      if (progressCallback) {
        progressCallback({
          totalDocuments,
          copiedDocuments: 0,
          stage: 'counting'
        });
      }

      let copiedDocuments = 0;

      if (totalDocuments > 0) {
        // Use larger batch sizes for better performance
        const batchSize = Math.min(10000, Math.max(1000, totalDocuments / 100)); // Dynamic batch size
        const cursor = sourceCollection.find({}, {
          batchSize: batchSize,
          noCursorTimeout: true, // Prevent cursor timeout for large collections
          readPreference: 'secondaryPreferred' // Use secondary if available for better performance
        });
        
        let progressUpdateCounter = 0;
        const progressUpdateInterval = Math.max(1, Math.floor(batchSize / 5000)); // Throttle progress updates
        
        // Process in batches using more efficient approach
        while (await cursor.hasNext()) {
          const batch = [];
          
          // Fill batch
          for (let i = 0; i < batchSize && await cursor.hasNext(); i++) {
            batch.push(await cursor.next());
          }
          
          if (batch.length > 0) {
            // Use ordered: false for better performance on inserts
            await targetCollection.insertMany(batch, { 
              ordered: false,
              writeConcern: { w: 1, j: false }, // Faster write concern
              bypassDocumentValidation: true // Skip validation for faster inserts
            });
            copiedDocuments += batch.length;
            
            // Throttle progress updates to avoid UI blocking
            progressUpdateCounter++;
            if (progressCallback && progressUpdateCounter % progressUpdateInterval === 0) {
              progressCallback({
                totalDocuments,
                copiedDocuments,
                stage: 'copying'
              });
            }
          }
        }

        // Final progress update
        if (progressCallback) {
          progressCallback({
            totalDocuments,
            copiedDocuments,
            stage: 'copying'
          });
        }
      }

      // Copy indexes if any exist
      if (progressCallback) {
        progressCallback({
          totalDocuments,
          copiedDocuments,
          stage: 'copying_indexes'
        });
      }

      try {
        const indexes = await sourceCollection.listIndexes().toArray();
        for (const index of indexes) {
          // Skip the default _id index
          if (index.name !== '_id_') {
            const indexSpec = { ...index.key };
            const indexOptions = { name: index.name };
            
            // Copy other index options if they exist
            if (index.unique) indexOptions.unique = index.unique;
            if (index.sparse) indexOptions.sparse = index.sparse;
            if (index.expireAfterSeconds) indexOptions.expireAfterSeconds = index.expireAfterSeconds;
            
            await targetCollection.createIndex(indexSpec, indexOptions);
          }
        }
      } catch (indexError) {
        console.warn('Could not copy indexes:', indexError.message);
      }

      // Report completion
      if (progressCallback) {
        progressCallback({
          totalDocuments,
          copiedDocuments,
          stage: 'completed'
        });
      }

      return {
        success: true,
        documentsCopied: copiedDocuments,
        totalDocuments
      };
    } catch (error) {
      console.error('Error duplicating collection:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete an entire database
   */
  async deleteDatabase(connectionId, databaseName) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      // Get all collections in the database first
      const db = client.db(databaseName);
      const collections = await db.listCollections().toArray();
      
      let deletedCollections = 0;
      const errors = [];

      // Delete all collections in the database
      for (const collectionInfo of collections) {
        try {
          await db.collection(collectionInfo.name).drop();
          deletedCollections++;
        } catch (error) {
          // If collection doesn't exist, that's fine
          if (!error.message.includes('ns not found')) {
            errors.push({ collection: collectionInfo.name, error: error.message });
          }
        }
      }

      // Drop the database itself
      await db.dropDatabase();

      return {
        success: true,
        deletedCollections,
        totalCollections: collections.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('Error deleting database:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rename a database by copying all collections to a new database and deleting the old one
   */
  async renameDatabase(connectionId, oldDatabaseName, newDatabaseName, progressCallback = null) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      // Check if the new database name already exists
      const admin = client.db().admin();
      const databases = await admin.listDatabases();
      const existingDb = databases.databases.find(db => db.name === newDatabaseName);
      
      if (existingDb) {
        throw new Error(`Database "${newDatabaseName}" already exists`);
      }

      // Get all collections in the source database
      const sourceDb = client.db(oldDatabaseName);
      const collections = await sourceDb.listCollections().toArray();
      
      if (collections.length === 0) {
        // If no collections, just drop the old database
        await sourceDb.dropDatabase();
        return {
          success: true,
          renamedCollections: 0,
          totalCollections: 0,
          errors: []
        };
      }

      const targetDb = client.db(newDatabaseName);
      let renamedCollections = 0;
      const errors = [];

      // Copy each collection to the new database
      for (let i = 0; i < collections.length; i++) {
        const collectionInfo = collections[i];
        const collectionName = collectionInfo.name;
        
        try {
          if (progressCallback) {
            progressCallback({
              stage: 'copying',
              currentCollection: collectionName,
              copiedCollections: i,
              totalCollections: collections.length,
              currentDocuments: 0,
              totalDocuments: 0,
              errors: []
            });
          }

          // Get the source collection
          const sourceCollection = sourceDb.collection(collectionName);
          const targetCollection = targetDb.collection(collectionName);

          // Copy all documents
          const cursor = sourceCollection.find({});
          const documents = await cursor.toArray();
          
          if (documents.length > 0) {
            await targetCollection.insertMany(documents);
          }

          // Copy indexes (except the default _id index)
          const indexes = await sourceCollection.indexes();
          for (const index of indexes) {
            if (index.name !== '_id_') {
              try {
                await targetCollection.createIndex(index.key, {
                  name: index.name,
                  ...index
                });
              } catch (indexError) {
                // Index creation errors are not critical
                console.warn(`Failed to create index ${index.name}:`, indexError.message);
              }
            }
          }

          renamedCollections++;
          
          if (progressCallback) {
            progressCallback({
              stage: 'copying',
              currentCollection: collectionName,
              copiedCollections: i + 1,
              totalCollections: collections.length,
              currentDocuments: documents.length,
              totalDocuments: documents.length,
              errors: []
            });
          }
        } catch (error) {
          errors.push({ collection: collectionName, error: error.message });
        }
      }

      // If all collections were copied successfully, delete the old database
      if (errors.length === 0) {
        try {
          await sourceDb.dropDatabase();
          
          if (progressCallback) {
            progressCallback({
              stage: 'completed',
              currentCollection: null,
              copiedCollections: collections.length,
              totalCollections: collections.length,
              currentDocuments: 0,
              totalDocuments: 0,
              errors: []
            });
          }
        } catch (dropError) {
          // If we can't drop the old database, that's a problem
          errors.push({ collection: 'database_drop', error: dropError.message });
        }
      }

      return {
        success: errors.length === 0,
        renamedCollections,
        totalCollections: collections.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('Error renaming database:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a single collection
   */
  async deleteCollection(connectionId, databaseName, collectionName) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      // Test connection before proceeding
      await client.db('admin').admin().ping();

      const db = client.db(databaseName);
      const collection = db.collection(collectionName);

      // Get document count before deletion (with timeout)
      const documentCount = await collection.countDocuments({}, { maxTimeMS: 10000 });
      
      // Drop the collection
      await collection.drop();

      // Verify the collection was actually dropped
      const collectionsAfter = await db.listCollections({ name: collectionName }).toArray();
      if (collectionsAfter.length > 0) {
        throw new Error('Collection was not successfully deleted');
      }

      return {
        success: true,
        documentsDeleted: documentCount
      };
    } catch (error) {
      console.error('Error deleting collection:', error);
      
      // Check if the error is due to collection not existing (which is okay)
      if (error.message.includes('ns not found') || error.message.includes('Collection') && error.message.includes('not found')) {
        return {
          success: true,
          documentsDeleted: 0,
          message: 'Collection was already deleted or did not exist'
        };
      }
      
      // Check if connection is still alive
      try {
        const client = this.clients.get(connectionId);
        if (client) {
          await client.db('admin').admin().ping();
        }
      } catch (pingError) {
        console.error('Connection lost after delete operation:', pingError);
        // Remove the dead connection
        this.clients.delete(connectionId);
        return {
          success: false,
          error: 'Connection lost during delete operation',
          connectionLost: true
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Duplicate database using MongoDB dump/restore tools for high performance
   */
  async duplicateDatabaseViaDumpRestore(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    // Generate unique operation ID for cancellation support
    const operationId = `dump_restore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Get source and target connection strings
      const sourceConnectionString = this.connectionStrings.get(sourceConnectionId || targetConnectionId);
      const targetConnectionString = this.connectionStrings.get(targetConnectionId);
      
      if (!sourceConnectionString || !targetConnectionString) {
        throw new Error('Connection strings not found');
      }
      
      // Initialize operation tracking
      this.activeOperations.set(operationId, {
        type: 'dump_restore',
        stage: 'starting',
        processes: [],
        cancelled: false,
        tempDir: null
      });

      // Get MongoDB tools paths
      const toolsPaths = await this.getMongoDatabaseToolsPaths();
      if (!toolsPaths.mongodump || !toolsPaths.mongorestore) {
        throw new Error('MongoDB database tools not found');
      }

      // Create temporary directory for dump
      const tempDir = path.join(os.tmpdir(), `mongo_dump_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      console.log(`🗂️  Starting dump/restore operation: ${sourceDatabaseName} → ${targetDatabaseName}`);
      console.log(`📁 Using temp directory: ${tempDir}`);

      if (progressCallback) {
        progressCallback({
          stage: 'dumping',
          currentCollection: null,
          progress: 0,
          message: `Dumping database: ${sourceDatabaseName}`
        });
      }

      // Store temp directory for cleanup on cancellation
      const operation = this.activeOperations.get(operationId);
      operation.tempDir = tempDir;

      // Step 1: mongodump - dump source database
      const dumpResult = await this.executeMongoDump(
        toolsPaths.mongodump, 
        sourceConnectionString, 
        sourceDatabaseName, 
        tempDir,
        progressCallback,
        operationId
      );

      if (progressCallback) {
        progressCallback({
          stage: 'restoring',
          currentCollection: null,
          progress: 50,
          message: `Restoring to database: ${targetDatabaseName}`
        });
      }

      // Step 2: mongorestore - restore to target database
      const restoreResult = await this.executeMongoRestore(
        toolsPaths.mongorestore, 
        targetConnectionString, 
        sourceDatabaseName, 
        targetDatabaseName, 
        tempDir,
        progressCallback,
        operationId
      );

      // Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`🧹 Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupError) {
        console.warn(`Warning: Could not clean up temp directory: ${cleanupError.message}`);
      }

      if (progressCallback) {
        progressCallback({
          stage: 'completed',
          currentCollection: null,
          progress: 100,
          message: 'Database copy completed successfully using mongodump/mongorestore'
        });
      }

      console.log(`✅ Database copy completed successfully using dump/restore method`);
      
      // Extract collection counts from the results
      const totalCollections = restoreResult.stats?.collections || dumpResult.stats?.collections || 0;
      
      return {
        success: true,
        message: `Database copied successfully using mongodump/mongorestore`,
        method: 'dump_restore',
        copiedCollections: totalCollections,
        totalCollections: totalCollections,
        totalDocuments: 0, // Don't track documents in fast mode
        dumpStats: dumpResult.stats,
        restoreStats: restoreResult.stats
      };

    } catch (error) {
      console.error('❌ Error in dump/restore operation:', error);
      
      // Check if it was cancelled
      const operation = this.activeOperations.get(operationId);
      const wasCancelled = operation && operation.cancelled;
      
      return {
        success: false,
        error: wasCancelled ? 'Operation cancelled by user' : error.message,
        method: 'dump_restore',
        cancelled: wasCancelled
      };
    } finally {
      // Clean up operation tracking
      if (this.activeOperations.has(operationId)) {
        const operation = this.activeOperations.get(operationId);
        
        // Clean up temp directory if it exists
        if (operation.tempDir) {
          try {
            fs.rmSync(operation.tempDir, { recursive: true, force: true });
            console.log(`🧹 Cleaned up temp directory: ${operation.tempDir}`);
          } catch (cleanupError) {
            console.warn(`Warning: Could not clean up temp directory: ${cleanupError.message}`);
          }
        }
        
        this.activeOperations.delete(operationId);
      }
    }
  }

  /**
   * Enhanced duplicateDatabase with method selection
   */
  async duplicateDatabaseWithMethod(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, method = 'auto', progressCallback = null) {
    try {
      // Auto-select method if not specified
      if (method === 'auto') {
        // Try to get database size to make intelligent choice
        try {
          const sourceClient = sourceConnectionId ? 
            this.clients.get(sourceConnectionId) : 
            this.clients.get(targetConnectionId);
          
          if (sourceClient) {
            const dbStats = await sourceClient.db(sourceDatabaseName).stats();
            const dbSizeGB = dbStats.dataSize / (1024 * 1024 * 1024);
            
            // Use dump/restore for databases larger than 100MB
            method = dbSizeGB > 0.1 ? 'dump_restore' : 'document_copy';
            console.log(`📊 Auto-selected method '${method}' for database size: ${dbSizeGB.toFixed(2)}GB`);
          } else {
            method = 'dump_restore'; // Default to dump/restore
          }
        } catch (error) {
          console.log(`⚠️  Could not determine database size, defaulting to dump_restore`);
          method = 'dump_restore';
        }
      }

      console.log(`🔄 Starting database duplication using method: ${method}`);

      if (method === 'dump_restore') {
        return await this.duplicateDatabaseViaDumpRestore(
          targetConnectionId, 
          sourceDatabaseName, 
          targetDatabaseName, 
          sourceConnectionId, 
          progressCallback
        );
      } else if (method === 'document_copy') {
        return await this.duplicateDatabase(
          targetConnectionId, 
          sourceDatabaseName, 
          targetDatabaseName, 
          sourceConnectionId, 
          progressCallback
        );
      } else {
        throw new Error(`Unknown duplication method: ${method}`);
      }
    } catch (error) {
      console.error(`❌ Error in duplicateDatabaseWithMethod:`, error);
      return {
        success: false,
        error: error.message,
        method: method
      };
    }
  }

  /**
   * Cancel an active operation
   */
  cancelOperation(operationId) {
    if (this.activeOperations.has(operationId)) {
      const operation = this.activeOperations.get(operationId);
      operation.cancelled = true;
      
      console.log(`🛑 Cancelling operation: ${operationId}`);
      
      // Kill all associated processes
      operation.processes.forEach(process => {
        if (process && !process.killed) {
          console.log(`🔪 Killing process PID: ${process.pid}`);
          process.kill('SIGTERM');
          
          // Force kill after 3 seconds if still running
          setTimeout(() => {
            if (process && !process.killed) {
              console.log(`🔪 Force killing process PID: ${process.pid}`);
              process.kill('SIGKILL');
            }
          }, 3000);
        }
      });
      
      return { success: true, message: 'Operation cancelled' };
    }
    
    return { success: false, message: 'Operation not found' };
  }

  /**
   * Check if dump/restore tools are available
   */
  async checkDumpRestoreAvailability() {
    try {
      await this.getMongoDatabaseToolsPaths();
      return { available: true, error: null };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  /**
   * Helper method to get database tools paths - simplified approach
   */
  async getMongoDatabaseToolsPaths() {
    const { app } = require('electron');

    try {
      const platform = os.platform();
      const arch = os.arch();
      const shellExtension = platform === 'win32' ? '.exe' : '';
      
      // Determine shell directory based on platform and architecture
      let shellDir;
      switch (platform) {
        case 'darwin': // macOS
          shellDir = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
          break;
        case 'win32': // Windows
          shellDir = arch === 'x64' ? 'windows-x64' : 'windows-x86';
          break;
        case 'linux': // Linux
          shellDir = arch === 'x64' ? 'linux-x64' : 'linux-x86';
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Try different possible base paths
      const possibleBasePaths = [];
      
      if (app && app.isPackaged) {
        possibleBasePaths.push(
          path.join(process.resourcesPath, 'shells'),
          path.join(app.getAppPath(), 'shells'),
          path.join(__dirname, '..', 'shells')
        );
      } else {
        possibleBasePaths.push(
          path.join(__dirname, 'shells'),
          path.join(__dirname, '..', 'shells')
        );
      }

      console.log(`🔍 Looking for database tools for platform: ${shellDir}`);
      console.log(`🔍 Searching in paths: ${possibleBasePaths.join(', ')}`);
      
      // Check each possible location for database tools (now in mongotools directory)
      for (const basePath of possibleBasePaths) {
        const mongoToolsDir = path.join(basePath, shellDir, 'mongotools', 'bin');
        const mongodumpPath = path.join(mongoToolsDir, `mongodump${shellExtension}`);
        const mongorestorePath = path.join(mongoToolsDir, `mongorestore${shellExtension}`);
        
        console.log(`📁 Checking tools in: ${mongoToolsDir}`);
        console.log(`   mongodump: ${mongodumpPath} (exists: ${fs.existsSync(mongodumpPath)})`);
        console.log(`   mongorestore: ${mongorestorePath} (exists: ${fs.existsSync(mongorestorePath)})`);
        
        if (fs.existsSync(mongodumpPath) && fs.existsSync(mongorestorePath)) {
          console.log(`🔧 Found MongoDB database tools at: ${mongoToolsDir}`);
          return {
            mongodump: mongodumpPath,
            mongorestore: mongorestorePath
          };
        }
      }
      
      throw new Error('MongoDB database tools (mongodump/mongorestore) not found in bundled installation');
    } catch (error) {
      console.error('❌ Error detecting database tools:', error.message);
      throw new Error(`MongoDB database tools not available: ${error.message}`);
    }
  }

  /**
   * Helper method to parse connection string and extract database
   */
  parseConnectionString(connectionString) {
    try {
      // MongoDB connection strings can have complex formats, especially with replica sets
      // Let's use regex parsing to properly handle the URI structure
      
      // MongoDB URI structure: mongodb://[host]:[port]/[database][?options]
      // We need to distinguish between host:port and actual database names
      
      // First, check if this is a proper MongoDB URI
      if (!connectionString.startsWith('mongodb://') && !connectionString.startsWith('mongodb+srv://')) {
        // Not a MongoDB URI, treat as-is
        return {
          cleanUri: connectionString,
          dbFromUri: null
        };
      }
      
      // Parse the URI to extract database properly
      // Look for the pattern: mongodb://[auth@]host[:port][,host[:port]...]/[database][?options]
      const uriMatch = connectionString.match(/^(mongodb(?:\+srv)?:\/\/(?:[^@\/]+@)?[^\/]+)(\/([^?]+))?(\?.*)?$/);
      
      if (!uriMatch) {
        // Couldn't parse properly, return as-is
        return {
          cleanUri: connectionString,
          dbFromUri: null
        };
      }
      
      const [, baseUri, , dbFromUri, queryString] = uriMatch;
      
      // If there's a database in the URI, create clean URI without it
      let cleanUri;
      if (dbFromUri) {
        // Reconstruct URI without database: baseUri + / + queryString (if exists)
        cleanUri = baseUri + (queryString || '');
      } else {
        cleanUri = connectionString;
      }
      
      return {
        cleanUri,
        dbFromUri: dbFromUri || null
      };
    } catch (error) {
      console.warn('Could not parse connection string:', error.message);
      return {
        cleanUri: connectionString,
        dbFromUri: null
      };
    }
  }

  /**
   * Execute mongodump
   */
  async executeMongoDump(mongodumpPath, connectionString, databaseName, outputDir, progressCallback = null, operationId = null) {
    return new Promise((resolve, reject) => {
      // Parse connection string to check if database is already specified
      const { cleanUri, dbFromUri } = this.parseConnectionString(connectionString);
      
      let finalUri = connectionString;
      const args = [
        '--out', outputDir,
        '--gzip', // Compress output for faster transfer
        '--numParallelCollections', '4', // Parallel processing
        '--verbose' // Get detailed output for progress tracking
      ];

      // Handle database specification
      if (!dbFromUri) {
        // No database in URI, use clean URI and --db option
        finalUri = cleanUri;
        args.unshift('--db', databaseName);
      } else if (dbFromUri !== databaseName) {
        // Different database in URI, use clean URI and --db option
        finalUri = cleanUri;
        args.unshift('--db', databaseName);
        console.log(`Removed database '${dbFromUri}' from URI to use --db ${databaseName}`);
      } else {
        // Same database in URI, use original URI (no --db needed)
        finalUri = connectionString;
        console.log(`Using database from URI: ${dbFromUri}`);
      }

      // Validate the final URI before executing mongodump
      if (!finalUri || finalUri.trim() === '' || finalUri.endsWith('://')) {
        reject(new Error(`Invalid MongoDB URI: '${finalUri}'. URI must contain at least one host.`));
        return;
      }

      // Add URI to the beginning
      args.unshift('--uri', finalUri);

      console.log(`🚀 Executing mongodump: ${mongodumpPath} ${args.filter(arg => !arg.includes('://')).join(' ')}`);

      const mongodump = spawn(mongodumpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Track the process for cancellation
      if (operationId && this.activeOperations.has(operationId)) {
        const operation = this.activeOperations.get(operationId);
        operation.processes.push(mongodump);
        operation.stage = 'dumping';
      }

      let output = '';
      let errorOutput = '';
      let collections = [];

      let estimatedCollections = 0;
      let processedCollections = 0;
      const startTime = Date.now();
      
      // Function to parse and report progress from output
      const parseProgress = (text, isStderr = false) => {
        // Check if operation was cancelled
        if (operationId && this.activeOperations.has(operationId)) {
          const operation = this.activeOperations.get(operationId);
          if (operation.cancelled) {
            mongodump.kill('SIGTERM');
            return;
          }
        }
        
        // Look for detailed progress patterns in stderr (where mongodump logs progress)
        if (isStderr && progressCallback) {
          // Pattern for progress bars like: [#.......................]  database.collection  123456/7890123  (15.6%)
          // Also handle size-based progress: [#.......................]  database.collection  10.7MB/23.5MB  (45.4%)
          const progressPattern = /\[([#.]+)\]\s+([^.]+)\.(\w+)\s+([0-9.]+(?:[KMGT]?B)?|[\d]+)\/([0-9.]+(?:[KMGT]?B)?|[\d]+)\s+\(([0-9.]+)%\)/g;
          let progressMatch;
          let totalProgress = 0;
          let collectionCount = 0;
          let progressDetails = [];
          
          // Find all progress matches in the current text
          while ((progressMatch = progressPattern.exec(text)) !== null) {
            const [, progressBar, database, collection, current, total, percentage] = progressMatch;
            const collectionName = collection;
            const percent = parseFloat(percentage);
            
            // Calculate progress from the visual progress bar
            const progressChars = progressBar.match(/#/g);
            const totalChars = progressBar.length;
            const barProgress = progressChars ? (progressChars.length / totalChars) * 100 : 0;
            
            progressDetails.push({
              collection: collectionName,
              current: current,
              total: total,
              percentage: percent,
              progressBar,
              barProgress
            });
            
            totalProgress += percent;
            collectionCount++;
            
            // Track unique collections
            if (!collections.includes(collectionName)) {
              collections.push(collectionName);
            }
          }
          
          // If we found progress information, report it
          if (progressDetails.length > 0) {
            const avgProgress = Math.min(45, totalProgress / collectionCount); // Cap at 45% for dump phase
            const currentDetail = progressDetails[progressDetails.length - 1];
            const currentCollection = currentDetail.collection;
            const currentPercent = currentDetail.percentage;
            
            progressCallback({
              stage: 'dumping',
              currentCollection: currentCollection,
              copiedCollections: collections.length,
              totalCollections: Math.max(estimatedCollections, collections.length),
              progress: avgProgress,
              message: `Dumping ${currentCollection}: ${currentDetail.current}/${currentDetail.total} (${currentPercent.toFixed(1)}%)`,
              method: 'dump_restore',
              details: progressDetails,
              // Add detailed progress info similar to mongorestore
              collectionProgress: {
                collection: currentCollection,
                currentSize: currentDetail.current,
                totalSize: currentDetail.total,
                percentage: currentPercent,
                progressBar: currentDetail.progressBar,
                barProgress: currentDetail.barProgress
              },
              operationId: operationId
            });
          }
          
          // Pattern for "writing database.collection to file" (fallback for basic progress)
          const writingPattern = /writing [^.]+\.([\w-]+) to/i;
          const writingMatch = text.match(writingPattern);
          
          if (writingMatch && progressDetails.length === 0) {
            const collectionName = writingMatch[1];
            
            if (!collections.includes(collectionName)) {
              collections.push(collectionName);
              processedCollections++;
              
              progressCallback({
                stage: 'dumping_collection',
                currentCollection: collectionName,
                copiedCollections: processedCollections,
                totalCollections: Math.max(estimatedCollections, processedCollections + 1),
                progress: Math.min(45, (processedCollections * 5)),
                message: `Dumping collection: ${collectionName}`,
                method: 'dump_restore'
              });
            }
          }
          
          // Look for collection count estimate
          const totalMatch = text.match(/(\d+) collections/i);
          if (totalMatch) {
            estimatedCollections = parseInt(totalMatch[1]);
          }
        }
      };

      mongodump.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        parseProgress(text, false);
      });

      mongodump.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        parseProgress(text, true);
      });

      mongodump.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ mongodump completed successfully`);
          
          // Final progress update
          if (progressCallback) {
            progressCallback({
              stage: 'dump_completed',
              currentCollection: null,
              copiedCollections: collections.length,
              totalCollections: collections.length,
              progress: 50,
              message: `Dump completed: ${collections.length} collections`,
              method: 'dump_restore'
            });
          }
          
          resolve({ 
            success: true, 
            output,
            stats: {
              collections: collections.length,
              method: 'mongodump'
            }
          });
        } else {
          console.error(`❌ mongodump failed with code ${code}`);
          reject(new Error(`mongodump failed with code ${code}: ${errorOutput}`));
        }
      });

      mongodump.on('error', (error) => {
        reject(new Error(`Failed to execute mongodump: ${error.message}`));
      });
    });
  }

  /**
   * Execute mongorestore
   */
  async executeMongoRestore(mongorestorePath, connectionString, sourceDatabaseName, targetDatabaseName, inputDir, progressCallback = null, operationId = null) {
    return new Promise((resolve, reject) => {
      const dumpPath = path.join(inputDir, sourceDatabaseName);
      
      // Parse connection string to check if database is already specified
      const { cleanUri, dbFromUri } = this.parseConnectionString(connectionString);
      
      // For mongorestore, always use clean URI and --db to specify target database
      const args = [
        '--uri', cleanUri,
        '--db', targetDatabaseName,
        '--gzip', // Handle compressed input
        '--drop', // Drop existing collections in target database
        '--numParallelCollections', '4', // Parallel processing
        '--numInsertionWorkersPerCollection', '2', // More insertion workers
        '--verbose', // Get detailed output for progress tracking
        dumpPath
      ];
      
      if (dbFromUri) {
        console.log(`Removed database '${dbFromUri}' from URI to avoid conflict with --db ${targetDatabaseName}`);
      }

      // Validate the clean URI before executing mongorestore
      if (!cleanUri || cleanUri.trim() === '' || cleanUri.endsWith('://')) {
        reject(new Error(`Invalid MongoDB URI: '${cleanUri}'. URI must contain at least one host.`));
        return;
      }

      console.log(`🚀 Executing mongorestore: ${mongorestorePath} ${args.filter(arg => !arg.includes('://')).join(' ')}`);

      const mongorestore = spawn(mongorestorePath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Track the process for cancellation
      if (operationId && this.activeOperations.has(operationId)) {
        const operation = this.activeOperations.get(operationId);
        operation.processes.push(mongorestore);
        operation.stage = 'restoring';
      }

      let output = '';
      let errorOutput = '';
      let collections = [];

      let estimatedCollections = 0;
      let processedCollections = 0;
      
      // Function to parse and report progress from output
      const parseProgress = (text, isStderr = false) => {
        // Check if operation was cancelled
        if (operationId && this.activeOperations.has(operationId)) {
          const operation = this.activeOperations.get(operationId);
          if (operation.cancelled) {
            mongorestore.kill('SIGTERM');
            return;
          }
        }
        
        // Debug: log the actual output to see what we're getting
        if (text.trim()) {
          console.log(`📝 mongorestore ${isStderr ? 'stderr' : 'stdout'}:`, text.trim());
        }
        
        // Look for collection restoration patterns in stderr (where mongorestore logs)
        if (isStderr) {
          // Pattern for detailed progress bars: [####........] collection_name 10.7MB/23.5MB (45.4%)
          const progressBarPattern = /\[([#.]+)\]\s+([^.]+\.)?([^\s]+)\s+([0-9.]+[KMGT]?B)\/([0-9.]+[KMGT]?B)\s+\(([0-9.]+)%\)/i;
          const progressMatch = text.match(progressBarPattern);
          
          if (progressMatch && progressCallback) {
            const progressBar = progressMatch[1];
            const collectionName = progressMatch[3];
            const currentSize = progressMatch[4];
            const totalSize = progressMatch[5];
            const percentage = parseFloat(progressMatch[6]);
            
            // Calculate progress from the visual progress bar
            const progressChars = progressBar.match(/#/g);
            const totalChars = progressBar.length;
            const barProgress = progressChars ? (progressChars.length / totalChars) * 100 : 0;
            
            progressCallback({
              stage: 'restoring_collection',
              currentCollection: collectionName,
              copiedCollections: processedCollections,
              totalCollections: Math.max(estimatedCollections, processedCollections + 1),
              progress: 50 + Math.min(45, (processedCollections * 5)),
              message: `Restoring ${collectionName}: ${currentSize}/${totalSize} (${percentage}%)`,
              method: 'dump_restore',
              // Detailed progress info
              collectionProgress: {
                collection: collectionName,
                currentSize,
                totalSize,
                percentage,
                progressBar,
                barProgress
              }
            });
          }
          
          // Pattern for "restoring collection techsee_dev_copy.collectionName from file"
          const collectionPattern = /restoring collection [^.]+\.([\w-]+) from/i;
          const collectionMatch = text.match(collectionPattern);
          
          if (collectionMatch && progressCallback && !progressMatch) {
            const collectionName = collectionMatch[1];
            
            if (!collections.includes(collectionName)) {
              collections.push(collectionName);
              processedCollections++;
              
              progressCallback({
                stage: 'restoring_collection',
                currentCollection: collectionName,
                copiedCollections: processedCollections,
                totalCollections: Math.max(estimatedCollections, processedCollections + 1),
                progress: 50 + Math.min(45, (processedCollections * 5)),
                message: `Restoring collection: ${collectionName}`,
                method: 'dump_restore'
              });
            }
          }
          
          // Look for "creating collection" patterns as backup
          const createPattern = /creating collection [^.]+\.([\w-]+)/i;
          const createMatch = text.match(createPattern);
          
          if (createMatch && progressCallback && !progressMatch && !collectionMatch) {
            const collectionName = createMatch[1];
            
            if (!collections.includes(collectionName)) {
              collections.push(collectionName);
              processedCollections++;
              
              progressCallback({
                stage: 'creating_collection',
                currentCollection: collectionName,
                copiedCollections: processedCollections,
                totalCollections: Math.max(estimatedCollections, processedCollections + 1),
                progress: 50 + Math.min(45, (processedCollections * 5)),
                message: `Creating collection: ${collectionName}`,
                method: 'dump_restore'
              });
            }
          }
        }
      };

      mongorestore.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        parseProgress(text, false);
      });

      mongorestore.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        parseProgress(text, true);
      });

      mongorestore.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ mongorestore completed successfully`);
          
          // Final progress update
          if (progressCallback) {
            progressCallback({
              stage: 'restore_completed',
              currentCollection: null,
              copiedCollections: collections.length,
              totalCollections: collections.length,
              progress: 100,
              message: `Restore completed: ${collections.length} collections`,
              method: 'dump_restore'
            });
          }
          
          resolve({ 
            success: true, 
            output,
            stats: {
              collections: collections.length,
              method: 'mongorestore'
            }
          });
        } else {
          console.error(`❌ mongorestore failed with code ${code}`);
          reject(new Error(`mongorestore failed with code ${code}: ${errorOutput}`));
        }
      });

      mongorestore.on('error', (error) => {
        reject(new Error(`Failed to execute mongorestore: ${error.message}`));
      });
    });
  }

  /**
   * Cleanup method to close all active operations
   */
  async cleanup() {
    console.log('🧹 Starting DatabaseCopyManager cleanup...');
    
    // Cancel all active operations
    for (const [operationId, operation] of this.activeOperations) {
      console.log(`🛑 Cancelling active operation: ${operationId}`);
      this.cancelOperation(operationId);
    }
    
    this.activeOperations.clear();
    console.log('✅ DatabaseCopyManager cleanup completed');
  }
}

module.exports = DatabaseCopyManager;
