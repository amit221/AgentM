import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  Select,
  MenuItem,
  Typography,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
} from '@mui/icons-material';

const QueryResultPaginationControls = ({
  isPaginatableQuery,
  page,
  processedData,
  refreshPage,
  goPrevPage,
  goNextPage,
  validPaginationValue,
  handleRowsPerPageChange,
  currentPageItems,
  hasMoreResults,
  processedResults
}) => {
  if (!isPaginatableQuery || (page === 0 && processedData.isEmpty)) {
    return null;
  }

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.75
    }}>
      <IconButton
        size="small"
        onClick={refreshPage}
        title="Refresh"
        sx={{
          color: 'text.secondary',
          '&:hover': {
            bgcolor: 'action.hover',
            color: 'text.primary'
          }
        }}
      >
        <RefreshIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={goPrevPage}
        title="Previous"
        disabled={page === 0}
        sx={{
          color: 'text.secondary',
          '&:hover': {
            bgcolor: 'action.hover',
            color: 'text.primary'
          },
          '&.Mui-disabled': { color: 'text.disabled' }
        }}
      >
        <KeyboardArrowLeftIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={goNextPage}
        title="Next"
        disabled={!hasMoreResults}
        sx={{
          color: 'text.secondary',
          '&:hover': {
            bgcolor: 'action.hover',
            color: 'text.primary'
          },
          '&.Mui-disabled': { color: 'text.disabled' }
        }}
      >
        <KeyboardArrowRightIcon fontSize="small" />
      </IconButton>
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        ml: 1,
        gap: 1
      }}>
        <Select
          size="small"
          value={validPaginationValue}
          onChange={handleRowsPerPageChange}
          sx={{
            minWidth: '80px',
            '& .MuiSelect-select': {
              py: 0.5,
              px: 1,
              fontSize: '0.75rem',
              fontWeight: 500
            }
          }}
        >
          {[10, 20, 50, 100].map(n => (
            <MenuItem key={n} value={n}>{n}</MenuItem>
          ))}
        </Select>
        <Typography
          variant="caption"
          sx={{
            ml: 1,
            color: 'text.secondary',
            fontWeight: 500,
            fontSize: '0.75rem'
          }}
        >
          {currentPageItems.length > 0 ? (
            <>Documents {page * validPaginationValue + 1} to {page * validPaginationValue + currentPageItems.length}</>
          ) : (
            <>No documents on page {page + 1}</>
          )}
          {!hasMoreResults && currentPageItems.length > 0 ? ' (end)' : ''}
        </Typography>
        {/* Execution time moved near pagination */}
        <Chip
          label={`${((processedResults?.executionTime || 0) / 1000).toFixed(3)}s`}
          size="small"
          color="default"
          variant="outlined"
          sx={{
            ml: 1,
            fontWeight: 500,
            fontSize: '0.7rem',
            height: '24px',
            '& .MuiChip-label': { px: 1 }
          }}
        />
      </Box>
    </Box>
  );
};

export default QueryResultPaginationControls;
