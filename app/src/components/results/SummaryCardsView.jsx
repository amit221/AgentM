import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { formatChartNumber } from '../../utils/formatters';

/**
 * Get color scheme for metric cards - matching dashboard style
 */
function getMetricColor(field, index) {
  const fieldLower = field.toLowerCase();
  
  // Color palette matching the dashboard style: blue, red, orange, green
  const colorPalette = [
    { main: '#2196F3', light: '#64B5F6' }, // Blue
    { main: '#F44336', light: '#E57373' }, // Red
    { main: '#FF9800', light: '#FFB74D' }, // Orange
    { main: '#4CAF50', light: '#81C784' }, // Green
  ];
  
  if (fieldLower.includes('revenue') || fieldLower.includes('sales') || fieldLower.includes('value')) {
    return colorPalette[2]; // Orange
  }
  
  if (fieldLower.includes('expense') || fieldLower.includes('cost') || fieldLower.includes('loss')) {
    return colorPalette[1]; // Red
  }
  
  if (fieldLower.includes('count') || fieldLower.includes('total') || fieldLower.includes('employee')) {
    return colorPalette[3]; // Green
  }
  
  return colorPalette[index % colorPalette.length];
}

/**
 * Get trend indicator based on metric
 */
function getTrendIndicator(metric, color) {
  const fieldLower = (metric.label || metric.field || '').toLowerCase();
  
  // For expenses/costs, show downward trend (good)
  if (fieldLower.includes('expense') || fieldLower.includes('cost')) {
    return <TrendingDownIcon sx={{ fontSize: 18, color: color.main }} />;
  }
  
  // For most other metrics, show upward trend
  if (fieldLower.includes('account') || fieldLower.includes('employee') || 
      fieldLower.includes('revenue') || fieldLower.includes('sales')) {
    return <TrendingUpIcon sx={{ fontSize: 18, color: color.main }} />;
  }
  
  // For counts, show plus icon
  if (fieldLower.includes('count') || fieldLower.includes('total')) {
    return <AddIcon sx={{ fontSize: 18, color: color.main }} />;
  }
  
  return null;
}

const SummaryCardsView = ({ summaryData, hideHeader = false }) => {
  console.log('SummaryCardsView: Received summaryData:', summaryData);
  
  const { metrics, recordCount } = summaryData || {};
  
  console.log('SummaryCardsView: Extracted metrics:', metrics);
  console.log('SummaryCardsView: Extracted recordCount:', recordCount);
  
  if (!metrics || metrics.length === 0) {
    console.log('SummaryCardsView: No metrics available - showing fallback message');
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No summary metrics available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Debug: summaryData = {JSON.stringify(summaryData)}
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: hideHeader ? 1 : 2 }}>
      {/* Header */}
      {!hideHeader && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Summary Metrics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Key performance indicators from {recordCount || metrics.length} records
          </Typography>
        </Box>
      )}
      
      {/* Metrics Grid */}
      <Grid container spacing={3}>
        {metrics.map((metric, index) => {
          const color = getMetricColor(metric.label || metric.field, index);
          const value = metric.value || metric.total || 0;
          const trendIcon = getTrendIndicator(metric, color);
          const formattedValue = formatChartNumber(value, metric.format);
          
          // Extract label and format it
          const label = (metric.label || metric.field || 'Metric').toUpperCase();
          
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={metric.label || metric.field || index}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.3s ease-in-out',
                  boxShadow: 2,
                  position: 'relative',
                  overflow: 'visible',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6,
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1, p: 3, position: 'relative' }}>
                  {/* Title at top */}
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      mb: 2.5,
                      display: 'block'
                    }}
                  >
                    {label}
                  </Typography>
                  
                  {/* Main value with trend indicator */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.5 }}>
                      {trendIcon}
                      <Typography 
                        variant="h4" 
                        sx={{ 
                          fontWeight: 700,
                          color: 'text.primary',
                          fontSize: { xs: '1.75rem', sm: '2.25rem' },
                          lineHeight: 1.2,
                        }}
                      >
                        {formattedValue}
                      </Typography>
                      {metric.format === 'percentage' && (
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: 'text.secondary',
                            fontSize: '1rem',
                            fontWeight: 500
                          }}
                        >
                          %
                        </Typography>
                      )}
                    </Box>
                    {metric.format === 'currency' && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'text.secondary',
                          fontSize: '0.7rem'
                        }}
                      >
                        {metric.label?.toLowerCase().includes('employee') ? 'hires' : ''}
                      </Typography>
                    )}
                  </Box>
                </CardContent>
                
                {/* Colored bottom border */}
                <Box
                  sx={{
                    height: 4,
                    backgroundColor: color.main,
                    width: '100%',
                    borderBottomLeftRadius: 'inherit',
                    borderBottomRightRadius: 'inherit',
                  }}
                />
              </Card>
            </Grid>
          );
        })}
      </Grid>
      
    </Box>
  );
};

export default SummaryCardsView;
