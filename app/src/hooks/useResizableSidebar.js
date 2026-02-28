import { useState, useEffect, useCallback, useRef } from 'react';

const useResizableSidebar = (initialWidth = 256, minWidth = 200, maxWidth = 600) => {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(null);
  const startWidthRef = useRef(null);

  // Load saved width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem('sidebar-width');
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      if (width >= minWidth && width <= maxWidth) {
        setSidebarWidth(width);
      }
    }
  }, [minWidth, maxWidth]);

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebar-width', sidebarWidth.toString());
  }, [sidebarWidth]);

  const startResize = useCallback((e) => {
    if (!e || typeof e.clientX !== 'number') {
      console.warn('Invalid event in startResize:', e);
      return;
    }
    
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [sidebarWidth]);

  const handleResize = useCallback((e) => {
    if (!isResizing || startXRef.current === null || startWidthRef.current === null) return;
    
    if (!e || typeof e.clientX !== 'number') {
      console.warn('Invalid event in handleResize:', e);
      return;
    }

    const deltaX = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + deltaX;
    
    // Constrain width to min/max bounds
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    setSidebarWidth(constrainedWidth);
  }, [isResizing, minWidth, maxWidth]);

  const stopResize = useCallback(() => {
    setIsResizing(false);
    startXRef.current = null;
    startWidthRef.current = null;
    
    // Restore normal cursor and text selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // Add global event listeners for mouse events
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', stopResize);
      
      return () => {
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
      };
    }
  }, [isResizing, handleResize, stopResize]);

  // Double-click to reset to default width
  const resetWidth = useCallback(() => {
    setSidebarWidth(initialWidth);
  }, [initialWidth]);

  return {
    sidebarWidth,
    isResizing,
    startResize,
    resetWidth,
    setSidebarWidth
  };
};

export default useResizableSidebar;