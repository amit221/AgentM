import React, { memo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

const QueryResultTableView = memo(({
  processedData,
  currentPageItems,
  page,
  handleContextMenu,
  isMobile,
  isFullscreen,
  onDocumentClick
}) => {

  if (processedData.isEmpty) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          {page > 0 ? `No documents on page ${page + 1}` : 'No data to display'}
        </Typography>
      </Paper>
    );
  }

  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 'fit-content' }}>
        {currentPageItems.map(({ doc, originalIndex }, localIndex) => {
          const formattedDoc = processedData.formattedData.get(originalIndex);
          return (
            <Card
              key={originalIndex}
              variant="outlined"
              sx={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => onDocumentClick?.(doc, originalIndex)}
              onContextMenu={(event) => handleContextMenu(event, originalIndex)}
            >
              <CardContent sx={{ pt: 1 }}>
                {processedData.keys.map((key) => {
                  const displayValue = formattedDoc?.[key] || 'null';
                  return (
                    <Box key={key} sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {key}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.8rem', mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {displayValue}
                      </Typography>
                    </Box>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </Box>
    );
  }

  return (
    <>
      <TableContainer 
        component={Paper} 
        sx={{ 
          maxWidth: '100%', 
          width: '100%', 
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: isFullscreen ? 'calc(100vh - 200px)' : 'calc(100vh - 450px)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Table size="small" sx={{ tableLayout: 'auto', width: '100%', minWidth: `${processedData.keys.length * 150}px` }}>
        <TableHead>
          <TableRow>
            {processedData.keys.map((key, index) => (
              <TableCell
                key={key}
                sx={{
                  fontWeight: 600,
                  bgcolor: 'background.paper',
                  minWidth: '150px',
                  borderRight: index < processedData.keys.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  padding: '8px 12px',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  textAlign: 'center',
                }}
              >
                  <Typography variant="caption" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {key}
                  </Typography>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {currentPageItems.map(({ doc, originalIndex }) => {
            const formattedDoc = processedData.formattedData.get(originalIndex);
            return (
              <TableRow
                key={originalIndex}
                hover
                sx={{ position: 'relative', cursor: 'pointer' }}
                onContextMenu={(event) => handleContextMenu(event, originalIndex)}
                onClick={() => onDocumentClick?.(doc, originalIndex)}
              >
                {processedData.keys.map((key, colIndex) => {
                  const displayValue = formattedDoc?.[key] || '';
                  return (
                    <TableCell
                      key={key}
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        minWidth: '150px',
                        maxWidth: '300px',
                        borderRight: colIndex < processedData.keys.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                        padding: '8px 12px',
                        verticalAlign: 'top',
                      }}
                    >
                      <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', maxWidth: '280px' }}>
                        {displayValue || <em style={{ color: 'gray' }}>null</em>}
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
        </Table>
      </TableContainer>
    </>
  );
});

QueryResultTableView.displayName = 'QueryResultTableView';

export default QueryResultTableView;
