import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Card,
  CardContent,
  Chip,
  Divider,
  CircularProgress,
  InputAdornment,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Preview as PreviewIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  AutoAwesome as AutoAwesomeIcon
} from '@mui/icons-material';
import { 
  WIDGET_TYPES,
  CHART_SUBTYPES,
  WIDGET_SIZE_PRESETS,
  REFRESH_INTERVALS,
  createWidgetConfig,
  validateWidgetConfig,
  getWidgetTypeDisplayName,
  getChartTypeDisplayName,
  getRefreshIntervalDisplayName
} from '../../types/dashboardTypes';
import { 
  getAllDashboards, 
  addWidgetToDashboard,
  createDefaultDashboard 
} from '../../services/dashboardStorageService';
import { analyzeChart } from '../../services/chartAnalysisService';
import { generateWidgetDescription } from '../../services/widgetDescriptionService';
import DashboardWidget from './DashboardWidget';
import QueryResultChartView from '../results/QueryResultChartView';
import { useDatabase } from '../../context/DatabaseContext';
import { useQuery } from '../../context/QueryContext';

const steps = ['Widget Details', 'Select Dashboard'];

/**
 * Dialog for adding query results to a dashboard as a widget
 */
const AddToDashboardDialog = ({ 
  open, 
  onClose, 
  queryResult, 
  originalQuery,
  queryContext,
  chartConfig // Chart configuration from QueryResultChartView
}) => {
  // Get current database connection info to bind widget to it
  const { activeConnections, connections } = useDatabase();
  // Get the active conversation to access its database binding
  const { activeConversation } = useQuery();
  const [activeStep, setActiveStep] = useState(0);
  const [dashboards, setDashboards] = useState([]);
  const [selectedDashboard, setSelectedDashboard] = useState('');
  const [isLoadingDashboards, setIsLoadingDashboards] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState({
    type: chartConfig ? WIDGET_TYPES.CHART : WIDGET_TYPES.TABLE,
    title: '',
    description: '',
    chartType: CHART_SUBTYPES.BAR,
    // size: undefined, // Let createWidgetConfig determine size based on chartType
    refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
    showTitle: true,
    // XY field defaults (will be set by AI recommendations)
    xField: '',
    yField: ''
  });
  
  const [chartAnalysis, setChartAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Load dashboards when dialog opens
  useEffect(() => {
    if (open) {
      console.log('AddToDashboardDialog: Dialog opened with data:', {
        queryResult,
        queryContext,
        'activeConversation?.database (USING THIS)': activeConversation?.database,
        'activeConversation?.id': activeConversation?.id,
        originalQuery,
        chartConfig
      });
      
      loadDashboards();
      analyzeQueryResult();
      
      // Ensure we have a title
      if (!widgetConfig.title) {
        const widgetType = chartConfig ? 'Chart' : 'Table';
        const fallbackTitle = queryContext?.collection ? `${queryContext.collection} ${widgetType}` : `Dashboard ${widgetType}`;
        setWidgetConfig(prev => ({
          ...prev,
          title: fallbackTitle
        }));
      }
    }
  }, [open, queryResult]);

  // Auto-generate widget title based on query context
  useEffect(() => {
    if (queryContext && !widgetConfig.title) {
      const suggestedTitle = generateWidgetTitle(queryContext, widgetConfig.type);
      setWidgetConfig(prev => ({
        ...prev,
        title: suggestedTitle
      }));
    }
  }, [queryContext, widgetConfig.type]);

  const loadDashboards = async () => {
    setIsLoadingDashboards(true);
    try {
      const result = await getAllDashboards();
      
      if (result.success) {
        let dashboardList = result.dashboards;
        
        // If no dashboards exist, create a default one
        if (dashboardList.length === 0) {
          const defaultResult = await createDefaultDashboard();
          if (defaultResult.success) {
            dashboardList = [defaultResult.dashboard];
          }
        }
        
        setDashboards(dashboardList);
        if (dashboardList.length > 0) {
          setSelectedDashboard(dashboardList[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load dashboards:', error);
    } finally {
      setIsLoadingDashboards(false);
    }
  };

  const analyzeQueryResult = async () => {
    // Skip chart analysis for table widgets
    if (!chartConfig) {
      console.log('Skipping chart analysis for table widget');
      setChartAnalysis(null);
      return;
    }
    
    if (!queryResult?.documents || queryResult.documents.length === 0) return;

    setIsAnalyzing(true);
    try {
      let analysis;

      // Use existing chart analysis if available from chartConfig
      if (chartConfig?.chartAnalysis) {
        analysis = chartConfig.chartAnalysis;
        console.log('Using existing chart analysis from chartConfig');
      } else {
        // Fallback to local analysis only (no AI re-analysis)
        console.log('No chart analysis found, using local analysis');
        analysis = {
          success: true,
          suitable: true,
          suggestions: [], // AI backend should provide chart suggestions
          isAIEnhanced: false
        };
      }

      setChartAnalysis(analysis);

      // Auto-select widget type and chart type based on chartConfig or analysis
      if (chartConfig?.chartType) {
        // Use the chart configuration from QueryResultChartView
        setWidgetConfig(prev => ({
          ...prev,
          type: chartConfig.chartType === 'summary' ? WIDGET_TYPES.SUMMARY : WIDGET_TYPES.CHART,
          chartType: chartConfig.chartType,
          // Use XY fields from chartConfig if available
          xField: chartConfig.xField || prev.xField,
          yField: chartConfig.yField || prev.yField,
          // Don't override size here - let createWidgetConfig determine it based on chartType
          size: undefined
        }));
      } else if (analysis.suitable && analysis.suggestions.length > 0) {
        // Auto-select the AI's marked best fit chart
        const bestSuggestion = analysis.suggestions.find(s => s.isBestFit) || analysis.suggestions[0];
        console.log('AddToDashboardDialog: Auto-selecting AI best fit chart type:', bestSuggestion);
        
        setWidgetConfig(prev => ({
          ...prev,
          type: bestSuggestion.type === 'summary' ? WIDGET_TYPES.SUMMARY : WIDGET_TYPES.CHART,
          chartType: bestSuggestion.type,
          // Use AI's recommended XY fields as defaults
          xField: bestSuggestion.recommendedFields?.xField || prev.xField,
          yField: bestSuggestion.recommendedFields?.yField || prev.yField,
          // Don't override size here - let createWidgetConfig determine it based on chartType
          size: undefined
        }));
      }
    } catch (error) {
      console.error('Failed to analyze query result:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateWidgetTitle = (context, widgetType) => {
    const collection = context?.collection || 'Data';
    const operation = context?.operation || 'Query';
    const widgetTypeName = getWidgetTypeDisplayName(widgetType);
    
    return `${collection} ${widgetTypeName}`;
  };

  const handleNext = () => {
    if (activeStep === steps.length - 1) {
      handleCreateWidget();
    } else {
      setActiveStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep(prev => prev - 1);
  };

  const handleClose = () => {
    setActiveStep(0);
    setValidationErrors([]);
    onClose();
  };

  const handleConfigChange = (field, value) => {
    setWidgetConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setValidationErrors([]);
  };

  const handleGenerateDescription = async () => {
    if (!widgetConfig.title?.trim()) {
      setValidationErrors(['Please enter a widget title first']);
      return;
    }

    setIsGeneratingDescription(true);
    setValidationErrors([]);

    try {
      const result = await generateWidgetDescription({
        widgetTitle: widgetConfig.title,
        chartType: widgetConfig.chartType,
        collectionName: queryContext?.collection,
        databaseName: activeConversation?.database,
        query: originalQuery
      });

      if (result.success && result.description) {
        setWidgetConfig(prev => ({
          ...prev,
          description: result.description
        }));
      } else {
        setValidationErrors([result.error || 'Failed to generate description']);
      }
    } catch (error) {
      console.error('Failed to generate description:', error);
      setValidationErrors(['An error occurred while generating the description']);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleCreateWidget = async () => {
    if (!selectedDashboard) {
      setValidationErrors(['Please select a dashboard']);
      return;
    }

    // Create widget configuration
    console.log('AddToDashboardDialog: About to create widget with type:', widgetConfig.type);
    console.log('AddToDashboardDialog: widgetConfig:', widgetConfig);
    
    // Get connection info from the conversation (this is the connection used for the query)
    // Use the conversation's connectionId, NOT activeConnections[0] which may be a different connection
    const currentConnectionId = activeConversation?.connectionId;
    const currentConnection = currentConnectionId ? connections[currentConnectionId] : null;
    
    console.log('AddToDashboardDialog: Connection resolution:', {
      'activeConversation?.connectionId': activeConversation?.connectionId,
      'activeConnections': activeConnections,
      'activeConnections[0]': activeConnections?.[0],
      'using connectionId': currentConnectionId,
      'connection found': !!currentConnection
    });
    
    if (!currentConnectionId || !currentConnection) {
      setValidationErrors(['No database connection associated with this conversation. Please ensure the conversation is connected to a database.']);
      return;
    }
    
    // Use the conversation's database directly - this is the source of truth
    const widgetDatabase = activeConversation?.database;
    console.log('AddToDashboardDialog: Database validation:', {
      'activeConversation?.database': activeConversation?.database,
      'activeConversation': activeConversation,
      widgetDatabase,
      queryContext
    });
    
    if (!widgetDatabase) {
      const errorDetails = [];
      errorDetails.push('Database information is missing from the conversation.');
      errorDetails.push('The conversation must be bound to a database before creating widgets.');
      errorDetails.push('Please ensure the conversation has a database selected.');
      
      setValidationErrors(errorDetails);
      return;
    }
    
    // Ensure we have chart analysis for chart/summary widgets
    const finalChartAnalysis = chartConfig?.chartAnalysis || chartAnalysis;
    if ((widgetConfig.type === WIDGET_TYPES.CHART || widgetConfig.type === WIDGET_TYPES.SUMMARY) && !finalChartAnalysis) {
      setValidationErrors(['Chart analysis is required for chart widgets. Please wait for analysis to complete.']);
      return;
    }
    
    // For table widgets, we don't need chart config
    const widgetChartConfig = widgetConfig.type === WIDGET_TYPES.TABLE ? undefined : {
      // Use the chart configuration from QueryResultChartView
      chartType: chartConfig?.chartType || widgetConfig.chartType,
      xField: chartConfig?.xField || '',
      yField: chartConfig?.yField || '',
      // Preserve the AI analysis for the dashboard widget - REQUIRED for chart widgets!
      chartAnalysis: chartConfig?.chartAnalysis || chartAnalysis
    };
    
    const widget = createWidgetConfig(widgetConfig.type, {
      ...widgetConfig,
      // Store the original query directly for execution
      query: originalQuery,
      database: widgetDatabase, // Use validated database
      collection: queryContext?.collection || '',
      operation: queryContext?.operation || '',
      executionTime: queryContext?.executionTime || 0,
      // Store connection info to bind widget to specific connection
      connectionId: currentConnectionId,
      connectionString: currentConnection.connectionString,
      connectionName: currentConnection.name,
      // Store query context for identical rendering
      queryContext: queryContext,
      chartConfig: widgetChartConfig
    });

    console.log('AddToDashboardDialog: Created widget:', widget);
    console.log('AddToDashboardDialog: Widget type after creation:', widget.type);
    console.log('AddToDashboardDialog: Widget query:', widget.query);
    console.log('AddToDashboardDialog: Widget query type:', typeof widget.query);
    console.log('AddToDashboardDialog: Widget database:', widget.database);
    console.log('AddToDashboardDialog: Widget connectionId:', widget.connectionId);
    console.log('AddToDashboardDialog: Widget connectionString:', widget.connectionString);
    console.log('AddToDashboardDialog: Widget connectionName:', widget.connectionName);
    console.log('AddToDashboardDialog: Widget full object:', JSON.stringify(widget, null, 2));

    console.log('AddToDashboardDialog: Creating widget with query:', {
      originalQuery,
      database: widgetDatabase,
      databaseSource: 'activeConversation.database',
      conversationId: activeConversation?.id,
      collection: queryContext?.collection,
      queryContext
    });
    
    console.log('AddToDashboardDialog: Chart configuration:', {
      'chartConfig?.chartType': chartConfig?.chartType,
      'widgetConfig.chartType': widgetConfig.chartType,
      'final chartType': chartConfig?.chartType || widgetConfig.chartType,
      'chartConfig': chartConfig,
      'widgetConfig': widgetConfig
    });

    // Validate widget
    const validation = validateWidgetConfig(widget);
    console.log('AddToDashboardDialog: Validation result:', validation);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setIsCreating(true);
    try {
      const result = await addWidgetToDashboard(selectedDashboard, widget);
      
      if (result.success) {
        handleClose();
        // TODO: Navigate to dashboard or show success message
      } else {
        setValidationErrors([result.error]);
      }
    } catch (error) {
      setValidationErrors([error.message]);
    } finally {
      setIsCreating(false);
    }
  };


  const renderWidgetDetailsStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        Widget Details
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter a name and description for your dashboard widget
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField
          fullWidth
          label="Widget Name"
          value={widgetConfig.title}
          onChange={(e) => handleConfigChange('title', e.target.value)}
          placeholder="e.g., Monthly Sales Chart"
          required
          helperText="Give your widget a descriptive name"
        />

        <TextField
          fullWidth
          label="Widget Description (Optional)"
          value={widgetConfig.description}
          onChange={(e) => handleConfigChange('description', e.target.value)}
          placeholder="e.g., Shows monthly sales data with trend analysis"
          multiline
          rows={3}
          helperText="Optional: Describe what this widget shows and its purpose"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                <Tooltip title="Generate description with AI">
                  <span>
                    <IconButton
                      onClick={handleGenerateDescription}
                      disabled={isGeneratingDescription || !widgetConfig.title?.trim()}
                      color="primary"
                      size="small"
                    >
                      {isGeneratingDescription ? (
                        <CircularProgress size={20} />
                      ) : (
                        <AutoAwesomeIcon />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            )
          }}
        />

        {/* Chart Type Selection - only show if AI suggests multiple chart types */}
        {chartAnalysis?.suggestions && chartAnalysis.suggestions.length > 1 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Chart Type
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {chartAnalysis.suggestions.length > 1 
                ? `AI found ${chartAnalysis.suggestions.length} suitable chart types. The best fit is highlighted.`
                : 'AI recommended chart type'
              }
            </Typography>
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {chartAnalysis.suggestions.map((suggestion, index) => {
                const isSelected = widgetConfig.chartType === suggestion.type;
                const isBestFit = suggestion.isBestFit === true; // AI marks the best fit
                
                return (
                  <Chip
                    key={suggestion.type}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {getChartTypeDisplayName(suggestion.type)}
                        {isBestFit && (
                          <Chip 
                            size="small" 
                            label="Best Fit" 
                            color="primary" 
                            sx={{ height: 16, fontSize: '0.6rem' }}
                          />
                        )}
                      </Box>
                    }
                    onClick={() => handleConfigChange('chartType', suggestion.type)}
                    variant={isSelected ? 'filled' : 'outlined'}
                    color={isSelected ? 'primary' : 'default'}
                    sx={{ 
                      cursor: 'pointer',
                      ...(isBestFit && !isSelected && {
                        borderColor: 'primary.main',
                        borderWidth: 2
                      })
                    }}
                  />
                );
              })}
            </Box>
            
            {/* Show confidence and reason for selected chart type */}
            {widgetConfig.chartType && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                {(() => {
                  const selectedSuggestion = chartAnalysis.suggestions.find(s => s.type === widgetConfig.chartType);
                  return selectedSuggestion ? (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Confidence: {Math.round(selectedSuggestion.confidence * 100)}%
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {selectedSuggestion.reason}
                      </Typography>
                    </Box>
                  ) : null;
                })()}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderDashboardSelectionStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        Select Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose which dashboard to add this widget to
      </Typography>

      {isLoadingDashboards ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {dashboards.map(dashboard => (
            <Card
              key={dashboard.id}
              onClick={() => setSelectedDashboard(dashboard.id)}
              sx={{
                cursor: 'pointer',
                border: '2px solid',
                borderColor: selectedDashboard === dashboard.id ? 'primary.main' : 'divider',
                bgcolor: selectedDashboard === dashboard.id ? 'primary.50' : 'transparent',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'primary.50'
                }
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <DashboardIcon color={selectedDashboard === dashboard.id ? 'primary' : 'action'} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight="medium">
                      {dashboard.name}
                    </Typography>
                    {dashboard.description && (
                      <Typography variant="body2" color="text.secondary">
                        {dashboard.description}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {Object.keys(dashboard.widgets || {}).length} widgets
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );

  const renderWidgetConfigurationStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        Configure Widget
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Customize your widget settings
      </Typography>

      {/* AI Analysis Results */}
      {chartAnalysis && (
        <Alert 
          severity="info" 
          sx={{ mb: 3 }}
          icon={<PreviewIcon />}
        >
          <Typography variant="subtitle2" gutterBottom>
            {chartAnalysis.isAIEnhanced ? '🤖 AI Analysis' : '📊 Local Analysis'}
          </Typography>
          <Typography variant="body2">
            {chartAnalysis.suggestions?.[0]?.reason || 'Widget type detected based on data structure'}
          </Typography>
          {chartAnalysis.isAIEnhanced && (
            <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
              Confidence: {Math.round((chartAnalysis.confidence || 0) * 100)}%
            </Typography>
          )}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Widget Title */}
        <TextField
          fullWidth
          label="Widget Title"
          value={widgetConfig.title}
          onChange={(e) => handleConfigChange('title', e.target.value)}
          placeholder="Enter widget title"
        />

        {/* Widget Type */}
        <FormControl fullWidth>
          <InputLabel>Widget Type</InputLabel>
          <Select
            value={widgetConfig.type}
            label="Widget Type"
            onChange={(e) => handleConfigChange('type', e.target.value)}
          >
            {Object.values(WIDGET_TYPES).map(type => (
              <MenuItem key={type} value={type}>
                {getWidgetTypeDisplayName(type)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Chart Type (for chart widgets) */}
        {widgetConfig.type === WIDGET_TYPES.CHART && (
          <FormControl fullWidth>
            <InputLabel>Chart Type</InputLabel>
            <Select
              value={widgetConfig.chartType}
              label="Chart Type"
              onChange={(e) => handleConfigChange('chartType', e.target.value)}
            >
              {Object.values(CHART_SUBTYPES).map(chartType => (
                <MenuItem key={chartType} value={chartType}>
                  {getChartTypeDisplayName(chartType)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Widget Size */}
        <FormControl fullWidth>
          <InputLabel>Widget Size</InputLabel>
          <Select
            value={widgetConfig.size}
            label="Widget Size"
            onChange={(e) => handleConfigChange('size', e.target.value)}
          >
            {Object.keys(WIDGET_SIZE_PRESETS).map(size => (
              <MenuItem key={size} value={size}>
                {size.charAt(0) + size.slice(1).toLowerCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Refresh Interval */}
        <FormControl fullWidth>
          <InputLabel>Auto Refresh</InputLabel>
          <Select
            value={widgetConfig.refreshInterval}
            label="Auto Refresh"
            onChange={(e) => handleConfigChange('refreshInterval', e.target.value)}
          >
            {Object.entries(REFRESH_INTERVALS).map(([key, value]) => (
              <MenuItem key={key} value={value}>
                {getRefreshIntervalDisplayName(value)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Parameterization Info */}
        {parameterizationData && (
          <Alert severity="success">
            <Typography variant="subtitle2" gutterBottom>
              🎯 Parameterized Widget
            </Typography>
            <Typography variant="body2">
              This widget will be parameterized with {parameterizationData.parameters?.length || 0} parameters.
              Users can configure these parameters in the dashboard.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              {parameterizationData.parameters?.slice(0, 3).map((param, index) => (
                <Chip
                  key={index}
                  label={`${param.name} (${param.type})`}
                  size="small"
                  variant="outlined"
                  color="success"
                />
              ))}
            </Box>
          </Alert>
        )}
      </Box>
    </Box>
  );


  const canProceed = () => {
    switch (activeStep) {
      case 0: // Widget Details step
        return widgetConfig.title.trim() !== '';
      case 1: // Select Dashboard step
        return selectedDashboard !== '';
      default:
        return false;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '600px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon />
          Add to Dashboard
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Stepper */}
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Please fix the following errors:
            </Typography>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* Step Content */}
        {activeStep === 0 && renderWidgetDetailsStep()}
        {activeStep === 1 && renderDashboardSelectionStep()}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        {activeStep > 0 && (
          <Button onClick={handleBack}>
            Back
          </Button>
        )}
        <Button 
          variant="contained" 
          onClick={handleNext}
          disabled={!canProceed() || isCreating || isAnalyzing}
        >
          {isCreating ? 'Adding...' : activeStep === steps.length - 1 ? 'Add to Dashboard' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddToDashboardDialog;
