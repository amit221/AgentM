import React from 'react';
import { Box, Paper, Typography, Tooltip, IconButton, CircularProgress } from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';

function ClearItemTile({ title, description, busy = false, onClick, tooltipLabel }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, width: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap'
        }}
      >
        <Box sx={{ minWidth: 220 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        </Box>
        <Tooltip title={tooltipLabel} placement="top">
          <span>
            <IconButton
              color="error"
              onClick={onClick}
              disabled={busy}
              aria-label={tooltipLabel}
            >
              {busy ? <CircularProgress size={18} /> : <DeleteIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Paper>
  );
}

export default ClearItemTile;


