import React, { useMemo, useState, useEffect, memo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  ButtonGroup,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
} from '@mui/x-charts';
import {
  BarChart as BarIcon,
  ShowChart as LineIcon,
  PieChart as PieIcon,
  Assessment as SummaryIcon,
  StackedBarChart as MultiBarIcon,
  MultilineChart as MultiLineIcon,
  AreaChart as AreaIcon,
  ScatterPlot as ScatterIcon,
  DonutSmall as DonutIcon,
  Map as MapIcon,
} from '@mui/icons-material';
// Chart analysis and data transformation is now handled by the AI backend
import SummaryCardsView from './SummaryCardsView';
import { getChartAnalysis } from '../../services/chartAnalysisService';
import AddToDashboardButton from './AddToDashboardButton';
import chartAnalysisCache from '../../services/chartAnalysisCache';
import { useQuery } from '../../context/QueryContext';
import { CHART_SUBTYPES } from '../../types/dashboardTypes';
import MapChart from '../charts/MapChart';

const CHART_TYPES = [
  { id: CHART_SUBTYPES.SUMMARY, label: 'Summary', icon: <SummaryIcon />, component: null },
  { id: CHART_SUBTYPES.BAR, label: 'Bar Chart', icon: <BarIcon />, component: BarChart },
  { id: CHART_SUBTYPES.MULTI_BAR, label: 'Multi-Bar', icon: <MultiBarIcon />, component: BarChart },
  { id: CHART_SUBTYPES.LINE, label: 'Line Chart', icon: <LineIcon />, component: LineChart },
  { id: CHART_SUBTYPES.MULTI_LINE, label: 'Multi-Line', icon: <MultiLineIcon />, component: LineChart },
  { id: CHART_SUBTYPES.AREA, label: 'Area Chart', icon: <AreaIcon />, component: LineChart },
  { id: CHART_SUBTYPES.STACKED_AREA, label: 'Stacked Area', icon: <AreaIcon />, component: LineChart },
  { id: CHART_SUBTYPES.PIE, label: 'Pie Chart', icon: <PieIcon />, component: PieChart },
  { id: CHART_SUBTYPES.DONUT, label: 'Donut Chart', icon: <DonutIcon />, component: PieChart },
  { id: CHART_SUBTYPES.SCATTER, label: 'Scatter Plot', icon: <ScatterIcon />, component: ScatterChart },
  { id: CHART_SUBTYPES.MAP, label: 'Map', icon: <MapIcon />, component: MapChart },
];

// Helper functions following cursor rules for conditional logic encapsulation

/**
 * Determines if data is available for analysis
 */
function hasValidData(processedData) {
  return Boolean(processedData?.documents && !processedData.isEmpty);
}

/**
 * Computes summary metrics from raw data for summary cards
 */
function computeSummaryMetrics(data) {
  if (!hasValidDataStructure(data)) {
    return [];
  }

  const firstItem = data[0];
  const numericFields = Object.keys(firstItem).filter(key => {
    const value = firstItem[key];
    return typeof value === 'number' && !isNaN(value);
  });

  const metrics = [];

  numericFields.forEach(field => {
    const values = data.map(item => item[field] || 0);
    const total = values.reduce((sum, val) => sum + val, 0);
    const average = total / values.length;

    // Create human-readable label
    const label = field.replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/total/i, 'Total')
      .replace(/count/i, 'Count')
      .replace(/sum/i, 'Sum')
      .replace(/avg/i, 'Average');

    // Determine format based on field name
    let format = 'number';
    if (field.toLowerCase().includes('price') || field.toLowerCase().includes('cost') || 
        field.toLowerCase().includes('revenue') || field.toLowerCase().includes('sales')) {
      format = 'currency';
    } else if (field.toLowerCase().includes('percent') || field.toLowerCase().includes('rate')) {
      format = 'percentage';
    }

    metrics.push({
      field,
      label,
      total,
      average: Math.round(average * 100) / 100,
      type: 'total',
      format,
      value: total // For compatibility with SummaryCardsView
    });
  });

  return metrics;
}

/**
 * Determines if AI analysis should be used
 */
function shouldUseAIAnalysis(processedData) {
  if (!hasValidData(processedData)) return false;
  
  const data = processedData.documents;
  const hasMinimumRecords = Array.isArray(data) && data.length >= 2;
  const hasReasonableSize = Array.isArray(data) && data.length <= 1000;
  
  return hasMinimumRecords && hasReasonableSize;
}

/**
 * Creates error analysis result
 */
function createErrorAnalysis(message) {
  return { 
    suitable: false, 
    suggestions: [], 
    error: message,
    confidence: 0,
    isAIEnhanced: false
  };
}

/**
 * Creates fallback analysis when AI is unavailable
 */
function createFallbackAnalysis(data) {
  // Basic data validation - AI backend should handle detailed analysis
  if (!Array.isArray(data) || data.length === 0) {
    return createErrorAnalysis('Data is not suitable for charting. Charts work best with aggregated numeric data.');
  }

  // Conservative fallback - only suggest basic chart types
  const suggestions = [{
    type: 'bar',
    confidence: 0.5,
    reason: 'Basic chart recommendation (AI analysis unavailable)',
    multiSeries: false
  }];
  
  return { 
    suitable: true, 
    suggestions, 
    error: 'AI analysis failed - using basic chart detection',
    confidence: 0.5,
    isAIEnhanced: false
  };
}

/**
 * Validates that data array has valid structure for chart processing
 */
function hasValidDataStructure(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }
  
  const firstItem = data[0];
  return firstItem !== null && firstItem !== undefined && typeof firstItem === 'object';
}

/**
 * Safely extracts field names from data structure
 */
function extractFieldNames(data) {
  if (!hasValidDataStructure(data)) {
    return [];
  }
  
  const firstItem = data[0];
  return Object.keys(firstItem);
}

/**
 * Prepares data for line charts by sorting chronologically and aggregating
 */
function prepareLineChartData(data, xField, yFields) {
  if (!Array.isArray(data) || data.length === 0) {
    return data;
  }
  
  // Check if X field contains dates
  const firstValue = data[0][xField];
  const isDateField = typeof firstValue === 'string' && (
    firstValue.includes('-') || 
    firstValue.includes('T') || 
    firstValue.includes('/') ||
    /^\d{4}-\d{2}-\d{2}/.test(firstValue) ||
    /^\d{2}\/\d{2}\/\d{4}/.test(firstValue)
  );
  
  if (!isDateField) {
    // For non-date fields, just sort by the field value
    return [...data].sort((a, b) => {
      const aVal = a[xField];
      const bVal = b[xField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal);
      }
      return (aVal || 0) - (bVal || 0);
    });
  }
  
  // For date fields, sort chronologically and aggregate
  const sortedData = [...data].sort((a, b) => {
    const dateA = new Date(a[xField]);
    const dateB = new Date(b[xField]);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Group by date and aggregate Y values
  const groupedData = new Map();
  
  sortedData.forEach(item => {
    const xValue = item[xField];
    const dateKey = new Date(xValue).toISOString().split('T')[0]; // Group by date only
    
    if (!groupedData.has(dateKey)) {
      groupedData.set(dateKey, {
        [xField]: xValue,
        _count: 0,
        ...yFields.reduce((acc, field) => ({ ...acc, [field]: 0 }), {})
      });
    }
    
    const group = groupedData.get(dateKey);
    group._count += 1;
    
    yFields.forEach(field => {
      group[field] += (item[field] || 0);
    });
  });
  
  // Convert back to array and calculate averages
  return Array.from(groupedData.values()).map(group => {
    const result = { ...group };
    yFields.forEach(field => {
      result[field] = group._count > 0 ? group[field] / group._count : 0;
    });
    delete result._count;
    return result;
  });
}

const QueryResultChartView = memo(({ processedData, currentPageItems, query, queryContext, hideAddToDashboard = false, preStoredChartAnalysis = null, hidePaperWrapper = false, hideChartTypeSelector = false, compactMode = false }) => {
  // Generate unique ID for this component instance
  const componentId = React.useRef(Math.random().toString(36).substr(2, 9));
  
  // Get conversation context for AI analysis
  const { activeConversation } = useQuery();
  
  // Extract last 5 messages for conversation context (using same format as decide API)
  const conversationContext = React.useMemo(() => {
    if (!activeConversation?.uiState?.chatMessages) return null;
    
    const messages = activeConversation.uiState.chatMessages;
    const lastMessages = messages
      .filter(msg => {
        // Include user messages
        if (msg.isUser) return true;
        
        // Include assistant responses but exclude error fix related messages
        if (!msg.isUser && msg.content && !msg.isQuery && !msg.isResult) {
          // Exclude optimization suggestions and error fix messages
          if (msg.content.includes("❌ I couldn't fix this error automatically")) return false;
          if (msg.content.includes("🤖 Sending error to AI")) return false;
          if (msg.content.includes("✅ I found a potential fix")) return false;
          return true;
        }
        
        // Include queries as context
        if (msg.isQuery && msg.queryData) return true;
        
        return false;
      })
      .slice(-30) // Keep last 30 messages for chart analysis
      .map(msg => {
        if (msg.isUser) {
          return { role: 'user', content: msg.content };
        } else if (msg.isQuery && msg.queryData) {
          return { role: 'assistant', content: `I generated this query: ${msg.queryData}` };
        } else {
          return { role: 'assistant', content: msg.content };
        }
      });
    
    return lastMessages.length > 0 ? lastMessages : null;
  }, [activeConversation?.uiState?.chatMessages]);
  
  console.log(`🚀 QueryResultChartView [${componentId.current}]: Component rendered`);
  console.log(`🚀 Props received [${componentId.current}]:`, { 
    processedDataLength: processedData?.documents?.length,
    currentPageItemsLength: currentPageItems?.length,
    query: query?.substring(0, 100) + '...',
    queryContext
  });
  
  const [selectedChartType, setSelectedChartType] = useState(null);
  const [customFields, setCustomFields] = useState({ xField: '', yFields: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [chartAnalysis, setChartAnalysis] = useState(null);

  // AI-enhanced data analysis with persistent caching
  useEffect(() => {
    async function analyzeData() {
      console.log(`🤖 QueryResultChartView [${componentId.current}]: Starting analysis`);
      console.log(`🤖 processedData [${componentId.current}]:`, processedData);
      console.log(`🤖 preStoredChartAnalysis [${componentId.current}]:`, preStoredChartAnalysis);
      
      // If we have pre-stored chart analysis (from widgets), use it directly
      if (preStoredChartAnalysis) {
        console.log(`🤖 Using pre-stored chart analysis [${componentId.current}] - NO AI REQUEST`);
        setChartAnalysis(preStoredChartAnalysis);
        return;
      }
      
      // If hideAddToDashboard is true, this is likely a widget context
      // Widgets should NEVER make AI requests - they must have pre-stored analysis
      if (hideAddToDashboard) {
        console.error(`❌ WIDGET ERROR [${componentId.current}]: Widget missing pre-stored chart analysis!`);
        setChartAnalysis(createErrorAnalysis('Widget configuration error: Missing pre-stored chart analysis'));
        return;
      }
      
      console.log(`🤖 No pre-stored analysis, proceeding with AI analysis [${componentId.current}]`);
      
      if (!hasValidData(processedData)) {
        console.log('🤖 No valid data - setting error analysis');
        setChartAnalysis(createErrorAnalysis('No data available'));
        return;
      }

      if (!shouldUseAIAnalysis(processedData)) {
        console.log('🤖 Skipping AI analysis - using fallback');
        setChartAnalysis(createErrorAnalysis('Data size not suitable for charting (need 2-1000 records)'));
        return;
      }

      // Check cache first
      const cachedResult = chartAnalysisCache.get(processedData, query, queryContext, conversationContext);
      if (cachedResult) {
        console.log(`🤖 Using cached analysis [${componentId.current}]`);
        setChartAnalysis(cachedResult);
        return;
      }

      // Check if request is already pending
      const pendingRequest = chartAnalysisCache.getPending(processedData, query, queryContext, conversationContext);
      if (pendingRequest) {
        console.log(`🤖 Waiting for pending request [${componentId.current}]`);
        setIsLoading(true);
        try {
          const result = await pendingRequest;
          setChartAnalysis(result);
        } catch (error) {
          console.warn('Pending request failed:', error);
          const fallbackResult = createFallbackAnalysis(processedData.documents);
          setChartAnalysis(fallbackResult);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // Make new AI request
      setIsLoading(true);
      
      const requestPromise = (async () => {
        try {
          console.log(`🤖 Sending to AI [${componentId.current}]:`, { 
            processedData: processedData.documents?.length + ' documents',
            query: query?.substring(0, 100) + '...',
            queryContext 
          });
          
          const aiAnalysis = await getChartAnalysis(processedData, query, queryContext, conversationContext);
          
          console.log(`🤖 AI Analysis result [${componentId.current}]:`, aiAnalysis);
          
          const result = {
            ...aiAnalysis,
            isAIEnhanced: true
          };
          
          // Cache the result
          chartAnalysisCache.set(processedData, query, queryContext, result, conversationContext);
          
          return result;
        } catch (error) {
          console.warn('AI analysis failed, falling back to local analysis:', error);
          
          const fallbackResult = createFallbackAnalysis(processedData.documents);
          
          // Cache the fallback result too
          chartAnalysisCache.set(processedData, query, queryContext, fallbackResult, conversationContext);
          
          return fallbackResult;
        }
      })();

      // Mark request as pending
      chartAnalysisCache.setPending(processedData, query, queryContext, requestPromise, conversationContext);

      try {
        const result = await requestPromise;
        setChartAnalysis(result);
      } finally {
        setIsLoading(false);
      }
    }

    analyzeData();
  }, [processedData?.documents?.length, query, queryContext?.database, queryContext?.collection, preStoredChartAnalysis]);

  // Set default chart type and field mappings based on AI suggestions
  React.useEffect(() => {
    if (chartAnalysis?.suitable && chartAnalysis.suggestions.length > 0 && !selectedChartType) {
      // Use AI's marked best fit chart, fallback to first suggestion
      const bestSuggestion = chartAnalysis.suggestions.find(s => s.isBestFit) || chartAnalysis.suggestions[0];
      setSelectedChartType(bestSuggestion.type);
      
      // Use AI-recommended field mappings if available
      if (bestSuggestion.recommendedFields) {
        setCustomFields({
          xField: bestSuggestion.recommendedFields.xField || '',
          yFields: bestSuggestion.series || [bestSuggestion.recommendedFields.yField || '']
        });
      }
    }
  }, [chartAnalysis, selectedChartType]);

  // Use AI backend analysis to create chart data
  const chartData = useMemo(() => {
    console.log('🔍 QueryResultChartView: chartData useMemo called');
    console.log('🔍 chartAnalysis?.suitable:', chartAnalysis?.suitable);
    console.log('🔍 selectedChartType:', selectedChartType);
    console.log('🔍 processedData?.documents length:', processedData?.documents?.length);
    console.log('🔍 customFields:', customFields);
    console.log('🔍 chartAnalysis:', chartAnalysis);
    
    if (!chartAnalysis?.suitable || !selectedChartType || !processedData?.documents) {
      console.log('🔍 Returning null - missing required data');
      return null;
    }

    // Find the selected chart suggestion from AI analysis
    const selectedSuggestion = chartAnalysis.suggestions?.find(s => s.type === selectedChartType);
    console.log('🔍 Selected suggestion:', selectedSuggestion);
    
    if (!selectedSuggestion) {
      console.log('🔍 No matching suggestion found for chart type:', selectedChartType);
      return null;
    }

    // For summary cards, compute metrics from the data since AI doesn't return them
    if (selectedChartType === CHART_SUBTYPES.SUMMARY) {
      console.log('🔍 Creating summary data - computing metrics from data');
      const data = processedData.documents;
      const metrics = computeSummaryMetrics(data);
      console.log('🔍 Computed metrics:', metrics);
      
      return {
        metrics,
        recordCount: data.length
      };
    }

    // For other chart types, create basic chart data structure
    // The AI backend provides the structure, we just need to format it for the chart library
    const data = processedData.documents;
    
    // Validate data structure before proceeding
    if (!hasValidDataStructure(data)) {
      console.log('🔍 Invalid data structure for chart rendering');
      return null;
    }
    
    const fields = extractFieldNames(data);
    
    // Use custom fields if provided, otherwise use AI recommendations or defaults
    const xField = customFields.xField || selectedSuggestion.recommendedFields?.xField || fields[0];
    const yFields = customFields.yFields.length > 0 ? customFields.yFields : 
                   (selectedSuggestion.series || [selectedSuggestion.recommendedFields?.yField || fields[1]]);
    
    console.log('🔍 Using fields:', { xField, yFields });
    
    // Helper function to get nested field values (handles dot notation like "timeline.fecha")
    const getNestedValue = (obj, fieldPath) => {
      if (!fieldPath || !obj) return null;
      
      // Handle simple fields
      if (!fieldPath.includes('.')) {
        return obj[fieldPath];
      }
      
      // Handle nested fields like "timeline.fecha"
      const [parentField, nestedField] = fieldPath.split('.');
      const parentValue = obj[parentField];
      
      // If parent is an array, get the first item's nested field
      if (Array.isArray(parentValue) && parentValue.length > 0) {
        return parentValue[0][nestedField];
      }
      
      // If parent is an object, get the nested field
      if (parentValue && typeof parentValue === 'object') {
        return parentValue[nestedField];
      }
      
      return null;
    };
    
    // Transform data for nested fields if needed
    const hasNestedFields = xField.includes('.') || yFields.some(yField => yField.includes('.'));
    const transformedData = hasNestedFields ? 
      data.map(item => {
        // For nested arrays like timeline, we might need to flatten
        if (xField.includes('.') && yFields.some(yField => yField.includes('.'))) {
          const [parentField] = xField.split('.');
          const parentValue = item[parentField];
          
          // If both fields are from the same nested array, flatten it
          if (Array.isArray(parentValue) && parentValue.length > 0) {
            // For timeline data, create multiple data points from the array
            return parentValue.map(nestedItem => {
              const transformedItem = { ...item, _originalId: item._id };
              transformedItem[xField] = nestedItem[xField.split('.')[1]];
              yFields.forEach(yField => {
                if (yField.includes('.')) {
                  transformedItem[yField] = nestedItem[yField.split('.')[1]];
                } else {
                  transformedItem[yField] = getNestedValue(item, yField);
                }
              });
              return transformedItem;
            });
          }
        }
        
        // For single nested fields, transform normally
        const transformedItem = { ...item };
        transformedItem[xField] = getNestedValue(item, xField);
        yFields.forEach(yField => {
          transformedItem[yField] = getNestedValue(item, yField);
        });
        return transformedItem;
      }).flat() : data; // Flatten if we created nested arrays
    
    console.log('🔍 Transformed data:', transformedData.slice(0, 3));
    
    // For line/area charts, we need to sort data chronologically and aggregate properly
    let chartReadyData = transformedData;
    if (selectedChartType === CHART_SUBTYPES.LINE || 
        selectedChartType === CHART_SUBTYPES.MULTI_LINE ||
        selectedChartType === CHART_SUBTYPES.AREA ||
        selectedChartType === CHART_SUBTYPES.STACKED_AREA) {
      chartReadyData = prepareLineChartData(transformedData, xField, yFields);
    }
    
    // Create chart data based on type
    if (selectedChartType === CHART_SUBTYPES.PIE || selectedChartType === CHART_SUBTYPES.DONUT) {
      // For pie/donut charts, use the first Y field
      const yField = yFields[0] || 'value';
      return {
        series: [{
          data: transformedData.map((item, index) => ({
            id: index,
            value: item[yField] || 0,
            label: String(item[xField] || `Item ${index}`)
          })),
          // Add innerRadius for donut charts
          ...(selectedChartType === CHART_SUBTYPES.DONUT && { innerRadius: '60%' })
        }]
      };
    } else if (selectedChartType === CHART_SUBTYPES.SCATTER) {
      // Scatter plot requires x,y coordinate pairs
      const yField = yFields[0] || 'value';
      return {
        series: [{
          data: transformedData.map((item, index) => ({
            id: index,
            x: item[xField] || 0,
            y: item[yField] || 0
          })),
          label: yField
        }],
        height: 400,
        margin: { left: 80, right: 40, top: 40, bottom: 100 }
      };
    } else if (selectedChartType === CHART_SUBTYPES.MAP) {
      // Map visualization - pass raw data to MapChart component
      return {
        type: 'map',
        data: chartReadyData
      };
    } else {
      // Bar/Line/Area charts with better formatting and scrolling
      const formatXAxisLabel = (value) => {
        if (!value) return '';
        
        // If it looks like a date/timestamp, show date + time
        if (typeof value === 'string' && (value.includes('-') || value.includes('T'))) {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              if (value.includes('T')) {
                // Full timestamp - show date and time
                return date.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                }) + ' ' + date.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: false 
                });
              } else {
                // Date only
                return date.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                });
              }
            }
          } catch (e) {
            // If date parsing fails, continue with string formatting
          }
        }
        
        // For other values, keep them readable
        const str = String(value);
        return str.length > 12 ? str.substring(0, 10) + '..' : str;
      };
      
      // Check if this is a multi-series chart (multi-bar, multi-line, stacked-area)
      const isMultiSeries = selectedSuggestion.multiSeries && yFields.length > 1;
      const isStackedArea = selectedChartType === CHART_SUBTYPES.STACKED_AREA;
      const isArea = selectedChartType === CHART_SUBTYPES.AREA || isStackedArea;
      
      if (isMultiSeries || isStackedArea) {
        console.log('🔍 Creating multi-series chart data');
        console.log('🔍 Series fields:', yFields);
        
        // Create multiple series for multi-bar/multi-line/stacked-area charts
        const series = yFields.map(seriesField => ({
          data: transformedData.map(item => item[seriesField] || 0),
          label: seriesField,
          // Add area and stack props for area charts
          ...(isArea && { area: true }),
          ...(isStackedArea && { stack: 'total' })
        }));
        
        return {
          xAxis: [{
            scaleType: 'band',
            data: chartReadyData.map(item => formatXAxisLabel(item[xField]))
          }],
          series: series.map(s => ({
            ...s,
            data: chartReadyData.map(item => item[s.label] || 0)
          })),
          // Better sizing and scrolling
          height: 400,
          margin: { left: 80, right: 40, top: 40, bottom: 100 }
        };
      } else {
        // Single series chart (regular bar, line, area)
        const yField = yFields[0] || 'value';
        return {
          xAxis: [{
            scaleType: 'band',
            data: chartReadyData.map(item => formatXAxisLabel(item[xField]))
          }],
          series: [{
            data: chartReadyData.map(item => item[yField] || 0),
            label: yField,
            // Add area prop for area charts
            ...(isArea && { area: true })
          }],
          // Better sizing and scrolling
          height: 400,
          margin: { left: 80, right: 40, top: 40, bottom: 100 }
        };
      }
    }
  }, [processedData, selectedChartType, customFields, chartAnalysis]);

  // Get available fields for custom field selection (including nested fields)
  const availableFields = useMemo(() => {
    if (!hasValidDataStructure(processedData?.documents)) return [];
    
    const firstItem = processedData.documents[0];
    const fields = [];
    
    // Add top-level fields
    Object.keys(firstItem).forEach(key => {
      const value = firstItem[key];
      
      if (typeof value === 'number') {
        fields.push({
          key,
          type: 'number',
          isNumeric: true,
          displayName: key
        });
      } else if (typeof value === 'string') {
        fields.push({
          key,
          type: 'string',
          isNumeric: false,
          displayName: key
        });
      } else if (key === '_id' && value && typeof value === 'object' && !Array.isArray(value)) {
        // Handle nested _id objects
        Object.keys(value).forEach(nKey => {
          const nValue = value[nKey];
          const nestedKey = `${key}.${nKey}`;
          fields.push({
            key: nestedKey,
            type: typeof nValue,
            isNumeric: typeof nValue === 'number',
            displayName: `${key}.${nKey}`
          });
        });
        // Also add the _id field itself
        fields.push({
          key,
          type: 'object',
          isNumeric: false,
          displayName: key
        });
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Handle other nested objects
        Object.keys(value).forEach(nKey => {
          const nValue = value[nKey];
          const nestedKey = `${key}.${nKey}`;
          fields.push({
            key: nestedKey,
            type: typeof nValue,
            isNumeric: typeof nValue === 'number',
            displayName: `${key}.${nKey}`
          });
        });
      } else {
        // Handle other types (arrays, null, etc.)
        fields.push({
          key,
          type: typeof value,
          isNumeric: false,
          displayName: key
        });
      }
    });
    
    return fields;
  }, [processedData]);

  // Show loading state
  if (isLoading || !chartAnalysis) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" sx={{ ml: 2, color: 'text.secondary' }}>
          Analyzing data with AI...
        </Typography>
      </Box>
    );
  }

  if (!chartAnalysis.suitable) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {chartAnalysis.error}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Charts work best with:
        </Typography>
        <Box component="ul" sx={{ textAlign: 'left', display: 'inline-block', mt: 1 }}>
          <li>Aggregated data (using $group, $sum, $count, etc.)</li>
          <li>2-1000 data points</li>
          <li>At least one numeric field</li>
          <li>Categorical identifiers (like product names, regions, etc.)</li>
        </Box>
      </Paper>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" sx={{ ml: 2, color: 'text.secondary' }}>
          Generating chart...
        </Typography>
      </Box>
    );
  }

  const renderChart = () => {
    console.log('🎨 QueryResultChartView: renderChart called');
    console.log('🎨 chartData:', chartData);
    console.log('🎨 selectedChartType:', selectedChartType);
    console.log('🎨 processedData?.documents?.length:', processedData?.documents?.length);
    
    if (!chartData) {
      console.log('🎨 Rendering AI backend placeholder message');
      return (
        <Alert severity="info">
          Chart rendering will be handled by the AI backend. 
          <br />
          Chart type: {selectedChartType}
          <br />
          Data records: {processedData?.documents?.length || 0}
        </Alert>
      );
    }

    // Handle summary cards separately
    if (selectedChartType === CHART_SUBTYPES.SUMMARY) {
      return <SummaryCardsView summaryData={chartData} hideHeader={hideChartTypeSelector} />;
    }

    // Handle map visualization separately
    if (selectedChartType === CHART_SUBTYPES.MAP) {
      return <MapChart data={chartData.data} height={compactMode ? 250 : 400} />;
    }

    const ChartComponent = CHART_TYPES.find(type => type.id === selectedChartType)?.component;
    if (!ChartComponent) return null;

    // Use chart data props for sizing and margins
    const chartHeight = chartData.height || (compactMode ? 250 : 400);
    const chartMargin = chartData.margin || (compactMode ? 
      { left: 60, right: 30, top: 20, bottom: 60 } : 
      { left: 80, right: 40, top: 40, bottom: 100 });

    // Handle pie/donut charts
    if (selectedChartType === CHART_SUBTYPES.PIE || selectedChartType === CHART_SUBTYPES.DONUT) {
      return (
        <ChartComponent
          height={compactMode ? 250 : 400}
          margin={compactMode ? 
            { left: 40, right: 40, top: 20, bottom: 20 } : 
            { left: 60, right: 60, top: 60, bottom: 60 }}
          series={chartData.series}
          slotProps={{
            legend: {
              direction: 'row',
              position: { vertical: 'bottom', horizontal: 'center' },
              padding: 0,
            },
          }}
        />
      );
    }

    // Handle scatter plots
    if (selectedChartType === CHART_SUBTYPES.SCATTER) {
      return (
        <ChartComponent
          height={chartHeight}
          margin={chartMargin}
          series={chartData.series}
          grid={{ vertical: true, horizontal: true }}
        />
      );
    }

    // Handle all other charts (bar, line, area, multi-series)
    return (
      <ChartComponent
        height={chartHeight}
        margin={chartMargin}
        dataset={chartData.dataset}
        xAxis={chartData.xAxis}
        series={chartData.series}
        grid={{ vertical: true, horizontal: true }}
      />
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: hideChartTypeSelector ? 0 : (hidePaperWrapper ? 1 : 2) }}>
      {/* Chart Type Selector */}
      {!hideChartTypeSelector && (
        <Box sx={{ flexShrink: 0, pb: hidePaperWrapper ? 1 : 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <ButtonGroup size="small" variant="outlined" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {CHART_TYPES.map((type) => {
                  const suggestion = chartAnalysis.suggestions.find(s => s.type === type.id);
                  const isAvailable = suggestion !== undefined;
                  const isRecommended = suggestion && suggestion.confidence > 0.7;
                  const isBestFit = suggestion && suggestion.isBestFit === true;
                  
                  // Only show chart types that are suggested for this data
                  if (!isAvailable) return null;
                  
                  return (
                    <Button
                      key={type.id}
                      onClick={() => {
                        setSelectedChartType(type.id);
                        // Update field mappings when switching chart types
                        if (suggestion?.recommendedFields) {
                          setCustomFields({
                            xField: suggestion.recommendedFields.xField || '',
                            yFields: suggestion.series || [suggestion.recommendedFields.yField || '']
                          });
                        }
                      }}
                      variant={selectedChartType === type.id ? 'contained' : 'outlined'}
                      startIcon={type.icon}
                      sx={{
                        ...(isBestFit && selectedChartType !== type.id && {
                          borderColor: 'primary.main',
                          borderWidth: 2,
                          color: 'primary.main',
                          '&:hover': {
                            borderColor: 'primary.dark',
                            bgcolor: 'primary.light',
                          }
                        }),
                        ...(isRecommended && !isBestFit && selectedChartType !== type.id && {
                          borderColor: 'success.main',
                          color: 'success.main',
                          '&:hover': {
                            borderColor: 'success.dark',
                            bgcolor: 'success.light',
                          }
                        })
                      }}
                    >
                      {type.label}
                      {isBestFit && (
                        <Box component="span" sx={{ ml: 0.5, fontSize: '0.7rem', opacity: 0.8 }}>
                          ⭐
                        </Box>
                      )}
                    </Button>
                  );
                })}
              </ButtonGroup>
            </Box>

            {/* Field Selection for Advanced Users */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>X-Axis Field</InputLabel>
                <Select
                  value={customFields.xField}
                  label="X-Axis Field"
                  onChange={(e) => setCustomFields(prev => ({ ...prev, xField: e.target.value }))}
                >
                  {availableFields.map(field => (
                    <MenuItem key={field.key} value={field.key}>
                      {field.displayName} ({field.type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Y-Axis Fields</InputLabel>
                <Select
                  multiple
                  value={customFields.yFields}
                  label="Y-Axis Fields"
                  onChange={(e) => setCustomFields(prev => ({ 
                    ...prev, 
                    yFields: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value 
                  }))}
                  renderValue={(selected) => {
                    if (selected.length === 0) return 'Select fields';
                    if (selected.length === 1) return selected[0];
                    if (selected.length <= 3) return selected.join(', ');
                    return `${selected.length} fields selected`;
                  }}
                >
                  {availableFields.filter(field => field.isNumeric).map(field => (
                    <MenuItem key={field.key} value={field.key}>
                      {field.displayName} ({field.type})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* Add to Dashboard Icon Button */}
              {!hideAddToDashboard && selectedChartType && chartData && !isLoading && query && (
                <AddToDashboardButton
                  query={query}
                  queryResult={processedData}
                  queryContext={queryContext}
                  chartConfig={{
                    chartType: selectedChartType,
                    xField: customFields.xField || chartAnalysis?.suggestions?.find(s => s.type === selectedChartType)?.recommendedFields?.xField || '',
                    yFields: customFields.yFields.length > 0 ? customFields.yFields : 
                             (chartAnalysis?.suggestions?.find(s => s.type === selectedChartType)?.series || 
                              [chartAnalysis?.suggestions?.find(s => s.type === selectedChartType)?.recommendedFields?.yField || '']),
                    chartAnalysis: chartAnalysis
                  }}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* Chart Display */}
      {hidePaperWrapper ? (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          overflow: 'auto',
          flex: 1,
          '& > div': {
            width: '100%',
            minWidth: '400px' // Reasonable min-width for dashboard widgets
          }
        }}>
          <Box sx={{ 
            width: '100%', 
            minWidth: '400px'
          }}>
            {renderChart()}
          </Box>
        </Box>
      ) : (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          overflow: 'auto',
          flex: 1,
          '& > div': {
            width: '100%',
            minWidth: '800px' // Ensure minimum width for scrolling
          }
        }}>
          <Box sx={{ 
            width: '100%', 
            minWidth: '800px' // Allow horizontal scrolling for many data points
          }}>
            {renderChart()}
          </Box>
        </Box>
      )}


    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if meaningful props have changed
  
  // Check if data has changed
  const dataChanged = prevProps.processedData !== nextProps.processedData ||
                     prevProps.currentPageItems !== nextProps.currentPageItems;
  
  // Check if query or context has changed
  const queryChanged = prevProps.query !== nextProps.query ||
                      prevProps.queryContext !== nextProps.queryContext;
  
  // Check if chart analysis has changed
  const analysisChanged = prevProps.preStoredChartAnalysis !== nextProps.preStoredChartAnalysis;
  
  // Check if display options have changed
  const displayChanged = prevProps.hideAddToDashboard !== nextProps.hideAddToDashboard ||
                         prevProps.hidePaperWrapper !== nextProps.hidePaperWrapper ||
                         prevProps.hideChartTypeSelector !== nextProps.hideChartTypeSelector ||
                         prevProps.compactMode !== nextProps.compactMode;
  
  // Only re-render if there are meaningful changes
  return !dataChanged && !queryChanged && !analysisChanged && !displayChanged;
});

export default QueryResultChartView;
