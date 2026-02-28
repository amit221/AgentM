import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

const EmptyStateCard = ({ icon, title, subtitle }) => {
  return (
    <Card sx={{ textAlign: 'center', p: 4 }}>
      <CardContent>
        <Box sx={{ mb: 2 }}>{icon}</Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body1" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default EmptyStateCard;


