import React from 'react';
import { Box, Tooltip, Paper, Typography } from '@mui/material';
import { DragIndicator } from '@mui/icons-material';

const ResizeHandle = ({ onMouseDown, onDoubleClick, isResizing, currentWidth }) => {
  return (
    <Box
      sx={{
        width: 4,
        bgcolor: isResizing ? 'primary.main' : 'divider',
        cursor: 'col-resize',
        flexShrink: 0,
        position: 'relative',
        userSelect: 'none',
        transition: 'background-color 0.15s ease',
        '&:hover': {
          bgcolor: 'primary.main',
          '& .resize-indicator': {
            opacity: 0.6,
          },
          '& .resize-grip': {
            bgcolor: 'primary.light',
          }
        },
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize sidebar, double-click to reset"
    >
      {/* Visual indicator when hovering */}
      <Box
        className="resize-grip"
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 8,
          left: -2,
          bgcolor: isResizing ? 'primary.light' : 'transparent',
          transition: 'background-color 0.15s ease',
        }}
      />
      
      {/* Resize grip dots - visible on hover */}
      <Box
        className="resize-indicator"
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0,
          transition: 'opacity 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {[1, 2, 3, 4, 5].map((dot) => (
          <Box
            key={dot}
            sx={{
              width: 2,
              height: 2,
              bgcolor: 'text.secondary',
              borderRadius: '50%',
            }}
          />
        ))}
      </Box>
      
      {/* Width indicator tooltip - visible when resizing */}
      {isResizing && currentWidth && (
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            top: '50%',
            left: 16,
            transform: 'translateY(-50%)',
            px: 1,
            py: 0.5,
            zIndex: 50,
            bgcolor: 'grey.900',
            color: 'common.white',
          }}
        >
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            {currentWidth}px
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default ResizeHandle;