import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
  Grow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  Edit as EditIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  ViewList as TreeIcon,
  TableChart as TableIcon,
  Code as RawIcon,
  BarChart as ChartIcon,
  FileDownload as ExportIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  Close as CloseIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useClipboard } from '../../context/ClipboardContext';
import { useQuery } from '../../context/QueryContext';
import { useDatabase } from '../../context/DatabaseContext';
import Tooltip from '../ui/Tooltip';
import useLayoutController from '../../hooks/useLayoutController';
import { normalizeResults } from '../../utils/results';
import DocumentContextMenu from './DocumentContextMenu';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import QueryResultTreeView from './QueryResultTreeView';
import QueryResultTableView from './QueryResultTableView';
import QueryResultRawView from './QueryResultRawView';
import QueryResultChartView from './QueryResultChartView';
import QueryResultPaginationControls from './QueryResultPaginationControls';
import QueryResultExportControls from './QueryResultExportControls';
import SimpleSearch from '../common/SimpleSearch';
import { useSimpleSearch } from '../../hooks/useSimpleSearch';
import AddToDashboardButton from './AddToDashboardButton';
import JsonViewer from './JsonViewer';
import JsonEditor from './JsonEditor';
import {
  isExtendedJsonObjectId,
  isExtendedJsonDate,
  stringifyWithMongoTypes,
  wrapForEditing,
  unwrapFromEditing
} from '../../utils/extendedJsonHelpers';

// Helper function to ensure pagination value is valid
const getValidPaginationValue = (rowsPerPage, settingsLimit) => {
  const availableOptions = [10, 20, 50, 100];
  const currentValue = rowsPerPage || settingsLimit || 20;
  return availableOptions.includes(currentValue) ? currentValue : 20;
};

const QueryResultDisplay = React.memo(({ result, messageLevel, animate = false, onRunQuery, onEditQuery, onComplete, conversationId }) => {

  const theme = useTheme();
  const { isMobile } = useLayoutController(false, Boolean(result));
  const { addNotification } = useClipboard();
  const { addToFavorites, removeFromFavorites, favorites, settings, conversations } = useQuery();
  const { selectedDatabase, activeConnections } = useDatabase();
  const { isSearchOpen, openSearch, closeSearch } = useSimpleSearch();
  
  // Get the connection ID for this conversation
  // Use conversation's bound connectionId if available, otherwise fall back to first active connection
  const currentConversation = conversations?.find(conv => conv.id === conversationId);
  const connectionId = currentConversation?.connectionId || activeConnections?.[0];

  /**
   * Determines if tree view should be used based on data complexity
   * Returns true if data has > 30 keys or contains arrays/nested objects
   */
  function shouldUseTreeView(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return false;
    }

    // Get all unique keys from all documents
    const allKeys = new Set();
    let hasComplexData = false;

    for (const doc of data) {
      if (!doc || typeof doc !== 'object') continue;

      Object.keys(doc).forEach(key => allKeys.add(key));

      // Check for arrays or nested objects
      for (const value of Object.values(doc)) {
        if (Array.isArray(value) || (value && typeof value === 'object' && value !== null)) {
          hasComplexData = true;
          break;
        }
      }

      if (hasComplexData) break;
    }

    return allKeys.size > 30 || hasComplexData;
  }

  const [viewMode, setViewMode] = useState('table');

  // Auto-switch to raw view for script results
  const isScriptResult = result?.operation === 'script' || 
                         result?.type === 'script' ||
                         // Fallback: detect scripts by checking if result has 'results.output' instead of documents
                         (result?.results?.output && !result?.documents && !result?.result);
  
  // Auto-switch to raw view for error results
  const isErrorResult = result?.success === false || Boolean(result?.error);
  const [displayResult, setDisplayResult] = useState(result);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [expandedCards, setExpandedCards] = useState(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [settingsLimit, setSettingsLimit] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingJson, setEditingJson] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [hasMoreResults, setHasMoreResults] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuDocumentIndex, setContextMenuDocumentIndex] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [viewDocumentDialogOpen, setViewDocumentDialogOpen] = useState(false);
  const [selectedViewDocument, setSelectedViewDocument] = useState(null);
  const [documentDetailOpen, setDocumentDetailOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [selectedDocumentIndex, setSelectedDocumentIndex] = useState(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicatingJson, setDuplicatingJson] = useState('');
  const [isSavingDuplicate, setIsSavingDuplicate] = useState(false);
  const [editJsonValidation, setEditJsonValidation] = useState({ isValid: true, warnings: [] });
  const [duplicateJsonValidation, setDuplicateJsonValidation] = useState({ isValid: true, warnings: [] });
  const [originalEditingJson, setOriginalEditingJson] = useState('');
  const [originalDuplicatingJson, setOriginalDuplicatingJson] = useState('');


  const resultRef = useRef(null);

  // Get border color based on message level (similar to ChatMessage) - memoized
  const getBorderColor = useMemo(() => {
    switch (messageLevel) {
      case 'error': return theme.palette.error.main;
      case 'warning': return theme.palette.warning.main;
      case 'success': return theme.palette.success.main;
      default: return theme.palette.info.main;
    }
  }, [messageLevel, theme.palette]);

  // Calculate valid pagination value once
  const validPaginationValue = useMemo(() => 
    getValidPaginationValue(rowsPerPage, settingsLimit), 
    [rowsPerPage, settingsLimit]
  );

  const previousResultRef = useRef(null);
  
  /**
   * Determines if we should scroll to a new query result
   */
  function shouldScrollToNewResult(currentResult, previousResult) {
    return Boolean(currentResult) && currentResult !== previousResult;
  }
  
  useEffect(() => {
    if (shouldScrollToNewResult(result, previousResultRef.current) && resultRef.current) {
      // Use requestAnimationFrame to avoid forced reflow during render
      requestAnimationFrame(() => {
        // Add another frame delay to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        });
      });
    }
    
    previousResultRef.current = result;
  }, [result]);

  // Keep view as selected by user; do not auto-switch to raw
  useEffect(() => {
    setDisplayResult(result);
    setPage(0);
    // Reset hasMoreResults when we get a new result
    setHasMoreResults(true);

    // Auto-select view mode based on data complexity
    if (result && !isScriptResult && !isErrorResult) {
      const documents = result.documents || result.results || result.result;
      if (documents) {
        const defaultView = shouldUseTreeView(Array.isArray(documents) ? documents : [documents]) ? 'tree' : 'table';
        setViewMode(defaultView);
      }
    }
  }, [result, isScriptResult, isErrorResult]);

  // Force raw view for script results and error results and prevent changing
  useEffect(() => {
    if (isScriptResult || isErrorResult) {
      setViewMode('raw');
    }
  }, [isScriptResult, isErrorResult]);

  // Load settings to pick default limit when query doesn't include one
  useEffect(() => {
    (async () => {
      try {
        const res = await window.electronAPI?.storage?.loadSettings?.();
        if (res?.success && res?.settings?.queryLimit) {
          setSettingsLimit(Number(res.settings.queryLimit));
        }
      } catch {}
    })();
  }, []);

  // Helper function to extract skip/limit from query regardless of type
  function parseQuerySkipLimit(query) {
    if (isAggregateQuery(query)) {
      return parseExistingSkipLimitStages(query);
    } else if (isFindQuery(query)) {
      return parseExistingSkipLimit(query);
    }
    return { skip: 0, limit: null };
  }

  // Helper function to determine if there are more results available
  function checkHasMoreResults(currentResults, expectedPageSize, query) {
    if (!currentResults || !Array.isArray(currentResults)) return false;
    
    // For aggregate queries, check if there's an existing $limit stage
    if (isAggregateQuery(query)) {
      const { limit: queryLimit } = parseExistingSkipLimitStages(query);
      if (queryLimit) {
        // If the query has its own limit and we got fewer results than that limit,
        // then we've definitely reached the end
        if (currentResults.length < queryLimit) {
          return false;
        }
        // If we got exactly the query limit, we need to check if there could be more
        // by using the query limit as the expected page size
        return currentResults.length >= queryLimit;
      }
    }
    
    // For find queries or aggregate queries without $limit, use the expected page size
    return currentResults.length >= expectedPageSize;
  }

  // Seed rowsPerPage and page from the original query (skip/limit) or settings
  useEffect(() => {
    const q = result?.query || '';
    const { skip, limit } = parseQuerySkipLimit(q);
    if (limit && limit > 0) {
      if (rowsPerPage !== limit) setRowsPerPage(limit);
      const derivedPage = Math.max(0, Math.floor((skip || 0) / limit));
      if (page !== derivedPage) setPage(derivedPage);
      return;
    }
    if (settingsLimit && rowsPerPage !== settingsLimit) {
      setRowsPerPage(settingsLimit);
      if (page !== 0) setPage(0);
    }
  }, [result?.query, settingsLimit]);

  // Check if there are more results available when displayResult changes
  useEffect(() => {
    if (displayResult?.documents && Array.isArray(displayResult.documents)) {
      const expectedPageSize = rowsPerPage || settingsLimit || 20;
      setHasMoreResults(checkHasMoreResults(displayResult.documents, expectedPageSize, displayResult.query));
    }
  }, [displayResult, rowsPerPage, settingsLimit]);

  const isCurrentlyFavorited = favorites.some(
    (fav) => fav.generatedQuery === result.query && fav.database === (result?.database || selectedDatabase)
  );

  const processedResults = useMemo(() => {
    if (!displayResult) return null;
        
    // Handle new unified shell manager format
    const isScript = displayResult.type === 'script' || 
                     displayResult.operation === 'script' ||
                     // Fallback: detect scripts by checking if result has 'results.output' instead of documents
                     (displayResult.results?.output && !displayResult.documents && !displayResult.result);
    
    if (isScript) {
      // Script results - extract output from various possible locations
      const scriptOutput = displayResult.results?.output || displayResult.result?.output || displayResult.output || '';
      const processed = {
        documents: [{ output: scriptOutput }],
        count: scriptOutput ? 1 : 0,
        executionTime: displayResult.executionTime || 0,
        operation: 'script',
        type: 'script',
        success: displayResult.success,
        error: displayResult.error
      };
      

      return processed;
    }
    
    // Query results - handle both new unified format and legacy formats
    let docs = [];
    
    if (Array.isArray(displayResult.documents)) {
      docs = displayResult.documents;
    } else if (Array.isArray(displayResult.results)) {
      docs = displayResult.results;
    } else if (Array.isArray(displayResult.result)) {
      docs = displayResult.result;
    } else if (displayResult.result && typeof displayResult.result === 'object') {
      // Handle single result object
      docs = [displayResult.result];
    }
                    
    const processed = {
      documents: docs,
      count: displayResult.count || docs.length,
      executionTime: displayResult.executionTime || displayResult.actualExecutionTime || 0,
      operation: displayResult.operation || 'query',
      type: displayResult.type || 'query',
      success: displayResult.success,
      error: displayResult.error
    };

    return processed;
  }, [displayResult]);

  // Use deferred value to prevent blocking during heavy processing
  const deferredProcessedResults = useDeferredValue(processedResults);
  const isProcessingDeferred = deferredProcessedResults !== processedResults;
  
  const processedData = useMemo(() => {
    if (!deferredProcessedResults?.documents || !Array.isArray(deferredProcessedResults.documents)) {
      return { documents: [], keys: [], isEmpty: true, formattedData: new Map() };
    }
    
    const allKeys = new Set();
    const formattedData = new Map();
    const wrappedDocuments = [];
    
    deferredProcessedResults.documents.forEach((doc, docIndex) => {
      // Handle primitive values (numbers, strings, etc.) by wrapping them
      if (doc !== null && doc !== undefined && typeof doc !== 'object') {
        const wrappedDoc = { value: doc };
        wrappedDocuments.push(wrappedDoc);
        allKeys.add('value');
        const formattedDoc = { value: String(doc) };
        formattedData.set(docIndex, formattedDoc);
      } else if (doc && typeof doc === 'object') {
        wrappedDocuments.push(doc);
        Object.keys(doc).forEach((key) => allKeys.add(key));
        const formattedDoc = {};
        Object.entries(doc).forEach(([key, value]) => {
          if (value != null && typeof value === 'object') {
            // Handle Extended JSON ObjectId
            if (isExtendedJsonObjectId(value)) {
              formattedDoc[key] = `ObjectId("${value.$oid}")`;
            }
            // Handle Extended JSON Date
            else if (isExtendedJsonDate(value)) {
              formattedDoc[key] = `ISODate("${value.$date}")`;
            }
            // Handle other objects
            else {
              formattedDoc[key] = JSON.stringify(value, null, 2);
            }
          } else {
            formattedDoc[key] = value != null ? String(value) : '';
          }
        });
        formattedData.set(docIndex, formattedDoc);
      }
    });
    
    return {
      documents: wrappedDocuments,
      keys: Array.from(allKeys),
      isEmpty: wrappedDocuments.length === 0,
      formattedData,
    };
  }, [deferredProcessedResults]);

  // Sorting removed: display documents in their original order
  // Pagination helpers - memoized for performance
  const currentPageItems = useMemo(() => {
    return processedData.documents.map((doc, idx) => ({ doc, originalIndex: idx }));
  }, [processedData.documents]);

  // Helper functions for query type detection
  function isAggregateQuery(query) {
    return /db\.[A-Za-z0-9_.$-]+\.aggregate\(/.test(query || '');
  }

  function isFindQuery(query) {
    return /db\.[A-Za-z0-9_.$-]+\.find\(/.test(query || '');
  }

  const isPaginatableQuery = useMemo(() => {
    const q = result?.query || '';
    return isAggregateQuery(q) || isFindQuery(q);
  }, [result?.query]);



  // Helper functions for find queries
  const removeExistingSkipLimit = (q) => q
    .replace(/\.skip\([^\)]*\)/g, '')
    .replace(/\.limit\([^\)]*\)/g, '');

  function parseExistingSkipLimit(q) {
    const skipMatch = q.match(/\.skip\((\d+)\)/);
    const limitMatch = q.match(/\.limit\((\d+)\)/);
    const skip = skipMatch ? parseInt(skipMatch[1], 10) : 0;
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;
    return { skip, limit };
  }

  // Helper functions for aggregate queries - enhanced for better pipeline parsing
  function hasSkipStage(pipeline) {
    // Match $skip with quotes or without, case insensitive
    return /\{\s*['"]*\$skip['"]*\s*:\s*\d+\s*\}/i.test(pipeline);
  }

  function hasLimitStage(pipeline) {
    // Match $limit with quotes or without, case insensitive
    return /\{\s*['"]*\$limit['"]*\s*:\s*\d+\s*\}/i.test(pipeline);
  }

  function removeExistingSkipLimitStages(pipeline) {
    // Remove skip and limit stages, handling various formats
    return pipeline
      .replace(/,?\s*\{\s*['"]*\$skip['"]*\s*:\s*\d+\s*\}/gi, '')
      .replace(/,?\s*\{\s*['"]*\$limit['"]*\s*:\s*\d+\s*\}/gi, '')
      .replace(/,\s*,/g, ',') // Clean up double commas
      .replace(/^,\s*|,\s*$/g, ''); // Clean up leading/trailing commas
  }

  function parseExistingSkipLimitStages(pipeline) {
    // Parse skip and limit stages, handling various formats
    const skipMatch = pipeline.match(/\{\s*['"]*\$skip['"]*\s*:\s*(\d+)\s*\}/i);
    const limitMatch = pipeline.match(/\{\s*['"]*\$limit['"]*\s*:\s*(\d+)\s*\}/i);
    const skip = skipMatch ? parseInt(skipMatch[1], 10) : 0;
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;
    return { skip, limit };
  }

  function applyPaginationToAggregateQuery(query, pageIndex, pageSize) {
    if (!query || typeof query !== 'string') return query;
    
    const withoutSemi = query.trim().replace(/;\s*$/, '');
    
    // Enhanced regex to extract the aggregation pipeline - handles various formatting
    const aggregateMatch = withoutSemi.match(/(db\.[A-Za-z0-9_.$-]+\.aggregate\s*\(\s*)\[\s*(.*?)\s*\](\s*\))/s);
    if (!aggregateMatch) {
      // Try alternative pattern without array brackets (less common but possible)
      const altMatch = withoutSemi.match(/(db\.[A-Za-z0-9_.$-]+\.aggregate\s*\(\s*)(.*?)(\s*\))/s);
      if (!altMatch) return query;
      
      const [, prefix, pipeline, suffix] = altMatch;
      const baseInfo = parseExistingSkipLimitStages(pipeline);
      const effectiveSize = pageSize || baseInfo.limit || settingsLimit || rowsPerPage || 20;
      const cleanedPipeline = removeExistingSkipLimitStages(pipeline);
      const skipVal = Math.max(0, pageIndex) * Math.max(1, effectiveSize);
      
      // Add skip and limit stages
      const newStages = [];
      if (skipVal > 0) {
        newStages.push(`{ $skip: ${skipVal} }`);
      }
      newStages.push(`{ $limit: ${Math.max(1, effectiveSize)} }`);
      
      const updatedPipeline = cleanedPipeline.trim()
        ? `[${cleanedPipeline}, ${newStages.join(', ')}]`
        : `[${newStages.join(', ')}]`;
      
      return `${prefix}${updatedPipeline}${suffix}`;
    }
    
    const [, prefix, pipeline, suffix] = aggregateMatch;
    const baseInfo = parseExistingSkipLimitStages(pipeline);
    const effectiveSize = pageSize || baseInfo.limit || settingsLimit || rowsPerPage || 20;
    const cleanedPipeline = removeExistingSkipLimitStages(pipeline);
    const skipVal = Math.max(0, pageIndex) * Math.max(1, effectiveSize);
    
    // Add skip and limit stages to the pipeline
    const newStages = [];
    if (skipVal > 0) {
      newStages.push(`{ $skip: ${skipVal} }`);
    }
    newStages.push(`{ $limit: ${Math.max(1, effectiveSize)} }`);
    
    const updatedPipeline = cleanedPipeline.trim()
      ? `${cleanedPipeline}, ${newStages.join(', ')}`
      : newStages.join(', ');
    
    return `${prefix}[${updatedPipeline}]${suffix}`;
  }

  function applyPaginationToFindQuery(query, pageIndex, pageSize) {
    if (!query || typeof query !== 'string') return query;
    
    const withoutSemi = query.trim().replace(/;\s*$/, '');
    const baseInfo = parseExistingSkipLimit(withoutSemi);
    const effectiveSize = pageSize || baseInfo.limit || settingsLimit || rowsPerPage || 20;
    const cleaned = removeExistingSkipLimit(withoutSemi);
    const skipVal = Math.max(0, pageIndex) * Math.max(1, effectiveSize);
    return `${cleaned}.skip(${skipVal}).limit(${Math.max(1, effectiveSize)})`;
  }

  const applyPaginationToQuery = useCallback((q, pageIndex, pageSize) => {
    if (!q || typeof q !== 'string') return q;
    
    if (isAggregateQuery(q)) {
      return applyPaginationToAggregateQuery(q, pageIndex, pageSize);
    } else if (isFindQuery(q)) {
      return applyPaginationToFindQuery(q, pageIndex, pageSize);
    }
    
    return q;
  }, [settingsLimit, rowsPerPage]);

  const refreshPage = useCallback(async () => {
    if (!isPaginatableQuery) return;
    const paged = applyPaginationToQuery(result?.query, page, rowsPerPage);
    try {
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) return;
      const raw = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, paged, null, settings?.queryTimeout || 60);
      if (raw?.success) {
        const normalized = normalizeResults(raw);
        setDisplayResult({ query: paged, ...normalized, operation: raw.operation });
        // Update hasMoreResults based on the new data
        const expectedPageSize = rowsPerPage || settingsLimit || 20;
        setHasMoreResults(checkHasMoreResults(normalized.documents, expectedPageSize, paged));
      }
    } catch {}
  }, [isPaginatableQuery, result?.query, page, rowsPerPage, applyPaginationToQuery, connectionId, result?.database, selectedDatabase, settingsLimit]);

  const goFirstPage = useCallback(async () => {
    if (!isPaginatableQuery) return;
    setPage(0);
    const paged = applyPaginationToQuery(result?.query, 0, rowsPerPage);
    try {
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) return;
      const raw = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, paged, null, settings?.queryTimeout || 60);
      if (raw?.success) {
        const normalized = normalizeResults(raw);
        setDisplayResult({ query: paged, ...normalized, operation: raw.operation });
        // Update hasMoreResults based on the new data
        const expectedPageSize = rowsPerPage || settingsLimit || 20;
        setHasMoreResults(checkHasMoreResults(normalized.documents, expectedPageSize, paged));
      }
    } catch {}
  }, [isPaginatableQuery, result?.query, rowsPerPage, applyPaginationToQuery, connectionId, selectedDatabase, settingsLimit]);

  const goPrevPage = useCallback(async () => {
    if (!isPaginatableQuery) return;
    const nextPage = Math.max(0, page - 1);
    setPage(nextPage);
    const paged = applyPaginationToQuery(result?.query, nextPage, rowsPerPage);
    try {
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) return;
      const raw = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, paged, null, settings?.queryTimeout || 60);
      if (raw?.success) {
        const normalized = normalizeResults(raw);
        setDisplayResult({ query: paged, ...normalized, operation: raw.operation });
        // Update hasMoreResults based on the new data
        const expectedPageSize = rowsPerPage || settingsLimit || 20;
        setHasMoreResults(checkHasMoreResults(normalized.documents, expectedPageSize, paged));
      }
    } catch {}
  }, [isPaginatableQuery, result?.query, page, rowsPerPage, applyPaginationToQuery, connectionId, result?.database, selectedDatabase, settingsLimit]);

  const goNextPage = useCallback(async () => {
    if (!isPaginatableQuery) return;
    const nextPage = page + 1;
    setPage(nextPage);
    const paged = applyPaginationToQuery(result?.query, nextPage, rowsPerPage);
    try {
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) return;
      const raw = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, paged, null, settings?.queryTimeout || 60);
      if (raw?.success) {
        const normalized = normalizeResults(raw);
        setDisplayResult({ query: paged, ...normalized, operation: raw.operation });
        // Update hasMoreResults based on the new data
        const expectedPageSize = rowsPerPage || settingsLimit || 20;
        setHasMoreResults(checkHasMoreResults(normalized.documents, expectedPageSize, paged));
      }
    } catch {}
  }, [isPaginatableQuery, result?.query, page, rowsPerPage, applyPaginationToQuery, connectionId, result?.database, selectedDatabase, settingsLimit]);

  const handleRowsPerPageChange = useCallback(async (e) => {
    const value = Number(e.target.value) || settingsLimit || 20;
    setRowsPerPage(value);
    setPage(0);
    if (isPaginatableQuery) {
      const paged = applyPaginationToQuery(result?.query, 0, value);
      try {
        const dbName = result?.database || selectedDatabase;
        if (!connectionId || !dbName) return;
        const raw = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, paged, null, settings?.queryTimeout || 60);
        if (raw?.success) {
          const normalized = normalizeResults(raw);
          setDisplayResult({ query: paged, ...normalized, operation: raw.operation });
          // Update hasMoreResults based on the new data
          setHasMoreResults(checkHasMoreResults(normalized.documents, value, paged));
        }
      } catch {}
    }
  }, [isPaginatableQuery, result?.query, applyPaginationToQuery, connectionId, result?.database, selectedDatabase, settingsLimit]);

  // Editing helpers
  function extractCollectionName(queryText) {
    if (!queryText || typeof queryText !== 'string') return null;
    const dotMatch = queryText.match(/db\.([A-Za-z0-9_.$-]+)\./);
    if (dotMatch && dotMatch[1]) return dotMatch[1];
    const getCollMatch = queryText.match(/db\.getCollection\(['"]([^'"]+)['"]\)\./);
    if (getCollMatch && getCollMatch[1]) return getCollMatch[1];
    return null;
  }

  function buildIdExpression(idValue) {
    if (idValue == null) return null;
    if (typeof idValue === 'string') {
      const trimmed = idValue.trim();
      if (/^ObjectId\(["'][0-9a-fA-F]{24}["']\)$/.test(trimmed)) return trimmed;
      if (/^[0-9a-fA-F]{24}$/.test(trimmed)) return `ObjectId("${trimmed}")`;
      return JSON.stringify(trimmed);
    }
    if (typeof idValue === 'object') {
      if (idValue.$oid && /^[0-9a-fA-F]{24}$/.test(idValue.$oid)) {
        return `ObjectId("${idValue.$oid}")`;
      }
    }
    return JSON.stringify(idValue);
  }

  // Extended JSON helper functions now imported from utils/extendedJsonHelpers.js

  function convertDatesToMongoFormat(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => convertDatesToMongoFormat(item));
    }

    if (typeof obj === 'object') {
      // Check for MongoDB date format already present
      if (obj.$date) {
        return obj;
      }

      const converted = {};
      for (const [key, value] of Object.entries(obj)) {
        if (isISODateString(value)) {
          // Keep as ISO date string for MongoDB shell
          converted[key] = value;
        } else if (typeof value === 'object' && value !== null) {
          converted[key] = convertDatesToMongoFormat(value);
        } else {
          converted[key] = value;
        }
      }
      return converted;
    }

    return obj;
  }

  // Use shared utility functions for Extended JSON handling
  function stringifyWithDates(obj) {
    return stringifyWithMongoTypes(obj);
  }

  function wrapDatesForEditing(obj) {
    return wrapForEditing(obj);
  }

  function unwrapDatesFromEditing(jsonStr) {
    return unwrapFromEditing(jsonStr);
  }

  function openEditDialog(originalIndex) {
    const originalDoc = processedData.documents[originalIndex];
    const jsonStr = wrapDatesForEditing(originalDoc);
    setEditingIndex(originalIndex);
    setEditingJson(jsonStr);
    setOriginalEditingJson(jsonStr);
    setEditJsonValidation({ isValid: true, warnings: [] });
    setEditOpen(true);
  }

  const saveEditedDocument = useCallback(async () => {
    if (editingIndex == null) return;
    let parsed;
    try {
      // Unwrap ISODate() back to plain strings before parsing
      const unwrappedJson = unwrapDatesFromEditing(editingJson);
      parsed = JSON.parse(unwrappedJson);
    } catch (err) {
      addNotification(err.message || 'Invalid JSON. Please fix and try again.', 'error');
      return;
    }

    const originalDoc = processedData.documents[editingIndex];
    const idExpr = buildIdExpression(originalDoc?._id);
    if (!idExpr) {
      addNotification('Cannot locate _id for the selected document.', 'error');
      return;
    }

    const collection = extractCollectionName(result?.query);
    if (!collection) {
      addNotification('Cannot determine collection from the query. Please update manually.', 'warning');
      return;
    }

    const { _id, ...rest } = parsed || {};
    const updateDoc = rest;
    const updateJson = stringifyWithDates(updateDoc);
    const updateQuery = `db.${collection}.replaceOne({ _id: ${idExpr} }, ${updateJson})`;

    try {
      setIsSavingEdit(true);
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) {
        addNotification('No active connection or database selected.', 'warning');
        return;
      }
      const res = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, updateQuery);
      if (res?.success) {
        addNotification('Document updated successfully.', 'success');
        setEditOpen(false);
        // Refresh the current page to show updated results
        refreshPage();
      } else {
        addNotification(`Update failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      addNotification(`Update failed: ${err.message}`, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingIndex, editingJson, processedData.documents, result?.query, addNotification, connectionId, result?.database, selectedDatabase, conversationId, refreshPage]);

  const deleteDocument = useCallback(async (documentIndex) => {
    const originalDoc = processedData.documents[documentIndex];
    const idExpr = buildIdExpression(originalDoc?._id);
    if (!idExpr) {
      addNotification('Cannot locate _id for the selected document.', 'error');
      return;
    }

    const collection = extractCollectionName(result?.query);
    if (!collection) {
      addNotification('Cannot determine collection from the query.', 'warning');
      return;
    }

    const deleteQuery = `db.${collection}.deleteOne({ _id: ${idExpr} })`;

    try {
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) {
        addNotification('No active connection or database selected.', 'warning');
        return;
      }
      const res = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, deleteQuery);
      if (res?.success) {
        addNotification('Document deleted successfully.', 'success');
        // Refresh the current page to show updated results
        refreshPage();
      } else {
        addNotification(`Delete failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      addNotification(`Delete failed: ${err.message}`, 'error');
    }
  }, [processedData.documents, result?.query, addNotification, connectionId, result?.database, selectedDatabase, refreshPage]);

  const handleContextMenu = useCallback((event, documentIndex) => {
    event.preventDefault();
    setContextMenuDocumentIndex(documentIndex);
    setContextMenu(
      contextMenu === null
        ? {
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
          }
        : null,
    );
  }, [contextMenu]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
    setContextMenuDocumentIndex(null);
  }, []);

  const handleContextMenuEdit = useCallback(() => {
    if (contextMenuDocumentIndex !== null) {
      openEditDialog(contextMenuDocumentIndex);
    }
    handleContextMenuClose();
  }, [contextMenuDocumentIndex, openEditDialog, handleContextMenuClose]);

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenuDocumentIndex !== null) {
      setDocumentToDelete(contextMenuDocumentIndex);
      setDeleteConfirmOpen(true);
    }
    handleContextMenuClose();
  }, [contextMenuDocumentIndex, handleContextMenuClose]);

  const handleDeleteConfirm = useCallback(() => {
    if (documentToDelete !== null) {
      deleteDocument(documentToDelete);
    }
    setDeleteConfirmOpen(false);
    setDocumentToDelete(null);
  }, [documentToDelete, deleteDocument]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmOpen(false);
    setDocumentToDelete(null);
    // Return to detail dialog if we came from there
    if (selectedDocument !== null) {
      setDocumentDetailOpen(true);
    }
  }, [selectedDocument]);

  function documentHasId(doc) {
    return doc && typeof doc === 'object' && '_id' in doc && doc._id != null;
  }

  const handleDocumentClick = useCallback((doc, originalIndex) => {
    setSelectedDocument(doc);
    setSelectedDocumentIndex(originalIndex);
    setDocumentDetailOpen(true);
  }, []);

  const handleDocumentDetailClose = useCallback(() => {
    setDocumentDetailOpen(false);
    setSelectedDocument(null);
    setSelectedDocumentIndex(null);
  }, []);

  const handleDocumentEdit = useCallback(() => {
    if (selectedDocumentIndex !== null) {
      openEditDialog(selectedDocumentIndex);
      setDocumentDetailOpen(false); // Hide detail dialog, don't clear state
    }
  }, [selectedDocumentIndex]);

  const handleDocumentDelete = useCallback(() => {
    if (selectedDocumentIndex !== null) {
      setDocumentToDelete(selectedDocumentIndex);
      setDeleteConfirmOpen(true);
      setDocumentDetailOpen(false); // Hide detail dialog, don't clear state
    }
  }, [selectedDocumentIndex]);

  const handleDocumentDuplicate = useCallback(() => {
    if (selectedDocument) {
      const { _id, ...rest } = selectedDocument;
      const jsonStr = wrapDatesForEditing(rest);
      setDuplicatingJson(jsonStr);
      setOriginalDuplicatingJson(jsonStr);
      setDuplicateJsonValidation({ isValid: true, warnings: [] });
      setDuplicateOpen(true);
      setDocumentDetailOpen(false); // Hide detail dialog, don't clear state
    }
  }, [selectedDocument]);

  const handleBackToDetail = useCallback(() => {
    setEditOpen(false);
    setDuplicateOpen(false);
    setDeleteConfirmOpen(false);
    setDocumentDetailOpen(true);
  }, []);

  const saveDuplicatedDocument = useCallback(async () => {
    let parsed;
    try {
      // Unwrap ISODate() back to plain strings before parsing
      const unwrappedJson = unwrapDatesFromEditing(duplicatingJson);
      parsed = JSON.parse(unwrappedJson);
    } catch (err) {
      addNotification(err.message || 'Invalid JSON. Please fix and try again.', 'error');
      return;
    }

    const collection = extractCollectionName(result?.query);
    if (!collection) {
      addNotification('Cannot determine collection from the query.', 'warning');
      return;
    }

    const insertJson = stringifyWithDates(parsed);
    const insertQuery = `db.${collection}.insertOne(${insertJson})`;

    try {
      setIsSavingDuplicate(true);
      const dbName = result?.database || selectedDatabase;
      if (!connectionId || !dbName) {
        addNotification('No active connection or database selected.', 'warning');
        return;
      }
      const res = await window.electronAPI.database.executeRawQuery(conversationId, connectionId, dbName, insertQuery);
      if (res?.success) {
        addNotification('Document duplicated successfully.', 'success');
        setDuplicateOpen(false);
        refreshPage();
      } else {
        addNotification(`Duplicate failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      addNotification(`Duplicate failed: ${err.message}`, 'error');
    } finally {
      setIsSavingDuplicate(false);
    }
  }, [duplicatingJson, result?.query, addNotification, connectionId, result?.database, selectedDatabase, conversationId, refreshPage]);

  useEffect(() => {
    setPage(0);
  }, [result]);

  const toggleCardExpansion = useCallback((index) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  }, []);

  const handleAddToFavorites = () => {
    if (isCurrentlyFavorited) {
      const existingFavorite = favorites.find(
        (fav) => fav.generatedQuery === result.query && fav.database === (result?.database || selectedDatabase)
      );
      if (existingFavorite) removeFromFavorites(existingFavorite.id);
    } else {
      const queryId = `query_${Date.now()}`;
      const queryToSave = {
        id: queryId,
        prompt: `Query executed at ${new Date().toLocaleString()}`,
        generatedQuery: result.query,
        database: selectedDatabase,
        timestamp: new Date().toISOString(),
        results: result.results,
      };
      addToFavorites(queryToSave);
    }
  };



  const renderTreeView = () => {
    return (
      <QueryResultTreeView
        processedData={processedData}
        currentPageItems={currentPageItems}
        page={page}
        handleContextMenu={handleContextMenu}
        onDocumentClick={handleDocumentClick}
      />
    );
  };

  const renderTableView = () => {
    return (
      <QueryResultTableView
        processedData={processedData}
        currentPageItems={currentPageItems}
        page={page}
        handleContextMenu={handleContextMenu}
        isMobile={isMobile}
        isFullscreen={isFullscreen}
        onDocumentClick={handleDocumentClick}
      />
    );
  };

  const renderRawView = () => {
    return (
      <QueryResultRawView
        isScriptResult={isScriptResult}
        isErrorResult={isErrorResult}
        processedResults={processedResults}
        result={result}
      />
    );
  };

  // Memoize queryContext to prevent unnecessary rerenders
  const chartQueryContext = useMemo(() => {
    // Try to extract collection name from the query if not in result
    let collectionName = result?.collection;
    if (!collectionName && result?.query) {
      const queryStr = result.query;
      const match = queryStr.match(/db\.(\w+)\./);
      if (match) {
        collectionName = match[1];
      }
    }
    
    const docLength = processedData?.documents?.length || 0;
    const firstDocKeys = processedData?.documents?.[0] ? Object.keys(processedData.documents[0]).join(',') : '';
    
    return {
      database: result?.database || selectedDatabase,
      collection: collectionName,
      operation: processedResults?.operation,
      executionTime: result?.executionTime,
      recordCount: result?.count || docLength,
      hasMoreData: result?.count > docLength,
      queryType: result?.query?.includes('aggregate') ? 'aggregation' : 
                result?.query?.includes('find') ? 'find' : 'unknown',
      sampleFields: firstDocKeys ? firstDocKeys.split(',') : []
    };
  }, [
    result?.database,
    result?.collection,
    result?.query,
    result?.executionTime,
    result?.count,
    selectedDatabase,
    processedResults?.operation,
    processedData?.documents?.length,
    processedData?.documents?.[0] && Object.keys(processedData.documents[0]).join(',')
  ]);

  const renderChartView = () => {
    return (
      <QueryResultChartView
        processedData={processedData}
        currentPageItems={currentPageItems}
        query={result?.query}
        queryContext={chartQueryContext}
      />
    );
  };

  // Helper to check if data is a single primitive value
  const isSinglePrimitiveValue = useMemo(() => {
    if (!processedData?.documents || processedData.documents.length !== 1) {
      return false;
    }
    
    const doc = processedData.documents[0];
    
    // Check if it's a wrapped primitive (e.g., { value: 42 })
    if (doc && typeof doc === 'object' && Object.keys(doc).length === 1 && 'value' in doc) {
      return true;
    }
    
    // Check if it's a direct primitive
    return typeof doc !== 'object' || doc === null;
  }, [processedData]);

  // Auto-switch from table view to tree view for single primitive values
  useEffect(() => {
    if (isSinglePrimitiveValue && viewMode === 'table') {
      setViewMode('tree');
    }
  }, [isSinglePrimitiveValue, viewMode]);

  const renderContent = () => {
    // Scripts and errors always show raw view
    if (isScriptResult || isErrorResult) {
      return renderRawView();
    }

    switch (viewMode) {
      case 'table':
        return renderTableView();
      case 'chart':
        return renderChartView();
      case 'raw':
        return renderRawView();
      default:
        return renderTreeView();
    }
  };

  return (
    <Grow in timeout={animate ? 500 : 0} onEntered={() => onComplete?.()}>
      <Box
        ref={resultRef}
        sx={{
          px: 3,
          mb: 3,
          ...(isFullscreen && {
            position: 'fixed',
            inset: 0,
            zIndex: 1400,
            bgcolor: 'background.default',
            p: { xs: 1, sm: 2 },
            m: 0,
          }),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.6rem', opacity: 0.6, ml: 'auto' }}>
            [executed: {processedResults?.executionTime ? `${((processedResults.executionTime / 1000)).toFixed(2)}s` : 'N/A'}]
          </Typography>
        </Box>

        <Card sx={{ height: isFullscreen ? 'calc(100vh - 80px)' : 'auto', maxHeight: isFullscreen ? 'none' : 'calc(100vh - 350px)', display: 'flex', flexDirection: 'column', bgcolor: 'transparent', boxShadow: 'none', border: 'none' }}>
          <Box sx={{ 
            p: 1.5, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1, 
            justifyContent: 'space-between',
            position: 'relative'
          }}>
            {/* Top Pagination Controls (DB-driven) */}
            <QueryResultPaginationControls
              isPaginatableQuery={isPaginatableQuery}
              page={page}
              processedData={processedData}
              refreshPage={refreshPage}
              goPrevPage={goPrevPage}
              goNextPage={goNextPage}
              validPaginationValue={validPaginationValue}
              handleRowsPerPageChange={handleRowsPerPageChange}
              currentPageItems={currentPageItems}
              hasMoreResults={hasMoreResults}
              processedResults={processedResults}
            />
            <Box sx={{ 
              display: 'flex', 
              flexDirection: { xs: 'column', sm: 'row' }, 
              alignItems: { xs: 'stretch', sm: 'center' }, 
              justifyContent: 'space-between', 
              gap: 1 
            }}>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', sm: 'row' }, 
                alignItems: { xs: 'flex-start', sm: 'center' }, 
                gap: { xs: 0.5, sm: 0.75 } 
              }}>
                {/* Removed "Query Results" text and document count chip */}
                {/* Execution time displayed when no pagination */}
                {(!isPaginatableQuery || viewMode === 'raw' || page === 0 && processedData.isEmpty) && (
                  <Chip
                    label={`${((processedResults?.executionTime || 0) / 1000).toFixed(2)}s`}
                    size="small"
                    color="default"
                    variant="outlined"
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.75rem',
                      height: '28px',
                      '& .MuiChip-label': { px: 1.5 }
                    }}
                  />
                )}
              </Box>


              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.75, 
                flexWrap: 'wrap', 
                justifyContent: { xs: 'space-between', sm: 'flex-end' } 
              }}>
                <Tooltip content="Search in results">
                  <Button 
                    variant="outlined" 
                    size="small" 
                    onClick={openSearch} 
                    sx={{ 
                      minWidth: 'auto', 
                      px: 2,
                      py: 0.75,
                      borderRadius: 1,
                      borderColor: 'divider',
                      color: 'text.secondary',
                      '&:hover': { 
                        borderColor: 'text.primary', 
                        color: 'text.primary',
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <SearchIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip content={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
                  <Button 
                    variant="outlined" 
                    size="small" 
                    onClick={() => setIsFullscreen(v => !v)} 
                    sx={{ 
                      minWidth: 'auto', 
                      px: 2,
                      py: 0.75,
                      borderRadius: 1,
                      borderColor: 'divider',
                      color: 'text.secondary',
                      '&:hover': { 
                        borderColor: 'text.primary', 
                        color: 'text.primary',
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                  </Button>
                </Tooltip>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleAddToFavorites}
                  sx={{
                    color: isCurrentlyFavorited ? '#ffc107' : 'text.secondary',
                    borderColor: isCurrentlyFavorited ? '#ffc107' : 'divider',
                    minWidth: 'auto',
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    '&:hover': { 
                      borderColor: '#ffc107', 
                      color: '#ffc107',
                      bgcolor: 'action.hover'
                    },
                  }}
                >
                  {isCurrentlyFavorited ? <StarIcon /> : <StarBorderIcon />}
                </Button>

                <QueryResultExportControls
                  processedData={processedData}
                  isScriptResult={isScriptResult}
                  isErrorResult={isErrorResult}
                  addNotification={addNotification}
                  isExportMenuOpen={isExportMenuOpen}
                  setIsExportMenuOpen={setIsExportMenuOpen}
                  isExporting={isExporting}
                  setIsExporting={setIsExporting}
                />


                {/* Only show view mode buttons for non-script and non-error results */}
                {!isScriptResult && !isErrorResult && (
                  <ButtonGroup
                    size="small"
                    variant="outlined"
                    sx={{
                      borderRadius: 1,
                      '& .MuiButton-root': {
                        borderRadius: 0,
                        '&:first-of-type': { borderRadius: '4px 0 0 4px' },
                        '&:last-of-type': { borderRadius: '0 4px 4px 0' },
                        px: 1.25,
                        py: 0.5,
                        borderColor: 'divider',
                        color: 'text.secondary',
                        '&:hover': {
                          borderColor: 'text.primary',
                          color: 'text.primary',
                          bgcolor: 'action.hover'
                        },
                        '&.Mui-selected': {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          borderColor: 'primary.main',
                          '&:hover': {
                            bgcolor: 'primary.dark'
                          }
                        }
                      }
                    }}
                  >
                    {[
                      { id: 'tree', icon: <TreeIcon />, label: 'Tree' },
                      { id: 'table', icon: <TableIcon />, label: 'Table' },
                      { id: 'raw', icon: <RawIcon />, label: 'Raw' },
                      { id: 'chart', icon: <ChartIcon />, label: 'Chart', hasAI: true },
                    ].filter((mode) => {
                      // Hide table view for single primitive values
                      if (mode.id === 'table' && isSinglePrimitiveValue) {
                        return false;
                      }
                      return true;
                    }).map((mode) => (
                      <Tooltip key={mode.id} content={`${mode.label} View${mode.hasAI ? ' (AI-powered)' : ''}`}>
                        <Button
                          onClick={() => setViewMode(mode.id)}
                          variant={viewMode === mode.id ? 'contained' : 'outlined'}
                          sx={{
                            minWidth: '40px',
                            position: 'relative',
                            ...(viewMode === mode.id && {
                              bgcolor: 'primary.main',
                              color: 'primary.contrastText',
                              borderColor: 'primary.main',
                              '&:hover': {
                                bgcolor: 'primary.dark'
                              }
                            })
                          }}
                        >
                          <Box sx={{ 
                            fontWeight: mode.hasAI ? 'bold' : 'normal',
                            '& svg': {
                              fontWeight: mode.hasAI ? 'bold' : 'normal',
                              strokeWidth: mode.hasAI ? 2 : 1
                            }
                          }}>
                            {mode.icon}
                          </Box>
                        </Button>
                      </Tooltip>
                    ))}
                  </ButtonGroup>
                )}
                
                {/* Add to Dashboard button for table view */}
                {viewMode === 'table' && !isScriptResult && !isErrorResult && result?.query && (
                  <AddToDashboardButton
                    query={result.query}
                    queryResult={processedResults}
                    queryContext={chartQueryContext}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, overflow: viewMode === 'table' ? 'visible' : 'auto', p: 2, minHeight: 0, mt: 2 }}>
            <SimpleSearch isOpen={isSearchOpen} onClose={closeSearch}>
              {isProcessingDeferred ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
                  <CircularProgress size={24} />
                  <Typography variant="body2" sx={{ ml: 2, color: 'text.secondary' }}>
                    Processing results...
                  </Typography>
                </Box>
              ) : (
                renderContent()
              )}
            </SimpleSearch>
          </Box>
        </Card>
        <Dialog 
          open={editOpen} 
          onClose={() => setEditOpen(false)} 
          fullWidth 
          maxWidth="md"
          PaperProps={{
            sx: {
              bgcolor: 'background.paper',
              color: 'text.primary',
              '& .MuiDialogTitle-root': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderBottom: `1px solid ${theme.palette.divider}`
              },
              '& .MuiDialogContent-root': {
                bgcolor: 'background.paper',
                color: 'text.primary'
              },
              '& .MuiDialogActions-root': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderTop: `1px solid ${theme.palette.divider}`
              }
            }
          }}
        >
          <DialogTitle>Edit Document</DialogTitle>
          <DialogContent>
            <JsonEditor
              value={editingJson}
              originalValue={originalEditingJson}
              onChange={(e) => setEditingJson(e.target.value)}
              onValidationChange={(validation) => setEditJsonValidation(validation)}
              disabled={isSavingEdit}
              sx={{ mt: 2 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Note: This will replace the entire document. Removing fields will delete them from the database.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={handleBackToDetail} 
              disabled={isSavingEdit}
              startIcon={<ArrowBackIcon />}
            >
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button 
              onClick={saveEditedDocument} 
              disabled={isSavingEdit || !editJsonValidation.isValid || editJsonValidation.warnings.length > 0} 
              variant="contained"
            >
              {isSavingEdit ? 'Saving...' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Context Menu */}
        <DocumentContextMenu
          contextMenu={contextMenu}
          onClose={handleContextMenuClose}
          onEdit={handleContextMenuEdit}
          onDelete={handleContextMenuDelete}
        />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          open={deleteConfirmOpen}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
        />

        {/* Document Detail Dialog */}
        <Dialog 
          open={documentDetailOpen} 
          onClose={handleDocumentDetailClose} 
          fullWidth 
          maxWidth="md"
          PaperProps={{
            sx: {
              bgcolor: 'background.paper',
              color: 'text.primary',
              '& .MuiDialogTitle-root': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderBottom: `1px solid ${theme.palette.divider}`
              },
              '& .MuiDialogContent-root': {
                bgcolor: 'background.paper',
                color: 'text.primary'
              },
              '& .MuiDialogActions-root': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderTop: `1px solid ${theme.palette.divider}`
              }
            }
          }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Document Details
            <IconButton 
              onClick={handleDocumentDetailClose} 
              size="small"
              sx={{ color: 'text.secondary' }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <JsonViewer data={selectedDocument} sx={{ mt: 2 }} />
          </DialogContent>
          {documentHasId(selectedDocument) && (
            <DialogActions sx={{ justifyContent: 'flex-end', px: 3, py: 2, gap: 1 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  onClick={handleDocumentEdit} 
                  variant="outlined" 
                  startIcon={<EditIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  Edit
                </Button>
                <Button 
                  onClick={handleDocumentDuplicate} 
                  variant="outlined" 
                  startIcon={<DuplicateIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  Duplicate
                </Button>
              </Box>
              <Button 
                onClick={handleDocumentDelete} 
                variant="outlined" 
                color="error"
                startIcon={<DeleteIcon />}
                sx={{ textTransform: 'none' }}
              >
                Delete
              </Button>
            </DialogActions>
          )}
        </Dialog>

        {/* Duplicate Dialog */}
        <Dialog 
          open={duplicateOpen} 
          onClose={() => setDuplicateOpen(false)} 
          fullWidth 
          maxWidth="md"
          PaperProps={{
            sx: {
              bgcolor: 'background.paper',
              color: 'text.primary',
              '& .MuiDialogTitle-root': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderBottom: `1px solid ${theme.palette.divider}`
              },
              '& .MuiDialogContent-root': {
                bgcolor: 'background.paper',
                color: 'text.primary'
              },
              '& .MuiDialogActions-root': {
                bgcolor: 'background.paper',
                color: 'text.primary',
                borderTop: `1px solid ${theme.palette.divider}`
              }
            }
          }}
        >
          <DialogTitle>Duplicate Document</DialogTitle>
          <DialogContent>
            <JsonEditor
              value={duplicatingJson}
              originalValue={originalDuplicatingJson}
              onChange={(e) => setDuplicatingJson(e.target.value)}
              onValidationChange={(validation) => setDuplicateJsonValidation(validation)}
              disabled={isSavingDuplicate}
              sx={{ mt: 2 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Modify the document as needed. A new document will be created with a new _id.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={handleBackToDetail} 
              disabled={isSavingDuplicate}
              startIcon={<ArrowBackIcon />}
            >
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button 
              onClick={saveDuplicatedDocument} 
              disabled={isSavingDuplicate || !duplicateJsonValidation.isValid || duplicateJsonValidation.warnings.length > 0} 
              variant="contained"
            >
              {isSavingDuplicate ? 'Creating...' : 'Create Duplicate'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Grow>
  );
});

export default QueryResultDisplay;


