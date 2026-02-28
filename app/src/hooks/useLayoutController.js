import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme, useMediaQuery } from '@mui/material';

/**
 * Layout controller hook for managing centered/output/results states
 * Handles smooth transitions between layout states and responsive behavior
 */
const useLayoutController = (hasOutput, hasResults) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.between('md', 'lg'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Layout states: 'centered' | 'output' | 'results'
  const [layoutState, setLayoutState] = useState('centered');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Ref for recalculate timeout cleanup
  const recalculateTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (recalculateTimeoutRef.current) {
        clearTimeout(recalculateTimeoutRef.current);
      }
    };
  }, []);
  
  // Determine layout state based on hasOutput and hasResults flags
  useEffect(() => {
    let newState = 'centered';
    
    if (hasResults) {
      newState = 'results';
    } else if (hasOutput) {
      newState = 'output';
    }
    
    if (newState !== layoutState) {
      setIsTransitioning(true);
      setLayoutState(newState);
      
      // Reset transition flag after animation completes
      const transitionTimeout = setTimeout(() => {
        setIsTransitioning(false);
      }, 300); // Match CSS transition duration
      
      return () => clearTimeout(transitionTimeout);
    }
  }, [hasOutput, hasResults, layoutState]);
  
  // Get layout configuration for current state
  const getLayoutConfig = useCallback(() => {
    const baseConfig = {
      isMobile,
      isTablet,
      isSmallMobile,
      isTransitioning,
      layoutState
    };
    
    switch (layoutState) {
      case 'centered':
        return {
          ...baseConfig,
          inputPosition: 'center',
          showOutput: false,
          showResults: false,
          inputWidth: isMobile ? '100%' : '100%',
          inputMaxWidth: isSmallMobile ? '100%' : '800px',
          inputMargin: 'auto',
          inputPadding: isSmallMobile ? theme.spacing(1.5) : theme.spacing(3)
        };
        
      case 'output':
        return {
          ...baseConfig,
          inputPosition: isMobile ? 'bottom' : 'left',
          showOutput: true,
          showResults: false,
          inputWidth: isMobile ? '100%' : isTablet ? '40%' : '35%',
          outputWidth: isMobile ? '100%' : isTablet ? '60%' : '65%',
          inputHeight: isMobile ? (isSmallMobile ? '35%' : '40%') : '100%',
          outputHeight: isMobile ? (isSmallMobile ? '65%' : '60%') : '100%',
          inputMinHeight: isSmallMobile ? '280px' : '300px',
          outputMinHeight: isSmallMobile ? '400px' : '450px'
        };
        
      case 'results':
        return {
          ...baseConfig,
          inputPosition: isMobile ? 'bottom' : 'left',
          showOutput: false,
          showResults: true,
          inputWidth: isMobile ? '100%' : isTablet ? '40%' : '35%',
          resultsWidth: isMobile ? '100%' : isTablet ? '60%' : '65%',
          inputHeight: isMobile ? (isSmallMobile ? '30%' : '35%') : '100%',
          resultsHeight: isMobile ? (isSmallMobile ? '70%' : '65%') : '100%',
          inputMinHeight: isSmallMobile ? '250px' : '280px',
          resultsMinHeight: isSmallMobile ? '450px' : '500px'
        };
        
      default:
        return baseConfig;
    }
  }, [layoutState, isMobile, isTablet, isSmallMobile, isTransitioning, theme]);
  
  // Get CSS styles for smooth transitions with mobile-specific timing
  const getTransitionStyles = useCallback(() => {
    const transitionDuration = isMobile ? '0.25s' : '0.3s';
    const transitionEasing = isMobile 
      ? 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // Smoother for mobile
      : 'cubic-bezier(0.4, 0, 0.2, 1)';
    
    return {
      transition: `all ${transitionDuration} ${transitionEasing}`,
      willChange: isTransitioning ? 'transform, width, height, opacity' : 'auto',
      // Add mobile-specific transform optimizations
      ...(isMobile && {
        backfaceVisibility: 'hidden',
        perspective: 1000,
        transform: 'translateZ(0)', // Force hardware acceleration
      })
    };
  }, [isTransitioning, isMobile]);
  
  // Get container styles based on layout state
  const getContainerStyles = useCallback(() => {
    const config = getLayoutConfig();
    const transitionStyles = getTransitionStyles();
    
    if (config.layoutState === 'centered') {
      return {
        container: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: theme.palette.background.default,
          ...transitionStyles
        },
        content: {
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing(3),
          ...transitionStyles
        },
        input: {
          width: '100%',
          maxWidth: config.inputMaxWidth,
          ...transitionStyles
        }
      };
    }
    
    if (isMobile) {
      // Mobile stacked layout with enhanced responsive behavior
      return {
        container: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          ...transitionStyles
        },
        topSection: {
          flex: 1,
          backgroundColor: theme.palette.action.hover,
          overflow: 'hidden',
          minHeight: config.outputMinHeight || config.resultsMinHeight || 0,
          maxHeight: config.outputHeight || config.resultsHeight,
          borderBottom: `1px solid ${theme.palette.divider}`,
          position: 'relative',
          // Mobile-specific optimizations
          WebkitOverflowScrolling: 'touch',
          ...transitionStyles,
          // Add subtle shadow for depth on mobile
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        },
        bottomSection: {
          backgroundColor: theme.palette.background.default,
          height: config.inputHeight,
          minHeight: config.inputMinHeight || '280px',
          maxHeight: config.inputHeight,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          // Add subtle border for visual separation
          borderTop: `1px solid ${theme.palette.divider}`,
          ...transitionStyles,
          // Ensure input section stays accessible
          zIndex: 1,
        },
        input: {
          padding: isSmallMobile ? theme.spacing(1.5) : theme.spacing(2),
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          ...transitionStyles
        }
      };
    }
    
    // Desktop split layout
    return {
      container: {
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        ...transitionStyles
      },
      leftPanel: {
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.default,
        width: config.inputWidth,
        minWidth: '350px',
        maxWidth: '700px',
        ...transitionStyles
      },
      rightPanel: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.action.hover,
        borderLeft: `1px solid ${theme.palette.divider}`,
        minWidth: 0,
        overflow: 'hidden',
        ...transitionStyles
      },
      input: {
        flex: 1,
        overflow: 'auto',
        padding: theme.spacing(2),
        ...transitionStyles
      }
    };
  }, [getLayoutConfig, getTransitionStyles, theme, isMobile]);
  
  // Force layout recalculation (useful for testing or manual triggers)
  const recalculateLayout = useCallback(() => {
    setIsTransitioning(true);
    recalculateTimeoutRef.current = setTimeout(() => setIsTransitioning(false), isMobile ? 250 : 300);
  }, [isMobile]);

  // Mobile-specific layout utilities
  const getMobileLayoutStyles = useCallback(() => {
    if (!isMobile) return {};
    
    return {
      // Optimize for mobile performance
      WebkitBackfaceVisibility: 'hidden',
      WebkitPerspective: 1000,
      WebkitTransform: 'translateZ(0)',
      // Better touch scrolling
      WebkitOverflowScrolling: 'touch',
      // Prevent zoom on input focus
      fontSize: isSmallMobile ? '16px' : 'inherit',
    };
  }, [isMobile, isSmallMobile]);
  
  return {
    layoutState,
    isTransitioning,
    isMobile,
    isTablet,
    isSmallMobile,
    getLayoutConfig,
    getContainerStyles,
    getTransitionStyles,
    getMobileLayoutStyles,
    recalculateLayout
  };
};

export default useLayoutController;