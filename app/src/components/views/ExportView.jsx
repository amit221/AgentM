import React from 'react';
import { Box, Typography, Card, CardContent, Paper } from '@mui/material';
import { FileUpload as ExportIcon } from '@mui/icons-material';

const ExportView = () => {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ExportIcon sx={{ color: 'icon.export' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Export Data
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        <Box sx={{ maxWidth: '4xl', mx: 'auto' }}>
          <Card sx={{ textAlign: 'center', p: 4 }}>
            <CardContent>
              <ExportIcon sx={{ fontSize: 80, color: 'icon.export', mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Export Feature Coming Soon
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Export functionality will be available in a future update.
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

export default ExportView;