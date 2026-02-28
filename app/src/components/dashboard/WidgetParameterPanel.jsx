import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Button,
  IconButton,
  Collapse,
  Card,
  CardContent,
  Chip,
  Divider,
  Tooltip,
  Alert
} from '@mui/material';
import {
  Tune as TuneIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  History as HistoryIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
// Parameter validation and management functions
const validateParameters = async (parameterDefinitions, parameterValues) => {
  // Simple local validation
  const errors = [];
  
  parameterDefinitions.forEach(param => {
    const value = parameterValues[param.name];
    
    if (param.validation?.required && (!value || value === '')) {
      errors.push(`${param.name} is required`);
    }
    
    if (param.type === 'number' && value !== undefined) {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`${param.name} must be a number`);
      } else {
        if (param.validation?.min !== undefined && numValue < param.validation.min) {
          errors.push(`${param.name} must be at least ${param.validation.min}`);
        }
        if (param.validation?.max !== undefined && numValue > param.validation.max) {
          errors.push(`${param.name} must be at most ${param.validation.max}`);
        }
      }
    }
  });
  
  return {
    success: true,
    valid: errors.length === 0,
    errors
  };
};

const getDefaultParameterValues = (parameters) => {
  const defaults = {};
  
  parameters.forEach(param => {
    if (param.defaultValue !== undefined) {
      defaults[param.name] = param.defaultValue;
    } else if (param.currentValue !== undefined) {
      defaults[param.name] = param.currentValue;
    } else {
      // Provide sensible defaults based on type
      switch (param.type) {
        case 'date':
          defaults[param.name] = new Date().toISOString().split('T')[0];
          break;
        case 'number':
          defaults[param.name] = 0;
          break;
        case 'string':
          defaults[param.name] = '';
          break;
        case 'boolean':
          defaults[param.name] = false;
          break;
        case 'enum':
          defaults[param.name] = param.enumValues?.[0] || '';
          break;
        default:
          defaults[param.name] = '';
      }
    }
  });
  
  return defaults;
};

/**
 * Parameter control panel for individual dashboard widgets
 */
const WidgetParameterPanel = ({ 
  widget, 
  onParameterChange, 
  onRefreshWidget,
  onSavePreset,
  presets = [],
  compact = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [parameterValues, setParameterValues] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // Initialize parameter values
  useEffect(() => {
    if (widget?.query?.parameters) {
      const currentValues = widget.query.parameterValues || {};
      const defaultValues = getDefaultParameterValues(widget.query.parameters);
      setParameterValues({ ...defaultValues, ...currentValues });
    }
  }, [widget]);

  // Validate parameters when they change
  useEffect(() => {
    if (widget?.query?.parameters && Object.keys(parameterValues).length > 0) {
      validateParametersAsync();
    }
  }, [parameterValues, widget?.query?.parameters]);

  const validateParametersAsync = async () => {
    if (!widget?.query?.parameters) return;

    setIsValidating(true);
    try {
      const validation = await validateParameters(widget.query.parameters, parameterValues);
      setValidationErrors(validation.errors || []);
    } catch (error) {
      console.error('Parameter validation failed:', error);
      setValidationErrors(['Validation failed']);
    } finally {
      setIsValidating(false);
    }
  };

  const handleParameterChange = (paramName, value) => {
    const newValues = { ...parameterValues, [paramName]: value };
    setParameterValues(newValues);
    
    // Debounced parameter change notification
    clearTimeout(handleParameterChange.timeout);
    handleParameterChange.timeout = setTimeout(() => {
      if (onParameterChange) {
        onParameterChange(widget.id, newValues);
      }
    }, 500);
  };

  const handleApplyParameters = async () => {
    if (validationErrors.length > 0) return;

    if (onParameterChange) {
      onParameterChange(widget.id, parameterValues);
    }
    
    if (onRefreshWidget) {
      onRefreshWidget(widget.id);
    }
  };

  const handleLoadPreset = (preset) => {
    setParameterValues(preset.values);
    setShowPresets(false);
  };

  const handleSaveCurrentAsPreset = () => {
    if (onSavePreset) {
      const presetName = prompt('Enter preset name:');
      if (presetName) {
        onSavePreset(widget.id, {
          name: presetName,
          values: parameterValues,
          createdAt: Date.now()
        });
      }
    }
  };

  const renderParameterInput = (param) => {
    const value = parameterValues[param.name] || '';

    switch (param.type) {
      case 'string':
        return (
          <TextField
            fullWidth
            size="small"
            label={param.description || param.name}
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            helperText={param.validation?.pattern ? 'Pattern required' : ''}
            error={validationErrors.some(err => err.includes(param.name))}
          />
        );

      case 'number':
        return (
          <TextField
            fullWidth
            size="small"
            type="number"
            label={param.description || param.name}
            value={value}
            onChange={(e) => handleParameterChange(param.name, Number(e.target.value))}
            inputProps={{
              min: param.validation?.min,
              max: param.validation?.max
            }}
            error={validationErrors.some(err => err.includes(param.name))}
          />
        );

      case 'date':
        return (
          <TextField
            fullWidth
            size="small"
            type="date"
            label={param.description || param.name}
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            InputLabelProps={{ shrink: true }}
            error={validationErrors.some(err => err.includes(param.name))}
          />
        );

      case 'enum':
        return (
          <FormControl fullWidth size="small" error={validationErrors.some(err => err.includes(param.name))}>
            <InputLabel>{param.description || param.name}</InputLabel>
            <Select
              value={value}
              label={param.description || param.name}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
            >
              {param.enumValues?.map(option => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(value)}
                onChange={(e) => handleParameterChange(param.name, e.target.checked)}
              />
            }
            label={param.description || param.name}
          />
        );

      default:
        return (
          <TextField
            fullWidth
            size="small"
            label={param.description || param.name}
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            helperText={`Type: ${param.type}`}
            error={validationErrors.some(err => err.includes(param.name))}
          />
        );
    }
  };

  // Don't render if widget has no parameters
  if (!widget?.query?.parameters || widget.query.parameters.length === 0) {
    return null;
  }

  const hasErrors = validationErrors.length > 0;
  const canApply = !hasErrors && !isValidating;

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        p: 1,
        cursor: compact ? 'pointer' : 'default'
      }}
      onClick={compact ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2">
            Parameters ({widget.query.parameters.length})
          </Typography>
          {hasErrors && (
            <Chip 
              label={`${validationErrors.length} error${validationErrors.length > 1 ? 's' : ''}`}
              size="small" 
              color="error" 
              variant="outlined"
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {presets.length > 0 && (
            <Tooltip title="Load preset">
              <IconButton 
                size="small" 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPresets(!showPresets);
                }}
              >
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          
          <Tooltip title="Save as preset">
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleSaveCurrentAsPreset();
              }}
            >
              <SaveIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Apply and refresh">
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleApplyParameters();
              }}
              disabled={!canApply}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {compact && (
            <IconButton size="small">
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </Box>
      </Box>

      <Collapse in={isExpanded}>
        <CardContent sx={{ pt: 0 }}>
          {/* Preset Selection */}
          {showPresets && presets.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Saved Presets:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {presets.map((preset, index) => (
                  <Chip
                    key={index}
                    label={preset.name}
                    size="small"
                    onClick={() => handleLoadPreset(preset)}
                    clickable
                  />
                ))}
              </Box>
              <Divider sx={{ mt: 1, mb: 2 }} />
            </Box>
          )}

          {/* Parameter Inputs */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {widget.query.parameters.map((param) => (
              <Box key={param.name}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="body2" fontWeight="medium">
                    {param.name}
                  </Typography>
                  <Chip 
                    label={param.type} 
                    size="small" 
                    variant="outlined"
                    color={param.validation?.required ? 'error' : 'default'}
                  />
                  {param.field && (
                    <Chip 
                      label={`Field: ${param.field}`} 
                      size="small" 
                      variant="outlined"
                      color="info"
                    />
                  )}
                </Box>
                {renderParameterInput(param)}
              </Box>
            ))}
          </Box>

          {/* Validation Errors */}
          {hasErrors && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Parameter Errors:
              </Typography>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Apply Button */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleApplyParameters}
              disabled={!canApply}
            >
              Apply & Refresh
            </Button>
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default WidgetParameterPanel;
