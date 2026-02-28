const fetch = require('node-fetch');
const {
  getDatabaseConfig,
  isRelationalDatabase,
  sanitizeTableName,
  sanitizeColumnName,
  mapType,
  DEFAULT_DATABASE
} = require('./database-configs');

class AIConnector {
  constructor() {
    const { getBackendUrl } = require('../../config/urls.cjs');
    this.aiBackendUrl = process.env.AI_BACKEND_URL || getBackendUrl();
  }

  /**
   * Get database design recommendations from AI backend
   * @param {object} analysisData - The analysis data from file analyzer
   * @param {string} accessToken - The access token for authentication
   * @param {string} databaseType - The target database type
   */
  async getDesignRecommendation(analysisData, accessToken = null, databaseType = DEFAULT_DATABASE) {
    const config = getDatabaseConfig(databaseType);
    
    console.log('🤖 Sending analysis to AI backend...');
    console.log(`📊 Target database: ${config.displayName}`);
    console.log('🌐 AI Backend URL:', this.aiBackendUrl);
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log('🔐 Including access token in request');
    } else {
      console.warn('⚠️ No access token provided - request may fail with 401');
    }

    const requestBody = {
      ...analysisData,
      databaseType: config.name
    };
    
    const response = await fetch(`${this.aiBackendUrl}/api/v1/spreadsheet/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      timeout: 300000
    });

    console.log('📡 AI Backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI Backend error response:', errorText);
      
      let errorMessage = `AI Backend responded with status: ${response.status}`;
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        errorMessage = `${errorMessage} - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const aiResponse = await response.json();
    console.log('✅ Received AI design recommendations');
    
    const design = aiResponse.design || aiResponse;
    
    return {
      success: true,
      design
    };
  }

  /**
   * Fallback design when AI backend is unavailable
   * @param {object} analysisData - The analysis data from file analyzer
   * @param {string} databaseType - The target database type
   */
  getFallbackDesign(analysisData, databaseType = DEFAULT_DATABASE) {
    const { sheets } = analysisData;
    const config = getDatabaseConfig(databaseType);
    
    if (!sheets || sheets.length === 0) {
      throw new Error('No data to process');
    }

    const primarySheet = sheets[0];
    const tableName = sanitizeTableName(primarySheet.name, config);

    const transformationRules = primarySheet.columns.map(col => {
      const rule = {
        sourceColumns: [col],
        targetField: sanitizeColumnName(col, config),
        transformation: 'direct'
      };
      
      if (isRelationalDatabase(databaseType)) {
        rule.targetType = mapType('string', config);
      }
      
      return rule;
    });

    const result = {
      strategy: 'single_collection',
      reasoning: `Fallback design for ${config.displayName}. Using simple single ${config.naming.tableTerm} approach.`,
      databaseType: config.name,
      collections: [{
        name: tableName,
        sourceSheets: [primarySheet.name],
        documentStructure: this.inferBasicStructure(primarySheet.sample, config),
        indexes: this.inferBasicIndexes(primarySheet.columns, config),
        preComputedFields: []
      }],
      transformationRules: [{
        sourceSheet: primarySheet.name,
        targetCollection: tableName,
        mappingType: 'direct',
        transformationRules
      }]
    };

    if (isRelationalDatabase(databaseType)) {
      result.transformationRules[0].fieldMappings = primarySheet.columns.map(col => ({
        sourceField: col,
        targetField: sanitizeColumnName(col, config),
        targetType: mapType('string', config)
      }));
    }

    return result;
  }

  /**
   * Infer basic document structure from sample data
   */
  inferBasicStructure(sample, config) {
    if (!sample || sample.length === 0) {
      return {};
    }

    const structure = {};
    const firstRow = sample[0];

    Object.keys(firstRow).forEach(key => {
      const sanitizedKey = sanitizeColumnName(key, config);
      const value = firstRow[key];
      
      if (value === null || value === undefined) {
        structure[sanitizedKey] = mapType('string', config);
      } else if (typeof value === 'number') {
        structure[sanitizedKey] = Number.isInteger(value) 
          ? mapType('integer', config) 
          : mapType('number', config);
      } else if (this.isDate(value)) {
        structure[sanitizedKey] = mapType('datetime', config);
      } else if (typeof value === 'boolean') {
        structure[sanitizedKey] = mapType('boolean', config);
      } else if (Array.isArray(value)) {
        structure[sanitizedKey] = mapType('array', config);
      } else {
        structure[sanitizedKey] = mapType('string', config);
      }
    });

    return structure;
  }

  /**
   * Infer basic indexes from columns
   */
  inferBasicIndexes(columns, config) {
    const indexes = [];
    
    const idFields = columns.filter(col => 
      col.toLowerCase().includes('id') || 
      col.toLowerCase().includes('_id')
    );
    
    idFields.forEach(field => {
      indexes.push({
        fields: { [sanitizeColumnName(field, config)]: 1 },
        options: {}
      });
    });

    const dateFields = columns.filter(col =>
      col.toLowerCase().includes('date') ||
      col.toLowerCase().includes('time') ||
      col.toLowerCase().includes('created') ||
      col.toLowerCase().includes('updated')
    );

    dateFields.forEach(field => {
      indexes.push({
        fields: { [sanitizeColumnName(field, config)]: -1 },
        options: {}
      });
    });

    return indexes;
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
   * Test connection to AI backend
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.aiBackendUrl}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      return {
        success: response.ok,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AIConnector;
