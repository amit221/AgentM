import React, { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Alert,
  Grid,
  Card,
  CardContent,
  CircularProgress
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { WarningButton, SecondaryButton, GhostButton } from '../ui/MUIComponents';

const PerformanceWarningDialog = ({ 
  isOpen, 
  onClose, 
  onProceed, 
  onCancel,
  collectionName,
  fieldName,
  collectionSize,
  hasIndex,
  isLoading = false 
}) => {
  const timeoutRef = useRef(null);

  // Add timeout mechanism to prevent infinite loading
  useEffect(() => {
    if (isLoading) {
      // Set a 60-second timeout for field validation
      timeoutRef.current = setTimeout(() => {
        console.error('⚠️ Field validation timeout - forcing dialog reset');
        onCancel(); // Force cancel to reset state
      }, 60000); // 60 seconds
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, onCancel]);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog
      open={isOpen}
      onClose={!isLoading ? onClose : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          borderLeft: 4,
          borderLeftColor: 'warning.main',
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            Performance Warning
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Slow Operation Detected
            </Typography>
            <Typography variant="body2">
              You're about to fetch distinct values for field{' '}
              <Typography
                component="code"
                sx={{
                  bgcolor: 'warning.light',
                  color: 'warning.contrastText',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem'
                }}
              >
                {fieldName}
              </Typography>
              {' '}from collection{' '}
              <Typography
                component="code"
                sx={{
                  bgcolor: 'warning.light',
                  color: 'warning.contrastText',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem'
                }}
              >
                {collectionName}
              </Typography>
              .
            </Typography>
          </Alert>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={6}>
              <Card variant="outlined">
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Collection Size
                  </Typography>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      color: 'error.main',
                      fontWeight: 600 
                    }}
                  >
                    {formatSize(collectionSize)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={6}>
              <Card variant="outlined">
                <CardContent sx={{ py: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Index on Field
                  </Typography>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      fontFamily: 'monospace', 
                      color: hasIndex ? 'success.main' : 'error.main',
                      fontWeight: 600 
                    }}
                  >
                    {hasIndex ? '✓ Yes' : '✗ No'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Why this might be slow:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              <li>Collection is larger than 100MB ({formatSize(collectionSize)})</li>
              {!hasIndex && (
                <li>No index exists on field "{fieldName}"</li>
              )}
              <li>MongoDB will need to scan {!hasIndex ? 'all documents' : 'many documents'} to find distinct values</li>
              <li>This operation may take several minutes to complete</li>
            </Box>
          </Alert>

          <Alert severity="info">
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              💡 Recommendations:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              <li>Consider creating an index on field "{fieldName}"</li>
              <li>Use manual values instead of fetching from database</li>
              <li>Or proceed if you're willing to wait</li>
            </Box>
          </Alert>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          <strong>Note:</strong> Creating an index like{' '}
          <Typography
            component="code"
            sx={{
              bgcolor: 'action.hover',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.75rem'
            }}
          >
            {`db.${collectionName}.createIndex({"${fieldName}": 1})`}
          </Typography>
          {' '}would significantly improve performance for future operations.
        </Typography>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
          <WarningButton
            onClick={onProceed}
            disabled={isLoading}
            startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ minWidth: 140 }}
          >
            {isLoading ? 'Fetching Values...' : '⚡ Proceed Anyway'}
          </WarningButton>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <SecondaryButton
              onClick={onCancel}
              disabled={isLoading}
            >
              🚫 Cancel & Use Manual Values
            </SecondaryButton>
            
            <GhostButton
              onClick={onClose}
              disabled={isLoading}
            >
              ✗ Close
            </GhostButton>
          </Box>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PerformanceWarningDialog;