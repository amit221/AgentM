import React, { useState } from 'react';
import {
  Button,
  IconButton
} from '@mui/material';
import {
  Dashboard as DashboardIcon
} from '@mui/icons-material';
import Tooltip from '../ui/Tooltip';
import AddToDashboardDialog from '../dashboard/AddToDashboardDialog';

/**
 * Simple "Add to Dashboard" button for query results
 */
const AddToDashboardButton = ({ 
  query, 
  queryResult, 
  queryContext,
  chartConfig,
  size = "small",
  variant = "outlined" 
}) => {
  const [showDialog, setShowDialog] = useState(false);

  // Don't show button if no query or result
  if (!query || !queryResult || !queryResult.documents || queryResult.documents.length === 0) {
    return null;
  }

  // Use IconButton for small size, regular Button for others
  const isIconOnly = size === "small";

  return (
    <>
      <Tooltip content="Add this query result as a dashboard widget">
        {isIconOnly ? (
          <IconButton
            size={size}
            onClick={() => setShowDialog(true)}
            sx={{ 
              border: variant === "outlined" ? '1px solid' : 'none',
              borderColor: 'divider'
            }}
          >
            <DashboardIcon />
          </IconButton>
        ) : (
          <Button
            size={size}
            variant={variant}
            startIcon={<DashboardIcon />}
            onClick={() => setShowDialog(true)}
          >
            Add to Dashboard
          </Button>
        )}
      </Tooltip>

      <AddToDashboardDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        queryResult={queryResult}
        originalQuery={query}
        queryContext={queryContext}
        chartConfig={chartConfig}
      />
    </>
  );
};

export default AddToDashboardButton;
