import React, { memo, useMemo } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Chip, 
  alpha,
  useTheme
} from '@mui/material';
import { formatValueForDisplay, getDisplayType } from '../../utils/extendedJsonHelpers';

// Helper function to flatten nested objects with simplified field names - memoized
const flattenObject = (obj, prefix = '', depth = 0) => {
  const flattened = [];

  const flatten = (current, currentPrefix, currentDepth, fieldName = '') => {
    if (current === null || current === undefined) {
      flattened.push({
        path: currentPrefix,
        fieldName: fieldName,
        value: current === null ? 'null' : 'undefined',
        type: 'null',
        depth: currentDepth
      });
      return;
    }

    if (typeof current === 'object' && !Array.isArray(current)) {
      // Check for Extended JSON types first (before treating as regular object)
      const displayValue = formatValueForDisplay(current);
      const displayType = getDisplayType(current);
      
      if (displayValue !== current) {
        // This is Extended JSON - display as a formatted value
        flattened.push({
          path: currentPrefix,
          fieldName: fieldName,
          value: displayValue,
          type: displayType,
          depth: currentDepth
        });
        return;
      }
      
      // Handle regular objects
      if (Object.keys(current).length === 0) {
        flattened.push({
          path: currentPrefix,
          fieldName: fieldName,
          value: '{}',
          type: 'empty-object',
          depth: currentDepth
        });
      } else {
        // If this is an object with a field name, show the field name first
        if (fieldName) {
          flattened.push({
            path: currentPrefix,
            fieldName: fieldName,
            value: '',
            type: 'object-header',
            depth: currentDepth
          });
        }
        
        Object.entries(current).forEach(([key, value]) => {
          const newPrefix = currentPrefix ? `${currentPrefix}.${key}` : key;
          flatten(value, newPrefix, currentDepth + (fieldName ? 1 : 0), key);
        });
      }
    } else if (Array.isArray(current)) {
      // Handle arrays - recursively flatten each element
      if (current.length === 0) {
        flattened.push({
          path: currentPrefix,
          fieldName: fieldName,
          value: '[]',
          type: 'empty-array',
          depth: currentDepth
        });
      } else {
        // Add array header
        flattened.push({
          path: currentPrefix,
          fieldName: fieldName,
          value: `[${current.length} items]`,
          type: 'array-header',
          depth: currentDepth
        });
        
        // Check if array contains only primitive values
        const hasPrimitiveItems = current.every(item => 
          typeof item !== 'object' || item === null
        );

        // Recursively flatten each array element
        current.forEach((item, index) => {
          const arrayPrefix = `${currentPrefix}[${index}]`;
          
          // Add separator for object array items (except first one)
          if (index > 0 && !hasPrimitiveItems) {
            flattened.push({
              path: `${arrayPrefix}_separator`,
              fieldName: '',
              value: '',
              type: 'array-separator',
              depth: currentDepth + 1
            });
          }
          
          // Flatten the item's contents without array index prefix
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            // For objects, flatten each property
            Object.entries(item).forEach(([key, value]) => {
              const newPrefix = `${arrayPrefix}.${key}`;
              flatten(value, newPrefix, currentDepth + 1, key);
            });
          } else {
            // For primitive values, show directly without field name
            const formatted = formatValueForDisplay(item);
            let displayValue = typeof formatted === 'string' ? formatted : String(item);
            let valueType = getDisplayType(item);

            // Handle special display cases
            if (item === '') {
              displayValue = "''";
            } else if (item === false) {
              displayValue = 'false';
            } else if (item === 0) {
              displayValue = '0';
            } else if (item === null) {
              displayValue = 'null';
              valueType = 'null';
            } else if (item === undefined) {
              displayValue = 'undefined';
              valueType = 'null';
            }

            flattened.push({
              path: arrayPrefix,
              fieldName: '', // No field name for primitive array items
              value: displayValue,
              type: valueType,
              depth: currentDepth + 1,
              isPrimitiveArrayItem: true // Flag to identify primitive array items
            });
          }
        });
      }
    } else {
      // Handle primitive values
      const formatted = formatValueForDisplay(current);
      let displayValue = typeof formatted === 'string' ? formatted : String(current);
      let valueType = getDisplayType(current);

      // Handle special display cases
      if (current === '') {
        displayValue = "''";
      } else if (current === false) {
        displayValue = 'false';
      } else if (current === 0) {
        displayValue = '0';
      }

      flattened.push({
        path: currentPrefix,
        fieldName: fieldName,
        value: displayValue,
        type: valueType,
        depth: currentDepth
      });
    }
  };

  flatten(obj, prefix, depth);
  return flattened;
};

const QueryResultTreeView = memo(({
  processedData,
  currentPageItems,
  page,
  handleContextMenu,
  onDocumentClick
}) => {
  const theme = useTheme();
  
  // Helper function to render values with composite coloring for ObjectId and ISODate
  const renderValueWithCompositeColor = (value, type, variant = 'body2', sxOverrides = {}) => {
    const baseStyle = {
      fontFamily: 'monospace',
      fontSize: variant === 'h6' ? '1.25rem' : '0.8rem',
      wordBreak: 'break-word',
      ...sxOverrides
    };

    // Check if value is ObjectId(...) or ISODate(...)
    const objectIdMatch = typeof value === 'string' && value.match(/^ObjectId\("([^"]+)"\)$/);
    const isoDateMatch = typeof value === 'string' && value.match(/^ISODate\("([^"]+)"\)$/);
    
    if (objectIdMatch) {
      // Render ObjectId with function name in objectId color, value in string color
      const innerValue = objectIdMatch[1];
      return (
        <Typography variant={variant} component="span" sx={baseStyle}>
          <Box component="span" sx={{ 
            color: theme.palette.syntax.objectId.color,
            fontStyle: theme.palette.syntax.objectId.fontStyle,
            fontWeight: theme.palette.syntax.objectId.fontWeight
          }}>
            ObjectId(&quot;
          </Box>
          <Box component="span" sx={{ 
            color: theme.palette.syntax.string.color,
            fontStyle: theme.palette.syntax.string.fontStyle,
            fontWeight: theme.palette.syntax.string.fontWeight
          }}>
            {innerValue}
          </Box>
          <Box component="span" sx={{ 
            color: theme.palette.syntax.objectId.color,
            fontStyle: theme.palette.syntax.objectId.fontStyle,
            fontWeight: theme.palette.syntax.objectId.fontWeight
          }}>
            &quot;)
          </Box>
        </Typography>
      );
    }
    
    if (isoDateMatch) {
      // Render ISODate with function name in date color, value in string color
      const innerValue = isoDateMatch[1];
      return (
        <Typography variant={variant} component="span" sx={baseStyle}>
          <Box component="span" sx={{ 
            color: theme.palette.syntax.date.color,
            fontStyle: theme.palette.syntax.date.fontStyle,
            fontWeight: theme.palette.syntax.date.fontWeight
          }}>
            ISODate(&quot;
          </Box>
          <Box component="span" sx={{ 
            color: theme.palette.syntax.string.color,
            fontStyle: theme.palette.syntax.string.fontStyle,
            fontWeight: theme.palette.syntax.string.fontWeight
          }}>
            {innerValue}
          </Box>
          <Box component="span" sx={{ 
            color: theme.palette.syntax.date.color,
            fontStyle: theme.palette.syntax.date.fontStyle,
            fontWeight: theme.palette.syntax.date.fontWeight
          }}>
            &quot;)
          </Box>
        </Typography>
      );
    }
    
    // Default: render with single color based on type
    return (
      <Typography
        variant={variant}
        sx={{
          ...baseStyle,
          color: theme.palette.syntax.getColor(type),
          fontStyle: theme.palette.syntax[type]?.fontStyle || 'normal',
          fontWeight: theme.palette.syntax[type]?.fontWeight || 'normal'
        }}
      >
        {value}
      </Typography>
    );
  };
  
  // Memoize flattened data to prevent expensive recomputation
  const flattenedData = useMemo(() => {
    return currentPageItems?.map(({ doc, originalIndex }) => ({
      doc,
      originalIndex,
      flattenedFields: flattenObject(doc)
    }));
  }, [currentPageItems]);

  if (processedData.isEmpty) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          {page > 0 ? `No documents on page ${page + 1}` : 'No data to display'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 'fit-content' }}>
      {flattenedData.map(({ doc, originalIndex, flattenedFields }, idx) => {
        return (
          <Paper
            key={originalIndex}
            elevation={1}
            sx={{ 
              border: 1, 
              borderColor: 'divider', 
              position: 'relative', 
              cursor: 'pointer'
            }}
            onClick={() => onDocumentClick?.(doc, originalIndex)}
            onContextMenu={(event) => handleContextMenu(event, originalIndex)}
          >
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {flattenedFields.map((field, fieldIndex) => {
                  // Handle array separators with spacing
                  if (field.type === 'array-separator') {
                    return (
                      <Box 
                        key={fieldIndex}
                        sx={{ height: '12px' }} // Just empty space for separation
                      />
                    );
                  }

                  // Handle array headers with chips
                  if (field.type === 'array-header') {
                    // Check if this array contains a single number only
                    const hasOnlyOneNumber = flattenedFields.length === 2 && // array header + single item
                                            flattenedFields.some(f => f.isPrimitiveArrayItem && f.type === 'number');
                    
                    // Hide array header if it's just a single number
                    if (hasOnlyOneNumber) {
                      return null;
                    }
                    
                    return (
                      <Box
                        key={fieldIndex}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          py: 0.5,
                          pl: field.depth * 3,
                          mb: 0.5
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: 'text.primary',
                            minWidth: '120px',
                            flexShrink: 0
                          }}
                        >
                          {field.fieldName || field.path}:
                        </Typography>
                        <Chip
                          label={field.value}
                          size="small"
                          variant="outlined"
                          color="primary"
                          sx={{
                            fontSize: '0.7rem',
                            height: '20px',
                            fontFamily: 'monospace'
                          }}
                        />
                      </Box>
                    );
                  }

                  // Handle object headers (nested object field names)
                  if (field.type === 'object-header') {
                    return (
                      <Box
                        key={fieldIndex}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          py: 0.5,
                          pl: field.depth * 3,
                          mb: 0.5
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'text.primary',
                            minWidth: '120px',
                            flexShrink: 0
                          }}
                        >
                          {field.fieldName}:
                        </Typography>
                      </Box>
                    );
                  }

                  // Handle primitive array items differently
                  if (field.isPrimitiveArrayItem) {
                    // Check if this is a single number in the entire document
                    const isSingleNumber = flattenedFields.length === 2 && // array header + single item
                                          field.type === 'number' &&
                                          flattenedFields.filter(f => f.type !== 'array-header').length === 1;
                    
                    return (
                      <Box
                        key={fieldIndex}
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: isSingleNumber ? 'center' : 'flex-start',
                          py: 0.2,
                          pl: isSingleNumber ? 0 : field.depth * 3
                        }}
                      >
                        {renderValueWithCompositeColor(field.value, field.type, 'body2')}
                      </Box>
                    );
                  }

                  // Check if this is a single wrapped primitive value (e.g., { value: 42 })
                  const isSingleWrappedValue = flattenedFields.length === 1 && 
                                              field.fieldName === 'value' &&
                                              field.depth === 0;
                  
                  if (isSingleWrappedValue) {
                    // Special rendering for single primitive values - centered, no field name
                    return (
                      <Box
                        key={fieldIndex}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          py: 2,
                          width: '100%'
                        }}
                      >
                        {renderValueWithCompositeColor(field.value, field.type, 'h6', { fontWeight: 600 })}
                      </Box>
                    );
                  }
                  
                  return (
                    <Box
                      key={fieldIndex}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        py: 0.3,
                        pl: field.depth * 3
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: theme.palette.syntax.key.color,
                          fontWeight: theme.palette.syntax.key.fontWeight,
                          minWidth: '120px',
                          flexShrink: 0
                        }}
                      >
                        {field.fieldName || field.path}:
                      </Typography>
                      {renderValueWithCompositeColor(field.value, field.type, 'body2')}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
});

QueryResultTreeView.displayName = 'QueryResultTreeView';

export default QueryResultTreeView;