import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  Paper,
  IconButton,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility,
  VisibilityOff,
  Storage as DatabaseIcon
} from '@mui/icons-material';
import { Avatar } from '@mui/material';
import { maskConnectionCredentials, hasEmbeddedCredentials, generateConnectionDisplayName } from '../../utils/connectionUtils';
import { getDatabaseLogo, getDatabaseProviderName } from '../../utils/databaseLogos';

const ConnectionEditModal = ({ 
  isOpen, 
  onClose, 
  onSave,
  connection = null, // null for new connection, connection object for editing
  mode = 'create' // 'create' or 'edit'
}) => {
  const [formData, setFormData] = useState({
    name: '',
    connectionString: '',
    databaseType: 'mongodb'
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);

  // Load connection data when editing
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && connection) {
        // Always detect database type from connection string for accuracy
        // This ensures Supabase connections show correctly even if stored as 'postgresql'
        let dbType = connection.databaseType;
        if (connection.connectionString) {
          const detected = detectDatabaseType(connection.connectionString);
          // Use detected type if found, otherwise fall back to stored type
          if (detected) {
            dbType = detected;
          }
        }
        
        setFormData({
          name: connection.name || '',
          connectionString: connection.connectionString || '',
          databaseType: dbType || 'mongodb'
        });
      } else {
        // Reset form for new connection
        setFormData({
          name: '',
          connectionString: '',
          databaseType: 'mongodb'
        });
      }
      setErrors({});
    }
  }, [isOpen, mode, connection]);

  const generateConnectionName = (connectionString) => {
    return generateConnectionDisplayName(connectionString);
  };

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

  const getDatabaseDisplayName = (type) => {
    const names = {
      mongodb: 'MongoDB',
      postgresql: 'PostgreSQL',
      supabase: 'Supabase'
    };
    return names[type] || type;
  };

  const validateConnectionString = (connString, dbType) => {
    if (!connString.trim()) {
      return 'Connection string is required';
    }
    
    switch (dbType) {
      case 'mongodb':
        if (!connString.startsWith('mongodb://') && !connString.startsWith('mongodb+srv://')) {
          return 'MongoDB connection string must start with mongodb:// or mongodb+srv://';
        }
        break;
      case 'postgresql':
        if (!connString.startsWith('postgresql://') && !connString.startsWith('postgres://')) {
          return 'PostgreSQL connection string must start with postgresql:// or postgres://';
        }
        break;
      case 'supabase':
        // Supabase requires PostgreSQL connection strings, not project URLs
        if (!connString.startsWith('postgresql://') && !connString.startsWith('postgres://')) {
          if (connString.startsWith('https://')) {
            return 'You need the PostgreSQL connection string, not the project URL. Find it in: Supabase Dashboard → Project Settings → Database → Connection string';
          }
          return 'Supabase requires a PostgreSQL connection string starting with postgresql:// or postgres://';
        }
        // Ensure it's a Supabase connection string
        if (!connString.includes('.supabase.co')) {
          return 'This doesn\'t appear to be a Supabase connection string (should contain .supabase.co)';
        }
        break;
    }
    
    return null;
  };

  const validateForm = () => {
    const newErrors = {};

    // Name is required
    if (!formData.name.trim()) {
      newErrors.name = 'Connection name is required';
    }

    // Validate connection string based on database type
    const connStringError = validateConnectionString(formData.connectionString, formData.databaseType);
    if (connStringError) {
      newErrors.connectionString = connStringError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    
    try {
      const connectionData = {
        id: mode === 'edit' ? connection.id : `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: formData.name.trim(),
        connectionString: formData.connectionString.trim(),
        databaseType: formData.databaseType
      };

      await onSave(connectionData, mode);
      onClose();
    } catch (error) {
      setErrors({ submit: error.message || 'Failed to save connection' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectionStringChange = (value) => {
    // Auto-detect database type from connection string
    const detectedType = detectDatabaseType(value);
    
    setFormData(prev => ({
      ...prev,
      connectionString: value,
      // Only update database type if we detected a specific type
      // This prevents switching to MongoDB when the string is incomplete
      databaseType: detectedType || prev.databaseType
    }));

    // Auto-generate name if it's empty and we're creating a new connection
    if (mode === 'create' && !formData.name.trim()) {
      const autoName = generateConnectionName(value);
      setFormData(prev => ({
        ...prev,
        name: autoName
      }));
    }
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

  const exampleConnections = exampleConnectionsByType[formData.databaseType] || exampleConnectionsByType.mongodb;

  const handleExampleSelect = (example) => {
    setFormData(prev => ({
      ...prev,
      name: example.name,
      connectionString: example.uri
    }));
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {mode === 'create' ? 'Create New Connection' : 'Edit Connection'}
          </Typography>
          <IconButton
            onClick={onClose}
            size="small"
            disabled={isSubmitting}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Database Type Selector */}
            <FormControl fullWidth>
              <InputLabel id="database-type-label">Database Type</InputLabel>
              <Select
                labelId="database-type-label"
                value={formData.databaseType}
                label="Database Type"
                onChange={(e) => {
                  setFormData(prev => ({ 
                    ...prev, 
                    databaseType: e.target.value,
                    connectionString: '' // Clear connection string when type changes
                  }));
                }}
                disabled={isSubmitting || mode === 'edit'}
                renderValue={(value) => {
                  const provider = value === 'supabase' ? 'supabase' : value === 'postgresql' ? 'postgresql' : 'mongodb';
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={getDatabaseLogo(provider)}
                        alt={getDatabaseProviderName(provider)}
                        sx={{
                          width: 20,
                          height: 20,
                          bgcolor: 'background.default',
                          border: 1,
                          borderColor: 'divider',
                          '& img': {
                            objectFit: 'contain',
                            p: 0.25
                          }
                        }}
                      />
                      <Typography>{getDatabaseProviderName(provider)}</Typography>
                    </Box>
                  );
                }}
              >
                <MenuItem value="mongodb">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar
                      src={getDatabaseLogo('mongodb')}
                      alt="MongoDB"
                      sx={{
                        width: 24,
                        height: 24,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'divider',
                        '& img': {
                          objectFit: 'contain',
                          p: 0.5
                        }
                      }}
                    />
                    <Typography>{getDatabaseProviderName('mongodb')}</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="postgresql">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar
                      src={getDatabaseLogo('postgresql')}
                      alt="PostgreSQL"
                      sx={{
                        width: 24,
                        height: 24,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'divider',
                        '& img': {
                          objectFit: 'contain',
                          p: 0.5
                        }
                      }}
                    />
                    <Typography>{getDatabaseProviderName('postgresql')}</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="supabase">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar
                      src={getDatabaseLogo('supabase')}
                      alt="Supabase"
                      sx={{
                        width: 24,
                        height: 24,
                        bgcolor: 'background.default',
                        border: 1,
                        borderColor: 'divider',
                        '& img': {
                          objectFit: 'contain',
                          p: 0.5
                        }
                      }}
                    />
                    <Typography>{getDatabaseProviderName('supabase')}</Typography>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* Connection Name */}
            <TextField
              label="Connection Name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={`My ${getDatabaseDisplayName(formData.databaseType)} Connection`}
              error={!!errors.name}
              helperText={errors.name}
              disabled={isSubmitting}
              required
              fullWidth
            />

            {/* Connection String */}
            <TextField
              label={`${getDatabaseDisplayName(formData.databaseType)} Connection String`}
              value={showCredentials || !hasEmbeddedCredentials(formData.connectionString) 
                ? formData.connectionString 
                : maskConnectionCredentials(formData.connectionString)
              }
              onChange={(e) => handleConnectionStringChange(e.target.value)}
              placeholder={
                formData.databaseType === 'mongodb' 
                  ? 'mongodb://localhost:27017 or mongodb+srv://...'
                  : formData.databaseType === 'supabase'
                  ? 'postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres'
                  : 'postgresql://localhost:5432/mydb'
              }
              error={!!errors.connectionString}
              helperText={errors.connectionString}
              disabled={isSubmitting}
              required
              fullWidth
              multiline
              minRows={3}
              maxRows={8}
              sx={{
                '& .MuiInputBase-root': {
                  minHeight: '80px',
                  position: 'relative'
                },
                '& .MuiInputBase-root textarea': {
                  resize: 'vertical !important',
                  minHeight: '80px !important',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  paddingRight: hasEmbeddedCredentials(formData.connectionString) ? '48px !important' : '12px !important'
                }
              }}
              InputProps={hasEmbeddedCredentials(formData.connectionString) ? {
                endAdornment: (
                  <IconButton
                    size="small"
                    onClick={() => setShowCredentials(!showCredentials)}
                    edge="end"
                    disabled={isSubmitting}
                    sx={{ 
                      alignSelf: 'flex-start', 
                      mt: 0.5,
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      zIndex: 1,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)'
                      }
                    }}
                  >
                    {showCredentials ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                ),
              } : undefined}
            />

            {/* Example Connections - only show for new connections */}
            {mode === 'create' && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Quick examples:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {exampleConnections.map((example, index) => (
                    <Paper
                      key={index}
                      sx={{
                        p: 2,
                        cursor: 'pointer',
                        bgcolor: 'action.hover',
                        '&:hover': {
                          bgcolor: 'action.selected'
                        }
                      }}
                      onClick={() => handleExampleSelect(example)}
                      disabled={isSubmitting}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                        {example.name}
                      </Typography>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                        {hasEmbeddedCredentials(example.uri) ? maskConnectionCredentials(example.uri) : example.uri}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            )}

            {/* Submit Error */}
            {errors.submit && (
              <Alert severity="error">
                {errors.submit}
              </Alert>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3 }}>
          <Button
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting && <CircularProgress size={16} />}
          >
            {isSubmitting 
              ? (mode === 'create' ? 'Creating...' : 'Saving...') 
              : (mode === 'create' ? 'Create Connection' : 'Save Changes')
            }
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ConnectionEditModal;