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

const RenameDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  type = 'database',
  currentName,
  title
}) => {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName || '');
      setError('');
    }
  }, [isOpen, currentName]);

  const validateName = (name) => {
    if (!name.trim()) {
      return 'Name cannot be empty';
    }
    
    if (name.trim() === currentName) {
      return 'New name must be different from current name';
    }
    
    // MongoDB database name restrictions
    if (type === 'database') {
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
    }
    
    return '';
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setNewName(value);
    setError(validateName(value));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    const validationError = validateName(trimmedName);
    
    if (validationError) {
      setError(validationError);
      return;
    }
    
    onConfirm(trimmedName);
  };

  const isValid = !error && newName.trim() && newName.trim() !== currentName;

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
          {title || `Rename ${type}`}
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Rename "{currentName}" to:
          </Typography>
          
          <TextField
            fullWidth
            value={newName}
            onChange={handleNameChange}
            placeholder={`Enter new ${type} name`}
            autoFocus
            error={!!error}
            helperText={error}
            sx={{ mb: 2 }}
          />
          
          {type === 'database' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Note:</strong> Renaming a database will copy all collections to a new database 
                and delete the original. This operation may take some time for large databases.
              </Typography>
            </Alert>
          )}
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
          Rename {type}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RenameDialog;
