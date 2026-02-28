const mongodb = require('mongodb');
const { MongoClient } = mongodb;
const EJSON = mongodb.EJSON || require('mongodb/lib/bson').EJSON;
const ShellManager = require('./shell-manager');
const DatabaseCopyManager = require('./database-copy-manager');
const DatabaseExportManager = require('./database-export-manager');
const DatabaseImportManager = require('./database-import-manager');
const { getBackendUrl } = require('../config/urls.cjs');
const fetch = require('node-fetch');
class DatabaseConnection {
  constructor() {
    this.clients = new Map(); // Map of connection IDs to clients
    this.connectionStrings = new Map(); // Map of connection IDs to connection strings
    this.settingsStorage = null;
    this.defaultQueryLimit = 100; // Fallback if settings not available
    this.activeOperations = new Map(); // Map of operation IDs to cancellable processes
    
    // Track databases currently being indexed (prevent concurrent generation)
    this.generatingDatabases = new Set();
    
    // Initialize shell manager
    this.shellManager = new ShellManager(this);
    
    // Initialize copy manager
    this.copyManager = new DatabaseCopyManager(this);
    
    // Initialize export manager
    this.exportManager = new DatabaseExportManager(this);
    
    // Initialize import manager
    this.importManager = new DatabaseImportManager(this);
  }

  setSettingsStorage(settingsStorage) {
    this.settingsStorage = settingsStorage;
  }

  // Helper function to detect MongoDB server errors in output
  containsMongoDBServerError(output, errorOutput) {
    if (!output && !errorOutput) return false;
    
    const combinedOutput = (output || '') + (errorOutput || '');
    
    // Check if output contains RESULT_START/RESULT_END (executeInMongoShell method)
    if (combinedOutput.includes('RESULT_START') && combinedOutput.includes('RESULT_END')) {
      // If we have structured results, only check areas outside the results
      const beforeResults = combinedOutput.split('RESULT_START')[0];
      const afterResults = combinedOutput.split('RESULT_END').slice(1).join('');
      const outputToCheck = beforeResults + afterResults;
      
      return this.hasMongoDBErrorPatterns(outputToCheck);
    }
    
    // Check if output contains persistent shell markers (QUERY_*_START/END)
    const persistentMarkerMatch = combinedOutput.match(/QUERY_\w+_START[\s\S]*?QUERY_\w+_END/);
    if (persistentMarkerMatch) {
      // Extract areas outside the query result markers
      const beforeMarkers = combinedOutput.split(/QUERY_\w+_START/)[0];
      const afterMarkers = combinedOutput.split(/QUERY_\w+_END/).slice(1).join('');
      const outputToCheck = beforeMarkers + afterMarkers;
      
      return this.hasMongoDBErrorPatterns(outputToCheck);
    }
    
    // No structured results, check the entire output
    return this.hasMongoDBErrorPatterns(combinedOutput);
  }

  // Helper function to check for MongoDB error patterns with context
  hasMongoDBErrorPatterns(text) {
    // Very specific patterns that indicate actual MongoDB shell errors, not document content
    const mongoErrorPatterns = [
      // Uncaught errors from shell (more specific)
      /Uncaught\s+MongoServerError\[[\w]+\]:/,
      /Uncaught\s+MongoNetworkError/,
      /Uncaught\s+MongoInvalidArgumentError/,
      
      // Error lines with shell context (after prompts or at start with shell indicators)
      /^>\s*MongoServerError\[/m,
      /^[a-zA-Z0-9_]+>\s*MongoServerError\[/m,  // db name prompts
      /^rs\d+:[A-Z]+>\s*MongoServerError\[/m,   // replica set prompts
      
      // MongoDB shell error messages that appear in shell output (not JSON)
      /^MongoServerError\[[\w]+\]:\s*[^"]/m,    // Not inside quotes (JSON strings)
      
      // Very specific MongoDB server errors with context
      /MongoServerError\[FailedToParse\]:\s*'[^']*'\s*starts\s+with\s+an\s+invalid\s+character/,
      
      // MongoDB shell specific errors (not likely in documents)
      /^MongoNetworkError:/m,
      /^MongoInvalidArgumentError:/m,
      
      // Shell-specific error context
      /mongosh\s+\d+\.\d+\.\d+.*Error/,
      /MongoDB\s+shell\s+version.*Error/,
      
      // Error lines from MongoDB shell that include line numbers or stack traces
      /at\s+eval\s+\(eval\s+at/,  // JavaScript stack traces from shell
      /^\s*at\s+.*\.js:\d+:\d+/m   // File/line references from shell
    ];
    
    return mongoErrorPatterns.some(pattern => pattern.test(text));
  }

  // Helper function to extract MongoDB error details
  extractMongoDBErrorDetails(output, errorOutput) {
    const combinedOutput = (output || '') + (errorOutput || '');
    
    // Only check areas outside result markers if they exist
    let textToCheck = combinedOutput;
    
    // Handle executeInMongoShell format (RESULT_START/RESULT_END)
    if (combinedOutput.includes('RESULT_START') && combinedOutput.includes('RESULT_END')) {
      const beforeResults = combinedOutput.split('RESULT_START')[0];
      const afterResults = combinedOutput.split('RESULT_END').slice(1).join('');
      textToCheck = beforeResults + afterResults;
    }
    // Handle persistent shell format (QUERY_*_START/END)
    else if (combinedOutput.match(/QUERY_\w+_START[\s\S]*?QUERY_\w+_END/)) {
      const beforeMarkers = combinedOutput.split(/QUERY_\w+_START/)[0];
      const afterMarkers = combinedOutput.split(/QUERY_\w+_END/).slice(1).join('');
      textToCheck = beforeMarkers + afterMarkers;
    }
    
    // Try to extract Uncaught MongoServerError first (most specific)
    const uncaughtMongoMatch = textToCheck.match(/(Uncaught\s+MongoServerError\[[\w]+\]: .+?)(?:\n|$)/);
    if (uncaughtMongoMatch) {
      return {
        message: uncaughtMongoMatch[1].trim(),
        type: 'UncaughtMongoServerError'
      };
    }
    
    // Try to extract MongoServerError with shell prompt context
    const promptMongoMatch = textToCheck.match(/(^[a-zA-Z0-9_]*>\s*MongoServerError\[[\w]+\]: .+?)(?:\n|$)/m);
    if (promptMongoMatch) {
      return {
        message: promptMongoMatch[1].replace(/^[a-zA-Z0-9_]*>\s*/, '').trim(),
        type: 'MongoServerError'
      };
    }
    
    // Try to extract MongoServerError at line start (not in JSON)
    const lineStartMongoMatch = textToCheck.match(/(^MongoServerError\[[\w]+\]:\s*[^"])(.+?)(?:\n|$)/m);
    if (lineStartMongoMatch) {
      return {
        message: (lineStartMongoMatch[1] + lineStartMongoMatch[2]).trim(),
        type: 'MongoServerError'
      };
    }
    
    // Try to extract specific FailedToParse errors
    const failedToParseMatch = textToCheck.match(/(MongoServerError\[FailedToParse\]:\s*'[^']*'\s*starts\s+with\s+an\s+invalid\s+character[^"]*?)(?:\n|$)/);
    if (failedToParseMatch) {
      return {
        message: failedToParseMatch[1].trim(),
        type: 'MongoServerError'
      };
    }
    
    // Try to extract MongoDB network/connection errors
    const networkErrorMatch = textToCheck.match(/(^Mongo(?:Network|InvalidArgument)Error: .+?)(?:\n|$)/m);
    if (networkErrorMatch) {
      return {
        message: networkErrorMatch[1].trim(),
        type: 'MongoConnectionError'
      };
    }
    
    // Fallback
    return {
      message: 'MongoDB server error detected in output',
      type: 'MongoDBError'
    };
  }

  async getQueryLimit() {
    try {
      if (this.settingsStorage) {
        const result = await this.settingsStorage.loadSettings();
        if (result.success && result.settings && result.settings.queryLimit) {
          return result.settings.queryLimit;
        }
      }
    } catch (error) {
      console.warn('Error loading query limit from settings:', error);
    }
    return this.defaultQueryLimit;
  }

  async shouldLogQueries() {
    try {
      if (this.settingsStorage) {
        const result = await this.settingsStorage.loadSettings();
        if (result.success && result.settings && result.settings.queryLogging !== undefined) {
          return result.settings.queryLogging;
        }
      }
    } catch (error) {
      console.warn('Error loading query logging setting from settings:', error);
    }
    return true; // Default to logging enabled
  }

  async getQueryLogLevel() {
    try {
      if (this.settingsStorage) {
        const result = await this.settingsStorage.loadSettings();
        if (result.success && result.settings && result.settings.queryLogLevel) {
          return result.settings.queryLogLevel;
        }
      }
    } catch (error) {
      console.warn('Error loading query log level from settings:', error);
    }
    return 'basic'; // Default to basic logging: none, basic, detailed, verbose
  }

  async connect(connectionString, options = {}) {
    try {
      const clientOptions = {
        serverSelectionTimeoutMS: options.timeout || 5000,
        maxPoolSize: options.maxPoolSize || 1,
        ...options
      };

      const client = new MongoClient(connectionString, clientOptions);
      await client.connect();
      
      // Test the connection
      await client.db('admin').admin().ping();
      
      // Generate a unique connection ID
      const connectionId = `conn_${Date.now()}`;
      this.clients.set(connectionId, client);
      this.connectionStrings.set(connectionId, connectionString);
      
      console.log('✅ Successfully connected to MongoDB', {
        connectionId,
        clientsSize: this.clients.size,
        hasClient: this.clients.has(connectionId),
        connectionString: connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') // Hide credentials
      });

      // Note: Shells are now created lazily per conversation when first query is executed
      console.log(`📝 Connection established for ${connectionId}. Shells will be created per conversation on demand.`);
      
      return {
        success: true,
        message: 'Connected successfully',
        connectionId
      };
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async disconnect(connectionId) {
    try {
      // Close MongoDB client
      const client = this.clients.get(connectionId);
      if (client) {
        await client.close();
        this.clients.delete(connectionId);
        console.log(`✅ MongoDB client disconnected (${connectionId})`);
      }

      // Close persistent shell
      await this.shellManager.closePersistentShell(connectionId);

      // Clean up connection string
      this.connectionStrings.delete(connectionId);
      
      console.log(`✅ Full disconnection completed for ${connectionId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
      return { success: false, error: error.message };
    }
  }

  async listDatabases(connectionId) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      const adminDb = client.db('admin');
      const result = await adminDb.admin().listDatabases();
      
      return {
        success: true,
        databases: result.databases.map(db => db.name)
      };
    } catch (error) {
      console.error('Error listing databases:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listCollections(connectionId, databaseName) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      // Test connection before proceeding
      await client.db('admin').admin().ping();

      const db = client.db(databaseName);
      const collections = await db.listCollections().toArray();
      
      return {
        success: true,
        collections: collections.map(col => col.name)
      };
    } catch (error) {
      console.error('Error listing collections:', error);
      
      // Check if connection is lost
      if (error.message.includes('connection') || error.message.includes('timeout') || error.message.includes('socket')) {
        // Remove the dead connection
        this.clients.delete(connectionId);
        return {
          success: false,
          error: 'Connection lost',
          connectionLost: true
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createDatabase(connectionId, databaseName) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      // Test connection before proceeding
      await client.db('admin').admin().ping();

      // MongoDB creates databases implicitly when you first write data to them
      // We'll create an initial collection to ensure the database exists
      const db = client.db(databaseName);
      
      // Create an initial collection named "_init"
      // This ensures the database appears in the database list
      await db.createCollection('_init');
      
      console.log(`✅ Created database "${databaseName}" with initial collection "_init"`);
      
      return {
        success: true,
        message: `Database "${databaseName}" created successfully`,
        databaseName
      };
    } catch (error) {
      console.error('Error creating database:', error);
      
      // Check if database already exists
      if (error.message && error.message.includes('already exists')) {
        return {
          success: false,
          error: `Database "${databaseName}" already exists`
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeQuery(connectionId, databaseName, collectionName, operation, query = {}, options = {}) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      const db = client.db(databaseName);
      const collection = db.collection(collectionName);
      
      const startTime = Date.now();
      let result;
      let count = 0;

      switch (operation) {
        case 'find':
          const cursor = collection.find(query.filter || {}, query.options || {});
          if (options.limit) cursor.limit(options.limit);
          if (options.skip) cursor.skip(options.skip);
          
          result = await cursor.toArray();
          count = result.length;
          break;
          
        case 'findOne':
          result = await collection.findOne(query.filter || {});
          count = result ? 1 : 0;
          break;
          
        case 'count':
          count = await collection.countDocuments(query.filter || {});
          result = { count };
          break;
          
        case 'aggregate':
          result = await collection.aggregate(query.pipeline || []).toArray();
          count = result.length;
          break;
          
        case 'insertOne':
          result = await collection.insertOne(query.document || {});
          count = 1;
          break;
          
        case 'insertMany':
          result = await collection.insertMany(query.documents || []);
          count = result.insertedCount || 0;
          break;
          
        case 'updateOne':
          result = await collection.updateOne(
            query.filter || {}, 
            query.update || {}, 
            query.options || {}
          );
          count = result.modifiedCount || 0;
          break;
          
        case 'updateMany':
          result = await collection.updateMany(
            query.filter || {}, 
            query.update || {}, 
            query.options || {}
          );
          count = result.modifiedCount || 0;
          break;
          
        case 'deleteOne':
          result = await collection.deleteOne(query.filter || {});
          count = result.deletedCount || 0;
          break;
          
        case 'deleteMany':
          result = await collection.deleteMany(query.filter || {});
          count = result.deletedCount || 0;
          break;
          
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result,
        count,
        executionTime
      };
    } catch (error) {
      console.error('Error executing query:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeScript(conversationId, connectionId, databaseName, script, operationId = null, timeoutSeconds = 60) {
    // Validate conversation ID
    if (!conversationId) {
      throw new Error('conversationId is required for shell-per-conversation architecture');
    }

    console.log(`🔍 Executing script for conversation ${conversationId} on connection ${connectionId}`);
    
    return await this.shellManager.executeCommand(conversationId, connectionId, databaseName, script, {
      operationId,
      timeoutSeconds,
      isScript: true
    });
  }





  async generateCollectionIndex(connectionId, databaseName, sampleSize = 10, mainWindow = null, silent = false) {
    // Backend-level lock to prevent concurrent schema generation for the same database
    if (this.generatingDatabases.has(databaseName)) {
      console.log(`⏭️ [BACKEND] Schema generation already in progress for ${databaseName}, rejecting duplicate request`);
      return {
        success: false,
        error: 'Schema generation already in progress for this database'
      };
    }

    // Lock immediately before any async operations
    this.generatingDatabases.add(databaseName);
    console.log(`🔒 [BACKEND] Locked schema generation for ${databaseName}`);

    try {
      console.log(`📊 Generating schemas for database: ${databaseName} ${silent ? '(silent mode)' : ''}`);
      
      // Validate connection and get collections
      const { db, collections } = await this._validateConnectionAndDatabase(connectionId, databaseName);
      
      // Load existing schemas and metadata
      const { collectionSchemas, existingMetadata } = await this._loadExistingSchemas(databaseName);
      
      // Process all collections with progress updates
      await this._processCollections(
        collections,
        collectionSchemas,
        connectionId,
        databaseName,
        db,
        sampleSize,
        mainWindow,
        silent
      );

      // Clean up schemas for deleted collections
      this._cleanupRemovedCollections(collectionSchemas, collections);

      const collectionCount = Object.keys(collectionSchemas).length;
      console.log(`📊 Final schema generation result: ${collectionCount} collections processed`);
  
      // Handle metadata generation and preservation
      const metadata = await this._handleDatabaseMetadata(
        collectionCount,
        existingMetadata,
        collectionSchemas,
        databaseName,
        mainWindow,
        silent
      );
  
      const result = this._buildGenerationResult(databaseName, collectionSchemas, metadata);
      
      // Unlock after successful completion
      this.generatingDatabases.delete(databaseName);
      console.log(`🔓 [BACKEND] Unlocked schema generation for ${databaseName} (completed successfully)`);
      
      return result;
    } catch (error) {
      console.error('❌ Error generating collection index:', error);
      
      // Unlock on error
      this.generatingDatabases.delete(databaseName);
      console.log(`🔓 [BACKEND] Unlocked schema generation for ${databaseName} (error)`);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async _validateConnectionAndDatabase(connectionId, databaseName) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Not connected to MongoDB');
    }
    
    // Test the connection is still alive
    await client.db('admin').admin().ping();

    const db = client.db(databaseName);
    const collections = await db.listCollections().toArray();
    console.log(`📊 Found ${collections.length} collections:`, collections.map(c => c.name));
    
    return { db, collections };
  }

  async _loadExistingSchemas(databaseName) {
    let collectionSchemas = {};
    let existingMetadata = null;
    
    if (this.settingsStorage) {
      const existing = await this.settingsStorage.loadCollectionSchemas(databaseName);
      if (existing.success && existing.schemas) {
        collectionSchemas = existing.schemas;
        existingMetadata = existing.metadata || null;
        console.log(`📊 Loaded existing data:`, {
          schemas: Object.keys(collectionSchemas).length,
          hasMetadata: !!existingMetadata
        });
      }
    }
    
    return { collectionSchemas, existingMetadata };
  }

  async _processCollections(collections, collectionSchemas, connectionId, databaseName, db, sampleSize, mainWindow, silent) {
    const totalCollections = collections.length;
    let processedCount = 0;
    const startTime = Date.now();

    for (const collection of collections) {
      const collectionName = collection.name;
      processedCount++;
      // First 50% is for collections
      const progress = Math.round((processedCount / totalCollections) * 50);
      
      // Calculate estimated time remaining
      const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
      const avgTimePerCollection = elapsedTime / processedCount;
      const remainingCollections = totalCollections - processedCount;
      const estimatedCollectionTime = Math.round(avgTimePerCollection * remainingCollections);
      // Add 3 seconds per collection for AI processing phase
      const estimatedAITime = totalCollections * 3;
      const estimatedTimeRemaining = estimatedCollectionTime + estimatedAITime;
      
      console.log(`📊 Processing collection ${processedCount}/${totalCollections}: ${collectionName} (${progress}%)`);
      
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress,
          message: `Indexing collections... (${processedCount}/${totalCollections})`,
          collectionsProcessed: processedCount,
          collectionsTotal: totalCollections,
          currentCollection: collectionName,
          estimatedTimeRemaining,
          isComplete: false
        });
      }
      
      try {
        await this._processCollection(
          collectionName,
          collectionSchemas,
          connectionId,
          databaseName,
          db,
          sampleSize
        );
      } catch (error) {
        console.warn(`❌ Error generating schema for collection ${collectionName}:`, error);
      }
    }
  }

  async _processCollection(collectionName, collectionSchemas, connectionId, databaseName, db, sampleSize) {
    const schema = await this.getSchema(connectionId, databaseName, collectionName, sampleSize);
    
    if (!schema.success) {
      console.warn(`⚠️ Schema generation failed for ${collectionName}:`, schema.error);
      return;
    }
    
    // Fetch indexes for the collection
    const indexes = await this._fetchCollectionIndexes(db, collectionName);
    
    console.log(`📊 Schema generated for ${collectionName} with ${Object.keys(schema.schema || {}).length} fields`);
    
    // Merge with existing schema data
    this._mergeSchemaData(collectionSchemas, collectionName, schema, indexes, sampleSize);
    
    // Handle field samples and AI descriptions
    await this._handleFieldSamples(collectionSchemas, collectionName, schema, databaseName);
    
    console.log(`📊 Added schema for ${collectionName}`);
  }

  async _fetchCollectionIndexes(db, collectionName) {
    try {
      const collection = db.collection(collectionName);
      const rawIdx = await collection.indexes();
      
      return Array.isArray(rawIdx)
        ? rawIdx.map(ix => ({
            name: ix?.name,
            keys: ix?.key,
            unique: !!ix?.unique,
            sparse: !!ix?.sparse,
            partialFilterExpression: ix?.partialFilterExpression || undefined,
            expireAfterSeconds: ix?.expireAfterSeconds || undefined,
          }))
        : [];
    } catch (idxErr) {
      console.warn(`⚠️ Failed to fetch indexes for ${collectionName}:`, idxErr?.message || idxErr);
      return [];
    }
  }

  _mergeSchemaData(collectionSchemas, collectionName, schema, indexes, sampleSize) {
    const existingData = collectionSchemas[collectionName] || {};
    
    collectionSchemas[collectionName] = {
      ...existingData, // Keep existing metadata
      schema: schema.schema, // Update schema
      indexes, // Update indexes
      sampleSize: sampleSize, // Update sample size
      lastUpdated: new Date().toISOString() // Update timestamp
    };
  }

  async _handleFieldSamples(collectionSchemas, collectionName, schema, databaseName) {
    if (!this._hasStringSamples(schema)) {
      console.log(`ℹ️ No string fields found in ${collectionName}, skipping field descriptions`);
      return;
    }
    
    collectionSchemas[collectionName].fieldSamples = schema.stringSamples;
    
    const shouldGenerateDescriptions = await this._shouldGenerateAIFieldDescriptions();
    
    if (!shouldGenerateDescriptions) {
      console.log(`ℹ️ AI field descriptions disabled in settings for ${collectionName}, skipping`);
      return;
    }
    
    await this._generateAndStoreFieldDescriptions(
      collectionSchemas,
      collectionName,
      databaseName,
      schema.stringSamples
    );
  }

  _hasStringSamples(schema) {
    return schema.stringSamples && Object.keys(schema.stringSamples).length > 0;
  }

  async _shouldGenerateAIFieldDescriptions() {
    if (!this.settingsStorage) {
      return false;
    }
    
    try {
      const settingsResult = await this.settingsStorage.loadSettings();
      if (settingsResult.success && settingsResult.settings) {
        return settingsResult.settings.enableAIFieldDescriptions || false;
      }
    } catch (settingsError) {
      console.warn(`⚠️ Failed to load settings for AI field descriptions:`, settingsError?.message);
    }
    
    return false;
  }

  async _generateAndStoreFieldDescriptions(collectionSchemas, collectionName, databaseName, stringSamples) {
    console.log(`🤖 Fetching AI field descriptions for ${collectionName} (setting enabled)...`);
    
    try {
      const descriptions = await this.getFieldDescriptions(
        collectionName,
        databaseName,
        stringSamples
      );
      
      if (descriptions.success && descriptions.descriptions.length > 0) {
        collectionSchemas[collectionName].fieldDescriptions = descriptions.descriptions;
        console.log(`✅ Added ${descriptions.descriptions.length} field descriptions for ${collectionName}`);
      } else {
        console.log(`ℹ️ No field descriptions generated for ${collectionName}: ${descriptions.error || 'No error message'}`);
      }
    } catch (descError) {
      console.warn(`⚠️ Failed to fetch field descriptions for ${collectionName}:`, descError?.message || descError);
      // Continue without descriptions - not a critical failure
    }
  }

  _cleanupRemovedCollections(collectionSchemas, collections) {
    const currentCollectionNames = new Set(collections.map(c => c.name));
    const schemasToRemove = Object.keys(collectionSchemas).filter(
      name => !currentCollectionNames.has(name)
    );
    
    if (schemasToRemove.length > 0) {
      console.log(`🧹 Removing ${schemasToRemove.length} schemas for deleted collections:`, schemasToRemove);
      schemasToRemove.forEach(name => delete collectionSchemas[name]);
    }
  }

  async _handleDatabaseMetadata(collectionCount, existingMetadata, collectionSchemas, databaseName, mainWindow, silent) {
    if (!this._shouldGenerateMetadata(collectionCount, existingMetadata)) {
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress: 100,
          message: 'All done!',
          collectionsProcessed: collectionCount,
          collectionsTotal: collectionCount,
          currentCollection: null,
          estimatedTimeRemaining: 0,
          isComplete: true
        });
      }
      
      console.log(`ℹ️ Database has ${collectionCount} collections (< 10), ${existingMetadata ? 'keeping existing' : 'skipping'} metadata`);
      return existingMetadata;
    }
    
    if (existingMetadata) {
      console.log(`✅ Using existing metadata (${existingMetadata?.collections?.length || 0} collections)`);
      
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress: 100,
          message: 'All done!',
          collectionsProcessed: collectionCount,
          collectionsTotal: collectionCount,
          currentCollection: null,
          estimatedTimeRemaining: 0,
          isComplete: true
        });
      }
      
      return existingMetadata;
    }
    
    return await this._generateNewMetadata(
      collectionCount,
      collectionSchemas,
      databaseName,
      mainWindow,
      silent
    );
  }

  _shouldGenerateMetadata(collectionCount, existingMetadata) {
    return collectionCount >= 10;
  }

  async _generateNewMetadata(collectionCount, collectionSchemas, databaseName, mainWindow, silent) {
    console.log(`📊 Database has ${collectionCount} collections, generating metadata...`);
    
    // Estimated time: 3 seconds per collection for AI processing
    const estimatedAITime = collectionCount * 3;
    const aiStartTime = Date.now();
    
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress: 50,
          message: 'Generating AI insights...',
          collectionsProcessed: collectionCount,
          collectionsTotal: collectionCount,
          currentCollection: null,
          estimatedTimeRemaining: estimatedAITime,
          isComplete: false
        });
      }
    
    try {
      const collections = Object.entries(collectionSchemas).map(([name, schemaInfo]) => ({
        name,
        fields: Object.keys(schemaInfo.schema || {}),
        documentCount: schemaInfo.documentCount || 0
      }));
      
      // Update progress during AI generation
      const progressInterval = setInterval(() => {
        const aiElapsedTime = (Date.now() - aiStartTime) / 1000;
        const aiProgress = Math.min(99, 50 + Math.round((aiElapsedTime / estimatedAITime) * 50));
        const aiTimeRemaining = Math.max(0, Math.round(estimatedAITime - aiElapsedTime));
        
        if (!silent) {
          this._sendSchemaProgress(mainWindow, {
            database: databaseName,
            progress: aiProgress,
            message: 'Generating AI insights...',
            collectionsProcessed: collectionCount,
            collectionsTotal: collectionCount,
            currentCollection: null,
            estimatedTimeRemaining: aiTimeRemaining,
            isComplete: false
          });
        }
      }, 1000);
      
      const metadataResult = await this.generateMetadata(databaseName, collections);
      
      clearInterval(progressInterval);
      
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress: 100,
          message: 'All done!',
          collectionsProcessed: collectionCount,
          collectionsTotal: collectionCount,
          currentCollection: null,
          estimatedTimeRemaining: 0,
          isComplete: true
        });
      }
      
      if (metadataResult.success) {
        const metadata = metadataResult.metadata;
        console.log(`✅ Generated new metadata for ${metadata?.collections?.length || 0} collections`);
        return metadata;
      } else {
        console.warn(`⚠️ Metadata generation failed: ${metadataResult.error}`);
        return null;
      }
    } catch (metadataError) {
      console.warn(`⚠️ Failed to generate metadata (non-critical):`, metadataError?.message || metadataError);
      return null;
    }
  }

  _sendSchemaProgress(mainWindow, progressData) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('schema-generation-progress', progressData);
    }
  }

  _buildGenerationResult(databaseName, collectionSchemas, metadata) {
    console.log(`📊 [CONNECTION.JS] Returning result:`, {
      success: true,
      databaseName,
      schemasCount: Object.keys(collectionSchemas).length,
      hasMetadata: !!metadata,
      metadataCollections: metadata?.collections?.length || 0,
      metadataPreview: metadata ? {
        databaseName: metadata.databaseName,
        collectionsCount: metadata.collections?.length,
        firstCollectionName: metadata.collections?.[0]?.collectionName
      } : null
    });

    return {
      success: true,
      databaseName,
      schemas: collectionSchemas,
      metadata: metadata
    };
  }

  /**
   * Get AI-generated field descriptions from backend
   */
  async getFieldDescriptions(collectionName, databaseName, fieldSamples) {
    try {
      const { getBackendUrl } = require('../config/urls.cjs');
      const fetch = require('node-fetch');
      
      // Load access token from settings
      let accessToken = null;
      if (this.settingsStorage) {
        const settingsResult = await this.settingsStorage.loadSettings();
        if (settingsResult.success && settingsResult.settings) {
          accessToken = settingsResult.settings.accessToken;
        }
      }

      if (!accessToken) {
        console.warn('⚠️ No access token found in settings, field descriptions request will fail');
        return {
          success: false,
          descriptions: [],
          error: 'No access token available. Please log in to use AI features.'
        };
      }
      
      const backendUrl = getBackendUrl();
      const apiUrl = `${backendUrl}/api/v1/agent/field-descriptions`;
      
      console.log(`🌐 Calling field descriptions API: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          collectionName,
          databaseName,
          fieldSamples
        }),
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Field descriptions API error (${response.status}):`, errorText);
        
        // If 401, the token may have expired
        if (response.status === 401) {
          return {
            success: false,
            descriptions: [],
            error: 'Authentication failed. Please log in again to use AI features.'
          };
        }
        
        return {
          success: false,
          descriptions: [],
          error: `API responded with status ${response.status}: ${errorText}`
        };
      }

      const result = await response.json();
      
      return {
        success: result.success || false,
        descriptions: result.descriptions || [],
        error: result.error
      };
      
    } catch (error) {
      console.error('❌ Error calling field descriptions API:', error);
      return {
        success: false,
        descriptions: [],
        error: error.message || 'Failed to fetch field descriptions'
      };
    }
  }

  async generateMetadata(databaseName, collections) {
    try {
      const { getBackendUrl } = require('../config/urls.cjs');
      const fetch = require('node-fetch');
      
      // Load access token from settings
      let accessToken = null;
      if (this.settingsStorage) {
        const settingsResult = await this.settingsStorage.loadSettings();
        if (settingsResult.success && settingsResult.settings) {
          accessToken = settingsResult.settings.accessToken;
        }
      }

      if (!accessToken) {
        console.warn('⚠️ No access token found, metadata generation will fail');
        return {
          success: false,
          metadata: null,
          error: 'No access token available. Please log in to use AI features.'
        };
      }
      
      const backendUrl = getBackendUrl();
      const apiUrl = `${backendUrl}/api/v1/metadata/generate`;
      
      console.log(`🌐 Calling metadata generation API: ${apiUrl}`);
      console.log(`🌐 Collections count: ${collections.length}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          databaseName,
          collections
        }),
        timeout: 180000 // 3 minute timeout for metadata (AI can be slow)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Metadata API error (${response.status}):`, errorText);
        
        if (response.status === 401) {
          return {
            success: false,
            metadata: null,
            error: 'Authentication failed. Please log in again.'
          };
        }
        
        return {
          success: false,
          metadata: null,
          error: `Metadata API error: ${response.status} ${errorText}`
        };
      }

      const result = await response.json();
      
      console.log(`🤖 [CONNECTION.JS] Metadata API response received:`, {
        success: result.success,
        hasMetadata: !!result.metadata,
        metadataType: typeof result.metadata,
        metadataIsNull: result.metadata === null,
        metadataIsUndefined: result.metadata === undefined,
        metadataCollections: result.metadata?.collections?.length || 0,
        error: result.error || 'none'
      });
      
      console.log(`🤖 [CONNECTION.JS] Full metadata object:`, JSON.stringify(result.metadata, null, 2));
      
      const returnValue = {
        success: result.success || false,
        metadata: result.metadata || null,
        error: result.error
      };
      
      console.log(`🤖 [CONNECTION.JS] Returning from generateMetadata:`, {
        success: returnValue.success,
        hasMetadata: !!returnValue.metadata,
        metadataType: typeof returnValue.metadata,
        metadataCollections: returnValue.metadata?.collections?.length || 0
      });
      
      return returnValue;
      
    } catch (error) {
      console.error('❌ Error calling metadata API:', error);
      return {
        success: false,
        metadata: null,
        error: error.message || 'Failed to generate metadata'
      };
    }
  }

  async getSchema(connectionId, databaseName, collectionName, sampleSize = 100) {
    try {

      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      const db = client.db(databaseName);
      const collection = db.collection(collectionName);
      
      // Get sample documents to analyze schema
      const sampleDocs = await collection.aggregate([
        { $sample: { size: sampleSize } }
      ]).toArray();

      if (sampleDocs.length === 0) {
        return {
          success: true,
          schema: {},
          sampleCount: 0
        };
      }

      // Analyze schema from sample documents
      const schema = this.analyzeSchema(sampleDocs);
      
      // Extract string samples for AI description generation
      const stringSamples = this.extractStringSamples(sampleDocs);
      
      return {
        success: true,
        schema,
        stringSamples,
        sampleCount: sampleDocs.length
      };
    } catch (error) {
      console.error('Error getting schema:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract string value samples from documents for AI field description
   * Handles top-level strings, nested strings in objects, and strings in arrays
   */
  extractStringSamples(documents, maxSamplesPerField = 5) {
    const stringSamples = {};
    
    documents.forEach(doc => {
      this.collectStringValues(doc, stringSamples, '', 0, maxSamplesPerField);
    });

    // Convert samples to arrays and limit to maxSamplesPerField
    const result = {};
    Object.entries(stringSamples).forEach(([fieldPath, samplesSet]) => {
      const samples = Array.from(samplesSet).slice(0, maxSamplesPerField);
      if (samples.length > 0) {
        result[fieldPath] = samples;
      }
    });

    return result;
  }

  /**
   * Recursively collect string values from document
   */
  collectStringValues(obj, samples, prefix, depth, maxSamplesPerField) {
    // Limit nesting depth to avoid infinite recursion
    if (depth > 8 || !obj || typeof obj !== 'object') {
      return;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (typeof item === 'string' && item.trim()) {
          const fieldPath = prefix;
          if (!samples[fieldPath]) {
            samples[fieldPath] = new Set();
          }
          // Only collect up to maxSamplesPerField
          if (samples[fieldPath].size < maxSamplesPerField) {
            samples[fieldPath].add(item);
          }
        } else if (typeof item === 'object' && item !== null) {
          // Recursively process objects in arrays
          this.collectStringValues(item, samples, prefix, depth + 1, maxSamplesPerField);
        }
      });
      return;
    }

    // Handle objects
    Object.keys(obj).forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      // Skip special MongoDB fields like _id (unless they're strings)
      if (key === '_id' && typeof value !== 'string') {
        return;
      }

      if (typeof value === 'string' && value.trim()) {
        // Collect string value
        if (!samples[fullKey]) {
          samples[fullKey] = new Set();
        }
        // Only collect up to maxSamplesPerField
        if (samples[fullKey].size < maxSamplesPerField) {
          samples[fullKey].add(value);
        }
      } else if (Array.isArray(value)) {
        // Process array of values
        this.collectStringValues(value, samples, fullKey, depth + 1, maxSamplesPerField);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively process nested objects
        // Skip Buffer objects and special MongoDB types
        if (!value.buffer && value.constructor.name === 'Object') {
          this.collectStringValues(value, samples, fullKey, depth + 1, maxSamplesPerField);
        }
      }
    });
  }

  analyzeSchema(documents) {
    const schema = {};
    
    documents.forEach(doc => {
      this.analyzeDocument(doc, schema, '', 0);
    });

    // Convert Sets to strings or arrays based on size
    const fieldEntries = Object.entries(schema);
    
    // No field limit - include all discovered fields
    const allFields = fieldEntries.sort(([a], [b]) => {
      // Sort by depth and then alphabetically for consistent ordering
      const aDepth = (a.match(/\./g) || []).length;
      const bDepth = (b.match(/\./g) || []).length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.localeCompare(b);
    });

    const fullSchema = {};
    allFields.forEach(([field, typeSet]) => {
      const types = Array.from(typeSet);
      // If only one type, store as string; if multiple types, store as array
      fullSchema[field] = types.length === 1 ? types[0] : types;
    });

    return fullSchema;
  }

  analyzeDocument(obj, schema, prefix, depth = 0) {
    // Limit nesting depth to 8 levels for comprehensive schema analysis
    if (depth > 8) return;
    
    const keys = Object.keys(obj);
    
    // No limit on keys per object - analyze all fields
    
    keys.forEach(key => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      
      // Special handling for ObjectId (Buffer)
      const isObjectId = value && (
        value.buffer instanceof Buffer || // Direct Buffer
        (value.buffer && value.buffer.type === 'Buffer') || // Serialized Buffer
        value._bsontype === 'ObjectID' || // Direct ObjectId
        (typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') // Another ObjectId check
      );
      
      if (isObjectId) {
        if (!schema[fullKey]) {
          schema[fullKey] = new Set();
        }
        schema[fullKey].add('objectId');
        return;
      }

      // Special handling for Date objects
      if (value instanceof Date) {
        if (!schema[fullKey]) {
          schema[fullKey] = new Set();
        }
        schema[fullKey].add('date');
        return;
      }

      // Special handling for Arrays - analyze the content types
      if (Array.isArray(value)) {
        if (!schema[fullKey]) {
          schema[fullKey] = new Set();
        }
        schema[fullKey].add('array');
        
        // Analyze array contents if array is not empty and we haven't reached max depth
        if (value.length > 0 && depth < 8) {
          const arrayItemTypes = new Set();
          const sampleItems = value.slice(0, 5); // Sample first 5 items to avoid performance issues
          
          sampleItems.forEach(item => {
            if (item === null) {
              arrayItemTypes.add('null');
            } else if (item === undefined) {
              arrayItemTypes.add('undefined');
            } else if (Array.isArray(item)) {
              arrayItemTypes.add('array');
            } else if (typeof item === 'object') {
              arrayItemTypes.add('object');
              // Recursively analyze nested objects in arrays
              this.analyzeDocument(item, schema, `${fullKey}.items`, depth + 1);
            } else {
              arrayItemTypes.add(typeof item);
            }
          });
          
          // Store array item types as a special field
          const arrayTypesKey = `${fullKey}.arrayTypes`;
          if (!schema[arrayTypesKey]) {
            schema[arrayTypesKey] = new Set();
          }
          arrayItemTypes.forEach(type => schema[arrayTypesKey].add(type));
        }
        return;
      }

      // Handle null values explicitly (typeof null === 'object' in JavaScript)
      const type = value === null ? 'null' : typeof value;

      if (!schema[fullKey]) {
        schema[fullKey] = new Set();
      }
      schema[fullKey].add(type);

      // Recursively analyze nested objects up to 8 levels deep, but skip if it's a Buffer
      if (type === 'object' && value !== null && !value.buffer && depth < 8) {
        this.analyzeDocument(value, schema, fullKey, depth + 1);
      }
    });
  }

  getConnectionString(connectionId, silent = false) {
    // Get connection string for specific connection
    const connectionString = this.connectionStrings?.get(connectionId);
    if (!connectionString) {
      if (!silent) {
        console.error(`Connection string not found for connectionId: ${connectionId}`);
        console.log(`Available connections: ${Array.from(this.connectionStrings.keys()).join(', ')}`);
      }
      return null;
    }
    
    // Validate connection string format
    if (!silent && (!connectionString.startsWith('mongodb://') && !connectionString.startsWith('mongodb+srv://'))) {
      console.warn(`Invalid connection string format for ${connectionId}: ${connectionString.substring(0, 20)}...`);
    }
    
    if (!silent) {
      console.log(`Retrieved connection string for ${connectionId}: ${connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    }
    return connectionString;
  }

  getServerInfo(connectionId) {
    const connectionString = this.getConnectionString(connectionId, true); // Silent to avoid circular logging
    if (!connectionString) return null;
    
    try {
      // Extract server info from connection string
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: url.port || 27017,
        database: url.pathname.substring(1) || 'test'
      };
    } catch (error) {
      return { host: 'unknown', port: 'unknown', database: 'unknown' };
    }
  }



  async getMongoServerVersion(connectionId) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('No active connection');
      }
      
      const admin = client.db('admin');
      const buildInfo = await admin.admin().buildInfo();
      const version = buildInfo.version;
      const majorVersion = parseInt(version.split('.')[0]);
      
      console.log(`MongoDB server version: ${version} (major: ${majorVersion})`);
      return { version, majorVersion };
    } catch (error) {
      console.warn('Could not determine MongoDB version, defaulting to mongosh:', error.message);
      return { version: 'unknown', majorVersion: 6 }; // Default to newer version
    }
  }

  async checkMongoShellAvailability(connectionId = null) {
    return await this.shellManager.checkMongoShellAvailability(connectionId);
  }



  async createPersistentShell(connectionId, connectionString) {
    return await this.shellManager.createPersistentShell(connectionId, connectionString);
  }





  async sendQueryToShell(conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = 30) {
    console.warn('⚠️  sendQueryToShell is deprecated, use executeRawQuery instead');
    return await this.shellManager.executeCommand(conversationId, connectionId, databaseName, queryString, {
      operationId,
      timeoutSeconds,
      isScript: false
    });
  }

  /**
   * @deprecated This method is deprecated. Use sendQueryToShell with persistent shells instead.
   * Kept for emergency fallback scenarios only.
   */
  async executeInMongoShell(connectionString, databaseName, queryString, connectionId = null) {
    // Delegate to shell manager for emergency fallback
    return await this.shellManager.executeInMongoShell(connectionString, databaseName, queryString, connectionId);
  }

  async executeRawQuery(conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = 30) {
    try {
      // Verify connection exists
      if (!this.clients.has(connectionId)) {
        throw new Error(`No active connection found for connectionId: ${connectionId}. Available connections: ${Array.from(this.clients.keys()).join(', ')}`);
      }

      // Validate conversation ID
      if (!conversationId) {
        throw new Error('conversationId is required for shell-per-conversation architecture');
      }

      console.log(`🔍 Executing query for conversation ${conversationId} on connection ${connectionId}`);

      // Generate operationId if not provided
      if (!operationId) {
        operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Track the operation for cancellation
      const operation = {
        operationId,
        connectionId,
        databaseName,
        queryString,
        cancelled: false,
        processes: [],
        startTime: Date.now()
      };
      this.activeOperations.set(operationId, operation);

      // Get server info for logging
      const serverInfo = this.getServerInfo(connectionId);
      const startTime = Date.now();
      
      // Check logging level and log accordingly
      const shouldLogQueries = await this.shouldLogQueries();
      const logLevel = await this.getQueryLogLevel();
      
      const result = await this.shellManager.executeCommand(conversationId, connectionId, databaseName, queryString, {
        operationId,
        timeoutSeconds,
        isScript: false
      });
      
      const totalTime = Date.now() - startTime;
      // Use actual database execution time if available, otherwise fall back to total time
      const executionTime = result.actualExecutionTime !== undefined ? result.actualExecutionTime : totalTime;

      // Log execution details after completion (backend logs appear after frontend logs)
      if (shouldLogQueries) {
        // Sanitize query for logging (basic sensitive data removal)
        const sanitizedQuery = this.sanitizeQueryForLogging(queryString);
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        if (logLevel === 'detailed' || logLevel === 'verbose') {
          // Structured query logging after execution
          console.log('🚀 [MONGO QUERY] Execution completed', {
            timestamp: new Date().toISOString(),
            connectionId: connectionId,
            server: `${serverInfo?.host}:${serverInfo?.port}`,
            database: databaseName,
            query: sanitizedQuery,
            queryLength: queryString.length,
            executionTime: executionTime,
            totalTime: totalTime,
            resultCount: result.count,
            success: true,
            executionId: executionId
          });
        }
        
        if (logLevel === 'basic' || logLevel === 'detailed' || logLevel === 'verbose') {
          // Legacy format logs for compatibility
          console.log(`🔧 Executed query on ${serverInfo?.host}:${serverInfo?.port} (${connectionId}):`);
          if (logLevel === 'detailed' || logLevel === 'verbose') {
            console.log(`📝 Query: ${sanitizedQuery}`);
          }
          console.log(`🗄️  Database: ${databaseName}`);
          console.log(`🐚 Used persistent shell for ${connectionId}`);
          console.log(`✅ Query completed in ${executionTime}ms (DB time) / ${totalTime}ms (total time)`);
        }
      }

      // Clean up the operation tracking
      this.activeOperations.delete(operationId);

      // Check if the shell manager returned an error result
      if (result.success === false) {
        return {
          success: false,
          error: result.error || 'Query execution failed',
          result: result.result,
          documents: result.documents,
          count: result.count,
          executionTime,
          type: result.type,
          serverInfo,
          operationId
        };
      }

      return {
        success: true,
        result: result.documents,
        count: result.count,
        executionTime,
        serverInfo,
        operationId
      };
    } catch (error) {
      // Clean up the operation tracking on error
      this.activeOperations.delete(operationId);
      
      const serverInfo = this.getServerInfo(connectionId);
      console.error(`❌ Error executing raw query on ${serverInfo?.host || 'unknown'}:${serverInfo?.port || 'unknown'} (${connectionId}):`, error);
      
      // Check if error is due to cancellation
      if (error.message && error.message.includes('cancelled')) {
        return {
          success: false,
          error: 'Query execution was cancelled by user',
          cancelled: true,
          serverInfo,
          operationId
        };
      }
      
      return {
        success: false,
        error: error.message,
        serverInfo,
        operationId
      };
    }
  }













  sanitizeQueryForLogging(queryString) {
    if (!queryString || typeof queryString !== 'string') {
      return queryString;
    }
    
    let sanitized = queryString;
    
    // Remove or mask potential sensitive data patterns
    // Password patterns
    sanitized = sanitized.replace(/(["']password["']\s*:\s*["'])[^"']*(['"])/gi, '$1***$2');
    sanitized = sanitized.replace(/(["']pwd["']\s*:\s*["'])[^"']*(['"])/gi, '$1***$2');
    
    // Connection string patterns
    sanitized = sanitized.replace(/(mongodb:\/\/[^:]+:)[^@]+(@)/g, '$1***$2');
    
    // API keys or tokens
    sanitized = sanitized.replace(/(["'](?:api[_-]?key|token|secret)["']\s*:\s*["'])[^"']*(['"])/gi, '$1***$2');
    
    // Credit card patterns (basic)
    sanitized = sanitized.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '****-****-****-****');
    
    // Email patterns in certain contexts (conservative approach)
    sanitized = sanitized.replace(/(["']email["']\s*:\s*["'])[^"']*@[^"']*(['"])/gi, '$1***@***.com$2');
    
    return sanitized;
  }

  processDocument(doc) {
    // Use MongoDB's official EJSON.serialize to preserve BSON types
    // This converts ObjectId, Date, etc. to Extended JSON format:
    // ObjectId -> { "$oid": "..." }
    // Date -> { "$date": "..." }
    // This preserves type information without losing data
    if (doc === null || doc === undefined) {
      return doc;
    }

    try {
      // EJSON.serialize handles all BSON types correctly
      return EJSON.serialize(doc, { relaxed: false });
    } catch (error) {
      console.warn('EJSON serialization failed, falling back to manual processing:', error);
      // Fallback to manual processing if EJSON fails
      return this._manualProcessDocument(doc);
    }
  }

  _manualProcessDocument(doc) {
    // Fallback manual processing (old implementation)
    if (doc === null || doc === undefined) {
      return doc;
    }

    if (Array.isArray(doc)) {
      return doc.map(item => this._manualProcessDocument(item));
    }

    if (typeof doc === 'object') {
      const processed = {};
      for (const [key, value] of Object.entries(doc)) {
        if (value && typeof value === 'object') {
          // Handle ObjectId - convert to Extended JSON format
          if (value.constructor && value.constructor.name === 'ObjectId') {
            processed[key] = { $oid: value.toString() };
          }
          // Handle Buffer (sometimes used for _id)
          else if (Buffer.isBuffer(value)) {
            processed[key] = value.toString('hex');
          }
          // Handle Date - convert to Extended JSON format
          else if (value instanceof Date) {
            processed[key] = { $date: value.toISOString() };
          }
          // Recursively process nested objects
          else {
            processed[key] = this._manualProcessDocument(value);
          }
        } else {
          processed[key] = value;
        }
      }
      return processed;
    }

    return doc;
  }

  getConnectionStatus() {
    const connections = Array.from(this.clients.keys()).map(connectionId => ({
      connectionId,
      serverInfo: this.getServerInfo(connectionId),
      hasClient: this.clients.has(connectionId),
      hasConnectionString: this.connectionStrings.has(connectionId),
      hasPersistentShell: this.shellManager.shells.has(connectionId),
      shellReady: this.shellManager.shells.get(connectionId)?.isReady || false
    }));

    return {
      isConnected: this.clients.size > 0,
      totalConnections: this.clients.size,
      totalShells: this.shellManager.shells.size,
      activeConnections: Array.from(this.clients.keys()),
      activeShells: Array.from(this.shellManager.shells.keys()),
      connections
    };
  }

  /**
   * Recreates a persistent shell for a connection if it's missing or dead
   */
  async ensurePersistentShell(connectionId) {
    return await this.shellManager.ensurePersistentShell(connectionId);
  }

  async openMongoShell(connectionId, connectionString) {
    return await this.shellManager.openMongoShell(connectionId, connectionString);
  }

  async setConversationConnectionName(conversationId, connectionName) {
    try {
      // Store the connection name in the conversation metadata
      if (this.settingsStorage) {
        const result = await this.settingsStorage.loadSettings();
        if (result.success) {
          const settings = result.settings || {};
          const conversations = settings.conversations || {};
          conversations[conversationId] = {
            ...conversations[conversationId],
            connectionName
          };
          settings.conversations = conversations;
          await this.settingsStorage.saveSettings(settings);
          return { success: true };
        }
      }
      return { success: false, error: 'Settings storage not available' };
    } catch (error) {
      console.error('Error setting conversation connection name:', error);
      return { success: false, error: error.message };
    }
  }

  async duplicateDatabase(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    return await this.copyManager.duplicateDatabase(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId, progressCallback);
  }

  async duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null, progressCallback = null) {
    return await this.copyManager.duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId, progressCallback);
  }

  async deleteDatabase(connectionId, databaseName) {
    return await this.copyManager.deleteDatabase(connectionId, databaseName);
  }

  async deleteCollection(connectionId, databaseName, collectionName) {
    return await this.copyManager.deleteCollection(connectionId, databaseName, collectionName);
  }

  async renameDatabase(connectionId, oldDatabaseName, newDatabaseName, progressCallback = null) {
    return await this.copyManager.renameDatabase(connectionId, oldDatabaseName, newDatabaseName, progressCallback);
  }

  async duplicateDatabaseViaDumpRestore(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    return await this.copyManager.duplicateDatabaseViaDumpRestore(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId, progressCallback);
  }

  // Cancel an active operation
  cancelOperation(operationId) {
    return this.copyManager.cancelOperation(operationId);
  }

  async getMongoDatabaseToolsPaths() {
    return await this.copyManager.getMongoDatabaseToolsPaths();
  }

  parseConnectionString(connectionString) {
    return this.copyManager.parseConnectionString(connectionString);
  }

  // Execute mongodump
  async executeMongoDump(mongodumpPath, connectionString, databaseName, outputDir, progressCallback = null, operationId = null) {
    return await this.copyManager.executeMongoDump(mongodumpPath, connectionString, databaseName, outputDir, progressCallback, operationId);
  }

  // Execute mongorestore
  async executeMongoRestore(mongorestorePath, connectionString, sourceDatabaseName, targetDatabaseName, inputDir, progressCallback = null, operationId = null) {
    return await this.copyManager.executeMongoRestore(mongorestorePath, connectionString, sourceDatabaseName, targetDatabaseName, inputDir, progressCallback, operationId);
  }

  // Enhanced duplicateDatabase with method selection
  async duplicateDatabaseWithMethod(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, method = 'auto', progressCallback = null) {
    return await this.copyManager.duplicateDatabaseWithMethod(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId, method, progressCallback);
  }

  // Method to check if dump/restore tools are available
  async checkDumpRestoreAvailability() {
    return await this.copyManager.checkDumpRestoreAvailability();
  }

  // ===== DATABASE EXPORT METHODS =====

  async exportDatabase(options, progressCallback = null, operationId = null) {
    return await this.exportManager.exportDatabase(options, progressCallback, operationId);
  }

  async checkExportToolsAvailability() {
    return await this.exportManager.checkExportToolsAvailability();
  }

  async getCollectionMetadata(connectionId, databaseName, collectionName) {
    return await this.exportManager.getCollectionMetadata(connectionId, databaseName, collectionName);
  }

  async cancelExportOperation(operationId) {
    return this.exportManager.cancelOperation(operationId);
  }

  async getCollectionsForExport(connectionId, databaseName) {
    return await this.exportManager.getCollectionsToExport(connectionId, databaseName, null);
  }

  // ===== DATABASE IMPORT METHODS =====

  async importDatabase(options, progressCallback = null, operationId = null) {
    return await this.importManager.importDatabase(options, progressCallback, operationId);
  }

  async checkImportToolsAvailability() {
    return await this.importManager.checkImportToolsAvailability();
  }

  async cancelImportOperation(operationId) {
    return this.importManager.cancelOperation(operationId);
  }

  async getCollectionStats(connectionId, databaseName, collectionName) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      const db = client.db(databaseName);
      const collection = db.collection(collectionName);

      // Get collection statistics
      const collStats = await db.command({ collStats: collectionName });
      
      // Get document count
      const documentCount = await collection.countDocuments({});
      
      // Get indexes
      const indexes = await collection.indexes();

      // Calculate total index size
      const totalIndexSize = indexes.reduce((total, index) => {
        return total + (index.size || 0);
      }, 0);

      // Format sizes for display
      const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      return {
        success: true,
        stats: {
          documentCount,
          totalSize: formatSize(collStats.size || 0),
          totalSizeBytes: collStats.size || 0,
          storageSize: formatSize(collStats.storageSize || 0),
          storageSizeBytes: collStats.storageSize || 0,
          avgDocumentSize: formatSize(collStats.avgObjSize || 0),
          avgDocumentSizeBytes: collStats.avgObjSize || 0,
          indexCount: indexes.length,
          totalIndexSize: formatSize(totalIndexSize),
          totalIndexSizeBytes: totalIndexSize,
          indexes: indexes.map(index => ({
            name: index.name,
            keys: index.key,
            size: formatSize(index.size || 0),
            sizeBytes: index.size || 0,
            unique: index.unique || false,
            sparse: index.sparse || false,
            partialFilterExpression: index.partialFilterExpression || undefined,
            expireAfterSeconds: index.expireAfterSeconds || undefined
          }))
        }
      };
    } catch (error) {
      console.error('Error getting collection stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createIndex(connectionId, databaseName, collectionName, keys, options = {}) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      const db = client.db(databaseName);
      const collection = db.collection(collectionName);

      // Create the index
      const indexName = await collection.createIndex(keys, options);

      console.log(`✅ Created index "${indexName}" on ${databaseName}.${collectionName}`);

      return {
        success: true,
        indexName,
        message: `Index "${indexName}" created successfully`
      };
    } catch (error) {
      console.error('Error creating index:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async dropIndex(connectionId, databaseName, collectionName, indexName) {
    try {
      const client = this.clients.get(connectionId);
      if (!client) {
        throw new Error('Not connected to MongoDB');
      }

      const db = client.db(databaseName);
      const collection = db.collection(collectionName);

      // Prevent dropping the _id index
      if (indexName === '_id_') {
        throw new Error('Cannot drop the _id index');
      }

      // Drop the index
      await collection.dropIndex(indexName);

      console.log(`✅ Dropped index "${indexName}" from ${databaseName}.${collectionName}`);

      return {
        success: true,
        message: `Index "${indexName}" dropped successfully`
      };
    } catch (error) {
      console.error('Error dropping index:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cleanup method to close all connections and shells
  async cleanup() {
    console.log('🧹 Starting DatabaseConnection cleanup...');
    
    // Close all MongoDB clients
    for (const [connectionId, client] of this.clients) {
      try {
        console.log(`🔌 Closing MongoDB client: ${connectionId}`);
        await client.close();
      } catch (error) {
        console.warn(`Warning closing client ${connectionId}:`, error.message);
      }
    }
    this.clients.clear();
    
    // Close all persistent shells via shell manager
    await this.shellManager.cleanup();
    
    // Cleanup copy manager operations
    await this.copyManager.cleanup();
    
    // Clear connection strings
    this.connectionStrings.clear();
    
    console.log('✅ DatabaseConnection cleanup completed');
  }
}

module.exports = DatabaseConnection;