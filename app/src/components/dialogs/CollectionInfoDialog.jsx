import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  CircularProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  TextField,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Schema as SchemaIcon,
  Storage as IndexIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Psychology as AIIcon,
  Link as RelationshipIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useDatabase } from '../../context/DatabaseContext';
import { getTerminology, isRelationalDatabase } from '../../utils/databaseTypeUtils';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const CollectionInfoDialog = ({ open, onClose, database, collections, selectedCollection, connectionId, databaseType = 'mongodb' }) => {
  const { collectionSchemas, activeConnections } = useDatabase();
  const terminology = getTerminology(databaseType);
  const isSQL = isRelationalDatabase(databaseType);
  
  // Use provided connectionId or fall back to first active connection
  const effectiveConnectionId = connectionId || activeConnections[0];
  const [tabValue, setTabValue] = useState(0);
  const [schemaData, setSchemaData] = useState({});
  const [metadata, setMetadata] = useState(null); // AI-generated metadata
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [expandedAccordion, setExpandedAccordion] = useState(null);
  const [selectedField, setSelectedField] = useState(null); // { collectionName, fieldPath, samples }
  
  // Index management state
  const [indexDialogOpen, setIndexDialogOpen] = useState(false);
  const [indexDialogMode, setIndexDialogMode] = useState('create'); // 'create' or 'edit'
  const [currentCollection, setCurrentCollection] = useState(null);
  const [editingIndexName, setEditingIndexName] = useState(null);
  const [indexFormData, setIndexFormData] = useState({
    name: '',
    fields: [{ field: '', order: '1' }], // Array of {field, order}
    unique: false,
    sparse: false,
    ttl: false,
    ttlSeconds: '',
    partialFilterExpression: '',
    background: false
  });
  const [indexOperationLoading, setIndexOperationLoading] = useState(false);
  
  // Separate state for indexes - fetched on demand
  const [collectionIndexes, setCollectionIndexes] = useState({}); // { collectionName: [...indexes] }
  const [loadingIndexes, setLoadingIndexes] = useState({}); // { collectionName: boolean }
  
  // Ref for success message timeout cleanup
  const successMessageTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successMessageTimeoutRef.current) {
        clearTimeout(successMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open && database && activeConnections.length > 0) {
      loadSchemaData();
      
      // Pre-fetch index counts for all collections to show in accordion summary
      const fetchAllIndexCounts = async () => {
        const cols = await window.electronAPI.database.listCollections(effectiveConnectionId, database);
        if (cols.success) {
          cols.collections.forEach(collectionName => {
            if (!collectionIndexes[collectionName]) {
              fetchIndexesForCollection(collectionName);
            }
          });
        }
      };
      fetchAllIndexCounts();
    }
  }, [open, database, activeConnections]);

  // When a specific collection is selected, expand it and switch to the correct tab
  useEffect(() => {
    if (selectedCollection && schemaData[selectedCollection]) {
      setExpandedAccordion(selectedCollection);
      setTabValue(0); // Switch to "Collections with Schemas" tab
      
      // Fetch indexes for the selected collection if not already loaded
      if (!collectionIndexes[selectedCollection]) {
        fetchIndexesForCollection(selectedCollection);
      }
    } else if (selectedCollection && !schemaData[selectedCollection]) {
      setTabValue(1); // Switch to "Collections without Schemas" tab
    }
  }, [selectedCollection, schemaData]);

  const loadSchemaData = async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const connectionId = effectiveConnectionId;
      
      // First try to load existing schemas from storage
      let result = await window.electronAPI.storage.loadCollectionSchemas(database);
      
      let schemas = result.success ? result.schemas : null;
      let loadedMetadata = result.success ? result.metadata : null;
      
      // If no schemas exist in storage, generate new ones
      if (!schemas || Object.keys(schemas).length === 0) {
        console.log('📊 CollectionInfoDialog: Generating schemas...');
        result = await window.electronAPI.database.generateCollectionIndex(connectionId, database);
        
        if (result.success) {
          schemas = result.schemas;
          loadedMetadata = result.metadata; // Use metadata from generation result
          console.log(`✅ CollectionInfoDialog: Schemas generated, metadata: ${loadedMetadata ? 'YES' : 'NO'}`);
        } else {
          const errorMsg = result.error || 'Failed to generate collection schemas';
          console.error('❌ CollectionInfoDialog: Schema generation failed:', errorMsg);
          setError(errorMsg);
          return;
        }
      } else {
        console.log(`📊 CollectionInfoDialog: Loaded from storage, metadata: ${loadedMetadata ? 'YES' : 'NO'}`);
        if (loadedMetadata) {
          console.log(`📊 Metadata has ${loadedMetadata.collections?.length || 0} collections`);
        }
      }
      
      setSchemaData(schemas || {});
      setMetadata(loadedMetadata);
      setLastUpdated(new Date().toLocaleString());
    } catch (err) {
      console.error('❌ CollectionInfoDialog: Error in loadSchemaData:', err);
      setError(err.message || 'Failed to load collection schemas');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const connectionId = effectiveConnectionId;
      
      // Force regeneration by calling the database directly
      const result = await window.electronAPI.database.generateCollectionIndex(connectionId, database);
      
      if (result.success) {
        setSchemaData(result.schemas || {});
        setMetadata(result.metadata || null); // Update metadata from regeneration
        console.log(`✅ CollectionInfoDialog: Regenerated with metadata: ${result.metadata ? 'YES' : 'NO'}`);
        // Show success message
        setError(''); // Clear any previous errors
        setSuccessMessage('Schemas and indexes regenerated successfully!');
        setLastUpdated(new Date().toLocaleString());
        // Clear success message after 3 seconds
        successMessageTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const errorMsg = result.error || 'Failed to regenerate collection schemas';
        console.error('❌ CollectionInfoDialog: Schema regeneration failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('❌ CollectionInfoDialog: Error in handleRegenerate:', err);
      setError(err.message || 'Failed to regenerate collection schemas');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleOpenIndexDialog = (collectionName, mode = 'create', existingIndex = null) => {
    setCurrentCollection(collectionName);
    setIndexDialogMode(mode);
    
    if (mode === 'create') {
      setEditingIndexName(null);
      setIndexFormData({
        name: '',
        fields: [{ field: '', order: '1' }],
        unique: false,
        sparse: false,
        ttl: false,
        ttlSeconds: '',
        partialFilterExpression: '',
        background: false
      });
    } else if (mode === 'edit' && existingIndex) {
      setEditingIndexName(existingIndex.name);
      
      // Convert keys object to fields array
      const fields = Object.entries(existingIndex.keys || {}).map(([field, order]) => ({
        field,
        order: String(order)
      }));
      
      setIndexFormData({
        name: existingIndex.name,
        fields: fields.length > 0 ? fields : [{ field: '', order: '1' }],
        unique: existingIndex.unique || false,
        sparse: existingIndex.sparse || false,
        ttl: !!existingIndex.expireAfterSeconds,
        ttlSeconds: existingIndex.expireAfterSeconds ? String(existingIndex.expireAfterSeconds) : '',
        partialFilterExpression: existingIndex.partialFilterExpression ? JSON.stringify(existingIndex.partialFilterExpression) : '',
        background: false
      });
    }
    
    setIndexDialogOpen(true);
  };

  const handleCloseIndexDialog = () => {
    setIndexDialogOpen(false);
    setCurrentCollection(null);
    setEditingIndexName(null);
    setIndexFormData({
      name: '',
      fields: [{ field: '', order: '1' }],
      unique: false,
      sparse: false,
      ttl: false,
      ttlSeconds: '',
      partialFilterExpression: '',
      background: false
    });
  };

  const handleIndexFormChange = (field, value) => {
    setIndexFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddField = () => {
    setIndexFormData(prev => ({
      ...prev,
      fields: [...prev.fields, { field: '', order: '1' }]
    }));
  };

  const handleRemoveField = (index) => {
    setIndexFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  const handleFieldChange = (index, key, value) => {
    setIndexFormData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === index ? { ...f, [key]: value } : f)
    }));
  };

  const fetchIndexesForCollection = async (collectionName) => {
    try {
      setLoadingIndexes(prev => ({ ...prev, [collectionName]: true }));
      
      const connectionId = effectiveConnectionId;
      
      // Use getCollectionStats which includes indexes
      const statsResult = await window.electronAPI.database.getCollectionStats(
        connectionId,
        database,
        collectionName
      );
      
      if (statsResult.success && statsResult.stats.indexes) {
        // Store indexes in separate state
        setCollectionIndexes(prev => ({
          ...prev,
          [collectionName]: statsResult.stats.indexes.map(idx => ({
            name: idx.name,
            keys: idx.keys,
            unique: idx.unique || false,
            sparse: idx.sparse || false,
            partialFilterExpression: idx.partialFilterExpression,
            expireAfterSeconds: idx.expireAfterSeconds
          }))
        }));
      }
    } catch (err) {
      console.error('Error fetching indexes:', err);
    } finally {
      setLoadingIndexes(prev => ({ ...prev, [collectionName]: false }));
    }
  };

  // Fetch indexes when accordion is expanded
  const handleAccordionChange = (collectionName) => (event, isExpanded) => {
    // Only process if expanding (not collapsing)
    if (!isExpanded) {
      setExpandedAccordion(null);
      return;
    }
    
    setExpandedAccordion(collectionName);
    
    // Fetch indexes when expanding if not already loaded
    if (!collectionIndexes[collectionName]) {
      fetchIndexesForCollection(collectionName);
    }
  };

  const handleCreateIndex = async () => {
    if (!currentCollection) {
      setError('No collection selected');
      return;
    }

    // Validate fields
    const validFields = indexFormData.fields.filter(f => f.field.trim() !== '');
    if (validFields.length === 0) {
      setError('Please add at least one field to the index');
      return;
    }

    // Validate TTL
    if (indexFormData.ttl && (!indexFormData.ttlSeconds || parseInt(indexFormData.ttlSeconds) <= 0)) {
      setError('TTL seconds must be a positive number');
      return;
    }

    setIndexOperationLoading(true);
    setError('');
    
    try {
      // If editing, first delete the old index
      if (indexDialogMode === 'edit' && editingIndexName) {
        const deleteResult = await window.electronAPI.database.dropIndex(
          effectiveConnectionId,
          database,
          currentCollection,
          editingIndexName
        );

        if (!deleteResult.success) {
          setError(`Failed to remove old index: ${deleteResult.error}`);
          setIndexOperationLoading(false);
          return;
        }
      }

      // Build keys object from fields
      const keys = {};
      validFields.forEach(({ field, order }) => {
        keys[field] = order === 'text' ? 'text' : order === '2dsphere' ? '2dsphere' : parseInt(order);
      });

      // Build options
      const options = {};
      if (indexFormData.name && indexFormData.name.trim()) {
        options.name = indexFormData.name.trim();
      }
      if (indexFormData.unique) options.unique = true;
      if (indexFormData.sparse) options.sparse = true;
      if (indexFormData.background) options.background = true;
      if (indexFormData.ttl && indexFormData.ttlSeconds) {
        options.expireAfterSeconds = parseInt(indexFormData.ttlSeconds);
      }
      if (indexFormData.partialFilterExpression && indexFormData.partialFilterExpression.trim()) {
        try {
          options.partialFilterExpression = JSON.parse(indexFormData.partialFilterExpression);
        } catch (parseError) {
          setError('Invalid JSON format for partial filter expression');
          setIndexOperationLoading(false);
          return;
        }
      }

      const result = await window.electronAPI.database.createIndex(
        effectiveConnectionId,
        database,
        currentCollection,
        keys,
        options
      );

      if (result.success) {
        const action = indexDialogMode === 'edit' ? 'updated' : 'created';
        setSuccessMessage(`Index "${result.indexName}" ${action} successfully`);
        handleCloseIndexDialog();
        
        // Refresh this collection's indexes
        await fetchIndexesForCollection(currentCollection);
        
        successMessageTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to create index');
      }
    } catch (err) {
      setError(err.message || 'Failed to create index');
    } finally {
      setIndexOperationLoading(false);
    }
  };

  const handleDeleteIndex = async (collectionName, indexName) => {
    if (!confirm(`Are you sure you want to delete the index "${indexName}"?`)) {
      return;
    }

    if (indexName === '_id_') {
      setError('Cannot delete the _id index');
      return;
    }

    setIndexOperationLoading(true);
    setError('');
    
    try {
      const result = await window.electronAPI.database.dropIndex(
        effectiveConnectionId,
        database,
        collectionName,
        indexName
      );

      if (result.success) {
        setSuccessMessage(`Index "${indexName}" deleted successfully`);
        
        // Refresh this collection's indexes
        await fetchIndexesForCollection(collectionName);
        
        successMessageTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to delete index');
      }
    } catch (err) {
      setError(err.message || 'Failed to delete index');
    } finally {
      setIndexOperationLoading(false);
    }
  };

  // Helper function to get color for different types
  const getTypeColor = (type) => {
    // Use theme-aware colors that work in both light and dark modes
    const typeColors = {
      string: '#22c55e',      // Green-500 (good contrast in both themes)
      number: '#3b82f6',      // Blue-500 (primary blue)
      boolean: '#f59e0b',     // Amber-500 (warning color)
      object: '#a855f7',      // Purple-500
      array: '#ef4444',       // Red-500 (error color)
      objectId: '#8b5cf6',    // Violet-500
      date: '#10b981',        // Emerald-500
      null: '#6b7280',        // Gray-500
      undefined: '#9ca3af',   // Gray-400
      empty: '#9ca3af'        // Gray-400 for empty arrays
    };
    return typeColors[type] || '#6b7280'; // Default gray-500
  };

  // Helper function to capitalize and format type
  const formatType = (type) => {
    if (Array.isArray(type)) {
      return type.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' | ');
    }
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Convert flat schema to nested structure for JSON display
  const convertFlatSchemaToNested = (flatSchema) => {
    const nested = {};
    const arrayTypes = {};
    
    // First, collect array type information
    Object.keys(flatSchema).forEach(key => {
      if (key.endsWith('.arrayTypes')) {
        const fieldPath = key.replace('.arrayTypes', '');
        arrayTypes[fieldPath] = flatSchema[key];
      }
    });
    
    // Process each field
    Object.keys(flatSchema).forEach(key => {
      // Skip array type metadata and items fields
      if (key.endsWith('.arrayTypes') || key.includes('.items.')) {
        return;
      }
      
      const value = flatSchema[key];
      const parts = key.split('.');
      let current = nested;
      
      // Navigate/create the nested structure
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        } else if (typeof current[part] === 'string') {
          // If we encounter a string where we need an object, convert it
          current[part] = {};
        }
        current = current[part];
      }
      
      const lastPart = parts[parts.length - 1];
      
      // Handle arrays specially
      if (value === 'array' || arrayTypes[key]) {
        let types = arrayTypes[key] || ['unknown'];
        
        // Ensure arrayTypes is properly formatted
        if (typeof types === 'string') {
          types = [types];
        } else if (types instanceof Set) {
          types = Array.from(types);
        } else if (!Array.isArray(types)) {
          types = ['unknown'];
        }
        
        current[lastPart] = {
          _isArray: true,
          _arrayTypes: types,
          _itemSchema: {}
        };
        
        // Look for item schema
        const itemPrefix = key + '.items.';
        Object.keys(flatSchema).forEach(itemKey => {
          if (itemKey.startsWith(itemPrefix)) {
            const itemField = itemKey.substring(itemPrefix.length);
            if (!itemField.includes('.')) {
              current[lastPart]._itemSchema[itemField] = flatSchema[itemKey];
            }
          }
        });
      } else if (value === 'object') {
        // Only set as object if it doesn't already exist or is not already an object
        if (!current[lastPart] || typeof current[lastPart] === 'string') {
          current[lastPart] = {};
        }
      } else {
        // Only set primitive values if the field doesn't already exist as an object
        if (!current[lastPart] || typeof current[lastPart] === 'string') {
          current[lastPart] = value;
        }
      }
    });
    
    return nested;
  };

  // Helper function to get field description
  // Builds full path from parent context for nested fields
  const getFieldDescription = (fieldPath, collectionName, parentPath = '') => {
    const collectionData = schemaData[collectionName];
    if (!collectionData || !collectionData.fieldDescriptions) {
      return null;
    }
    
    // Build the full path including parent context
    const fullPath = parentPath ? `${parentPath}.${fieldPath}` : fieldPath;
    
    // Try to find exact match first
    let description = collectionData.fieldDescriptions.find(
      desc => desc.fieldPath === fullPath
    );
    
    // If no exact match, try the field path without parent
    if (!description) {
      description = collectionData.fieldDescriptions.find(
        desc => desc.fieldPath === fieldPath
      );
    }
    
    return description?.description || null;
  };

  // Helper function to get field samples
  const getFieldSamples = (fieldPath, collectionName, parentPath = '') => {
    const collectionData = schemaData[collectionName];
    if (!collectionData || !collectionData.fieldSamples) {
      return null;
    }
    
    // Build the full path including parent context
    const fullPath = parentPath ? `${parentPath}.${fieldPath}` : fieldPath;
    
    // Try exact match first
    if (collectionData.fieldSamples[fullPath]) {
      return collectionData.fieldSamples[fullPath];
    }
    
    // Try without parent path
    if (collectionData.fieldSamples[fieldPath]) {
      return collectionData.fieldSamples[fieldPath];
    }
    
    return null;
  };

  // Handle field click to show samples
  const handleFieldClick = (fieldPath, collectionName, parentPath = '') => {
    const samples = getFieldSamples(fieldPath, collectionName, parentPath);
    if (samples && samples.length > 0) {
      const fullPath = parentPath ? `${parentPath}.${fieldPath}` : fieldPath;
      setSelectedField({ collectionName, fieldPath: fullPath, samples });
    }
  };

  const renderSchemaField = (field, value, depth = 0, currentSchemaData = schemaData, isLast = false, collectionName = null, parentPath = '') => {
    const indent = '  '.repeat(depth); // 2 spaces per level like JSON
    const fieldDescription = collectionName ? getFieldDescription(field, collectionName, parentPath) : null;
    const hasSamples = collectionName && getFieldSamples(field, collectionName, parentPath);
    
    // Handle special array objects from our conversion
    if (typeof value === 'object' && value !== null && value._isArray) {
      let arrayTypes = value._arrayTypes || [];
      
      // Handle different formats of arrayTypes from backend
      if (typeof arrayTypes === 'string') {
        arrayTypes = [arrayTypes];
      } else if (arrayTypes instanceof Set) {
        arrayTypes = Array.from(arrayTypes);
      } else if (!Array.isArray(arrayTypes)) {
        arrayTypes = [];
      }
      
      let itemTypeDisplay = '/* Empty Array */';
      
      if (arrayTypes.length === 1) {
        itemTypeDisplay = `/* Array of ${formatType(arrayTypes[0])}s */`;
      } else if (arrayTypes.length > 1) {
        itemTypeDisplay = `/* Array of Mixed Types: ${arrayTypes.map(t => formatType(t)).join(', ')} */`;
      }

      return (
        <Box key={field} sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
          {/* Field name with opening bracket */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre',
              cursor: hasSamples ? 'pointer' : 'default',
              '&:hover': hasSamples ? { bgcolor: 'action.hover' } : {}
            }}
            onClick={() => hasSamples && handleFieldClick(field, collectionName, parentPath)}
          >
            {indent}"{field}": [
            {fieldDescription && (
              <Typography
                component="span"
                sx={{
                  ml: 1.5,
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  opacity: 0.85
                }}
              >
                — {fieldDescription}
              </Typography>
            )}
          </Typography>
          
          {/* Array type comment */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.secondary',
              whiteSpace: 'pre',
              fontStyle: 'italic'
            }}
          >
            {indent}  {itemTypeDisplay}
          </Typography>
          
          {/* Show array item schema if it has object structure */}
          {Object.keys(value._itemSchema || {}).length > 0 && (
            <>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontFamily: 'monospace',
                  color: 'text.primary',
                  whiteSpace: 'pre'
                }}
              >
                {indent}  {'{'}
              </Typography>
              {Object.entries(value._itemSchema).map(([subField, subValue], index, arr) => {
                const newParentPath = parentPath ? `${parentPath}.${field}` : field;
                return renderSchemaField(subField, subValue, depth + 2, currentSchemaData, index === arr.length - 1, collectionName, newParentPath);
              })}
              <Typography 
                variant="body2" 
                sx={{ 
                  fontFamily: 'monospace',
                  color: 'text.primary',
                  whiteSpace: 'pre'
                }}
              >
                {indent}  {'}'}
              </Typography>
            </>
          )}
          
          {/* Closing bracket with comma */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre'
            }}
          >
            {indent}]{!isLast ? ',' : ''}
          </Typography>
        </Box>
      );
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const entries = Object.entries(value);
      return (
        <Box key={field} sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
          {/* Field name with opening brace */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre',
              cursor: hasSamples ? 'pointer' : 'default',
              '&:hover': hasSamples ? { bgcolor: 'action.hover' } : {}
            }}
            onClick={() => hasSamples && handleFieldClick(field, collectionName, parentPath)}
          >
            {indent}"{field}": {'{'}
            {fieldDescription && (
              <Typography
                component="span"
                sx={{
                  ml: 1.5,
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  opacity: 0.85
                }}
              >
                — {fieldDescription}
              </Typography>
            )}
          </Typography>
          
          {/* Nested object contents */}
          {entries.map(([subField, subValue], index) => {
            const newParentPath = parentPath ? `${parentPath}.${field}` : field;
            return renderSchemaField(subField, subValue, depth + 1, currentSchemaData, index === entries.length - 1, collectionName, newParentPath);
          })}
          
          {/* Closing brace with comma */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre'
            }}
          >
            {indent}{'}'}{!isLast ? ',' : ''}
          </Typography>
        </Box>
      );
    } else if (Array.isArray(value)) {
      // Check if we have arrayTypes information from the backend
      const arrayTypesKey = `${field}.arrayTypes`;
      const hasArrayTypes = currentSchemaData && currentSchemaData[arrayTypesKey];
      
      let itemTypeDisplay = '/* Empty Array */';
      
      if (hasArrayTypes) {
        // Use the arrayTypes information from the backend
        const types = Array.from(currentSchemaData[arrayTypesKey]);
        if (types.length === 1) {
          itemTypeDisplay = `/* Array of ${formatType(types[0])}s */`;
        } else {
          itemTypeDisplay = `/* Array of Mixed Types: ${types.map(t => formatType(t)).join(', ')} */`;
        }
      } else if (value.length > 0) {
        // Fallback to analyzing the first item
        const firstItem = value[0];
        if (Array.isArray(firstItem)) {
          itemTypeDisplay = '/* Array of Arrays */';
        } else if (typeof firstItem === 'object' && firstItem !== null) {
          itemTypeDisplay = '/* Array of Objects */';
        } else {
          itemTypeDisplay = `/* Array of ${formatType(typeof firstItem)}s */`;
        }
      }

      return (
        <Box key={field} sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
          {/* Field name with opening bracket */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre'
            }}
          >
            {indent}"{field}": [
          </Typography>
          
          {/* Array type comment */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.secondary',
              whiteSpace: 'pre',
              fontStyle: 'italic'
            }}
          >
            {indent}  {itemTypeDisplay}
          </Typography>
          
          {/* Show array item schema if it's objects */}
          {value.length > 0 && typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0]) && (
            <>
              <Typography 
                variant="body2" 
                sx={{ 
                  fontFamily: 'monospace',
                  color: 'text.primary',
                  whiteSpace: 'pre'
                }}
              >
                {indent}  {'{'}
              </Typography>
              {Object.entries(value[0]).map(([subField, subValue], index, arr) => {
                const newParentPath = parentPath ? `${parentPath}.${field}` : field;
                return renderSchemaField(subField, subValue, depth + 2, currentSchemaData, index === arr.length - 1, collectionName, newParentPath);
              })}
              <Typography 
                variant="body2" 
                sx={{ 
                  fontFamily: 'monospace',
                  color: 'text.primary',
                  whiteSpace: 'pre'
                }}
              >
                {indent}  {'}'}
              </Typography>
            </>
          )}
          
          {/* Closing bracket with comma */}
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre'
            }}
          >
            {indent}]{!isLast ? ',' : ''}
          </Typography>
        </Box>
      );
    } else {
      return (
        <Box key={field} sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
          <Typography 
            variant="body2" 
            sx={{ 
              fontFamily: 'monospace',
              color: 'text.primary',
              whiteSpace: 'pre',
              cursor: hasSamples ? 'pointer' : 'default',
              '&:hover': hasSamples ? { bgcolor: 'action.hover' } : {}
            }}
            onClick={() => hasSamples && handleFieldClick(field, collectionName, parentPath)}
          >
            {indent}"{field}": <Typography 
              component="span"
              sx={{ 
                color: getTypeColor(String(value)),
                fontWeight: 600
              }}
            >
              {formatType(String(value))}
            </Typography>{!isLast ? ',' : ''}
            {fieldDescription && (
              <Typography
                component="span"
                sx={{
                  ml: 1.5,
                  color: 'text.secondary',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  opacity: 0.85
                }}
              >
                — {fieldDescription}
              </Typography>
            )}
          </Typography>
        </Box>
      );
    }
  };

  const formatIndexKeys = (keys) => {
    if (!keys || Object.keys(keys).length === 0) return 'None';
    
    return Object.entries(keys).map(([field, order]) => {
      let orderStr;
      if (order === 1) orderStr = 'asc';
      else if (order === -1) orderStr = 'desc';
      else if (order === 'text') orderStr = 'text';
      else if (order === '2dsphere') orderStr = '2dsphere';
      else if (order === '2d') orderStr = '2d';
      else if (order === 'hashed') orderStr = 'hashed';
      else orderStr = String(order);
      
      return `${field}: ${orderStr}`;
    }).join(', ');
  };

  const renderIndexes = (indexes, collectionName) => {
    if (!indexes || indexes.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          No indexes found
        </Typography>
      );
    }

    const canModifyIndex = (indexName) => indexName !== '_id_';

    return (
      <List dense>
        {indexes.map((index, i) => (
          <React.Fragment key={i}>
            <ListItem>
              <Box sx={{ py: 1, width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {index.name || 'Unnamed Index'}
                    </Typography>
                    {index.unique && <Chip label="Unique" size="small" color="primary" variant="outlined" />}
                    {index.sparse && <Chip label="Sparse" size="small" color="secondary" variant="outlined" />}
                    {index.expireAfterSeconds && (
                      <Chip 
                        label={`TTL: ${index.expireAfterSeconds}s`} 
                        size="small" 
                        color="info" 
                        variant="outlined" 
                      />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {canModifyIndex(index.name) && (
                      <>
                        <Tooltip title="Edit index">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenIndexDialog(collectionName, 'edit', index)}
                            disabled={indexOperationLoading}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete index">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteIndex(collectionName, index.name)}
                            disabled={indexOperationLoading}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                </Box>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="text.primary" sx={{ mb: 0.5 }}>
                    {formatIndexKeys(index.keys)}
                  </Typography>
                  {index.partialFilterExpression && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>
                      Filter: {JSON.stringify(index.partialFilterExpression)}
                    </Typography>
                  )}
                </Box>
              </Box>
            </ListItem>
            {i < indexes.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </List>
    );
  };

  // Helper to get metadata for a collection
  const getCollectionMetadata = (collectionName) => {
    if (!metadata || !metadata.collections) return null;
    return metadata.collections.find(c => c.collectionName === collectionName);
  };

  // Render AI-generated metadata
  const renderMetadata = (collectionName) => {
    const collMetadata = getCollectionMetadata(collectionName);
    
    // If no metadata, return null
    if (!collMetadata) {
      return null;
    }

    const hasDescription = collMetadata.description && collMetadata.description.trim();
    const hasPrimaryConcepts = collMetadata.primaryConcepts && collMetadata.primaryConcepts.length > 0;
    const hasAlternativeNames = collMetadata.alternativeNames && collMetadata.alternativeNames.length > 0;
    const hasRelationships = collMetadata.relationships && collMetadata.relationships.length > 0;

    // If no data at all, return null
    if (!hasDescription && !hasPrimaryConcepts && !hasAlternativeNames && !hasRelationships) {
      return null;
    }

    return (
      <Box>
        {/* Description */}
        {hasDescription && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Description
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {collMetadata.description}
            </Typography>
          </Box>
        )}

        {/* Primary Concepts */}
        {hasPrimaryConcepts && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Primary Concepts
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {collMetadata.primaryConcepts.map((concept, idx) => (
                <Chip key={idx} label={concept} size="small" color="primary" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        {/* Alternative Names */}
        {hasAlternativeNames && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Alternative Names
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {collMetadata.alternativeNames.map((name, idx) => (
                <Chip key={idx} label={name} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>
        )}

        {/* Relationships */}
        {hasRelationships && (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <RelationshipIcon fontSize="small" color="secondary" />
              Relationships
            </Typography>
            <List dense>
              {collMetadata.relationships.map((rel, idx) => (
                <ListItem key={idx} sx={{ py: 0.5, px: 0 }}>
                  <Box>
                    <Typography variant="body2">
                      <strong>{rel.localField}</strong> → <strong>{rel.relatedCollection}.{rel.foreignField}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {rel.relationshipType} • {rel.reasoning}
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Box>
    );
  };

  const collectionsWithSchemas = collections.filter(collection => schemaData[collection]);
  const collectionsWithoutSchemas = collections.filter(collection => !schemaData[collection]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InfoIcon />
            <Box>
              <Typography variant="h6">
                {terminology.Collection} Information - {database}
              </Typography>
              {lastUpdated && (
                <Typography variant="caption" color="text.secondary">
                  Last updated: {lastUpdated}
                </Typography>
              )}
            </Box>
          </Box>
          <Tooltip title="Regenerate schemas and indexes">
            <IconButton
              onClick={handleRegenerate}
              disabled={loading}
              color="primary"
              size="small"
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : successMessage ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMessage}
          </Alert>
        ) : (
          <>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
              <Tabs value={tabValue} onChange={handleTabChange}>
                <Tab label={`${terminology.Collections} with Schemas`} />
                <Tab label={`${terminology.Collections} without Schemas`} />
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
              {collectionsWithSchemas.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No {terminology.collections} have schemas generated yet.
                </Typography>
              ) : (
                collectionsWithSchemas.map(collection => {
                  const collectionData = schemaData[collection];
                  return (
                    <Accordion 
                      key={collection} 
                      sx={{ mb: 1 }}
                      expanded={expandedAccordion === collection}
                      onChange={handleAccordionChange(collection)}
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="h6">{collection}</Typography>
                          <Chip 
                            label={`${Object.keys(collectionData.schema || {}).length} ${terminology.fields}`} 
                            size="small" 
                            color="primary" 
                          />
                          {loadingIndexes[collection] ? (
                            <Chip 
                              label="Loading indexes..."
                              size="small" 
                              color="default" 
                              variant="outlined"
                            />
                          ) : collectionIndexes[collection] ? (
                            <Chip 
                              label={`${collectionIndexes[collection].length} indexes`} 
                              size="small" 
                              color="secondary" 
                            />
                          ) : null}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        {/* Only render details when expanded */}
                        {expandedAccordion === collection && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {/* AI Metadata - Only show if there's data */}
                            {renderMetadata(collection) && (
                              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                                {renderMetadata(collection)}
                              </Paper>
                            )}

                            {/* Schema */}
                            <Paper variant="outlined" sx={{ p: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <SchemaIcon color="primary" />
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                  Schema
                                </Typography>
                              </Box>
                              {collectionData.schema && Object.keys(collectionData.schema).length > 0 ? (
                                <Box sx={{ 
                                  fontFamily: 'monospace', 
                                  fontSize: '0.875rem', 
                                  bgcolor: 'grey.100', 
                                  p: 2, 
                                  borderRadius: 1,
                                  border: 1,
                                  borderColor: 'divider'
                                }}>
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontFamily: 'monospace',
                                      color: 'text.primary',
                                      whiteSpace: 'pre'
                                    }}
                                  >
                                    {'{'}
                                  </Typography>
                                  {(() => {
                                    const nestedSchema = convertFlatSchemaToNested(collectionData.schema);
                                    return Object.entries(nestedSchema).map(([field, fieldType], index, arr) =>
                                      renderSchemaField(field, fieldType, 1, collectionData, index === arr.length - 1, collection, '')
                                    );
                                  })()}
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontFamily: 'monospace',
                                      color: 'text.primary',
                                      whiteSpace: 'pre'
                                    }}
                                  >
                                    {'}'}
                                  </Typography>
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  No schema available
                                </Typography>
                              )}
                            </Paper>

                            {/* Indexes */}
                            <Paper variant="outlined" sx={{ p: 2 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <IndexIcon color="secondary" />
                                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                    Indexes
                                  </Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<AddIcon />}
                                  onClick={() => handleOpenIndexDialog(collection, 'create')}
                                  disabled={indexOperationLoading}
                                >
                                  New Index
                                </Button>
                              </Box>
                              {loadingIndexes[collection] ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                  <CircularProgress size={24} />
                                </Box>
                              ) : (
                                renderIndexes(collectionIndexes[collection] || [], collection)
                              )}
                            </Paper>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  );
                })
              )}
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              {collectionsWithoutSchemas.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  All {terminology.collections} have schemas generated.
                </Typography>
              ) : (
                <List>
                  {collectionsWithoutSchemas.map(collection => (
                    <ListItem key={collection}>
                      <ListItemText
                        primary={collection}
                        secondary={`No schema available - click the ${terminology.collection} in the sidebar to generate`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </TabPanel>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Field Samples Dialog */}
      <Dialog
        open={Boolean(selectedField)}
        onClose={() => setSelectedField(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Field Samples: {selectedField?.fieldPath}
          <Typography variant="caption" display="block" color="text.secondary">
            Collection: {selectedField?.collectionName}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selectedField?.samples && (
            <List dense>
              {selectedField.samples.map((sample, index) => (
                <React.Fragment key={index}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            color: 'text.primary',
                            wordBreak: 'break-word'
                          }}
                        >
                          {typeof sample === 'string' ? `"${sample}"` : JSON.stringify(sample)}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {index < selectedField.samples.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedField(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Index Management Dialog */}
      <Dialog
        open={indexDialogOpen}
        onClose={(event, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
            return;
          }
          handleCloseIndexDialog();
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h6">
                {indexDialogMode === 'create' ? 'Create New Index' : 'Edit Index'}
              </Typography>
              <Typography variant="caption" display="block" color="text.secondary">
                Collection: {currentCollection}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={handleCloseIndexDialog}
              disabled={indexOperationLoading}
              sx={{ mt: -1, mr: -1 }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
            {/* Index Name */}
            <TextField
              label="Index Name (optional)"
              value={indexFormData.name}
              onChange={(e) => handleIndexFormChange('name', e.target.value)}
              fullWidth
              size="small"
              helperText="Leave empty to auto-generate based on fields"
              disabled={indexDialogMode === 'edit'}
            />

            {/* Index Fields */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Index Fields *
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddField}
                  disabled={indexOperationLoading}
                >
                  Add Field
                </Button>
              </Box>

              {indexFormData.fields.map((field, index) => (
                <Grid container spacing={1} key={index} sx={{ mb: 1.5 }}>
                  <Grid item xs={7}>
                    <TextField
                      label="Field Name"
                      value={field.field}
                      onChange={(e) => handleFieldChange(index, 'field', e.target.value)}
                      fullWidth
                      size="small"
                      placeholder="e.g., userId, email"
                      required
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>{isSQL ? 'Index Type' : 'Order/Type'}</InputLabel>
                      <Select
                        value={field.order}
                        onChange={(e) => handleFieldChange(index, 'order', e.target.value)}
                        label={isSQL ? 'Index Type' : 'Order/Type'}
                      >
                        {isSQL ? (
                          // PostgreSQL index types
                          [
                            <MenuItem key="btree" value="btree">B-tree (default)</MenuItem>,
                            <MenuItem key="hash" value="hash">Hash</MenuItem>,
                            <MenuItem key="gin" value="gin">GIN</MenuItem>,
                            <MenuItem key="gist" value="gist">GiST</MenuItem>,
                            <MenuItem key="brin" value="brin">BRIN</MenuItem>
                          ]
                        ) : (
                          // MongoDB index options
                          [
                            <MenuItem key="1" value="1">1 - asc</MenuItem>,
                            <MenuItem key="-1" value="-1">-1 - desc</MenuItem>,
                            <MenuItem key="text" value="text">text</MenuItem>,
                            <MenuItem key="2dsphere" value="2dsphere">2dsphere</MenuItem>,
                            <MenuItem key="2d" value="2d">2d</MenuItem>,
                            <MenuItem key="hashed" value="hashed">hashed</MenuItem>
                          ]
                        )}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={1}>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveField(index)}
                      disabled={indexFormData.fields.length === 1 || indexOperationLoading}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
            </Box>

            <Divider />

            {/* Index Options */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                Index Options
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={indexFormData.unique}
                        onChange={(e) => handleIndexFormChange('unique', e.target.checked)}
                      />
                    }
                    label="Unique"
                  />
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                    Ensures unique values
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={indexFormData.sparse}
                        onChange={(e) => handleIndexFormChange('sparse', e.target.checked)}
                      />
                    }
                    label="Sparse"
                  />
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                    Only index docs with field
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={indexFormData.background}
                        onChange={(e) => handleIndexFormChange('background', e.target.checked)}
                      />
                    }
                    label="Background"
                  />
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                    Build in background
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={indexFormData.ttl}
                        onChange={(e) => handleIndexFormChange('ttl', e.target.checked)}
                      />
                    }
                    label="TTL (Time To Live)"
                  />
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                    Auto-delete after time
                  </Typography>
                </Grid>

                {indexFormData.ttl && (
                  <Grid item xs={12}>
                    <TextField
                      label="TTL Seconds"
                      type="number"
                      value={indexFormData.ttlSeconds}
                      onChange={(e) => handleIndexFormChange('ttlSeconds', e.target.value)}
                      fullWidth
                      size="small"
                      helperText="Documents expire after this many seconds"
                      InputProps={{ inputProps: { min: 0 } }}
                    />
                  </Grid>
                )}
              </Grid>
            </Box>

            {/* Advanced Options */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
                Advanced Options
              </Typography>
              
              <TextField
                label="Partial Filter Expression (JSON)"
                value={indexFormData.partialFilterExpression}
                onChange={(e) => handleIndexFormChange('partialFilterExpression', e.target.value)}
                fullWidth
                multiline
                rows={2}
                size="small"
                placeholder='{"age": {"$gte": 21}}'
                helperText="Index only documents matching this filter"
              />
            </Box>

            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseIndexDialog} disabled={indexOperationLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateIndex}
            variant="contained"
            disabled={indexOperationLoading}
          >
            {indexOperationLoading ? (
              <CircularProgress size={24} />
            ) : (
              indexDialogMode === 'edit' ? 'Update Index' : 'Create Index'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default CollectionInfoDialog;
