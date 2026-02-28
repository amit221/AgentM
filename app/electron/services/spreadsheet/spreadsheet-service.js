const FileAnalyzer = require('./file-analyzer');
const AIConnector = require('./ai-connector');
const DatabaseBuilder = require('./database-builder');
const path = require('path');
const fs = require('fs');

class SpreadsheetService {
  constructor(dbConnection) {
    this.dbConnection = dbConnection;
    this.fileAnalyzer = new FileAnalyzer();
    this.aiConnector = new AIConnector();
    this.databaseBuilder = new DatabaseBuilder(dbConnection);
  }

  /**
   * Check if database name conflicts with existing databases
   */
  async checkDatabaseNameConflict(connectionId, databaseName) {
    try {
      const result = await this.dbConnection.listDatabases(connectionId);
      if (!result.success) {
        return { hasConflict: false, error: result.error };
      }
      
      const existingDatabases = result.databases || [];
      const hasConflict = existingDatabases.includes(databaseName);
      
      return {
        hasConflict,
        existingDatabases,
        conflictingName: hasConflict ? databaseName : null
      };
    } catch (error) {
      console.error('Error checking database name conflict:', error);
      return { hasConflict: false, error: error.message };
    }
  }

  /**
   * Generate alternative database name suggestions
   */
  generateAlternativeNames(baseName, existingDatabases) {
    const suggestions = [];
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    
    // Add timestamp suffix
    suggestions.push(`${baseName}_${timestamp}`);
    
    // Add numbered suffixes
    for (let i = 1; i <= 5; i++) {
      const candidate = `${baseName}_${i}`;
      if (!existingDatabases.includes(candidate)) {
        suggestions.push(candidate);
      }
    }
    
    // Add descriptive suffixes
    const descriptiveSuffixes = ['new', 'import', 'data', 'backup', 'copy'];
    descriptiveSuffixes.forEach(suffix => {
      const candidate = `${baseName}_${suffix}`;
      if (!existingDatabases.includes(candidate)) {
        suggestions.push(candidate);
      }
    });
    
    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Main method to process spreadsheet to database
   */
  async processSpreadsheetToDatabase(filePath, connectionId, database, options = {}) {
    try {
      console.log('🚀 Starting spreadsheet to database conversion...');
      console.log(`File: ${path.basename(filePath)}`);
      console.log(`Target Database: ${database}`);

      const result = {
        success: false,
        phase: 'starting',
        error: null,
        fileInfo: null,
        analysisData: null,
        aiDesign: null,
        insertionResult: null
      };

      // Emit progress callback if provided
      const progressCallback = options.onProgress || (() => {});

      // Phase 1: Analyze file
      progressCallback({ phase: 'analyzing', message: 'Analyzing spreadsheet file...' });
      console.log('📊 Phase 1: Analyzing file...');
      
      result.fileInfo = this.fileAnalyzer.getFileStats(filePath);
      
      // Enhanced progress callback for analysis
      result.analysisData = await this.fileAnalyzer.analyzeFile(filePath, {
        onProgress: (analysisProgress) => {
          progressCallback({
            phase: 'analyzing',
            message: analysisProgress.message || 'Analyzing spreadsheet file...',
            data: analysisProgress
          });
        }
      });
      
      console.log('📋 File analysis complete:');
      console.log(`  - Sheets: ${result.analysisData?.sheets?.length || 0}`);
      console.log(`  - Relationships: ${result.analysisData?.relationships?.length || 0}`);
      console.log('📋 Analysis data structure:', JSON.stringify(result.analysisData, null, 2));
      
      result.phase = 'analyzed';
      progressCallback({ 
        phase: 'analyzed', 
        message: 'File analysis complete',
        data: {
          sheets: result.analysisData.sheets.length,
          fileSize: result.fileInfo.sizeMB + ' MB'
        }
      });

      // Phase 2: Get AI design recommendations
      progressCallback({ phase: 'ai_analysis', message: 'Getting AI design recommendations...' });
      console.log('🤖 Phase 2: Getting AI recommendations...');
      
      // Get database type from connection if available
      console.log(`📊 Debug: connectionId = ${connectionId}`);
      console.log(`📊 Debug: dbConnection.getDatabaseType exists = ${typeof this.dbConnection.getDatabaseType}`);
      console.log(`📊 Debug: connectionTypes = ${this.dbConnection.connectionTypes ? Array.from(this.dbConnection.connectionTypes.entries()) : 'undefined'}`);
      const databaseType = connectionId ? this.dbConnection.getDatabaseType(connectionId) : 'mongodb';
      console.log(`📊 Target database type: ${databaseType || 'mongodb'} (raw: ${databaseType})`);
      
      const aiResponse = await this.aiConnector.getDesignRecommendation(result.analysisData, options.accessToken, databaseType || 'mongodb');
      
      console.log('🤖 AI Response received:');
      console.log('  - Success:', aiResponse.success);
      console.log('  - Has design:', !!aiResponse.design);
      
      result.aiDesign = aiResponse.design;
      console.log(`✅ Using AI design - Strategy: ${result.aiDesign?.strategy || 'Unknown'}`);
      console.log(`✅ Collections: ${result.aiDesign?.collections?.length || 0}`);

      // Validate the design structure
      if (!result.aiDesign) {
        throw new Error('No AI design available: both AI response and fallback failed');
      }
      
      if (!result.aiDesign.collections || !Array.isArray(result.aiDesign.collections)) {
        console.error('❌ Invalid design structure:', result.aiDesign);
        throw new Error('Invalid AI design response: missing or invalid collections array');
      }
      
      console.log('✅ Design validation passed');

      result.phase = 'design_ready';
      progressCallback({ 
        phase: 'design_ready', 
        message: 'Database design ready',
        data: {
          strategy: result.aiDesign.strategy,
          collections: result.aiDesign.collections.length,
          reasoning: result.aiDesign.reasoning
        }
      });

      // Phase 3: Execute database creation (if not preview mode)
      if (!options.previewOnly) {
        progressCallback({ phase: 'creating', message: 'Creating optimized database...' });
        console.log('🏗️ Phase 3: Creating database...');
        
        result.insertionResult = await this.databaseBuilder.executeDesign(
          filePath,
          result.aiDesign,
          connectionId,
          database,
          (progress) => {
            progressCallback({
              phase: 'inserting',
              message: `Processing data... ${progress.totalProcessed} rows`,
              data: progress
            });
          }
        );

        console.log(`✅ Inserted ${result.insertionResult.totalInserted} documents`);
        console.log(`Created ${result.insertionResult.collections.length} collection(s)`);
        
        result.phase = 'completed';
        progressCallback({ 
          phase: 'completed', 
          message: 'Database creation completed successfully',
          data: result.insertionResult
        });
      }

      result.success = true;
      return result;

    } catch (error) {
      console.error('❌ Error processing spreadsheet:', error);
      
      const errorResult = {
        success: false,
        phase: 'error',
        error: error.message,
        stack: error.stack
      };

      if (options.onProgress) {
        options.onProgress({
          phase: 'error',
          message: `Error: ${error.message}`,
          error: errorResult
        });
      }

      return errorResult;
    }
  }

  /**
   * Preview database design without creating it
   */
  async previewDatabaseDesign(filePath) {
    return await this.processSpreadsheetToDatabase(filePath, null, null, { 
      previewOnly: true 
    });
  }

  /**
   * Preview database design from buffer without creating it
   */
  async previewDatabaseDesignFromBuffer(buffer, fileName) {
    return await this.processSpreadsheetToDatabaseFromBuffer(buffer, fileName, null, null, { 
      previewOnly: true 
    });
  }

  /**
   * Main method to process spreadsheet buffer to database
   */
  async processSpreadsheetToDatabaseFromBuffer(buffer, fileName, connectionId, database, options = {}) {
    try {
      console.log('🚀 Starting spreadsheet buffer to database conversion...');
      console.log(`File: ${fileName}`);
      console.log(`Target Database: ${database}`);

      const result = {
        success: false,
        phase: 'starting',
        error: null,
        fileInfo: null,
        analysisData: null,
        aiDesign: null,
        insertionResult: null
      };

      // Emit progress callback if provided
      const progressCallback = options.onProgress || (() => {});

      // Phase 1: Analyze buffer
      progressCallback({ phase: 'analyzing', message: 'Analyzing spreadsheet data...' });
      console.log('📊 Phase 1: Analyzing buffer...');
      
      // Create file info from buffer
      result.fileInfo = {
        size: buffer.length,
        sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
        extension: path.extname(fileName).toLowerCase(),
        name: fileName
      };
      
      // Enhanced progress callback for analysis
      result.analysisData = await this.fileAnalyzer.analyzeBuffer(buffer, fileName, {
        onProgress: (analysisProgress) => {
          progressCallback({
            phase: 'analyzing',
            message: analysisProgress.message || 'Analyzing spreadsheet data...',
            step: analysisProgress.step,
            currentSheet: analysisProgress.currentSheet,
            sheetIndex: analysisProgress.sheetIndex,
            totalSheets: analysisProgress.totalSheets,
            totalRows: analysisProgress.totalRows
          });
        }
      });

      console.log('✅ Phase 1 complete: File analysis finished');

      // Phase 2: AI Design (if not preview only)
      if (!options.previewOnly) {
        progressCallback({ phase: 'designing', message: 'Generating AI-optimized database design...' });
        console.log('🤖 Phase 2: AI Design...');
        
        // Get database type from connection if available
        console.log(`📊 Debug (processSpreadsheetToDatabaseFromBuffer): connectionId = ${connectionId}`);
        console.log(`📊 Debug: connectionTypes entries = ${this.dbConnection.connectionTypes ? JSON.stringify(Array.from(this.dbConnection.connectionTypes.entries())) : 'undefined'}`);
        const databaseType = connectionId ? this.dbConnection.getDatabaseType(connectionId) : 'mongodb';
        console.log(`📊 Target database type: ${databaseType || 'mongodb'} (raw: ${databaseType})`);
        
        const aiResponse = await this.aiConnector.getDesignRecommendation(result.analysisData, options.accessToken, databaseType || 'mongodb');
        
        console.log('🤖 AI Response received:');
        console.log('  - Success:', aiResponse.success);
        console.log('  - Has design:', !!aiResponse.design);
        
        result.aiDesign = aiResponse.design;
        console.log(`✅ Using AI design - Strategy: ${result.aiDesign?.strategy || 'Unknown'}`);
        console.log(`✅ Collections: ${result.aiDesign?.collections?.length || 0}`);
        
        console.log('✅ Phase 2 complete: AI design generated');

        // Phase 3: Create Database (if not preview only)
        progressCallback({ phase: 'creating', message: 'Creating optimized database...' });
        console.log('💾 Phase 3: Database creation...');
        
        result.insertionResult = await this.databaseBuilder.createDatabaseFromBuffer(
          buffer, 
          fileName,
          result.aiDesign, 
          connectionId, 
          database,
          progressCallback
        );
        
        console.log('✅ Phase 3 complete: Database created successfully');
      } else {
        // For preview, generate AI design but don't create database
        progressCallback({ phase: 'designing', message: 'Generating AI-optimized database design...' });
        console.log('🤖 Preview Mode: AI Design...');
        
        // Get database type from connection if available
        console.log(`📊 Debug (preview mode): connectionId = ${connectionId}`);
        console.log(`📊 Debug: connectionTypes entries = ${this.dbConnection.connectionTypes ? JSON.stringify(Array.from(this.dbConnection.connectionTypes.entries())) : 'undefined'}`);
        const databaseType = connectionId ? this.dbConnection.getDatabaseType(connectionId) : 'mongodb';
        console.log(`📊 Target database type: ${databaseType || 'mongodb'} (raw: ${databaseType})`);
        
        const aiResponse = await this.aiConnector.getDesignRecommendation(result.analysisData, options.accessToken, databaseType || 'mongodb');
        
        console.log('🤖 AI Response received (preview):');
        console.log('  - Success:', aiResponse.success);
        console.log('  - Has design:', !!aiResponse.design);
        
        result.aiDesign = aiResponse.design;
        console.log(`✅ Using AI design - Strategy: ${result.aiDesign?.strategy || 'Unknown'}`);
        
        console.log('✅ Preview complete: AI design generated');
      }

      result.success = true;
      result.phase = 'completed';
      
      console.log('🎉 Spreadsheet buffer processing completed successfully!');
      return result;

    } catch (error) {
      console.error('❌ Error in processSpreadsheetToDatabaseFromBuffer:', error);
      console.error('❌ Error stack:', error.stack);

      const errorResult = {
        success: false,
        phase: 'error',
        error: error.message,
        fileInfo: null,
        analysisData: null,
        aiDesign: null,
        insertionResult: null
      };

      return errorResult;
    }
  }

  /**
   * Validate file before processing
   */
  validateFile(filePath) {
    try {
      console.log(`📁 Starting file validation for: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`❌ File does not exist: ${filePath}`);
        return { valid: false, error: 'File does not exist' };
      }

      const stats = fs.statSync(filePath);
      const maxSize = 500 * 1024 * 1024; // 500MB limit
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
      
      console.log(`📁 File validation details:`);
      console.log(`   Path: ${filePath}`);
      console.log(`   Size: ${stats.size} bytes (${fileSizeMB} MB)`);
      console.log(`   Max:  ${maxSize} bytes (${maxSizeMB} MB)`);
      console.log(`   Check: ${stats.size} > ${maxSize} = ${stats.size > maxSize}`);
      
      if (stats.size > maxSize) {
        const errorMsg = `File too large. File size: ${fileSizeMB}MB, Maximum allowed: ${maxSizeMB}MB`;
        console.log(`❌ Validation failed: ${errorMsg}`);
        return { 
          valid: false, 
          error: errorMsg
        };
      }
      
      console.log(`✅ File size validation passed`);
      
      // Continue with extension validation...

      const extension = path.extname(filePath).toLowerCase();
      const supportedExtensions = ['.xlsx', '.xls', '.csv'];
      
      if (!supportedExtensions.includes(extension)) {
        return { 
          valid: false, 
          error: `Unsupported file type. Supported: ${supportedExtensions.join(', ')}` 
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get supported file types
   */
  getSupportedFileTypes() {
    return [
      { extension: '.xlsx', description: 'Excel Workbook' },
      { extension: '.xls', description: 'Excel 97-2003 Workbook' },
      { extension: '.csv', description: 'Comma Separated Values' }
    ];
  }

  /**
   * Test AI backend connection
   */
  async testAIConnection() {
    return await this.aiConnector.testConnection();
  }

  /**
   * Create database using existing AI design (no re-analysis)
   */
  async createDatabaseWithExistingDesign(filePath, aiDesign, connectionId, database, options = {}) {
    try {
      console.log('🚀 Creating database with existing AI design...');
      console.log(`File: ${path.basename(filePath)}`);
      console.log(`Target Database: ${database}`);
      console.log(`Strategy: ${aiDesign?.strategy || 'Unknown'}`);

      const result = {
        success: false,
        phase: 'starting',
        error: null,
        aiDesign: aiDesign,
        insertionResult: null
      };

      // Emit progress callback if provided
      const progressCallback = options.onProgress || (() => {});

      // Validate the existing design
      if (!aiDesign) {
        throw new Error('No AI design provided');
      }
      
      if (!aiDesign.collections || !Array.isArray(aiDesign.collections)) {
        console.error('❌ Invalid design structure:', aiDesign);
        throw new Error('Invalid AI design: missing or invalid collections array');
      }
      
      console.log('✅ Using existing AI design validation passed');

      // Skip to Phase 3: Execute database creation directly
      progressCallback({ phase: 'creating', message: 'Creating optimized database...' });
      console.log('🏗️ Creating database with existing design...');
      
      result.insertionResult = await this.databaseBuilder.executeDesign(
        filePath,
        aiDesign,
        connectionId,
        database,
        (progress) => {
          progressCallback({
            phase: 'inserting',
            message: `Processing data... ${progress.totalProcessed} rows`,
            data: progress
          });
        }
      );

      console.log(`✅ Inserted ${result.insertionResult.totalInserted} documents`);
      console.log(`Created ${result.insertionResult.collections.length} collection(s)`);
      
      result.phase = 'completed';
      progressCallback({ 
        phase: 'completed', 
        message: 'Database creation completed successfully',
        data: result.insertionResult
      });

      result.success = true;
      return result;

    } catch (error) {
      console.error('❌ Error creating database with existing design:', error);
      
      const errorResult = {
        success: false,
        phase: 'error',
        error: error.message,
        stack: error.stack
      };

      if (options.onProgress) {
        options.onProgress({
          phase: 'error',
          message: `Error: ${error.message}`,
          error: errorResult
        });
      }

      return errorResult;
    }
  }

  /**
   * Create database using existing AI design from buffer (no re-analysis)
   */
  async createDatabaseWithExistingDesignFromBuffer(buffer, fileName, aiDesign, connectionId, database, options = {}) {
    try {
      console.log('🚀 Creating database with existing AI design from buffer...');
      console.log(`File: ${fileName}`);
      console.log(`Target Database: ${database}`);
      console.log(`Strategy: ${aiDesign?.strategy || 'Unknown'}`);

      const result = {
        success: false,
        phase: 'starting',
        error: null,
        aiDesign: aiDesign,
        insertionResult: null
      };

      // Emit progress callback if provided
      const progressCallback = options.onProgress || (() => {});

      // Validate the existing design
      if (!aiDesign) {
        throw new Error('No AI design provided');
      }
      
      if (!aiDesign.collections || !Array.isArray(aiDesign.collections)) {
        console.error('❌ Invalid design structure:', aiDesign);
        throw new Error('Invalid AI design: missing or invalid collections array');
      }
      
      console.log('✅ Using existing AI design validation passed');

      // Skip to Phase 3: Execute database creation directly
      progressCallback({ phase: 'creating', message: 'Creating optimized database...' });
      console.log('💾 Phase 3: Database creation from buffer...');
      
      result.insertionResult = await this.databaseBuilder.createDatabaseFromBuffer(
        buffer, 
        fileName,
        aiDesign, 
        connectionId, 
        database,
        progressCallback
      );

      console.log(`✅ Inserted ${result.insertionResult.totalInserted} documents`);
      console.log(`Created ${result.insertionResult.collections.length} collection(s)`);
      
      result.phase = 'completed';
      progressCallback({ 
        phase: 'completed', 
        message: 'Database creation completed successfully',
        data: result.insertionResult
      });

      result.success = true;
      return result;

    } catch (error) {
      console.error('❌ Error creating database with existing design from buffer:', error);
      
      const errorResult = {
        success: false,
        phase: 'error',
        error: error.message,
        stack: error.stack
      };

      if (options.onProgress) {
        options.onProgress({
          phase: 'error',
          message: `Error: ${error.message}`,
          error: errorResult
        });
      }

      return errorResult;
    }
  }

  /**
   * Format processing time in human readable format
   */
  formatProcessingTime(seconds) {
    if (seconds < 60) {
      return `${seconds} seconds`;
    } else if (seconds < 3600) {
      const minutes = Math.ceil(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.ceil((seconds % 3600) / 60);
      return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    }
  }

  /**
   * Get file processing estimate from buffer (for drag-and-drop files)
   */
  async getFileProcessingEstimateFromBuffer(buffer, fileName, options = {}) {
    try {
      console.log('📊 Getting processing estimate from buffer for:', fileName);
      
      const progressCallback = options.onProgress || (() => {});
      
      // Analyze the buffer directly with progress updates
      const analysis = await this.fileAnalyzer.analyzeBuffer(buffer, fileName, {
        onProgress: progressCallback
      });
      
      const totalSheets = analysis.sheets?.length || 0;
      const totalRows = analysis.sheets?.reduce((sum, sheet) => sum + (sheet.totalRows || 0), 0) || 0;
      const hasMultipleSheets = analysis.hasMultipleSheets;
      
      // Estimate processing time based on data size
      let estimatedSeconds = Math.max(5, Math.ceil(totalRows / 1000)); // At least 5 seconds, 1 second per 1000 rows
      if (hasMultipleSheets) {
        estimatedSeconds += totalSheets * 2; // Extra time for multiple sheets
      }
      
      const estimatedProcessingTime = this.formatProcessingTime(estimatedSeconds);
      const fileSize = `${(buffer.length / (1024 * 1024)).toFixed(2)} MB`;
      
      return {
        totalSheets,
        totalRows,
        hasMultipleSheets,
        estimatedProcessingTime,
        fileSize,
        isLargeFile: buffer.length > 50 * 1024 * 1024 // 50MB threshold
      };
    } catch (error) {
      console.error('❌ Error getting buffer processing estimate:', error);
      throw new Error(`Failed to analyze file: ${error.message}`);
    }
  }

  /**
   * Get processing statistics for a file
   */
  async getFileProcessingEstimate(filePath) {
    try {
      const fileStats = this.fileAnalyzer.getFileStats(filePath);
      const analysisData = await this.fileAnalyzer.analyzeFile(filePath);
      
      const totalRows = analysisData.sheets.reduce((sum, sheet) => sum + sheet.totalRows, 0);
      const estimatedTimeMinutes = Math.ceil(totalRows / 10000); // Rough estimate: 10k rows per minute
      
      return {
        fileSize: fileStats.sizeMB + ' MB',
        totalSheets: analysisData.sheets.length,
        totalRows,
        estimatedProcessingTime: estimatedTimeMinutes + ' minute(s)',
        hasMultipleSheets: analysisData.hasMultipleSheets,
      };
    } catch (error) {
      throw new Error(`Failed to analyze file: ${error.message}`);
    }
  }

  /**
   * Create database using simple direct import (no AI analysis or transformations)
   */
  async createDatabaseSimpleDirectImport(filePath, connectionId, database, progressCallback) {
    try {
      console.log('🚀 Creating database with simple direct import...');
      console.log(`File: ${path.basename(filePath)}`);
      console.log(`Target Database: ${database}`);
      console.log(`Strategy: simple_direct_import`);

      // Validate file size
      const validation = this.validateFile(filePath);
      if (!validation.valid) {
        throw new Error(`File validation failed: ${validation.error}`);
      }

      console.log('✅ File size validation passed');

      // Initialize progress with direct import flag
      progressCallback({ 
        phase: 'creating', 
        message: 'Starting simple direct import...',
        progress: 0,
        isDirectImport: true
      });

      // Use the simple direct import method from DatabaseBuilder
      const result = await this.databaseBuilder.executeSimpleDirectImport(
        filePath, 
        connectionId, 
        database,
        progressCallback
      );

      console.log(`✅ Inserted ${result.insertionResult.totalInserted} documents`);
      console.log(`Created ${result.insertionResult.collections.length} collection(s)`);
      
      result.phase = 'completed';
      progressCallback({ 
        phase: 'completed', 
        message: 'Simple direct import completed successfully',
        data: result.insertionResult,
        isDirectImport: true
      });

      result.success = true;
      return result;

    } catch (error) {
      console.error('❌ Error in simple direct import:', error);
      
      const errorResult = {
        success: false,
        phase: 'error',
        error: error.message,
        stack: error.stack
      };

      progressCallback({ 
        phase: 'error', 
        message: `Simple direct import failed: ${error.message}`,
        error: error.message
      });

      throw error;
    }
  }
}

module.exports = SpreadsheetService;
