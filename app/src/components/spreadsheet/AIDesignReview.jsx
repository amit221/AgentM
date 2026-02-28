import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Stack,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Psychology as AIIcon,
  Storage as DatabaseIcon,
  AccountTree as SchemaIcon,
  Speed as IndexIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import { getTerminology, getDatabaseDisplayName, isRelationalDatabase } from '../../utils/databaseTypeUtils';

const AIDesignReview = ({ design, fileInfo, onApprove, onReject, databaseType = 'mongodb' }) => {
  // Get terminology based on database type
  const terminology = getTerminology(databaseType);
  const dbDisplayName = getDatabaseDisplayName(databaseType);
  const isSQL = isRelationalDatabase(databaseType);
  const [expandedPanel, setExpandedPanel] = useState('strategy');

  const handlePanelChange = (panel) => (event, isExpanded) => {
    setExpandedPanel(isExpanded ? panel : false);
  };

  const getStrategyColor = (strategy) => {
    switch (strategy) {
      case 'single_collection': return 'primary';
      case 'multiple_collections': return 'secondary';
      case 'hybrid': return 'warning';
      default: return 'default';
    }
  };

  const getStrategyDescription = (strategy) => {
    if (isSQL) {
      switch (strategy) {
        case 'single_collection':
          return 'All data will be stored in one table for simplicity.';
        case 'multiple_collections':
          return 'Data will be split into separate tables with proper relationships and foreign keys.';
        case 'hybrid':
          return 'A mix of normalized and denormalized tables based on usage patterns.';
        default:
          return 'Custom strategy based on data analysis.';
      }
    }
    switch (strategy) {
      case 'single_collection':
        return 'All data will be stored in one collection with embedded documents for optimal read performance.';
      case 'multiple_collections':
        return 'Data will be split into separate collections with references between related documents.';
      case 'hybrid':
        return 'A mix of embedded and referenced data based on usage patterns and relationships.';
      default:
        return 'Custom strategy based on data analysis.';
    }
  };

  const renderDocumentStructure = (structure, level = 0) => {
    return Object.entries(structure).map(([key, value]) => (
      <TableRow key={key}>
        <TableCell sx={{ pl: 2 + level * 2 }}>
          {'  '.repeat(level)}
          <Typography 
            variant="body2" 
            component="span"
            sx={{ fontFamily: 'monospace', fontWeight: level === 0 ? 500 : 400 }}
          >
            {key}
          </Typography>
        </TableCell>
        <TableCell>
          <Chip 
            label={typeof value === 'object' && !Array.isArray(value) ? 'object' : String(value)} 
            size="small" 
            variant="outlined"
          />
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <Box>
      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardHeader
          avatar={<AIIcon color="primary" />}
          title="AI Database Design"
          subheader={`Review the recommended ${dbDisplayName} structure`}
          action={
            <Chip 
              icon={<CheckIcon />}
              label={design.strategy.replace('_', ' ').toUpperCase()}
              color={getStrategyColor(design.strategy)}
              variant="outlined"
            />
          }
        />
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              The AI has analyzed your spreadsheet and recommends the following database structure. 
              Review the design and click "Create Database" to proceed.
            </Typography>
          </Alert>
          
          <Typography variant="body1" paragraph>
            {design.reasoning}
          </Typography>
          
          <Typography variant="body2" color="text.secondary">
            {getStrategyDescription(design.strategy)}
          </Typography>
        </CardContent>
      </Card>

      {/* Collections/Tables Overview */}
      <Accordion 
        expanded={expandedPanel === 'collections'} 
        onChange={handlePanelChange('collections')}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <DatabaseIcon sx={{ mr: 2, color: 'text.secondary' }} />
          <Box>
            <Typography variant="h6">
              {terminology.Collections} ({design.collections.length})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {dbDisplayName} {terminology.collections} that will be created
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {design.collections.map((collection, index) => (
              <Card key={index} variant="outlined">
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                      {collection.name}
                    </Typography>
                    <Chip 
                      label={`${collection.sourceSheets.length} sheet(s)`}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Source sheets: {collection.sourceSheets.join(', ')}
                  </Typography>
                  
                  {collection.indexes && collection.indexes.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Indexes: {collection.indexes.length} optimized for read performance
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Document/Row Structure */}
      <Accordion 
        expanded={expandedPanel === 'structure'} 
        onChange={handlePanelChange('structure')}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SchemaIcon sx={{ mr: 2, color: 'text.secondary' }} />
          <Box>
            <Typography variant="h6">{isSQL ? 'Table Structure' : 'Document Structure'}</Typography>
            <Typography variant="body2" color="text.secondary">
              How your data will be organized in {dbDisplayName}
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={3}>
            {design.collections.map((collection, index) => (
              <Box key={index}>
                <Typography variant="subtitle1" sx={{ mb: 2, fontFamily: 'monospace' }}>
                  {collection.name}
                </Typography>
                
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{terminology.Field}</TableCell>
                        <TableCell>Type</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {renderDocumentStructure(collection.documentStructure)}
                    </TableBody>
                  </Table>
                </TableContainer>

                {collection.sampleDocument && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Sample {isSQL ? 'Row' : 'Document'}:
                    </Typography>
                    <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
                      <Typography 
                        variant="body2" 
                        component="pre"
                        sx={{ 
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {JSON.stringify(collection.sampleDocument, null, 2)}
                      </Typography>
                    </Paper>
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Indexes */}
      <Accordion 
        expanded={expandedPanel === 'indexes'} 
        onChange={handlePanelChange('indexes')}
        sx={{ mb: 2 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <IndexIcon sx={{ mr: 2, color: 'text.secondary' }} />
          <Box>
            <Typography variant="h6">Performance Indexes</Typography>
            <Typography variant="body2" color="text.secondary">
              Indexes optimized for your query patterns
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {design.collections.map((collection, collectionIndex) => (
              <Box key={collectionIndex}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontFamily: 'monospace' }}>
                  {collection.name}
                </Typography>
                
                {collection.indexes && collection.indexes.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Index Fields</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Purpose</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {collection.indexes.map((index, indexIndex) => (
                          <TableRow key={indexIndex}>
                            <TableCell sx={{ fontFamily: 'monospace' }}>
                              {JSON.stringify(index.fields)}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={Object.values(index.fields).includes(-1) ? 'Descending' : 'Ascending'}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                Optimizes queries on these fields
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info">
                    No custom indexes recommended for this collection.
                  </Alert>
                )}
              </Box>
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>

    </Box>
  );
};

export default AIDesignReview;
