const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');

/**
 * Data transformer that applies AI transformation rules
 */
class DataTransformer {
  constructor(mappingRules) {
    this.rules = mappingRules.transformationRules || [];
    this.fieldMappings = mappingRules.fieldMappings || [];
  }

  transform(row) {
    const result = {};
    
    for (const mapping of this.fieldMappings) {
      const sourceValue = row[mapping.sourceField];
      const targetField = mapping.targetField;
      
      if (targetField) {
        result[targetField] = this.transformValue(sourceValue, mapping.targetType, mapping.transformation);
      }
    }
    
    // If no field mappings, copy all fields
    if (this.fieldMappings.length === 0) {
      for (const [key, value] of Object.entries(row)) {
        result[key] = value;
      }
    }
    
    return result;
  }

  transformValue(value, targetType, transformation) {
    if (value === null || value === undefined) {
      return null;
    }

    // Apply custom transformation if specified
    if (transformation) {
      try {
        value = this.applyTransformation(value, transformation);
      } catch (error) {
        console.warn(`Transformation failed for value ${value}:`, error.message);
      }
    }

    // Type conversion
    switch (targetType?.toLowerCase()) {
      case 'number':
      case 'integer':
      case 'int':
      case 'float':
      case 'double':
      case 'decimal':
        const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? null : num;
      
      case 'boolean':
      case 'bool':
        if (typeof value === 'boolean') return value;
        const strValue = String(value).toLowerCase().trim();
        return ['true', '1', 'yes', 'si', 'sí'].includes(strValue);
      
      case 'date':
      case 'datetime':
      case 'timestamp':
        return this.parseDate(value);
      
      case 'array':
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return value.split(',').map(s => s.trim());
          }
        }
        return [value];
      
      case 'object':
      case 'json':
        if (typeof value === 'object') return value;
        try {
          return JSON.parse(value);
        } catch {
          return { value };
        }
      
      default:
        return String(value);
    }
  }

  parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    
    // Handle Excel serial dates
    if (typeof value === 'number') {
      const excelEpoch = new Date(1900, 0, 1);
      const days = value - 1;
      return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    }
    
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  applyTransformation(value, transformation) {
    if (!transformation) return value;
    
    switch (transformation.type) {
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      case 'trim':
        return String(value).trim();
      case 'replace':
        return String(value).replace(
          new RegExp(transformation.pattern, 'g'),
          transformation.replacement || ''
        );
      default:
        return value;
    }
  }
}

/**
 * BaseDatabaseBuilder - Abstract base class for database builders
 * 
 * Contains shared functionality for file processing, transformations,
 * progress tracking, and validation. Database-specific operations
 * must be implemented by derived classes.
 */
class BaseDatabaseBuilder {
  constructor(dbConnection) {
    this.dbConnection = dbConnection;
    this.batchSize = 1000;
    this.startTime = null;
    this.lastProgressTime = null;
    this.progressThrottleMs = 1000;
  }

  // ===== ABSTRACT METHODS (must be implemented by derived classes) =====

  /**
   * Get the database client/pool for a connection
   * @abstract
   */
  getClient(connectionId) {
    throw new Error('getClient must be implemented by derived class');
  }

  /**
   * Insert a batch of documents/rows
   * @abstract
   */
  async insertBatch(connectionId, database, tableName, columns, rows) {
    throw new Error('insertBatch must be implemented by derived class');
  }

  /**
   * Create a table/collection with the given schema
   * @abstract
   */
  async createTable(connectionId, database, tableName, columns, mapping) {
    throw new Error('createTable must be implemented by derived class');
  }

  /**
   * Create indexes for a table/collection
   * @abstract
   */
  async createIndexes(connectionId, database, tableName, indexes) {
    throw new Error('createIndexes must be implemented by derived class');
  }

  /**
   * Get the database type name (for logging)
   * @abstract
   */
  getDatabaseTypeName() {
    throw new Error('getDatabaseTypeName must be implemented by derived class');
  }

  // ===== SHARED UTILITY METHODS =====

  /**
   * Get current memory usage in MB
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Calculate processing rate
   */
  calculateProcessingRate(totalProcessed, startTime) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    return elapsedSeconds > 0 ? Math.round(totalProcessed / elapsedSeconds) : 0;
  }

  /**
   * Check if we should send a progress update (throttled)
   */
  shouldSendProgressUpdate() {
    const now = Date.now();
    if (!this.lastProgressTime || (now - this.lastProgressTime) >= this.progressThrottleMs) {
      this.lastProgressTime = now;
      return true;
    }
    return false;
  }

  /**
   * Check if a field name is valid
   */
  isValidFieldName(name) {
    if (!name || typeof name !== 'string') return false;
    if (name.trim() === '') return false;
    
    const alphanumericOnly = name.replace(/[^a-zA-Z0-9]/g, '');
    if (alphanumericOnly.length === 0) return false;
    
    const lowerName = name.toLowerCase().trim();
    const skipNames = ['empty', 'blank', 'null', 'undefined', 'n/a', 'na', 'none', ''];
    if (skipNames.includes(lowerName)) return false;
    
    return true;
  }

  /**
   * Sanitize field name for database compatibility
   */
  sanitizeFieldName(name) {
    if (!this.isValidFieldName(name)) {
      return null;
    }
    
    const sanitized = name
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .toLowerCase();
    
    return sanitized || null;
  }

  /**
   * Convert Excel date to JavaScript Date
   */
  convertExcelDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    
    if (typeof value === 'number') {
      const excelEpoch = new Date(1900, 0, 1);
      const days = value - 1;
      return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
    }
    
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // ===== DESIGN VALIDATION =====

  /**
   * Validate design structure before execution
   */
  validateDesignStructure(filePath, design) {
    const errors = [];
    const warnings = [];
    
    if (!design) {
      errors.push('Design is null or undefined');
      return { isValid: false, errors, warnings };
    }
    
    if (!design.collections || !Array.isArray(design.collections)) {
      errors.push('Design missing collections array');
    }
    
    if (!design.transformationRules || !Array.isArray(design.transformationRules)) {
      errors.push('Design missing transformationRules array');
    }
    
    if (design.transformationRules) {
      for (let i = 0; i < design.transformationRules.length; i++) {
        const rule = design.transformationRules[i];
        if (!rule.sourceSheet) {
          warnings.push(`Rule ${i} missing sourceSheet`);
        }
        if (!rule.targetCollection) {
          errors.push(`Rule ${i} missing targetCollection`);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Fix common design issues
   */
  fixDesignIssues(design, validation) {
    const fixed = { ...design };
    
    if (!fixed.collections) {
      fixed.collections = [];
    }
    
    if (!fixed.transformationRules) {
      fixed.transformationRules = [];
    }
    
    // Create collections from transformation rules if missing
    const existingCollections = new Set(fixed.collections.map(c => c.name));
    for (const rule of fixed.transformationRules) {
      if (rule.targetCollection && !existingCollections.has(rule.targetCollection)) {
        fixed.collections.push({
          name: rule.targetCollection,
          indexes: []
        });
        existingCollections.add(rule.targetCollection);
      }
    }
    
    return fixed;
  }

  // ===== MAIN EXECUTION METHODS =====

  /**
   * Execute AI design and create database
   */
  async executeDesign(filePath, design, connectionId, database, progressCallback) {
    try {
      console.log(`🏗️ Starting ${this.getDatabaseTypeName()} database creation with AI design...`);
      console.log(`Collections/Tables to create: ${design.collections.length}`);
      console.log('📋 Collections/Tables:', design.collections.map(c => c.name));
      console.log('🔄 Transformation rules:', design.transformationRules?.length || 0);
      
      this.startTime = Date.now();
      this.lastProgressTime = this.startTime;
      
      // Validate design
      console.log('🔍 Validating design structure...');
      const validation = this.validateDesignStructure(filePath, design);
      if (!validation.isValid) {
        console.error('❌ Design validation failed:', validation.errors);
        console.log('⚠️ Attempting to fix design issues...');
        design = this.fixDesignIssues(design, validation);
      } else {
        console.log('✅ Design validation passed');
      }
      
      // Verify connection
      const client = this.getClient(connectionId);
      if (!client) {
        throw new Error(`No active ${this.getDatabaseTypeName()} connection found for ID: ${connectionId}`);
      }
      
      // Process and insert data
      console.log('📊 Step 1: Processing and inserting data...');
      const result = await this.processAndInsertData(
        filePath, 
        design, 
        connectionId, 
        database, 
        progressCallback
      );
      
      // Create indexes
      console.log('📋 Step 2: Creating indexes...');
      await this.createIndexesForCollections(
        connectionId, 
        database, 
        design.collections, 
        result.collections
      );
      console.log('✅ Indexes created successfully');
      
      console.log('✅ Database creation completed successfully');
      console.log('📊 Final result:', {
        totalInserted: result.totalInserted,
        collections: result.collections
      });
      
      return {
        success: true,
        totalInserted: result.totalInserted,
        collections: result.collections,
        errors: result.errors,
        strategy: design.strategy
      };
    } catch (error) {
      console.error('❌ Error executing database design:', error);
      throw error;
    }
  }

  /**
   * Simple direct import without transformations
   */
  async executeSimpleDirectImport(filePath, connectionId, database, progressCallback) {
    try {
      console.log(`🏗️ Starting simple direct import to ${this.getDatabaseTypeName()}...`);
      console.log(`File: ${filePath}`);
      console.log(`Target Database: ${database}`);
      
      this.startTime = Date.now();
      this.lastProgressTime = this.startTime;
      
      // Verify connection
      const client = this.getClient(connectionId);
      if (!client) {
        throw new Error(`No active ${this.getDatabaseTypeName()} connection found for ID: ${connectionId}`);
      }
      
      // Process and insert data directly
      console.log('📊 Processing and inserting data directly...');
      const result = await this.processFileDirectly(filePath, connectionId, database, progressCallback);
      
      console.log('✅ Simple direct import completed successfully');
      console.log('📊 Final result:', result);
      
      return {
        success: true,
        insertionResult: result,
        strategy: 'simple_direct_import'
      };
    } catch (error) {
      console.error('❌ Simple direct import failed:', error);
      throw error;
    }
  }

  // ===== FILE PROCESSING =====

  /**
   * Process file and insert data according to AI design
   */
  async processAndInsertData(filePath, design, connectionId, database, progressCallback) {
    const fileExtension = filePath.toLowerCase().split('.').pop();
    console.log(`📄 Processing file: ${filePath}`);
    console.log(`📄 File extension: ${fileExtension}`);
    console.log(`📄 Design has ${design.transformationRules?.length || 0} transformation rules`);
    
    if (fileExtension === 'csv') {
      console.log('📄 Processing as CSV file...');
      return await this.processCSVFile(filePath, design, connectionId, database, progressCallback);
    } else {
      console.log('📄 Processing as Excel file...');
      return await this.processExcelFile(filePath, design, connectionId, database, progressCallback);
    }
  }

  /**
   * Process file directly without transformations
   */
  async processFileDirectly(filePath, connectionId, database, progressCallback) {
    const fileExtension = filePath.toLowerCase().split('.').pop();
    console.log(`📄 Processing file directly: ${filePath}`);
    console.log(`📄 File extension: ${fileExtension}`);
    
    if (fileExtension === 'csv') {
      console.log('📄 Processing as CSV file directly...');
      return await this.processCSVDirectly(filePath, connectionId, database, progressCallback);
    } else {
      console.log('📄 Processing as Excel file directly...');
      return await this.processExcelDirectly(filePath, connectionId, database, progressCallback);
    }
  }

  /**
   * Process Excel file with transformation rules
   */
  async processExcelFile(filePath, design, connectionId, database, progressCallback) {
    console.log(`📊 Starting ${this.getDatabaseTypeName()} Excel file processing...`);
    
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log(`📊 File size: ${fileSizeMB.toFixed(2)} MB`);
    
    const workbook = XLSX.readFile(filePath);
    console.log('📊 Workbook loaded, available sheets:', Object.keys(workbook.Sheets));
    
    let totalProcessed = 0;
    let totalInserted = 0;
    const errors = [];
    const processedTables = [];

    console.log(`📊 Processing ${design.transformationRules.length} transformation rules...`);

    for (const mapping of design.transformationRules) {
      const tableName = mapping.targetCollection;
      console.log(`📊 Processing sheet: ${mapping.sourceSheet} -> ${tableName}`);
      
      const worksheet = workbook.Sheets[mapping.sourceSheet];
      if (!worksheet) {
        console.warn(`⚠️ Sheet ${mapping.sourceSheet} not found in workbook`);
        continue;
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        blankrows: false,
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });
      console.log(`📊 Sheet ${mapping.sourceSheet} has ${jsonData.length} rows of data`);
      
      if (jsonData.length === 0) {
        console.log(`⚠️ No data in sheet ${mapping.sourceSheet}`);
        continue;
      }

      const transformer = new DataTransformer(mapping);
      
      // Transform first row to get column structure
      const sampleRow = transformer.transform(jsonData[0]);
      const columns = Object.keys(sampleRow);
      
      // Create table
      await this.createTable(connectionId, database, tableName, columns, mapping);
      
      // Process in batches
      for (let i = 0; i < jsonData.length; i += this.batchSize) {
        const batch = jsonData.slice(i, i + this.batchSize);
        const transformedBatch = [];
        
        for (const row of batch) {
          try {
            const transformedDoc = transformer.transform(row);
            transformedBatch.push(transformedDoc);
            totalProcessed++;
          } catch (error) {
            errors.push({
              sheet: mapping.sourceSheet,
              row: totalProcessed,
              error: error.message,
              data: row
            });
          }
        }

        if (transformedBatch.length > 0) {
          console.log(`📊 Inserting batch of ${transformedBatch.length} rows into ${tableName}`);
          const insertedCount = await this.insertBatch(connectionId, database, tableName, columns, transformedBatch);
          totalInserted += insertedCount;
          console.log(`✅ Inserted ${insertedCount} rows. Total so far: ${totalInserted}`);
        }

        if (progressCallback && this.shouldSendProgressUpdate()) {
          const processingRate = this.calculateProcessingRate(totalProcessed, this.startTime);
          progressCallback({
            totalProcessed,
            totalInserted,
            errors: errors.length,
            phase: 'inserting',
            currentSheet: mapping.sourceSheet,
            processingRate,
            streamingMode: false
          });
        }
      }

      if (!processedTables.includes(tableName)) {
        processedTables.push(tableName);
      }
    }

    return {
      totalProcessed,
      totalInserted,
      errors: errors.slice(0, 100),
      collections: processedTables,
      strategy: design.strategy
    };
  }

  /**
   * Process CSV file with transformation rules
   */
  async processCSVFile(filePath, design, connectionId, database, progressCallback) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`📊 Starting ${this.getDatabaseTypeName()} CSV file processing...`);
        
        const transformer = new DataTransformer(design.transformationRules[0]);
        const tableName = design.collections[0].name;
        const mapping = design.transformationRules[0];
        
        let batch = [];
        let totalProcessed = 0;
        let totalInserted = 0;
        const errors = [];
        let columns = null;
        let tableCreated = false;

        const stream = fs.createReadStream(filePath, { 
          highWaterMark: 64 * 1024
        })
        .pipe(csv())
        .on('data', async (row) => {
          try {
            const transformedDoc = transformer.transform(row);
            
            // Initialize columns and create table from first row
            if (!tableCreated) {
              columns = Object.keys(transformedDoc);
              await this.createTable(connectionId, database, tableName, columns, mapping);
              tableCreated = true;
            }
            
            batch.push(transformedDoc);
            totalProcessed++;

            if (batch.length >= this.batchSize) {
              stream.pause();
              
              try {
                console.log(`📊 CSV: Inserting batch of ${batch.length} rows into ${tableName}`);
                const insertedCount = await this.insertBatch(connectionId, database, tableName, columns, batch);
                totalInserted += insertedCount;
                console.log(`✅ CSV: Batch inserted ${insertedCount} rows`);
                batch = [];

                if (progressCallback && this.shouldSendProgressUpdate()) {
                  const processingRate = this.calculateProcessingRate(totalProcessed, this.startTime);
                  progressCallback({
                    totalProcessed,
                    totalInserted,
                    errors: errors.length,
                    phase: 'inserting',
                    processingRate,
                    streamingMode: true
                  });
                }
              } catch (insertError) {
                console.error('❌ CSV batch insert error:', insertError.message);
                errors.push({
                  row: totalProcessed,
                  error: `Batch insert failed: ${insertError.message}`,
                  batchSize: batch.length
                });
                batch = [];
              }
              
              stream.resume();
            }
          } catch (error) {
            errors.push({
              row: totalProcessed,
              error: error.message,
              data: row
            });
          }
        })
        .on('end', async () => {
          try {
            if (batch.length > 0 && columns) {
              console.log(`📊 CSV: Inserting final batch of ${batch.length} rows`);
              const insertedCount = await this.insertBatch(connectionId, database, tableName, columns, batch);
              totalInserted += insertedCount;
              console.log(`✅ CSV: Final batch inserted ${insertedCount} rows`);
            }

            console.log(`✅ CSV processing completed. Total processed: ${totalProcessed}, Total inserted: ${totalInserted}`);
            resolve({
              totalProcessed,
              totalInserted,
              errors: errors.slice(0, 100),
              collections: [tableName],
              strategy: design.strategy
            });
          } catch (error) {
            console.error('❌ CSV final batch error:', error);
            reject(error);
          }
        })
        .on('error', (error) => {
          console.error('❌ CSV stream error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Process Excel file directly (no transformations)
   */
  async processExcelDirectly(filePath, connectionId, database, progressCallback) {
    console.log(`📊 Processing Excel file directly for ${this.getDatabaseTypeName()}...`);
    
    const workbook = XLSX.readFile(filePath);
    const sheetNames = Object.keys(workbook.Sheets);
    
    let totalProcessed = 0;
    let totalInserted = 0;
    const errors = [];
    const processedTables = [];

    for (const sheetName of sheetNames) {
      const tableName = this.sanitizeFieldName(sheetName) || `sheet_${processedTables.length + 1}`;
      console.log(`📊 Processing sheet: ${sheetName} -> ${tableName}`);
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        blankrows: false,
        raw: false
      });
      
      if (jsonData.length === 0) {
        console.log(`⚠️ Skipping empty sheet: ${sheetName}`);
        continue;
      }

      // Get columns from first row
      const columns = Object.keys(jsonData[0]).map(col => this.sanitizeFieldName(col) || col);
      
      // Create table
      await this.createTable(connectionId, database, tableName, columns, null);
      
      // Process in batches
      for (let i = 0; i < jsonData.length; i += this.batchSize) {
        const batch = jsonData.slice(i, i + this.batchSize).map(row => {
          const sanitized = {};
          for (const [key, value] of Object.entries(row)) {
            const sanitizedKey = this.sanitizeFieldName(key) || key;
            sanitized[sanitizedKey] = value;
          }
          return sanitized;
        });
        
        totalProcessed += batch.length;
        
        if (batch.length > 0) {
          const insertedCount = await this.insertBatch(connectionId, database, tableName, columns, batch);
          totalInserted += insertedCount;
        }

        if (progressCallback && this.shouldSendProgressUpdate()) {
          progressCallback({
            totalProcessed,
            totalInserted,
            errors: errors.length,
            phase: 'inserting',
            currentSheet: sheetName
          });
        }
      }

      processedTables.push(tableName);
    }

    return {
      totalProcessed,
      totalInserted,
      errors,
      collections: processedTables
    };
  }

  /**
   * Process CSV file directly (no transformations)
   */
  async processCSVDirectly(filePath, connectionId, database, progressCallback) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`📊 Processing CSV file directly for ${this.getDatabaseTypeName()}...`);
        
        const path = require('path');
        const fileName = path.basename(filePath, path.extname(filePath));
        const tableName = this.sanitizeFieldName(fileName) || 'imported_data';
        
        let batch = [];
        let totalProcessed = 0;
        let totalInserted = 0;
        const errors = [];
        let columns = null;
        let tableCreated = false;

        const stream = fs.createReadStream(filePath, { 
          highWaterMark: 64 * 1024
        })
        .pipe(csv())
        .on('data', async (row) => {
          try {
            // Sanitize column names
            const sanitizedRow = {};
            for (const [key, value] of Object.entries(row)) {
              const sanitizedKey = this.sanitizeFieldName(key) || key;
              sanitizedRow[sanitizedKey] = value;
            }
            
            if (!tableCreated) {
              columns = Object.keys(sanitizedRow);
              await this.createTable(connectionId, database, tableName, columns, null);
              tableCreated = true;
            }
            
            batch.push(sanitizedRow);
            totalProcessed++;

            if (batch.length >= this.batchSize) {
              stream.pause();
              
              try {
                const insertedCount = await this.insertBatch(connectionId, database, tableName, columns, batch);
                totalInserted += insertedCount;
                batch = [];

                if (progressCallback && this.shouldSendProgressUpdate()) {
                  progressCallback({
                    totalProcessed,
                    totalInserted,
                    errors: errors.length,
                    phase: 'inserting',
                    streamingMode: true
                  });
                }
              } catch (insertError) {
                errors.push({
                  row: totalProcessed,
                  error: insertError.message
                });
                batch = [];
              }
              
              stream.resume();
            }
          } catch (error) {
            errors.push({ row: totalProcessed, error: error.message });
          }
        })
        .on('end', async () => {
          try {
            if (batch.length > 0 && columns) {
              const insertedCount = await this.insertBatch(connectionId, database, tableName, columns, batch);
              totalInserted += insertedCount;
            }

            resolve({
              totalProcessed,
              totalInserted,
              errors: errors.slice(0, 100),
              collections: [tableName]
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create indexes for all collections that received data
   */
  async createIndexesForCollections(connectionId, database, designCollections, actualCollections) {
    console.log('📋 Creating indexes for collections that received data...');
    
    const collectionsWithData = new Set(actualCollections);
    
    for (const collectionDesign of designCollections) {
      if (!collectionsWithData.has(collectionDesign.name)) {
        console.log(`⏭️ Skipping indexes for empty collection: ${collectionDesign.name}`);
        continue;
      }
      
      console.log(`📋 Creating indexes for: ${collectionDesign.name}`);
      
      if (collectionDesign.indexes && collectionDesign.indexes.length > 0) {
        console.log(`  Creating ${collectionDesign.indexes.length} indexes...`);
        await this.createIndexes(connectionId, database, collectionDesign.name, collectionDesign.indexes);
      }
    }
  }
}

module.exports = { BaseDatabaseBuilder, DataTransformer };

