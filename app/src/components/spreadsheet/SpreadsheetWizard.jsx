import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Chip,
  Divider,
  TextField,
  CircularProgress,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Psychology as AIIcon,
  Storage as DatabaseIcon,
  CheckCircle as CompleteIcon,
  Close as CloseIcon,
  Cable as ConnectionIcon
} from '@mui/icons-material';
import DatabaseConflictDialog from '../dialogs/DatabaseConflictDialog';

import { useDatabase } from '../../context/DatabaseContext';
import SpreadsheetUploader from './SpreadsheetUploader';
import AIDesignReview from './AIDesignReview';
import ProcessingProgress from './ProcessingProgress';
import { getDatabaseDisplayName, getTerminology, isRelationalDatabase } from '../../utils/databaseTypeUtils';

const SpreadsheetWizard = ({ open, onClose }) => {
  const { activeConnections, selectedDatabase, refreshDatabases, connections, getConnectionDatabaseType } = useDatabase();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileAnalysis, setFileAnalysis] = useState(null);
  const [aiDesign, setAiDesign] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [databaseName, setDatabaseName] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  
  // Database conflict dialog state
  const [conflictDialog, setConflictDialog] = useState({
    open: false,
    conflictingName: '',
    existingDatabases: [],
    pendingAction: null
  });

  // Get database type and terminology for selected connection
  const selectedDbType = selectedConnectionId ? getConnectionDatabaseType(selectedConnectionId) : 'mongodb';
  const terminology = getTerminology(selectedDbType);
  const dbDisplayName = getDatabaseDisplayName(selectedDbType);
  const isSQL = isRelationalDatabase(selectedDbType);

  const steps = [
    { label: 'Choose Connection', icon: <ConnectionIcon /> },
    { label: 'Upload File', icon: <UploadIcon /> },
    { label: 'AI Analysis', icon: <AIIcon /> },
    { label: 'Review Design', icon: <DatabaseIcon /> },
    { label: 'Create Database', icon: <CompleteIcon /> }
  ];

  // Helper function to check if dialog should reset
  const shouldResetDialog = (isOpen) => {
    return isOpen;
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (shouldResetDialog(open)) {
      setCurrentStep(0);
      setSelectedFile(null);
      setFileAnalysis(null);
      setAiDesign(null);
      setProcessing(false);
      setProgress(null);
      setError(null);
      setResult(null);
      setDatabaseName('');
      // Set default connection to first available connection
      setSelectedConnectionId(activeConnections?.[0] || '');
    }
  }, [open, activeConnections]);

  // Helper functions for prerequisites
  const hasActiveConnection = (connections) => {
    return connections && connections.length > 0;
  };

  const hasValidDatabaseName = (dbName) => {
    return dbName.trim().length > 0;
  };

  const hasSelectedConnection = (connectionId) => {
    return connectionId && connectionId.trim().length > 0;
  };

    const canCreateDatabase = (connections, dbName, file, design, connectionId) => {
      return hasActiveConnection(connections) && 
             hasValidDatabaseName(dbName) && 
             hasSelectedConnection(connectionId) &&
             file && 
             (file.path || file.isBuffer) && // Ensure file has either path or buffer
             design;
    };

  // Check prerequisites
  const connectionAvailable = hasActiveConnection(activeConnections);
  const databaseNameValid = hasValidDatabaseName(databaseName);

  const extractFileName = (file) => {
    // Try different ways to get the filename
    if (file.fileName) return file.fileName; // For drag-and-drop files
    if (file.name) return file.name;
    if (file.path) return file.path.split(/[\\\/]/).pop();
    return 'spreadsheet';
  };

  const getConnectionDisplayName = (connectionId) => {
    const connection = connections[connectionId];
    if (connection?.name) {
      return connection.name;
    }
    // Fallback to connection ID if no name available
    return connectionId;
  };


  const handleFileSelect = async (file) => {
    setSelectedFile(file);
    setError(null);
    
    // Set default database name from spreadsheet filename
    const fileName = extractFileName(file);
    const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    const sanitizedName = fileNameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_'); // Replace special chars with underscore
    setDatabaseName(sanitizedName);
    
    try {
      setProcessing(true);
      
      
      let estimate;
      
      if (file.isBuffer) {
        // Buffer-based file (drag-and-drop) - estimate already available
        estimate = { success: true, estimate: file.estimate };
      } else {
        // Path-based file (file browser) - need to get estimate
        if (!file.path) {
          throw new Error('File path is required for browser-selected files.');
        }
        
        estimate = await window.electronAPI.spreadsheet.estimate(file.path);
      }
      
      if (estimate.success) {
        setFileAnalysis(estimate.estimate);
        setCurrentStep(2); // Move to step 2 (AI Analysis) after file upload
      } else {
        setError(estimate.error);
      }
    } catch (err) {
      setError(`Failed to analyze file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
    setFileAnalysis(null);
    setCurrentStep(1); // Go back to step 1 (Upload File)
    setError(null);
  };

  const handleSkipAI = async () => {
    if (!selectedFile || !fileAnalysis) return;
    
    try {
      setProcessing(true);
      setError(null);
      
      // For direct import, we'll skip the design step entirely and go straight to database creation
      // Create a simple design object just for display purposes
      const simpleDesign = {
        strategy: 'simple_direct_import',
        reasoning: 'Direct import without AI analysis or transformations. All sheets will be imported as-is with each sheet becoming a separate collection.',
        collections: [], // Will be determined during import
        transformationRules: [], // No transformations needed
        isSimpleDirectImport: true // Flag to indicate this is a simple import
      };
      
      console.log('🔍 Using simple direct import approach');
      
      setAiDesign(simpleDesign);
      setCurrentStep(3); // Move to step 3 (Review Design)
      
    } catch (err) {
      setError(`Failed to prepare direct import: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleAnalyzeWithAI = async () => {
    if (!selectedFile) return;
    
    try {
      setProcessing(true);
      setError(null);
      
      
      let analysis;
      
      if (selectedFile.isBuffer && selectedFile.buffer) {
        // Buffer-based file (drag-and-drop) - use buffer analysis
        const fileName = selectedFile.fileName || selectedFile.name || 'spreadsheet';
        analysis = await window.electronAPI.spreadsheet.analyzeBuffer(
          selectedFile.buffer, 
          fileName,
          selectedConnectionId // Pass connectionId for database type detection
        );
      } else if (selectedFile.path) {
        // Path-based file (file browser) - use file path analysis
        analysis = await window.electronAPI.spreadsheet.analyze(selectedFile.path, selectedConnectionId);
      } else {
        throw new Error('File is missing both buffer data and file path. Cannot proceed with analysis.');
      }
      
      if (analysis.success) {
        setAiDesign(analysis.aiDesign);
        setCurrentStep(3); // Move to step 3 (Review Design)
      } else {
        setError(analysis.error);
      }
    } catch (err) {
      setError(`AI analysis failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const checkDatabaseConflict = async (targetDatabaseName) => {
    try {
      if (!selectedConnectionId) {
        throw new Error('No database connection selected');
      }

      const conflictResult = await window.electronAPI.spreadsheet.checkDatabaseConflict(
        selectedConnectionId, 
        targetDatabaseName
      );
      
      if (!conflictResult.success) {
        throw new Error(conflictResult.error);
      }
      
      return conflictResult;
    } catch (error) {
      console.error('Error checking database conflict:', error);
      throw error;
    }
  };

  const handleCreateDatabase = async () => {
    if (!canCreateDatabase(activeConnections, databaseName, selectedFile, aiDesign, selectedConnectionId)) return;
    
    try {
      setProcessing(true);
      setError(null);
      
      
      // Validate file (buffer or path-based)
      if (selectedFile.isBuffer && !selectedFile.buffer) {
        throw new Error('Buffer data is missing for drag-and-drop file.');
      }
      if (!selectedFile.isBuffer && !selectedFile.path) {
        throw new Error('File path is required for browser-selected files.');
      }
      
      if (!selectedConnectionId) {
        throw new Error('No database connection selected');
      }

      // Check for database name conflicts
      const conflictCheck = await checkDatabaseConflict(databaseName.trim());
      
      if (conflictCheck.hasConflict) {
        // Show conflict dialog
        setConflictDialog({
          open: true,
          conflictingName: databaseName.trim(),
          existingDatabases: conflictCheck.existingDatabases,
          pendingAction: 'create'
        });
        setProcessing(false);
        return;
      }
      
      // No conflict, proceed with creation
      await executeCreateDatabase(databaseName.trim());
      
    } catch (err) {
      setError(`Database creation failed: ${err.message}`);
      setProcessing(false);
    }
  };

  const executeCreateDatabase = async (finalDatabaseName) => {
    try {
      setCurrentStep(4); // Move to step 4 (Create Database)
      setError(null);

      // Set up progress listener
      const unsubscribe = window.electronAPI.spreadsheet.onProgress((progressData) => {
        setProgress(progressData);
      });
      
      let processResult;
      
      // Check if this is a simple direct import
      if (aiDesign.isSimpleDirectImport) {
        console.log('🔍 Using simple direct import method');
        
        if (selectedFile.path) {
          // Path-based file (file browser) - use simple direct import
          processResult = await window.electronAPI.spreadsheet.createSimpleDirectImport(
            selectedFile.path,
            selectedConnectionId,
            finalDatabaseName
          );
        } else {
          throw new Error('Simple direct import currently only supports file browser selection. Please use file browser instead of drag-and-drop.');
        }
      } else {
        // Use the complex AI-based import
        if (selectedFile.isBuffer && selectedFile.buffer) {
          // Buffer-based file (drag-and-drop)
          const fileName = selectedFile.fileName || selectedFile.name || 'spreadsheet';
          processResult = await window.electronAPI.spreadsheet.createWithDesignFromBuffer(
            selectedFile.buffer,
            fileName,
            aiDesign,
            selectedConnectionId,
            finalDatabaseName
          );
        } else if (selectedFile.path) {
          // Path-based file (file browser)
          processResult = await window.electronAPI.spreadsheet.createWithDesign(
            selectedFile.path,
            aiDesign,
            selectedConnectionId,
            finalDatabaseName
          );
        } else {
          throw new Error('File is missing both buffer data and file path. Cannot proceed with database creation.');
        }
      }
      
      // Clean up progress listener
      unsubscribe();
      
      if (processResult.success) {
        setResult(processResult);
        setProgress({ 
          phase: 'completed', 
          message: 'Database created successfully!',
          data: processResult.insertionResult 
        });
        
        // Refresh the database list for the selected connection
        try {
          await refreshDatabases(selectedConnectionId);
        } catch (refreshError) {
          // Don't fail the entire operation if refresh fails
        }
      } else {
        setError(processResult.error);
      }
    } catch (err) {
      setError(`Database creation failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleConflictResolve = async (resolution) => {
    setConflictDialog({ ...conflictDialog, open: false });
    
    if (resolution.action === 'replace') {
      // User chose to replace existing database
      await executeCreateDatabase(resolution.newName);
    } else if (resolution.action === 'rename') {
      // User chose to use a different name
      setDatabaseName(resolution.newName);
      await executeCreateDatabase(resolution.newName);
    }
  };

  const handleConflictCancel = () => {
    setConflictDialog({
      open: false,
      conflictingName: '',
      existingDatabases: [],
      pendingAction: null
    });
  };

  const handleClose = () => {
    if (!processing) {
      onClose();
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        // Step 1: Choose Connection
        return (
          <Box>
            <Card sx={{ mb: 3 }}>
              <CardHeader 
                title="Select Target Connection" 
                subheader="Choose which database connection to use for your new database"
              />
              <CardContent>
                <Stack spacing={3}>
                  
                  {/* Connection Selector */}
                  {activeConnections && activeConnections.length > 0 ? (
                    <FormControl fullWidth required>
                      <InputLabel>Target Connection</InputLabel>
                      <Select
                        value={selectedConnectionId}
                        onChange={(e) => setSelectedConnectionId(e.target.value)}
                        label="Target Connection"
                        disabled={processing}
                      >
                        {activeConnections.map((connectionId) => (
                          <MenuItem key={connectionId} value={connectionId}>
                            {getConnectionDisplayName(connectionId)}
                          </MenuItem>
                        ))}
                      </Select>
                      {activeConnections.length === 1 && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Only one connection available
                        </Typography>
                      )}
                    </FormControl>
                  ) : (
                    <Alert severity="warning">
                      <Typography variant="body2">
                        No active database connections found. Please connect to a database first.
                      </Typography>
                    </Alert>
                  )}
                  
                  <Typography variant="body2" color="text.secondary">
                    Your spreadsheet will be imported into a new database on the selected connection.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
            
            <Button
              variant="contained"
              onClick={() => setCurrentStep(1)}
              disabled={processing || !selectedConnectionId}
              fullWidth
              size="large"
            >
              Continue to File Upload
            </Button>
          </Box>
        );

      case 1:
        // Step 2: Upload File
        return (
          <SpreadsheetUploader
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            selectedFile={selectedFile}
            isProcessing={processing}
          />
        );

      case 2:
        // Step 3: AI Analysis
        return (
          <Box>
            {fileAnalysis && (
              <Card sx={{ mb: 3 }}>
                <CardHeader title="File Analysis" />
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={2} flexWrap="wrap">
                      <Chip label={`${fileAnalysis.totalSheets} sheet(s)`} />
                      <Chip label={`${fileAnalysis.totalRows?.toLocaleString()} rows`} />
                      <Chip label={fileAnalysis.fileSize} />
                    </Stack>
                    
                    <Typography variant="body2" color="text.secondary">
                      Estimated processing time: {fileAnalysis.estimatedProcessingTime}
                    </Typography>
                    
                    {fileAnalysis.hasMultipleSheets && (
                      <Alert severity="info">
                        Multiple sheets detected. AI will analyze relationships between sheets.
                      </Alert>
                    )}
                    
                  </Stack>
                </CardContent>
              </Card>
            )}
            
            <Card sx={{ mb: 3, bgcolor: 'background.default' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Choose Import Method
                </Typography>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" color="primary.main" gutterBottom>
                      📋 Direct Import (Recommended)
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Import data as-is without analysis. Each sheet becomes a {terminology.collection} with direct {terminology.field} mapping. Fast and reliable.
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      🤖 AI-Optimized Import (Experimental)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      AI analyzes your data patterns and relationships to create an optimized {isSQL ? 'SQL schema with proper indexes and table structure' : 'schema with proper indexes and document structure'}.
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
            
            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                onClick={handleAnalyzeWithAI}
                disabled={processing || !selectedFile}
                startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <AIIcon />}
                fullWidth
                size="large"
              >
                {processing ? 'Analyzing with AI...' : 'AI Import (Experimental)'}
              </Button>
              <Button
                variant="contained"
                onClick={handleSkipAI}
                disabled={processing || !selectedFile}
                startIcon={<DatabaseIcon />}
                fullWidth
                size="large"
              >
                Direct Import
              </Button>
            </Stack>
          </Box>
        );

      case 3:
        // Step 4: Review Design
        return (
          <Box>
            {aiDesign && (
              <>
                {aiDesign.strategy?.includes('direct') ? (
                  // Custom display for direct import
                  <Card sx={{ mb: 3 }}>
                    <CardHeader
                      avatar={<DatabaseIcon color="info" />}
                      title="Direct Import Design"
                      subheader="Review the simple import structure"
                      action={
                        <Chip 
                          icon={<DatabaseIcon />}
                          label={aiDesign.strategy.replace('_', ' ').toUpperCase()}
                          color="info"
                          variant="outlined"
                        />
                      }
                    />
                    <CardContent>
                      <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                          Direct import mode will create collections with simple field mapping. 
                          Review the structure and click "Create Database" to proceed.
                        </Typography>
                      </Alert>
                      
                      <Typography variant="body1" paragraph>
                        {aiDesign.reasoning}
                      </Typography>
                      
                      <Typography variant="body2" color="text.secondary">
                        Each sheet will be imported as-is with direct column-to-field mapping.
                      </Typography>
                      
                      {/* Collections list for direct import */}
                      <Box sx={{ mt: 3 }}>
                        <Typography variant="h6" gutterBottom>
                          Collections to Create ({aiDesign.collections.length})
                        </Typography>
                        <Stack spacing={2}>
                          {aiDesign.collections.map((collection, index) => (
                            <Card key={index} variant="outlined">
                              <CardContent>
                                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                                  <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                                    {collection.name}
                                  </Typography>
                                  <Chip 
                                    label={`${collection.sourceSheets.length} sheet(s)`}
                                    size="small"
                                    variant="outlined"
                                  />
                                </Stack>
                                
                                <Typography variant="body2" color="text.secondary">
                                  Source sheets: {collection.sourceSheets.join(', ')}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Import method: Direct field mapping (no optimization)
                                </Typography>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      </Box>
                    </CardContent>
                  </Card>
                ) : (
                  // Standard AI design review
                  <AIDesignReview design={aiDesign} fileInfo={fileAnalysis} databaseType={selectedDbType} />
                )}
              </>
            )}
            
            <Card sx={{ mt: 3, mb: 3 }}>
              <CardHeader title="Database Configuration" />
              <CardContent>
                <Stack spacing={3}>
                  {/* Show selected connection info */}
                  <Alert severity="info">
                    <Typography variant="body2">
                      Target Connection: <strong>{getConnectionDisplayName(selectedConnectionId)}</strong>
                    </Typography>
                  </Alert>
                  
                  <TextField
                    fullWidth
                    label="Database Name"
                    value={databaseName}
                    onChange={(e) => setDatabaseName(e.target.value)}
                    placeholder="Enter new database name (e.g., sales_data)"
                    helperText="A new database will be created with this name"
                    disabled={processing}
                    required
                  />
                </Stack>
              </CardContent>
            </Card>
            
            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                onClick={() => setCurrentStep(2)}
                disabled={processing}
              >
                Back to Analysis
              </Button>
              <Button
                variant="contained"
                onClick={handleCreateDatabase}
                disabled={processing || !canCreateDatabase(activeConnections, databaseName, selectedFile, aiDesign, selectedConnectionId)}
                startIcon={processing ? <CircularProgress size={20} color="inherit" /> : <DatabaseIcon />}
                fullWidth
              >
                {processing ? 'Creating Database...' : 'Create Database'}
              </Button>
            </Stack>
          </Box>
        );

      case 4:
        return (
          <Box>
            <ProcessingProgress progress={progress} error={error} databaseType={selectedDbType} />
            
            {result && (
              <Card sx={{ mt: 3 }}>
                <CardContent>
                  <Typography variant="h6" color="primary.main" gutterBottom>
                    🎉 Database Created Successfully!
                  </Typography>
                  
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      • {result.insertionResult?.totalInserted?.toLocaleString() || 0} {terminology.documents} inserted
                    </Typography>
                    <Typography variant="body2">
                      • {result.insertionResult?.collections?.length || 0} {terminology.collections} created
                    </Typography>
                    <Typography variant="body2">
                      • Strategy: {result.aiDesign?.strategy?.replace('_', ' ') || 'Unknown'}
                    </Typography>
                  </Stack>
                  
                  <Button
                    variant="contained"
                    onClick={handleClose}
                    sx={{ mt: 2 }}
                    fullWidth
                  >
                    Done
                  </Button>
                </CardContent>
              </Card>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={(event, reason) => {
        // Prevent closing on backdrop click or escape key
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          return;
        }
        // Only allow closing via explicit user action (close button)
        if (!processing) {
          handleClose();
        }
      }}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={true}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Box component="span" sx={{ fontSize: '1.25rem', fontWeight: 500 }}>
              Spreadsheet to Database
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Transform your spreadsheet into an optimized {dbDisplayName} database
            </Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            disabled={processing}
            size="small"
            sx={{ mt: -1, mr: -1 }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Prerequisites Check - now handled in step 1 */}

        {/* Progress Stepper */}
        <Stepper activeStep={currentStep} sx={{ mb: 3 }}>
          {steps.map((step, index) => (
            <Step key={index}>
              <StepLabel icon={step.icon}>
                {step.label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>

        <Divider sx={{ mb: 3 }} />

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Step Content */}
        {renderStepContent()}
      </DialogContent>

      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={processing}
        >
          {result ? 'Close' : 'Cancel'}
        </Button>
      </DialogActions>
      
      {/* Database Conflict Dialog */}
      <DatabaseConflictDialog
        open={conflictDialog.open}
        onClose={handleConflictCancel}
        conflictingName={conflictDialog.conflictingName}
        existingDatabases={conflictDialog.existingDatabases}
        onResolve={handleConflictResolve}
      />
    </Dialog>
  );
};

export default SpreadsheetWizard;
