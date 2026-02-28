import { Box, Paper } from '@mui/material';

const QueryResultRawView = ({
  isScriptResult,
  isErrorResult,
  processedResults,
  result
}) => {
  if (isScriptResult) {
    // Script results - just show the output
    const scriptOutput = processedResults?.documents?.[0]?.output || 'Script executed successfully (no output)';
    
    return (
      <Paper sx={{ p: 2, minHeight: 'fit-content' }}>
        <Box
          component="pre"
          sx={{
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            m: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            backgroundColor: 'background.default',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            lineHeight: 1.6,
            minHeight: '100px',
            maxHeight: '500px',
            overflow: 'auto',
          }}
        >
          {scriptOutput}
        </Box>
      </Paper>
    );
  }

  if (isErrorResult) {
    // Error results - show the detailed error output if available, otherwise show generic error message
    const detailedError = processedResults?.documents?.[0]?.output;
    const errorMessage = detailedError || result?.error || 'Query execution failed';

    return (
      <Paper sx={{ p: 2, minHeight: 'fit-content' }}>
        <Box
          component="pre"
          sx={{
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            m: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            backgroundColor: 'background.default',
            color: 'text.primary',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
            lineHeight: 1.6,
            minHeight: '100px',
            maxHeight: '500px',
            overflow: 'auto',
          }}
        >
          {errorMessage}
        </Box>
      </Paper>
    );
  }

  // Query results - show formatted JSON
  return (
    <Paper sx={{ p: 2, minHeight: 'fit-content' }}>
      <Box
        component="pre"
        sx={{
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          m: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          backgroundColor: 'action.hover',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          p: 2,
          maxHeight: '500px',
          overflow: 'auto'
        }}
      >
        {JSON.stringify(processedResults, null, 2)}
      </Box>
    </Paper>
  );
};

export default QueryResultRawView;
