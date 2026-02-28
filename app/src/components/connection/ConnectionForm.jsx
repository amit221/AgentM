import React, { useState, useEffect } from 'react';
import {
  Typography,
  Alert,
  Collapse,
  Grid,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Box,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Avatar } from '@mui/material';
import { Card, TextField, Button, FlexBox } from '../ui/MUIComponents';
import { maskConnectionCredentials, hasEmbeddedCredentials, generateConnectionDisplayName } from '../../utils/connectionUtils';
import { getDatabaseLogo, getDatabaseProviderName } from '../../utils/databaseLogos';

const ConnectionForm = ({ 
  connectionString = '', 
  setConnectionString, 
  onConnect, 
  isConnecting = false, 
  isConnected = false,
  connectionError = null,
  clearConnectionError = null
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);
  const [databaseType, setDatabaseType] = useState('mongodb');

  // Auto-detect database type from connection string
  // Only auto-detect if connection string is not empty and we can confidently detect the type
  useEffect(() => {
    if (connectionString && connectionString.trim()) {
      const detectedType = detectDatabaseType(connectionString);
      // Only update if we detected a specific type (not null)
      // This prevents unwanted switching when user is typing or has manually selected a type
      if (detectedType && detectedType !== databaseType) {
        setDatabaseType(detectedType);
      }
    }
  }, [connectionString]); // eslint-disable-line react-hooks/exhaustive-deps

  const detectDatabaseType = (connString) => {
    if (!connString || !connString.trim()) {
      return null; // Don't detect if empty
    }
    
    // Check for Supabase project URL (https://[project-ref].supabase.co)
    if (connString.includes('.supabase.co')) {
      return 'supabase';
    }
    
    if (connString.startsWith('mongodb://') || connString.startsWith('mongodb+srv://')) {
      return 'mongodb';
    }
    if (connString.startsWith('postgresql://') || connString.startsWith('postgres://')) {
      return 'postgresql';
    }
    
    // Don't default to mongodb - return null if we can't detect
    // This prevents unwanted switching when user is typing
    return null;
  };

  const exampleConnectionsByType = {
    mongodb: [
      {
        name: 'Local MongoDB',
        uri: 'mongodb://localhost:27017'
      },
      {
        name: 'MongoDB Atlas',
        uri: 'mongodb+srv://username:password@cluster.mongodb.net/database'
      },
      {
        name: 'MongoDB with Auth',
        uri: 'mongodb://username:password@localhost:27017/database'
      }
    ],
    postgresql: [
      {
        name: 'Local PostgreSQL',
        uri: 'postgresql://localhost:5432/mydb'
      },
      {
        name: 'PostgreSQL with Auth',
        uri: 'postgresql://username:password@localhost:5432/mydb'
      },
      {
        name: 'PostgreSQL Cloud',
        uri: 'postgresql://username:password@host.example.com:5432/mydb'
      }
    ],
    supabase: [
      {
        name: 'Supabase Database Connection',
        uri: 'postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres'
      },
      {
        name: 'Supabase with Connection Pooling',
        uri: 'postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres'
      },
      {
        name: 'Supabase Direct Connection',
        uri: 'postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true'
      }
    ]
  };

  const exampleConnections = exampleConnectionsByType[databaseType] || exampleConnectionsByType.mongodb;

  const handleExampleSelect = (uri) => {
    setConnectionString(uri);
    // Auto-generate a name based on the connection string
    if (!connectionName) {
      const autoName = generateConnectionName(uri);
      setConnectionName(autoName);
    }
  };

  const generateConnectionName = (connectionString) => {
    return generateConnectionDisplayName(connectionString);
  };

  const handleConnect = () => {
    // Connection name is required - no fallback generation
    if (!connectionName.trim()) {
      return; // This shouldn't happen due to button being disabled, but safety check
    }
    // Pass connection name and database type
    onConnect(connectionName.trim(), databaseType);
  };

  const getDatabaseDisplayName = (type) => {
    const names = {
      mongodb: 'MongoDB',
      postgresql: 'PostgreSQL',
      supabase: 'Supabase'
    };
    return names[type] || type;
  };

  const getDatabasePlaceholder = (type) => {
    const placeholders = {
      mongodb: 'mongodb://localhost:27017 or mongodb+srv://...',
      postgresql: 'postgresql://localhost:5432/mydb',
      supabase: 'postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres'
    };
    return placeholders[type] || 'Enter connection string';
  };

  const getDatabaseHelperText = (type) => {
    const helpers = {
      mongodb: '',
      postgresql: '',
      supabase: 'Find in: Dashboard → Settings → Database → Connection string'
    };
    return helpers[type] || '';
  };

  return (
    <Card sx={{ p: 2.5 }}>
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
        New Connection
      </Typography>

      {/* Database Type Selector */}
      <Box sx={{ mb: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="database-type-label">Type</InputLabel>
          <Select
            labelId="database-type-label"
            value={databaseType}
            label="Type"
            onChange={(e) => {
              setDatabaseType(e.target.value);
              setConnectionString('');
            }}
            disabled={isConnecting || isConnected}
            renderValue={(value) => {
              const provider = value === 'supabase' ? 'supabase' : value === 'postgresql' ? 'postgresql' : 'mongodb';
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    src={getDatabaseLogo(provider)}
                    alt={getDatabaseProviderName(provider)}
                    sx={{ width: 18, height: 18, bgcolor: 'transparent', '& img': { objectFit: 'contain' } }}
                  />
                  <Typography variant="body2">{getDatabaseProviderName(provider)}</Typography>
                </Box>
              );
            }}
          >
            {['mongodb', 'postgresql', 'supabase'].map((type) => (
              <MenuItem key={type} value={type}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar
                    src={getDatabaseLogo(type)}
                    alt={getDatabaseProviderName(type)}
                    sx={{ width: 20, height: 20, bgcolor: 'transparent', '& img': { objectFit: 'contain' } }}
                  />
                  <Typography variant="body2">{getDatabaseProviderName(type)}</Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Connection Name Input */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="Connection Name"
          value={connectionName}
          onChange={(e) => setConnectionName(e.target.value)}
          placeholder={`My ${getDatabaseDisplayName(databaseType)} Connection`}
          disabled={isConnecting || isConnected}
          required
          size="small"
        />
      </Box>

      {/* Connection String Input */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="Connection String"
          value={showCredentials || !hasEmbeddedCredentials(connectionString) 
            ? connectionString 
            : maskConnectionCredentials(connectionString)
          }
          onChange={(e) => {
            setConnectionString(e.target.value);
            if (!connectionName) {
              setConnectionName(generateConnectionName(e.target.value));
            }
            if (clearConnectionError && connectionError) {
              clearConnectionError();
            }
          }}
          placeholder={getDatabasePlaceholder(databaseType)}
          disabled={isConnecting || isConnected}
          helperText={getDatabaseHelperText(databaseType)}
          multiline
          minRows={2}
          maxRows={5}
          size="small"
          sx={{
            '& .MuiInputBase-root textarea': {
              fontFamily: 'monospace',
              fontSize: '13px',
            }
          }}
          InputProps={hasEmbeddedCredentials(connectionString) ? {
            endAdornment: (
              <IconButton
                size="small"
                onClick={() => setShowCredentials(!showCredentials)}
                edge="end"
                disabled={isConnecting || isConnected}
                sx={{ alignSelf: 'flex-start', mt: 0.5 }}
              >
                {showCredentials ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            ),
          } : undefined}
        />
      </Box>

      {/* Quick Examples - Compact */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {exampleConnections.slice(0, 2).map((example, index) => (
            <Chip
              key={index}
              label={example.name}
              onClick={() => handleExampleSelect(example.uri)}
              disabled={isConnecting || isConnected}
              size="small"
              variant="outlined"
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      </Box>

      {/* Advanced Options - Hidden by default */}
      <Collapse in={showAdvanced}>
        <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth
                type="number"
                label="Timeout (ms)"
                defaultValue="5000"
                disabled={isConnecting || isConnected}
                size="small"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                type="number"
                label="Pool Size"
                defaultValue="10"
                disabled={isConnecting || isConnected}
                size="small"
              />
            </Grid>
          </Grid>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox disabled={isConnecting || isConnected} />}
            label="Use SSL/TLS"
          />
        </Box>
      </Collapse>

      {/* Connect Button with Advanced toggle */}
      <FlexBox sx={{ justifyContent: 'space-between', mb: connectionError ? 2 : 0 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          onClick={() => setShowAdvanced(!showAdvanced)}
          sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
        >
          {showAdvanced ? '− Hide advanced' : '+ Advanced'}
        </Typography>
        <Button
          variant="contained"
          onClick={handleConnect}
          disabled={!connectionString?.trim() || !connectionName?.trim() || isConnecting || isConnected}
          startIcon={isConnecting ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Connect'}
        </Button>
      </FlexBox>

      {/* Error Display */}
      {connectionError && (
        <Alert 
          severity="error" 
          sx={{ mt: 2 }}
          icon={false}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Connection Failed
          </Typography>
          <Typography variant="body2">
            {connectionError}
          </Typography>
        </Alert>
      )}
    </Card>
  );
};

export default ConnectionForm;