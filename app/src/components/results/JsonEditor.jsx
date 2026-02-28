import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box, useTheme, IconButton, Typography, Tooltip } from '@mui/material';
import { FormatAlignLeft as FormatIcon } from '@mui/icons-material';

/**
 * Syntax-highlighted JSON editor component
 * Provides a textarea overlay for editing with live syntax highlighting and error detection
 */
const JsonEditor = ({ value, onChange, disabled = false, onValidationChange, originalValue, sx = {} }) => {
  const theme = useTheme();
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Extract date fields from original value
  const originalDateFields = useMemo(() => {
    if (!originalValue) return new Set();
    
    try {
      const parsed = JSON.parse(originalValue);
      const dateFields = new Set();
      
      const findDateFields = (obj, path = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              dateFields.add(currentPath);
            }
          } else if (typeof value === 'object' && value !== null) {
            findDateFields(value, currentPath);
          }
        }
      };
      
      findDateFields(parsed);
      return dateFields;
    } catch {
      return new Set();
    }
  }, [originalValue]);

  // Validate JSON and detect errors including date field issues
  const jsonValidation = useMemo(() => {
    if (!value || value.trim() === '') {
      return { isValid: false, error: 'JSON cannot be empty', line: null, column: null, warnings: [] };
    }
    
    try {
      const warnings = [];
      
      // Validate all ISODate() calls in the JSON before parsing
      const isoDateRegex = /ISODate\("([^"]+)"\)/g;
      let isoDateMatch;
      while ((isoDateMatch = isoDateRegex.exec(value)) !== null) {
        const dateStr = isoDateMatch[1];
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          warnings.push(`Invalid date: ISODate("${dateStr}")`);
        }
      }
      
      // Validate all ObjectId() calls in the JSON before parsing
      const objectIdRegex = /ObjectId\("([^"]+)"\)/g;
      let objectIdMatch;
      while ((objectIdMatch = objectIdRegex.exec(value)) !== null) {
        const oidStr = objectIdMatch[1];
        if (!/^[0-9a-fA-F]{24}$/.test(oidStr)) {
          warnings.push(`Invalid ObjectId: ObjectId("${oidStr}") - must be 24 hex characters`);
        }
      }
      
      // Convert ISODate() and ObjectId() back to strings or Extended JSON for validation
      const valueForValidation = value
        .replace(/ISODate\("([^"]+)"\)/g, '"$1"')
        .replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
      const parsed = JSON.parse(valueForValidation);
      
      // Validate all Extended JSON dates: { "$date": "..." }
      const validateExtendedJsonDates = (obj, path = '') => {
        if (!obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            validateExtendedJsonDates(item, `${path}[${index}]`);
          });
        } else {
          // Check if this is an Extended JSON date object
          if (obj.$date && typeof obj.$date === 'string') {
            const dateStr = obj.$date;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
              const fieldPath = path || 'root';
              warnings.push(`Invalid Extended JSON date at ${fieldPath}: { "$date": "${dateStr}" }`);
            }
          }
          
          // Check if this is an Extended JSON ObjectId object
          if (obj.$oid && typeof obj.$oid === 'string') {
            const oidStr = obj.$oid;
            if (!/^[0-9a-fA-F]{24}$/.test(oidStr)) {
              const fieldPath = path || 'root';
              warnings.push(`Invalid Extended JSON ObjectId at ${fieldPath}: { "$oid": "${oidStr}" } - must be 24 hex characters`);
            }
          }
          
          // Recursively check nested objects
          for (const [key, value] of Object.entries(obj)) {
            if (key !== '$date' && key !== '$oid' && typeof value === 'object' && value !== null) {
              const newPath = path ? `${path}.${key}` : key;
              validateExtendedJsonDates(value, newPath);
            }
          }
        }
      };
      
      validateExtendedJsonDates(parsed);
      
      // Check if any original date fields are now invalid or missing
      if (originalDateFields.size > 0) {
        const checkDateFields = (obj, path = '') => {
          if (!obj || typeof obj !== 'object') return;
          
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (originalDateFields.has(currentPath)) {
              // This field was originally a date - check if it's still a valid date
              // Handle both plain strings and Extended JSON format
              if (typeof value === 'object' && value !== null && value.$date) {
                // Extended JSON format - validate the date string
                const dateStr = value.$date;
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) {
                  warnings.push(`"${currentPath}" has invalid date in Extended JSON format`);
                }
              } else if (typeof value !== 'string') {
                warnings.push(`"${currentPath}" was a date field but is now ${typeof value}`);
              } else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)) {
                warnings.push(`"${currentPath}" is no longer a valid ISO date format`);
              } else {
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                  warnings.push(`"${currentPath}" is not a valid date`);
                }
              }
            } else if (typeof value === 'object' && value !== null) {
              checkDateFields(value, currentPath);
            }
          }
        };
        
        // Check for missing date fields
        for (const datePath of originalDateFields) {
          const pathParts = datePath.split('.');
          let current = parsed;
          let found = true;
          
          for (const part of pathParts) {
            if (current && typeof current === 'object' && part in current) {
              current = current[part];
            } else {
              found = false;
              break;
            }
          }
          
          if (!found) {
            warnings.push(`Date field "${datePath}" has been removed`);
          }
        }
        
        checkDateFields(parsed);
      }
      
      return { isValid: true, error: null, line: null, column: null, warnings };
    } catch (error) {
      // Try to extract position information
      const match = error.message.match(/position (\d+)/);
      if (match) {
        const position = parseInt(match[1], 10);
        const lines = value.substring(0, position).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        return { 
          isValid: false, 
          error: error.message,
          line,
          column,
          warnings: []
        };
      }
      return { 
        isValid: false, 
        error: error.message,
        line: null,
        column: null,
        warnings: []
      };
    }
  }, [value, originalDateFields]);

  // Notify parent of validation changes
  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(jsonValidation);
    }
  }, [jsonValidation, onValidationChange]);

  // Auto-format JSON
  const handleFormat = () => {
    if (disabled) return;
    
    try {
      // Convert ISODate() and ObjectId() to strings for parsing
      const valueForParsing = value
        .replace(/ISODate\("([^"]+)"\)/g, '"__ISODATE__$1__ISODATE__"')
        .replace(/ObjectId\("([^"]+)"\)/g, '"__OBJECTID__$1__OBJECTID__"');
      const parsed = JSON.parse(valueForParsing);
      let formatted = JSON.stringify(parsed, null, 2);
      // Convert back to ISODate() and ObjectId()
      formatted = formatted
        .replace(/"__ISODATE__([^"]+)__ISODATE__"/g, 'ISODate("$1")')
        .replace(/"__OBJECTID__([^"]+)__OBJECTID__"/g, 'ObjectId("$1")');
      onChange({ target: { value: formatted } });
    } catch (error) {
      // If parsing fails, do nothing (error will be shown)
    }
  };

  // Sync scroll between textarea and highlight layer
  const handleScroll = (e) => {
    const target = e.target;
    setScrollTop(target.scrollTop);
    setScrollLeft(target.scrollLeft);
    if (highlightRef.current) {
      highlightRef.current.scrollTop = target.scrollTop;
      highlightRef.current.scrollLeft = target.scrollLeft;
    }
  };

  // Apply syntax highlighting to the text
  const highlightSyntax = (text) => {
    if (!text) return <span>&nbsp;</span>;

    const lines = text.split('\n');
    const errorLine = jsonValidation.line;
    
    return lines.map((line, lineIndex) => {
      const parts = [];
      const currentLine = lineIndex + 1;
      const isErrorLine = errorLine && currentLine === errorLine;
      
      // Regex patterns for different JSON elements
      const patterns = [
        // Null
        { 
          regex: /\bnull\b/g, 
          color: theme.palette.syntax.null.color,
          style: { 
            fontStyle: theme.palette.syntax.null.fontStyle,
            fontWeight: theme.palette.syntax.null.fontWeight
          }
        },
        // Boolean
        { 
          regex: /\b(true|false)\b/g, 
          color: theme.palette.syntax.boolean.color,
          style: { 
            fontStyle: theme.palette.syntax.boolean.fontStyle,
            fontWeight: theme.palette.syntax.boolean.fontWeight
          }
        },
        // Numbers
        { 
          regex: /\b-?\d+\.?\d*([eE][+-]?\d+)?\b/g, 
          color: theme.palette.syntax.number.color,
          style: { 
            fontStyle: theme.palette.syntax.number.fontStyle,
            fontWeight: theme.palette.syntax.number.fontWeight
          }
        },
        // ISODate function calls - prioritize first
        // Special handling: function name gets date color, value gets string color
        { 
          regex: /ISODate\("([^"]+)"\)/g, 
          color: theme.palette.syntax.date.color,
          style: { 
            fontStyle: theme.palette.syntax.date.fontStyle,
            fontWeight: theme.palette.syntax.date.fontWeight
          },
          isComposite: true,
          renderComposite: (match) => {
            const fullMatch = match[0];
            const value = match[1];
            const funcName = 'ISODate';
            return [
              { 
                text: funcName + '("',
                color: theme.palette.syntax.date.color,
                style: {
                  fontStyle: theme.palette.syntax.date.fontStyle,
                  fontWeight: theme.palette.syntax.date.fontWeight
                }
              },
              {
                text: value,
                color: theme.palette.syntax.string.color,
                style: {
                  fontStyle: theme.palette.syntax.string.fontStyle,
                  fontWeight: theme.palette.syntax.string.fontWeight
                }
              },
              {
                text: '")',
                color: theme.palette.syntax.date.color,
                style: {
                  fontStyle: theme.palette.syntax.date.fontStyle,
                  fontWeight: theme.palette.syntax.date.fontWeight
                }
              }
            ];
          }
        },
        // ObjectId function calls - prioritize first
        // Special handling: function name gets objectId color, value gets string color
        { 
          regex: /ObjectId\("([^"]+)"\)/g, 
          color: theme.palette.syntax.objectId.color,
          style: { 
            fontStyle: theme.palette.syntax.objectId.fontStyle,
            fontWeight: theme.palette.syntax.objectId.fontWeight
          },
          isComposite: true,
          renderComposite: (match) => {
            const value = match[1];
            const funcName = 'ObjectId';
            return [
              { 
                text: funcName + '("',
                color: theme.palette.syntax.objectId.color,
                style: {
                  fontStyle: theme.palette.syntax.objectId.fontStyle,
                  fontWeight: theme.palette.syntax.objectId.fontWeight
                }
              },
              {
                text: value,
                color: theme.palette.syntax.string.color,
                style: {
                  fontStyle: theme.palette.syntax.string.fontStyle,
                  fontWeight: theme.palette.syntax.string.fontWeight
                }
              },
              {
                text: '")',
                color: theme.palette.syntax.objectId.color,
                style: {
                  fontStyle: theme.palette.syntax.objectId.fontStyle,
                  fontWeight: theme.palette.syntax.objectId.fontWeight
                }
              }
            ];
          }
        },
        // Extended JSON ObjectId: { "$oid": "..." }
        {
          regex: /"\$oid"\s*:\s*"[0-9a-fA-F]{24}"/g,
          color: theme.palette.syntax.objectId.color,
          style: { 
            fontStyle: theme.palette.syntax.objectId.fontStyle,
            fontWeight: theme.palette.syntax.objectId.fontWeight
          }
        },
        // Extended JSON Date: { "$date": "..." }
        {
          regex: /"\$date"\s*:\s*"[^"]+"/g,
          color: theme.palette.syntax.date.color,
          style: { 
            fontStyle: theme.palette.syntax.date.fontStyle,
            fontWeight: theme.palette.syntax.date.fontWeight
          }
        },
        // ISO Date strings (after colon) - prioritize before general strings
        { 
          regex: /:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)"/g, 
          color: theme.palette.syntax.date.color,
          style: { 
            fontStyle: theme.palette.syntax.date.fontStyle,
            fontWeight: theme.palette.syntax.date.fontWeight
          }
        },
        // String values (after colon)
        { 
          regex: /:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, 
          color: theme.palette.syntax.string.color,
          style: { 
            fontStyle: theme.palette.syntax.string.fontStyle,
            fontWeight: theme.palette.syntax.string.fontWeight
          }
        },
        // Object keys
        { 
          regex: /"([^"]+)"(?=\s*:)/g, 
          color: theme.palette.syntax.key.color,
          style: { 
            fontStyle: theme.palette.syntax.key.fontStyle,
            fontWeight: theme.palette.syntax.key.fontWeight
          }
        },
      ];

      // Build an array of matches with their positions
      const matches = [];
      
      patterns.forEach((pattern, patternIndex) => {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match;
        
        while ((match = regex.exec(line)) !== null) {
          matches.push({
            start: match.index,
            end: regex.lastIndex,
            text: match[0],
            color: pattern.color,
            style: pattern.style,
            priority: patternIndex,
            isComposite: pattern.isComposite,
            renderComposite: pattern.renderComposite,
            match: match
          });
        }
      });

      // Sort matches by position, then by priority
      matches.sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return a.priority - b.priority;
      });

      // Remove overlapping matches
      const nonOverlapping = [];
      let lastEnd = 0;
      
      for (const match of matches) {
        if (match.start >= lastEnd) {
          nonOverlapping.push(match);
          lastEnd = match.end;
        }
      }

      // Build the colored line
      let position = 0;
      
      nonOverlapping.forEach((match, matchIndex) => {
        // Add text before this match
        if (match.start > position) {
          parts.push(
            <span key={`text-${lineIndex}-${matchIndex}`} style={{ color: theme.palette.text.secondary }}>
              {line.substring(position, match.start)}
            </span>
          );
        }
        
        // Add the colored match - handle composite patterns
        if (match.isComposite && match.renderComposite) {
          const compositeParts = match.renderComposite(match.match);
          compositeParts.forEach((part, partIndex) => {
            parts.push(
              <span 
                key={`match-${lineIndex}-${matchIndex}-${partIndex}`}
                style={{ 
                  color: part.color,
                  ...part.style
                }}
              >
                {part.text}
              </span>
            );
          });
        } else {
          parts.push(
            <span 
              key={`match-${lineIndex}-${matchIndex}`}
              style={{ 
                color: match.color,
                ...match.style
              }}
            >
              {match.text}
            </span>
          );
        }
        
        position = match.end;
      });

      // Add remaining text
      if (position < line.length) {
        parts.push(
          <span key={`end-${lineIndex}`} style={{ color: theme.palette.text.secondary }}>
            {line.substring(position)}
          </span>
        );
      }

      // If line is empty, add a space to maintain line height
      if (parts.length === 0) {
        parts.push(<span key={`empty-${lineIndex}`}>&nbsp;</span>);
      }

      return (
        <div 
          key={lineIndex}
          style={{
            backgroundColor: isErrorLine ? theme.palette.error.main + '20' : 'transparent',
            borderLeft: isErrorLine ? `3px solid ${theme.palette.error.main}` : 'none',
            paddingLeft: isErrorLine ? '8px' : '0',
            marginLeft: isErrorLine ? '-8px' : '0'
          }}
        >
          {parts}
        </div>
      );
    });
  };

  return (
    <Box sx={{ width: '100%', ...sx }}>
      {/* Toolbar */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 1,
        gap: 1
      }}>
        <Box sx={{ flex: 1 }}>
          {!jsonValidation.isValid && (
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'error.main',
                fontFamily: 'monospace',
                fontSize: '0.75rem'
              }}
            >
              ⚠️ {jsonValidation.error}
              {jsonValidation.line && ` (Line ${jsonValidation.line}, Column ${jsonValidation.column})`}
            </Typography>
          )}
          {jsonValidation.isValid && jsonValidation.warnings.length === 0 && (
            <Typography 
              variant="caption" 
              sx={{ 
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'success.main',
                fontFamily: 'monospace',
                fontSize: '0.75rem'
              }}
            >
              ✓ Valid JSON
            </Typography>
          )}
          {jsonValidation.isValid && jsonValidation.warnings.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {jsonValidation.warnings.map((warning, idx) => (
                <Typography 
                  key={idx}
                  variant="caption" 
                  sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: 'warning.main',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem'
                  }}
                >
                  📅 {warning}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
        <Tooltip 
          title="Format JSON (Ctrl+Shift+F)" 
          arrow
          PopperProps={{
            sx: {
              zIndex: 9999
            }
          }}
        >
          <span>
            <IconButton 
              onClick={handleFormat} 
              disabled={disabled || !jsonValidation.isValid}
              size="small"
              sx={{ 
                color: jsonValidation.isValid ? 'primary.main' : 'text.disabled',
                '&:hover': {
                  bgcolor: 'action.hover'
                },
                '&:disabled': {
                  color: 'text.disabled'
                }
              }}
            >
              <FormatIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Editor */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          minHeight: 300
        }}
      >
      {/* Syntax highlighting layer (behind) */}
      <Box
        ref={highlightRef}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          bgcolor: 'background.default',
          color: 'text.primary',
          border: `1px solid ${jsonValidation.isValid ? theme.palette.divider : theme.palette.error.main}`,
          borderRadius: 1,
          p: 1,
          overflow: 'auto',
          whiteSpace: 'pre',
          wordBreak: 'normal',
          lineHeight: 1.5,
          pointerEvents: 'none',
          zIndex: 1,
          // Hide scrollbars on highlight layer
          '&::-webkit-scrollbar': {
            display: 'none'
          },
          scrollbarWidth: 'none'
        }}
      >
        {highlightSyntax(value || '')}
      </Box>

      {/* Editable textarea (on top) */}
      <Box
        ref={textareaRef}
        component="textarea"
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        onKeyDown={(e) => {
          // Ctrl+Shift+F or Cmd+Shift+F to format
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
            e.preventDefault();
            handleFormat();
            return;
          }

          // Handle Tab key for indentation
          if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newValue = value.substring(0, start) + '  ' + value.substring(end);
            
            // Update the value
            onChange({ target: { value: newValue } });
            
            // Restore cursor position after state update
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + 2;
            }, 0);
            return;
          }

          // Handle Enter key for auto-indentation
          if (e.key === 'Enter') {
            e.preventDefault();
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            // Get current line to determine indentation
            const textBeforeCursor = value.substring(0, start);
            const currentLineMatch = textBeforeCursor.match(/[^\n]*$/);
            const currentLine = currentLineMatch ? currentLineMatch[0] : '';
            
            // Count leading spaces
            const indentMatch = currentLine.match(/^(\s*)/);
            const currentIndent = indentMatch ? indentMatch[1] : '';
            
            // Check if we're after an opening bracket/brace
            const lastChar = textBeforeCursor.trim().slice(-1);
            const nextChar = value.substring(end, end + 1).trim().charAt(0);
            
            let newIndent = currentIndent;
            let extraLine = '';
            
            // Add extra indentation after opening brackets
            if (lastChar === '{' || lastChar === '[') {
              newIndent = currentIndent + '  ';
              // If the next character is a closing bracket, add an extra line
              if (nextChar === '}' || nextChar === ']') {
                extraLine = '\n' + currentIndent;
              }
            }
            
            const newValue = value.substring(0, start) + '\n' + newIndent + extraLine + value.substring(end);
            
            // Update the value
            onChange({ target: { value: newValue } });
            
            // Restore cursor position after state update
            setTimeout(() => {
              const newPosition = start + 1 + newIndent.length;
              textarea.selectionStart = textarea.selectionEnd = newPosition;
            }, 0);
            return;
          }
        }}
        disabled={disabled}
        spellCheck={false}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          bgcolor: 'transparent',
          color: 'transparent',
          caretColor: theme.palette.text.primary,
          border: `1px solid ${jsonValidation.isValid ? theme.palette.divider : theme.palette.error.main}`,
          borderRadius: 1,
          p: 1,
          overflow: 'auto',
          whiteSpace: 'pre',
          wordBreak: 'normal',
          lineHeight: 1.5,
          resize: 'none',
          zIndex: 2,
          '&:focus': {
            outline: 'none',
            borderColor: jsonValidation.isValid ? 'primary.main' : 'error.main',
            boxShadow: jsonValidation.isValid 
              ? `0 0 0 2px ${theme.palette.primary.main}20`
              : `0 0 0 2px ${theme.palette.error.main}20`
          },
          '&:disabled': {
            cursor: 'not-allowed',
            opacity: 0.6
          }
        }}
      />
      </Box>
    </Box>
  );
};

export default JsonEditor;

