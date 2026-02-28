import React, { useRef } from 'react';
import {
  Button,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  FileDownload as ExportIcon,
} from '@mui/icons-material';
import Tooltip from '../ui/Tooltip';

const QueryResultExportControls = ({
  processedData,
  isScriptResult,
  isErrorResult,
  addNotification,
  isExportMenuOpen,
  setIsExportMenuOpen,
  isExporting,
  setIsExporting
}) => {
  const exportButtonRef = useRef(null);

  const handleExportCSV = async () => {
    if (processedData.isEmpty) {
      addNotification('No data to export', 'warning');
      return;
    }
    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `query-results-${timestamp}.csv`;
      const headers = processedData.keys.join(',');
      const rows = processedData.documents.map((doc) =>
        processedData.keys
          .map((key) => {
            const value = doc[key];
            if (value == null) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value).replace(/"/g, '""');
          })
          .map((v) => `"${v}"`)
          .join(',')
      );
      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addNotification(`Successfully exported ${processedData.documents.length} records as CSV`, 'success');
    } catch (error) {
      addNotification(`CSV export failed: ${error.message}`, 'error');
    } finally {
      setIsExporting(false);
      setIsExportMenuOpen(false);
    }
  };

  const handleExportJSON = async () => {
    if (processedData.isEmpty) {
      addNotification('No data to export', 'warning');
      return;
    }
    try {
      const jsonData = JSON.stringify(processedData.documents, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `query-results-${timestamp}.json`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addNotification(`Successfully exported ${processedData.documents.length} records as JSON`, 'success');
      setIsExportMenuOpen(false);
    } catch (error) {
      addNotification(`JSON export failed: ${error.message}`, 'error');
    }
  };

  return (
    <>
      {/* Export button made rectangular to match other buttons */}
      <Tooltip content="Export">
        <Button
          ref={exportButtonRef}
          onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
          disabled={Boolean(isExporting || processedData.isEmpty || isScriptResult || isErrorResult)}
          variant="outlined"
          size="small"
          sx={{
            minWidth: 'auto',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            borderColor: 'divider',
            color: 'text.secondary',
            '&:hover': {
              borderColor: 'text.primary',
              color: 'text.primary',
              bgcolor: 'action.hover'
            }
          }}
        >
          {isExporting ? <CircularProgress size={16} /> : <ExportIcon />}
        </Button>
      </Tooltip>
      <Menu
        anchorEl={exportButtonRef.current}
        open={isExportMenuOpen}
        onClose={() => setIsExportMenuOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleExportCSV} disabled={Boolean(isExporting || isScriptResult || isErrorResult)}>
          📊 Export as CSV
        </MenuItem>
        <MenuItem onClick={handleExportJSON} disabled={Boolean(isExporting || isScriptResult || isErrorResult)}>
          📄 Export as JSON
        </MenuItem>
      </Menu>
    </>
  );
};

export default QueryResultExportControls;
