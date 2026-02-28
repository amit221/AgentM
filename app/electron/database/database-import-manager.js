const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongodb = require('mongodb');
const EJSON = mongodb.EJSON || require('mongodb/lib/bson').EJSON;

/**
 * DatabaseImportManager handles all database import operations.
 * Supports multiple import formats: JSON, CSV, BSON, and mongorestore.
 */
class DatabaseImportManager {
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

  /**
   * Main import method that handles all formats
   */
  async importDatabase(options, progressCallback = null, operationId = null) {
    const {
      connectionId,
      databaseName,
      files,
      format,
      formatOptions = {}
    } = options;

    try {
      this.validateImportOptions(options);

      if (operationId) {
        this.activeOperations.set(operationId, {
          cancelled: false,
          processes: [],
          stage: 'initializing'
        });
      }

      if (progressCallback) {
        progressCallback({
          stage: 'initializing',
          currentFile: null,
          importedFiles: 0,
          totalFiles: files.length,
          progress: 0,
          message: `Preparing to import ${files.length} file(s)...`
        });
      }

      let result;
      switch (format) {
      case 'mongorestore':
        result = await this.importUsingMongoRestore(
          connectionId,
          databaseName,
          files,
          formatOptions,
          progressCallback,
          operationId
        );
        break;

        case 'json':
          result = await this.importJSON(
            connectionId,
            databaseName,
            files,
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        case 'csv':
          result = await this.importCSV(
            connectionId,
            databaseName,
            files,
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        case 'bson':
          result = await this.importBSON(
            connectionId,
            databaseName,
            files,
            formatOptions,
            progressCallback,
            operationId
          );
          break;

        default:
          throw new Error(`Unsupported import format: ${format}`);
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

  /**
   * Import JSON files
   */
  async importJSON(connectionId, databaseName, files, formatOptions, progressCallback, operationId) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Connection not found');
    }

    const db = client.db(databaseName);
    const results = {
      success: true,
      format: 'json',
      importedFiles: 0,
      totalDocuments: 0,
      errors: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check for cancellation
      if (this.isOperationCancelled(operationId)) {
        throw new Error('Import operation cancelled by user');
      }

      try {
        if (progressCallback) {
          progressCallback({
            stage: 'importing_file',
            currentFile: file.name,
            currentCollection: file.targetCollection,
            importedFiles: i,
            totalFiles: files.length,
            progress: (i / files.length) * 100,
            message: `Importing ${file.name} into ${file.targetCollection}...`
          });
        }

        // Drop collection if override is enabled
        if (file.action === 'override') {
          try {
            await db.collection(file.targetCollection).drop();
            console.log(`Dropped collection: ${file.targetCollection}`);
          } catch (error) {
            // Collection might not exist, which is fine
            if (!error.message.includes('ns not found')) {
              console.warn(`Warning dropping collection: ${error.message}`);
            }
          }
        }

        // Read and parse JSON file
        const fileContent = fs.readFileSync(file.path, 'utf8');
        let documents;

        try {
          const parsed = JSON.parse(fileContent);
          // Handle both single document and array of documents
          documents = Array.isArray(parsed) ? parsed : [parsed];
        } catch (parseError) {
          // Try parsing as JSONL (one JSON per line)
          const lines = fileContent.trim().split('\n');
          documents = lines
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
        }

        if (documents.length === 0) {
          results.errors.push({
            file: file.name,
            error: 'No documents found in file'
          });
          continue;
        }

        // Insert documents
        const collection = db.collection(file.targetCollection);
        await collection.insertMany(documents, { ordered: false });

        results.importedFiles++;
        results.totalDocuments += documents.length;

        if (progressCallback) {
          progressCallback({
            stage: 'file_imported',
            currentFile: file.name,
            currentCollection: file.targetCollection,
            importedFiles: i + 1,
            totalFiles: files.length,
            progress: ((i + 1) / files.length) * 100,
            message: `Imported ${documents.length} documents into ${file.targetCollection}`
          });
        }

      } catch (error) {
        console.error(`Error importing ${file.name}:`, error);
        results.errors.push({
          file: file.name,
          error: error.message
        });
      }
    }

    results.success = results.errors.length === 0;
    results.message = `Imported ${results.totalDocuments} documents from ${results.importedFiles}/${files.length} files`;
    
    return results;
  }

  /**
   * Import CSV files using mongoimport
   */
  async importCSV(connectionId, databaseName, files, formatOptions, progressCallback, operationId) {
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString) {
      throw new Error('Connection string not found');
    }

    const toolsPaths = await this.getMongoToolsPaths();
    if (!toolsPaths.mongoimport) {
      throw new Error('mongoimport tool not found - CSV import requires MongoDB tools');
    }

    const results = {
      success: true,
      format: 'csv',
      importedFiles: 0,
      totalDocuments: 0,
      errors: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check for cancellation
      if (this.isOperationCancelled(operationId)) {
        throw new Error('Import operation cancelled by user');
      }

      try {
        if (progressCallback) {
          progressCallback({
            stage: 'importing_file',
            currentFile: file.name,
            currentCollection: file.targetCollection,
            importedFiles: i,
            totalFiles: files.length,
            progress: (i / files.length) * 100,
            message: `Importing ${file.name} into ${file.targetCollection}...`
          });
        }

        // Drop collection if override is enabled
        if (file.action === 'override') {
          const client = this.clients.get(connectionId);
          const db = client.db(databaseName);
          try {
            await db.collection(file.targetCollection).drop();
            console.log(`Dropped collection: ${file.targetCollection}`);
          } catch (error) {
            if (!error.message.includes('ns not found')) {
              console.warn(`Warning dropping collection: ${error.message}`);
            }
          }
        }

        // Execute mongoimport
        const importResult = await this.executeMongoImport(
          toolsPaths.mongoimport,
          connectionString,
          databaseName,
          file.targetCollection,
          file.path,
          'csv',
          formatOptions,
          progressCallback,
          operationId
        );

        results.importedFiles++;
        results.totalDocuments += importResult.documentCount || 0;

      } catch (error) {
        console.error(`Error importing ${file.name}:`, error);
        results.errors.push({
          file: file.name,
          error: error.message
        });
      }
    }

    results.success = results.errors.length === 0;
    results.message = `Imported ${results.totalDocuments} documents from ${results.importedFiles}/${files.length} files`;
    
    return results;
  }

  /**
   * Import BSON files
   */
  async importBSON(connectionId, databaseName, files, formatOptions, progressCallback, operationId) {
    const client = this.clients.get(connectionId);
    if (!client) {
      throw new Error('Connection not found');
    }

    const db = client.db(databaseName);
    const results = {
      success: true,
      format: 'bson',
      importedFiles: 0,
      totalDocuments: 0,
      errors: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check for cancellation
      if (this.isOperationCancelled(operationId)) {
        throw new Error('Import operation cancelled by user');
      }

      try {
        if (progressCallback) {
          progressCallback({
            stage: 'importing_file',
            currentFile: file.name,
            currentCollection: file.targetCollection,
            importedFiles: i,
            totalFiles: files.length,
            progress: (i / files.length) * 100,
            message: `Importing ${file.name} into ${file.targetCollection}...`
          });
        }

        // Drop collection if override is enabled
        if (file.action === 'override') {
          try {
            await db.collection(file.targetCollection).drop();
            console.log(`Dropped collection: ${file.targetCollection}`);
          } catch (error) {
            if (!error.message.includes('ns not found')) {
              console.warn(`Warning dropping collection: ${error.message}`);
            }
          }
        }

        // Read BSON file
        const bsonData = fs.readFileSync(file.path);
        const documents = this.parseBSONFile(bsonData);

        if (documents.length === 0) {
          results.errors.push({
            file: file.name,
            error: 'No documents found in BSON file'
          });
          continue;
        }

        // Insert documents
        const collection = db.collection(file.targetCollection);
        await collection.insertMany(documents, { ordered: false });

        results.importedFiles++;
        results.totalDocuments += documents.length;

        if (progressCallback) {
          progressCallback({
            stage: 'file_imported',
            currentFile: file.name,
            currentCollection: file.targetCollection,
            importedFiles: i + 1,
            totalFiles: files.length,
            progress: ((i + 1) / files.length) * 100,
            message: `Imported ${documents.length} documents into ${file.targetCollection}`
          });
        }

      } catch (error) {
        console.error(`Error importing ${file.name}:`, error);
        results.errors.push({
          file: file.name,
          error: error.message
        });
      }
    }

    results.success = results.errors.length === 0;
    results.message = `Imported ${results.totalDocuments} documents from ${results.importedFiles}/${files.length} files`;
    
    return results;
  }

  /**
   * Import using mongorestore (for mongodump archives)
   */
  async importUsingMongoRestore(connectionId, databaseName, files, formatOptions, progressCallback, operationId) {
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString) {
      throw new Error('Connection string not found');
    }

    const toolsPaths = await this.getMongoToolsPaths();
    if (!toolsPaths.mongorestore) {
      throw new Error('mongorestore tool not found');
    }

    if (files.length === 0) {
      throw new Error('No files provided for mongorestore');
    }

    const results = {
      success: true,
      format: 'mongorestore',
      importedCollections: 0,
      totalCollections: files.length,
      errors: []
    };

    // Check if this is an archive file (single file, not directory)
    const firstFile = files[0];
    if (firstFile.isArchive) {
      // Handle archive file - restore entire database
      try {
        if (progressCallback) {
          progressCallback({
            stage: 'restoring_archive',
            progress: 10,
            message: `Restoring database from archive ${firstFile.name}...`
          });
        }

        const restoreResult = await this.executeMongoRestoreArchive(
          toolsPaths.mongorestore,
          connectionString,
          databaseName,
          firstFile.path,
          firstFile.action === 'override',
          progressCallback,
          operationId
        );

        console.log(`✅ Archive restore completed for database: ${databaseName}`);
        results.importedCollections = restoreResult.collections;
        results.message = `Successfully restored ${restoreResult.collections} collection(s) from archive ${firstFile.name}`;
        console.log('📊 Import results:', results);
        return results;

      } catch (error) {
        console.error('Error restoring archive:', error);
        results.success = false;
        results.errors.push({
          file: firstFile.name,
          error: error.message
        });
        return results;
      }
    }

    // Handle directory with individual collections
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check for cancellation
      if (this.isOperationCancelled(operationId)) {
        throw new Error('Import operation cancelled by user');
      }

      try {
        if (progressCallback) {
          progressCallback({
            stage: 'restoring_collection',
            currentCollection: file.targetCollection,
            importedCollections: i,
            totalCollections: files.length,
            progress: (i / files.length) * 100,
            message: `Restoring collection ${file.targetCollection}...`
          });
        }

        // Execute mongorestore for this specific collection
        await this.executeMongoRestoreCollection(
          toolsPaths.mongorestore,
          connectionString,
          databaseName,
          file.path,
          file.name, // Original collection name in dump
          file.targetCollection, // Target collection name
          file.action === 'override',
          progressCallback,
          operationId
        );

        results.importedCollections++;

        if (progressCallback) {
          progressCallback({
            stage: 'collection_restored',
            currentCollection: file.targetCollection,
            importedCollections: i + 1,
            totalCollections: files.length,
            progress: ((i + 1) / files.length) * 100,
            message: `Restored collection ${file.targetCollection}`
          });
        }

      } catch (error) {
        console.error(`Error restoring collection ${file.targetCollection}:`, error);
        results.errors.push({
          collection: file.targetCollection,
          error: error.message
        });
      }
    }

    results.success = results.errors.length === 0;
    results.message = `Restored ${results.importedCollections}/${files.length} collections`;
    
    return results;
  }

  /**
   * Execute mongoimport command
   */
  async executeMongoImport(mongoimportPath, connectionString, databaseName, collectionName, filePath, fileType, formatOptions, progressCallback, operationId) {
    return new Promise((resolve, reject) => {
      const { cleanUri } = this.parseConnectionString(connectionString);

      const args = [
        '--uri', cleanUri,
        '--db', databaseName,
        '--collection', collectionName,
        '--type', fileType,
        '--file', filePath
      ];

      // Add CSV-specific options
      if (fileType === 'csv') {
        if (formatOptions.includeHeaders !== false) {
          args.push('--headerline');
        }
      }

      console.log(`🚀 Executing mongoimport: ${mongoimportPath} ${args.filter(arg => !arg.includes('://')).join(' ')}`);

      const mongoimport = spawn(mongoimportPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Track the process for cancellation
      if (operationId && this.activeOperations.has(operationId)) {
        const operation = this.activeOperations.get(operationId);
        operation.processes.push(mongoimport);
        operation.stage = 'importing';
      }

      let output = '';
      let errorOutput = '';
      let documentCount = 0;

      const parseProgress = (text) => {
        if (text.includes('imported')) {
          const match = text.match(/(\d+)\s+document/);
          if (match) {
            documentCount = parseInt(match[1]);
          }
        }
      };

      mongoimport.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        parseProgress(text);
        console.log(`mongoimport stdout:`, text.trim());
      });

      mongoimport.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        parseProgress(text);
        console.log(`mongoimport stderr:`, text.trim());
      });

      mongoimport.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ mongoimport completed successfully`);
          resolve({
            success: true,
            documentCount,
            output
          });
        } else {
          console.error(`❌ mongoimport failed with code ${code}`);
          reject(new Error(`mongoimport failed: ${errorOutput || output}`));
        }
      });

      mongoimport.on('error', (error) => {
        reject(new Error(`Failed to execute mongoimport: ${error.message}`));
      });
    });
  }

  /**
   * Execute mongorestore for archive file
   */
  async executeMongoRestoreArchive(mongorestorePath, connectionString, databaseName, archivePath, dropDatabase, progressCallback, operationId) {
    return new Promise((resolve, reject) => {
      const { cleanUri } = this.parseConnectionString(connectionString);

      let sourceDatabase = null;
      let shouldRestart = false;
      let collections = [];

      const startRestore = (nsFrom = null, nsTo = null) => {
        const args = [
          '--uri', cleanUri,
          '--archive=' + archivePath
        ];

        // Add namespace mapping if we know the source database
        if (nsFrom && nsTo) {
          console.log(`📝 Renaming namespace from '${nsFrom}' to '${nsTo}'`);
          args.push('--nsFrom', `${nsFrom}.*`);
          args.push('--nsTo', `${nsTo}.*`);
        }

        // Add --drop flag if override is enabled
        if (dropDatabase) {
          args.push('--drop');
        }

        // Check if file is gzipped based on extension
        const isGzipped = archivePath.endsWith('.gz') || archivePath.endsWith('.agz');
        if (isGzipped) {
          args.push('--gzip');
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

        mongorestore.stdout.on('data', (data) => {
          output += data.toString();
        });

        mongorestore.stderr.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;

          // Check for cancellation
          if (operationId && this.activeOperations.has(operationId)) {
            const operation = this.activeOperations.get(operationId);
            if (operation.cancelled) {
              mongorestore.kill('SIGTERM');
              return;
            }
          }

          if (text.trim()) {
            console.log(`📝 mongorestore: ${text.trim()}`);
          }

          // Detect source database from first line of output (only if we haven't added namespace mapping yet)
          if (!sourceDatabase && !nsFrom) {
            const match = text.match(/(?:reading metadata for|restoring) ([A-Za-z0-9_\-]+)\./);
            if (match) {
              sourceDatabase = match[1];
              console.log(`✅ Detected source database: ${sourceDatabase}`);
              
              // If different from target, we need to restart with namespace mapping
              if (sourceDatabase !== databaseName) {
                console.log(`🔄 Source database different from target (${databaseName}), restarting with namespace mapping...`);
                shouldRestart = true;
                mongorestore.kill('SIGTERM');
                return;
              } else {
                console.log(`✅ Source and target database match: ${databaseName}`);
              }
            }
          }

          // Parse collection names from output
          const collMatch = text.match(/(?:restoring|finished restoring) [A-Za-z0-9_\-]+\.([A-Za-z0-9_\-]+)/);
          if (collMatch) {
            const collectionName = collMatch[1];
            if (!collections.includes(collectionName)) {
              collections.push(collectionName);
              console.log(`📂 Detected collection: ${collectionName} (total: ${collections.length})`);

              if (progressCallback) {
                progressCallback({
                  stage: 'restoring_collection',
                  currentCollection: collectionName,
                  importedCollections: collections.length,
                  progress: Math.min(95, 10 + collections.length * 5),
                  message: `Restoring collection: ${collectionName}`
                });
              }
            }
          }
        });

        mongorestore.on('close', (code) => {
          // If we need to restart with namespace mapping
          if (shouldRestart && sourceDatabase) {
            shouldRestart = false;
            collections = []; // Reset collections for the new run
            startRestore(sourceDatabase, databaseName);
            return;
          }

          if (code === 0) {
            console.log(`✅ mongorestore completed successfully`);
            console.log(`📦 Restored ${collections.length} collections:`, collections);

            if (progressCallback) {
              progressCallback({
                stage: 'import_completed',
                importedCollections: collections.length,
                progress: 100,
                message: `Archive restored: ${collections.length} collections`
              });
            }

            resolve({
              success: true,
              collections: collections.length,
              collectionNames: collections,
              output
            });
          } else if (code === null || code === 143 || code === 15) {
            // Process was killed (SIGTERM) - this is expected when restarting
            console.log(`📝 mongorestore process terminated for restart`);
          } else {
            console.error(`❌ mongorestore failed with code ${code}`);
            reject(new Error(`mongorestore failed with code ${code}: ${errorOutput}`));
          }
        });

        mongorestore.on('error', (error) => {
          reject(new Error(`Failed to execute mongorestore: ${error.message}`));
        });
      };

      // Start without namespace mapping first (will detect and restart if needed)
      startRestore();
    });
  }

  /**
   * Execute mongorestore for a specific collection
   */
  async executeMongoRestoreCollection(mongorestorePath, connectionString, databaseName, dumpPath, sourceCollectionName, targetCollectionName, dropCollection, progressCallback, operationId) {
    return new Promise((resolve, reject) => {
      const { cleanUri } = this.parseConnectionString(connectionString);

      const args = [
        '--uri', cleanUri,
        '--db', databaseName,
        '--collection', targetCollectionName,
        '--gzip'
      ];

      // Add --drop flag if override is enabled
      if (dropCollection) {
        args.push('--drop');
      }

      // Find the BSON file for this collection
      const bsonFile = path.join(dumpPath, `${sourceCollectionName}.bson.gz`);
      const bsonFileUncompressed = path.join(dumpPath, `${sourceCollectionName}.bson`);
      
      // Check if file exists (try compressed first, then uncompressed)
      let collectionFile;
      if (fs.existsSync(bsonFile)) {
        collectionFile = bsonFile;
      } else if (fs.existsSync(bsonFileUncompressed)) {
        collectionFile = bsonFileUncompressed;
        // Remove --gzip flag if file is not compressed
        const gzipIndex = args.indexOf('--gzip');
        if (gzipIndex !== -1) {
          args.splice(gzipIndex, 1);
        }
      } else {
        // Check if it's in a subdirectory (database name)
        const subdirs = fs.readdirSync(dumpPath, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name);
        
        for (const subdir of subdirs) {
          const subdirPath = path.join(dumpPath, subdir);
          const subBsonFile = path.join(subdirPath, `${sourceCollectionName}.bson.gz`);
          const subBsonFileUncompressed = path.join(subdirPath, `${sourceCollectionName}.bson`);
          
          if (fs.existsSync(subBsonFile)) {
            collectionFile = subBsonFile;
            break;
          } else if (fs.existsSync(subBsonFileUncompressed)) {
            collectionFile = subBsonFileUncompressed;
            const gzipIndex = args.indexOf('--gzip');
            if (gzipIndex !== -1) {
              args.splice(gzipIndex, 1);
            }
            break;
          }
        }
      }

      if (!collectionFile) {
        reject(new Error(`BSON file not found for collection ${sourceCollectionName} in ${dumpPath}`));
        return;
      }

      args.push(collectionFile);

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

      mongorestore.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`mongorestore stdout:`, text.trim());
      });

      mongorestore.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.log(`mongorestore stderr:`, text.trim());
      });

      mongorestore.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ mongorestore completed successfully for ${targetCollectionName}`);
          resolve({
            success: true,
            output
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
   * Execute mongorestore command (full database restore - deprecated, use executeMongoRestoreCollection instead)
   */
  async executeMongoRestore(mongorestorePath, connectionString, databaseName, inputPath, dropCollections, progressCallback, operationId) {
    return new Promise((resolve, reject) => {
      const { cleanUri } = this.parseConnectionString(connectionString);

      const args = [
        '--uri', cleanUri,
        '--db', databaseName,
        '--gzip',
        '--numParallelCollections', '4',
        '--numInsertionWorkersPerCollection', '2',
        '--verbose'
      ];

      // Add --drop flag if override is enabled
      if (dropCollections) {
        args.push('--drop');
      }

      // Check if input is a directory or archive
      const stats = fs.statSync(inputPath);
      if (stats.isDirectory()) {
        args.push(inputPath);
      } else {
        args.push('--archive=' + inputPath);
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

      const parseProgress = (text, isStderr = false) => {
        // Check for cancellation
        if (operationId && this.activeOperations.has(operationId)) {
          const operation = this.activeOperations.get(operationId);
          if (operation.cancelled) {
            mongorestore.kill('SIGTERM');
            return;
          }
        }

        if (text.trim()) {
          console.log(`📝 mongorestore ${isStderr ? 'stderr' : 'stdout'}:`, text.trim());
        }

        if (isStderr) {
          // Parse collection restoration progress
          const collectionPattern = /restoring collection [^.]+\.([\w-]+) from/i;
          const match = text.match(collectionPattern);

          if (match && progressCallback) {
            const collectionName = match[1];
            if (!collections.includes(collectionName)) {
              collections.push(collectionName);

              progressCallback({
                stage: 'restoring_collection',
                currentCollection: collectionName,
                importedCollections: collections.length,
                progress: Math.min(95, collections.length * 10),
                message: `Restoring collection: ${collectionName}`
              });
            }
          }

          // Parse progress bar
          const progressBarPattern = /\[([#.]+)\]\s+([^.]+\.)?([^\s]+)\s+([0-9.]+[KMGT]?B)\/([0-9.]+[KMGT]?B)\s+\(([0-9.]+)%\)/i;
          const progressMatch = text.match(progressBarPattern);

          if (progressMatch && progressCallback) {
            const collectionName = progressMatch[3];
            const percentage = parseFloat(progressMatch[6]);

            progressCallback({
              stage: 'restoring_collection',
              currentCollection: collectionName,
              importedCollections: collections.length,
              progress: Math.min(95, (collections.length - 1) * 10 + (percentage / 10)),
              message: `Restoring ${collectionName}: ${percentage}%`
            });
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

          if (progressCallback) {
            progressCallback({
              stage: 'import_completed',
              importedCollections: collections.length,
              progress: 100,
              message: `Import completed: ${collections.length} collections restored`
            });
          }

          resolve({
            success: true,
            collections: collections.length,
            output
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
   * Parse BSON file into documents
   */
  parseBSONFile(bsonData) {
    const documents = [];
    let offset = 0;

    try {
      const { BSON } = require('bson');
      const bson = new BSON();

      while (offset < bsonData.length) {
        // Read document size (first 4 bytes, little-endian)
        if (offset + 4 > bsonData.length) break;
        
        const docSize = bsonData.readInt32LE(offset);
        
        if (offset + docSize > bsonData.length) {
          console.warn(`Incomplete BSON document at offset ${offset}`);
          break;
        }

        // Extract document bytes
        const docBytes = bsonData.slice(offset, offset + docSize);
        
        // Deserialize BSON document
        const document = bson.deserialize(docBytes);
        documents.push(document);
        
        offset += docSize;
      }
    } catch (error) {
      console.error('Error parsing BSON file:', error);
      throw new Error(`Failed to parse BSON file: ${error.message}`);
    }

    return documents;
  }

  /**
   * Validate import options
   */
  validateImportOptions(options) {
    const { connectionId, databaseName, files, format } = options;

    if (!connectionId) {
      throw new Error('Connection ID is required');
    }

    if (!databaseName) {
      throw new Error('Database name is required');
    }

    if (!files || files.length === 0) {
      throw new Error('No files provided for import');
    }

    if (!format) {
      throw new Error('Import format is required');
    }

    const validFormats = ['json', 'csv', 'bson', 'mongorestore'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid import format: ${format}`);
    }

    // Validate each file
    for (const file of files) {
      if (!file.path || !fs.existsSync(file.path)) {
        throw new Error(`File not found: ${file.path}`);
      }

      if (!file.targetCollection) {
        throw new Error(`Target collection not specified for file: ${file.name}`);
      }

      if (!file.action || !['override', 'create'].includes(file.action)) {
        throw new Error(`Invalid action for file ${file.name}: ${file.action}`);
      }
    }
  }

  /**
   * Get MongoDB tools paths
   */
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

      const mongoimportPath = path.join(mongoToolsDir, `mongoimport${shellExtension}`);
      const mongorestorePath = path.join(mongoToolsDir, `mongorestore${shellExtension}`);

      console.log(`🔍 Checking for import tools in: ${mongoToolsDir}`);
      console.log(`   mongoimport: ${mongoimportPath} (exists: ${fs.existsSync(mongoimportPath)})`);
      console.log(`   mongorestore: ${mongorestorePath} (exists: ${fs.existsSync(mongorestorePath)})`);

      return {
        mongoimport: fs.existsSync(mongoimportPath) ? mongoimportPath : null,
        mongorestore: fs.existsSync(mongorestorePath) ? mongorestorePath : null
      };
    } catch (error) {
      console.error('❌ Error detecting MongoDB import tools:', error.message);
      return {
        mongoimport: null,
        mongorestore: null
      };
    }
  }

  /**
   * Check if import tools are available
   */
  async checkImportToolsAvailability() {
    const toolsPaths = await this.getMongoToolsPaths();
    
    const tools = {
      mongoimport: !!toolsPaths.mongoimport,
      mongorestore: !!toolsPaths.mongorestore
    };
    
    console.log(`📊 Import tools availability:`, tools);
    
    return {
      success: true,
      available: tools.mongoimport || tools.mongorestore,
      tools,
      binariesStatus: {
        available: tools.mongoimport || tools.mongorestore,
        systemInstalled: tools.mongoimport || tools.mongorestore,
        localInstalled: false,
        canDownload: false,
        upgradeAvailable: false
      }
    };
  }

  /**
   * Parse connection string to extract components
   */
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

  /**
   * Check if operation is cancelled
   */
  isOperationCancelled(operationId) {
    if (!operationId) return false;
    
    const operation = this.activeOperations.get(operationId);
    return operation && operation.cancelled;
  }

  /**
   * Cancel an active import operation
   */
  cancelOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return false;
    }

    console.log(`Cancelling import operation: ${operationId}`);
    operation.cancelled = true;

    // Kill all associated processes
    for (const process of operation.processes) {
      try {
        process.kill('SIGTERM');
      } catch (error) {
        console.error('Error killing process:', error);
      }
    }

    return true;
  }

  /**
   * Cleanup method to close all active operations
   */
  async cleanup() {
    console.log('🧹 Starting DatabaseImportManager cleanup...');
    
    // Cancel all active operations
    for (const [operationId, operation] of this.activeOperations) {
      console.log(`🛑 Cancelling active operation: ${operationId}`);
      this.cancelOperation(operationId);
    }
    
    this.activeOperations.clear();
    console.log('✅ DatabaseImportManager cleanup completed');
  }
}

module.exports = DatabaseImportManager;

