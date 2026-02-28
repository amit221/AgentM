import React from 'react';
import { Box } from '@mui/material';
import QueryViewChatUI from './views/QueryViewChatUI';
import HistoryView from './views/HistoryView';
import FavoritesView from './views/FavoritesView';
import SettingsView from './views/SettingsView';
import ExportView from './views/ExportView';
import ImportView from './views/ImportView';
import SpreadsheetView from './views/SpreadsheetView';
import DashboardView from './views/DashboardView';
import { useQuery } from '../context/QueryContext';

const MainContent = ({ currentView, setCurrentView }) => {
  const { activeConversationId, conversations } = useQuery();
  
  // Debug logging (remove in production)
  // console.log('🔍 MainContent Debug:', {
  //   currentView,
  //   conversationsLength: conversations.length,
  //   activeConversationId
  // });

  const renderView = () => {
    switch (currentView) {
      case 'query':
        // Use the new Chat UI component that handles its own tabs and layout
        return (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <QueryViewChatUI />
          </Box>
        );
      case 'history':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <HistoryView setCurrentView={setCurrentView} />
          </Box>
        );
      case 'favorites':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <FavoritesView setCurrentView={setCurrentView} />
          </Box>
        );
      case 'settings':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <SettingsView />
          </Box>
        );
      case 'export':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <ExportView />
          </Box>
        );
      case 'import':
        return (
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <ImportView />
          </Box>
        );
      case 'spreadsheet':
        return (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <SpreadsheetView />
          </Box>
        );
      case 'dashboard':
        return (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <DashboardView />
          </Box>
        );
      default:
        // Use the new Chat UI component that handles its own tabs and layout
        return (
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <QueryViewChatUI />
          </Box>
        );
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      {renderView()}
    </Box>
  );
};

export default MainContent;