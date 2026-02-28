import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Box,
  Alert,
  Chip,
  Stack,
  Divider
} from '@mui/material';
import {
  Warning as WarningIcon,
  Lightbulb as LightbulbIcon
} from '@mui/icons-material';

const DatabaseConflictDialog = ({ 
  open, 
  onClose, 
  conflictingName, 
  existingDatabases,
  onResolve 
}) => {
  const [resolution, setResolution] = useState('replace'); // 'replace' or 'rename'
  const [newName, setNewName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState('');
  const [customName, setCustomName] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (open && conflictingName) {
      generateSuggestions();
    }
  }, [open, conflictingName]);

  const generateSuggestions = async () => {
    try {
      const result = await window.electronAPI.spreadsheet.generateAlternativeNames(
        conflictingName, 
        existingDatabases
      );
      
      if (result.success) {
        setSuggestions(result.suggestions);
        if (result.suggestions.length > 0) {
          setSelectedSuggestion(result.suggestions[0]);
          setNewName(result.suggestions[0]);
        }
      }
    } catch (error) {
      console.error('Failed to generate name suggestions:', error);
    }
  };

  const validateName = (name) => {
    if (!name) {
      return 'Database name is required';
    }
    
    if (name === conflictingName) {
      return 'New name must be different from the conflicting name';
    }
    
    if (existingDatabases.includes(name)) {
      return 'This database name already exists';
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return 'Database name can only contain letters, numbers, and underscores';
    }
    
    if (name.length > 64) {
      return 'Database name must be 64 characters or less';
    }
    
    return '';
  };

  const handleResolutionChange = (event) => {
    const value = event.target.value;
    setResolution(value);
    setNameError('');
    
    if (value === 'rename') {
      if (selectedSuggestion) {
        setNewName(selectedSuggestion);
      } else if (suggestions.length > 0) {
        setSelectedSuggestion(suggestions[0]);
        setNewName(suggestions[0]);
      }
    }
  };

  const handleSuggestionSelect = (suggestion) => {
    setSelectedSuggestion(suggestion);
    setNewName(suggestion);
    setCustomName('');
    setNameError('');
  };

  const handleCustomNameChange = (event) => {
    const value = event.target.value;
    setCustomName(value);
    setNewName(value);
    setSelectedSuggestion('');
    setNameError(validateName(value));
  };

  const handleConfirm = () => {
    if (resolution === 'replace') {
      onResolve({ action: 'replace', newName: conflictingName });
    } else {
      const error = validateName(newName);
      if (error) {
        setNameError(error);
        return;
      }
      onResolve({ action: 'rename', newName });
    }
  };

  const handleCancel = () => {
    setResolution('replace');
    setNewName('');
    setSelectedSuggestion('');
    setCustomName('');
    setNameError('');
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Database Name Conflict
      </DialogTitle>
      
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          A database named <strong>"{conflictingName}"</strong> already exists. 
          Please choose how to proceed:
        </Alert>

        <RadioGroup
          value={resolution}
          onChange={handleResolutionChange}
        >
          <FormControlLabel
            value="replace"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body1" fontWeight="medium">
                  Replace existing database
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ⚠️ This will permanently delete all data in the existing "{conflictingName}" database
                </Typography>
              </Box>
            }
          />
          
          <FormControlLabel
            value="rename"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body1" fontWeight="medium">
                  Use a different database name
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create a new database with a different name (recommended)
                </Typography>
              </Box>
            }
          />
        </RadioGroup>

        {resolution === 'rename' && (
          <Box sx={{ mt: 3, pl: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LightbulbIcon color="primary" fontSize="small" />
              Choose a new name:
            </Typography>
            
            {suggestions.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Suggested names:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {suggestions.map((suggestion) => (
                    <Chip
                      key={suggestion}
                      label={suggestion}
                      onClick={() => handleSuggestionSelect(suggestion)}
                      color={selectedSuggestion === suggestion ? 'primary' : 'default'}
                      variant={selectedSuggestion === suggestion ? 'filled' : 'outlined'}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            
            <Divider sx={{ my: 2 }} />
            
            <TextField
              fullWidth
              label="Custom database name"
              value={customName}
              onChange={handleCustomNameChange}
              placeholder="Enter your own database name"
              error={!!nameError}
              helperText={nameError || 'Use letters, numbers, and underscores only'}
              variant="outlined"
            />
            
            {newName && !nameError && (
              <Alert severity="success" sx={{ mt: 2 }}>
                New database will be created as: <strong>"{newName}"</strong>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleConfirm}
          variant="contained"
          color={resolution === 'replace' ? 'warning' : 'primary'}
          disabled={resolution === 'rename' && (!newName || !!nameError)}
        >
          {resolution === 'replace' ? 'Replace Database' : 'Use New Name'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DatabaseConflictDialog;
