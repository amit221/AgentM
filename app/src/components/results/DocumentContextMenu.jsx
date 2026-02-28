import React from 'react';
import { Menu, MenuItem } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

const DocumentContextMenu = ({
  contextMenu,
  onClose,
  onEdit,
  onDelete
}) => {
  return (
    <Menu
      open={contextMenu !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenu !== null
          ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
          : undefined
      }
    >
      <MenuItem onClick={onEdit}>
        <EditIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
        Edit Document
      </MenuItem>
      <MenuItem onClick={onDelete}>
        <DeleteIcon fontSize="small" sx={{ mr: 1, color: 'error.main' }} />
        Delete Document
      </MenuItem>
    </Menu>
  );
};

export default DocumentContextMenu;
