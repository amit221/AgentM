import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Box,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  Stack,
  Alert,
  Collapse
} from '@mui/material';
import {
  Analytics as AnalyzeIcon,
  Psychology as AIIcon,
  Storage as DatabaseIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { getTerminology, getDatabaseDisplayName } from '../../utils/databaseTypeUtils';

const ProcessingProgress = ({ progress: rawProgress, error, databaseType = 'mongodb' }) => {
  // Get terminology based on database type
  const terminology = getTerminology(databaseType);
  const dbDisplayName = getDatabaseDisplayName(databaseType);

  // Normalize progress data to handle different formats
  // Some callbacks send {phase, data: {...}}, others send {phase, totalInserted, ...}
  const normalizeProgress = (raw) => {
    if (!raw) return null;
    
    // If data is already wrapped in a 'data' property, use as-is
    if (raw.data !== undefined) {
      return raw;
    }
    
    // Otherwise, wrap the entire object in a 'data' property
    // but keep phase, message, isDirectImport at top level
    const { phase, message, isDirectImport, ...rest } = raw;
    return {
      phase,
      message,
      isDirectImport,
      data: rest
    };
  };

  const progress = normalizeProgress(rawProgress);
  const getStepIcon = (phase, currentPhase, progress) => {
    if (error && phase === currentPhase) {
      return <ErrorIcon color="error" />;
    }
    
    // Handle direct import special cases
    if (progress?.isDirectImport) {
      if (phase === 'analyzing' || phase === 'design_ready') {
        return <CompleteIcon color="primary" />; // Always completed for direct import
      }
      if (phase === 'ai_analysis') {
        return <AIIcon color="disabled" />; // Always skipped for direct import
      }
    }
    
    const phaseOrder = ['analyzing', 'ai_analysis', 'design_ready', 'creating', 'inserting', 'completed'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const stepIndex = phaseOrder.indexOf(phase);
    
    if (stepIndex < currentIndex || currentPhase === 'completed') {
      return <CompleteIcon color="primary" />;
    }
    
    switch (phase) {
      case 'analyzing':
        return <AnalyzeIcon color={currentPhase === phase ? 'primary' : 'disabled'} />;
      case 'ai_analysis':
      case 'design_ready':
        return <AIIcon color={currentPhase === phase ? 'primary' : 'disabled'} />;
      case 'creating':
      case 'inserting':
      case 'completed':
        return <DatabaseIcon color={currentPhase === phase ? 'primary' : 'disabled'} />;
      default:
        return null;
    }
  };

  const getStepStatus = (phase, currentPhase, progress) => {
    if (error && phase === currentPhase) return 'error';
    
    // Handle direct import special cases
    if (progress?.isDirectImport) {
      switch (phase) {
        case 'analyzing':
          return 'completed'; // Always completed for direct import
        case 'ai_analysis':
          return 'skipped'; // Always skipped for direct import
        case 'design_ready':
          return 'completed'; // Always completed for direct import
        case 'creating':
        case 'inserting':
          if (currentPhase === phase) return 'active';
          if (currentPhase === 'completed') return 'completed';
          return 'inactive';
        case 'completed':
          return currentPhase === 'completed' ? 'completed' : 'inactive';
        default:
          return 'inactive';
      }
    }
    
    const phaseOrder = ['analyzing', 'ai_analysis', 'design_ready', 'creating', 'inserting', 'completed'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const stepIndex = phaseOrder.indexOf(phase);
    
    if (stepIndex < currentIndex || currentPhase === 'completed') return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'inactive';
  };

  const steps = [
    {
      phase: 'analyzing',
      label: 'Analyzing File',
      description: 'Reading spreadsheet structure and analyzing data'
    },
    {
      phase: 'ai_analysis',
      label: 'AI Analysis',
      description: `AI is designing optimal ${dbDisplayName} structure`
    },
    {
      phase: 'design_ready',
      label: 'Design Complete',
      description: 'Database design ready for implementation'
    },
    {
      phase: 'creating',
      label: 'Creating Database',
      description: `Setting up ${terminology.collections} and indexes`
    },
    {
      phase: 'inserting',
      label: 'Importing Data',
      description: 'Transforming and inserting data'
    },
    {
      phase: 'completed',
      label: 'Complete',
      description: 'Database created successfully'
    }
  ];

  const getActiveStepIndex = () => {
    if (!progress?.phase) return 0;
    
    // For direct import, skip AI analysis step in the active calculation
    if (progress.isDirectImport && progress.phase === 'creating') {
      return steps.findIndex(step => step.phase === 'creating');
    }
    
    return steps.findIndex(step => step.phase === progress.phase) || 0;
  };
  
  const activeStepIndex = getActiveStepIndex();

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {error ? 'Processing Failed' : 'Creating Database'}
        </Typography>

        <Collapse in={!!error}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              {error?.message || 'An error occurred during processing'}
            </Typography>
          </Alert>
        </Collapse>

        <Stepper activeStep={activeStepIndex} orientation="vertical">
          {steps.map((step, index) => {
            const status = getStepStatus(step.phase, progress?.phase, progress);
            
            return (
              <Step key={step.phase} completed={status === 'completed'}>
                <StepLabel
                  icon={getStepIcon(step.phase, progress?.phase, progress)}
                  error={status === 'error'}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2">
                      {step.label}
                    </Typography>
                    {status === 'active' && (
                      <Chip label="In Progress" size="small" color="primary" />
                    )}
                    {status === 'completed' && (
                      <Chip label="Done" size="small" color="primary" variant="outlined" />
                    )}
                    {status === 'skipped' && (
                      <Chip label="Skipped" size="small" color="default" variant="outlined" />
                    )}
                    {status === 'error' && (
                      <Chip label="Failed" size="small" color="error" />
                    )}
                  </Stack>
                </StepLabel>
                
                <StepContent>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {progress?.isDirectImport && step.phase === 'ai_analysis' 
                      ? 'Skipped for direct import - using simple structure'
                      : step.description
                    }
                  </Typography>

                  {/* Phase-specific progress details */}
                  {progress?.phase === step.phase && progress?.data && (
                    <Box sx={{ mb: 2 }}>
                      {step.phase === 'analyzing' && (
                        <Stack spacing={1}>
                          <Typography variant="body2">
                            Sheets: {progress.data.sheets || 0}
                          </Typography>
                          <Typography variant="body2">
                            Formulas: {progress.data.formulas || 0}
                          </Typography>
                          <Typography variant="body2">
                            File Size: {progress.data.fileSize || 'Unknown'}
                          </Typography>
                        </Stack>
                      )}

                      {step.phase === 'design_ready' && (
                        <Stack spacing={1}>
                          <Typography variant="body2">
                            Strategy: {progress.data.strategy?.replace('_', ' ') || 'Unknown'}
                          </Typography>
                          <Typography variant="body2">
                            {terminology.Collections}: {progress.data.collections || 0}
                          </Typography>
                        </Stack>
                      )}

                      {step.phase === 'inserting' && (
                        <Box>
                          <Typography variant="body2" sx={{ mb: 1, textAlign: 'center' }}>
                            Inserted: {progress.data.totalInserted?.toLocaleString() || 0} rows
                          </Typography>
                          
                          {/* Show streaming progress indicator */}
                          <LinearProgress 
                            variant="indeterminate" 
                            sx={{ mb: 1 }}
                          />
                          
                          {/* Show processing rate for streaming */}
                          {progress.data.processingRate && (
                            <Typography variant="body2" color="info.main" sx={{ mb: 1 }}>
                              Rate: {progress.data.processingRate} rows/sec
                            </Typography>
                          )}
                          
                          
                          {progress.data.errors > 0 && (
                            <Typography variant="body2" color="warning.main">
                              Errors: {progress.data.errors}
                            </Typography>
                          )}

                          {progress.data.currentSheet && (
                            <Typography variant="body2" color="text.secondary">
                              Processing: {progress.data.currentSheet}
                            </Typography>
                          )}
                          
                          {/* Show streaming mode indicator */}
                          {progress.data.streamingMode && (
                            <Chip 
                              label="Streaming Mode" 
                              size="small" 
                              color="info" 
                              variant="outlined"
                              sx={{ mt: 1 }}
                            />
                          )}
                        </Box>
                      )}

                      {step.phase === 'completed' && progress.data && (
                        <Stack spacing={1}>
                          <Typography variant="body2" color="primary.main">
                            ✅ {progress.data.totalInserted?.toLocaleString() || 0} {terminology.documents} inserted
                          </Typography>
                          <Typography variant="body2" color="primary.main">
                            ✅ {progress.data.collections?.length || 0} {terminology.collections} created
                          </Typography>
                          {progress.data.relationshipsCreated > 0 && (
                            <Typography variant="body2" color="primary.main">
                              ✅ {progress.data.relationshipsCreated} relationships established
                            </Typography>
                          )}
                        </Stack>
                      )}
                    </Box>
                  )}

                  {/* Current message */}
                  {progress?.phase === step.phase && progress?.message && (
                    <Typography variant="body2" color="primary" sx={{ fontStyle: 'italic' }}>
                      {progress.message}
                    </Typography>
                  )}
                </StepContent>
              </Step>
            );
          })}
        </Stepper>
      </CardContent>
    </Card>
  );
};

export default ProcessingProgress;
