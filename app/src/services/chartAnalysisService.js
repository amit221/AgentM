/**
 * Simple chart analysis service - one function, one call, complete results
 */

import httpClient from '../utils/httpClient';
import { getEnvironment } from '../utils/env';

/**
 * Complete chart analysis - analyzes data and returns everything needed for charts
 */
export async function analyzeChart(queryResult, originalQuery = null, queryContext = null) {
  try {
    const { backendUrl } = getEnvironment();
    
    // Build simple request body
    const requestBody = { queryResult };
    if (originalQuery && typeof originalQuery === 'string') {
      requestBody.originalQuery = originalQuery;
    }
    if (queryContext && typeof queryContext === 'object') {
      requestBody.queryContext = queryContext;
    }
    
    // One simple call that does everything
    const response = await httpClient.request(`${backendUrl}/api/v1/chart/analyze`, {
      method: 'POST',
      body: requestBody
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Chart analysis failed');
    }

    return {
      success: true,
      suitable: result.suitable,
      suggestions: result.suggestions || [],
      confidence: result.confidence || 0,
      dataInsights: result.dataInsights || {},
      configurations: result.configurations || {},
      parameterization: result.parameterization || {
        isParameterizable: false,
        parameters: [],
        confidence: 0,
        reason: 'No parameterization data available'
      },
      reason: result.reason
    };

  } catch (error) {
    console.error('Chart analysis failed:', error);
    
    // Return fallback response instead of throwing
    return {
      success: false,
      suitable: false,
      suggestions: [],
      confidence: 0,
      dataInsights: {},
      configurations: {},
      error: error.message || 'Failed to analyze chart data'
    };
  }
}

/**
 * Enhanced chart analysis that combines local rules with AI analysis
 */
export async function getChartAnalysis(processedData, originalQuery = null, queryContext = null) {
  // Only check if we have at least 1 document - let AI decide everything else
  if (!processedData?.documents || processedData.isEmpty || !Array.isArray(processedData.documents) || processedData.documents.length === 0) {
    return {
      suitable: false,
      suggestions: [],
      confidence: 0,
      reason: 'No data available for charting'
    };
  }

  // Send only a sample of the data to reduce payload size
  const sampleSize = Math.min(5, processedData.documents.length);
  const sampleData = processedData.documents.slice(0, sampleSize);
  
  // Let AI analyze everything - no local validation
  const aiAnalysis = await analyzeChart(sampleData, originalQuery, queryContext);
  return aiAnalysis;
}
