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
  Divider,
  IconButton,
  CircularProgress,
  Select,
  MenuItem,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getTerminology, isRelationalDatabase } from '../../utils/databaseTypeUtils';

const ImportDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  connectionId,
  databaseName,
  databaseType = 'mongodb'
}) => {
  const terminology = getTerminology(databaseType);
  const isSQL = isRelationalDatabase(databaseType);
  // Default format: pg_restore for PostgreSQL, JSON for MongoDB
  const [importFormat, setImportFormat] = useState(isSQL ? 'pg_restore' : 'json');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [collections, setCollections] = useState([]);
  const [toolsAvailable, setToolsAvailable] = useState({});
  const [binariesStatus, setBinariesStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [downloadingTools, setDownloadingTools] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  
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
      setImportFormat(isSQL ? 'pg_restore' : 'json');
      initializeDialog();
    } else {
      // Reset state when dialog closes
      resetDialog();
    }
  }, [isOpen, connectionId, databaseName, databaseType]);

  // Listen for import progress updates from backend
  useEffect(() => {
    if (!importing) return;
    
    const removeListener = window.electronAPI?.database?.onImportProgress?.((data) => {
      if (data.progress) {
        setImportProgress(prev => ({
          ...prev,
          phase: data.progress.phase || 'importing',
          message: data.progress.message || 'Importing...',
          progress: data.progress.progress || 0
        }));
      }
    });
    
    return () => {
      removeListener?.();
    };
  }, [importing]);

  const initializeDialog = async () => {
    setLoading(true);
    try {
      // Check tool availability - pass connectionId to get correct adapter
      const toolsResult = await window.electronAPI.database.checkImportToolsAvailability(connectionId);
      console.log('Import tools availability:', toolsResult);
      setToolsAvailable(toolsResult.tools || {});
      setBinariesStatus(toolsResult.binariesStatus || {});

      // Get existing collections
      const collectionsResult = await window.electronAPI.database.getCollectionsForExport(
        connectionId,
        databaseName
      );
      
      if (collectionsResult.success) {
        setCollections(collectionsResult.collections);
      }
    } catch (error) {
      console.error('Error initializing import dialog:', error);
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
        const toolsResult = await window.electronAPI.database.checkImportToolsAvailability();
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

  const resetDialog = () => {
    setImportFormat(isSQL ? 'pg_restore' : 'json');
    setSelectedFiles([]);
    setValidationErrors([]);
    setImporting(false);
    setImportProgress(null);
  };

  const handleSelectFiles = async () => {
    try {
      const result = await window.electronAPI.database.selectImportFiles({
        title: isSQL ? 'Select SQL Dump File' : 'Select Files to Import',
        format: importFormat
      });
      
      if (result.success && result.files) {
        // Auto-detect format from first file extension if no format selected
        if (result.files.length > 0 && !importFormat) {
          const ext = result.files[0].name.split('.').pop().toLowerCase();
          if (ext === 'json' || ext === 'jsonl') {
            setImportFormat('json');
          } else if (ext === 'csv') {
            setImportFormat('csv');
          } else if (ext === 'sql' || ext === 'dump') {
            setImportFormat('pg_restore');
          }
        }

        // Initialize files with default settings
        const filesWithSettings = result.files.map(file => {
          // Use file name (without extension) as the collection/table name
          const nameWithoutExt = file.name.replace(/\.(json|jsonl|csv|sql|dump|backup|pgdump)$/i, '');
          
          return {
            ...file,
            targetCollection: nameWithoutExt,
            action: 'override'
          };
        });

        setSelectedFiles(filesWithSettings);
        validateFiles(filesWithSettings);
      }
    } catch (error) {
      console.error('Error selecting files:', error);
    }
  };

  const handleSelectDirectory = async () => {
    try {
      const result = await window.electronAPI.database.selectImportDirectory({
        title: 'Select mongodump Directory'
      });
      
      if (result.success && result.path) {
        // Use collections scanned by the main process
        const collectionsInDump = result.collections || [];
        
        if (collectionsInDump.length === 0) {
          setValidationErrors(['No BSON collection files found in selected directory']);
          return;
        }

        console.log(`📂 Found ${collectionsInDump.length} collections:`, collectionsInDump);

        // Create a file entry for each collection found
        const filesWithSettings = collectionsInDump.map(collectionName => ({
          path: result.path,
          name: collectionName,
          targetCollection: collectionName,
          action: 'override',
          isMongodumpCollection: true,
          isDirectory: true
        }));

        setSelectedFiles(filesWithSettings);
        setValidationErrors([]);
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
    }
  };

  const handleSelectArchive = async () => {
    try {
      const result = await window.electronAPI.database.selectImportFiles({
        title: 'Select mongodump Archive',
        format: 'archive'
      });
      
      if (result.success && result.files && result.files.length > 0) {
        const archiveFile = result.files[0];
        
        // For archives, we can't scan the contents without extracting
        // So we'll just show a single entry representing the entire archive
        setSelectedFiles([{
          path: archiveFile.path,
          name: archiveFile.name,
          targetCollection: databaseName,
          action: 'override',
          isArchive: true
        }]);
        setValidationErrors([]);
      }
    } catch (error) {
      console.error('Error selecting archive:', error);
    }
  };

  const scanMongodumpDirectory = async (dirPath) => {
    try {
      // Try to read the directory using Node.js APIs via electron
      const fs = window.require ? window.require('fs') : null;
      const path = window.require ? window.require('path') : null;
      
      if (!fs || !path) {
        // Fallback: assume we're scanning a dump with database name
        // Look for .bson files in the directory
        return [];
      }

      // Check if this is a mongodump with database subdirectory
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let bsonFiles = [];

      // Look for .bson or .bson.gz files in the directory
      for (const entry of entries) {
        if (entry.isFile()) {
          const fileName = entry.name;
          if (fileName.endsWith('.bson') || fileName.endsWith('.bson.gz')) {
            // Extract collection name (remove .bson or .bson.gz extension)
            const collectionName = fileName
              .replace(/\.bson\.gz$/, '')
              .replace(/\.bson$/, '');
            bsonFiles.push(collectionName);
          }
        } else if (entry.isDirectory()) {
          // Check if subdirectory contains bson files (it might be the database directory)
          const subDirPath = path.join(dirPath, entry.name);
          try {
            const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (subEntry.isFile()) {
                const fileName = subEntry.name;
                if (fileName.endsWith('.bson') || fileName.endsWith('.bson.gz')) {
                  const collectionName = fileName
                    .replace(/\.bson\.gz$/, '')
                    .replace(/\.bson$/, '');
                  bsonFiles.push(collectionName);
                }
              }
            }
            // If we found bson files in subdirectory, that's our target
            if (bsonFiles.length > 0) {
              break;
            }
          } catch (err) {
            // Skip directories we can't read
          }
        }
      }

      return bsonFiles;
    } catch (error) {
      console.error('Error scanning mongodump directory:', error);
      return [];
    }
  };

  const validateFiles = (files) => {
    const errors = [];
    
    files.forEach((file, index) => {
      if (!file.targetCollection) {
        errors.push(`File "${file.name}": Please select a target ${terminology.collection}`);
      }
    });

    setValidationErrors(errors);
  };

  const handleFileSettingChange = (index, field, value) => {
    const updatedFiles = [...selectedFiles];
    updatedFiles[index][field] = value;
    setSelectedFiles(updatedFiles);
    validateFiles(updatedFiles);
  };

  const handleRemoveFile = (index) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    validateFiles(updatedFiles);
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0 || validationErrors.length > 0) {
      return;
    }

    const importOptions = {
      connectionId,
      databaseName,
      files: selectedFiles,
      format: importFormat,
      formatOptions: {}
    };

    setImporting(true);
    setImportProgress({ phase: 'starting', message: 'Starting import...', progress: 0 });

    try {
      const result = await onConfirm(importOptions);
      if (result?.success) {
        setImportProgress({ phase: 'completed', message: 'Import completed successfully!', progress: 100 });
        // Auto-close after success
        autoCloseTimeoutRef.current = setTimeout(() => {
          setImporting(false);
          setImportProgress(null);
          onClose();
        }, 1500);
      } else {
        setImportProgress({ phase: 'error', message: result?.error || 'Import failed', progress: 0 });
        setImporting(false);
      }
    } catch (error) {
      setImportProgress({ phase: 'error', message: error.message, progress: 0 });
      setImporting(false);
    }
  };

  const isFormatAvailable = (format) => {
    switch (format) {
      case 'json':
        return true; // Always available (uses native driver)
      case 'csv':
        if (isSQL) {
          return true; // PostgreSQL can import CSV directly
        }
        return toolsAvailable.mongoimport;
      case 'mongorestore':
        return !isSQL && toolsAvailable.mongorestore;
      case 'pg_restore':
        // Always available for PostgreSQL - tools can be downloaded
        return isSQL;
      default:
        return false;
    }
  };

  // Build import formats based on database type
  const importFormats = isSQL ? [
    { 
      value: 'pg_restore', 
      label: '⚡ SQL Dump (native)', 
      description: 'Import from .sql or pg_dump backup files',
      available: isFormatAvailable('pg_restore')
    },
    { 
      value: 'csv', 
      label: '📊 CSV', 
      description: 'Import data from CSV files',
      available: true
    }
  ] : [
    { 
      value: 'json', 
      label: '📄 JSON', 
      description: 'JSON or JSONL files',
      available: true
    },
    { 
      value: 'csv', 
      label: '📊 CSV', 
      description: 'CSV files (requires mongoimport)',
      available: isFormatAvailable('csv')
    },
    { 
      value: 'mongorestore', 
      label: '⚡ mongorestore', 
      description: 'Restore from mongodump backup (directory or archive)',
      available: isFormatAvailable('mongorestore')
    }
  ];

  const isActionOverride = (action) => action === 'override';

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
            Import to Database: {databaseName}
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
            {/* Format Selection */}
            <Box sx={{ mb: 2 }}>
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend" sx={{ mb: 1, fontWeight: 500, fontSize: '0.875rem' }}>
                  Import Format:
                </FormLabel>
                <RadioGroup
                  value={importFormat}
                  onChange={(e) => {
                    setImportFormat(e.target.value);
                    setSelectedFiles([]);
                    setValidationErrors([]);
                  }}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    {importFormats.map((format) => {
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
                            borderColor: importFormat === format.value 
                              ? 'primary.main' 
                              : isDisabled 
                              ? 'grey.300' 
                              : 'grey.300',
                            borderRadius: 1,
                            bgcolor: importFormat === format.value 
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
              {isSQL && importFormat === 'pg_restore' && (!binariesStatus.available || binariesStatus.upgradeAvailable) && (
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
                      : 'Download pg_restore/psql to enable native PostgreSQL imports from SQL dumps.'
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

            <Divider sx={{ my: 2 }} />

            {/* File Selection */}
            <Box sx={{ mb: 2 }}>
              <FormLabel component="legend" sx={{ mb: 1, fontWeight: 500, fontSize: '0.875rem' }}>
                Select Files:
              </FormLabel>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                {importFormat === 'mongorestore' ? (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<FolderOpenIcon />}
                      onClick={handleSelectDirectory}
                      sx={{ flex: 1 }}
                    >
                      Select Directory
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<UploadFileIcon />}
                      onClick={handleSelectArchive}
                      sx={{ flex: 1 }}
                    >
                      Select Archive
                    </Button>
                  </>
                ) : importFormat === 'pg_restore' ? (
                  <Button
                    variant="outlined"
                    startIcon={<UploadFileIcon />}
                    onClick={handleSelectFiles}
                    fullWidth
                  >
                    Select SQL Dump File
                  </Button>
                ) : (
                  <Button
                    variant="outlined"
                    startIcon={<UploadFileIcon />}
                    onClick={handleSelectFiles}
                    fullWidth
                  >
                    Select Files
                  </Button>
                )}
              </Box>

              {/* File List */}
              {selectedFiles.length > 0 && (
                <Paper variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto', mt: 1 }}>
                  <List dense>
                    {selectedFiles.map((file, index) => (
                      <ListItem
                        key={index}
                        sx={{ 
                          flexDirection: 'column', 
                          alignItems: 'stretch',
                          borderBottom: index < selectedFiles.length - 1 ? '1px solid' : 'none',
                          borderColor: 'divider',
                          py: 1.5
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <CheckCircleIcon color="success" fontSize="small" />
                          </ListItemIcon>
                          <ListItemText
                            primary={file.name}
                            primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                          />
                          <IconButton 
                            size="small" 
                            onClick={() => handleRemoveFile(index)}
                            sx={{ ml: 1 }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>

                        <Box sx={{ pl: 4.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {/* For PostgreSQL SQL dumps - simplified display */}
                          {isSQL && importFormat === 'pg_restore' ? (
                            <Alert severity="info" icon={<CheckCircleIcon fontSize="small" />} sx={{ py: 0.25 }}>
                              <Typography variant="caption">
                                SQL dump file ready to import. Schema and data will be restored to database "{databaseName}".
                              </Typography>
                            </Alert>
                          ) : file.isArchive ? (
                            /* For MongoDB archives */
                            <Alert severity="info" icon={<CheckCircleIcon fontSize="small" />} sx={{ py: 0.25 }}>
                              <Typography variant="caption">
                                Will restore all {terminology.collections} from archive to database "{file.targetCollection}"
                              </Typography>
                            </Alert>
                          ) : (
                            /* For JSON/CSV files - show collection selection */
                            <>
                              {/* Collection/Table Name Display/Edit */}
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                  Will import to {terminology.collection}:
                                </Typography>
                                <TextField
                                  size="small"
                                  fullWidth
                                  value={file.targetCollection}
                                  onChange={(e) => handleFileSettingChange(index, 'targetCollection', e.target.value)}
                                  placeholder={`${terminology.Collection} name`}
                                  sx={{
                                    '& .MuiInputBase-input': {
                                      fontFamily: 'monospace',
                                      fontSize: '0.875rem'
                                    }
                                  }}
                                />
                              </Box>

                              {/* Show conflict resolution options only if collection/table exists */}
                              {collections.includes(file.targetCollection) ? (
                                <>
                                  {/* Action Selection - only show when there's a conflict */}
                                  <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                      {terminology.Collection} exists - choose action:
                                    </Typography>
                                    <FormControl component="fieldset">
                                      <RadioGroup
                                        row
                                        value={file.action}
                                        onChange={(e) => handleFileSettingChange(index, 'action', e.target.value)}
                                      >
                                        <FormControlLabel
                                          value="override"
                                          control={<Radio size="small" />}
                                          label={
                                            <Typography variant="caption">
                                              Override (drop & recreate)
                                            </Typography>
                                          }
                                        />
                                        <FormControlLabel
                                          value="create"
                                          control={<Radio size="small" />}
                                          label={
                                            <Typography variant="caption">
                                              Keep both (append)
                                            </Typography>
                                          }
                                        />
                                      </RadioGroup>
                                    </FormControl>
                                  </Box>

                                  {/* Warning for override */}
                                  {isActionOverride(file.action) && (
                                    <Alert severity="warning" icon={<WarningIcon fontSize="small" />} sx={{ py: 0.25 }}>
                                      <Typography variant="caption">
                                        This will DROP the existing {terminology.collection} "{file.targetCollection}" and all its data before importing!
                                      </Typography>
                                    </Alert>
                                  )}
                                </>
                              ) : (
                                /* Info for new collection/table */
                                <Alert severity="info" icon={<CheckCircleIcon fontSize="small" />} sx={{ py: 0.25 }}>
                                  <Typography variant="caption">
                                    Will create new {terminology.collection} "{file.targetCollection}"
                                  </Typography>
                                </Alert>
                              )}
                            </>
                          )}
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}

              {selectedFiles.length === 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="caption">
                    No files selected. Click the button above to select files for import.
                  </Typography>
                </Alert>
              )}
            </Box>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Alert severity="error">
                  <Typography variant="caption" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Please fix the following errors:
                  </Typography>
                  {validationErrors.map((error, index) => (
                    <Typography key={index} variant="caption" component="div">
                      • {error}
                    </Typography>
                  ))}
                </Alert>
              </Box>
            )}

            {/* Info Box */}
            {!importing && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="caption">
                  {isSQL ? (
                    importFormat === 'pg_restore' 
                      ? <><strong>PostgreSQL Import:</strong> SQL dumps will restore the database schema and data. The import will execute SQL statements from the file.</>
                      : <><strong>CSV Import:</strong> CSV files will be imported into the selected {terminology.collection}.</>
                  ) : (
                    <>
                      <strong>Important:</strong> "Override" will completely drop the existing {terminology.collection} and recreate it with imported data. "Keep both" will append imported {terminology.documents} to the existing {terminology.collection}.
                      {importFormat === 'mongorestore' && ` For directories, you can edit ${terminology.collection} names and choose different actions for each ${terminology.collection}. For archives, all ${terminology.collections} will be restored to the database.`}
                    </>
                  )}
                </Typography>
              </Alert>
            )}

            {/* Import Progress Indicator */}
            {importing && importProgress && (
              <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'primary.main', borderRadius: 1, bgcolor: 'primary.50' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {importProgress.phase !== 'completed' && importProgress.phase !== 'error' && (
                    <CircularProgress size={24} />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 500,
                        color: importProgress.phase === 'error' ? 'error.main' : 
                               importProgress.phase === 'completed' ? 'success.main' : 'primary.main'
                      }}
                    >
                      {importProgress.phase === 'completed' ? '✅ ' : 
                       importProgress.phase === 'error' ? '❌ ' : '📥 '}
                      {importProgress.message}
                    </Typography>
                    {importProgress.phase !== 'error' && importProgress.phase !== 'completed' && (
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
                              width: importProgress.progress > 0 ? `${importProgress.progress}%` : '100%',
                              height: '100%', 
                              bgcolor: 'primary.main', 
                              borderRadius: 1,
                              animation: importProgress.progress === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
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
      
      <DialogActions sx={{ p: 2, pt: 0 }}>
        <Button
          onClick={onClose}
          color="inherit"
          disabled={importing}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          disabled={selectedFiles.length === 0 || validationErrors.length > 0 || loading || importing}
          variant="contained"
          color="primary"
        >
          {importing ? '📥 Importing...' : `📥 Import ${selectedFiles.length > 0 ? `${selectedFiles.length} ${selectedFiles.length === 1 ? 'File' : 'Files'}` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportDialog;

