import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useDatabase } from '../../context/DatabaseContext';
import QueryResultChartView from '../results/QueryResultChartView';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Paper
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { 
  WIDGET_TYPES, 
  WIDGET_STATUS,
  CHART_SUBTYPES,
  getWidgetTypeDisplayName,
  getRefreshIntervalDisplayName
} from '../../types/dashboardTypes';
import QueryResultTableView from '../results/QueryResultTableView';

/**
 * Determines if widget data dependencies have changed
 */
function shouldRefetchWidgetData(prevWidget, currentWidget) {
  // Only refetch if actual data-affecting properties have changed
  const dataAffectingProps = [
    'query', 'database', 'connectionId', 'connectionString', 
    'lastUpdated', 'refreshInterval'
  ];
  
  return dataAffectingProps.some(prop => {
    const prevValue = typeof prevWidget[prop] === 'object' 
      ? JSON.stringify(prevWidget[prop]) 
      : prevWidget[prop];
    const currentValue = typeof currentWidget[prop] === 'object' 
      ? JSON.stringify(currentWidget[prop]) 
      : currentWidget[prop];
    return prevValue !== currentValue;
  });
}

/**
 * Individual dashboard widget component - Memoized to prevent unnecessary re-renders
 */
const DashboardWidget = memo(({ widget, onRefresh, showTitle = true, showChartControls = false }) => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(WIDGET_STATUS.LOADING);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Get database connection info
  const { activeConnections, selectedDatabase, connections, connect } = useDatabase();

  // Memoize widget data-affecting properties to prevent unnecessary re-renders
  const stableWidgetData = useMemo(() => ({
    id: widget.id,
    query: widget.query,
    chartConfig: widget.chartConfig,
    chartType: widget.chartType,
    database: widget.database,
    connectionId: widget.connectionId,
    connectionString: widget.connectionString,
    connectionName: widget.connectionName,
    lastUpdated: widget.lastUpdated,
    refreshInterval: widget.refreshInterval,
    _mockData: widget._mockData
  }), [
    widget.id, widget.query, widget.chartConfig, widget.chartType, 
    widget.database, widget.connectionId, widget.connectionString, 
    widget.connectionName, widget.lastUpdated, widget.refreshInterval, 
    widget._mockData
  ]);

  // Memoize display properties separately (these don't affect data fetching)
  const stableDisplayProps = useMemo(() => ({
    title: widget.title,
    description: widget.description,
    type: widget.type
  }), [widget.title, widget.description, widget.type]);


  const loadWidgetData = useCallback(async () => {
    console.log('DashboardWidget: loadWidgetData called for widget:', stableWidgetData.id);
    console.log('DashboardWidget: Widget connection info:', {
      connectionId: stableWidgetData.connectionId,
      connectionString: stableWidgetData.connectionString,
      connectionName: stableWidgetData.connectionName,
      database: stableWidgetData.database
    });
    
    // Check if this is a preview widget with mock data
    if (stableWidgetData._mockData) {
      setData(stableWidgetData._mockData);
      setStatus(WIDGET_STATUS.SUCCESS);
      setLastUpdated(Date.now());
      return;
    }

    // Handle both old format (object with template) and new format (string)
    const queryToExecute = typeof stableWidgetData.query === 'string' 
      ? stableWidgetData.query 
      : (stableWidgetData.query?.originalQuery || stableWidgetData.query?.template);
    
    if (!queryToExecute) {
      setStatus(WIDGET_STATUS.ERROR);
      setError('Widget query is missing');
      return;
    }

    if (!stableWidgetData.database) {
      setStatus(WIDGET_STATUS.ERROR);
      setError('Widget database is missing');
      return;
    }

    setStatus(WIDGET_STATUS.LOADING);
    setError(null);

    try {
      let connectionIdToUse = null;

      // First, try to use the widget's bound connection if it's still active
      if (stableWidgetData.connectionId && activeConnections.includes(stableWidgetData.connectionId)) {
        connectionIdToUse = stableWidgetData.connectionId;
        console.log('DashboardWidget: Using widget\'s bound connection:', connectionIdToUse);
      } 
      // If widget's connection is not active, try to find a matching connection by connection string
      else if (stableWidgetData.connectionString) {
        const matchingConnectionId = activeConnections.find(connId => {
          const conn = connections[connId];
          return conn && conn.connectionString === stableWidgetData.connectionString;
        });
        
        if (matchingConnectionId) {
          connectionIdToUse = matchingConnectionId;
          console.log('DashboardWidget: Found matching connection by connection string:', connectionIdToUse);
        }
      }

      // FIXED: Widgets should NEVER create new connections
      // They should only use existing connections or show a connection message
      if (!connectionIdToUse) {
        const widgetConnectionName = stableWidgetData.connectionName || 'Unknown connection';
        
        if (activeConnections.length === 0) {
          // No connections at all - user needs to connect first
          throw new Error(`No database connections available. Please connect to a database to view this widget.`);
        } else {
          // Connections exist but widget's specific connection is not active
          throw new Error(`Widget requires connection "${widgetConnectionName}" which is not currently active. Please connect to "${widgetConnectionName}" to view this widget.`);
        }
      }

      // Execute the query using the widget's bound connection and database
      // Use a shared conversation ID for all dashboard widgets to prevent excessive shell creation
      const result = await window.electronAPI.database.executeRawQuery(
        `dashboard-${connectionIdToUse}`, // conversation ID per connection for dashboard widgets
        connectionIdToUse, // Use widget's bound connection
        stableWidgetData.database, // Use widget's bound database
        queryToExecute,
        `widget-${stableWidgetData.id}-${Date.now()}`, // operation ID
        30 // timeout in seconds
      );

      console.log('DashboardWidget: Query result:', result);

      if (!result?.success) {
        throw new Error(result?.error || 'Query execution failed');
      }

      // Transform the result to match the expected format
      const processedData = {
        documents: result.result || result.documents || [], // Try both result and documents
        totalCount: result.count || result.totalCount || (result.result?.length || result.documents?.length || 0),
        executionTime: result.executionTime || 0
      };
      
      console.log('DashboardWidget: Processed data:', processedData);
      
      setData(processedData);
      setStatus(WIDGET_STATUS.SUCCESS);
      setLastUpdated(Date.now());
      
    } catch (err) {
      console.error('Widget data loading failed:', err);
      console.error('Error stack:', err.stack);
      setStatus(WIDGET_STATUS.ERROR);
      setError(err.message);
    }
  }, [stableWidgetData, activeConnections, connections]);

  // Auto-refresh effect - only trigger when data-affecting properties change
  useEffect(() => {
    // Initial load
    loadWidgetData();

    // Set up auto-refresh if enabled
    if (stableWidgetData.refreshInterval && stableWidgetData.refreshInterval > 0) {
      const interval = setInterval(loadWidgetData, stableWidgetData.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [loadWidgetData, stableWidgetData.refreshInterval]);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    loadWidgetData();
    if (onRefresh) {
      onRefresh();
    }
  }, [loadWidgetData, onRefresh]);

  // Render widget content based on type and status
  const renderWidgetContent = () => {
    console.log('DashboardWidget: renderWidgetContent called');
    console.log('DashboardWidget: Current status:', status);
    console.log('DashboardWidget: Current data:', data);
    console.log('DashboardWidget: Current error:', error);
    
    if (status === WIDGET_STATUS.LOADING) {
      console.log('DashboardWidget: Rendering loading state');
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          flexDirection: 'column',
          gap: 1
        }}>
          <CircularProgress size={32} />
          <Typography variant="caption" color="text.secondary">
            Loading data...
          </Typography>
        </Box>
      );
    }

    if (status === WIDGET_STATUS.ERROR) {
      return (
        <Alert severity="error" sx={{ m: 1 }}>
          {error || 'Failed to load widget data'}
        </Alert>
      );
    }

    if (!data) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%'
        }}>
          <Typography variant="body2" color="text.secondary">
            No data available
          </Typography>
        </Box>
      );
    }

    // Render content based on widget type
    try {
      // Handle legacy widgets that might have chartType as type (migration fix)
      let actualWidgetType = stableDisplayProps.type;
      let actualChartType = stableWidgetData.chartType;
      
      // If widget.type is a chart subtype (like 'bar', 'line', etc.), fix it
      if (Object.values(CHART_SUBTYPES).includes(stableDisplayProps.type)) {
        console.log('DashboardWidget: Migrating legacy widget structure');
        actualWidgetType = WIDGET_TYPES.CHART;
        actualChartType = stableDisplayProps.type;
      }
      
      console.log('DashboardWidget: Rendering widget type:', actualWidgetType);
      console.log('DashboardWidget: Widget chartType:', actualChartType);
      console.log('DashboardWidget: Widget chartConfig:', stableWidgetData.chartConfig);
      console.log('DashboardWidget: Data for rendering:', data);
      
      // Debug widget.query type
      console.log('DashboardWidget: widget.query type:', typeof stableWidgetData.query);
      console.log('DashboardWidget: widget.query value:', stableWidgetData.query);
      
      // Use stored queryContext or create one for the widget using widget's bound database
      const queryContext = widget.queryContext || {
        database: stableWidgetData.database, // Always use widget's bound database
        collection: widget.collection,
        operation: widget.operation,
        executionTime: widget.executionTime,
        recordCount: data?.documents?.length,
        hasMoreData: false, // Widgets show complete data
        queryType: (typeof stableWidgetData.query === 'string' && stableWidgetData.query.includes('aggregate')) ? 'aggregation' : 
                  (typeof stableWidgetData.query === 'string' && stableWidgetData.query.includes('find')) ? 'find' : 'unknown',
        sampleFields: data?.documents?.[0] ? Object.keys(data.documents[0]) : []
      };
      
      switch (actualWidgetType) {
        case WIDGET_TYPES.CHART:
        case WIDGET_TYPES.SUMMARY:
          console.log('DashboardWidget: Rendering chart/summary widget using QueryResultChartView');
          console.log('DashboardWidget: Widget query:', stableWidgetData.query);
          console.log('DashboardWidget: QueryContext:', queryContext);
          console.log('DashboardWidget: Chart analysis available:', !!stableWidgetData.chartConfig?.chartAnalysis);
          
          // Validate that widget has required pre-stored chart analysis
          if (!stableWidgetData.chartConfig?.chartAnalysis) {
            console.error('❌ WIDGET ERROR: Missing required pre-stored chart analysis!');
            return (
              <Alert severity="error" sx={{ m: 1 }}>
                Widget configuration error: Missing pre-stored chart analysis. 
                Widgets must have chart analysis from when they were created.
              </Alert>
            );
          }
          
          // Use the same QueryResultChartView as the main query results
          // This ensures widgets display exactly the same as query results
          const queryForChart = typeof stableWidgetData.query === 'string' 
            ? stableWidgetData.query 
            : (stableWidgetData.query?.originalQuery || stableWidgetData.query?.template);
          
          return (
            <QueryResultChartView
              processedData={data}
              currentPageItems={data.documents}
              query={queryForChart}
              queryContext={queryContext}
              hideAddToDashboard={true}
              preStoredChartAnalysis={stableWidgetData.chartConfig.chartAnalysis}
              hidePaperWrapper={true}
              hideChartTypeSelector={!showChartControls}
              compactMode={true}
            />
          );

      case WIDGET_TYPES.TABLE:
        // Process data to match QueryResultTableView's expected format
        const processedTableData = (() => {
          if (!data?.documents || !Array.isArray(data.documents)) {
            return { documents: [], keys: [], isEmpty: true, formattedData: new Map() };
          }
          
          const allKeys = new Set();
          const formattedData = new Map();
          
          data.documents.forEach((doc, docIndex) => {
            if (doc && typeof doc === 'object') {
              Object.keys(doc).forEach((key) => allKeys.add(key));
              const formattedDoc = {};
              Object.entries(doc).forEach(([key, value]) => {
                if (value != null && typeof value === 'object') {
                  formattedDoc[key] = JSON.stringify(value, null, 2);
                } else {
                  formattedDoc[key] = value != null ? String(value) : '';
                }
              });
              formattedData.set(docIndex, formattedDoc);
            }
          });
          
          return {
            documents: data.documents,
            keys: Array.from(allKeys),
            isEmpty: data.documents.length === 0,
            formattedData,
          };
        })();
        
        const currentPageItems = processedTableData.documents.map((doc, idx) => ({ 
          doc, 
          originalIndex: idx 
        }));
        
        return (
          <QueryResultTableView
            processedData={processedTableData}
            currentPageItems={currentPageItems}
            isMobile={false}
          />
        );

      default:
        console.error('Unknown widget type error:', {
          'widget.type': stableDisplayProps.type,
          'actualWidgetType': actualWidgetType,
          'widget.chartType': stableWidgetData.chartType,
          'actualChartType': actualChartType,
          'WIDGET_TYPES': WIDGET_TYPES
        });
        return (
          <Typography variant="body2" color="text.secondary">
            Unknown widget type: {actualWidgetType} (original: {stableDisplayProps.type})
          </Typography>
        );
      }
    } catch (renderError) {
      console.error('Widget rendering error:', renderError);
      return (
        <Alert severity="error">
          Failed to render widget: {renderError.message}
        </Alert>
      );
    }
  };

  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) { // Less than 1 day
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      return new Date(timestamp).toLocaleDateString();
    }
  };

  console.log('DashboardWidget: Main component render');
  console.log('DashboardWidget: Widget prop:', widget);

  return (
    <Paper
      elevation={1}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Widget Header */}
      {showTitle && (
        <Box sx={{ 
          p: 2, 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Box sx={{ flex: 1 }}>
            {stableDisplayProps.description && (
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {stableDisplayProps.description}
              </Typography>
            )}
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Status indicator */}
            {status === WIDGET_STATUS.LOADING && (
              <Chip
                icon={<ScheduleIcon />}
                label="Loading"
                size="small"
                color="info"
                variant="outlined"
              />
            )}
            
            {status === WIDGET_STATUS.ERROR && (
              <Chip
                icon={<ErrorIcon />}
                label="Error"
                size="small"
                color="error"
                variant="outlined"
              />
            )}
          </Box>
        </Box>
      )}

      {/* Widget Content */}
      <Box 
        className="widget-content"
        sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: 0.25,
          // Ensure scrollbars are properly sized
          '&::-webkit-scrollbar': {
            width: '12px',
            height: '12px'
          }
        }}
      >
        {renderWidgetContent()}
      </Box>

    </Paper>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if meaningful props have changed
  
  // Always re-render if showTitle or showChartControls change
  if (prevProps.showTitle !== nextProps.showTitle || 
      prevProps.showChartControls !== nextProps.showChartControls) {
    return false;
  }
  
  // Check if data-affecting widget properties have changed
  const dataAffectingProps = [
    'id', 'query', 'database', 'connectionId', 'connectionString', 
    'lastUpdated', 'refreshInterval', '_mockData'
  ];
  
  const hasDataChanges = dataAffectingProps.some(prop => {
    const prevValue = typeof prevProps.widget[prop] === 'object' 
      ? JSON.stringify(prevProps.widget[prop]) 
      : prevProps.widget[prop];
    const nextValue = typeof nextProps.widget[prop] === 'object' 
      ? JSON.stringify(nextProps.widget[prop]) 
      : nextProps.widget[prop];
    return prevValue !== nextValue;
  });
  
  // Check if display properties have changed
  const displayProps = ['title', 'description', 'type', 'chartType', 'chartConfig'];
  const hasDisplayChanges = displayProps.some(prop => {
    const prevValue = typeof prevProps.widget[prop] === 'object' 
      ? JSON.stringify(prevProps.widget[prop]) 
      : prevProps.widget[prop];
    const nextValue = typeof nextProps.widget[prop] === 'object' 
      ? JSON.stringify(nextProps.widget[prop]) 
      : nextProps.widget[prop];
    return prevValue !== nextValue;
  });
  
  // Only re-render if there are meaningful changes
  return !hasDataChanges && !hasDisplayChanges;
});

export default DashboardWidget;