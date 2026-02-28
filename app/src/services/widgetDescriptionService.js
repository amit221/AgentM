/**
 * Widget Description Service
 * Handles AI-powered generation of widget descriptions
 */

import httpClient from '../utils/httpClient';

/**
 * Generate an AI-powered description for a dashboard widget
 * @param {Object} params - Widget parameters
 * @param {string} params.widgetTitle - The widget title
 * @param {string} [params.chartType] - The chart type (e.g., 'bar', 'line', 'pie')
 * @param {string} [params.collectionName] - The MongoDB collection name
 * @param {string} [params.databaseName] - The MongoDB database name
 * @param {string} [params.query] - The MongoDB query
 * @returns {Promise<{success: boolean, description?: string, error?: string}>}
 */
export async function generateWidgetDescription({ 
  widgetTitle, 
  chartType, 
  collectionName, 
  databaseName, 
  query 
}) {
  try {
    // Validate required parameters
    if (!widgetTitle || typeof widgetTitle !== 'string' || widgetTitle.trim().length === 0) {
      return {
        success: false,
        error: 'Widget title is required'
      };
    }

    const response = await httpClient.agentRequest('/widget-description', {
      method: 'POST',
      body: {
        widgetTitle: widgetTitle.trim(),
        chartType,
        collectionName,
        databaseName,
        query
      }
    });

    const data = await response.json();

    if (data.success && data.description) {
      return {
        success: true,
        description: data.description
      };
    }

    return {
      success: false,
      error: data.error || 'Failed to generate description'
    };
  } catch (error) {
    console.error('Failed to generate widget description:', error);
    return {
      success: false,
      error: error.message || 'Network error occurred'
    };
  }
}

