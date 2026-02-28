import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Collapse,
  IconButton,
  Tooltip,
  Alert
} from '@mui/material';
import {
  FilterList as FilterIcon,
  DateRange as DateRangeIcon,
  Schedule as ScheduleIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Clear as ClearIcon
} from '@mui/icons-material';

/**
 * Dashboard-level quick filters for common parameter types
 */
const DashboardQuickFilters = ({ 
  widgets, 
  onBulkParameterUpdate,
  onRefreshWidgets 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');

  // Analyze widgets to find common parameter types
  const parameterAnalysis = useMemo(() => {
    const dateWidgets = [];
    const regionWidgets = [];
    const allRegions = new Set();

    Object.entries(widgets || {}).forEach(([widgetId, widget]) => {
      if (!widget.query?.parameters) return;

      widget.query.parameters.forEach(param => {
        if (param.type === 'date') {
          dateWidgets.push({ widgetId, paramName: param.name, widget });
        }
        
        if (param.type === 'enum' && 
            (param.name.toLowerCase().includes('region') || 
             param.name.toLowerCase().includes('location') ||
             param.name.toLowerCase().includes('area'))) {
          regionWidgets.push({ widgetId, paramName: param.name, widget });
          param.enumValues?.forEach(value => allRegions.add(value));
        }
      });
    });

    return {
      dateWidgets,
      regionWidgets,
      regions: Array.from(allRegions)
    };
  }, [widgets]);

  const dateRangePresets = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7days' },
    { label: 'Last 30 Days', value: 'last30days' },
    { label: 'This Month', value: 'thisMonth' },
    { label: 'Last Month', value: 'lastMonth' },
    { label: 'This Quarter', value: 'thisQuarter' },
    { label: 'This Year', value: 'thisYear' },
    { label: 'Custom Range', value: 'custom' }
  ];

  const calculateDateRange = (preset) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (preset) {
      case 'today':
        return {
          start: today.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          start: yesterday.toISOString().split('T')[0],
          end: yesterday.toISOString().split('T')[0]
        };
      
      case 'last7days':
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        return {
          start: last7.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      
      case 'last30days':
        const last30 = new Date(today);
        last30.setDate(last30.getDate() - 30);
        return {
          start: last30.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      
      case 'thisMonth':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          start: monthStart.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      
      case 'lastMonth':
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
          start: lastMonthStart.toISOString().split('T')[0],
          end: lastMonthEnd.toISOString().split('T')[0]
        };
      
      case 'thisQuarter':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        return {
          start: quarterStart.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      
      case 'thisYear':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return {
          start: yearStart.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        };
      
      case 'custom':
        return {
          start: customStartDate,
          end: customEndDate
        };
      
      default:
        return null;
    }
  };

  const handleDateRangeApply = () => {
    const dateRange = calculateDateRange(selectedDateRange);
    if (!dateRange || !dateRange.start || !dateRange.end) return;

    const updates = {};
    parameterAnalysis.dateWidgets.forEach(({ widgetId, paramName }) => {
      if (!updates[widgetId]) updates[widgetId] = {};
      
      // Handle different date parameter naming patterns
      if (paramName.toLowerCase().includes('start') || paramName.toLowerCase().includes('from')) {
        updates[widgetId][paramName] = dateRange.start;
      } else if (paramName.toLowerCase().includes('end') || paramName.toLowerCase().includes('to')) {
        updates[widgetId][paramName] = dateRange.end;
      } else {
        // Single date parameter - use start date
        updates[widgetId][paramName] = dateRange.start;
      }
    });

    if (onBulkParameterUpdate) {
      onBulkParameterUpdate(updates);
    }
  };

  const handleRegionApply = () => {
    if (!selectedRegion) return;

    const updates = {};
    parameterAnalysis.regionWidgets.forEach(({ widgetId, paramName }) => {
      if (!updates[widgetId]) updates[widgetId] = {};
      updates[widgetId][paramName] = selectedRegion;
    });

    if (onBulkParameterUpdate) {
      onBulkParameterUpdate(updates);
    }
  };

  const handleRefreshAll = () => {
    if (onRefreshWidgets) {
      const widgetIds = Object.keys(widgets || {});
      onRefreshWidgets(widgetIds);
    }
  };

  const handleClearFilters = () => {
    setSelectedDateRange('');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedRegion('');
  };

  // Don't render if no common parameters found
  if (parameterAnalysis.dateWidgets.length === 0 && parameterAnalysis.regionWidgets.length === 0) {
    return null;
  }

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        p: 2,
        cursor: 'pointer'
      }}
      onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon color="primary" />
          <Typography variant="h6">
            Quick Filters
          </Typography>
          <Chip 
            label={`${parameterAnalysis.dateWidgets.length + parameterAnalysis.regionWidgets.length} widgets`}
            size="small" 
            variant="outlined"
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Refresh all widgets">
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleRefreshAll();
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Clear all filters">
            <IconButton 
              size="small" 
              onClick={(e) => {
                e.stopPropagation();
                handleClearFilters();
              }}
            >
              <ClearIcon />
            </IconButton>
          </Tooltip>

          <IconButton size="small">
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={isExpanded}>
        <CardContent sx={{ pt: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            
            {/* Date Range Filters */}
            {parameterAnalysis.dateWidgets.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <DateRangeIcon color="primary" />
                  <Typography variant="subtitle1">
                    Date Range
                  </Typography>
                  <Chip 
                    label={`${parameterAnalysis.dateWidgets.length} widgets`}
                    size="small" 
                    variant="outlined"
                    color="primary"
                  />
                </Box>

                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    This will update date parameters in: {parameterAnalysis.dateWidgets.map(w => w.widget.title || 'Untitled').join(', ')}
                  </Typography>
                </Alert>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Date Range Preset</InputLabel>
                    <Select
                      value={selectedDateRange}
                      label="Date Range Preset"
                      onChange={(e) => setSelectedDateRange(e.target.value)}
                    >
                      {dateRangePresets.map(preset => (
                        <MenuItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedDateRange === 'custom' && (
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <TextField
                        size="small"
                        type="date"
                        label="Start Date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        size="small"
                        type="date"
                        label="End Date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                      />
                    </Box>
                  )}

                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleDateRangeApply}
                    disabled={!selectedDateRange || (selectedDateRange === 'custom' && (!customStartDate || !customEndDate))}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Apply Date Range
                  </Button>
                </Box>
              </Box>
            )}

            {/* Region Filters */}
            {parameterAnalysis.regionWidgets.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <FilterIcon color="primary" />
                  <Typography variant="subtitle1">
                    Region/Location
                  </Typography>
                  <Chip 
                    label={`${parameterAnalysis.regionWidgets.length} widgets`}
                    size="small" 
                    variant="outlined"
                    color="primary"
                  />
                </Box>

                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    This will update region parameters in: {parameterAnalysis.regionWidgets.map(w => w.widget.title || 'Untitled').join(', ')}
                  </Typography>
                </Alert>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Region</InputLabel>
                    <Select
                      value={selectedRegion}
                      label="Region"
                      onChange={(e) => setSelectedRegion(e.target.value)}
                    >
                      {parameterAnalysis.regions.map(region => (
                        <MenuItem key={region} value={region}>
                          {region}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleRegionApply}
                    disabled={!selectedRegion}
                  >
                    Apply Region
                  </Button>
                </Box>
              </Box>
            )}

          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default DashboardQuickFilters;
