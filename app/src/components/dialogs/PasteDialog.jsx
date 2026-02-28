import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Typography,
  Alert
} from '@mui/material';

const PasteDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  type, 
  sourceName, 
  defaultName 
}) => {
  const [targetName, setTargetName] = useState('');
  const [copyMethod, setCopyMethod] = useState('auto');
  const [toolsAvailable, setToolsAvailable] = useState({ dumpRestoreAvailable: false });

  useEffect(() => {
    if (isOpen) {
      setTargetName(defaultName || `${sourceName}_copy`);
      setCopyMethod('auto');
      
      // Check tool availability for database copying
      if (type === 'database') {
        checkToolsAvailability();
      }
    }
  }, [isOpen, defaultName, sourceName, type]);

  const checkToolsAvailability = async () => {
    try {
      const result = await window.electronAPI.database.checkToolsAvailability();
      setToolsAvailable(result.tools || { dumpRestoreAvailable: false });
    } catch (error) {
      console.error('Error checking tools availability:', error);
      setToolsAvailable({ dumpRestoreAvailable: false });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (targetName.trim()) {
      const options = type === 'database' ? { method: copyMethod } : {};
      onConfirm(targetName.trim(), options);
    }
  };

  const methodOptions = [
    { value: 'auto', label: '🤖 Auto (Recommended)', description: 'Automatically choose the best method' },
    { value: 'dump_restore', label: '⚡ Fast (mongodump/mongorestore)', description: '10-50x faster for large databases' },
    { value: 'document_copy', label: '🔄 Compatible (Document-by-document)', description: 'Universal but slower method' }
  ];

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
          Paste {type}
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Copy "{sourceName}" {type} to:
          </Typography>
          
          <TextField
            fullWidth
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            placeholder={`Enter ${type} name`}
            autoFocus
            sx={{ mb: 3 }}
          />
          
          {/* Copy Method Selection for Databases */}
          {type === 'database' && (
            <Box sx={{ mb: 2 }}>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend" sx={{ mb: 1, fontWeight: 500 }}>
                  Copy Method:
                </FormLabel>
                <RadioGroup
                  value={copyMethod}
                  onChange={(e) => setCopyMethod(e.target.value)}
                >
                  {methodOptions.map((option) => {
                    const isDisabled = option.value === 'dump_restore' && !toolsAvailable.dumpRestoreAvailable;
                    return (
                      <FormControlLabel
                        key={option.value}
                        value={option.value}
                        control={<Radio disabled={isDisabled} />}
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {option.label}
                              {isDisabled && ' (Not Available)'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {option.description}
                              {isDisabled && ' - MongoDB tools not found'}
                            </Typography>
                          </Box>
                        }
                        disabled={isDisabled}
                        sx={{
                          mb: 1,
                          p: 1.5,
                          border: 1,
                          borderColor: copyMethod === option.value 
                            ? 'primary.main' 
                            : isDisabled 
                            ? 'grey.300' 
                            : 'grey.300',
                          borderRadius: 1,
                          bgcolor: copyMethod === option.value 
                            ? 'primary.50' 
                            : isDisabled 
                            ? 'grey.50' 
                            : 'transparent',
                          '&:hover': {
                            bgcolor: !isDisabled ? 'action.hover' : 'grey.50'
                          },
                          opacity: isDisabled ? 0.5 : 1
                        }}
                      />
                    );
                  })}
                </RadioGroup>
              </FormControl>
            </Box>
          )}
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={() => {
            const options = type === 'database' ? { method: copyMethod } : {};
            onConfirm(targetName.trim(), options);
          }}
          disabled={!targetName.trim()}
          variant="contained"
          color="primary"
        >
          Paste {type === 'database' && copyMethod === 'dump_restore' ? '⚡' : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PasteDialog;