import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  Paper,
  Divider,
  IconButton,
  Collapse,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Checkbox,
  Tooltip
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Storage as DatabaseIcon,
  Delete as DeleteIcon,
  Build as ToolIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { useClipboard } from '../../context/ClipboardContext';
import { useQuery } from '../../context/QueryContext';
import ConfirmDialog from '../dialogs/ConfirmDialog';
import { Stack } from '@mui/material';
import ClearItemTile from '../settings/ClearItemTile';
import SectionHeader from '../settings/SectionHeader';
import ClearAllBlock from '../settings/ClearAllBlock';

const SettingsView = () => {
  const { connections, activeConnections, clearAllSchemas } = useDatabase();
  const { addNotification } = useClipboard();
  const { settings, updateSettings, clearAllConversationSchemas } = useQuery();
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isClearingSchemas, setIsClearingSchemas] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [clearBusy, setClearBusy] = useState({ all: false, conv: false, hist: false, fav: false, app: false, conn: false });
  const [appVersion, setAppVersion] = useState('Loading...');

  // Fetch app version on component mount
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.electronAPI.getVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
        setAppVersion('Unknown');
      }
    };

    fetchVersion();
  }, []);

  const handleSettingChange = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    
    setIsSavingSettings(true);
    try {
      const result = await updateSettings(newSettings);
      if (!result.success) {
        console.error('Error saving settings:', result.error);
        addNotification('Failed to save settings', 'error');
      } else {
        addNotification('Settings saved successfully', 'success');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      addNotification('Failed to save settings', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };



  const handleClearSchemas = async () => {
    setIsClearingSchemas(true);
    try {
      const result = await window.electronAPI.storage.clearAllCollectionSchemas();
      
      if (result && result.success) {
        // Clear in-memory schema cache from DatabaseContext
        if (clearAllSchemas) {
          clearAllSchemas();
        }
        
        // Clear conversation-level schemas from QueryContext
        if (clearAllConversationSchemas) {
          clearAllConversationSchemas();
        }
        
        addNotification('Schema storage cleared successfully', 'success');
      } else {
        addNotification('Failed to clear schema storage: ' + (result?.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error clearing schemas:', error);
      addNotification('Failed to clear schema storage: ' + error.message, 'error');
    } finally {
      setIsClearingSchemas(false);
    }
  };

  // Reusable tile for clear operations
  const ClearItem = ({ title, description, busy, onClick, tooltipLabel }) => (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 220 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{description}</Typography>
        </Box>
        <Tooltip title={tooltipLabel} placement="top">
          <span>
            <IconButton
              color="error"
              onClick={onClick}
              disabled={busy}
              aria-label={tooltipLabel}
            >
              {busy ? <CircularProgress size={18} /> : <DeleteIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SettingsIcon sx={{ color: 'icon.settings' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Settings
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        <Box sx={{ maxWidth: '4xl', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          


          {/* General Settings */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ToolIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  General Settings
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Query Limit
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Maximum number of documents to return for queries without explicit limit
                    </Typography>
                  </Box>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={settings.queryLimit}
                      onChange={(e) => handleSettingChange('queryLimit', parseInt(e.target.value))}
                      disabled={isSavingSettings}
                    >
                      <MenuItem value={20}>20</MenuItem>
                      <MenuItem value={50}>50</MenuItem>
                      <MenuItem value={100}>100</MenuItem>
                      <MenuItem value={500}>500</MenuItem>
                      <MenuItem value={1000}>1000</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Query Timeout
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Maximum time in seconds for query execution (queries can override this setting)
                    </Typography>
                  </Box>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={settings.queryTimeout || 60}
                      onChange={(e) => handleSettingChange('queryTimeout', parseInt(e.target.value))}
                      disabled={isSavingSettings}
                    >
                      <MenuItem value={30}>30s</MenuItem>
                      <MenuItem value={60}>60s</MenuItem>
                      <MenuItem value={300}>5min</MenuItem>
                      <MenuItem value={600}>10min</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Auto-execute queries
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Automatically run generated read queries (find, count, etc.) - write operations require manual execution
                    </Typography>
                  </Box>
                  <Checkbox
                    checked={settings.autoExecuteQueries}
                    onChange={(e) => handleSettingChange('autoExecuteQueries', e.target.checked)}
                    disabled={isSavingSettings}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Save query history
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Keep a history of your queries
                    </Typography>
                  </Box>
                  <Checkbox
                    checked={settings.saveQueryHistory}
                    onChange={(e) => handleSettingChange('saveQueryHistory', e.target.checked)}
                    disabled={isSavingSettings}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      AI Field Descriptions
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Generate AI-powered descriptions for database fields (costs 3 credits per collection)
                    </Typography>
                  </Box>
                  <Checkbox
                    checked={settings.enableAIFieldDescriptions || false}
                    onChange={(e) => handleSettingChange('enableAIFieldDescriptions', e.target.checked)}
                    disabled={isSavingSettings}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Storage Management */}
          <Card>
            <CardContent>
              <SectionHeader icon={DatabaseIcon} title="Storage Management" />

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Clear specific storage sections or all data. This will not remove API keys unless you clear settings separately.
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                All storage is saved locally and encrypted.
              </Alert>

              <Stack spacing={1} direction="column">
                <ClearAllBlock
                  busy={clearBusy.all}
                  onConfirm={() => setConfirmDialog({
                    open: true,
                    title: 'Clear All Storage',
                    message: 'This will clear conversations, history, favorites, app state, and connections. Continue? ',
                    onConfirm: async () => {
                      setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
                      setClearBusy(prev => ({ ...prev, all: true }));
                      try { 
                        await window.electronAPI.storage.clearAll(); 
                        // Refresh the window after clearing all storage
                        window.location.reload();
                      } finally { 
                        setClearBusy(prev => ({ ...prev, all: false })); 
                      }
                    }
                  })}
                />

                <Divider sx={{ my: 1 }} />

                <Grid container spacing={2} sx={{ width: '100%' }}>
                  <Grid item xs={12} sx={{ width: '100%' }}>
                    <ClearItemTile
                      title="Conversations"
                      description="Removes all conversations and resets the chat workspace."
                      busy={clearBusy.conv}
                      tooltipLabel="Clear Conversations"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: 'Clear Conversations',
                        message: 'Clear all conversations and reset to defaults?',
                        onConfirm: async () => {
                          setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
                          setClearBusy(prev => ({ ...prev, conv: true }));
                          try { 
                            await window.electronAPI.storage.clearConversations(); 
                          } finally { 
                            setClearBusy(prev => ({ ...prev, conv: false })); 
                          }
                        }
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sx={{ width: '100%' }}>
                    <ClearItemTile
                      title="History"
                      description="Deletes the saved query history."
                      busy={clearBusy.hist}
                      tooltipLabel="Clear History"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: 'Clear History',
                        message: 'Remove all saved query history?',
                        onConfirm: async () => {
                          setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
                          setClearBusy(prev => ({ ...prev, hist: true }));
                          try { 
                            await window.electronAPI.storage.clearHistory(); 
                          } finally { 
                            setClearBusy(prev => ({ ...prev, hist: false })); 
                          }
                        }
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sx={{ width: '100%' }}>
                    <ClearItemTile
                      title="Favorites"
                      description="Removes all saved favorite queries."
                      busy={clearBusy.fav}
                      tooltipLabel="Clear Favorites"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: 'Clear Favorites',
                        message: 'Remove all favorite queries?',
                        onConfirm: async () => {
                          setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
                          setClearBusy(prev => ({ ...prev, fav: true }));
                          try { 
                            await window.electronAPI.storage.clearFavorites(); 
                          } finally { 
                            setClearBusy(prev => ({ ...prev, fav: false })); 
                          }
                        }
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sx={{ width: '100%' }}>
                    <ClearItemTile
                      title="App State"
                      description="Resets UI preferences and app layout."
                      busy={clearBusy.app}
                      tooltipLabel="Clear App State"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: 'Clear App State',
                        message: 'Reset UI preferences and state to defaults?',
                        onConfirm: async () => {
                          setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
                          setClearBusy(prev => ({ ...prev, app: true }));
                          try { 
                            await window.electronAPI.storage.clearAppState(); 
                            window.location.reload();
                          } finally { 
                            setClearBusy(prev => ({ ...prev, app: false })); 
                          }
                        }
                      })}
                    />
                  </Grid>
                  <Grid item xs={12} sx={{ width: '100%' }}>
                    <ClearItemTile
                      title="Connections"
                      description="Removes all saved database connections."
                      busy={clearBusy.conn}
                      tooltipLabel="Clear Connections"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: 'Clear Connections',
                        message: 'Remove all saved connections?',
                        onConfirm: async () => {
                          setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
                          setClearBusy(prev => ({ ...prev, conn: true }));
                          try { 
                            await window.electronAPI.storage.clearConnections(); 
                            window.location.reload();
                          } finally { 
                            setClearBusy(prev => ({ ...prev, conn: false })); 
                          }
                        }
                      })}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 1 }} />

                {/* Schema Tools */}
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>Schema Tools</Typography>
                <Grid container spacing={2} sx={{ width: '100%' }}>
                  <Grid item xs={12} sx={{ width: '100%' }}>
                    <Paper variant="outlined" sx={{ p: 2, width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                        <Box sx={{ minWidth: 220 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Schemas</Typography>
                          <Typography variant="caption" color="text.secondary">Deletes cached collection schemas. They will be re-generated automatically when needed.</Typography>
                        </Box>
                        <Tooltip title="Clear Schemas" placement="top">
                          <span>
                            <IconButton
                              onClick={handleClearSchemas}
                              disabled={isClearingSchemas}
                              color="error"
                              aria-label="Clear Schemas"
                            >
                              {isClearingSchemas ? <CircularProgress size={18} /> : <DeleteIcon />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          {/* App Information */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InfoIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  App Information
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Version
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Current application version
                    </Typography>
                  </Box>
                  <Chip 
                    label={`v${appVersion}`}
                    variant="outlined"
                    size="small"
                    sx={{ 
                      fontFamily: 'monospace',
                      borderColor: 'primary.main',
                      color: 'primary.main',
                      fontWeight: 600
                    }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>

        </Box>
      </Box>
      
      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null })}
      />
    </Box>
  );
};

export default SettingsView;