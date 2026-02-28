import React from 'react';
import { Box, Typography, Card, CardContent, Paper } from '@mui/material';
import { FileDownload as ImportIcon } from '@mui/icons-material';

const ImportView = () => {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ImportIcon sx={{ color: 'icon.import' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Import Data
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        <Box sx={{ maxWidth: '4xl', mx: 'auto' }}>
          <Card sx={{ textAlign: 'center', p: 4 }}>
            <CardContent>
              <ImportIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                Import Feature Coming Soon
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Import functionality will be available in a future update.
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

export default ImportView;