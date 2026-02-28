import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress
} from '@mui/material';

const ProgressDialog = ({ 
  isOpen, 
  title, 
  message, 
  progress, 
  isIndeterminate = false,
  onCancel 
}) => {
  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        }
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {message}
          </Typography>
          
          {/* Progress Bar */}
          <Box sx={{ mb: 2 }}>
            <LinearProgress 
              variant={isIndeterminate ? "indeterminate" : "determinate"}
              value={isIndeterminate ? undefined : Math.min(100, Math.max(0, progress))}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
          
          {!isIndeterminate && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">
                {Math.round(progress)}% completed
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {progress < 100 ? 'In progress...' : 'Complete!'}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      
      {onCancel && (
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={onCancel} color="inherit">
            Cancel
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default ProgressDialog;