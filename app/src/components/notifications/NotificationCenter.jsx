import React from 'react';
import { Snackbar, Alert, IconButton, Box } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useClipboardSafe } from '../../context/ClipboardContext';

const NotificationCenter = () => {
  const context = useClipboardSafe();
  
  // Return early if context is not available (during hot reloading)
  if (!context) {
    return null;
  }
  
  const { notifications, removeNotification } = context;
  
  if (notifications.length === 0) return null;

  return (
    <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 9999 }}>
      {notifications.map((notification, index) => (
        <Snackbar
          key={notification.id}
          open={true}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          sx={{ 
            position: 'static',
            marginBottom: index > 0 ? 1 : 0,
            transform: 'none !important',
          }}
        >
          <Alert
            severity={notification.type}
            variant="filled"
            action={
              <IconButton
                size="small"
                aria-label="close"
                color="inherit"
                onClick={() => removeNotification(notification.id)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            }
            sx={{
              minWidth: '256px',
              maxWidth: '320px',
              '& .MuiAlert-message': {
                fontSize: '0.875rem',
              },
            }}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      ))}
    </Box>
  );
};

export default NotificationCenter;