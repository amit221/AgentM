import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Tabs, Tab, TextField, IconButton, CircularProgress, Select, MenuItem, FormControl, Typography, Chip } from '@mui/material';
import { PlayArrow as RunIcon, Stop as StopIcon, Schedule as TimeoutIcon, DataObject as DataIcon, Send as SendIcon } from '@mui/icons-material';
import MongoEditor from './MongoEditor';
import SQLEditor from './SQLEditor';
import { useDatabase } from '../../context/DatabaseContext';
import { useQuery } from '../../context/QueryContext';
import Tooltip from '../ui/Tooltip';
import { checkIfSamplingNeeded } from '../../utils/resultSampler';
import { isRelationalDatabase, getDatabaseDisplayName } from '../../utils/databaseTypeUtils';

const ChatInputSection = ({ onSend, isCentered = false, isLoading = false, inputValue = '', onInputChange, mode = 'agent', onModeChange, onStop, schemaGenStatus }) => {
  const textAreaRef = useRef(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const { selectedDatabase, collections, collectionSchemas, activeConnections, setCollectionSchemas, getConnectionDatabaseType } = useDatabase();
  const { settings, activeConversation, toggleIncludeResults } = useQuery();
  
  // Get the current database type from active connection
  const currentDbType = useMemo(() => {
    const connId = activeConnections?.[0];
    if (!connId) return 'mongodb';
    return getConnectionDatabaseType(connId);
  }, [activeConnections, getConnectionDatabaseType]);
  
  // Determine if current connection is SQL-based
  const isSqlDatabase = isRelationalDatabase(currentDbType);
  const dbDisplayName = getDatabaseDisplayName(currentDbType);
  
  // Check if we have results and whether to include them
  const hasResults = Boolean(activeConversation?.currentResults?.documents?.length > 0);
  const includeResults = Boolean(activeConversation?.includeResultsInNextMessage);
  
  // Calculate result info for display
  const resultInfo = useMemo(() => {
    if (!hasResults || !activeConversation?.currentResults?.documents) {
      return null;
    }
    const docs = activeConversation.currentResults.documents;
    const { needsSampling, tokenCount } = checkIfSamplingNeeded(docs);
    return {
      count: docs.length,
      needsSampling,
      tokenCount
    };
  }, [hasResults, activeConversation?.currentResults?.documents]);
  
  // Timeout state - defaults to settings value
  const [queryTimeout, setQueryTimeout] = useState(() => settings?.queryTimeout || 60);
  const [showTimeoutDropdown, setShowTimeoutDropdown] = useState(false);
  const [hasUserSelectedTimeout, setHasUserSelectedTimeout] = useState(false);
  
  // Update timeout when settings change, but only if user hasn't made a custom selection
  React.useEffect(() => {
    if (settings?.queryTimeout && !hasUserSelectedTimeout) {
      setQueryTimeout(settings.queryTimeout);
    }
  }, [settings?.queryTimeout, hasUserSelectedTimeout]);
  
  // Timeout options
  const timeoutOptions = [
    { value: 30, label: '30s' },
    { value: 60, label: '60s' },
    { value: 300, label: '5min' },
    { value: 600, label: '10min' }
  ];
  
  // Check if user is connected AND has selected a database
  const isConnected = activeConnections && activeConnections.length > 0;
  const hasSelectedDatabase = Boolean(selectedDatabase);
  // Only disable if schema is generating AND not yet complete/ready to query
  const isSchemaGenerating = Boolean(schemaGenStatus?.isGenerating && !schemaGenStatus?.canQueryNow);
  const isInputDisabled = !isConnected || !hasSelectedDatabase || isLoading || isSchemaGenerating;
  const collectionNames = useMemo(() => {
    if (!selectedDatabase) return [];
    const activeConnId = activeConnections?.[0];
    const key = activeConnId ? `${activeConnId}:${selectedDatabase}` : selectedDatabase;
    const list = collections?.[key];
    return Array.isArray(list) ? list : [];
  }, [selectedDatabase, collections, activeConnections]);
  const schemasByCollection = useMemo(() => {
    if (!selectedDatabase) return {};
    return collectionSchemas?.[selectedDatabase] || {};
  }, [selectedDatabase, collectionSchemas]);

  // On-demand schema fetch for a specific collection; cached in DatabaseContext
  const ensureSchema = useCallback(async (collectionName) => {
    const connId = activeConnections?.[0];
    const db = selectedDatabase;
    if (!connId || !db || !collectionName) return null;

    const existing = collectionSchemas?.[db]?.[collectionName]?.schema;
    if (existing) return existing;

    try {
      const res = await window.electronAPI.database.getSchema(connId, db, collectionName);
      if (res?.success) {
        const current = collectionSchemas?.[db] || {};
        const updated = {
          ...current,
          [collectionName]: {
            schema: res.schema,
            sampleSize: res.sampleCount,
            lastUpdated: new Date().toISOString(),
            indexes: current?.[collectionName]?.indexes || []
          }
        };
        setCollectionSchemas(db, updated);
        return res.schema;
      }
    } catch {}
    return null;
  }, [activeConnections, selectedDatabase, collectionSchemas, setCollectionSchemas]);

  const handleSubmit = () => {
    if (inputValue.trim() && !isLoading) {
      onSend(inputValue, mode, queryTimeout);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Box sx={{ p: isCentered ? 4 : 2, display: 'flex', justifyContent: 'center', alignItems: isCentered ? 'center' : 'flex-end', minHeight: isCentered ? '100%' : 'auto' }}>
      <Box sx={{ width: '100%', maxWidth: isCentered ? '600px' : '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {mode === 'query' ? (
          // Render appropriate query editor based on database type
          isSqlDatabase ? (
            <SQLEditor
              value={inputValue}
              onChange={onInputChange}
              disabled={isInputDisabled}
              minHeight={isCentered ? 112 : 56}
              maxHeight={240}
              placeholderText={
                !isConnected 
                  ? `Connect to ${dbDisplayName} first...` 
                  : !hasSelectedDatabase
                  ? 'Select a database to enable queries...'
                  : isSchemaGenerating
                  ? 'Analyzing database schema... Please wait'
                  : 'Enter your SQL query...'
              }
              tableNames={collectionNames}
            />
          ) : (
            <MongoEditor
              value={inputValue}
              onChange={onInputChange}
              disabled={isInputDisabled}
              minHeight={isCentered ? 112 : 56}
              maxHeight={240}
              placeholderText={
                !isConnected 
                  ? 'Connect to MongoDB first...' 
                  : !hasSelectedDatabase
                  ? 'Select a database to enable queries...'
                  : isSchemaGenerating
                  ? 'Analyzing database schema... Please wait'
                  : 'Enter your MongoDB query syntax...'
              }
              collectionNames={collectionNames}
              schemasByCollection={schemasByCollection}
              ensureSchema={ensureSchema}
              onLoadingChange={setIsLoadingSchema}
            />
          )
        ) : (
          <TextField
            ref={textAreaRef}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              !isConnected 
                ? `Connect to ${dbDisplayName} first...` 
                : !hasSelectedDatabase
                ? 'Select a database to start...'
                : isSchemaGenerating
                ? 'Analyzing database schema... Please wait'
                : isSqlDatabase
                ? 'Describe your SQL query in plain English...'
                : 'Describe your MongoDB query in plain English...'
            }
            multiline
            minRows={isCentered ? 4 : 2}
            maxRows={12}
            fullWidth
            disabled={isInputDisabled}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: '1rem',
                bgcolor: 'background.paper',
                color: 'text.primary', // Ensure text color is properly set for dark theme
                borderRadius: 1, // 8px to match MongoEditor/SQLEditor
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.grey[600] : theme.palette.grey[400],
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                  borderWidth: 1,
                },
              },
              '& .MuiOutlinedInput-input': {
                lineHeight: '1.4375em', // Match MUI default and MongoEditor/SQLEditor
                resize: 'none',
                color: 'text.primary', // Explicitly set input text color for dark theme
              },
            }}
          />
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
          <Tabs value={mode} onChange={(_, newMode) => onModeChange(newMode)} sx={{ minHeight: 'auto', '& .MuiTab-root': { minHeight: '32px', py: 0.5, px: 1.5, fontSize: '0.8rem', textTransform: 'none', fontWeight: 500, minWidth: '60px' }, '& .MuiTabs-indicator': { height: 2 } }}>
            <Tab label="Agent" value="agent" />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  Query
                  {isLoadingSchema && (
                    <Tooltip content="Indexing autocomplete..." placement="top">
                      <CircularProgress size={12} thickness={4} />
                    </Tooltip>
                  )}
                </Box>
              } 
              value="query" 
            />
          </Tabs>
          
          {/* Right side controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Include Results Toggle (only show in agent mode) */}
            {mode === 'agent' && hasResults && (
              <Tooltip 
                content={
                  includeResults 
                    ? `Results included in next message (${resultInfo?.count || 0} items${resultInfo?.needsSampling ? ', sampled' : ''})` 
                    : 'Click to include query results in context'
                } 
                placement="top"
              >
                <IconButton
                  size="small"
                  onClick={() => {
                    console.log('🎯 Toggle include results:', {
                      conversationId: activeConversation?.id,
                      currentValue: includeResults,
                      newValue: !includeResults,
                      hasResults,
                      currentResults: activeConversation?.currentResults
                    });
                    toggleIncludeResults(activeConversation?.id, !includeResults);
                  }}
                  sx={{
                    width: '32px',
                    height: '32px',
                    color: includeResults ? 'primary.contrastText' : 'text.secondary',
                    bgcolor: includeResults ? 'primary.main' : 'transparent',
                    border: includeResults ? 'none' : '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      bgcolor: includeResults ? 'primary.dark' : 'action.hover',
                      color: includeResults ? 'primary.contrastText' : 'text.primary',
                      borderColor: includeResults ? 'transparent' : 'text.secondary'
                    }
                  }}
                >
                  <DataIcon sx={{ fontSize: '18px' }} />
                </IconButton>
              </Tooltip>
            )}
            
            <Tooltip content="Query timeout duration" placement="top">
              <Box 
                sx={{ 
                  minWidth: '60px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease-in-out',
                  cursor: 'pointer'
                }}
                onMouseEnter={() => setShowTimeoutDropdown(true)}
                onMouseLeave={() => setShowTimeoutDropdown(false)}
              >
                {showTimeoutDropdown ? (
                  <FormControl size="small" sx={{ width: '100%' }}>
                    <Select
                      value={queryTimeout}
                      onChange={(e) => {
                        setQueryTimeout(e.target.value);
                        setHasUserSelectedTimeout(true);
                      }}
                      disabled={isInputDisabled}
                      sx={{
                        fontSize: '0.8rem',
                        height: '32px',
                        '& .MuiSelect-select': {
                          py: 0.5,
                          px: 1,
                        },
                      }}
                    >
                      {timeoutOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.8rem' }}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      fontSize: '0.8rem', 
                      color: 'text.secondary',
                      userSelect: 'none'
                    }}
                  >
                    {timeoutOptions.find(opt => opt.value === queryTimeout)?.label || '60s'}
                  </Typography>
                )}
              </Box>
            </Tooltip>
            
            <IconButton 
              onClick={isLoading ? onStop : handleSubmit} 
              disabled={(!inputValue.trim() || isInputDisabled) && !isLoading} 
              sx={{ 
                width: '30px', 
                height: '30px', 
                bgcolor: isLoading ? 'error.main' : ((!inputValue.trim() || isInputDisabled) ? 'action.disabled' : 'primary.main'), 
                color: 'white', 
                borderRadius: '50%',
                transition: 'all 0.2s ease-in-out',
                boxShadow: isLoading 
                  ? '0 2px 8px rgba(211, 47, 47, 0.3)' 
                  : ((!inputValue.trim() || isInputDisabled) 
                    ? 'none' 
                    : '0 2px 8px rgba(25, 118, 210, 0.25)'),
                '&:hover': { 
                  bgcolor: isLoading ? 'error.dark' : ((!inputValue.trim() || isInputDisabled) ? 'action.disabled' : 'primary.dark'),
                  transform: (!inputValue.trim() || isInputDisabled || isLoading) ? 'none' : 'translateY(-1px)',
                  boxShadow: isLoading 
                    ? '0 4px 12px rgba(211, 47, 47, 0.4)' 
                    : ((!inputValue.trim() || isInputDisabled) 
                      ? 'none' 
                      : '0 4px 12px rgba(25, 118, 210, 0.35)')
                },
                '&:active': {
                  transform: (!inputValue.trim() || isInputDisabled || isLoading) ? 'none' : 'translateY(0px)',
                },
                '&:disabled': { 
                  bgcolor: 'action.disabled', 
                  color: 'action.disabled',
                  boxShadow: 'none'
                } 
              }}
            >
              {isLoading ? (
                <StopIcon sx={{ fontSize: '24px' }} />
              ) : (
                <RunIcon sx={{ transform: 'rotate(-90deg)', fontSize: '24px' }} />
              )}
            </IconButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatInputSection;


