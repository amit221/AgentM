import React, { useMemo } from 'react';
import { Box, useTheme } from '@mui/material';

/**
 * Syntax-highlighted JSON viewer component
 * Applies colors to different JSON data types for better readability
 */
const JsonViewer = ({ data, sx = {} }) => {
  const theme = useTheme();

  const highlightedJson = useMemo(() => {
    if (!data) return '';

    // Stringify with replacer that converts Extended JSON to placeholders
    let jsonString = JSON.stringify(data, (key, value) => {
      // Handle Extended JSON ObjectId: { "$oid": "..." }
      if (value && typeof value === 'object' && value.$oid && typeof value.$oid === 'string') {
        return `__OBJECTID__${value.$oid}__OBJECTID__`;
      }
      // Handle Extended JSON Date: { "$date": "..." }
      if (value && typeof value === 'object' && value.$date && typeof value.$date === 'string') {
        return `__ISODATE__${value.$date}__ISODATE__`;
      }
      return value;
    }, 2);
    
    // Replace placeholders with MongoDB constructors (unquoted)
    jsonString = jsonString.replace(/"__OBJECTID__([^"]+)__OBJECTID__"/g, 'ObjectId("$1")');
    jsonString = jsonString.replace(/"__ISODATE__([^"]+)__ISODATE__"/g, 'ISODate("$1")');
    
    const lines = jsonString.split('\n');
    
    return lines.map((line, lineIndex) => {
      const parts = [];
      let currentIndex = 0;
      
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
        // Numbers (including negative, decimals, scientific notation)
        { 
          regex: /\b-?\d+\.?\d*([eE][+-]?\d+)?\b/g, 
          color: theme.palette.syntax.number.color,
          style: { 
            fontStyle: theme.palette.syntax.number.fontStyle,
            fontWeight: theme.palette.syntax.number.fontWeight
          }
        },
        // MongoDB ISODate constructor - highest priority
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
        // MongoDB ObjectId constructor - highest priority
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
          },
          isString: true
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
            isString: pattern.isString,
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

      // Remove overlapping matches (keep higher priority ones)
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

      return (
        <div key={lineIndex}>
          {parts.length > 0 ? parts : <span style={{ color: theme.palette.text.secondary }}>{line}</span>}
        </div>
      );
    });
  }, [data, theme]);

  return (
    <Box
      component="pre"
      sx={{
        width: '100%',
        minHeight: 300,
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        bgcolor: 'background.default',
        color: 'text.primary',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        p: 2,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        lineHeight: 1.6,
        ...sx
      }}
    >
      {highlightedJson}
    </Box>
  );
};

export default JsonViewer;


