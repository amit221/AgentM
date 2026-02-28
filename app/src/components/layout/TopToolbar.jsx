import React, { useMemo } from 'react';
import { 
  AppBar, 
  Toolbar, 
  IconButton, 
  Typography, 
  Box, 
  ToggleButton, 
  ToggleButtonGroup,
  Tooltip
} from '@mui/material';
import {
  Link as LinkIcon,
  QuestionAnswer as QuestionAnswerIcon,
  Dashboard as DashboardIcon,
  History as HistoryIcon,
  Star as StarIcon,
  Settings as SettingsIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  TableChart as SpreadsheetIcon
} from '@mui/icons-material';
import { useTheme } from '../../context/ThemeContext';
const TopToolbar = React.memo(({ currentView, setCurrentView, onOpenConnectionsDialog }) => {
  const { theme, darkMode, toggleDarkMode } = useTheme();

  const handleConnectionsClick = () => {
    onOpenConnectionsDialog();
  };

  const toolbarItems = useMemo(() => [
    { id: 'query', label: 'Agent', icon: <QuestionAnswerIcon sx={{ color: 'icon.query' }} />, description: 'Natural language queries' },
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon sx={{ color: 'icon.dashboard' }} />, description: 'Data dashboards and widgets' },
    { id: 'spreadsheet', label: 'Spreadsheet', icon: <SpreadsheetIcon sx={{ color: 'icon.spreadsheet' }} />, description: 'Import spreadsheets with AI' },
    { id: 'history', label: 'History', icon: <HistoryIcon sx={{ color: 'icon.history' }} />, description: 'Query history' },
    { id: 'favorites', label: 'Favorites', icon: <StarIcon sx={{ color: 'icon.favorite' }} />, description: 'Favorite queries' }
  ], []);

  return (
    <AppBar 
      position="static" 
      elevation={0}
      sx={{ 
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        color: 'text.primary',
        borderRadius: 0
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', minHeight: '56px !important', px: 2 }}>
        {/* Main Toolbar Items */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Connections Button (opens dialog) */}
          <Tooltip title="Manage database connections" arrow>
            <ToggleButton
              value="connections"
              selected={false}
              onClick={handleConnectionsClick}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                px: 2,
                py: 1,
                minWidth: '60px',
                border: 'none',
                borderRadius: 1,
                textTransform: 'none',
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: 'action.hover',
                  color: 'text.primary',
                },
              }}
            >
              <Box sx={{ mb: 0.5 }}>
                <LinkIcon sx={{ color: 'icon.connection' }} />
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                Connect
              </Typography>
            </ToggleButton>
          </Tooltip>

          {/* Other Toolbar Items */}
          <ToggleButtonGroup
            value={currentView}
            exclusive
            onChange={(_, newView) => newView && setCurrentView(newView)}
            size="small"
            sx={{ gap: 1 }}
          >
            {toolbarItems.map((item) => (
              <Tooltip key={item.id} title={item.description} arrow>
                <ToggleButton
                  value={item.id}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    px: 2,
                    py: 1,
                    minWidth: '60px',
                    border: 'none',
                    borderRadius: 1,
                    textTransform: 'none',
                    '&.Mui-selected': {
                      bgcolor: theme.palette.primary.main + '1a',
                      color: theme.palette.primary.main,
                      '&:hover': {
                        bgcolor: theme.palette.primary.main + '2a',
                      },
                    },
                    '&:not(.Mui-selected)': {
                      color: 'text.secondary',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        color: 'text.primary',
                      },
                    },
                  }}
                >
                  <Box sx={{ mb: 0.5 }}>{item.icon}</Box>
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {item.label}
                  </Typography>
                </ToggleButton>
              </Tooltip>
            ))}
          </ToggleButtonGroup>
        </Box>

        {/* Right Side Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Settings Button */}
          <Tooltip title="Application settings" arrow>
            <ToggleButton
              value="settings"
              selected={currentView === 'settings'}
              onClick={() => setCurrentView('settings')}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 1.5,
                py: 1,
                minWidth: '40px',
                border: 'none',
                borderRadius: 1,
                textTransform: 'none',
                '&.Mui-selected': {
                  bgcolor: theme.palette.primary.main + '1a',
                  color: theme.palette.primary.main,
                  '&:hover': {
                    bgcolor: theme.palette.primary.main + '2a',
                  },
                },
                '&:not(.Mui-selected)': {
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: 'action.hover',
                    color: 'text.primary',
                  },
                },
              }}
            >
              <SettingsIcon sx={{ color: 'icon.settings' }} />
            </ToggleButton>
          </Tooltip>

          {/* Dark Mode Toggle */}
          <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} arrow>
            <IconButton
              onClick={toggleDarkMode}
              size="small"
              sx={{ 
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: 'action.hover',
                  color: 'text.primary',
                }
              }}
            >
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>

        </Box>
      </Toolbar>
    </AppBar>
  );
});

export default TopToolbar;