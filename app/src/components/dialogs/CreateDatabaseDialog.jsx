import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert
} from '@mui/material';

const CreateDatabaseDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  connectionName
}) => {
  const [databaseName, setDatabaseName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDatabaseName('');
      setError('');
    }
  }, [isOpen]);

  const validateDatabaseName = (name) => {
    if (!name.trim()) {
      return 'Database name cannot be empty';
    }
    
    if (name.length > 64) {
      return 'Database name cannot exceed 64 characters';
    }
    
    // Check for invalid characters
    const invalidChars = /[\/\\. "$*<>:|?]/;
    if (invalidChars.test(name)) {
      return 'Database name cannot contain: / \\ . " $ * < > : | ?';
    }
    
    // Check for reserved names
    const reservedNames = ['admin', 'local', 'config'];
    if (reservedNames.includes(name.toLowerCase())) {
      return 'Cannot use reserved database names: admin, local, config';
    }
    
    return '';
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setDatabaseName(value);
    setError(validateDatabaseName(value));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = databaseName.trim();
    const validationError = validateDatabaseName(trimmedName);
    
    if (validationError) {
      setError(validationError);
      return;
    }
    
    onConfirm(trimmedName);
  };

  const isValid = !error && databaseName.trim();

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
          Create New Database
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {connectionName && `Creating database on connection: ${connectionName}`}
          </Typography>
          
          <TextField
            fullWidth
            value={databaseName}
            onChange={handleNameChange}
            placeholder="Enter database name"
            label="Database Name"
            autoFocus
            error={!!error}
            helperText={error}
            sx={{ mb: 2 }}
          />
          
          <Alert severity="info">
            <Typography variant="body2">
              <strong>Note:</strong> The database will be created with an initial collection named "_init". 
              You can delete this collection later if not needed.
            </Typography>
          </Alert>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          variant="contained"
          color="primary"
        >
          Create Database
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateDatabaseDialog;

