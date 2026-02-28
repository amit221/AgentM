import React from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';

function ClearAllBlock({ busy, onConfirm }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', mb: 2 }}>
      <Button
        variant="contained"
        color="error"
        onClick={onConfirm}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} /> : <DeleteIcon />}
      >
        {busy ? 'Clearing...' : 'Clear All Storage'}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
        Clears conversations, history, favorites, app state, and connections in one action.
      </Typography>
    </Box>
  );
}

export default ClearAllBlock;


