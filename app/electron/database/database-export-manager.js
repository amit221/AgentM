const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongodb = require('mongodb');
const EJSON = mongodb.EJSON || require('mongodb/lib/bson').EJSON;

/**
 * DatabaseExportManager handles all database export operations.
 * Supports multiple export formats: JSON, CSV, BSON, and mongodump.
 */
class DatabaseExportManager {
  constructor(databaseConnection) {
    this.databaseConnection = databaseConnection;
    this.activeOperations = new Map();
  }

  get clients() {
    return this.databaseConnection.clients;
  }

  get connectionStrings() {
    return this.databaseConnection.connectionStrings;
  }

  async exportDatabase(options, progressCallback = null, operationId = null) {
    const {
      connectionId,
      databaseName,
      collections,
      format,
      outputPath,
      formatOptions = {}
    } = options;

    try {
      this.validateExportOptions(options);

      if (operationId) {
        this.activeOperations.set(operationId, {
          cancelled: false,
          processes: [],
          stage: 'initializing'
        });
      }

      const collectionsToExport = await this.getCollectionsToExport(
        connectionId,
        databaseName,
        collections
      );

      if (collectionsToExport.length === 0) {
        throw new Error('No collections to export');
      }

      if (progressCallback) {
        progressCallback({
          stage: 'initializing',
          currentCollection: null,
          exportedCollections: 0,
          totalCollections: collectionsToExport.length,
          progress: 0,
          message: `Preparing to export ${collectionsToExport.length} collections...`
        });
      }

      let result;
      switch (format) {
        case 'mongodump':
          result = await this.exportUsingMongoDump(
            connectionId,
            databaseName,
            collectionsToExport,
            outputPath,
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        case 'json':
          result = await this.exportUsingMongoExport(
            connectionId,
            databaseName,
            collectionsToExport,
            outputPath,
            'json',
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        case 'csv':
          result = await this.exportUsingMongoExport(
            connectionId,
            databaseName,
            collectionsToExport,
            outputPath,
            'csv',
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        case 'bson':
          result = await this.exportUsingCustomBSON(
            connectionId,
            databaseName,
            collectionsToExport,
            outputPath,
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      if (operationId) {
        this.activeOperations.delete(operationId);
      }

      return result;
    } catch (error) {
      if (operationId) {
        this.activeOperations.delete(operationId);
      }
      throw error;
    }
  }

  async getCollectionsToExport(connectionId, databaseName, requestedCollections) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Connection not found');
    }

    const db = client.db(databaseName);
    const allCollections = await db.listCollections().toArray();
    const collectionNames = allCollections.map(c => c.name);

    if (requestedCollections && requestedCollections.length > 0) {
      return collectionNames.filter(name => requestedCollections.includes(name));
    }

    return collectionNames;
  }

  async exportUsingMongoDump(
    connectionId,
    databaseName,
    collections,
    outputPath,
    formatOptions,
    progressCallback,
    operationId
  ) {
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString) {
      throw new Error('Connection string not found');
    }

    const toolsPaths = await this.getMongoToolsPaths();
    if (!toolsPaths.mongodump) {
      throw new Error('mongodump tool not found');
    }

    const exportDir = path.join(outputPath, `${databaseName}_export_${Date.now()}`);
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    await this.executeMongoDump(
      toolsPaths.mongodump,
      connectionString,
      databaseName,
      exportDir,
      collections,
      formatOptions,
      progressCallback,
      operationId
    );

    return {
      success: true,
      format: 'mongodump',
      outputPath: exportDir,
      collections: collections.length,
      message: `Successfully exported ${collections.length} collections to ${exportDir}`
    };
  }

  async exportUsingMongoExport(
    connectionId,
    databaseName,
    collections,
    outputPath,
    format,
    formatOptions,
    progressCallback,
    operationId
  ) {
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString) {
      throw new Error('Connection string not found');
    }

    const toolsPaths = await this.getMongoToolsPaths();
    if (!toolsPaths.mongoexport) {
      throw new Error('mongoexport tool not found');
    }

    const exportDir = path.join(outputPath, `${databaseName}_export_${Date.now()}`);
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const results = [];
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];

      if (this.shouldCancelOperation(operationId)) {
        throw new Error('Export cancelled by user');
      }

      if (progressCallback) {
        progressCallback({
          stage: 'exporting_collection',
          currentCollection: collection,
          exportedCollections: i,
          totalCollections: collections.length,
          progress: (i / collections.length) * 100,
          message: `Exporting ${collection} (${i + 1}/${collections.length})...`
        });
      }

      const outputFile = path.join(
        exportDir,
        `${collection}.${format === 'csv' ? 'csv' : 'json'}`
      );

      const result = await this.executeMongoExport(
        toolsPaths.mongoexport,
        connectionString,
        databaseName,
        collection,
        outputFile,
        format,
        formatOptions,
        operationId
      );

      results.push({ collection, outputFile, ...result });
    }

    if (progressCallback) {
      progressCallback({
        stage: 'completed',
        currentCollection: null,
        exportedCollections: collections.length,
        totalCollections: collections.length,
        progress: 100,
        message: `Export completed: ${collections.length} collections`
      });
    }

    return {
      success: true,
      format,
      outputPath: exportDir,
      collections: results,
      message: `Successfully exported ${collections.length} collections to ${exportDir}`
    };
  }

  async exportUsingCustomBSON(
    connectionId,
    databaseName,
    collections,
    outputPath,
    formatOptions,
    progressCallback,
    operationId
  ) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Connection not found');
    }

    const db = client.db(databaseName);
    const exportDir = path.join(outputPath, `${databaseName}_export_${Date.now()}`);
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const results = [];

    for (let i = 0; i < collections.length; i++) {
      const collectionName = collections[i];

      if (this.shouldCancelOperation(operationId)) {
        throw new Error('Export cancelled by user');
      }

      if (progressCallback) {
        progressCallback({
          stage: 'exporting_collection',
          currentCollection: collectionName,
          exportedCollections: i,
          totalCollections: collections.length,
          progress: (i / collections.length) * 100,
          message: `Exporting ${collectionName} (${i + 1}/${collections.length})...`
        });
      }

      const collection = db.collection(collectionName);
      const outputFile = path.join(exportDir, `${collectionName}.bson`);

      const documents = await collection.find({}).toArray();
      const bsonData = documents.map(doc => EJSON.serialize(doc));
      fs.writeFileSync(outputFile, JSON.stringify(bsonData, null, 2));

      if (formatOptions.includeIndexes) {
        const indexes = await collection.indexes();
        const indexFile = path.join(exportDir, `${collectionName}.indexes.json`);
        fs.writeFileSync(indexFile, JSON.stringify(indexes, null, 2));
      }

      results.push({
        collection: collectionName,
        outputFile,
        documentCount: documents.length
      });
    }

    if (progressCallback) {
      progressCallback({
        stage: 'completed',
        currentCollection: null,
        exportedCollections: collections.length,
        totalCollections: collections.length,
        progress: 100,
        message: `Export completed: ${collections.length} collections`
      });
    }

    return {
      success: true,
      format: 'bson',
      outputPath: exportDir,
      collections: results,
      message: `Successfully exported ${collections.length} collections to ${exportDir}`
    };
  }

  async executeMongoDump(
    mongodumpPath,
    connectionString,
    databaseName,
    outputDir,
    collections,
    formatOptions,
    progressCallback,
    operationId
  ) {
    return new Promise((resolve, reject) => {
      const { cleanUri, dbFromUri } = this.parseConnectionString(connectionString);

      let finalUri = connectionString;
      const args = [];

      // Add URI first
      args.push('--uri', cleanUri || connectionString);

      // Handle database specification
      if (!dbFromUri) {
        args.push('--db', databaseName);
      } else if (dbFromUri !== databaseName) {
        args.push('--db', databaseName);
      }

      // Handle archive option
      if (formatOptions.archive) {
        // Single archive file
        const archiveFile = path.join(outputDir, `${databaseName}_backup.archive`);
        args.push('--archive=' + archiveFile);
        // Archive format includes gzip compression by default
      } else {
        // Multiple files (directory structure)
        args.push('--out', outputDir);
        // Add gzip compression if requested (default: true)
        if (formatOptions.gzip !== false) {
          args.push('--gzip');
        }
      }

      // Add other options
      args.push('--numParallelCollections', '4');
      args.push('--verbose');

      // Validate the final URI
      if (!finalUri || finalUri.trim() === '' || finalUri.endsWith('://')) {
        reject(new Error(`Invalid MongoDB URI: '${finalUri}'`));
        return;
      }

      console.log(`🚀 Executing mongodump for export`);

      const mongodump = spawn(mongodumpPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      if (operationId && this.activeOperations.has(operationId)) {
        const operation = this.activeOperations.get(operationId);
        operation.processes.push(mongodump);
        operation.stage = 'exporting';
      }

      let output = '';
      let errorOutput = '';
      let exportedCollections = [];

      const parseProgress = (text, isStderr = false) => {
        if (this.shouldCancelOperation(operationId)) {
          mongodump.kill('SIGTERM');
          return;
        }

        if (isStderr && progressCallback) {
          const progressPattern = /\[([#.]+)\]\s+([^.]+)\.(\w+)\s+([0-9.]+(?:[KMGT]?B)?|[\d]+)\/([0-9.]+(?:[KMGT]?B)?|[\d]+)\s+\(([0-9.]+)%\)/g;
          let progressMatch;
          let progressDetails = [];

          while ((progressMatch = progressPattern.exec(text)) !== null) {
            const [, progressBar, database, collection, current, total, percentage] = progressMatch;
            const percent = parseFloat(percentage);

            progressDetails.push({
              collection,
              current,
              total,
              percentage: percent
            });

            if (!exportedCollections.includes(collection)) {
              exportedCollections.push(collection);
            }
          }

          if (progressDetails.length > 0) {
            const currentDetail = progressDetails[progressDetails.length - 1];
            progressCallback({
              stage: 'exporting',
              currentCollection: currentDetail.collection,
              exportedCollections: exportedCollections.length,
              totalCollections: collections.length,
              progress: Math.min(95, (exportedCollections.length / collections.length) * 100),
              message: `Exporting ${currentDetail.collection}: ${currentDetail.current}/${currentDetail.total} (${currentDetail.percentage.toFixed(1)}%)`,
              method: 'mongodump'
            });
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
          console.log(`✅ mongodump export completed successfully`);
          
          if (progressCallback) {
            progressCallback({
              stage: 'completed',
              currentCollection: null,
              exportedCollections: collections.length,
              totalCollections: collections.length,
              progress: 100,
              message: `Export completed: ${collections.length} collections`,
              method: 'mongodump'
            });
          }

          resolve({
            success: true,
            output,
            collections: exportedCollections.length
          });
        } else {
          console.error(`❌ mongodump export failed with code ${code}`);
          reject(new Error(`mongodump failed with code ${code}: ${errorOutput}`));
        }
      });

      mongodump.on('error', (error) => {
        reject(new Error(`Failed to execute mongodump: ${error.message}`));
      });
    });
  }

  async executeMongoExport(
    mongoexportPath,
    connectionString,
    databaseName,
    collectionName,
    outputFile,
    format,
    formatOptions,
    operationId
  ) {
    return new Promise((resolve, reject) => {
      const { cleanUri } = this.parseConnectionString(connectionString);

      const args = [
        '--uri', cleanUri,
        '--db', databaseName,
        '--collection', collectionName,
        '--out', outputFile
      ];

      if (format === 'json') {
        args.push('--jsonArray');
        if (formatOptions.prettyPrint) {
          args.push('--pretty');
        }
      } else if (format === 'csv') {
        args.push('--type', 'csv');
        if (formatOptions.fields && formatOptions.fields.length > 0) {
          args.push('--fields', formatOptions.fields.join(','));
        }
      }

      console.log(`🚀 Executing mongoexport: --collection ${collectionName}`);

      const mongoexport = spawn(mongoexportPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      if (operationId && this.activeOperations.has(operationId)) {
        const operation = this.activeOperations.get(operationId);
        operation.processes.push(mongoexport);
      }

      let output = '';
      let errorOutput = '';

      mongoexport.stdout.on('data', (data) => {
        output += data.toString();
      });

      mongoexport.stderr.on('data', (data) => {
        errorOutput += data.toString();
        
        if (this.shouldCancelOperation(operationId)) {
          mongoexport.kill('SIGTERM');
        }
      });

      mongoexport.on('close', (code) => {
        if (code === 0) {
          const countMatch = errorOutput.match(/exported (\d+) record/);
          const documentCount = countMatch ? parseInt(countMatch[1]) : 0;

          resolve({
            success: true,
            documentCount,
            output: errorOutput
          });
        } else {
          reject(new Error(`mongoexport failed with code ${code}: ${errorOutput}`));
        }
      });

      mongoexport.on('error', (error) => {
        reject(new Error(`Failed to execute mongoexport: ${error.message}`));
      });
    });
  }

  async getMongoToolsPaths() {
    try {
      const isPackaged = require('electron').app.isPackaged;
      const app = require('electron').app;

      let basePath;
      if (isPackaged) {
        basePath = path.join(process.resourcesPath, 'electron', 'shells');
      } else {
        basePath = path.join(app.getAppPath(), 'electron', 'shells');
      }

      const platform = os.platform();
      const arch = os.arch();
      let shellDir = '';

      if (platform === 'darwin') {
        shellDir = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      } else if (platform === 'linux') {
        shellDir = 'linux-x64';
      } else if (platform === 'win32') {
        shellDir = 'windows-x64';
      }

      const shellExtension = platform === 'win32' ? '.exe' : '';
      const mongoToolsDir = path.join(basePath, shellDir, 'mongotools', 'bin');

      const mongodumpPath = path.join(mongoToolsDir, `mongodump${shellExtension}`);
      const mongoexportPath = path.join(mongoToolsDir, `mongoexport${shellExtension}`);

      return {
        mongodump: fs.existsSync(mongodumpPath) ? mongodumpPath : null,
        mongoexport: fs.existsSync(mongoexportPath) ? mongoexportPath : null
      };
    } catch (error) {
      console.error('❌ Error detecting MongoDB tools:', error.message);
      return {
        mongodump: null,
        mongoexport: null
      };
    }
  }

  async checkExportToolsAvailability() {
    const toolsPaths = await this.getMongoToolsPaths();
    const tools = {
      mongodump: !!toolsPaths.mongodump,
      mongoexport: !!toolsPaths.mongoexport,
      customExport: true
    };
    
    return {
      success: true,
      available: tools.mongodump || tools.mongoexport || tools.customExport,
      tools,
      binariesStatus: {
        available: tools.mongodump || tools.mongoexport,
        systemInstalled: tools.mongodump || tools.mongoexport,
        localInstalled: false,
        canDownload: false,
        upgradeAvailable: false
      }
    };
  }

  validateExportOptions(options) {
    const { connectionId, databaseName, format, outputPath } = options;

    if (!connectionId) {
      throw new Error('Connection ID is required');
    }

    if (!databaseName) {
      throw new Error('Database name is required');
    }

    if (!format) {
      throw new Error('Export format is required');
    }

    const validFormats = ['json', 'csv', 'bson', 'mongodump'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    }

    if (!outputPath) {
      throw new Error('Output path is required');
    }

    return true;
  }

  parseConnectionString(connectionString) {
    try {
      if (!connectionString.startsWith('mongodb://') && !connectionString.startsWith('mongodb+srv://')) {
        return {
          cleanUri: connectionString,
          dbFromUri: null
        };
      }

      const uriMatch = connectionString.match(/^(mongodb(?:\+srv)?:\/\/(?:[^@\/]+@)?[^\/]+)(\/([^?]+))?(\?.*)?$/);

      if (!uriMatch) {
        return {
          cleanUri: connectionString,
          dbFromUri: null
        };
      }

      const [, baseUri, , dbName, queryString] = uriMatch;
      const cleanUri = queryString ? `${baseUri}${queryString}` : baseUri;

      return {
        cleanUri,
        dbFromUri: dbName || null
      };
    } catch (error) {
      return {
        cleanUri: connectionString,
        dbFromUri: null
      };
    }
  }

  shouldCancelOperation(operationId) {
    if (!operationId || !this.activeOperations.has(operationId)) {
      return false;
    }
    return this.activeOperations.get(operationId).cancelled;
  }

  cancelOperation(operationId) {
    if (!operationId || !this.activeOperations.has(operationId)) {
      return false;
    }

    const operation = this.activeOperations.get(operationId);
    operation.cancelled = true;

    operation.processes.forEach(process => {
      try {
        process.kill('SIGTERM');
      } catch (error) {
        console.error('Error killing process:', error);
      }
    });

    return true;
  }

  async getCollectionMetadata(connectionId, databaseName, collectionName) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Connection not found');
    }

    const db = client.db(databaseName);
    const collection = db.collection(collectionName);

    const [documentCount, indexes, stats] = await Promise.all([
      collection.countDocuments(),
      collection.indexes(),
      collection.stats().catch(() => null)
    ]);

    return {
      name: collectionName,
      documentCount,
      indexes,
      stats
    };
  }
}

module.exports = DatabaseExportManager;

