import { Router, Request } from 'express';
import { z } from 'zod';
import ChartAnalyzer from '../ai/ChartAnalyzer';
import logger from '../utils/logger';

const router = Router();

// Simple chart analysis endpoint - analyzes data and returns complete chart recommendations
router.post('/analyze', async (req: Request, res) => {
  const bodySchema = z.object({
    queryResult: z.array(z.any()),
    originalQuery: z.string().optional(),
    queryContext: z.object({
      operation: z.string().optional(),
      database: z.string().optional(),
      collection: z.string().optional()
    }).optional()
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('Invalid /analyze payload', { 
      requestId: res.locals?.requestId, 
      issues: parsed.error.issues?.slice(0, 5) 
    });
    return res.status(400).json({ 
      error: parsed.error.message, 
      requestId: res.locals?.requestId 
    });
  }

  const { queryResult, originalQuery, queryContext } = parsed.data;
  const start = Date.now();

  try {
    const suitabilityAnalysis = await ChartAnalyzer.analyzeChartSuitability({
      queryResult,
      originalQuery,
      queryContext
    });

    if (!suitabilityAnalysis.suitable) {
      return res.json({
        success: true,
        suitable: false,
        reason: suitabilityAnalysis.error || 'Data not suitable for charting',
        suggestions: suitabilityAnalysis.suggestions || [],
        configurations: {},
        requestId: res.locals?.requestId
      });
    }

    // Generate configurations for each suggested chart type
    const configurations: any = {};
    for (const suggestion of suitabilityAnalysis.suggestions) {
      try {
        configurations[suggestion.type] = await getConfigurationSuggestions(
          queryResult, 
          suggestion.type, 
          originalQuery
        );
      } catch (error) {
        logger.warn(`Failed to generate configuration for chart type ${suggestion.type}`, {
          error: (error as any)?.message,
          requestId: res.locals?.requestId
        });
      }
    }

    const durationMs = Date.now() - start;

    logger.info('Chart analysis completed', {
      requestId: res.locals?.requestId,
      durationMs,
      suitable: true,
      suggestionsCount: suitabilityAnalysis.suggestions.length
    });

    const { model: _model, tokenUsage: _tokenUsage, ...cleanAnalysis } = suitabilityAnalysis as any;

    return res.json({
      success: true,
      suitable: true,
      suggestions: cleanAnalysis.suggestions,
      confidence: cleanAnalysis.confidence,
      dataInsights: cleanAnalysis.dataInsights,
      configurations,
      parameterization: cleanAnalysis.parameterization,
      requestId: res.locals?.requestId
    });

  } catch (error) {
    const durationMs = Date.now() - start;

    logger.error('Chart analysis failed', {
      requestId: res.locals?.requestId,
      durationMs,
      error: (error as any)?.message
    });

    return res.status(500).json({
      success: false,
      error: (error as any)?.message || 'Chart analysis failed',
      requestId: res.locals?.requestId
    });
  }
});

/**
 * Helper function to get configuration suggestions
 */
async function getConfigurationSuggestions(queryResult: any[], chartType: string, originalQuery?: string) {
  if (queryResult.length === 0) {
    return {
      recommendedXAxis: '',
      recommendedYAxis: '',
      availableFields: {
        numeric: [],
        category: [],
        all: []
      },
      chartSpecificOptions: getChartSpecificOptions(chartType, queryResult),
      isEmpty: true,
      message: 'No data available for chart configuration'
    };
  }

  const dataSample = queryResult.slice(0, 5);
  const firstItem = dataSample[0];
  const keys = Object.keys(firstItem || {});
  
  const numericFields = keys.filter(key => {
    const value = firstItem[key];
    return typeof value === 'number' && !isNaN(value);
  });
  
  const categoryFields = keys.filter(key => 
    typeof firstItem[key] === 'string' || key === '_id'
  );

  return {
    recommendedXAxis: categoryFields[0] || keys[0],
    recommendedYAxis: numericFields[0] || keys.find(k => typeof firstItem[k] === 'number'),
    availableFields: {
      numeric: numericFields,
      category: categoryFields,
      all: keys
    },
      chartSpecificOptions: getChartSpecificOptions(chartType, dataSample),
      isEmpty: false
  };
}

/**
 * Get chart-specific configuration options
 */
function getChartSpecificOptions(chartType: string, data: any[]) {
  const options: any = {};
  
  if (data.length === 0) {
    switch (chartType) {
      case 'pie':
        options.maxCategories = 10;
        options.showPercentages = true;
        options.legendPosition = 'bottom';
        options.emptyMessage = 'No data available for pie chart';
        break;
        
      case 'line':
      case 'multi-line':
        options.showDataPoints = true;
        options.smoothCurve = true;
        options.showGrid = true;
        options.emptyMessage = 'No data available for line chart';
        break;
        
      case 'bar':
      case 'multi-bar':
        options.showValues = true;
        options.orientation = 'vertical';
        options.emptyMessage = 'No data available for bar chart';
        break;
        
      case 'summary':
        options.showTrends = false;
        options.compactMode = false;
        options.colorScheme = 'business';
        options.emptyMessage = 'No data available for summary';
        break;
        
      default:
        options.emptyMessage = 'No data available';
        break;
    }
    return options;
  }
  
  switch (chartType) {
    case 'pie':
      options.maxCategories = 10;
      options.showPercentages = true;
      options.legendPosition = 'bottom';
      break;
      
    case 'line':
    case 'multi-line':
      options.showDataPoints = data.length <= 20;
      options.smoothCurve = true;
      options.showGrid = true;
      break;
      
    case 'bar':
    case 'multi-bar':
      options.showValues = data.length <= 15;
      options.orientation = data.length > 10 ? 'horizontal' : 'vertical';
      break;
      
    case 'summary':
      options.showTrends = true;
      options.compactMode = data.length > 6;
      options.colorScheme = 'business';
      break;
  }
  
  return options;
}

export default router;
