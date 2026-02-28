import React, { useState } from 'react';
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
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  BarChart as ChartIcon,
  TableChart as TableIcon,
  Assessment as SummaryIcon
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
import { addWidgetToDashboard } from '../../services/dashboardStorageService';

const steps = ['Widget Type', 'Configuration', 'Query Setup'];

/**
 * Dialog for adding new widgets to a dashboard
 */
const AddWidgetDialog = ({ open, onClose, dashboardId, onWidgetAdded }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [widgetConfig, setWidgetConfig] = useState({
    type: WIDGET_TYPES.CHART,
    title: '',
    chartType: CHART_SUBTYPES.BAR,
    size: 'MEDIUM',
    refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
    showTitle: true,
    query: {
      template: '',
      parameters: [],
      parameterValues: {},
      database: '',
      collection: ''
    }
  });
  const [validationErrors, setValidationErrors] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

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
    setWidgetConfig({
      type: WIDGET_TYPES.CHART,
      title: '',
      chartType: CHART_SUBTYPES.BAR,
      size: 'MEDIUM',
      refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
      showTitle: true,
      query: {
        template: '',
        parameters: [],
        parameterValues: {},
        database: '',
        collection: ''
      }
    });
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

  const handleQueryChange = (field, value) => {
    setWidgetConfig(prev => ({
      ...prev,
      query: {
        ...prev.query,
        [field]: value
      }
    }));
    setValidationErrors([]);
  };

  const handleCreateWidget = async () => {
    // Validate widget configuration
    const widget = createWidgetConfig(widgetConfig.type, widgetConfig);
    const validation = validateWidgetConfig(widget);
    
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setIsCreating(true);
    try {
      const result = await addWidgetToDashboard(dashboardId, widget);
      
      if (result.success) {
        handleClose();
        if (onWidgetAdded) {
          onWidgetAdded(result.widget);
        }
      } else {
        setValidationErrors([result.error]);
      }
    } catch (error) {
      setValidationErrors([error.message]);
    } finally {
      setIsCreating(false);
    }
  };

  const renderWidgetTypeStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        Choose Widget Type
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select the type of widget you want to add to your dashboard
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.values(WIDGET_TYPES).map(type => {
          const isSelected = widgetConfig.type === type;
          const Icon = type === WIDGET_TYPES.CHART ? ChartIcon : 
                     type === WIDGET_TYPES.SUMMARY ? SummaryIcon : TableIcon;
          
          return (
            <Box
              key={type}
              onClick={() => handleConfigChange('type', type)}
              sx={{
                p: 2,
                border: '2px solid',
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 2,
                cursor: 'pointer',
                bgcolor: isSelected ? 'primary.50' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'primary.50'
                }
              }}
            >
              <Icon color={isSelected ? 'primary' : 'action'} />
              <Box>
                <Typography variant="subtitle1" fontWeight="medium">
                  {getWidgetTypeDisplayName(type)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {type === WIDGET_TYPES.CHART && 'Visualize data with charts and graphs'}
                  {type === WIDGET_TYPES.SUMMARY && 'Display key metrics and KPIs'}
                  {type === WIDGET_TYPES.TABLE && 'Show data in tabular format'}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  const renderConfigurationStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        Widget Configuration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure your {getWidgetTypeDisplayName(widgetConfig.type).toLowerCase()} widget
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Widget Title */}
        <TextField
          fullWidth
          label="Widget Title"
          value={widgetConfig.title}
          onChange={(e) => handleConfigChange('title', e.target.value)}
          placeholder={`My ${getWidgetTypeDisplayName(widgetConfig.type)}`}
        />

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

        {/* Show Title */}
        <FormControlLabel
          control={
            <Switch
              checked={widgetConfig.showTitle}
              onChange={(e) => handleConfigChange('showTitle', e.target.checked)}
            />
          }
          label="Show widget title"
        />
      </Box>
    </Box>
  );

  const renderQuerySetupStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" gutterBottom>
        Query Setup
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure the data source for your widget
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Database */}
        <TextField
          fullWidth
          label="Database"
          value={widgetConfig.query.database}
          onChange={(e) => handleQueryChange('database', e.target.value)}
          placeholder="e.g., myapp"
        />

        {/* Collection */}
        <TextField
          fullWidth
          label="Collection"
          value={widgetConfig.query.collection}
          onChange={(e) => handleQueryChange('collection', e.target.value)}
          placeholder="e.g., users"
        />

        {/* Query Template */}
        <TextField
          fullWidth
          multiline
          rows={6}
          label="Query Template"
          value={widgetConfig.query.template}
          onChange={(e) => handleQueryChange('template', e.target.value)}
          placeholder="db.collection.aggregate([...])"
          helperText="Use {{parameterName}} for dynamic parameters"
        />

        <Alert severity="info">
          <Typography variant="body2">
            <strong>Tip:</strong> You can create widgets from existing query results using the 
            "Add to Dashboard" button, which will automatically fill in the query template and parameters.
          </Typography>
        </Alert>
      </Box>
    </Box>
  );

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return widgetConfig.type !== '';
      case 1:
        return widgetConfig.title.trim() !== '';
      case 2:
        return widgetConfig.query.template.trim() !== '';
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
          Add Widget to Dashboard
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
        {activeStep === 0 && renderWidgetTypeStep()}
        {activeStep === 1 && renderConfigurationStep()}
        {activeStep === 2 && renderQuerySetupStep()}
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
          disabled={!canProceed() || isCreating}
        >
          {isCreating ? 'Creating...' : activeStep === steps.length - 1 ? 'Create Widget' : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddWidgetDialog;
