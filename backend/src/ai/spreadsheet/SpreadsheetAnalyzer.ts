import { getAIServiceManager } from '../../services/manager';
import { 
  DatabaseConfig, 
  getDatabaseConfig, 
  sanitizeTableName, 
  sanitizeColumnName, 
  mapType,
  DEFAULT_DATABASE 
} from './database-configs';

interface SheetData {
  name: string;
  sample: any[];
  totalRows: number;
  columns: string[];
  fieldAnalysis?: Record<string, FieldAnalysis>;
}

interface FieldAnalysis {
  type: string;
  isCalculated: boolean;
  isDropdown: boolean;
  isArray: boolean;
  sampleValues: any[];
  uniqueValueCount: number;
  totalValueCount: number;
  nullCount: number;
  emptyStringCount: number;
  hasExcelErrors: boolean;
}

interface RelationshipData {
  sheet1: string;
  sheet2: string;
  commonColumns: string[];
  relationshipType: string;
}

interface AnalysisInput {
  sheets: SheetData[];
  relationships: RelationshipData[];
  model?: string;
  databaseType?: string;
}

interface DatabaseDesign {
  strategy: 'single_collection' | 'multiple_collections' | 'hybrid';
  reasoning: string;
  collections: CollectionDesign[];
  transformationRules: TransformationRule[];
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
  databaseType?: string;
}

interface CollectionDesign {
  name: string;
  sourceSheets: string[];
  documentStructure: Record<string, any>;
  sampleDocument?: Record<string, any>;
  indexes: IndexDefinition[];
}

interface IndexDefinition {
  fields: Record<string, number>;
  options: Record<string, any>;
}

interface TransformationRule {
  sourceSheet: string;
  targetCollection: string;
  mappingType: 'direct' | 'embedded' | 'array_element';
  transformationRules: FieldTransformation[];
  fieldMappings?: FieldMapping[];
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  targetType: string;
}

type TransformationType = 'direct' | 'combine' | 'array' | 'nested' | 'number' | 'date' | 'boolean' | 'dropdown' | 'calculated' | 'skip';

interface FieldTransformation {
  sourceColumns: string[];
  targetField: string;
  transformation: TransformationType;
  targetType?: string;
}

export class SpreadsheetAnalyzer {
  private aiManager = getAIServiceManager();

  async analyzeAndDesign(input: AnalysisInput): Promise<DatabaseDesign> {
    const databaseType = input.databaseType || DEFAULT_DATABASE;
    const config = getDatabaseConfig(databaseType);
    
    try {
      console.log(`🤖 Starting AI analysis for ${config.displayName}...`);
      console.log(`📊 Database config loaded:`);
      console.log(`   - Name: ${config.name}`);
      console.log(`   - Display Name: ${config.displayName}`);
      console.log(`   - Table Case: ${config.naming.tableCase}`);
      console.log(`   - Table Term: ${config.naming.tableTerm}`);
      console.log(`   - Default Type: ${config.defaultType}`);
      
      const prompt = this.buildAnalysisPrompt(input, config);
      
      // Log a preview of the system prompt being used (first 200 chars)
      console.log(`📝 System prompt preview: ${config.systemPrompt.substring(0, 200)}...`);
      
      const aiResponse = await this.aiManager.call(
        [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: prompt }
        ],
        {
          model: input.model
        }
      );

      if (!aiResponse.success || !aiResponse.text) {
        throw new Error(`AI analysis failed: ${aiResponse.error || 'No response'}`);
      }

      console.log('🔍 Parsing AI response...');
      
      if (aiResponse.text.length > 30000 && !aiResponse.text.trim().endsWith('}')) {
        console.warn('⚠️ AI response might be truncated (length:', aiResponse.text.length, ')');
      }
      
      const design = this.parseAIResponse(aiResponse.text);
      const validatedDesign = this.validateAndEnhanceDesign(design, input, config);
      validatedDesign.databaseType = databaseType;
  
      return validatedDesign;

    } catch (error) {
      console.error('AI analysis error:', error);
      return this.createFallbackDesign(input, config);
    }
  }

  private buildAnalysisPrompt(input: AnalysisInput, config: DatabaseConfig): string {
    const { sheets, relationships } = input;
    
    let prompt = `Analyze this spreadsheet data and design an optimal ${config.displayName} database structure.

SPREADSHEET ANALYSIS:
${sheets.map(sheet => `
Sheet: "${sheet.name}" (${sheet.totalRows} rows)
Columns: ${sheet.columns.join(', ')}

Field Analysis:
${this.formatFieldAnalysis(sheet.fieldAnalysis || {})}

Sample Data (first 3 rows):
${JSON.stringify(sheet.sample.slice(0, 3), null, 2)}
`).join('\n')}

RELATIONSHIP ANALYSIS:
${relationships.length > 0 ? JSON.stringify(relationships, null, 2) : 'No cross-sheet relationships detected'}

DESIGN REQUIREMENTS:
${config.designPrinciples.map((p, i) => `${i + 1}. ${p}`).join('\n')}

FIELD TYPE HANDLING:
${config.fieldTypeInstructions.map(i => `   - ${i}`).join('\n')}

Please analyze this data and provide a ${config.displayName} database design that optimizes for the detected data patterns.`;

    return prompt;
  }

  private formatFieldAnalysis(fieldAnalysis: Record<string, FieldAnalysis>): string {
    if (Object.keys(fieldAnalysis).length === 0) {
      return 'No field analysis available';
    }

    return Object.entries(fieldAnalysis)
      .map(([field, analysis]) => {
        const flags = [];
        if (analysis.isCalculated) flags.push('CALCULATED');
        if (analysis.isDropdown) flags.push('DROPDOWN');
        if (analysis.isArray) flags.push('ARRAY');
        if (analysis.hasExcelErrors) flags.push('HAS_ERRORS');
        if (analysis.type === 'excel_error') flags.push('ERROR_FIELD');
        if (analysis.type === 'invalid_number') flags.push('INVALID_NUMBERS');
        
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        const uniqueness = `${analysis.uniqueValueCount}/${analysis.totalValueCount} unique`;
        const nullInfo = analysis.nullCount > 0 ? `, ${analysis.nullCount} nulls` : '';
        const emptyInfo = analysis.emptyStringCount > 0 ? `, ${analysis.emptyStringCount} empty` : '';
        
        return `  - ${field} (${analysis.type})${flagStr}: ${uniqueness}${nullInfo}${emptyInfo}`;
      })
      .join('\n');
  }

  private parseAIResponse(response: string): DatabaseDesign {
    try {
      let jsonString = this.extractCompleteJson(response);
      
      if (!jsonString) {
        throw new Error('No complete JSON found in AI response');
      }
      
      jsonString = this.cleanupJsonString(jsonString);
      const design = JSON.parse(jsonString);
      
      if (!design.strategy || !design.reasoning || !design.collections) {
        throw new Error('Invalid AI response structure');
      }

      return design;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw response length:', response.length);
      console.error('Response preview:', response.substring(0, 500) + '...');
      
      try {
        return this.tryAlternativeJsonParsing(response);
      } catch (altError) {
        console.error('Alternative parsing also failed:', altError);
        throw new Error(`Invalid AI response format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private extractCompleteJson(response: string): string | null {
    const startIndex = response.indexOf('{');
    if (startIndex === -1) return null;
    
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = startIndex; i < response.length; i++) {
      const char = response[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return response.substring(startIndex, i + 1);
          }
        }
      }
    }
    
    return response.substring(startIndex);
  }

  private cleanupJsonString(jsonString: string): string {
    jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
    jsonString = jsonString.replace(/,(\s*,)/g, ',');
    jsonString = jsonString.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    
    const openBrackets = (jsonString.match(/\[/g) || []).length;
    const closeBrackets = (jsonString.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      jsonString += ']'.repeat(openBrackets - closeBrackets);
    }
    
    const openBraces = (jsonString.match(/\{/g) || []).length;
    const closeBraces = (jsonString.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      jsonString += '}'.repeat(openBraces - closeBraces);
    }
    
    return jsonString;
  }

  private tryAlternativeJsonParsing(response: string): DatabaseDesign {
    const matches = response.match(/\{[\s\S]*?\}/g) || [];
    
    for (const match of matches.reverse()) {
      try {
        const cleaned = this.cleanupJsonString(match);
        const parsed = JSON.parse(cleaned);
        
        if (parsed.strategy && parsed.reasoning && parsed.collections) {
          console.log('✅ Successfully parsed with alternative method');
          return parsed;
        }
      } catch (e) {
        continue;
      }
    }
    
    try {
      return this.extractEssentialParts(response);
    } catch (e) {
      throw new Error('Could not parse AI response with any method');
    }
  }

  private extractEssentialParts(response: string): DatabaseDesign {
    console.log('🔧 Attempting to extract essential parts from malformed response');
    
    const strategyMatch = response.match(/"strategy"\s*:\s*"([^"]+)"/);
    const strategy = strategyMatch ? strategyMatch[1] as DatabaseDesign['strategy'] : 'single_collection';
    
    const reasoningMatch = response.match(/"reasoning"\s*:\s*"([^"]+)"/);
    const reasoning = reasoningMatch ? reasoningMatch[1] : 'Extracted from malformed AI response';
    
    const collectionMatches = response.match(/"name"\s*:\s*"([^"]+)"/g) || [];
    const collectionNames = collectionMatches.map(match => {
      const nameMatch = match.match(/"name"\s*:\s*"([^"]+)"/);
      return nameMatch ? nameMatch[1] : 'collection';
    });
    
    if (collectionNames.length === 0) {
      collectionNames.push('collection');
    }
    
    const collections: CollectionDesign[] = collectionNames.map((name, index) => ({
      name,
      sourceSheets: [`Sheet${index + 1}`],
      documentStructure: { id: 'string', data: 'mixed' },
      indexes: [{ fields: { id: 1 }, options: {} }]
    }));
    
    return {
      strategy,
      reasoning: `${reasoning} (Note: Response was malformed and partially reconstructed)`,
      collections,
      transformationRules: []
    };
  }

  private validateAndEnhanceDesign(design: DatabaseDesign, input: AnalysisInput, config: DatabaseConfig): DatabaseDesign {
    console.log(`🔍 Validating design for ${config.displayName}...`);
    console.log('🔍 Original collections:', design.collections.map(c => c.name));
    console.log('🔍 Available sheets:', input.sheets.map(s => s.name));
    
    const nameMapping = new Map<string, string>();
    const usedNames = new Set<string>();
    const actualSheetNames = new Set(input.sheets.map(s => s.name));
    
    // Sanitize collection/table names
    design.collections.forEach(collection => {
      const originalName = collection.name;
      let sanitizedName = sanitizeTableName(originalName, config);
      
      let counter = 1;
      let finalName = sanitizedName;
      while (usedNames.has(finalName.toLowerCase())) {
        finalName = `${sanitizedName}${counter}`;
        counter++;
      }
      
      nameMapping.set(originalName, finalName);
      collection.name = finalName;
      usedNames.add(finalName.toLowerCase());
      
      // Validate source sheets
      if (collection.sourceSheets) {
        collection.sourceSheets = collection.sourceSheets.filter(sheet => actualSheetNames.has(sheet));
      }
    });
    
    console.log('📋 Final names:', design.collections.map(c => c.name));

    // Ensure transformation rules exist
    if (!design.transformationRules || design.transformationRules.length === 0) {
      console.log('⚠️ No transformation rules provided, generating defaults...');
      design.transformationRules = this.generateDefaultTransformationRules(design.collections, input.sheets, config);
    }

    // Update and validate transformation rules
    const validRules: TransformationRule[] = [];
    
    design.transformationRules.forEach(rule => {
      if (!actualSheetNames.has(rule.sourceSheet)) {
        console.warn(`⚠️ Skipping rule for non-existent sheet: ${rule.sourceSheet}`);
        return;
      }
      
      if (nameMapping.has(rule.targetCollection)) {
        rule.targetCollection = nameMapping.get(rule.targetCollection)!;
      }

      // Ensure fieldMappings exist for SQL databases
      if (this.isRelationalDatabase(config) && !rule.fieldMappings) {
        rule.fieldMappings = this.generateFieldMappings(rule, input.sheets, config);
      }
      
      validRules.push(rule);
    });
    
    design.transformationRules = validRules;
    
    // Remove collections without rules
    const collectionsWithRules = new Set(design.transformationRules.map(r => r.targetCollection));
    design.collections = design.collections.filter(c => collectionsWithRules.has(c.name));

    // Add default indexes if needed
    design.collections.forEach(collection => {
      if (!collection.indexes || collection.indexes.length === 0) {
        collection.indexes = this.generateDefaultIndexes(collection.documentStructure);
      }
    });

    console.log(`✅ Validation complete: ${design.collections.length} ${config.naming.tableTerm}s, ${design.transformationRules.length} rules`);

    return design;
  }

  private isRelationalDatabase(config: DatabaseConfig): boolean {
    return ['postgresql', 'mysql', 'sqlite'].includes(config.name);
  }

  private generateFieldMappings(rule: TransformationRule, sheets: SheetData[], config: DatabaseConfig): FieldMapping[] {
    const sheet = sheets.find(s => s.name === rule.sourceSheet);
    if (!sheet) return [];

    return sheet.columns.map(col => {
      const fieldAnalysis = sheet.fieldAnalysis?.[col];
      let targetType = config.defaultType;
      
      if (fieldAnalysis) {
        if (fieldAnalysis.type === 'number' || fieldAnalysis.type === 'string_number') {
          targetType = mapType('number', config);
        } else if (fieldAnalysis.type === 'date') {
          targetType = mapType('datetime', config);
        } else if (fieldAnalysis.type === 'boolean') {
          targetType = mapType('boolean', config);
        } else if (fieldAnalysis.isArray) {
          targetType = mapType('array', config);
        }
      }
      
      return {
        sourceField: col,
        targetField: sanitizeColumnName(col, config),
        targetType
      };
    });
  }

  private generateDefaultTransformationRules(collections: CollectionDesign[], sheets: SheetData[], config: DatabaseConfig): TransformationRule[] {
    const rules: TransformationRule[] = [];

    collections.forEach(collection => {
      collection.sourceSheets.forEach(sheetName => {
        const sheet = sheets.find(s => s.name === sheetName);
        if (!sheet) return;

        const transformationRules = sheet.columns.map(col => {
          const fieldAnalysis = sheet.fieldAnalysis?.[col];
          let transformation: TransformationType = 'direct';
          let targetType: string | undefined;
          
          if (fieldAnalysis) {
            if (fieldAnalysis.type === 'excel_error' || fieldAnalysis.hasExcelErrors) {
              transformation = 'skip';
            } else if (fieldAnalysis.isCalculated) {
              transformation = 'calculated';
            } else if (fieldAnalysis.isDropdown) {
              transformation = 'dropdown';
              targetType = mapType('string', config);
            } else if (fieldAnalysis.isArray && !fieldAnalysis.isDropdown) {
              transformation = 'array';
              targetType = mapType('array', config);
            } else if (fieldAnalysis.type === 'number' || fieldAnalysis.type === 'string_number') {
              transformation = 'number';
              targetType = mapType('number', config);
            } else if (fieldAnalysis.type === 'date') {
              transformation = 'date';
              targetType = mapType('datetime', config);
            } else if (fieldAnalysis.type === 'boolean') {
              transformation = 'boolean';
              targetType = mapType('boolean', config);
            } else {
              targetType = mapType('string', config);
            }
          } else {
            targetType = mapType('string', config);
          }
          
          const fieldTransformation: FieldTransformation = {
            sourceColumns: [col],
            targetField: sanitizeColumnName(col, config),
            transformation
          };
          
          if (this.isRelationalDatabase(config) && targetType) {
            fieldTransformation.targetType = targetType;
          }
          
          return fieldTransformation;
        });

        const rule: TransformationRule = {
          sourceSheet: sheetName,
          targetCollection: collection.name,
          mappingType: 'direct',
          transformationRules
        };

        if (this.isRelationalDatabase(config)) {
          rule.fieldMappings = this.generateFieldMappings(rule, sheets, config);
        }

        rules.push(rule);
      });
    });

    return rules;
  }

  private generateDefaultIndexes(documentStructure: Record<string, any>): IndexDefinition[] {
    const indexes: IndexDefinition[] = [];
    
    Object.keys(documentStructure).forEach(field => {
      if (field.toLowerCase().includes('id')) {
        indexes.push({
          fields: { [field]: 1 },
          options: {}
        });
      }
    });

    return indexes;
  }

  private createFallbackDesign(input: AnalysisInput, config: DatabaseConfig): DatabaseDesign {
    const primarySheet = input.sheets[0];
    const tableName = sanitizeTableName(primarySheet.name, config);

    const documentStructure = this.inferBasicStructure(primarySheet.sample, config);
    
    const transformationRules = primarySheet.columns.map(col => {
      const fieldAnalysis = primarySheet.fieldAnalysis?.[col];
      let transformation: TransformationType = 'direct';
      let targetType: string | undefined = mapType('string', config);
      
      if (fieldAnalysis) {
        if (fieldAnalysis.type === 'excel_error' || fieldAnalysis.hasExcelErrors) {
          transformation = 'skip';
        } else if (fieldAnalysis.isCalculated) {
          transformation = 'calculated';
        } else if (fieldAnalysis.isDropdown) {
          transformation = 'dropdown';
        } else if (fieldAnalysis.isArray && !fieldAnalysis.isDropdown) {
          transformation = 'array';
          targetType = mapType('array', config);
        } else if (fieldAnalysis.type === 'number' || fieldAnalysis.type === 'string_number') {
          transformation = 'number';
          targetType = mapType('number', config);
        } else if (fieldAnalysis.type === 'date') {
          transformation = 'date';
          targetType = mapType('datetime', config);
        } else if (fieldAnalysis.type === 'boolean') {
          transformation = 'boolean';
          targetType = mapType('boolean', config);
        }
      }
      
      const fieldTransformation: FieldTransformation = {
        sourceColumns: [col],
        targetField: sanitizeColumnName(col, config),
        transformation
      };
      
      if (this.isRelationalDatabase(config)) {
        fieldTransformation.targetType = targetType;
      }
      
      return fieldTransformation;
    });

    const rule: TransformationRule = {
      sourceSheet: primarySheet.name,
      targetCollection: tableName,
      mappingType: 'direct',
      transformationRules
    };

    if (this.isRelationalDatabase(config)) {
      rule.fieldMappings = primarySheet.columns.map(col => ({
        sourceField: col,
        targetField: sanitizeColumnName(col, config),
        targetType: mapType('string', config)
      }));
    }

    return {
      strategy: 'single_collection',
      reasoning: `Fallback design for ${config.displayName}. Using simple single ${config.naming.tableTerm} approach with basic field mapping.`,
      databaseType: config.name,
      collections: [{
        name: tableName,
        sourceSheets: [primarySheet.name],
        documentStructure,
        indexes: this.generateDefaultIndexes(documentStructure)
      }],
      transformationRules: [rule]
    };
  }

  private inferBasicStructure(sample: any[], config: DatabaseConfig): Record<string, any> {
    if (!sample || sample.length === 0) {
      return {};
    }

    const structure: Record<string, any> = {};
    const firstRow = sample[0];

    Object.keys(firstRow).forEach(key => {
      const sanitizedKey = sanitizeColumnName(key, config);
      const value = firstRow[key];
      
      if (typeof value === 'number') {
        structure[sanitizedKey] = Number.isInteger(value) 
          ? mapType('integer', config) 
          : mapType('number', config);
      } else if (typeof value === 'boolean') {
        structure[sanitizedKey] = mapType('boolean', config);
      } else if (this.isDate(value)) {
        structure[sanitizedKey] = mapType('datetime', config);
      } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        structure[sanitizedKey] = mapType('array', config);
      } else {
        structure[sanitizedKey] = mapType('string', config);
      }
    });

    return structure;
  }

  private isDate(value: any): boolean {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.length > 5;
  }
}
