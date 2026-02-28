import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography
} from '@mui/material';
import { useNavigation } from '../../context/NavigationContext';

const ConfigurationErrorDialog = ({ isOpen, onClose, message, title = "Configuration Required" }) => {
  const { navigateTo } = useNavigation();

  const handleGoToSettings = () => {
    onClose();
    navigateTo('settings');
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
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
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button onClick={handleGoToSettings} variant="contained" color="primary">
          Go to Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigurationErrorDialog;