import React, { useState } from 'react';
import {
  Box,
  Typography,
  Autocomplete,
  TextField,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import {
  Storage as DatabaseIcon,
  CheckCircle as ConnectedIcon
} from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { getDatabaseDisplayName } from '../../utils/databaseTypeUtils';

const DatabaseSelector = () => {
  const { 
    activeConnections, 
    connections, 
    setSelectedDatabase, 
    isLoading,
    selectedDatabase 
  } = useDatabase();

  const [inputValue, setInputValue] = useState('');

  // Get the active connection
  const activeConnectionId = activeConnections?.[0];
  const activeConnection = connections?.[activeConnectionId];
  const availableDatabases = activeConnection?.databases || [];
  const dbDisplayName = getDatabaseDisplayName(activeConnection?.databaseType);

  const handleSelectDatabase = (event, newValue) => {
    if (newValue) {
      setSelectedDatabase(newValue);
    }
  };

  return (
    <Box sx={{ 
      maxWidth: '400px', 
      width: '100%',
      mx: 'auto',
      textAlign: 'center'
    }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
          <ConnectedIcon sx={{ color: 'primary.main', mr: 1 }} />
          <Typography variant="body1" sx={{ color: 'primary.main', fontWeight: 500 }}>
            Connected to {activeConnection?.name || dbDisplayName}
          </Typography>
        </Box>
      </Box>

      {/* Loading State */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
          <CircularProgress size={24} sx={{ mr: 2 }} />
          <Typography variant="body2" color="text.secondary">
            Loading databases...
          </Typography>
        </Box>
      )}

      {/* Database Selector */}
      {!isLoading && availableDatabases.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Autocomplete
            value={selectedDatabase || null}
            onChange={handleSelectDatabase}
            inputValue={inputValue}
            onInputChange={(event, newInputValue) => setInputValue(newInputValue)}
            options={availableDatabases}
            filterOptions={(options, { inputValue }) => {
              const filtered = options.filter(option => 
                option.toLowerCase().includes(inputValue.toLowerCase())
              );
              return filtered;
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={`Select Database (${availableDatabases.length} available)`}
                placeholder="Type to search databases..."
                variant="outlined"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <DatabaseIcon sx={{ color: 'action.active', mr: 1, ml: 1 }} />
                  ),
                }}
              />
            )}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props;
              return (
                <Box component="li" key={key} {...otherProps}>
                  <DatabaseIcon sx={{ color: 'action.active', mr: 2 }} />
                  <Typography variant="body2">
                    {option}
                  </Typography>
                </Box>
              );
            }}
            getOptionLabel={(option) => option}
            isOptionEqualToValue={(option, value) => option === value}
            clearOnBlur={false}
            selectOnFocus
            handleHomeEndKeys
            freeSolo={false}
            autoHighlight
            sx={{
              '& .MuiOutlinedInput-root': {
                paddingLeft: '8px',
              },
            }}
          />
          
          {/* Show selected database as chip */}
          {selectedDatabase && (
            <Box sx={{ mt: 2, textAlign: 'left' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Selected:
              </Typography>
              <Chip
                icon={<DatabaseIcon />}
                label={selectedDatabase}
                color="primary"
                variant="outlined"
                onDelete={() => setSelectedDatabase(null)}
              />
            </Box>
          )}
        </Box>
      )}

      {/* No Databases Found */}
      {!isLoading && availableDatabases.length === 0 && (
        <Alert severity="info" sx={{ textAlign: 'left' }}>
          <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
            No databases found
          </Typography>
          <Typography variant="body2">
            Create a database or check your connection permissions.
          </Typography>
        </Alert>
      )}


    </Box>
  );
};

export default DatabaseSelector;
