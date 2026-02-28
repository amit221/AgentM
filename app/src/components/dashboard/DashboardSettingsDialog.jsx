import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material';
import {
  Settings as SettingsIcon
} from '@mui/icons-material';
import { 
  REFRESH_INTERVALS,
  getRefreshIntervalDisplayName
} from '../../types/dashboardTypes';
import { saveDashboardSettings } from '../../services/dashboardStorageService';

/**
 * Dialog for configuring dashboard settings
 */
const DashboardSettingsDialog = ({ open, onClose, settings, onSettingsChanged }) => {
  const [localSettings, setLocalSettings] = useState({
    autoRefresh: true,
    refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
    gridCompact: true,
    showWidgetTitles: true,
    ...settings
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        autoRefresh: true,
        refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
        gridCompact: true,
        showWidgetTitles: true,
        ...settings
      });
    }
  }, [settings]);

  const handleSettingChange = (key, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveDashboardSettings(localSettings);
      if (result.success) {
        if (onSettingsChanged) {
          onSettingsChanged();
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to save dashboard settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setLocalSettings({
      autoRefresh: true,
      refreshInterval: REFRESH_INTERVALS.FIVE_MINUTES,
      gridCompact: true,
      showWidgetTitles: true,
      ...settings
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          Dashboard Settings
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 1 }}>
          
          {/* Auto Refresh Settings */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Auto Refresh
            </Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={localSettings.autoRefresh}
                  onChange={(e) => handleSettingChange('autoRefresh', e.target.checked)}
                />
              }
              label="Enable automatic widget refresh"
            />

            {localSettings.autoRefresh && (
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Default Refresh Interval</InputLabel>
                <Select
                  value={localSettings.refreshInterval}
                  label="Default Refresh Interval"
                  onChange={(e) => handleSettingChange('refreshInterval', e.target.value)}
                >
                  {Object.entries(REFRESH_INTERVALS)
                    .filter(([key]) => key !== 'NEVER')
                    .map(([key, value]) => (
                    <MenuItem key={key} value={value}>
                      {getRefreshIntervalDisplayName(value)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          <Divider />

          {/* Layout Settings */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Layout
            </Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={localSettings.gridCompact}
                  onChange={(e) => handleSettingChange('gridCompact', e.target.checked)}
                />
              }
              label="Compact grid layout"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={localSettings.showWidgetTitles}
                  onChange={(e) => handleSettingChange('showWidgetTitles', e.target.checked)}
                />
              }
              label="Show widget titles"
            />
          </Box>

          <Divider />

          {/* Display Settings */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Display
            </Typography>
            
            <Typography variant="body2" color="text.secondary">
              More display options coming soon...
            </Typography>
          </Box>

        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancel}>
          Cancel
        </Button>
        <Button 
          variant="contained" 
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DashboardSettingsDialog;
