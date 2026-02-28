const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

class FileAnalyzer {
  constructor() {
    this.supportedExtensions = ['.xlsx', '.xls', '.csv'];
  }

  /**
   * Safely get worksheet from workbook with error handling
   */
  getWorksheet(workbook, sheetName) {
    if (!workbook || !workbook.Sheets) {
      console.error('❌ Invalid workbook object');
      return null;
    }
    
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      console.error(`❌ Worksheet "${sheetName}" not found in workbook`);
      console.log('📊 Available sheets:', Object.keys(workbook.Sheets));
      return null;
    }
    
    return worksheet;
  }

  /**
   * Analyze a spreadsheet from buffer data (for drag-and-drop files)
   */
  async analyzeBuffer(buffer, fileName, options = {}) {
    try {
      console.log('📁 Starting buffer analysis for:', fileName);
      const fileExtension = path.extname(fileName).toLowerCase();
      console.log('📁 File extension:', fileExtension);
      
      const progressCallback = options.onProgress || (() => {});
      
      if (!this.supportedExtensions.includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      console.log('📊 FileAnalyzer: Sending progress - Reading file data...');
      progressCallback({ message: 'Reading file data...', step: 'reading' });

      let analysisResult;
      if (fileExtension === '.csv') {
        console.log('📊 Analyzing as CSV buffer...');
        console.log('📊 FileAnalyzer: Sending progress - Analyzing CSV data...');
        progressCallback({ message: 'Analyzing CSV data...', step: 'csv_analysis' });
        analysisResult = await this.analyzeCSVBuffer(buffer);
      } else {
        console.log('📊 Analyzing as Excel buffer...');
        console.log('📊 FileAnalyzer: Sending progress - Analyzing Excel workbook...');
        progressCallback({ message: 'Analyzing Excel workbook...', step: 'excel_analysis' });
        analysisResult = await this.analyzeExcelBuffer(buffer, progressCallback);
      }
      
      console.log('📊 FileAnalyzer: Sending progress - Analysis complete');
      progressCallback({ message: 'Analysis complete', step: 'complete' });
      
      console.log('📁 Buffer analysis result structure:');
      console.log('  - hasMultipleSheets:', analysisResult.hasMultipleSheets);
      console.log('  - sheets count:', analysisResult.sheets?.length || 0);
      console.log('  - relationships count:', analysisResult.relationships?.length || 0);
      
      return analysisResult;
    } catch (error) {
      console.error('❌ Error analyzing buffer:', error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Analyze a spreadsheet file and extract sample data and relationships
   */
  async analyzeFile(filePath, options = {}) {
    try {
      console.log('📁 Starting file analysis for:', filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      console.log('📁 File extension:', fileExtension);
      
      const progressCallback = options.onProgress || (() => {});
      
      if (!this.supportedExtensions.includes(fileExtension)) {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      progressCallback({ message: 'Reading file structure...', step: 'reading' });

      let analysisResult;
      if (fileExtension === '.csv') {
        console.log('📊 Analyzing as CSV file...');
        progressCallback({ message: 'Analyzing CSV data...', step: 'csv_analysis' });
        analysisResult = await this.analyzeCSV(filePath);
      } else {
        console.log('📊 Analyzing as Excel file...');
        progressCallback({ message: 'Analyzing Excel workbook...', step: 'excel_analysis' });
        analysisResult = await this.analyzeExcel(filePath, progressCallback);
      }
      
      progressCallback({ message: 'Analysis complete', step: 'complete' });
      
      console.log('📁 File analysis result structure:');
      console.log('  - hasMultipleSheets:', analysisResult.hasMultipleSheets);
      console.log('  - sheets count:', analysisResult.sheets?.length || 0);
      console.log('  - relationships count:', analysisResult.relationships?.length || 0);
      
      return analysisResult;
    } catch (error) {
      console.error('❌ Error analyzing file:', error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Analyze CSV buffer
   */
  async analyzeCSVBuffer(buffer) {
    return new Promise((resolve, reject) => {
      const results = [];
      let totalRows = 0;
      
      // Convert buffer to string and split into lines
      const csvContent = buffer.toString('utf8');
      const lines = csvContent.split('\n');
      
      // Simple CSV parsing (for more complex CSV, we'd need a proper parser)
      const headers = lines[0] ? lines[0].split(',').map(h => h.trim().replace(/"/g, '')) : [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          totalRows++;
          if (results.length < 500) { // Sample first 500 rows
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const row = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
            });
            results.push(row);
          }
        }
      }
      
      resolve({
        hasMultipleSheets: false,
        sheets: [{
          name: 'Sheet1',
          sample: results,
          totalRows,
          columns: headers
        }],
        relationships: []
      });
    });
  }

  /**
   * Analyze CSV file
   */
  async analyzeCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      let totalRows = 0;
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          totalRows++;
          if (results.length < 500) { // Sample first 500 rows
            results.push(data);
          }
        })
        .on('end', () => {
          const columns = results.length > 0 ? Object.keys(results[0]) : [];
          
          resolve({
            hasMultipleSheets: false,
            sheets: [{
              name: 'Sheet1',
              sample: results,
              totalRows,
              columns
            }],
            relationships: []
          });
        })
        .on('error', reject);
    });
  }

  /**
   * Analyze Excel buffer (XLSX/XLS)
   */
  async analyzeExcelBuffer(buffer, progressCallback = () => {}) {
    // Read workbook directly from buffer
    const workbook = XLSX.read(buffer);
    const sheetNames = workbook.SheetNames;
    
    console.log('📊 FileAnalyzer: Sending progress - Processing sheets...');
    progressCallback({ 
      message: `Processing ${sheetNames.length} sheet(s)...`, 
      step: 'sheets',
      sheetCount: sheetNames.length 
    });
    
    if (sheetNames.length === 1) {
      return this.analyzeSingleSheet(workbook, sheetNames[0], progressCallback);
    } else {
      return this.analyzeMultipleSheets(workbook, sheetNames, progressCallback);
    }
  }

  /**
   * Analyze Excel file (XLSX/XLS) with streaming approach
   */
  async analyzeExcel(filePath, progressCallback = () => {}) {
    // Use streaming approach for large files
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    progressCallback({ 
      message: `Loading ${fileSizeMB.toFixed(1)}MB Excel file...`, 
      step: 'loading',
      fileSizeMB 
    });
    
    if (fileSizeMB > 50) { // Use streaming for files larger than 50MB
      progressCallback({ 
        message: 'Large file detected, using optimized processing...', 
        step: 'streaming' 
      });
      return this.analyzeExcelStreaming(filePath, progressCallback);
    }
    
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    
    progressCallback({ 
      message: `Processing ${sheetNames.length} sheet(s)...`, 
      step: 'sheets',
      sheetCount: sheetNames.length 
    });
    
    if (sheetNames.length === 1) {
      return this.analyzeSingleSheet(workbook, sheetNames[0], progressCallback);
    } else {
      return this.analyzeMultipleSheets(workbook, sheetNames, progressCallback);
    }
  }

  /**
   * Analyze Excel file using streaming approach for large files
   */
  async analyzeExcelStreaming(filePath) {
    console.log('📊 Using streaming analysis for large Excel file...');
    
    // Read only the structure and first few rows for analysis
    const workbook = XLSX.readFile(filePath, { 
      sheetRows: 1000, // Limit to first 1000 rows for analysis
      bookSheets: true
    });
    
    const sheetNames = workbook.SheetNames;
    console.log(`📊 Found ${sheetNames.length} sheets in workbook`);
    
    if (sheetNames.length === 1) {
      return this.analyzeSingleSheetStreaming(workbook, sheetNames[0], filePath);
    } else {
      return this.analyzeMultipleSheetsStreaming(workbook, sheetNames, filePath);
    }
  }

  /**
   * Analyze single sheet Excel file
   */
  analyzeSingleSheet(workbook, sheetName, progressCallback = () => {}) {
    const worksheet = this.getWorksheet(workbook, sheetName);
    if (!worksheet) {
      throw new Error(`Failed to access worksheet "${sheetName}". The sheet may not exist or the file may be corrupted.`);
    }
    
    progressCallback({ 
      message: `Extracting data from "${sheetName}"...`, 
      step: 'data_extraction',
      currentSheet: sheetName 
    });
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      defval: null, // Use null for empty cells instead of empty strings
      blankrows: false, // Skip completely blank rows
      raw: false, // Don't return raw values, use formatted values
      dateNF: 'yyyy-mm-dd' // Standardize date format
    });
    const sample = this.getSample(jsonData, 500);
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    
    
    progressCallback({ 
      message: `Analyzing field types in "${sheetName}"...`, 
      step: 'field_analysis',
      currentSheet: sheetName 
    });
    
    // Analyze field types including dropdowns and calculated fields
    const fieldAnalysis = this.analyzeFieldTypes(worksheet, jsonData, columns);

    return {
      hasMultipleSheets: false,
      sheets: [{
        name: sheetName,
        sample,
        totalRows: jsonData.length,
        columns,
        fieldAnalysis
      }],
      relationships: []
    };
  }

  /**
   * Analyze single sheet Excel file with streaming approach
   */
  async analyzeSingleSheetStreaming(workbook, sheetName, filePath) {
    const worksheet = this.getWorksheet(workbook, sheetName);
    if (!worksheet) {
      throw new Error(`Failed to access worksheet "${sheetName}". The sheet may not exist or the file may be corrupted.`);
    }
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      defval: null, // Use null for empty cells instead of empty strings
      blankrows: false, // Skip completely blank rows
      raw: false, // Don't return raw values, use formatted values
      dateNF: 'yyyy-mm-dd' // Standardize date format
    });
    const sample = this.getSample(jsonData, 500);
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    const fieldAnalysis = this.analyzeFieldTypes(worksheet, jsonData, columns);

    // Estimate total rows by reading the full file metadata without loading all data
    const totalRows = await this.estimateExcelRows(filePath, sheetName);

    return {
      hasMultipleSheets: false,
      sheets: [{
        name: sheetName,
        sample,
        totalRows,
        columns,
        fieldAnalysis
      }],
      relationships: []
    };
  }

  /**
   * Analyze multiple sheets Excel file
   */
  analyzeMultipleSheets(workbook, sheetNames, progressCallback = () => {}) {
    const sheets = [];

    // Extract data from each sheet
    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i];
      
      progressCallback({ 
        message: `Processing sheet "${sheetName}" (${i + 1}/${sheetNames.length})...`, 
        step: 'sheet_processing',
        currentSheet: sheetName,
        sheetIndex: i,
        totalSheets: sheetNames.length 
      });
      
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      defval: null, // Use null for empty cells instead of empty strings
      blankrows: false, // Skip completely blank rows
      raw: false, // Don't return raw values, use formatted values
      dateNF: 'yyyy-mm-dd' // Standardize date format
    });
      
      if (jsonData.length > 0) {
        const sample = this.getSample(jsonData, 200); // Smaller sample per sheet
        const columns = Object.keys(jsonData[0]);
        
        
        progressCallback({ 
          message: `Analyzing field types in "${sheetName}"...`, 
          step: 'field_analysis',
          currentSheet: sheetName 
        });
        
        const fieldAnalysis = this.analyzeFieldTypes(worksheet, jsonData, columns);
        
        sheets.push({
          name: sheetName,
          sample,
          totalRows: jsonData.length,
          columns,
          fieldAnalysis
        });
      }
    }

    progressCallback({ 
      message: 'Analyzing relationships between sheets...', 
      step: 'relationship_analysis' 
    });

    // Analyze relationships between sheets
    const relationships = this.analyzeCrossSheetRelationships(sheets);

    return {
      hasMultipleSheets: true,
      sheets,
      relationships
    };
  }

  /**
   * Analyze multiple sheets Excel file with streaming approach
   */
  async analyzeMultipleSheetsStreaming(workbook, sheetNames, filePath) {
    const sheets = [];

    // Extract data from each sheet with limited rows
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      defval: null, // Use null for empty cells instead of empty strings
      blankrows: false, // Skip completely blank rows
      raw: false, // Don't return raw values, use formatted values
      dateNF: 'yyyy-mm-dd' // Standardize date format
    });
      
      if (jsonData.length > 0) {
        const sample = this.getSample(jsonData, 200); // Smaller sample per sheet
        const columns = Object.keys(jsonData[0]);
        const fieldAnalysis = this.analyzeFieldTypes(worksheet, jsonData, columns);
        
        // Estimate total rows for this sheet
        const totalRows = await this.estimateExcelRows(filePath, sheetName);
        
        sheets.push({
          name: sheetName,
          sample,
          totalRows,
          columns,
          fieldAnalysis
        });
      }
    }

    // Analyze relationships between sheets
    const relationships = this.analyzeCrossSheetRelationships(sheets);

    return {
      hasMultipleSheets: true,
      sheets,
      relationships
    };
  }

  /**
   * Estimate total rows in Excel sheet without loading all data
   */
  async estimateExcelRows(filePath, sheetName) {
    try {
      // Read just the sheet structure to get the range
      const workbook = XLSX.readFile(filePath, { 
        bookSheets: true,
        sheetRows: 1 // Read only 1 row to get structure
      });
      
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet || !worksheet['!ref']) {
        return 0;
      }
      
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      return range.e.r + 1; // +1 because range is 0-based
    } catch (error) {
      console.warn(`Could not estimate rows for sheet ${sheetName}:`, error.message);
      return 1000; // Fallback estimate
    }
  }

  /**
   * Get intelligent sample from data
   */
  getSample(data, maxSize) {
    if (data.length <= maxSize) {
      return data;
    }

    // Intelligent sampling: first 100, random middle, last 100
    const sample = [];
    const firstChunk = Math.min(100, Math.floor(maxSize * 0.3));
    const lastChunk = Math.min(100, Math.floor(maxSize * 0.3));
    const middleChunk = maxSize - firstChunk - lastChunk;

    // First rows
    sample.push(...data.slice(0, firstChunk));

    // Random middle rows
    if (middleChunk > 0 && data.length > firstChunk + lastChunk) {
      const middleStart = firstChunk;
      const middleEnd = data.length - lastChunk;
      const middleData = data.slice(middleStart, middleEnd);
      
      for (let i = 0; i < middleChunk && i < middleData.length; i++) {
        const randomIndex = Math.floor(Math.random() * middleData.length);
        sample.push(middleData[randomIndex]);
      }
    }

    // Last rows
    if (lastChunk > 0) {
      sample.push(...data.slice(-lastChunk));
    }

    return sample;
  }





  /**
   * Analyze relationships between sheets
   */
  analyzeCrossSheetRelationships(sheets) {
    const relationships = [];

    for (let i = 0; i < sheets.length; i++) {
      for (let j = i + 1; j < sheets.length; j++) {
        const sheet1 = sheets[i];
        const sheet2 = sheets[j];

        const commonColumns = sheet1.columns.filter(col1 =>
          sheet2.columns.some(col2 => this.columnsLikelyRelated(col1, col2))
        );

        if (commonColumns.length > 0) {
          relationships.push({
            sheet1: sheet1.name,
            sheet2: sheet2.name,
            commonColumns,
            relationshipType: this.guessRelationshipType(sheet1, sheet2, commonColumns)
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Check if columns are likely related
   */
  columnsLikelyRelated(col1, col2) {
    const normalized1 = col1.toLowerCase().replace(/[_\s]/g, '');
    const normalized2 = col2.toLowerCase().replace(/[_\s]/g, '');

    // Exact match
    if (normalized1 === normalized2) return true;

    // ID patterns
    const idPatterns = ['id', 'userid', 'customerid', 'productid', 'orderid'];
    return idPatterns.some(pattern =>
      normalized1.includes(pattern) && normalized2.includes(pattern)
    );
  }

  /**
   * Guess relationship type between sheets
   */
  guessRelationshipType(sheet1, sheet2, commonColumns) {
    // Simple heuristic based on sheet names and common columns
    const name1 = sheet1.name.toLowerCase();
    const name2 = sheet2.name.toLowerCase();

    if (commonColumns.some(col => col.toLowerCase().includes('id'))) {
      if (sheet1.totalRows > sheet2.totalRows * 2) {
        return 'one_to_many'; // sheet2 -> sheet1
      } else if (sheet2.totalRows > sheet1.totalRows * 2) {
        return 'one_to_many'; // sheet1 -> sheet2
      }
    }

    return 'related';
  }

  /**
   * Analyze field types to distinguish dropdowns, arrays, and calculated fields
   */
  analyzeFieldTypes(worksheet, jsonData, columns) {
    const fieldAnalysis = {};
    
    if (!jsonData || jsonData.length === 0) {
      return fieldAnalysis;
    }

    columns.forEach(column => {
      const allColumnValues = jsonData.map(row => row[column]);
      const nonEmptyValues = allColumnValues.filter(val => val != null && val !== '');
      
      fieldAnalysis[column] = {
        type: this.inferFieldType(nonEmptyValues, allColumnValues),
        isCalculated: this.isCalculatedField(worksheet, column, jsonData),
        isDropdown: this.isDropdownField(nonEmptyValues),
        isArray: this.isArrayField(nonEmptyValues),
        sampleValues: nonEmptyValues.slice(0, 5),
        uniqueValueCount: new Set(nonEmptyValues).size,
        totalValueCount: nonEmptyValues.length,
        nullCount: allColumnValues.filter(val => val == null).length,
        emptyStringCount: allColumnValues.filter(val => val === '').length,
        hasExcelErrors: this.hasExcelErrors(allColumnValues)
      };
    });

    return fieldAnalysis;
  }

  /**
   * Check if a field contains calculated values (simplified - no formula detection)
   */
  isCalculatedField(worksheet, columnName, jsonData) {
    // Since we no longer extract formulas, we can't detect calculated fields
    // This method is kept for compatibility but always returns false
    return false;
  }

  /**
   * Check if field appears to be a dropdown (limited unique values, no commas)
   */
  isDropdownField(values) {
    if (values.length === 0) return false;
    if (values.length < 3) return false; // Need at least 3 values to determine pattern
    
    const uniqueValues = new Set(values.map(v => String(v).trim()));
    const uniqueRatio = uniqueValues.size / values.length;
    
    // Enhanced dropdown detection:
    // 1. Low unique value ratio (repeated selections)
    // 2. Values don't contain commas (not comma-separated lists)  
    // 3. Reasonable number of unique options (not too many)
    // 4. Not all values are unique (would indicate free text)
    // 5. Handle numeric dropdowns (status codes, ratings, etc.)
    
    const hasCommas = Array.from(uniqueValues).some(val => val.includes(','));
    const isReasonableOptionCount = uniqueValues.size >= 2 && uniqueValues.size <= 50;
    const hasRepeatedValues = uniqueRatio < 0.8; // Allow higher ratio for smaller datasets
    
    // Special case: Status-like values (common dropdown patterns)
    const statusPatterns = /^(active|inactive|pending|approved|rejected|yes|no|true|false|high|medium|low|new|in progress|completed|cancelled|draft|published|open|closed|todo|done|success|error|warning|info)$/i;
    const hasStatusPattern = Array.from(uniqueValues).some(val => statusPatterns.test(val));
    
    // Additional check: If values look like categories/options (short, non-numeric strings)
    const looksLikeCategories = Array.from(uniqueValues).every(val => {
      const str = String(val);
      return str.length <= 30 && // Not too long (not free text)
             !str.includes('\n') && // No line breaks
             !str.includes('\t'); // No tabs
    });
    
    const isDropdown = (hasRepeatedValues && isReasonableOptionCount && !hasCommas && looksLikeCategories) || hasStatusPattern;
    
    // Debug logging to help troubleshoot
    if (isDropdown) {
      console.log(`🔽 Detected dropdown field with ${uniqueValues.size} unique values: [${Array.from(uniqueValues).slice(0, 5).join(', ')}${uniqueValues.size > 5 ? '...' : ''}]`);
    }
    
    return isDropdown;
  }

  /**
   * Check if field appears to be an array (comma-separated values)
   */
  isArrayField(values) {
    if (values.length === 0) return false;
    if (values.length < 3) return false; // Need sufficient data to determine pattern
    
    // First check if this might be a dropdown - if so, it's NOT an array
    if (this.isDropdownField(values)) {
      console.log(`🔽 Field detected as dropdown, not treating as array`);
      return false;
    }
    
    // Check if values contain commas and look like intentional lists
    const commaValues = values.filter(val => {
      const str = String(val);
      return str.includes(',') && str.split(',').length > 1;
    });
    
    const commaRatio = commaValues.length / values.length;
    
    // Additional checks for true arrays:
    // 1. Multiple comma-separated items per value
    // 2. Consistent formatting (spaces after commas, etc.)
    // 3. Not decimal numbers (which also contain commas in some locales)
    // 4. High percentage of values have commas (indicating intentional lists)
    
    if (commaRatio < 0.5) return false; // Need at least 50% comma-separated values for arrays
    
    // Check if comma values look like intentional lists vs. decimal numbers
    const likelyArrays = commaValues.filter(val => {
      const str = String(val);
      const parts = str.split(',');
      
      // If all parts are numbers, might be decimal notation
      const allNumbers = parts.every(part => !isNaN(part.trim()) && part.trim() !== '');
      if (allNumbers && parts.length === 2) return false; // Likely decimal number
      
      // If parts have consistent spacing/formatting, likely intentional list
      const hasSpacesAfterCommas = str.includes(', ');
      const hasMultipleParts = parts.length >= 2;
      const partsLookLikeText = parts.some(part => isNaN(part.trim()) || part.trim().length > 10);
      
      return hasMultipleParts && (hasSpacesAfterCommas || partsLookLikeText);
    });
    
    const arrayRatio = likelyArrays.length / values.length;
    const isArray = arrayRatio > 0.4; // At least 40% look like intentional arrays
    
    // Debug logging
    if (isArray) {
      console.log(`📋 Detected array field with ${commaRatio * 100}% comma-separated values`);
    }
    
    return isArray;
  }

  /**
   * Check if column contains Excel error values
   */
  hasExcelErrors(values) {
    return values.some(val => {
      if (typeof val === 'string') {
        return val.startsWith('#') && (
          val.includes('REF!') || 
          val.includes('VALUE!') || 
          val.includes('DIV/0!') || 
          val.includes('NAME?') || 
          val.includes('N/A') ||
          val.includes('NULL!')
        );
      }
      return false;
    });
  }

  /**
   * Infer basic field type with enhanced logic
   */
  inferFieldType(values, allValues = null) {
    if (values.length === 0) return 'string';
    
    // Check for mixed types
    const types = new Set();
    const sampleSize = Math.min(values.length, 20); // Sample first 20 values
    
    for (let i = 0; i < sampleSize; i++) {
      const val = values[i];
      if (val == null) continue;
      
      if (typeof val === 'number') {
        if (isNaN(val) || !isFinite(val)) {
          types.add('invalid_number');
        } else {
          types.add('number');
        }
      } else if (typeof val === 'boolean') {
        types.add('boolean');
      } else if (this.isDate(val)) {
        types.add('date');
      } else if (typeof val === 'string') {
        if (this.isExcelError(val)) {
          types.add('excel_error');
        } else if (this.looksLikeNumber(val)) {
          types.add('string_number');
        } else {
          types.add('string');
        }
      } else {
        types.add('unknown');
      }
    }
    
    // Determine primary type based on analysis
    if (types.has('excel_error')) return 'excel_error';
    if (types.has('invalid_number')) return 'invalid_number';
    if (types.size === 1) return Array.from(types)[0];
    if (types.has('number') && types.has('string_number')) return 'number';
    if (types.has('string')) return 'string'; // Default to string for mixed types
    
    return Array.from(types)[0] || 'string';
  }

  /**
   * Check if value is an Excel error
   */
  isExcelError(value) {
    if (typeof value !== 'string') return false;
    return value.startsWith('#') && (
      value.includes('REF!') || 
      value.includes('VALUE!') || 
      value.includes('DIV/0!') || 
      value.includes('NAME?') || 
      value.includes('N/A') ||
      value.includes('NULL!')
    );
  }

  /**
   * Check if string looks like a number
   */
  looksLikeNumber(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return !isNaN(trimmed) && !isNaN(parseFloat(trimmed)) && trimmed !== '';
  }

  /**
   * Check if value looks like a date
   */
  isDate(value) {
    if (typeof value !== 'string') return false;
    
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.length > 5;
  }

  /**
   * Get file statistics
   */
  getFileStats(filePath) {
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      extension: path.extname(filePath).toLowerCase(),
      name: path.basename(filePath)
    };
  }
}

module.exports = FileAnalyzer;
