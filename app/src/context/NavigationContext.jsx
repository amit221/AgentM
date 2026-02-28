import React, { createContext, useContext } from 'react';

// Create navigation context
const NavigationContext = createContext();

// Navigation provider component
export function NavigationProvider({ children, currentView, setCurrentView, onOpenConnectionsDialog }) {
  const navigateTo = (view) => {
    setCurrentView(view);
  };

  const openConnectionsDialog = () => {
    if (onOpenConnectionsDialog) {
      onOpenConnectionsDialog();
    }
  };

  const value = {
    currentView,
    navigateTo,
    setCurrentView, // Keep the original function for backward compatibility
    openConnectionsDialog
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

// Custom hook to use navigation
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

export default NavigationContext;