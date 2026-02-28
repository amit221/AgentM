import React, { useCallback, useState, memo } from 'react';
import { Box, Grow, Paper, Typography, Tooltip, IconButton, useTheme, Button, Chip } from '@mui/material';
import { SmartToy as BotIcon, Person as PersonIcon, ContentCopy as CopyIcon, Warning as WarningIcon, Security as SecurityIcon, PlayArrow as PlayIcon, AttachFile as AttachIcon } from '@mui/icons-material';
import { useClipboard } from '../../context/ClipboardContext';
import { copyToClipboard } from '../../utils/clipboard';
import TypewriterText from './TypewriterText';

const ChatMessage = memo(({ 
  message, 
  isUser = false, 
  animate = false, 
  showTypewriter = false, 
  onComplete,
  onDangerousQueryConfirm,
  onDangerousQueryCancel,
  onUseSafeQueryVersion
}) => {
  const theme = useTheme();
  const [typewriterComplete, setTypewriterComplete] = useState(!showTypewriter);
  const { addNotification } = useClipboard();

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(message?.content ?? '');
    addNotification(ok ? 'Message copied to clipboard' : 'Failed to copy message', ok ? 'success' : 'error');
  }, [message?.content, addNotification]);

  const getBorderColor = () => {
    if (isUser) return theme.palette.success.main;
    switch (message.level) {
      case 'error': return theme.palette.error.main;
      case 'warning': return theme.palette.warning.main;
      case 'success': return theme.palette.success.main;
      default: return theme.palette.info.main;
    }
  };

  const isDangerousQueryWarning = () => {
    return Boolean(message?.isDangerousQueryWarning);
  };

  const hasSafeQueryOption = () => {
    return Boolean(message?.safeQuery);
  };

  const handleConfirmDangerous = () => {
    onDangerousQueryConfirm?.();
  };

  const handleCancelDangerous = () => {
    onDangerousQueryCancel?.();
  };

  const handleUseSafe = () => {
    if (message?.safeQuery) {
      onUseSafeQueryVersion?.(message.safeQuery);
    }
  };

  return (
    <Grow in timeout={animate ? 500 : 0} onEntered={() => { if (!showTypewriter) onComplete?.(); }}>
      <Box sx={{ mb: 2, px: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
          <Box sx={{ color: isUser ? 'success.main' : 'info.main', opacity: 0.8, display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
            {isUser ? <PersonIcon sx={{ fontSize: '0.9rem' }} /> : <BotIcon sx={{ fontSize: '0.9rem' }} />}
          </Box>

          {/* Show indicator if this message was generated with result context */}
          {!isUser && message?.hadResultsContext && (
            <Tooltip title={`Generated with ${message.resultCount || 'query'} results in context`} placement="top">
              <Chip
                icon={<AttachIcon sx={{ fontSize: '10px' }} />}
                label="with results"
                size="small"
                sx={{
                  height: '16px',
                  fontSize: '0.65rem',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  opacity: 0.7,
                  '& .MuiChip-icon': {
                    marginLeft: '4px'
                  },
                  '& .MuiChip-label': {
                    paddingLeft: '4px',
                    paddingRight: '6px'
                  }
                }}
              />
            </Tooltip>
          )}

          {message.timestamp && (
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Copy message" placement="top" arrow>
                <IconButton size="small" onClick={(e) => { e.stopPropagation?.(); handleCopy(); }}>
                  <CopyIcon fontSize="inherit" sx={{ fontSize: '0.9rem' }} />
                </IconButton>
              </Tooltip>
              <Typography sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.6rem', opacity: 0.6 }}>
                [{message.timestamp}]
              </Typography>
            </Box>
          )}
        </Box>

        <Paper sx={{ ml: 2, p: 2, bgcolor: 'background.paper', borderLeft: `3px solid ${getBorderColor()}`, borderRadius: 1, elevation: 1 }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.75rem', lineHeight: 1.5, color: 'text.primary', whiteSpace: 'pre-wrap' }}>
            {showTypewriter ? (
              <>
                <TypewriterText
                  text={message.content}
                  speed={isUser ? 2 : 2}
                  onComplete={() => { setTypewriterComplete(true); onComplete?.(); }}
                />
                {!typewriterComplete && (
                  <Box component="span" sx={{
                    '&::after': {
                      content: '"|"',
                      animation: 'blink 1s infinite',
                      color: isUser ? 'success.main' : 'info.main',
                      fontFamily: 'monospace',
                      fontWeight: 'bold'
                    },
                    '@keyframes blink': {
                      '0%, 50%': { opacity: 1 },
                      '51%, 100%': { opacity: 0 }
                    }
                  }} />
                )}
              </>
            ) : (
              message.content
            )}
          </Typography>

          {/* Action buttons for dangerous query warning */}
          {isDangerousQueryWarning() && typewriterComplete && (
            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={handleCancelDangerous}
                sx={{ fontSize: '0.7rem' }}
              >
                Cancel
              </Button>
              
              {hasSafeQueryOption() && (
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<SecurityIcon sx={{ fontSize: '0.8rem' }} />}
                  onClick={handleUseSafe}
                  sx={{ fontSize: '0.7rem' }}
                >
                  Use Safe Version
                </Button>
              )}
              
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<WarningIcon sx={{ fontSize: '0.8rem' }} />}
                onClick={handleConfirmDangerous}
                sx={{ fontSize: '0.7rem' }}
              >
                Proceed Anyway
              </Button>
            </Box>
          )}
        </Paper>
      </Box>
    </Grow>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;


