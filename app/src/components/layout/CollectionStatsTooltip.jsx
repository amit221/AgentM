import {
  Paper,
  Typography,
  Box,
  CircularProgress,
  Grid,
  Divider,
  Tooltip
} from '@mui/material';

const CollectionStatsTooltip = ({ stats, isVisible, position, onMouseEnter, onMouseLeave }) => {
  if (!isVisible) return null;

  // Adjust position to ensure tooltip stays on screen
  const tooltipWidth = 280;
  const tooltipHeight = 200;
  const padding = 10;
  
  let adjustedX = position.x;
  let adjustedY = position.y;
  
  // Check if tooltip would go off right edge of screen
  if (adjustedX + tooltipWidth > window.innerWidth - padding) {
    adjustedX = position.x - tooltipWidth - 20; // Show to the left instead
  }
  
  // Check if tooltip would go off bottom edge of screen
  if (adjustedY + tooltipHeight > window.innerHeight - padding) {
    adjustedY = window.innerHeight - tooltipHeight - padding;
  }
  
  // Check if tooltip would go off top edge of screen
  if (adjustedY < padding) {
    adjustedY = padding;
  }

  return (
    <Paper
      elevation={8}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      sx={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 1200,
        width: tooltipWidth,
        maxHeight: tooltipHeight,
        p: 2,
        overflow: 'auto'
      }}
    >
      {!stats ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Loading stats...
          </Typography>
        </Box>
      ) : stats.error ? (
        <Typography variant="body2" color="error">
          Error: {stats.error}
        </Typography>
      ) : (
        <Box>
          <Typography 
            variant="subtitle2" 
            sx={{ 
              fontWeight: 600, 
              mb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            📊 {stats.isEstimate ? 'Table Stats' : 'Collection Stats'}
          </Typography>
          
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">
                {stats.isEstimate ? 'Rows (est.):' : 'Documents:'}
              </Typography>
              {stats.isEstimate ? (
                <Tooltip title="Estimated count from PostgreSQL statistics. Run ANALYZE for more accurate estimates." arrow placement="top">
                  <Typography variant="body2" sx={{ fontWeight: 500, cursor: 'help' }}>
                    ~{(stats.documentCount !== undefined ? stats.documentCount : 0).toLocaleString()}
                  </Typography>
                </Tooltip>
              ) : (
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {(stats.documentCount !== undefined ? stats.documentCount : 0).toLocaleString()}
                </Typography>
              )}
            </Grid>
            
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">
                Size:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {stats.totalSize || '0 B'}
              </Typography>
            </Grid>
            
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">
                Storage:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {stats.storageSize || '0 B'}
              </Typography>
            </Grid>
            
            <Grid item xs={6}>
              <Typography variant="caption" color="text.secondary">
                Avg Size:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {stats.avgDocumentSize || '0 B'}
              </Typography>
            </Grid>
          </Grid>

          {stats.indexes && stats.indexes.length > 0 && (
            <Box>
              <Divider sx={{ mb: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Indexes:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {stats.indexCount} ({stats.totalIndexSize})
                </Typography>
              </Box>
              
              <Box sx={{ maxHeight: 80, overflow: 'auto' }}>
                {stats.indexes.slice(0, 3).map((index, i) => (
                  <Box 
                    key={i} 
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5
                    }}
                  >
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mr: 1,
                        flex: 1
                      }}
                    >
                      {index.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {index.size}
                    </Typography>
                  </Box>
                ))}
                {stats.indexes.length > 3 && (
                  <Typography 
                    variant="caption" 
                    color="text.secondary" 
                    sx={{ textAlign: 'center', display: 'block', mt: 0.5 }}
                  >
                    ... and {stats.indexes.length - 3} more
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
};

export default CollectionStatsTooltip;