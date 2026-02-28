import React, { useState } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { TextField } from '../ui/MUIComponents';
import {
  Star as FavoriteIcon,
  Search as SearchIcon,
  ContentCopy as CopyIcon,
  PlayArrow as ExecuteIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useQuery } from '../../context/QueryContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useClipboard } from '../../context/ClipboardContext';
import { formatTimestamp } from '../../utils/formatters';
import EmptyStateCard from '../common/EmptyStateCard';
import QueryList from '../common/QueryList';

const FavoritesView = ({ setCurrentView }) => {
  const { favorites, removeFromFavorites } = useQuery();
  const { addNotification } = useClipboard();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter favorites based on search query
  const filteredFavorites = favorites.filter(query => {
    const matchesSearch = !searchQuery || 
      query.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      query.database.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  const handleDelete = (item) => removeFromFavorites(item.id);

  if (favorites.length === 0) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FavoriteIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Favorite Queries
            </Typography>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          <Box sx={{ maxWidth: '4xl', mx: 'auto' }}>
            <EmptyStateCard
              icon={<FavoriteIcon sx={{ fontSize: 80, color: '#ffc107' }} />}
              title="No Favorites Yet"
              subtitle="Add queries to your favorites to quickly access them later."
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
          <FavoriteIcon sx={{ color: '#ffc107' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Favorite Queries
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({favorites.length} total)
          </Typography>
        </Box>
        
        {/* Search */}
        <Box sx={{ p: 2 }}>
          <TextField
          fullWidth
          size="small"
          placeholder="Search favorites..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr:1, color: 'text.secondary' }} />
          }}
          />
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        <Box sx={{ maxWidth: '6xl', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredFavorites.length === 0 ? (
            <Card sx={{ textAlign: 'center', p: 4 }}>
              <CardContent>
                <SearchIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  No Matching Favorites
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Try adjusting your search criteria.
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <QueryList
              items={filteredFavorites}
              onDelete={handleDelete}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default FavoritesView;