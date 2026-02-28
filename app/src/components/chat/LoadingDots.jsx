import React, { memo } from 'react';
import { Box } from '@mui/material';

const LoadingDots = memo(() => {
  return (
    <Box 
      sx={{
        display: 'flex',
        px: 3,
        py: 2,
        mt: 0.5,
        gap: 0.5,
        alignItems: 'center',
        ml: 1
      }}
    >
      {[1, 2, 3].map((dot) => (
        <Box
          key={dot}
          sx={{
            width: '6px',
            height: '6px',
            backgroundColor: 'primary.main',
            borderRadius: '50%',
            animation: 'loadingDots 1.4s infinite',
            animationDelay: `${(dot - 1) * 0.2}s`,
            '@keyframes loadingDots': {
              '0%, 80%, 100%': {
                transform: 'scale(0)',
                opacity: 0.4,
              },
              '40%': {
                transform: 'scale(1)',
                opacity: 1,
              },
            },
          }}
        />
      ))}
    </Box>
  );
});

LoadingDots.displayName = 'LoadingDots';

export default LoadingDots;
