import { getAIServiceManager } from '../services/manager';
import logger from '../utils/logger';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface ChartSuitabilityRequest {
  queryResult: any[];
  originalQuery?: string;
  queryContext?: {
    operation?: string;
    database?: string;
    collection?: string;
    // Additional context for better AI analysis
    executionTime?: number;
    recordCount?: number;
    hasMoreData?: boolean;
    queryType?: 'aggregation' | 'find' | 'unknown';
    sampleFields?: string[];
  };
  conversationContext?: ConversationMessage[];
}

export interface ChartSuggestion {
  type: string;
  confidence: number;
  reason: string;
  multiSeries?: boolean;
  series?: string[];
  metrics?: SummaryMetric[];
  isBestFit?: boolean; // AI marks which chart is the best fit
  recommendedFields?: {
    xField?: string;
    yField?: string;
  };
}

export interface SummaryMetric {
  field: string;
  label: string;
  total: number;
  average: number;
  max?: number;
  min?: number;
  type: 'total' | 'aggregate';
  format: 'currency' | 'percentage' | 'millions' | 'thousands' | 'number';
}

export interface ParameterSuggestion {
  name: string;
  type: 'date' | 'number' | 'string' | 'enum' | 'boolean';
  description: string;
  field?: string;
  currentValue?: any;
  defaultValue?: any;
  enumValues?: string[];
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface ChartAnalysisResponse {
  suitable: boolean;
  suggestions: ChartSuggestion[];
  error?: string;
  confidence: number;
  dataInsights: {
    recordCount: number;
    fieldCount: number;
    numericFields: string[];
    categoryFields: string[];
    hasTimePattern: boolean;
    hasTotals: boolean;
    hasNestedArrays: boolean;
    nestedStructures: any[];
  };
  parameterization?: {
    isParameterizable: boolean;
    template?: string;
    parameters: ParameterSuggestion[];
    confidence: number;
    reason: string;
  };
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
}

export interface AIAnalysisResult {
  suggestions: ChartSuggestion[];
  parameterization: {
    isParameterizable: boolean;
    parameters: ParameterSuggestion[];
    confidence: number;
    reason: string;
  };
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
}

/**
 * Determines if data structure is suitable for charting using rule-based analysis
 */
function isDataSuitableForCharting(data: any[]): boolean {
  // Only check if we have at least 1 document - let AI decide everything else
  return Array.isArray(data) && data.length > 0;
}

/**
 * Analyzes data structure for chart insights, including nested subdocuments
 */
function analyzeDataStructure(data: any[]) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      recordCount: 0,
      fieldCount: 0,
      numericFields: [],
      categoryFields: [],
      hasTimePattern: false,
      hasTotals: false,
      hasNestedArrays: false,
      nestedStructures: []
    };
  }
  
  const firstItem = data[0];
  const keys = Object.keys(firstItem);
  
  // Analyze top-level fields
  const numericFields: string[] = [];
  const categoryFields: string[] = [];
  const nestedStructures: any[] = [];
  let hasNestedArrays = false;
  
  keys.forEach(key => {
    const value = firstItem[key];
    
    if (typeof value === 'number' && !isNaN(value)) {
      numericFields.push(key);
    } else if (typeof value === 'string') {
      categoryFields.push(key);
    } else if (key === '_id' && value && typeof value === 'object' && !Array.isArray(value)) {
      // Handle nested _id objects (common in MongoDB aggregation results)
      const nestedKeys = Object.keys(value);
      nestedKeys.forEach(nKey => {
        const nValue = value[nKey];
        if (typeof nValue === 'number' && !isNaN(nValue)) {
          numericFields.push(`${key}.${nKey}`);
        } else if (typeof nValue === 'string') {
          categoryFields.push(`${key}.${nKey}`);
        }
      });
      // Also add the _id field itself as a category field for backward compatibility
      categoryFields.push(key);
    } else if (key === '_id') {
      // Handle non-object _id values
      categoryFields.push(key);
    } else if (Array.isArray(value) && value.length > 0) {
      // Handle nested arrays (like timeline)
      hasNestedArrays = true;
      const nestedItem = value[0];
      if (nestedItem && typeof nestedItem === 'object') {
        const nestedKeys = Object.keys(nestedItem);
        const nestedNumeric = nestedKeys.filter(nKey => {
          const nValue = nestedItem[nKey];
          return typeof nValue === 'number' && !isNaN(nValue);
        });
        const nestedCategory = nestedKeys.filter(nKey => {
          const nValue = nestedItem[nKey];
          return typeof nValue === 'string' || nKey === '_id';
        });
        
        nestedStructures.push({
          parentField: key,
          fields: nestedKeys,
          numericFields: nestedNumeric,
          categoryFields: nestedCategory,
          sampleCount: value.length
        });
        
        // Add flattened field names for AI analysis
        nestedNumeric.forEach(nKey => numericFields.push(`${key}.${nKey}`));
        nestedCategory.forEach(nKey => categoryFields.push(`${key}.${nKey}`));
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Handle nested objects (excluding _id which is handled above)
      const nestedKeys = Object.keys(value);
      nestedKeys.forEach(nKey => {
        const nValue = value[nKey];
        if (typeof nValue === 'number' && !isNaN(nValue)) {
          numericFields.push(`${key}.${nKey}`);
        } else if (typeof nValue === 'string') {
          categoryFields.push(`${key}.${nKey}`);
        }
      });
    }
  });
  
  // Check for time patterns (including nested fields)
  const hasTimePattern = categoryFields.some(field => {
    // For nested fields, get the actual value
    let value: any;
    if (field.includes('.')) {
      const [parent, nested] = field.split('.');
      const parentValue = firstItem[parent];
      if (Array.isArray(parentValue) && parentValue.length > 0) {
        value = parentValue[0][nested];
      } else if (parentValue && typeof parentValue === 'object') {
        value = parentValue[nested];
      }
    } else {
      value = firstItem[field];
    }
    
    return typeof value === 'string' && (
      /^\d{4}-\d{2}/.test(value) || // YYYY-MM format
      /^\d{4}$/.test(value) ||      // Year format
      field.toLowerCase().includes('date') ||
      field.toLowerCase().includes('time') ||
      field.toLowerCase().includes('month') ||
      field.toLowerCase().includes('year') ||
      field.toLowerCase().includes('fecha') // Spanish for date
    );
  });
  
  // Check for totals/aggregates (including nested fields)
  const hasTotals = numericFields.some(field => 
    /total|sum|amount|revenue|sales|value|count|quantity|interacci/i.test(field)
  );
  
  return {
    recordCount: data.length,
    fieldCount: keys.length + nestedStructures.reduce((acc, ns) => acc + ns.fields.length, 0),
    numericFields,
    categoryFields,
    hasTimePattern,
    hasTotals,
    hasNestedArrays,
    nestedStructures
  };
}

/**
 * Uses AI to analyze chart suitability and provide intelligent recommendations
 */
async function analyzeChartSuitabilityWithAI(
  data: any[], 
  originalQuery?: string,
  queryContext?: any,
  conversationContext?: ConversationMessage[]
): Promise<AIAnalysisResult> {
  const manager = getAIServiceManager();
  
  // Data is already sampled by the frontend, no need to slice again
  const dataStructure = analyzeDataStructure(data);
  
  const systemPrompt = [
    'You are a data visualization expert specializing in MongoDB aggregation results.',
    'Analyze the provided data and suggest the most appropriate chart types.',
    '',
    'IMPORTANT: This data may contain NESTED ARRAYS or SUBDOCUMENTS.',
    'For example: {_id: "User", timeline: [{fecha: "2024-01-01", total: 100}]}',
    'You can suggest using nested fields like "timeline.fecha" and "timeline.total".',
    '',
    'CHART TYPES AVAILABLE:',
    '- summary: KPI cards for totals, sums, counts, averages (highest priority for aggregate data)',
    '- bar: Categorical data with numeric values',
    '- multi-bar: Multiple numeric metrics by category (grouped bars)',
    '- line: Time series or ordered sequential data',
    '- multi-line: Multiple metrics over time',
    '- pie: Parts of whole, ≤10 categories, single metric',
    '- area: Time series with filled area under curve',
    '- stacked-area: Cumulative time series showing totals',
    '- scatter: Correlation between two numeric variables',
    '- donut: Proportional data with center space (alternative to pie)',
    '- map: Geographic data with lat/lng coordinates',
    '',
    'ANALYSIS GUIDELINES:',
    '- Consider the data structure and what story it tells',
    '- Think about what the user is trying to understand from their query',
    '- Choose visualizations that best reveal patterns and insights',
    '- Consider the number of data points and categories',
    '- Think about whether trends, comparisons, or totals are most important',
    '- Check for lat/latitude and lng/lon/longitude fields for map visualization',
    '',
    'CHART TYPE CONSIDERATIONS:',
    '- summary: Good for key metrics, totals, and KPIs that need quick scanning',
    '- bar: Excellent for comparing categories, rankings, and discrete values',
    '- line/area: Best for showing trends over time or ordered sequences',
    '- pie/donut: Effective for showing parts of a whole (use sparingly, ≤6 slices)',
    '- scatter: Ideal for showing correlation between two numeric dimensions',
    '- map: Perfect for location-based data with coordinates',
    '- multi-series: When comparing multiple metrics across same categories',
    '',
    'FIELD MAPPING GUIDELINES:',
    '- xField: Best categorical/grouping field (e.g., _id, category, date, name)',
    '- yField: Primary numeric field for the chart (e.g., total, count, amount)',
    '- For time series: xField should be date/time field',
    '- For aggregations: xField is usually _id (the grouping field)',
    '- Choose fields that make logical sense together',
    '',
    'CONFIDENCE SCORING:',
    '- 0.9-1.0: Perfect match - visualization clearly shows the data\'s main insight',
    '- 0.7-0.89: Very good match - visualization effectively represents the data',
    '- 0.5-0.69: Good match - visualization works but may not be optimal',
    '- Below 0.5: Poor match (don\'t suggest)',
    '',
    'BEST FIT SELECTION:',
    '- Mark EXACTLY ONE chart as "isBestFit": true',
    '- Choose the chart that best represents the data\'s primary purpose',
    '- Consider: data structure, user intent from query, and visualization clarity',
    '- Think about what insight the user is most likely seeking',
    '- Choose the visualization that makes the data\'s story most clear',
    '- Consider the context: is this for monitoring, analysis, or reporting?',
    '',
    'PARAMETERIZATION ANALYSIS:',
    'Also analyze if the original query can be parameterized for dashboard widgets.',
    'Look for hardcoded values that could become dynamic parameters:',
    '- Date ranges (ISODate values, date strings)',
    '- Numeric filters ($gte, $lte, $eq values)',
    '- String matches (exact values, regex patterns)',
    '- Limit/skip values',
    '- Enum-like values (status, category, region)',
    '',
    'Return ONLY JSON in this format:',
    '{',
    '  "suggestions": [',
    '    {',
    '      "type": "string", // One of: summary|bar|multi-bar|line|multi-line|pie|area|stacked-area|scatter|donut|map',
    '      "confidence": "number", // 0.0 to 1.0',
    '      "reason": "string", // Explanation of why this chart type fits',
    '      "multiSeries": "boolean", // true if multiple data series',
    '      "series": ["string"], // Array of field names for series',
    '      "isBestFit": "boolean", // Mark ONLY ONE chart as the best fit',
    '      "recommendedFields": {',
    '        "xField": "string", // Best field for X-axis',
    '        "yField": "string" // Best field for Y-axis',
    '      }',
    '    }',
    '  ],',
    '  "parameterization": {',
    '    "isParameterizable": "boolean",',
    '    "template": "string", // Query template with placeholders',
    '    "parameters": [',
    '      {',
    '        "name": "string",',
    '        "type": "string", // date|number|string|enum',
    '        "description": "string",',
    '        "currentValue": "any",',
    '        "field": "string"',
    '      }',
    '    ],',
    '    "confidence": "number",',
    '    "reason": "string"',
    '  }',
    '}'
  ].join('\n');
  
  // Format conversation context for AI
  const conversationSection = conversationContext && conversationContext.length > 0 
    ? [
        'CONVERSATION CONTEXT (Last 30 messages):',
        ...conversationContext.map((msg, index) => 
          `${index + 1}. ${msg.role.toUpperCase()}: ${msg.content}`
        ),
        '',
        'Use this conversation context to understand what the user is trying to analyze or discover.',
        'Choose chart types that best serve the user\'s analytical intent from the conversation.',
        ''
      ]
    : [];

  const userPrompt = [
    'MONGODB QUERY RESULT ANALYSIS:',
    '',
    `Original Query: ${originalQuery || 'Not provided'}`,
    `Database: ${queryContext?.database || 'Unknown'}`,
    `Collection: ${queryContext?.collection || 'Unknown'}`,
    `Query Type: ${queryContext?.queryType || 'Unknown'}`,
    `Execution Time: ${queryContext?.executionTime || 'Unknown'}ms`,
    `Total Records: ${queryContext?.recordCount || dataStructure.recordCount}`,
    `Has More Data: ${queryContext?.hasMoreData ? 'Yes' : 'No'}`,
    `Available Fields: ${queryContext?.sampleFields?.join(', ') || 'Unknown'}`,
    '',
    ...conversationSection,
    'DATA STRUCTURE ANALYSIS:',
    `- Records in Sample: ${dataStructure.recordCount}`,
    `- Fields Analyzed: ${dataStructure.fieldCount}`,
    `- Numeric Fields: ${dataStructure.numericFields.join(', ')}`,
    `- Category Fields: ${dataStructure.categoryFields.join(', ')}`,
    `- Has Time Pattern: ${dataStructure.hasTimePattern}`,
    `- Has Totals/Aggregates: ${dataStructure.hasTotals}`,
    `- Has Nested Arrays: ${dataStructure.hasNestedArrays}`,
    `- Nested Structures: ${dataStructure.nestedStructures.map(ns => `${ns.parentField}[${ns.sampleCount} items]`).join(', ')}`,
    '',
    'SAMPLE DATA:',
    JSON.stringify(data, null, 2),
    '',
    'TASK: Analyze this MongoDB query result and suggest appropriate chart types.',
    '',
    'ANALYSIS GUIDELINES:',
    '1. Use the original query to understand the user\'s intent',
    '2. Consider the collection name and database context for domain-specific insights',
    '3. Factor in execution time and record count for performance considerations',
    '4. Use available fields list to suggest optimal x/y field mappings',
    '5. Prioritize summary cards for aggregated data with totals/sums/counts',
    '6. For time series data, suggest line or area charts with proper time field mapping',
    '7. Consider if the data is a sample (hasMoreData) for chart type recommendations',
    '8. Suggest scatter plots when data has two clear numeric variables for correlation',
    '9. Suggest donut as an alternative to pie for better aesthetics',
    '10. Suggest map visualization if data contains lat/latitude AND lng/lon/longitude fields',
    '11. Suggest stacked-area for cumulative time series data',
    '',
    'Return STRICT JSON only with your analysis and recommendations.'
  ].join('\n');
  
  try {
    const ai = await manager.call(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      { temperature: 0.1, maxTokens: 4000 }
    );
    
    if (!ai.success || !ai.text) {
      throw new Error(ai.error || 'AI call failed');
    }
    
    // Extract JSON from AI response
    const jsonMatch = ai.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Return both suggestions and parameterization data with token usage
    return {
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      parameterization: parsed.parameterization || {
        isParameterizable: false,
        parameters: [],
        confidence: 0,
        reason: 'No parameterization analysis available'
      },
      tokenUsage: ai.tokenUsage,
      model: ai.model
    };
    
  } catch (error) {
    logger.error('AI chart analysis failed', { error: (error as any)?.message });
    // Fallback to rule-based suggestions if AI fails
    return {
      suggestions: generateRuleBasedSuggestions(data, dataStructure),
      parameterization: {
        isParameterizable: false,
        parameters: [],
        confidence: 0,
        reason: 'AI analysis failed, no parameterization analysis available'
      }
    };
  }
}

/**
 * Fallback rule-based chart suggestions
 */
function generateRuleBasedSuggestions(data: any[], dataStructure: any): ChartSuggestion[] {
  const suggestions: ChartSuggestion[] = [];
  
  // Summary cards for totals/aggregates
  if (dataStructure.hasTotals) {
    suggestions.push({
      type: 'summary',
      confidence: 0.9,
      reason: 'Data contains totals/aggregates - perfect for summary cards'
    });
  }
  
  // Bar charts for categorical data
  if (dataStructure.categoryFields.length > 0 && dataStructure.numericFields.length > 0) {
    const confidence = dataStructure.numericFields.length === 1 ? 0.8 : 0.75;
    suggestions.push({
      type: dataStructure.numericFields.length > 1 ? 'multi-bar' : 'bar',
      confidence,
      reason: dataStructure.numericFields.length > 1 
        ? 'Multiple metrics - good for grouped bar charts'
        : 'Categorical data with numeric values - perfect for bar charts',
      multiSeries: dataStructure.numericFields.length > 1,
      series: dataStructure.numericFields
    });
  }
  
  // Line charts for time series
  if (dataStructure.hasTimePattern) {
    suggestions.push({
      type: dataStructure.numericFields.length > 1 ? 'multi-line' : 'line',
      confidence: 0.75,
      reason: dataStructure.numericFields.length > 1
        ? 'Multiple metrics over time - good for multi-line charts'
        : 'Time series data - good for line charts',
      multiSeries: dataStructure.numericFields.length > 1,
      series: dataStructure.numericFields
    });
  }
  
  // Pie charts for small categories
  if (data.length <= 10 && dataStructure.categoryFields.length > 0 && dataStructure.numericFields.length === 1) {
    suggestions.push({
      type: 'pie',
      confidence: 0.6,
      reason: 'Small number of categories with single metric - suitable for pie chart'
    });
  }
  
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

export default class ChartAnalyzer {
  /**
   * Main method to analyze chart suitability using AI + rule-based fallback
   */
  static async analyzeChartSuitability(request: ChartSuitabilityRequest): Promise<ChartAnalysisResponse> {
    const { queryResult, originalQuery, queryContext, conversationContext } = request;
    
    try {
      // Basic suitability check
      const suitable = isDataSuitableForCharting(queryResult);
      const dataInsights = analyzeDataStructure(queryResult);
      
      if (!suitable) {
        return {
          suitable: false,
          suggestions: [],
          confidence: 0,
          dataInsights,
          error: 'Data is not suitable for charting. Charts work best with aggregated numeric data.'
        };
      }
      
      // Get AI-powered suggestions and parameterization analysis
      const aiResult = await analyzeChartSuitabilityWithAI(
        queryResult, 
        originalQuery, 
        queryContext,
        conversationContext
      );
      
      // Calculate overall confidence (average of top 3 suggestions)
      const topSuggestions = aiResult.suggestions.slice(0, 3);
      const confidence = topSuggestions.length > 0 
        ? topSuggestions.reduce((sum, s) => sum + s.confidence, 0) / topSuggestions.length
        : 0;
      
      return {
        suitable: true,
        suggestions: aiResult.suggestions,
        confidence,
        dataInsights,
        parameterization: aiResult.parameterization,
        tokenUsage: aiResult.tokenUsage,
        model: aiResult.model
      };
      
    } catch (error) {
      logger.error('Chart analysis failed', { error: (error as any)?.message });
      
      return {
        suitable: false,
        suggestions: [],
        confidence: 0,
        dataInsights: analyzeDataStructure(queryResult),
        error: `Chart analysis failed: ${(error as any)?.message || 'Unknown error'}`
      };
    }
  }
  
  /**
   * Analyzes query text to predict if it will produce chart-suitable results
   */
  static async analyzeQueryForChartPotential(query: string): Promise<{
    likely: boolean;
    confidence: number;
    reason: string;
  }> {
    const manager = getAIServiceManager();
    
    const systemPrompt = [
      'You are a MongoDB query analyzer. Determine if a query is likely to produce chart-suitable results.',
      'Chart-suitable queries typically:',
      '- Use aggregation pipelines ($group, $sum, $count, $avg, etc.)',
      '- Group data by categories or time periods',
      '- Calculate totals, sums, averages, or counts',
      '- Produce 2-1000 result documents',
      '',
      'NOT chart-suitable:',
      '- Simple find() queries returning raw documents',
      '- Single document results',
      '- Text-heavy queries without numeric aggregations',
      '',
      'Return ONLY JSON: {"likely": true/false, "confidence": 0.0-1.0, "reason": "explanation"}'
    ].join('\n');
    
    const userPrompt = [
      'MONGODB QUERY TO ANALYZE:',
      query,
      '',
      'TASK: Determine if this query is likely to produce data suitable for charts.',
      'Consider the query structure, operations used, and expected result format.',
      'Return STRICT JSON only.'
    ].join('\n');
    
    try {
      const ai = await manager.call(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        { temperature: 0.1, maxTokens: 1000 }
      );
      
      if (!ai.success || !ai.text) {
        throw new Error(ai.error || 'AI call failed');
      }
      
      const jsonMatch = ai.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        likely: Boolean(parsed.likely),
        confidence: Number(parsed.confidence) || 0,
        reason: String(parsed.reason || 'Analysis completed')
      };
      
    } catch (error) {
      logger.error('Query chart potential analysis failed', { error: (error as any)?.message });
      
      // Fallback rule-based analysis
      const queryLower = query.toLowerCase();
      const hasAggregation = /\$group|\$sum|\$count|\$avg|\.aggregate\(/.test(queryLower);
      const hasFind = /\.find\(/.test(queryLower) && !hasAggregation;
      
      if (hasAggregation) {
        return {
          likely: true,
          confidence: 0.8,
          reason: 'Query uses aggregation operations which typically produce chart-suitable data'
        };
      } else if (hasFind) {
        return {
          likely: false,
          confidence: 0.7,
          reason: 'Simple find() queries typically return raw documents not suitable for charts'
        };
      } else {
        return {
          likely: false,
          confidence: 0.5,
          reason: 'Unable to determine chart suitability from query structure'
        };
      }
    }
  }
}
