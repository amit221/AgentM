/**
 * Type definitions and configurations for dashboard widgets
 */

/**
 * Widget types supported by the dashboard system
 */
export const WIDGET_TYPES = {
  CHART: 'chart',
  SUMMARY: 'summary', 
  TABLE: 'table'
};

/**
 * Chart widget subtypes
 */
export const CHART_SUBTYPES = {
  SUMMARY: 'summary',
  BAR: 'bar',
  LINE: 'line', 
  PIE: 'pie',
  MULTI_BAR: 'multi-bar',
  MULTI_LINE: 'multi-line',
  AREA: 'area',
  STACKED_AREA: 'stacked-area',
  SCATTER: 'scatter',
  DONUT: 'donut',
  MAP: 'map'
};

/**
 * Widget refresh intervals (in milliseconds)
 */
export const REFRESH_INTERVALS = {
  NEVER: 0,
  THIRTY_SECONDS: 30000,
  ONE_MINUTE: 60000,
  FIVE_MINUTES: 300000,
  FIFTEEN_MINUTES: 900000,
  THIRTY_MINUTES: 1800000,
  ONE_HOUR: 3600000
};

/**
 * Default configurations for different widget types
 */
export const WIDGET_DEFAULTS = {
  [WIDGET_TYPES.CHART]: {
    type: WIDGET_TYPES.CHART,
    title: 'Chart Widget',
    description: '',
    size: 'MEDIUM', // Consistent 8×6 size for all charts
    refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
    showTitle: true,
    chartType: CHART_SUBTYPES.BAR
  },
  [WIDGET_TYPES.SUMMARY]: {
    type: WIDGET_TYPES.SUMMARY,
    title: 'Summary Widget', 
    description: '',
    size: 'MEDIUM', // Consistent 8×6 size for summary cards
    refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
    showTitle: true
  },
  [WIDGET_TYPES.TABLE]: {
    type: WIDGET_TYPES.TABLE,
    title: 'Table Widget',
    description: '',
    size: 'LARGE', // Tables still need more space for rows and columns
    refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
    showTitle: true,
    tableConfig: {
      pageSize: 10,
      sortable: true,
      filterable: true
    }
  }
};

/**
 * Generate a unique widget ID
 */
export function generateWidgetId() {
  return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Widget size presets for different screen sizes
 */
export const WIDGET_SIZE_PRESETS = {
  SMALL: {
    lg: { w: 6, h: 4 },    // Compact for small widgets
    md: { w: 5, h: 4 },
    sm: { w: 3, h: 4 },    // Half width on small screens
    xs: { w: 4, h: 4 }     // Use all 4 available columns
  },
  MEDIUM: {
    lg: { w: 8, h: 6 },    // Default size for all chart types (8×6)
    md: { w: 8, h: 6 },
    sm: { w: 6, h: 6 },    // Use all 6 available columns
    xs: { w: 4, h: 6 }     // Use all 4 available columns
  },
  LARGE: {
    lg: { w: 12, h: 8 },   // For tables and complex widgets - full width
    md: { w: 10, h: 8 },   // Use all 10 available columns
    sm: { w: 6, h: 8 },    // Use all 6 available columns
    xs: { w: 4, h: 8 }     // Use all 4 available columns
  },
  EXTRA_LARGE: {
    lg: { w: 12, h: 12 },  // For very complex widgets
    md: { w: 10, h: 12 },  // Use all 10 available columns
    sm: { w: 6, h: 12 },   // Use all 6 available columns
    xs: { w: 4, h: 12 }    // Use all 4 available columns
  }
};


/**
 * Grid layout breakpoints (matches react-grid-layout)
 */
export const GRID_BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480
};

/**
 * Grid columns for each breakpoint
 */
export const GRID_COLUMNS = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4
};


/**
 * Widget status types
 */
export const WIDGET_STATUS = {
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  STALE: 'stale'
};

/**
 * Determines appropriate widget size based on chart type
 */
export function getDefaultSizeForChartType(chartType) {
  // All chart types now use MEDIUM size (8×6) for consistency
  // Users can still resize widgets manually if needed
  return 'MEDIUM';
}

/**
 * Creates a new widget configuration
 */
export function createWidgetConfig(type, overrides = {}) {
  const defaults = WIDGET_DEFAULTS[type];
  if (!defaults) {
    throw new Error(`Unknown widget type: ${type}`);
  }

  // Determine appropriate size based on chart type if not explicitly provided
  let widgetSize = overrides.size || defaults.size;
  
  // Auto-size based on chart type for better defaults
  if (!overrides.size && overrides.chartType) {
    widgetSize = getDefaultSizeForChartType(overrides.chartType);
  }

  const sizePreset = WIDGET_SIZE_PRESETS[widgetSize];
  
  return {
    ...defaults,
    ...overrides,
    size: widgetSize,
    id: overrides.id || generateWidgetId(),
    createdAt: Date.now(),
    lastUpdated: null,
    status: WIDGET_STATUS.LOADING,
    defaultWidth: sizePreset.lg.w,
    defaultHeight: sizePreset.lg.h,
    sizePresets: sizePreset
  };
}

/**
 * Creates a layout item for a widget
 */
export function createLayoutItem(widgetId, widget, position = {}) {
  const sizePreset = widget.sizePresets || WIDGET_SIZE_PRESETS.MEDIUM;
  
  return {
    lg: {
      i: widgetId,
      x: position.x || 0,
      y: position.y || 0,
      w: sizePreset.lg.w,
      h: sizePreset.lg.h,
      minW: 3,
      minH: 3,
      maxW: Infinity,
      maxH: Infinity
    },
    md: {
      i: widgetId,
      x: position.x || 0,
      y: position.y || 0,
      w: sizePreset.md.w,
      h: sizePreset.md.h,
      minW: 3,
      minH: 3,
      maxW: Infinity,
      maxH: Infinity
    },
    sm: {
      i: widgetId,
      x: position.x || 0,
      y: position.y || 0,
      w: sizePreset.sm.w,
      h: sizePreset.sm.h,
      minW: 3,
      minH: 3,
      maxW: Infinity,
      maxH: Infinity
    },
    xs: {
      i: widgetId,
      x: position.x || 0,
      y: position.y || 0,
      w: sizePreset.xs.w,
      h: sizePreset.xs.h,
      minW: 3,
      minH: 3,
      maxW: Infinity,
      maxH: Infinity
    }
  };
}


/**
 * Validates widget configuration
 */
export function validateWidgetConfig(widget) {
  const errors = [];

  if (!widget.type || !Object.values(WIDGET_TYPES).includes(widget.type)) {
    errors.push('Invalid widget type');
  }

  if (!widget.title || typeof widget.title !== 'string') {
    errors.push('Widget title is required');
  }

  // Handle both new format (string) and old format (object with template)
  const hasValidQuery = widget.query && (
    typeof widget.query === 'string' || 
    (typeof widget.query === 'object' && widget.query.template)
  );
  
  if (!hasValidQuery) {
    errors.push('Widget query is required');
  }

  // Validate connection binding (new widgets should have this)
  if (!widget.connectionString && !widget.connectionId) {
    errors.push('Widget must be bound to a database connection');
  }

  if (!widget.database) {
    errors.push('Widget database is required');
  }

  // databaseType is optional but defaults to mongodb for backward compatibility
  if (widget.databaseType && !['mongodb', 'postgresql'].includes(widget.databaseType)) {
    errors.push('Invalid database type (must be mongodb or postgresql)');
  }

  if (widget.refreshInterval && typeof widget.refreshInterval !== 'number') {
    errors.push('Refresh interval must be a number');
  }

  // Type-specific validations
  switch (widget.type) {
    case WIDGET_TYPES.CHART:
    case WIDGET_TYPES.SUMMARY:
      if (!widget.chartType || !Object.values(CHART_SUBTYPES).includes(widget.chartType)) {
        errors.push('Invalid chart type');
      }
      
      // Chart widgets MUST have pre-stored chart analysis
      if (!widget.chartConfig?.chartAnalysis) {
        errors.push('Chart widgets must have pre-stored chart analysis');
      }
      break;
    
    case WIDGET_TYPES.TABLE:
      // Table widgets don't need chart analysis
      if (widget.tableConfig?.pageSize && widget.tableConfig.pageSize < 1) {
        errors.push('Table page size must be greater than 0');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Gets the display name for a widget type
 */
export function getWidgetTypeDisplayName(type) {
  const displayNames = {
    [WIDGET_TYPES.CHART]: 'Chart',
    [WIDGET_TYPES.SUMMARY]: 'Summary Cards',
    [WIDGET_TYPES.TABLE]: 'Data Table'
  };
  
  return displayNames[type] || type;
}

/**
 * Gets the display name for a chart subtype
 */
export function getChartTypeDisplayName(chartType) {
  const displayNames = {
    [CHART_SUBTYPES.SUMMARY]: 'Summary Cards',
    [CHART_SUBTYPES.BAR]: 'Bar Chart',
    [CHART_SUBTYPES.LINE]: 'Line Chart',
    [CHART_SUBTYPES.PIE]: 'Pie Chart',
    [CHART_SUBTYPES.MULTI_BAR]: 'Multi-Bar Chart',
    [CHART_SUBTYPES.MULTI_LINE]: 'Multi-Line Chart',
    [CHART_SUBTYPES.AREA]: 'Area Chart',
    [CHART_SUBTYPES.STACKED_AREA]: 'Stacked Area Chart',
    [CHART_SUBTYPES.SCATTER]: 'Scatter Plot',
    [CHART_SUBTYPES.DONUT]: 'Donut Chart',
    [CHART_SUBTYPES.MAP]: 'Map'
  };
  
  return displayNames[chartType] || chartType;
}

/**
 * Gets the display name for a refresh interval
 */
export function getRefreshIntervalDisplayName(interval) {
  const displayNames = {
    [REFRESH_INTERVALS.NEVER]: 'Never',
    [REFRESH_INTERVALS.THIRTY_SECONDS]: '30 seconds',
    [REFRESH_INTERVALS.ONE_MINUTE]: '1 minute',
    [REFRESH_INTERVALS.FIVE_MINUTES]: '5 minutes',
    [REFRESH_INTERVALS.FIFTEEN_MINUTES]: '15 minutes',
    [REFRESH_INTERVALS.THIRTY_MINUTES]: '30 minutes',
    [REFRESH_INTERVALS.ONE_HOUR]: '1 hour'
  };
  
  return displayNames[interval] || `${interval}ms`;
}

/**
 * Chart type options with descriptions for UI components
 */
export const CHART_TYPE_OPTIONS = [
  {
    value: CHART_SUBTYPES.BAR,
    label: 'Bar Chart',
    description: 'Compare values across categories'
  },
  {
    value: CHART_SUBTYPES.LINE,
    label: 'Line Chart',
    description: 'Show trends over time'
  },
  {
    value: CHART_SUBTYPES.PIE,
    label: 'Pie Chart',
    description: 'Show proportions of a whole'
  },
  {
    value: CHART_SUBTYPES.SUMMARY,
    label: 'Summary Cards',
    description: 'Display key metrics'
  },
  {
    value: CHART_SUBTYPES.MULTI_BAR,
    label: 'Multi-Bar Chart',
    description: 'Compare multiple series'
  },
  {
    value: CHART_SUBTYPES.MULTI_LINE,
    label: 'Multi-Line Chart',
    description: 'Multiple trend lines'
  },
  {
    value: CHART_SUBTYPES.AREA,
    label: 'Area Chart',
    description: 'Show trends with filled area'
  },
  {
    value: CHART_SUBTYPES.STACKED_AREA,
    label: 'Stacked Area Chart',
    description: 'Show cumulative trends'
  },
  {
    value: CHART_SUBTYPES.SCATTER,
    label: 'Scatter Plot',
    description: 'Show correlation between two variables'
  },
  {
    value: CHART_SUBTYPES.DONUT,
    label: 'Donut Chart',
    description: 'Proportions with center space'
  },
  {
    value: CHART_SUBTYPES.MAP,
    label: 'Map',
    description: 'Geographic data visualization'
  }
];

/**
 * Refresh interval options for UI components
 */
export const REFRESH_INTERVAL_OPTIONS = [
  { value: REFRESH_INTERVALS.NEVER, label: 'Manual only' },
  { value: REFRESH_INTERVALS.THIRTY_SECONDS, label: '30 seconds' },
  { value: REFRESH_INTERVALS.ONE_MINUTE, label: '1 minute' },
  { value: REFRESH_INTERVALS.FIVE_MINUTES, label: '5 minutes' },
  { value: REFRESH_INTERVALS.FIFTEEN_MINUTES, label: '15 minutes' },
  { value: REFRESH_INTERVALS.ONE_HOUR, label: '1 hour' }
];

