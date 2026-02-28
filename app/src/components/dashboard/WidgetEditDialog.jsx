import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Box,
  Grid,
  Typography,
  Chip,
  Card,
  CardContent,
  IconButton,
  Stack,
  InputAdornment,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Settings as SettingsIcon,
  BarChart as BarChartIcon,
  ShowChart as LineChartIcon,
  PieChart as PieChartIcon,
  Assessment as SummaryIcon,
  AutoAwesome as AutoAwesomeIcon
} from '@mui/icons-material';
import { 
  CHART_SUBTYPES, 
  CHART_TYPE_OPTIONS 
} from '../../types/dashboardTypes';
import { generateWidgetDescription } from '../../services/widgetDescriptionService';

/**
 * Tab panel component for organizing dialog content
 */
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`widget-edit-tabpanel-${index}`}
      aria-labelledby={`widget-edit-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

/**
 * Widget Edit Dialog Component
 * Provides a comprehensive interface for editing widget properties
 */
const WidgetEditDialog = ({ 
  open, 
  onClose, 
  widget, 
  onSave,
  isLoading = false 
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [editedWidget, setEditedWidget] = useState({
    title: '',
    description: '',
    query: '',
    chartType: CHART_SUBTYPES.BAR,
    colors: {
      primary: '#1976d2',
      secondary: '#dc004e',
      background: '#ffffff'
    },
    settings: {
      showLegend: true,
      showGrid: true,
      animated: true,
      refreshInterval: 0
    }
  });
  const [errors, setErrors] = useState({});
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Initialize form data when widget changes
  useEffect(() => {
    if (widget) {
      setEditedWidget({
        id: widget.id, // Make sure to include the ID
        title: widget.title || '',
        description: widget.description || '',
        query: typeof widget.query === 'string' 
          ? widget.query 
          : (widget.query?.originalQuery || widget.query?.template || ''),
        chartType: widget.chartType || widget.type || CHART_SUBTYPES.BAR,
        colors: {
          primary: widget.colors?.primary || '#1976d2',
          secondary: widget.colors?.secondary || '#dc004e',
          background: widget.colors?.background || '#ffffff'
        },
        settings: {
          showLegend: widget.settings?.showLegend ?? true,
          showGrid: widget.settings?.showGrid ?? true,
          animated: widget.settings?.animated ?? true,
          refreshInterval: widget.settings?.refreshInterval || 0
        }
      });
      setErrors({});
    }
  }, [widget]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleFieldChange = (field, value) => {
    setEditedWidget(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleNestedFieldChange = (parent, field, value) => {
    setEditedWidget(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!editedWidget.title?.trim()) {
      newErrors.title = 'Widget title is required';
    }
    
    if (!editedWidget.query?.trim()) {
      newErrors.query = 'Query is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave(editedWidget);
    }
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  const handleGenerateDescription = async () => {
    if (!editedWidget.title?.trim()) {
      setErrors(prev => ({
        ...prev,
        description: 'Please enter a widget title first'
      }));
      return;
    }

    setIsGeneratingDescription(true);
    setErrors(prev => ({ ...prev, description: null }));

    try {
      const result = await generateWidgetDescription({
        widgetTitle: editedWidget.title,
        chartType: editedWidget.chartType,
        collectionName: widget?.collection,
        databaseName: widget?.database,
        query: typeof editedWidget.query === 'string' ? editedWidget.query : null
      });

      if (result.success && result.description) {
        setEditedWidget(prev => ({
          ...prev,
          description: result.description
        }));
      } else {
        setErrors(prev => ({
          ...prev,
          description: result.error || 'Failed to generate description'
        }));
      }
    } catch (error) {
      console.error('Failed to generate description:', error);
      setErrors(prev => ({
        ...prev,
        description: 'An error occurred while generating the description'
      }));
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const getChartIcon = (type) => {
    switch (type) {
      case CHART_SUBTYPES.BAR: return <BarChartIcon />;
      case CHART_SUBTYPES.LINE: return <LineChartIcon />;
      case CHART_SUBTYPES.PIE: return <PieChartIcon />;
      case CHART_SUBTYPES.SUMMARY: return <SummaryIcon />;
      case CHART_SUBTYPES.MULTI_BAR: return <BarChartIcon />;
      case CHART_SUBTYPES.MULTI_LINE: return <LineChartIcon />;
      default: return <BarChartIcon />;
    }
  };

  const getAvailableChartTypes = () => {
    // If widget has chart analysis, only show supported chart types
    if (widget?.chartConfig?.chartAnalysis?.suggestions) {
      const suggestions = widget.chartConfig.chartAnalysis.suggestions;
      
      return CHART_TYPE_OPTIONS.filter(option => {
        const suggestion = suggestions.find(s => s.type === option.value);
        return suggestion !== undefined;
      }).map(option => {
        const suggestion = suggestions.find(s => s.type === option.value);
        return {
          ...option,
          isRecommended: suggestion && suggestion.confidence > 0.7,
          isBestFit: suggestion && suggestion.isBestFit === true
        };
      });
    }
    
    // Fallback: show all chart types if no analysis available
    return CHART_TYPE_OPTIONS;
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          pb: 1
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon color="primary" />
          <Typography variant="h6">
            Edit Widget
          </Typography>
          {editedWidget.title && (
            <Chip 
              label={editedWidget.title} 
              size="small" 
              variant="outlined" 
              color="primary"
            />
          )}
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Clean, Simple Content */}
      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={3}>
          {/* Widget Title */}
          <TextField
            fullWidth
            label="Widget Title"
            value={editedWidget.title}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            error={!!errors.title}
            helperText={errors.title}
            variant="outlined"
            size="medium"
          />

          {/* Description */}
          <TextField
            fullWidth
            label="Description (optional)"
            value={editedWidget.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            multiline
            rows={2}
            variant="outlined"
            error={!!errors.description}
            helperText={errors.description}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                  <Tooltip title="Generate description with AI">
                    <span>
                      <IconButton
                        onClick={handleGenerateDescription}
                        disabled={isGeneratingDescription || !editedWidget.title?.trim()}
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

          {/* Chart Type Selection */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Chart Type
            </Typography>
            {getAvailableChartTypes().length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                No chart types available for this data. Please check your query results.
              </Typography>
            ) : (
              <Grid container spacing={2}>
                {getAvailableChartTypes().map((option) => (
                <Grid item xs={6} sm={3} key={option.value}>
                  <Card 
                    variant={editedWidget.chartType === option.value ? "elevation" : "outlined"}
                    sx={{ 
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      border: editedWidget.chartType === option.value 
                        ? '2px solid' 
                        : undefined,
                      borderColor: editedWidget.chartType === option.value 
                        ? 'primary.main' 
                        : undefined,
                      '&:hover': {
                        boxShadow: 2
                      }
                    }}
                    onClick={() => handleFieldChange('chartType', option.value)}
                  >
                    <CardContent sx={{ p: 2, textAlign: 'center' }}>
                      <Box sx={{ mb: 1, color: editedWidget.chartType === option.value ? 'primary.main' : 'text.secondary' }}>
                        {getChartIcon(option.value)}
                      </Box>
                      <Typography variant="body2">
                        {option.label}
                      </Typography>
                      {option.isRecommended && (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                          Recommended
                        </Typography>
                      )}
                      {option.isBestFit && (
                        <Typography variant="caption" color="primary.main" sx={{ display: 'block', mt: 0.5, fontWeight: 'bold' }}>
                          Best Fit
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                ))}
              </Grid>
            )}
          </Box>

          {/* Query */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              MongoDB Query
            </Typography>
            <TextField
              fullWidth
              value={editedWidget.query}
              onChange={(e) => handleFieldChange('query', e.target.value)}
              multiline
              rows={6}
              error={!!errors.query}
              helperText={errors.query || 'Enter your MongoDB aggregation pipeline or find query'}
              variant="outlined"
              placeholder="Enter your MongoDB query here..."
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace'
                }
              }}
            />
          </Box>

        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={isLoading || !editedWidget.title?.trim()}
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WidgetEditDialog;
