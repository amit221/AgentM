import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, TextField, IconButton, Typography, Paper } from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown, Close, Search } from '@mui/icons-material';

const SimpleSearch = ({ children, isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const containerRef = useRef(null);
  const highlightRefs = useRef([]);
  const originalContent = useRef(null);

  // Clear all highlights - optimized
  const clearHighlights = useCallback(() => {
    if (!containerRef.current || highlightRefs.current.length === 0) return;
    
    // Use existing refs instead of querying DOM again
    const parents = new Set();
    highlightRefs.current.forEach(highlight => {
      const parent = highlight.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parents.add(parent);
      }
    });
    
    // Batch normalize calls for better performance
    parents.forEach(parent => parent.normalize());
    
    highlightRefs.current = [];
    setTotalMatches(0);
    setCurrentIndex(0);
  }, []);

  // Highlight text in DOM - optimized
  const highlightText = useCallback((searchText) => {
    if (!containerRef.current || !searchText.trim()) {
      clearHighlights();
      return;
    }

    clearHighlights();

    // Pre-compile regex for better performance
    const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const lowerSearchText = searchText.toLowerCase();

    const walker = document.createTreeWalker(
      containerRef.current,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script and style elements
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip search input
          if (parent && parent.closest('.MuiTextField-root')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Quick check before expensive regex
          return node.textContent.toLowerCase().includes(lowerSearchText) 
            ? NodeFilter.FILTER_ACCEPT 
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    const newHighlights = [];
    const fragment = document.createDocumentFragment();
    
    // Process nodes in batches to avoid blocking UI
    textNodes.forEach(textNode => {
      const text = textNode.textContent;
      
      if (regex.test(text)) {
        const parent = textNode.parentNode;
        const nodeFragment = document.createDocumentFragment();
        
        let lastIndex = 0;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
          // Add text before match
          if (match.index > lastIndex) {
            nodeFragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }
          
          // Add highlighted match
          const span = document.createElement('span');
          span.textContent = match[0];
          span.className = 'simple-search-highlight';
          // Use CSS custom properties for better performance
          span.style.cssText = 'background-color: #ffeb3b; color: black; padding: 1px 2px; border-radius: 2px;';
          nodeFragment.appendChild(span);
          newHighlights.push(span);
          
          lastIndex = regex.lastIndex;
        }
        
        // Add remaining text
        if (lastIndex < text.length) {
          nodeFragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        
        parent.replaceChild(nodeFragment, textNode);
      }
    });

    highlightRefs.current = newHighlights;
    setTotalMatches(newHighlights.length);
    setCurrentIndex(0);
    
    // Highlight first match as active
    if (newHighlights.length > 0) {
      updateActiveHighlight(0, newHighlights);
    }
  }, [clearHighlights]);

  // Update active highlight
  const updateActiveHighlight = useCallback((index, highlights = highlightRefs.current) => {
    highlights.forEach((element, i) => {
      if (i === index) {
        element.style.backgroundColor = '#ff6b35';
        element.style.color = 'white';
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        element.style.backgroundColor = '#ffeb3b';
        element.style.color = 'black';
      }
    });
  }, []);

  // Search when term changes - only if search is open
  useEffect(() => {
    if (!isOpen) return;
    
    const timeoutId = setTimeout(() => {
      highlightText(searchTerm);
    }, 100); // Reduced debounce time

    return () => clearTimeout(timeoutId);
  }, [searchTerm, highlightText, isOpen]);

  // Update active highlight when index changes
  useEffect(() => {
    if (highlightRefs.current.length > 0) {
      updateActiveHighlight(currentIndex);
    }
  }, [currentIndex, updateActiveHighlight]);

  // Clean up on unmount or close
  useEffect(() => {
    return () => {
      clearHighlights();
    };
  }, [clearHighlights]);

  const goUp = () => {
    if (totalMatches > 0) {
      setCurrentIndex(prev => prev === 0 ? totalMatches - 1 : prev - 1);
    }
  };

  const goDown = () => {
    if (totalMatches > 0) {
      setCurrentIndex(prev => (prev + 1) % totalMatches);
    }
  };

  const handleClose = () => {
    // Clear highlights immediately without waiting
    if (highlightRefs.current.length > 0) {
      highlightRefs.current.forEach(highlight => {
        const parent = highlight.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        }
      });
      // Batch normalize calls
      const parents = new Set();
      highlightRefs.current.forEach(highlight => {
        if (highlight.parentNode) parents.add(highlight.parentNode);
      });
      parents.forEach(parent => parent.normalize());
    }
    
    // Reset state quickly
    highlightRefs.current = [];
    setTotalMatches(0);
    setCurrentIndex(0);
    setSearchTerm('');
    onClose?.();
  };

  if (!isOpen) {
    return <div ref={containerRef}>{children}</div>;
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Search Bar - Positioned at top but doesn't affect layout */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          height: 0, // Key: zero height so it doesn't affect layout
          overflow: 'visible'
        }}
      >
        <Paper
          elevation={4}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1,
            minWidth: 250,
            backgroundColor: 'background.paper'
          }}
        >
          <Search fontSize="small" sx={{ color: 'text.secondary' }} />
          <TextField
            size="small"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            sx={{ 
              flex: 1,
              '& .MuiInputBase-input': {
                fontSize: '0.875rem' // 14px - smaller font size
              }
            }}
          />
          
          {totalMatches > 0 && (
            <Typography variant="caption" sx={{ minWidth: 50, textAlign: 'center' }}>
              {currentIndex + 1}/{totalMatches}
            </Typography>
          )}
          
          <IconButton size="small" onClick={goUp} disabled={totalMatches === 0}>
            <KeyboardArrowUp />
          </IconButton>
          
          <IconButton size="small" onClick={goDown} disabled={totalMatches === 0}>
            <KeyboardArrowDown />
          </IconButton>
          
          <IconButton size="small" onClick={handleClose}>
            <Close />
          </IconButton>
        </Paper>
      </Box>
      
      {/* Content - DOM manipulation handles highlighting */}
      <div ref={containerRef}>
        {children}
      </div>
    </Box>
  );
};

export default SimpleSearch;
