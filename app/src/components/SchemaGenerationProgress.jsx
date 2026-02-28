import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import './SchemaGenerationProgress.css';

/**
 * SchemaGenerationProgress Component
 * 
 * Progress indicator for schema generation that clearly communicates
 * what's happening and why the user should wait
 */
export function SchemaGenerationProgress({ status }) {
  const [shouldShow, setShouldShow] = useState(true);
  const isVisible = status && status.isGenerating;
  const progress = status?.progress || 0;
  const isComplete = status?.isComplete || false;
  const isMetadataPhase = status?.message && status.message.includes('AI insights');
  const showCollectionCount = status?.collectionsTotal > 0 && !isMetadataPhase;
  const estimatedTimeRemaining = status?.estimatedTimeRemaining || 0;

  // Auto-hide after 3 seconds when complete
  useEffect(() => {
    if (isComplete && progress >= 100) {
      const timer = setTimeout(() => {
        setShouldShow(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShouldShow(true);
    }
  }, [isComplete, progress]);

  // Format estimated time in user-friendly format
  const formatEstimatedTime = (seconds) => {
    if (seconds <= 0) return '';
    
    // Less than a minute
    if (seconds < 60) {
      return 'Less than a minute remaining';
    }
    
    // Convert to minutes
    const mins = Math.ceil(seconds / 60);
    
    if (mins === 1) {
      return '1 minute remaining';
    }
    
    return `${mins} minutes remaining`;
  };

  // Create a clearer message that explains why to wait
  const getMessage = () => {
    const baseMessage = status?.message || 'Analyzing database schema...';
    if (isComplete) {
      return baseMessage; // Just "All done!"
    }
    return `${baseMessage} — Please wait before sending queries`;
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <div 
      className={`schema-progress-minimal ${isVisible ? 'visible' : 'hidden'}`}
      style={{
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        transition: 'opacity 0.3s ease'
      }}
    >
      <div className="progress-content">
        <div className="progress-spinner">
          {!isComplete && <div className="spinner"></div>}
          {isComplete && <div className="checkmark">✓</div>}
        </div>
        <div className="progress-text">
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'text.secondary',
              fontStyle: 'italic'
            }}
          >
            {getMessage()}
          </Typography>
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
              minWidth: '40px',
              textAlign: 'right'
            }}
          >
            {Math.round(progress)}%
          </Typography>
        </div>
      </div>
      <div className="progress-bar-minimal">
        <div 
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <Box className="progress-details">
        {showCollectionCount && (
          <Typography 
            variant="caption"
            sx={{ 
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
              fontStyle: 'italic'
            }}
          >
            {status.collectionsProcessed || 0} / {status.collectionsTotal} collections
          </Typography>
        )}
        {estimatedTimeRemaining > 0 && !isComplete && (
          <Typography 
            variant="caption"
            sx={{ 
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
              fontStyle: 'italic'
            }}
          >
            {formatEstimatedTime(estimatedTimeRemaining)}
          </Typography>
        )}
      </Box>
    </div>
  );
}

export default SchemaGenerationProgress;
