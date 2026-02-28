import React from 'react';
import { Card, CardContent, Box, Chip, Typography, IconButton } from '@mui/material';

const QueryListItem = ({
  id,
  database,
  timestampLabel,
  resultsSummary,
  prompt,
  onClick,
  rightActions,
  selected = false,
}) => {
  return (
    <Card 
      sx={{
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: selected ? 2 : 1,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.light' : 'background.paper',
        '&:hover': {
          bgcolor: selected ? 'primary.light' : 'action.hover',
          elevation: 2,
        },
      }}
      onClick={onClick}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
              <Chip label={database || 'Unknown DB'} color="primary" size="small" variant="outlined" />
              {timestampLabel && (
                <Typography variant="caption" color="text.secondary">
                  {timestampLabel}
                </Typography>
              )}
              {resultsSummary && (
                <Typography variant="caption" color="text.secondary">
                  {resultsSummary}
                </Typography>
              )}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              {prompt}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, ml: 2 }}>
            {rightActions}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default QueryListItem;


