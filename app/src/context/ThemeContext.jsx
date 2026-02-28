import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '../theme/muiTheme';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const AppThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    // Check for saved theme preference or default to light mode
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    // Default to light mode, with system preference as fallback
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      // Fallback to light mode if matchMedia is not available
      return false;
    }
  });

  // Load theme preference from electron storage on mount
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        if (window.electronAPI?.storage?.loadAppState) {
          const result = await window.electronAPI.storage.loadAppState();
          if (result.success && result.appState && typeof result.appState.isDarkMode === 'boolean') {
            setDarkMode(result.appState.isDarkMode);
            localStorage.setItem('theme', result.appState.isDarkMode ? 'dark' : 'light');
          }
        }
      } catch (error) {
        console.warn('Failed to load theme preference from electron storage:', error);
      }
    };

    loadThemePreference();
  }, []);

  const toggleDarkMode = useMemo(() => () => {
    setDarkMode(prev => {
      const newMode = !prev;
      localStorage.setItem('theme', newMode ? 'dark' : 'light');
      
      // Also save to electron storage for consistency
      if (window.electronAPI?.storage?.saveAppState) {
        window.electronAPI.storage.saveAppState({ isDarkMode: newMode }).catch(err => {
          console.warn('Failed to save theme preference:', err);
        });
      }
      
      return newMode;
    });
  }, []);

  // Update document class for compatibility with existing dark mode logic
  useEffect(() => {
    // Add transition class for smooth theme switching
    document.documentElement.style.transition = 'background-color 0.2s ease-in-out, color 0.2s ease-in-out';
    
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Remove transition after a short delay to avoid interfering with other animations
    const timeoutId = setTimeout(() => {
      document.documentElement.style.transition = '';
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [darkMode]);

  // Memoize theme creation to prevent recreation on every render
  const theme = useMemo(() => createAppTheme(darkMode ? 'dark' : 'light'), [darkMode]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    darkMode,
    toggleDarkMode,
    theme,
  }), [darkMode, toggleDarkMode, theme]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};