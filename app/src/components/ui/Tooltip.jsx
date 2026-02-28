import React from 'react';
import { Tooltip as MUITooltip } from '@mui/material';

const Tooltip = ({ 
  children, 
  content, 
  placement = 'top',
  className = '',
  delay = 150,
  ...props 
}) => {
  return (
    <MUITooltip
      title={content}
      placement={placement}
      enterDelay={delay}
      arrow
      {...props}
    >
      <div className={className}>
        {children}
      </div>
    </MUITooltip>
  );
};

export default Tooltip;