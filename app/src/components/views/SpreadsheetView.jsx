import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Alert,
  Stack,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Container
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Psychology as AIIcon,
  Speed as PerformanceIcon,
  AccountTree as RelationshipIcon,
  Storage as DatabaseIcon,
  CheckCircle as CheckIcon,
  AutoAwesome as SparkleIcon
} from '@mui/icons-material';

import { useDatabase } from '../../context/DatabaseContext';
import SpreadsheetWizard from '../spreadsheet/SpreadsheetWizard';

const SpreadsheetView = () => {
  const { activeConnections } = useDatabase();
  const [wizardOpen, setWizardOpen] = useState(false);

  const hasActiveConnection = activeConnections && activeConnections.length > 0;
  const canProceed = true; // Always allow starting the wizard, connection selection happens inside

  const features = [
    {
      icon: <AIIcon color="primary" />,
      title: 'AI-Powered Analysis',
      description: 'AI analyzes your data patterns to design the optimal database structure for your needs.'
    },
    {
      icon: <RelationshipIcon color="primary" />,
      title: 'Smart Relationships',
      description: 'Automatically detects relationships between sheets and creates the appropriate data structure.'
    },
    {
      icon: <PerformanceIcon color="primary" />,
      title: 'Performance Optimized',
      description: 'Creates indexes based on your query patterns to ensure maximum read performance and efficiency.'
    },
    {
      icon: <DatabaseIcon color="primary" />,
      title: 'Multi-Database Support',
      description: 'Works with MongoDB and PostgreSQL - creates proper structure optimized for your database type.'
    }
  ];

  const supportedFormats = [
    { format: '.xlsx', description: 'Excel Workbook (recommended)' },
    { format: '.xls', description: 'Excel 97-2003 Workbook' },
    { format: '.csv', description: 'Comma Separated Values' }
  ];

  return (
    <Container 
      maxWidth="lg" 
      sx={{ 
        py: 2,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header with Gradient Background */}
      <Box 
        sx={{ 
          mb: 3, 
          textAlign: 'center',
          background: (theme) => 
            `linear-gradient(135deg, ${theme.palette.primary.main}15 0%, ${theme.palette.primary.light}10 50%, ${theme.palette.secondary.main}08 100%)`,
          borderRadius: 3,
          p: 3,
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: (theme) => 
              `radial-gradient(circle at 30% 20%, ${theme.palette.primary.main}08 0%, transparent 50%), 
               radial-gradient(circle at 70% 80%, ${theme.palette.secondary.main}06 0%, transparent 50%)`,
            zIndex: 0,
          }
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: 1 }}>
            <SparkleIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography 
              variant="h4" 
              sx={{ 
                fontWeight: 700,
                background: (theme) => 
                  `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textAlign: 'center'
              }}
            >
              Spreadsheet to Database
            </Typography>
            <SparkleIcon sx={{ color: 'primary.main', fontSize: 24 }} />
          </Stack>
          
          <Typography 
            variant="body1" 
            color="text.secondary" 
            paragraph
            sx={{ 
              maxWidth: 600, 
              mx: 'auto',
              lineHeight: 1.5,
              mb: 2,
              fontSize: '0.95rem'
            }}
          >
            Transform your spreadsheets into optimized databases with AI-powered analysis and intelligent schema design
          </Typography>
          
          <Button
            variant="contained"
            size="medium"
            startIcon={<UploadIcon />}
            onClick={() => setWizardOpen(true)}
            disabled={!canProceed}
            sx={{ 
              mt: 1,
              px: 3,
              py: 1,
              fontSize: '1rem',
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: (theme) => `0 8px 25px ${theme.palette.primary.main}25`,
              '&:hover': {
                boxShadow: (theme) => `0 12px 35px ${theme.palette.primary.main}35`,
              },
              '&:disabled': {
                boxShadow: 'none',
              }
            }}
          >
            Start Import
          </Button>
        </Box>
      </Box>

      {/* Prerequisites */}
      {!hasActiveConnection && (
        <Alert severity="info" sx={{ mb: 2, flexShrink: 0 }}>
          <Typography variant="body2">
            You can start the import process and connect to your database in the first step of the wizard.
          </Typography>
        </Alert>
      )}


      {/* How it Works */}
      <Card 
        sx={{ 
          mb: 0,
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          background: (theme) => 
            `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.primary.main}03 100%)`,
          border: (theme) => `1px solid ${theme.palette.primary.main}20`,
        }}
      >
          <CardHeader 
            title="How It Works" 
            sx={{ 
              pb: 1,
              '& .MuiCardHeader-title': {
                fontSize: '1.5rem',
                fontWeight: 600,
                color: 'primary.main'
              }
            }}
          />
          <CardContent sx={{ pt: 2, pb: 2, flex: 1, overflow: 'auto' }}>
          <Stack spacing={3}>
            {/* Process Steps */}
            <Box>
              <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}>
                Simple 3-Step Process
              </Typography>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box 
                    sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontWeight: 600,
                      fontSize: '1rem',
                      flexShrink: 0,
                      mt: 0.5
                    }}
                  >
                    1
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mb: 0.5 }}>
                      Upload Your Spreadsheet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, fontSize: '0.875rem' }}>
                      Upload Excel or CSV files. The AI will analyze your data structure and relationships between sheets.
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box 
                    sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontWeight: 600,
                      fontSize: '1rem',
                      flexShrink: 0,
                      mt: 0.5
                    }}
                  >
                    2
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mb: 0.5 }}>
                      AI Designs Database
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, fontSize: '0.875rem' }}>
                      Our AI creates an optimal MongoDB schema based on your data patterns and field types.
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box 
                    sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: '50%', 
                      bgcolor: 'primary.main', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontWeight: 600,
                      fontSize: '1rem',
                      flexShrink: 0,
                      mt: 0.5
                    }}
                  >
                    3
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mb: 0.5 }}>
                      Review & Create
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, fontSize: '0.875rem' }}>
                      Review the AI's recommendations and create your optimized MongoDB database with proper indexes and document structure.
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Box>

            {/* Technical Details */}
            <Box>
              <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}>
                Supported Formats & Limits
              </Typography>
              <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: 'stretch' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 600, mb: 1 }}>
                    File Formats
                  </Typography>
                  <Box sx={{ 
                    bgcolor: (theme) => `${theme.palette.primary.main}08`, 
                    borderRadius: 2, 
                    p: 2, 
                    border: (theme) => `1px solid ${theme.palette.primary.main}20`,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <Stack spacing={1.5} sx={{ flex: 1 }}>
                      {supportedFormats.map((format, index) => (
                        <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <CheckIcon color="primary" fontSize="small" />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                              {format.format}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {format.description}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ color: 'info.main', fontWeight: 600, mb: 1 }}>
                    File Limits
                  </Typography>
                  <Box sx={{ 
                    bgcolor: (theme) => `${theme.palette.info.main}08`, 
                    borderRadius: 2, 
                    p: 2, 
                    border: (theme) => `1px solid ${theme.palette.info.main}20`,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <Stack spacing={1.5} sx={{ flex: 1, justifyContent: 'flex-start' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CheckIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          Maximum file size: 500MB
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CheckIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          Handles any number of rows efficiently
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CheckIcon color="primary" fontSize="small" />
                        <Typography variant="body2" color="text.secondary">
                          Supports multiple sheets in Excel files
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                </Box>
              </Stack>
            </Box>
          </Stack>
          </CardContent>
        </Card>


      {/* Wizard Dialog */}
      <SpreadsheetWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
    </Container>
  );
};

export default SpreadsheetView;
