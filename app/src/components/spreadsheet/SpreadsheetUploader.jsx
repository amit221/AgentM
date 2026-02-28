import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Chip,
  Stack,
  IconButton
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as FileIcon,
  Close as CloseIcon,
  InsertDriveFile as SpreadsheetIcon
} from '@mui/icons-material';

const SpreadsheetUploader = ({ onFileSelect, onFileRemove, selectedFile, isProcessing }) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  // Helper function to determine rejection error message
  const getFileRejectionMessage = (rejection) => {
    if (rejection.errors.some(e => e.code === 'file-too-large')) {
      const fileSizeMB = rejection.file?.size ? (rejection.file.size / (1024 * 1024)).toFixed(2) : 'unknown';
      return `File is too large. File size: ${fileSizeMB}MB, Maximum allowed: 500MB.`;
    }
    
    if (rejection.errors.some(e => e.code === 'file-invalid-type')) {
      return 'Invalid file type. Please select an Excel (.xlsx, .xls) or CSV file.';
    }
    
    return 'File validation failed. Please try another file.';
  };

  // Helper function to check if file was dropped (vs selected via browser)
  const isDroppedFile = (file) => {
    return !file.path;
  };

  // Unified file processing function for both browse and drag-and-drop
  const processFile = async (file, isFromBrowser = false) => {
    const fileType = isFromBrowser ? 'browser-selected' : 'drag-and-drop';
    console.log(`📁 ${fileType} file detected - processing:`, file.name || file.path);
    
    // Set up progress listener FIRST, before any processing
    const unsubscribeProgress = window.electronAPI.dialog.onAnalyzeProgress((progress) => {
      console.log('📊 Frontend: Received progress update:', progress);
      if (progress.message) {
        console.log('📊 Frontend: Setting progress message:', progress.message);
        setProgressMessage(progress.message);
      }
    });
    
    console.log('📊 Frontend: Progress listener set up for file:', file.name || file.path);
    
    try {
      setLocalProcessing(true);
      
      let analysisResult;
      let fileSizeMB;
      
      if (isFromBrowser) {
        // Browser file - has path, need to validate and get stats
        setProgressMessage('Validating file...');
        
        const validation = await window.electronAPI.spreadsheet.validate(file.path);
        if (!validation.valid) {
          throw new Error(`File validation failed: ${validation.error}`);
        }
        
        setProgressMessage('Getting file information...');
        const statsResult = await window.electronAPI.spreadsheet.getFileStats(file.path);
        const stats = statsResult.success ? statsResult.stats : {};
        fileSizeMB = parseFloat(stats.sizeMB) || 0;
        
        setProgressMessage('Analyzing file structure...');
        // For browser files, we could use path-based analysis or convert to buffer
        // For now, let's use the existing path-based analysis
        analysisResult = {
          success: true,
          fileName: file.path.split('\\').pop() || file.path.split('/').pop(),
          estimate: { /* we'll get this from the wizard later */ }
        };
      } else {
        // Drag-and-drop file - process from buffer
        setProgressMessage('Reading file data...');
        
        const fileData = await file.arrayBuffer();
        fileSizeMB = file.size / (1024 * 1024);
        
        setProgressMessage('Analyzing file structure...');
        analysisResult = await window.electronAPI.dialog.analyzeDroppedFile(fileData, file.name);
      }
      
      // Clean up progress listener
      unsubscribeProgress();
      
      if (!analysisResult.success) {
        throw new Error(`Failed to analyze file: ${analysisResult.error}`);
      }
      
      setProgressMessage('Analysis complete!');
      console.log(`✅ ${fileType} file analyzed successfully:`, file.name || file.path);
      
      // Create unified file metadata structure
      const fileWithMetadata = isFromBrowser ? {
        // Browser file metadata
        path: file.path,
        name: analysisResult.fileName,
        size: file.size || 0,
        sizeMB: fileSizeMB,
        willUseStreaming: fileSizeMB > 50
      } : {
        // Drag-and-drop file metadata
        ...file,
        isBuffer: true,
        buffer: analysisResult.buffer,
        fileName: analysisResult.fileName,
        estimate: analysisResult.estimate,
        sizeMB: fileSizeMB,
        willUseStreaming: fileSizeMB > 50
      };
      
      console.log('📁 Calling onFileSelect with processed file metadata');
      onFileSelect(fileWithMetadata);
      
      return analysisResult;
    } catch (error) {
      console.log(`❌ Error processing ${fileType} file:`, error.message);
      setFileError(error.message);
      throw error;
    } finally {
      setLocalProcessing(false);
      setProgressMessage('');
    }
  };

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    setFileError(null);
    
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      console.log('📁 Frontend file rejection:', rejection);
      console.log('📁 Rejection errors:', rejection.errors);
      console.log('📁 File size:', rejection.file?.size, 'bytes');
      
      setFileError(getFileRejectionMessage(rejection));
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const fileSizeMB = file.size / (1024 * 1024);
      console.log('📁 Frontend file accepted:', file.name);
      console.log('📁 File size:', file.size, 'bytes', `(${fileSizeMB.toFixed(2)} MB)`);
      
      try {
        let fileWithMetadata;
        
        if (isDroppedFile(file)) {
          // Drag-and-drop file - process asynchronously to show progress
          console.log('📁 Starting async processing for dropped file');
          processFile(file, false); // Don't await - let it run async
          return; // Exit early - processFile will call onFileSelect when done
        } else {
          // File selected via file browser - this shouldn't happen in onDrop
          // but handle it just in case
          console.log('📁 File browser selection in onDrop - using unified processor');
          processFile(file, true); // isFromBrowser = true
          return;
        }
      } catch (error) {
        console.log('❌ File processing error:', error.message);
        setFileError(`File processing failed: ${error.message}`);
      }
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxSize: 500 * 1024 * 1024, // 500MB
    multiple: false,
    disabled: isProcessing || localProcessing
  });

  const handleBrowseFiles = async (event) => {
    // Prevent the dropzone click handler from also triggering
    event.stopPropagation();
    
    try {
      const result = await window.electronAPI.dialog.openSpreadsheet();
      
      if (result.success && !result.canceled) {
        console.log('📁 File selected via browser:', result.filePath);
        
        // Create a file-like object for the unified processor
        const fileInfo = {
          path: result.filePath,
          name: result.filePath.split('\\').pop() || result.filePath.split('/').pop()
        };

        // Use unified processing function with progress UI
        processFile(fileInfo, true); // isFromBrowser = true
      }
    } catch (error) {
      console.log('❌ Browser file selection error:', error.message);
      setFileError(`Failed to select file: ${error.message}`);
    }
  };

  const handleRemoveFile = () => {
    setFileError(null);
    onFileRemove();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (selectedFile) {
    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2}>
            <SpreadsheetIcon color="primary" />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                {selectedFile.name}
              </Typography>
              {selectedFile.size > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(selectedFile.size)}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1}>
              <Chip 
                label="Ready" 
                color="primary" 
                size="small" 
                variant="outlined" 
              />
              {selectedFile.willUseStreaming && (
                <Chip 
                  label="Streaming Mode" 
                  color="info" 
                  size="small" 
                  variant="outlined" 
                />
              )}
            </Stack>
            {!isProcessing && !localProcessing && (
              <IconButton 
                onClick={handleRemoveFile}
                size="small"
                color="error"
              >
                <CloseIcon />
              </IconButton>
            )}
          </Stack>
          
          {selectedFile.willUseStreaming && !isProcessing && !localProcessing && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                Large file detected ({selectedFile.sizeMB?.toFixed(1)} MB). 
                Streaming mode will be used for optimal memory usage.
              </Typography>
            </Alert>
          )}
          
          {(isProcessing || localProcessing) && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {localProcessing && progressMessage ? progressMessage : 'Processing file...'}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Card 
        sx={{ 
          mb: 3,
          border: dragActive ? '2px dashed' : '2px dashed transparent',
          borderColor: dragActive ? 'primary.main' : 'grey.300',
          backgroundColor: dragActive ? 'action.hover' : 'background.paper',
          transition: 'all 0.2s ease-in-out',
          cursor: (isProcessing || localProcessing) ? 'not-allowed' : 'pointer'
        }}
      >
        <CardContent>
          <Box
            {...getRootProps()}
            sx={{
              textAlign: 'center',
              py: 4,
              px: 2,
              opacity: (isProcessing || localProcessing) ? 0.5 : 1
            }}
          >
            <input {...getInputProps()} />
            
            <UploadIcon 
              sx={{ 
                fontSize: 64, 
                color: dragActive ? 'primary.main' : 'text.secondary',
                mb: 2 
              }} 
            />
            
            <Typography variant="h6" gutterBottom>
              {dragActive ? 'Drop your spreadsheet here' : 'Upload Spreadsheet'}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" paragraph>
              Drag and drop your file here, or click "Browse Files" to select your Excel or CSV file
            </Typography>
            
            {!isProcessing && !localProcessing && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<FileIcon />}
                  onClick={handleBrowseFiles}
                  disabled={isProcessing || localProcessing}
                >
                  Browse Files
                </Button>
              </Box>
            )}
            
            {!isProcessing && !localProcessing && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  Supported formats: .xlsx, .xls, .csv (max 500MB)
                </Typography>
              </Box>
            )}
          </Box>
          
          {(isProcessing || localProcessing) && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {localProcessing && progressMessage ? progressMessage : 'Processing file...'}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {fileError && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          onClose={() => setFileError(null)}
        >
          {fileError}
        </Alert>
      )}
    </Box>
  );
};

export default SpreadsheetUploader;
