import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Alert,
  CircularProgress,
  Tooltip,
  Paper
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  DragIndicator as DragIndicatorIcon,
  Tune as TuneIcon
} from '@mui/icons-material';
import { 
  getAllDashboards, 
  getDashboard, 
  updateDashboardLayout,
  getDashboardSettings,
  updateWidget,
  removeWidgetFromDashboard,
  saveDashboard
} from '../../services/dashboardStorageService';
import { 
  GRID_BREAKPOINTS, 
  GRID_COLUMNS, 
  WIDGET_STATUS 
} from '../../types/dashboardTypes';
import DashboardWidget from './DashboardWidget';
import DashboardSettingsDialog from './DashboardSettingsDialog';
import WidgetParameterPanel from './WidgetParameterPanel';
import DashboardQuickFilters from './DashboardQuickFilters';
import WidgetEditDialog from './WidgetEditDialog';


// Use ResponsiveGridLayout without WidthProvider to prevent auto-resizing
const ResponsiveGridLayout = Responsive;

/**
 * Main Dashboard component with responsive grid layout
 */
const Dashboard = ({ dashboardId, onDashboardChange }) => {
  const [dashboard, setDashboard] = useState(null);
  const [dashboardSettings, setDashboardSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [widgetMenuAnchor, setWidgetMenuAnchor] = useState(null);
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [parameterPresets, setParameterPresets] = useState({});
  const [showChartControls, setShowChartControls] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingWidget, setEditingWidget] = useState(null);

  // Memoize layout to prevent unnecessary recalculations
  const memoizedLayout = useMemo(() => {
    return dashboard?.layout || {};
  }, [dashboard?.layout]);


  // Load dashboard and settings
  useEffect(() => {
    loadDashboard();
    loadDashboardSettings();
  }, [dashboardId]);

  const loadDashboard = async () => {
    if (!dashboardId) {
      setError('No dashboard ID provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getDashboard(dashboardId);
      if (result.success) {
        setDashboard(result.dashboard);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardSettings = async () => {
    try {
      const result = await getDashboardSettings();
      if (result.success) {
        setDashboardSettings(result.settings);
      }
    } catch (err) {
      console.error('Failed to load dashboard settings:', err);
    }
  };

  // Handle layout changes (drag & drop, resize) - optimized to prevent widget re-renders
  const handleLayoutChange = useCallback(async (layout, layouts) => {
    if (!dashboard) return;

    try {
      const result = await updateDashboardLayout(dashboard.id, layouts);
      if (result.success) {
        // Only update the layout property to avoid triggering widget re-renders
        // Widgets don't need to re-render when only their position/size changes
        setDashboard(prevDashboard => ({
          ...prevDashboard,
          layout: result.dashboard.layout
        }));
      }
    } catch (err) {
      console.error('Failed to update layout:', err);
    }
  }, [dashboard]);

  // Handle individual widget refresh - only refreshes the specific widget
  const handleRefreshWidget = useCallback(async (widgetId) => {
    console.log('Refreshing individual widget:', widgetId);
    
    if (!dashboard || !dashboard.widgets[widgetId]) {
      console.error('Widget not found:', widgetId);
      return;
    }

    // Update the widget's lastUpdated timestamp to trigger a refresh
    // This will cause the DashboardWidget component to reload its data
    const updatedWidget = {
      ...dashboard.widgets[widgetId],
      lastUpdated: Date.now()
    };

    // Update only the specific widget in the dashboard state
    setDashboard(prevDashboard => ({
      ...prevDashboard,
      widgets: {
        ...prevDashboard.widgets,
        [widgetId]: updatedWidget
      }
    }));

    console.log('Widget refresh triggered for:', widgetId);
  }, [dashboard]);

  // Handle parameter changes
  const handleParameterChange = useCallback(async (widgetId, parameterValues) => {
    if (!dashboard) return;

    try {
      const result = await updateWidget(dashboard.id, widgetId, {
        'query.parameterValues': parameterValues
      });
      
      if (result.success) {
        setDashboard(result.dashboard);
      }
    } catch (err) {
      console.error('Failed to update widget parameters:', err);
    }
  }, [dashboard]);

  // Handle bulk parameter updates
  const handleBulkParameterUpdate = useCallback(async (updates) => {
    if (!dashboard) return;

    try {
      const promises = Object.entries(updates).map(([widgetId, parameterValues]) =>
        updateWidget(dashboard.id, widgetId, {
          'query.parameterValues': {
            ...dashboard.widgets[widgetId]?.query?.parameterValues,
            ...parameterValues
          }
        })
      );

      await Promise.all(promises);
      
      // Reload dashboard to get updated state
      await loadDashboard();
    } catch (err) {
      console.error('Failed to bulk update parameters:', err);
    }
  }, [dashboard, loadDashboard]);

  // Handle multiple widget refresh
  const handleRefreshWidgets = useCallback(async (widgetIds) => {
    console.log('Refreshing multiple widgets:', widgetIds);
    
    if (!dashboard) return;

    // Update lastUpdated timestamp for all specified widgets
    const updatedWidgets = {};
    const currentTime = Date.now();
    
    widgetIds.forEach(widgetId => {
      if (dashboard.widgets[widgetId]) {
        updatedWidgets[widgetId] = {
          ...dashboard.widgets[widgetId],
          lastUpdated: currentTime
        };
      }
    });

    // Update all specified widgets in one state update
    setDashboard(prevDashboard => ({
      ...prevDashboard,
      widgets: {
        ...prevDashboard.widgets,
        ...updatedWidgets
      }
    }));

    console.log('Multiple widget refresh triggered for:', widgetIds);
  }, [dashboard]);

  // Handle parameter presets
  const handleSavePreset = useCallback((widgetId, preset) => {
    setParameterPresets(prev => ({
      ...prev,
      [widgetId]: [...(prev[widgetId] || []), preset]
    }));
  }, []);

  // Handle refresh all widgets
  const handleRefreshAll = useCallback(async () => {
    if (!dashboard?.widgets) return;

    setIsRefreshing(true);
    try {
      const widgetIds = Object.keys(dashboard.widgets);
      await handleRefreshWidgets(widgetIds);
    } catch (err) {
      console.error('Failed to refresh widgets:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [dashboard, handleRefreshWidgets]);

  // Handle widget menu
  const handleWidgetMenuOpen = (event, widgetId) => {
    setWidgetMenuAnchor(event.currentTarget);
    setSelectedWidget(widgetId);
  };

  const handleWidgetMenuClose = () => {
    setWidgetMenuAnchor(null);
    setSelectedWidget(null);
  };

  // Handle widget actions
  const handleEditWidget = () => {
    if (!selectedWidget || !dashboard) return;
    
    const widget = dashboard.widgets[selectedWidget];
    setEditingWidget({
      ...widget,
      id: selectedWidget
    });
    setShowEditDialog(true);
    handleWidgetMenuClose();
  };

  // Handle widget edit dialog
  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setEditingWidget(null);
  };

  const handleSaveWidget = async (updatedWidget) => {
    if (!updatedWidget || !dashboard) return;

    try {
      console.log('Saving widget:', updatedWidget);
      
      // Update widget properties - make sure we have the widget ID
      const widgetId = updatedWidget.id || selectedWidget;
      if (!widgetId) {
        console.error('No widget ID found');
        return;
      }

      // Get the current widget to preserve its structure
      const currentWidget = dashboard.widgets[widgetId];
      console.log('Current widget before update:', currentWidget);
      console.log('Widget ID:', widgetId);
      console.log('Dashboard widgets:', Object.keys(dashboard.widgets));
      
      const result = await updateWidget(dashboard.id, widgetId, {
        title: updatedWidget.title,
        description: updatedWidget.description,
        query: updatedWidget.query,
        chartType: updatedWidget.chartType, // Keep chartType separate from type
        colors: updatedWidget.colors,
        settings: updatedWidget.settings,
        // Update chart analysis to reflect the selected chart type
        chartConfig: {
          ...currentWidget.chartConfig,
          chartType: updatedWidget.chartType,
          // Preserve existing analysis but update the best fit to match user selection
          chartAnalysis: currentWidget.chartConfig?.chartAnalysis ? {
            ...currentWidget.chartConfig.chartAnalysis,
            suggestions: currentWidget.chartConfig.chartAnalysis.suggestions.map(suggestion => ({
              ...suggestion,
              isBestFit: suggestion.type === updatedWidget.chartType
            }))
          } : null
        }
      });

      if (result.success) {
        setDashboard(result.dashboard);
        handleCloseEditDialog();
        console.log('Widget saved successfully');
        
        // The widget will automatically refresh due to the updated chartConfig and chartType
        // No need for additional refresh trigger since the widget dependencies will handle it
      } else {
        console.error('Save failed:', result.error);
      }
    } catch (err) {
      console.error('Failed to update widget:', err);
    }
  };


  const handleDeleteWidget = async () => {
    if (!selectedWidget || !dashboard) return;
    
    try {
      console.log('Deleting widget:', selectedWidget);
      
      // Remove widget from dashboard using the service
      await removeWidgetFromDashboard(dashboard.id, selectedWidget);
      
      // Reload dashboard to get updated state
      const updatedDashboard = await getDashboard(dashboard.id);
      if (updatedDashboard.success) {
        setDashboard(updatedDashboard.dashboard);
      }
      
      console.log('Widget deleted successfully');
    } catch (error) {
      console.error('Failed to delete widget:', error);
      setError('Failed to delete widget');
    }
    
    handleWidgetMenuClose();
  };

  // Render loading state
  if (isLoading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '400px' 
        }}
      >
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>
          Loading dashboard...
        </Typography>
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load dashboard: {error}
      </Alert>
    );
  }

  // Render empty dashboard
  if (!dashboard) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        Dashboard not found
      </Alert>
    );
  }

  const widgets = dashboard?.widgets || {};

  return (
    <>
      {/* CSS for drag handle styling and grid layout */}
      <style>
        {`
          .drag-handle {
            cursor: grab !important;
          }
          .drag-handle:active {
            cursor: grabbing !important;
          }
          /* Let react-grid-layout handle its own sizing */
          .react-grid-layout {
            position: relative;
          }
        `}
      </style>
      <Box sx={{ 
        p: 1,
        paddingBottom: '10px'
      }}>
      {/* Dashboard Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 1 
      }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ mb: 0.5 }}>
            {dashboard.name}
          </Typography>
          {dashboard.description && (
            <Typography variant="caption" color="text.secondary">
              {dashboard.description}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={showChartControls ? "Hide chart controls" : "Show chart controls"}>
            <IconButton 
              onClick={() => setShowChartControls(!showChartControls)}
              color={showChartControls ? "primary" : "default"}
            >
              <TuneIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Refresh all widgets">
            <IconButton 
              onClick={handleRefreshAll}
              disabled={isRefreshing}
            >
              {isRefreshing ? <CircularProgress size={24} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Dashboard settings">
            <IconButton onClick={() => setShowSettings(true)}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Dashboard Quick Filters */}
      <DashboardQuickFilters
        widgets={widgets}
        onBulkParameterUpdate={handleBulkParameterUpdate}
        onRefreshWidgets={handleRefreshWidgets}
      />

      {/* Dashboard Grid */}
      {Object.keys(widgets).length > 0 ? (
         <ResponsiveGridLayout
          className="layout"
          layouts={memoizedLayout}
          breakpoints={GRID_BREAKPOINTS}
          cols={GRID_COLUMNS}
          rowHeight={60}
          width={2400} // Fixed width to prevent auto-resizing and enable horizontal scroll
          margin={[10, 10]}
          containerPadding={[10, 10]}
          onLayoutChange={handleLayoutChange}
          isDraggable={true}
          isResizable={true}
          draggableHandle=".drag-handle"
          autoSize={true}
          compactType="vertical" // Auto-fit horizontally, move widgets down when no horizontal space
          preventCollision={false} // Allow widgets to be moved to make space
        >
          {Object.entries(widgets).map(([widgetId, widget]) => {
            // Create stable callback references to prevent unnecessary re-renders
            const handleWidgetRefresh = () => handleRefreshWidget(widgetId);
            const handleWidgetMenuClick = (e) => {
              e.stopPropagation();
              handleWidgetMenuOpen(e, widgetId);
            };
            const handleWidgetParameterChange = (parameterValues) => 
              handleParameterChange(widgetId, parameterValues);
            const handleWidgetPresetSave = (preset) => 
              handleSavePreset(widgetId, preset);

            return (
            <Paper
              key={widgetId}
              sx={{ 
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: 2
                }
              }}
              elevation={1}
            >
                {/* Widget Header with Drag Handle and Menu */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    p: 0.5,
                    minHeight: 32
                  }}
                >
                  {/* Drag Handle */}
                  <IconButton
                    size="small"
                    className="drag-handle"
                    sx={{
                      cursor: 'grab',
                      color: 'text.secondary',
                      '&:active': {
                        cursor: 'grabbing'
                      }
                    }}
                  >
                    <DragIndicatorIcon fontSize="small" />
                  </IconButton>

                  {/* Widget Title and Connection Info */}
                  {dashboardSettings?.showWidgetTitles !== false && (
                    <Box 
                      className="drag-handle"
                      sx={{ 
                        flex: 1, 
                        mx: 1, 
                        cursor: 'grab',
                        userSelect: 'none'
                      }}
                    >
                      <Typography 
                        variant="subtitle2" 
                        sx={{ 
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {widget.title}
                      </Typography>
                      {widget.connectionName && widget.database && (
                        <Typography 
                          variant="caption" 
                          color="text.secondary" 
                          sx={{ 
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {widget.connectionName} → {widget.database}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Refresh Button */}
                  <IconButton
                    size="small"
                    onClick={handleWidgetRefresh}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': { bgcolor: 'grey.100' }
                    }}
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>

                  {/* Widget Menu */}
                  <IconButton
                    size="small"
                    onClick={handleWidgetMenuClick}
                    sx={{
                      color: 'text.secondary',
                      zIndex: 10,
                      position: 'relative',
                      '&:hover': { bgcolor: 'grey.100' }
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Widget Parameter Panel */}
                {widget.query?.parameters && widget.query.parameters.length > 0 && (
                  <Box sx={{ p: 0.5 }}>
                    <WidgetParameterPanel
                      widget={widget}
                      onParameterChange={handleWidgetParameterChange}
                      onRefreshWidget={handleWidgetRefresh}
                      onSavePreset={handleWidgetPresetSave}
                      presets={parameterPresets[widgetId] || []}
                      compact={true}
                    />
                  </Box>
                )}

                {/* Widget Content */}
                <DashboardWidget
                  widget={widget}
                  onRefresh={handleWidgetRefresh}
                  showTitle={true}
                  showChartControls={showChartControls}
                />
              </Paper>
            );
           })}
         </ResponsiveGridLayout>
      ) : (
        // Empty dashboard state
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          height: '400px',
          textAlign: 'center'
        }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No widgets yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add your first widget to get started with your dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add widgets by running queries and clicking "Add to Dashboard"
          </Typography>
        </Box>
      )}


      {/* Widget Context Menu */}
      <Menu
        anchorEl={widgetMenuAnchor}
        open={Boolean(widgetMenuAnchor)}
        onClose={handleWidgetMenuClose}
      >
        <MenuItem onClick={() => handleRefreshWidget(selectedWidget)}>
          <RefreshIcon fontSize="small" sx={{ mr: 1 }} />
          Refresh
        </MenuItem>
        <MenuItem onClick={handleEditWidget}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleDeleteWidget} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Dialogs */}

      <WidgetEditDialog
        open={showEditDialog}
        onClose={handleCloseEditDialog}
        widget={editingWidget}
        onSave={handleSaveWidget}
      />

      <DashboardSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={dashboardSettings}
        onSettingsChanged={loadDashboardSettings}
      />
      </Box>
    </>
  );
};

export default Dashboard;
