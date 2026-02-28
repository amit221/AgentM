import React from 'react';
import { Typography } from '@mui/material';
import DatabaseSelector from '../connection/DatabaseSelector';

/**
 * Database selection screen when connected but no database is selected
 */
const DatabaseSelectionScreen = () => {
  return (
    <>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 300 }}>
        Almost there!
      </Typography>
      <DatabaseSelector />
    </>
  );
};

export default DatabaseSelectionScreen;
