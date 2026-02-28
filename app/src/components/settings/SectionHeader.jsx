import React from 'react';
import { Box, Typography } from '@mui/material';

function SectionHeader({ icon: IconComponent, title }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      {IconComponent ? <IconComponent color="primary" /> : null}
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
    </Box>
  );
}

export default SectionHeader;


