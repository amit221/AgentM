import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Paper,
  MenuList,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box
} from '@mui/material';

const ContextMenu = ({ isOpen, position, onClose, items }) => {
  const menuRef = useRef(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [isPositioned, setIsPositioned] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, onClose]);

  // Reset positioning state when menu closes
  useEffect(() => {
    if (!isOpen) {
      setIsPositioned(false);
    }
  }, [isOpen]);

  // Adjust position to prevent menu from going off-screen
  // Using useLayoutEffect to calculate position before browser paints
  useLayoutEffect(() => {
    if (isOpen && menuRef.current) {
      const menuElement = menuRef.current;
      const rect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 8; // Padding from viewport edges
      
      let newX = position.x;
      let newY = position.y;
      
      // Adjust horizontal position if menu would go off-screen
      if (position.x + rect.width > viewportWidth - padding) {
        // Position to the left of the click point
        newX = position.x - rect.width;
      }
      // Ensure menu doesn't go off the left edge
      if (newX < padding) {
        newX = padding;
      }
      
      // Adjust vertical position if menu would go off-screen
      if (position.y + rect.height > viewportHeight - padding) {
        // Position above the click point
        newY = viewportHeight - rect.height - padding;
      }
      // Ensure menu doesn't go off the top edge
      if (newY < padding) {
        newY = padding;
      }
      
      setAdjustedPosition({ x: newX, y: newY });
      setIsPositioned(true);
    } else if (!isOpen) {
      setAdjustedPosition(position);
      setIsPositioned(false);
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <Paper
      ref={menuRef}
      elevation={8}
      sx={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1300,
        minWidth: 160,
        maxWidth: 280,
        py: 1,
        // Hide menu until position is calculated to prevent flash at wrong position
        visibility: isPositioned ? 'visible' : 'hidden',
        opacity: isPositioned ? 1 : 0,
      }}
    >
      <MenuList dense>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {item.type === 'separator' ? (
              <Divider sx={{ my: 0.5 }} />
            ) : (
              <MenuItem
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                disabled={item.disabled}
                sx={{
                  py: 1,
                  px: 2,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                  '&.Mui-disabled': {
                    opacity: 0.5,
                  },
                }}
              >
                {item.icon && (
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Typography component="span" sx={{ fontSize: '1rem' }}>
                      {item.icon}
                    </Typography>
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    variant: 'body2',
                    sx: { fontWeight: 400 }
                  }}
                />
                {item.shortcut && (
                  <Box sx={{ ml: 2 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.75rem' }}
                    >
                      {item.shortcut}
                    </Typography>
                  </Box>
                )}
              </MenuItem>
            )}
          </React.Fragment>
        ))}
      </MenuList>
    </Paper>
  );
};

export default ContextMenu;