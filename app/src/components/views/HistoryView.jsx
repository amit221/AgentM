import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography, Select, MenuItem, FormControl, Card, CardContent, Grid } from '@mui/material';
import { TextField } from '../ui/MUIComponents';
import { History as HistoryIcon, Search as SearchIcon } from '@mui/icons-material';
import { useQuery } from '../../context/QueryContext';
import { useDatabase } from '../../context/DatabaseContext';
import { formatTimestamp } from '../../utils/formatters';
import EmptyStateCard from '../common/EmptyStateCard';
import QueryList from '../common/QueryList';

const HistoryView = ({ setCurrentView }) => {
  const { queryHistory, conversations, activeConversation, updateCurrentPrompt, updateCurrentQuery, removeFromHistory } = useQuery();
  const { setSelectedDatabase } = useDatabase();
  const [selectedConversation, setSelectedConversation] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef(null);

  // Filter and sort history based on selected conversation and search query
  const filteredHistory = queryHistory
    .filter(query => {
      const matchesConversation = selectedConversation === 'all' || 
        conversations.find(conv => conv.queries.some(q => q.id === query.id))?.id === selectedConversation;
      
      const matchesSearch = !searchQuery || 
        query.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        query.database.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesConversation && matchesSearch;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort newest first

  // Simplified view: no actions

  // Function to apply selected query to current conversation
  const handleSelectQuery = (query) => {
    if (!activeConversation) return;
    
    // Set both the prompt and generated query
    updateCurrentPrompt(activeConversation.id, query.prompt);
    updateCurrentQuery(activeConversation.id, query.generatedQuery);
    
    // Navigate to the QueryView (Queries)
    setCurrentView('query');
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (filteredHistory.length === 0) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredHistory.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < filteredHistory.length) {
            handleSelectQuery(filteredHistory[selectedIndex]);
          }
          break;
        case 'Escape':
          setSelectedIndex(-1);
          break;
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [filteredHistory, selectedIndex, activeConversation, updateCurrentPrompt, updateCurrentQuery, setCurrentView]);

  // Reset selected index when search or filter changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchQuery, selectedConversation]);

  if (queryHistory.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <HistoryIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Query History
            </Typography>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          <Box sx={{ maxWidth: '4xl', mx: 'auto' }}>
            <EmptyStateCard
              icon={<HistoryIcon sx={{ fontSize: 80, color: 'icon.history' }} />}
              title="No History Yet"
              subtitle="Your query history will appear here once you start running queries."
            />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <HistoryIcon sx={{ color: 'icon.history' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Query History
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({queryHistory.length} total)
          </Typography>
        </Box>
        
        {/* Filters */}
        <Box sx={{ p: 2 }}>
          <Grid container spacing={2}>
          {/* Search */}
          <Grid item xs={12} sm={8}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
            />
          </Grid>
          
          {/* Conversation Filter */}
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <Select
                value={selectedConversation}
                onChange={(e) => setSelectedConversation(e.target.value)}
                displayEmpty
              >
                <MenuItem value="all">All Conversations</MenuItem>
                {conversations.map(conv => (
                  <MenuItem key={conv.id} value={conv.id}>
                    {conv.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          </Grid>
        </Box>
      </Box>

      {/* Content */}
      <Box 
        ref={containerRef}
        sx={{ flex: 1, p: 3, overflow: 'auto' }}
        tabIndex={0}
      >
        <Box sx={{ maxWidth: '6xl', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredHistory.length === 0 ? (
            <Card sx={{ textAlign: 'center', p: 4 }}>
              <CardContent>
                <SearchIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  No Matching Queries
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Try adjusting your search or filter criteria.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <QueryList items={filteredHistory} onDelete={(item) => removeFromHistory(item.id)} />
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default HistoryView;