import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  Button,
  Box,
  Typography,
  Alert
} from '@mui/material';
import {
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';

const ConfirmDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning', // 'warning', 'danger', 'info'
  requireTextConfirmation = false,
  confirmationText = ''
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleConfirm = () => {
    if (requireTextConfirmation && inputValue !== confirmationText) {
      return;
    }
    onConfirm();
    setInputValue('');
  };

  const handleClose = () => {
    setInputValue('');
    onClose();
  };

  const getTypeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          icon: <ErrorIcon color="error" />,
          severity: 'error',
          buttonColor: 'error'
        };
      case 'warning':
        return {
          icon: <WarningIcon color="warning" />,
          severity: 'warning',
          buttonColor: 'warning'
        };
      default:
        return {
          icon: <InfoIcon color="info" />,
          severity: 'info',
          buttonColor: 'primary'
        };
    }
  };

  const config = getTypeConfig();
  const isConfirmDisabled = requireTextConfirmation && inputValue !== confirmationText;

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          borderLeft: 4,
          borderLeftColor: `${config.severity}.main`,
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {config.icon}
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <DialogContentText sx={{ mb: requireTextConfirmation ? 2 : 0 }}>
          {message}
        </DialogContentText>
        
        {requireTextConfirmation && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Type{' '}
              <Typography
                component="code"
                sx={{
                  bgcolor: 'action.hover',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  color: 'error.main',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem'
                }}
              >
                {confirmationText}
              </Typography>
              {' '}to confirm:
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Type "${confirmationText}" here`}
              autoFocus={requireTextConfirmation}
              variant="outlined"
            />
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          color="inherit"
          variant="text"
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isConfirmDisabled}
          color={config.buttonColor}
          variant="contained"
          autoFocus={!requireTextConfirmation}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;