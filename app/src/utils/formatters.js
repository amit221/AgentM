export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch (_) {
    return String(timestamp);
  }
}

export function formatResultsSummary(results) {
  if (!results) return 'No results';
  if (typeof results.count === 'number') return `${results.count} documents`;
  if (Array.isArray(results.documents)) return `${results.documents.length} documents`;
  return 'Results available';
}

/**
 * Format numbers with appropriate locale and style
 */
export function formatNumber(value, options = {}) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  
  const { style = 'decimal', currency = 'USD', ...intlOptions } = options;
  
  return new Intl.NumberFormat('en-US', {
    style,
    currency: style === 'currency' ? currency : undefined,
    ...intlOptions
  }).format(value);
}

/**
 * Format numbers based on detected format type (for charts)
 */
export function formatChartNumber(value, format) {
  if (typeof value !== 'number' || isNaN(value)) return 'N/A';
  
  switch (format) {
    case 'currency':
      return formatNumber(value, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    
    case 'percentage':
      return formatNumber(value / 100, { style: 'percent' });
    
    case 'millions':
      return `${formatNumber(value / 1000000, { maximumFractionDigits: 1 })}M`;
    
    case 'thousands':
      return `${formatNumber(value / 1000, { maximumFractionDigits: 1 })}K`;
    
    default:
      return formatNumber(value);
  }
}

/**
 * Format field names for display (capitalize, handle underscores)
 */
export function formatFieldName(fieldName) {
  if (!fieldName) return '';
  if (fieldName === '_id') return 'Category';
  
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/_/g, ' ');
}


