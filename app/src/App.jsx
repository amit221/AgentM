import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import TopToolbar from './components/layout/TopToolbar';
import DatabaseTree from './components/layout/DatabaseTree';
import MainContent from './components/MainContent';
import ConnectionsDialog from './components/dialogs/ConnectionsDialog';
import NotificationCenter from './components/notifications/NotificationCenter';
import ResizeHandle from './components/ui/ResizeHandle';
import { DatabaseProvider } from './context/DatabaseContext';
import { QueryProvider } from './context/QueryContext';
import { ClipboardProvider } from './context/ClipboardContext';
import { NavigationProvider } from './context/NavigationContext';
import { AppThemeProvider } from './context/ThemeContext';
import useResizableSidebar from './hooks/useResizableSidebar';

// Main authenticated app content
function AuthenticatedApp() {
  const [currentView, setCurrentView] = useState('query');
  const [connectionsDialogOpen, setConnectionsDialogOpen] = useState(false);
  const [connectionsDialogMode, setConnectionsDialogMode] = useState('history');

  // Resizable sidebar functionality
  const { sidebarWidth, isResizing, startResize, resetWidth } = useResizableSidebar(256, 200, 600);

  // Load saved app preferences on mount (but always start with query view)
  useEffect(() => {
    const loadAppPreferences = async () => {
      try {
        const result = await window.electronAPI.storage.loadAppState();
        if (result.success && result.appState) {
          // Always start with query view regardless of saved state
          setCurrentView('query');
        }
      } catch (error) {
        console.warn('Failed to load app preferences:', error);
        // Ensure we default to query view even if loading fails
        setCurrentView('query');
      }
    };

    loadAppPreferences();
  }, []);

  // Save app preferences when they change
  useEffect(() => {
    const saveAppPreferences = async () => {
      try {
        const appState = {
          currentView
        };

        await window.electronAPI.storage.saveAppState(appState);
      } catch (error) {
        console.warn('Failed to save app preferences:', error);
      }
    };

    // Debounce saving to avoid excessive writes
    const timeoutId = setTimeout(saveAppPreferences, 500);
    return () => clearTimeout(timeoutId);
  }, [currentView]);

  // Handle connections dialog
  const handleOpenConnectionsDialog = (mode = 'history') => {
    setConnectionsDialogOpen(true);
    // Store the mode in a ref or state to pass to the dialog
    setConnectionsDialogMode(mode);
  };

  const handleCloseConnectionsDialog = () => {
    setConnectionsDialogOpen(false);
    setConnectionsDialogMode('history');
  };

  return (
    <NavigationProvider currentView={currentView} setCurrentView={setCurrentView} onOpenConnectionsDialog={handleOpenConnectionsDialog}>
      <DatabaseProvider>
        <QueryProvider>
          <ClipboardProvider>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
              {/* Top Toolbar */}
              <TopToolbar
                currentView={currentView}
                setCurrentView={setCurrentView}
                onOpenConnectionsDialog={handleOpenConnectionsDialog}
              />
              
              {/* Main Layout */}
              <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Sidebar - Database Tree */}
                <Box
                  sx={{
                    width: `${sidebarWidth}px`,
                    height: '100%',
                    display: 'flex',
                    flexShrink: 0,
                    bgcolor: 'background.paper',
                    transition: isResizing ? 'none' : 'width 150ms',
                  }}
                >
                  <Box sx={{ flex: 1, overflow: 'hidden', height: '100%' }}>
                    <DatabaseTree setCurrentView={setCurrentView} />
                  </Box>
                  
                  {/* Resize Handle */}
                  <ResizeHandle 
                    onMouseDown={startResize}
                    onDoubleClick={resetWidth}
                    isResizing={isResizing}
                    currentWidth={Math.round(sidebarWidth)}
                  />
                </Box>
                
                {/* Main Content */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <MainContent currentView={currentView} setCurrentView={setCurrentView} />
                </Box>
              </Box>
              
              {/* Notification Center */}
              <NotificationCenter />

              {/* Connections Dialog */}
              <ConnectionsDialog
                open={connectionsDialogOpen}
                onClose={handleCloseConnectionsDialog}
                initialMode={connectionsDialogMode}
              />

            </Box>
          </ClipboardProvider>
        </QueryProvider>
      </DatabaseProvider>
    </NavigationProvider>
  );
}

function App() {
  return (
    <AppThemeProvider>
      <AuthenticatedApp />
    </AppThemeProvider>
  );
}

export default App;