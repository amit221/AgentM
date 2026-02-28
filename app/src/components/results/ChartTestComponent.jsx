import React, { useState } from 'react';
import { Box, Button, Typography, Paper, ButtonGroup } from '@mui/material';
import QueryResultChartView from './QueryResultChartView';
import { testDataSets } from '../../utils/chartTestData';

/**
 * Test component for chart functionality
 * This can be temporarily added to test charts without running actual MongoDB queries
 */
const ChartTestComponent = () => {
  const [selectedDataset, setSelectedDataset] = useState('salesByProduct');
  
  const datasets = {
    salesByProduct: {
      name: 'Sales by Product (Multi-Series)',
      data: testDataSets.suitable.salesByProduct
    },
    monthlyRevenue: {
      name: 'Monthly Revenue (Time Series)',
      data: testDataSets.suitable.monthlyRevenue
    },
    ordersByRegion: {
      name: 'Orders by Region (Pie Chart)', 
      data: testDataSets.suitable.ordersByRegion
    },
    businessMetrics: {
      name: 'Business Metrics (Summary Cards)',
      data: testDataSets.suitable.businessMetrics
    },
    rawDocuments: {
      name: 'Raw Documents (Unsuitable)',
      data: testDataSets.unsuitable.rawDocuments
    }
  };
  
  const currentDataset = datasets[selectedDataset];
  
  // Mock processedData structure that QueryResultChartView expects
  const mockProcessedData = {
    documents: currentDataset.data,
    isEmpty: currentDataset.data.length === 0,
    keys: currentDataset.data.length > 0 ? Object.keys(currentDataset.data[0]) : []
  };
  
  const mockCurrentPageItems = currentDataset.data.map((doc, idx) => ({
    doc,
    originalIndex: idx
  }));
  
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Chart Test Component
      </Typography>
      
      <Typography variant="body2" color="text.secondary" paragraph>
        This component tests the chart functionality with sample data.
      </Typography>
      
      {/* Dataset Selector */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Select Test Dataset:
        </Typography>
        <ButtonGroup variant="outlined" size="small">
          {Object.entries(datasets).map(([key, dataset]) => (
            <Button
              key={key}
              onClick={() => setSelectedDataset(key)}
              variant={selectedDataset === key ? 'contained' : 'outlined'}
            >
              {dataset.name}
            </Button>
          ))}
        </ButtonGroup>
      </Paper>
      
      {/* Current Dataset Info */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Current Dataset: {currentDataset.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Records: {currentDataset.data.length}
        </Typography>
        <Box component="pre" sx={{ 
          mt: 1, 
          p: 1, 
          bgcolor: 'grey.100', 
          borderRadius: 1, 
          fontSize: '0.75rem',
          overflow: 'auto',
          maxHeight: 200
        }}>
          {JSON.stringify(currentDataset.data.slice(0, 3), null, 2)}
          {currentDataset.data.length > 3 && '\n... and more'}
        </Box>
      </Paper>
      
      {/* Chart Component */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Chart View:
        </Typography>
        <QueryResultChartView
          processedData={mockProcessedData}
          currentPageItems={mockCurrentPageItems}
        />
      </Paper>
    </Box>
  );
};

export default ChartTestComponent;
