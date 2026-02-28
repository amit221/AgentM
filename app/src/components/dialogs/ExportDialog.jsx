import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
  Typography,
  Alert,
  Checkbox,
  FormGroup,
  Divider,
  IconButton,
  Collapse,
  CircularProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getTerminology, isRelationalDatabase, supportsFeature } from '../../utils/databaseTypeUtils';

const ExportDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  connectionId,
  databaseName,
  databaseType = 'mongodb'
}) => {
  const terminology = getTerminology(databaseType);
  const isSQL = isRelationalDatabase(databaseType);
  // Default format: CSV for SQL databases, JSON for MongoDB
  const [exportFormat, setExportFormat] = useState(isSQL ? 'csv' : 'json');
  const [outputPath, setOutputPath] = useState('');
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [toolsAvailable, setToolsAvailable] = useState({});
  const [binariesStatus, setBinariesStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [showCollections, setShowCollections] = useState(true);
  const [downloadingTools, setDownloadingTools] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  
  const [formatOptions, setFormatOptions] = useState({
    prettyPrint: true,
    jsonArray: true,
    includeIndexes: false,
    includeHeaders: true,
    fields: [],
    bsonCompression: true,
    gzip: true,
    includeMetadata: true,
    archive: false,
    // PostgreSQL pg_dump options
    pgFormat: 'plain',
    pgClean: false,
    pgCreateDb: false,
    pgDataOnly: false,
    pgSchemaOnly: false
  });
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  
  // Ref for auto-close timeout cleanup
  const autoCloseTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Reset format based on database type when opening
      setExportFormat(isSQL ? 'csv' : 'json');
      initializeDialog();
    }
  }, [isOpen, connectionId, databaseName, databaseType]);

  // Listen for export progress updates from backend
  useEffect(() => {
    if (!exporting) return;
    
    const removeListener = window.electronAPI?.database?.onExportProgress?.((data) => {
      if (data.progress) {
        setExportProgress(prev => ({
          ...prev,
          phase: data.progress.phase || 'exporting',
          message: data.progress.message || 'Exporting...',
          progress: data.progress.progress || 0
        }));
      }
    });
    
    return () => {
      removeListener?.();
    };
  }, [exporting]);

  const initializeDialog = async () => {
    setLoading(true);
    try {
      // Pass connectionId to get connection-specific tool availability
      const toolsResult = await window.electronAPI.database.checkExportToolsAvailability(connectionId);
      setToolsAvailable(toolsResult.tools || toolsResult || {});
      setBinariesStatus(toolsResult.binariesStatus || {});

      const collectionsResult = await window.electronAPI.database.getCollectionsForExport(
        connectionId,
        databaseName
      );
      
      if (collectionsResult.success) {
        setCollections(collectionsResult.collections);
        setSelectedCollections(collectionsResult.collections);
      } else {
        console.error('Failed to get collections:', collectionsResult.error);
      }
    } catch (error) {
      console.error('Error initializing export dialog:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPgTools = async () => {
    // Check if the download API is available
    if (!window.electronAPI?.database?.downloadPgTools) {
      console.error('PostgreSQL tools download API not available. Please restart the application.');
      setDownloadProgress({ phase: 'error', progress: 0, message: 'Please restart the application to enable this feature.' });
      return;
    }
    
    setDownloadingTools(true);
    setDownloadProgress({ phase: 'starting', progress: 0, message: 'Starting download...' });
    
    // Set up progress listener
    const removeListener = window.electronAPI.database.onPgToolsDownloadProgress?.((progress) => {
      setDownloadProgress(progress);
    });
    
    try {
      const result = await window.electronAPI.database.downloadPgTools();
      if (result.success) {
        // Refresh tools availability
        const toolsResult = await window.electronAPI.database.checkExportToolsAvailability();
        setToolsAvailable(toolsResult.tools || {});
        setBinariesStatus(toolsResult.binariesStatus || {});
        setDownloadProgress({ phase: 'completed', progress: 100, message: 'Download complete!' });
      } else {
        setDownloadProgress({ phase: 'error', progress: 0, message: result.error || 'Download failed' });
      }
    } catch (error) {
      console.error('Error downloading PostgreSQL tools:', error);
      setDownloadProgress({ phase: 'error', progress: 0, message: error.message });
    } finally {
      setDownloadingTools(false);
      removeListener?.();
    }
  };

  const handleSelectAll = () => {
    setSelectedCollections([...collections]);
  };

  const handleDeselectAll = () => {
    setSelectedCollections([]);
  };

  const handleToggleCollection = (collectionName) => {
    if (selectedCollections.includes(collectionName)) {
      setSelectedCollections(selectedCollections.filter(c => c !== collectionName));
    } else {
      setSelectedCollections([...selectedCollections, collectionName]);
    }
  };

  const handleSelectPath = async () => {
    try {
      const result = await window.electronAPI.database.selectExportPath({
        title: 'Select Export Location',
        defaultPath: outputPath
      });
      
      if (result.success && result.path) {
        setOutputPath(result.path);
      }
    } catch (error) {
      console.error('Error selecting export path:', error);
    }
  };

  const handleExport = async () => {
    if (!outputPath || selectedCollections.length === 0) {
      return;
    }

    const exportOptions = {
      connectionId,
      databaseName,
      collections: selectedCollections,
      format: exportFormat,
      outputPath,
      formatOptions: getActiveFormatOptions()
    };

    setExporting(true);
    setExportProgress({ phase: 'starting', message: 'Starting export...', progress: 0 });

    try {
      const result = await onConfirm(exportOptions);
      if (result?.success) {
        setExportProgress({ phase: 'completed', message: result.message || 'Export completed successfully!', progress: 100 });
        // Auto-close after success
        autoCloseTimeoutRef.current = setTimeout(() => {
          setExporting(false);
          setExportProgress(null);
          onClose();
        }, 2000);
      } else {
        setExportProgress({ phase: 'error', message: result?.error || 'Export failed', progress: 0 });
        setExporting(false);
      }
    } catch (error) {
      setExportProgress({ phase: 'error', message: error.message, progress: 0 });
      setExporting(false);
    }
  };

  const getActiveFormatOptions = () => {
    switch (exportFormat) {
      case 'json':
        return {
          prettyPrint: formatOptions.prettyPrint,
          jsonArray: formatOptions.jsonArray
        };
      case 'csv':
        return {
          includeHeaders: formatOptions.includeHeaders,
          fields: formatOptions.fields
        };
      case 'mongodump':
        return {
          gzip: formatOptions.gzip,
          includeMetadata: formatOptions.includeMetadata,
          archive: formatOptions.archive
        };
      case 'pg_dump':
        return {
          format: formatOptions.pgFormat || 'plain', // plain, custom, directory, tar
          clean: formatOptions.pgClean || false,
          createDb: formatOptions.pgCreateDb || false,
          dataOnly: formatOptions.pgDataOnly || false,
          schemaOnly: formatOptions.pgSchemaOnly || false
        };
      default:
        return {};
    }
  };

  const isFormatAvailable = (format) => {
    switch (format) {
      case 'json':
      case 'csv':
        // JSON/CSV available for both MongoDB and PostgreSQL
        if (isSQL) {
          return true; // PostgreSQL can always export to JSON/CSV via custom export
        }
        return toolsAvailable.mongoexport || toolsAvailable.customExport;
      case 'mongodump':
        return !isSQL && toolsAvailable.mongodump;
      case 'pg_dump':
        return isSQL && toolsAvailable.pg_dump;
      default:
        return false;
    }
  };

  // Build export formats based on database type
  const exportFormats = isSQL ? [
    { 
      value: 'csv', 
      label: '📊 CSV', 
      description: `Spreadsheet format (one file per ${terminology.collection})`,
      available: true
    },
    { 
      value: 'pg_dump', 
      label: '⚡ pg_dump (native)', 
      description: 'PostgreSQL SQL dump (with schema and data)',
      available: isFormatAvailable('pg_dump')
    }
  ] : [
    { 
      value: 'json', 
      label: '📄 JSON', 
      description: `Human-readable JSON files (one per ${terminology.collection})`,
      available: true
    },
    { 
      value: 'csv', 
      label: '📊 CSV', 
      description: `Spreadsheet format (one file per ${terminology.collection})`,
      available: isFormatAvailable('csv')
    },
    { 
      value: 'mongodump', 
      label: '⚡ mongodump', 
      description: 'MongoDB BSON backup (directory or archive)',
      available: isFormatAvailable('mongodump')
    }
  ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      disableEscapeKeyDown
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            Export Database: {databaseName}
          </Typography>
          <IconButton 
            onClick={onClose}
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <span style={{ fontSize: '20px' }}>✕</span>
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            {/* Export Format Selection */}
            <Box sx={{ mb: 2 }}>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend" sx={{ mb: 1, fontWeight: 500, fontSize: '0.875rem' }}>
                  Export Format:
                </FormLabel>
                <RadioGroup
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                    {exportFormats.map((format) => {
                      const isDisabled = !format.available;
                      return (
                        <FormControlLabel
                          key={format.value}
                          value={format.value}
                          control={<Radio disabled={isDisabled} />}
                          label={
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {format.label}
                                {isDisabled && ' (Not Available)'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {format.description}
                              </Typography>
                            </Box>
                          }
                          disabled={isDisabled}
                          sx={{
                            m: 0,
                            p: 1,
                            border: 1,
                            borderColor: exportFormat === format.value 
                              ? 'primary.main' 
                              : isDisabled 
                              ? 'grey.300' 
                              : 'grey.300',
                            borderRadius: 1,
                            bgcolor: exportFormat === format.value 
                              ? 'primary.50' 
                              : isDisabled 
                              ? 'grey.50' 
                              : 'transparent',
                            '&:hover': {
                              bgcolor: !isDisabled ? 'action.hover' : 'grey.50'
                            },
                            opacity: isDisabled ? 0.5 : 1
                          }}
                        />
                      );
                    })}
                  </Box>
                </RadioGroup>
              </FormControl>
              
              {/* PostgreSQL Tools Download Option - show only when tools missing or upgrade available */}
              {isSQL && exportFormat === 'pg_dump' && (!binariesStatus.available || binariesStatus.upgradeAvailable) && (
                <Alert 
                  severity={binariesStatus.upgradeAvailable ? 'warning' : 'info'}
                  sx={{ mt: 1.5 }}
                  action={
                    !downloadingTools && (
                      <Button 
                        color="primary" 
                        size="small" 
                        onClick={handleDownloadPgTools}
                        disabled={downloadingTools}
                      >
                        {binariesStatus.upgradeAvailable ? '⬆️ Upgrade' : '📥 Download'}
                      </Button>
                    )
                  }
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {binariesStatus.upgradeAvailable 
                      ? `Upgrade available: ${binariesStatus.installedVersion} → ${binariesStatus.latestVersion}`
                      : 'PostgreSQL client tools not found'
                    }
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {binariesStatus.upgradeAvailable 
                      ? 'Upgrade to support newer PostgreSQL server versions.'
                      : 'Download pg_dump to enable native PostgreSQL exports with schema support.'
                    }
                  </Typography>
                  {downloadProgress && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color={downloadProgress.phase === 'error' ? 'error.main' : 'primary.main'}>
                        {downloadProgress.message} {downloadProgress.progress > 0 && downloadProgress.phase !== 'error' && `(${downloadProgress.progress}%)`}
                      </Typography>
                      {(downloadProgress.phase === 'downloading' || downloadProgress.phase === 'extracting') && (
                        <Box sx={{ width: '100%', mt: 0.5 }}>
                          <Box 
                            sx={{ 
                              width: `${downloadProgress.progress}%`, 
                              height: 4, 
                              bgcolor: downloadProgress.phase === 'extracting' ? 'warning.main' : 'primary.main', 
                              borderRadius: 1,
                              transition: 'width 0.3s'
                            }} 
                          />
                        </Box>
                      )}
                      {downloadProgress.phase === 'completed' && (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                          ✅ PostgreSQL tools installed successfully!
                        </Typography>
                      )}
                    </Box>
                  )}
                </Alert>
              )}
            </Box>

            <Divider sx={{ my: 1.5 }} />

            {/* Collection Selection */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                <FormLabel component="legend" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                  {terminology.Collections} ({selectedCollections.length}/{collections.length}):
                </FormLabel>
                <Box>
                  <Button size="small" onClick={handleSelectAll} sx={{ mr: 1 }}>
                    Select All
                  </Button>
                  <Button size="small" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                  <IconButton 
                    size="small" 
                    onClick={() => setShowCollections(!showCollections)}
                    sx={{ ml: 1 }}
                  >
                    {showCollections ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
              </Box>

              <Collapse in={showCollections}>
                <Box 
                  sx={{ 
                    maxHeight: 150, 
                    overflowY: 'auto',
                    border: 1,
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    p: 0.5
                  }}
                >
                  <FormGroup>
                    {collections.map((collection) => (
                      <FormControlLabel
                        key={collection}
                        control={
                          <Checkbox
                            checked={selectedCollections.includes(collection)}
                            onChange={() => handleToggleCollection(collection)}
                          />
                        }
                        label={<Typography variant="body2">{collection}</Typography>}
                        sx={{ py: 0.25, my: 0 }}
                      />
                    ))}
                  </FormGroup>
                </Box>
              </Collapse>
            </Box>

            <Divider sx={{ my: 1.5 }} />

            {/* Format-Specific Options */}
            <Box sx={{ mb: 2 }}>
              <FormLabel component="legend" sx={{ mb: 0.75, fontWeight: 500, fontSize: '0.875rem' }}>
                Export Options:
              </FormLabel>

              {exportFormat === 'json' && (
                <Box sx={{ pl: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.prettyPrint}
                        onChange={(e) => setFormatOptions({ ...formatOptions, prettyPrint: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">Pretty print (formatted, readable JSON)</Typography>}
                    sx={{ my: 0 }}
                  />
                </Box>
              )}

              {exportFormat === 'csv' && (
                <Box sx={{ pl: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.includeHeaders}
                        onChange={(e) => setFormatOptions({ ...formatOptions, includeHeaders: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">Include header row</Typography>}
                    sx={{ my: 0 }}
                  />
                  <Alert severity="info" sx={{ mt: 0.5, py: 0.5 }}>
                    <Typography variant="caption">CSV export will automatically detect {terminology.fields} from {terminology.documents}</Typography>
                  </Alert>
                </Box>
              )}

              {exportFormat === 'mongodump' && (
                <Box sx={{ pl: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.archive}
                        onChange={(e) => setFormatOptions({ ...formatOptions, archive: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">Single archive file (instead of multiple files)</Typography>}
                    sx={{ my: 0 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.gzip}
                        onChange={(e) => setFormatOptions({ ...formatOptions, gzip: e.target.checked })}
                        disabled={formatOptions.archive}
                      />
                    }
                    label={<Typography variant="body2">GZIP compression (not needed with archive)</Typography>}
                    sx={{ my: 0 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.includeMetadata}
                        onChange={(e) => setFormatOptions({ ...formatOptions, includeMetadata: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">Include metadata and indexes</Typography>}
                    sx={{ my: 0 }}
                  />
                  <Alert severity="info" sx={{ mt: 0.5, py: 0.5 }}>
                    <Typography variant="caption">
                      mongodump creates BSON backups. Uncheck "archive" for directory of .bson files, or check it for a single archive file.
                    </Typography>
                  </Alert>
                </Box>
              )}

              {exportFormat === 'pg_dump' && (
                <Box sx={{ pl: 1 }}>
                  <FormControl sx={{ mb: 1, minWidth: 200 }}>
                    <FormLabel sx={{ fontSize: '0.75rem', mb: 0.5 }}>Output Format</FormLabel>
                    <RadioGroup
                      row
                      value={formatOptions.pgFormat}
                      onChange={(e) => setFormatOptions({ ...formatOptions, pgFormat: e.target.value })}
                    >
                      <FormControlLabel value="plain" control={<Radio size="small" />} label={<Typography variant="body2">Plain SQL</Typography>} />
                      <FormControlLabel value="custom" control={<Radio size="small" />} label={<Typography variant="body2">Custom</Typography>} />
                      <FormControlLabel value="directory" control={<Radio size="small" />} label={<Typography variant="body2">Directory</Typography>} />
                    </RadioGroup>
                  </FormControl>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.pgClean}
                        onChange={(e) => setFormatOptions({ ...formatOptions, pgClean: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">Include DROP statements (--clean)</Typography>}
                    sx={{ my: 0 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.pgDataOnly}
                        onChange={(e) => setFormatOptions({ ...formatOptions, pgDataOnly: e.target.checked, pgSchemaOnly: false })}
                      />
                    }
                    label={<Typography variant="body2">Data only (no schema)</Typography>}
                    sx={{ my: 0 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={formatOptions.pgSchemaOnly}
                        onChange={(e) => setFormatOptions({ ...formatOptions, pgSchemaOnly: e.target.checked, pgDataOnly: false })}
                      />
                    }
                    label={<Typography variant="body2">Schema only (no data)</Typography>}
                    sx={{ my: 0 }}
                  />
                  <Alert severity="info" sx={{ mt: 0.5, py: 0.5 }}>
                    <Typography variant="caption">
                      pg_dump creates PostgreSQL SQL backups. Plain SQL is human-readable, Custom format is compressed and supports selective restore.
                    </Typography>
                  </Alert>
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 1.5 }} />

            {/* Output Path Selection */}
            <Box sx={{ mb: 1.5 }}>
              <FormLabel component="legend" sx={{ mb: 0.75, fontWeight: 500, fontSize: '0.875rem' }}>
                Export Location:
              </FormLabel>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="Select export folder..."
                  size="small"
                  InputProps={{
                    readOnly: true,
                  }}
                />
                <Button
                  variant="outlined"
                  startIcon={<FolderOpenIcon />}
                  onClick={handleSelectPath}
                >
                  Browse
                </Button>
              </Box>
              {outputPath && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Files will be exported to: {outputPath}
                </Typography>
              )}
            </Box>

            {/* Validation Messages */}
            {selectedCollections.length === 0 && !exporting && (
              <Alert severity="warning" sx={{ mt: 1, py: 0.5 }}>
                <Typography variant="caption">Please select at least one {terminology.collection} to export</Typography>
              </Alert>
            )}

            {/* Export Progress Indicator */}
            {exporting && exportProgress && (
              <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'primary.main', borderRadius: 1, bgcolor: 'primary.50' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {exportProgress.phase !== 'completed' && exportProgress.phase !== 'error' && (
                    <CircularProgress size={24} />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 500,
                        color: exportProgress.phase === 'error' ? 'error.main' : 
                               exportProgress.phase === 'completed' ? 'success.main' : 'primary.main'
                      }}
                    >
                      {exportProgress.phase === 'completed' ? '✅ ' : 
                       exportProgress.phase === 'error' ? '❌ ' : '📤 '}
                      {exportProgress.message}
                    </Typography>
                    {exportProgress.phase !== 'error' && exportProgress.phase !== 'completed' && (
                      <Box sx={{ width: '100%', mt: 1 }}>
                        <Box 
                          sx={{ 
                            width: '100%', 
                            height: 6, 
                            bgcolor: 'grey.200', 
                            borderRadius: 1,
                            overflow: 'hidden'
                          }}
                        >
                          <Box 
                            sx={{ 
                              width: exportProgress.progress > 0 ? `${exportProgress.progress}%` : '100%',
                              height: '100%', 
                              bgcolor: 'primary.main', 
                              borderRadius: 1,
                              animation: exportProgress.progress === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                              '@keyframes pulse': {
                                '0%, 100%': { opacity: 0.4 },
                                '50%': { opacity: 1 }
                              }
                            }} 
                          />
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 1.5, pt: 0 }}>
        <Button
          onClick={onClose}
          color="inherit"
          disabled={exporting}
        >
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          disabled={!outputPath || selectedCollections.length === 0 || loading || exporting}
          variant="contained"
          color="primary"
        >
          {exporting ? '📤 Exporting...' : `📤 Export ${selectedCollections.length} ${selectedCollections.length === 1 ? terminology.Collection : terminology.Collections}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportDialog;

