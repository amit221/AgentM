import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography
} from '@mui/material';

/**
 * Dialog component for editing dashboard name and description
 */
const EditDashboardDialog = ({ 
  open, 
  onClose, 
  dashboard, 
  onSave 
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Update form when dashboard changes
  useEffect(() => {
    if (dashboard) {
      setName(dashboard.name || '');
      setDescription(dashboard.description || '');
    }
  }, [dashboard]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setIsSaving(false);
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || !dashboard) return;

    setIsSaving(true);
    try {
      const updatedDashboard = {
        ...dashboard,
        name: name.trim(),
        description: description.trim()
      };

      await onSave(updatedDashboard);
      onClose();
    } catch (error) {
      console.error('Failed to save dashboard:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  const canSave = () => {
    return name.trim() && 
           (name.trim() !== dashboard?.name || description.trim() !== (dashboard?.description || ''));
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '300px' }
      }}
    >
      <DialogTitle>
        <Typography variant="h6" component="div">
          Edit Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Update the dashboard name and description
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            fullWidth
            label="Dashboard Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter dashboard name"
            required
            autoFocus
            disabled={isSaving}
            helperText="A descriptive name for your dashboard"
          />
          
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter an optional description for your dashboard"
            disabled={isSaving}
            helperText="Optional description to help identify this dashboard's purpose"
          />
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={handleClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSave}
          disabled={!canSave() || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditDashboardDialog;
