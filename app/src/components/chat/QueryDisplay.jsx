import React, { useCallback, memo } from 'react';
import { Box, Grow, IconButton, Typography, Card, Paper, Button, Tooltip, useTheme } from '@mui/material';
import { SmartToy as BotIcon, Edit as EditIcon, PlayArrow as RunIcon, ContentCopy as CopyIcon, Build as FixIcon } from '@mui/icons-material';
import { useClipboard } from '../../context/ClipboardContext';
import { copyToClipboard } from '../../utils/clipboard';

const QueryDisplay = memo(({ query, animate = false, onRunQuery, onEditQuery, isFixedQuery = false, onComplete }) => {
  const theme = useTheme();
  const { addNotification } = useClipboard();

  const handleCopyQuery = useCallback(async () => {
    const ok = await copyToClipboard(query ?? '');
    addNotification(ok ? 'Query copied to clipboard' : 'Failed to copy query', ok ? 'success' : 'error');
  }, [query, addNotification]);

  return (
    <Grow in timeout={animate ? 500 : 0} onEntered={() => onComplete?.()}>
      <Box sx={{ px: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ color: isFixedQuery ? 'success.main' : 'primary.main', opacity: 0.8, display: 'flex', alignItems: 'center' }}>
            {isFixedQuery ? <FixIcon sx={{ fontSize: '0.9rem' }} /> : <BotIcon sx={{ fontSize: '0.9rem' }} />}
          </Box>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="Copy query" placement="top" arrow>
              <IconButton size="small" onClick={(e) => { e.stopPropagation?.(); handleCopyQuery(); }}>
                <CopyIcon fontSize="inherit" sx={{ fontSize: '0.9rem' }} />
              </IconButton>
            </Tooltip>
            <Typography sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.6rem', opacity: 0.6 }}>
              [{isFixedQuery ? 'fixed' : 'generated'}]
            </Typography>
          </Box>
        </Box>

        <Card sx={{ ml: 2, bgcolor: 'background.paper', borderLeft: `4px solid ${isFixedQuery ? theme.palette.success.main : theme.palette.warning.main}`, elevation: 2 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, fontFamily: 'monospace', textTransform: 'uppercase', fontSize: '0.65rem', color: 'text.secondary', letterSpacing: 0.5 }}>
              {isFixedQuery ? 'Fixed Query' : 'Generated Query'}
            </Typography>
            <Box sx={{ 
              p: 2, 
              bgcolor: theme.palette.mode === 'dark' ? '#111827' : '#f9fafb', 
              border: `1px solid ${theme.palette.divider}`, 
              borderRadius: 1,
              fontFamily: 'monospace', 
              fontSize: '0.75rem',
              color: theme.palette.mode === 'dark' ? '#f9fafb' : '#111827',
              '& pre': {
                color: theme.palette.mode === 'dark' ? '#f9fafb !important' : '#111827 !important',
                backgroundColor: 'transparent !important'
              }
            }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {query}
              </pre>
            </Box>
          </Box>

          <Box sx={{ p: 2, pt: 1, display: 'flex', gap: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
            <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={onEditQuery} sx={{ fontFamily: 'monospace', textTransform: 'none', fontSize: '0.75rem' }}>
              Edit Query
            </Button>
            <Button variant="contained" size="small" startIcon={<RunIcon />} onClick={(e) => { e.stopPropagation?.(); onRunQuery && onRunQuery(); }} sx={{ fontFamily: 'monospace', textTransform: 'none', fontSize: '0.75rem' }}>
              Run Query
            </Button>
          </Box>
        </Card>
      </Box>
    </Grow>
  );
});

QueryDisplay.displayName = 'QueryDisplay';

export default QueryDisplay;


