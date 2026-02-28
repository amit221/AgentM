/**
 * Helper utilities for chart functionality
 */

// Chart analysis is now handled by the AI backend
import { formatFieldName } from './formatters';

/**
 * Determines if the chart view should be shown for given data
 */
export function shouldShowChartView(processedData) {
  if (!processedData?.documents || processedData.isEmpty) {
    return false;
  }
  
  // Basic validation - AI backend should handle detailed chart suitability analysis
  return Array.isArray(processedData.documents) && processedData.documents.length > 0;
}

/**
 * Gets the best chart type suggestion for the data
 */
export function getBestChartType(processedData) {
  if (!shouldShowChartView(processedData)) {
    return null;
  }
  
  // AI backend should provide chart type suggestions
  // For now, return a basic default
  return 'bar';
}

/**
 * Analyzes MongoDB query to determine if it's likely to produce chart-suitable data
 */
export function isQueryChartFriendly(query) {
  if (!query || typeof query !== 'string') return false;
  
  const queryLower = query.toLowerCase();
  
  // Look for aggregation patterns that typically produce chart-friendly data
  const chartFriendlyPatterns = [
    /\$group/,           // Group by operations
    /\$sum/,             // Sum aggregations
    /\$count/,           // Count operations
    /\$avg/,             // Average calculations
    /\$max/,             // Max values
    /\$min/,             // Min values
    /group.*by/i,        // Natural language group by
    /count.*by/i,        // Natural language count by
    /sum.*by/i,          // Natural language sum by
  ];
  
  return chartFriendlyPatterns.some(pattern => pattern.test(queryLower));
}

/**
 * Extracts meaningful field names from MongoDB aggregation results
 */
export function extractFieldInfo(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  
  const firstItem = data[0];
  if (!firstItem || typeof firstItem !== 'object') return [];
  
  return Object.keys(firstItem).map(key => {
    const value = firstItem[key];
    const type = typeof value;
    
    return {
      key,
      type,
      isNumeric: type === 'number' && !isNaN(value),
      isCategory: type === 'string' || key === '_id',
      isDate: type === 'string' && /^\d{4}-\d{2}/.test(value),
      sampleValue: value,
      displayName: formatFieldName(key)
    };
  });
}

/**
 * Generates chart configuration suggestions based on data analysis
 */
export function generateChartConfig(data, chartType) {
  const fieldInfo = extractFieldInfo(data);
  const numericFields = fieldInfo.filter(f => f.isNumeric);
  const categoryFields = fieldInfo.filter(f => f.isCategory);
  
  const config = {
    title: generateChartTitle(data, chartType),
    subtitle: `${data.length} records`,
    xAxis: categoryFields[0]?.key || fieldInfo[0]?.key,
    yAxis: numericFields[0]?.key || fieldInfo.find(f => f.isNumeric)?.key,
    colorScheme: getColorScheme(chartType),
    animation: true,
    responsive: true
  };
  
  return config;
}

/**
 * Generates appropriate chart titles based on data content
 */
function generateChartTitle(data, chartType) {
  const fieldInfo = extractFieldInfo(data);
  const categoryField = fieldInfo.find(f => f.isCategory);
  const numericField = fieldInfo.find(f => f.isNumeric);
  
  if (categoryField && numericField) {
    const categoryName = formatFieldName(categoryField.key);
    const metricName = formatFieldName(numericField.key);
    
    switch (chartType) {
      case 'pie':
        return `${metricName} Distribution by ${categoryName}`;
      case 'line':
        return `${metricName} Trend by ${categoryName}`;
      default:
        return `${metricName} by ${categoryName}`;
    }
  }
  
  return 'Data Visualization';
}

/**
 * Returns appropriate color schemes for different chart types
 */
function getColorScheme(chartType) {
  const schemes = {
    bar: ['#1976d2', '#42a5f5', '#90caf9'],
    line: ['#1976d2', '#1565c0', '#0d47a1'],
    pie: ['#1976d2', '#42a5f5', '#90caf9', '#e3f2fd', '#bbdefb']
  };
  
  return schemes[chartType] || schemes.bar;
}
