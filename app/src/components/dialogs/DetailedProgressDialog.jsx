import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Grid,
  Paper
} from '@mui/material';
import { formatNumber } from '../../utils/formatters';

const DetailedProgressDialog = ({ 
  isOpen, 
  title, 
  progress,
  onCancel 
}) => {
  if (!isOpen || !progress) return null;

  // Detect if this is fast mode (mongodump/mongorestore)
  const isFastMode = progress?.method === 'dump_restore' || title.includes('mongodump/mongorestore');
  
  const getStageDisplay = (stage) => {
    switch (stage) {
      case 'initializing':
        return { text: 'Initializing...', icon: '⚙️' };
      case 'copying_collection':
        return { text: 'Starting collection copy...', icon: '📂' };
      case 'copying_documents':
        return { text: 'Copying documents...', icon: '📄' };
      case 'collection_completed':
        return { text: 'Collection completed', icon: '✅' };
      case 'copying_indexes':
        return { text: 'Copying indexes...', icon: '🔗' };
      case 'completed':
        return { text: 'Completed!', icon: '🎉' };
      case 'counting':
        return { text: 'Counting documents...', icon: '🔢' };
      case 'copying':
        return { text: 'Copying documents...', icon: '📄' };
      // Fast mode stages (mongodump/mongorestore)
      case 'inspecting_archive':
        return { text: 'Inspecting archive...', icon: '🔍' };
      case 'restoring_archive':
        return { text: 'Restoring from archive...', icon: '📥' };
      case 'dumping':
        return { text: 'Dumping data...', icon: '📦' };
      case 'dumping_collection':
        return { text: 'Dumping collection...', icon: '📦' };
      case 'dump_completed':
        return { text: 'Dump completed', icon: '✅' };
      case 'restoring_collection':
        return { text: 'Restoring collection...', icon: '📥' };
      case 'creating_collection':
        return { text: 'Creating collection...', icon: '🏗️' };
      case 'restore_completed':
        return { text: 'Restore completed!', icon: '🎉' };
      // Import stages
      case 'importing_file':
        return { text: 'Importing file...', icon: '📥' };
      case 'file_imported':
        return { text: 'File imported', icon: '✅' };
      case 'import_completed':
        return { text: 'Import completed!', icon: '🎉' };
      default:
        return { text: 'Processing...', icon: '⏳' };
    }
  };

  const stageInfo = getStageDisplay(progress.stage);
  
  // Calculate overall progress percentage
  const getOverallProgress = () => {
    // Check for collections (copy/dump/restore operations)
    if (progress.totalCollections > 0) {
      return Math.round((progress.copiedCollections / progress.totalCollections) * 100);
    }
    // Check for files (import operations)
    if (progress.totalFiles > 0) {
      return Math.round((progress.importedFiles / progress.totalFiles) * 100);
    }
    return 0;
  };

  const getProgressBarColor = () => {
    if (progress.errors && progress.errors.length > 0) {
      return 'warning'; // Yellow if there are errors
    }
    return 'primary'; // Default blue
  };

  return (
    <Dialog
      open={isOpen}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
            {stageInfo.icon} {title}
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ space: 2 }}>
          {/* Current Stage */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {stageInfo.text}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {progress.stage}
            </Typography>
          </Box>

          {/* Overall Progress Bar (Collections) */}
          {progress.totalCollections > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.primary">
                  Collections Progress
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {progress.copiedCollections}/{progress.totalCollections} ({getOverallProgress()}%)
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={getOverallProgress()} 
                color={getProgressBarColor()}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          )}

          {/* Current Collection */}
          {progress.currentCollection && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  📂 {progress.currentCollection}
                </Typography>
                {progress.currentDocuments > 0 && progress.totalDocuments > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {formatNumber(progress.currentDocuments)} docs
                  </Typography>
                )}
              </Box>
              
              {/* Detailed Collection Progress (for mongorestore) */}
              {progress.collectionProgress && (
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Data Transfer Progress
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {progress.collectionProgress.currentSize} / {progress.collectionProgress.totalSize} ({progress.collectionProgress.percentage}%)
                    </Typography>
                  </Box>
                  
                  {/* Progress Bar */}
                  <LinearProgress 
                    variant="determinate" 
                    value={progress.collectionProgress.percentage} 
                    sx={{ height: 6, borderRadius: 3, mb: 1 }}
                  />
                  
                  {/* Visual Progress Bar (mimicking mongorestore output) */}
                  <Box sx={{ 
                    fontFamily: 'monospace', 
                    fontSize: '0.75rem', 
                    color: 'text.secondary',
                    bgcolor: 'grey.100',
                    p: 1,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.300'
                  }}>
                    [{progress.collectionProgress.progressBar}] {progress.collectionProgress.collection} {progress.collectionProgress.currentSize}/{progress.collectionProgress.totalSize} ({progress.collectionProgress.percentage}%)
                  </Box>
                </Box>
              )}
            </Paper>
          )}

          {/* Document Progress */}
          {progress.totalDocuments > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.primary">
                  Total Documents
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatNumber(progress.totalDocuments)}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Statistics */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={isFastMode ? 12 : 6}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.50' }}>
                <Typography variant="h4" color="primary.main" sx={{ fontWeight: 'bold' }}>
                  {progress.copiedCollections || 0}
                </Typography>
                <Typography variant="caption" color="primary.main">
                  Collections Copied
                </Typography>
              </Paper>
            </Grid>
            {/* Only show documents counter for slow mode */}
            {!isFastMode && (
              <Grid item xs={6}>
                <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.50' }}>
                  <Typography variant="h4" color="success.main" sx={{ fontWeight: 'bold' }}>
                    {formatNumber(progress.totalDocuments || 0)}
                  </Typography>
                  <Typography variant="caption" color="success.main">
                    Documents Processed
                  </Typography>
                </Paper>
              </Grid>
            )}
          </Grid>

          {/* Errors */}
          {progress.errors && progress.errors.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                ⚠️ {progress.errors.length} Error(s) Encountered
              </Typography>
              <Box sx={{ maxHeight: 80, overflow: 'auto' }}>
                {progress.errors.slice(0, 3).map((error, index) => (
                  <Typography key={index} variant="caption" display="block">
                    • {error.collection}: {error.error}
                  </Typography>
                ))}
                {progress.errors.length > 3 && (
                  <Typography variant="caption" color="text.secondary">
                    ... and {progress.errors.length - 3} more
                  </Typography>
                )}
              </Box>
            </Alert>
          )}

          {/* Progress Animation */}
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Box 
                sx={{ 
                  width: 8, 
                  height: 8, 
                  bgcolor: 'primary.main', 
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out both',
                  animationDelay: '0ms'
                }} 
              />
              <Box 
                sx={{ 
                  width: 8, 
                  height: 8, 
                  bgcolor: 'primary.main', 
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out both',
                  animationDelay: '150ms'
                }} 
              />
              <Box 
                sx={{ 
                  width: 8, 
                  height: 8, 
                  bgcolor: 'primary.main', 
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out both',
                  animationDelay: '300ms'
                }} 
              />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      
      {onCancel && progress.stage !== 'completed' && (
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={onCancel} color="inherit">
            Cancel
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default DetailedProgressDialog;