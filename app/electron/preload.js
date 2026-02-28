const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app-version'),

  // HTTP request operations
  http: {
    request: (options) => ipcRenderer.invoke('http-request', options),
    aiRequest: (endpoint, options) => ipcRenderer.invoke('ai-api-request', endpoint, options),
    agentRequest: (endpoint, options) => ipcRenderer.invoke('agent-api-request', endpoint, options)
  },

  // Database operations
  database: {
    connect: (connectionString, options) => ipcRenderer.invoke('db-connect', connectionString, options),
    disconnect: (connectionId) => ipcRenderer.invoke('db-disconnect', connectionId),
    listDatabases: (connectionId) => ipcRenderer.invoke('db-list-databases', connectionId),
    listCollections: (connectionId, dbName, options = {}) => ipcRenderer.invoke('db-list-collections', connectionId, dbName, options),
    getConnectionOptions: (connectionId) => ipcRenderer.invoke('db-get-connection-options', connectionId),
    createDatabase: (connectionId, databaseName) => ipcRenderer.invoke('db-create-database', connectionId, databaseName),
    executeQuery: (connectionId, query, options) => ipcRenderer.invoke('db-execute-query', connectionId, query, options),
    executeRawQuery: (conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = null) => ipcRenderer.invoke('db-execute-raw-query', conversationId, connectionId, databaseName, queryString, operationId, timeoutSeconds),
    cancelOperation: (operationId) => ipcRenderer.invoke('db-cancel-operation', operationId),
    getSchema: (connectionId, dbName, collectionName) => ipcRenderer.invoke('db-get-schema', connectionId, dbName, collectionName),
    getCollectionStats: (connectionId, dbName, collectionName) => ipcRenderer.invoke('db-get-collection-stats', connectionId, dbName, collectionName),
    generateCollectionIndex: (connectionId, databaseName, silent = false) => ipcRenderer.invoke('db-generate-collection-index', connectionId, databaseName, silent),
    loadCollectionSchemas: (databaseName) => ipcRenderer.invoke('db-load-collection-schemas', databaseName),
    createIndex: (connectionId, databaseName, collectionName, keys, options) => ipcRenderer.invoke('db-create-index', connectionId, databaseName, collectionName, keys, options),
    dropIndex: (connectionId, databaseName, collectionName, indexName) => ipcRenderer.invoke('db-drop-index', connectionId, databaseName, collectionName, indexName),
    duplicateDatabase: (targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null) => ipcRenderer.invoke('db-duplicate-database', targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId),
    duplicateDatabaseWithMethod: (targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, method = 'auto') => ipcRenderer.invoke('db-duplicate-database-with-method', targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId, method),
    duplicateCollection: (targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null) => ipcRenderer.invoke('db-duplicate-collection', targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId),
    checkToolsAvailability: () => ipcRenderer.invoke('db-check-tools-availability'),
    deleteDatabase: (connectionId, databaseName) => ipcRenderer.invoke('db-delete-database', connectionId, databaseName),
    deleteCollection: (connectionId, databaseName, collectionName) => ipcRenderer.invoke('db-delete-collection', connectionId, databaseName, collectionName),
    renameDatabase: (connectionId, oldDatabaseName, newDatabaseName) => ipcRenderer.invoke('db-rename-database', connectionId, oldDatabaseName, newDatabaseName),
    getShellStatus: () => ipcRenderer.invoke('db-get-shell-status'),
    
    // Export methods
    exportDatabase: (options, operationId = null) => ipcRenderer.invoke('db-export', options, operationId),
    checkExportToolsAvailability: (connectionId = null) => ipcRenderer.invoke('db-check-export-tools-availability', connectionId),
    getCollectionsForExport: (connectionId, databaseName) => ipcRenderer.invoke('db-get-collections-for-export', connectionId, databaseName),
    getCollectionMetadata: (connectionId, databaseName, collectionName) => ipcRenderer.invoke('db-get-collection-metadata', connectionId, databaseName, collectionName),
    selectExportPath: (options = {}) => ipcRenderer.invoke('db-select-export-path', options),
    cancelExport: (operationId) => ipcRenderer.invoke('db-cancel-export', operationId),
    
    // Import methods
    importDatabase: (options, operationId = null) => ipcRenderer.invoke('db-import', options, operationId),
    checkImportToolsAvailability: (connectionId = null) => ipcRenderer.invoke('db-check-import-tools-availability', connectionId),
    selectImportFiles: (options = {}) => ipcRenderer.invoke('db-select-import-files', options),
    
    // PostgreSQL client tools management
    downloadPgTools: () => ipcRenderer.invoke('db-download-pg-tools'),
    getPgToolsStatus: () => ipcRenderer.invoke('db-get-pg-tools-status'),
    removePgTools: () => ipcRenderer.invoke('db-remove-pg-tools'),
    onPgToolsDownloadProgress: (callback) => {
      ipcRenderer.on('pg-tools-download-progress', (event, progress) => callback(progress));
      return () => ipcRenderer.removeAllListeners('pg-tools-download-progress');
    },
    selectImportDirectory: (options = {}) => ipcRenderer.invoke('db-select-import-directory', options),
    cancelImport: (operationId) => ipcRenderer.invoke('db-cancel-import', operationId),
    
    // Progress event listeners
    onDuplicateProgress: (callback) => {
      ipcRenderer.on('db-duplicate-progress', (event, progress) => callback(progress));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('db-duplicate-progress', callback);
    },
    onDuplicateCollectionProgress: (callback) => {
      ipcRenderer.on('db-duplicate-collection-progress', (event, progress) => callback(progress));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('db-duplicate-collection-progress', callback);
    },
    onRenameProgress: (callback) => {
      ipcRenderer.on('db-rename-progress', (event, progress) => callback(progress));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('db-rename-progress', callback);
    },
    onSchemaGenerationProgress: (callback) => {
      ipcRenderer.on('schema-generation-progress', (event, progress) => callback(progress));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('schema-generation-progress', callback);
    },
    onExportProgress: (callback) => {
      ipcRenderer.on('db-export-progress', (event, data) => callback(data));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('db-export-progress', callback);
    },
    onImportProgress: (callback) => {
      ipcRenderer.on('db-import-progress', (event, data) => callback(data));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('db-import-progress', callback);
    }
  },

  // AI operations
  ai: {
    configure: (serviceType, apiKey) => ipcRenderer.invoke('ai-configure', serviceType, apiKey),
    setActiveService: (serviceType) => ipcRenderer.invoke('ai-set-active-service', serviceType),
    getServiceStatus: () => ipcRenderer.invoke('ai-get-service-status'),
    removeConfiguration: (serviceType) => ipcRenderer.invoke('ai-remove-configuration', serviceType),
    generateQuery: (prompt, schema, databaseName, collectionName, collectionSchemas) => 
      ipcRenderer.invoke('ai-generate-query', prompt, schema, databaseName, collectionName, collectionSchemas),
    explainQuery: (query) => ipcRenderer.invoke('ai-explain-query', query),
    formatQuery: (query) => ipcRenderer.invoke('ai-format-query', query),
    fixQuery: (originalQuery, errorMessage, databaseName, collectionSchemas) => 
      ipcRenderer.invoke('ai-fix-query', originalQuery, errorMessage, databaseName, collectionSchemas),
    getStatus: () => ipcRenderer.invoke('ai-status'),
    identifyCollections: (prompt, collectionSchemas) => ipcRenderer.invoke('ai-identify-collections', prompt, collectionSchemas),
    
    // Field validation operations
    validateFieldValues: (queryString, collectionSchemas) => ipcRenderer.invoke('ai-validate-field-values', queryString, collectionSchemas),
    validateParameters: (parameters, collectionSchemas) => ipcRenderer.invoke('ai-validate-parameters', parameters, collectionSchemas),
    checkFieldPerformance: (connectionId, databaseName, collection, field) => ipcRenderer.invoke('ai-check-field-performance', connectionId, databaseName, collection, field),
    getFieldValues: (connectionId, databaseName, collection, field) => ipcRenderer.invoke('ai-get-field-values', connectionId, databaseName, collection, field),
    refineQueryWithActualValues: (originalQuery, fieldsWithValues, originalPrompt, collectionSchemas, databaseName) => 
      ipcRenderer.invoke('ai-refine-query-with-actual-values', originalQuery, fieldsWithValues, originalPrompt, collectionSchemas, databaseName),
    replaceWithManualValues: (originalQuery, fieldsWithValues) => ipcRenderer.invoke('ai-replace-with-manual-values', originalQuery, fieldsWithValues),
    replaceParametersWithValues: (originalQuery, parametersWithValues) => ipcRenderer.invoke('ai-replace-parameters-with-values', originalQuery, parametersWithValues)
  },

  // Spreadsheet operations
  spreadsheet: {
    analyze: (filePath, connectionId) => ipcRenderer.invoke('spreadsheet:analyze', filePath, connectionId),
    analyzeBuffer: (buffer, fileName, connectionId) => ipcRenderer.invoke('spreadsheet:analyze-buffer', buffer, fileName, connectionId),
    process: (filePath, connectionId, database, options) => ipcRenderer.invoke('spreadsheet:process', filePath, connectionId, database, options),
    createWithDesign: (filePath, aiDesign, connectionId, database, options) => ipcRenderer.invoke('spreadsheet:create-with-design', filePath, aiDesign, connectionId, database, options),
    createWithDesignFromBuffer: (buffer, fileName, aiDesign, connectionId, database, options) => ipcRenderer.invoke('spreadsheet:create-with-design-buffer', buffer, fileName, aiDesign, connectionId, database, options),
    createSimpleDirectImport: (filePath, connectionId, database, options) => ipcRenderer.invoke('spreadsheet:create-simple-direct-import', filePath, connectionId, database, options),
    validate: (filePath) => ipcRenderer.invoke('spreadsheet:validate', filePath),
    getFileStats: (filePath) => ipcRenderer.invoke('spreadsheet:get-file-stats', filePath),
    estimate: (filePath) => ipcRenderer.invoke('spreadsheet:estimate', filePath),
    checkDatabaseConflict: (connectionId, databaseName) => ipcRenderer.invoke('spreadsheet:check-database-conflict', connectionId, databaseName),
    generateAlternativeNames: (baseName, existingDatabases) => ipcRenderer.invoke('spreadsheet:generate-alternative-names', baseName, existingDatabases),
    testAI: () => ipcRenderer.invoke('spreadsheet:test-ai'),
    getSupportedTypes: () => ipcRenderer.invoke('spreadsheet:supported-types'),
    
    // Progress event listener
    onProgress: (callback) => {
      ipcRenderer.on('spreadsheet:progress', (event, progress) => callback(progress));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('spreadsheet:progress', callback);
    }
  },

  // Dialog operations
  dialog: {
    openSpreadsheet: () => ipcRenderer.invoke('dialog:open-spreadsheet'),
    analyzeDroppedFile: (fileData, fileName) => ipcRenderer.invoke('dialog:analyze-dropped-file', fileData, fileName),
    onAnalyzeProgress: (callback) => {
      ipcRenderer.on('dialog:analyze-progress', (event, progress) => callback(progress));
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('dialog:analyze-progress', callback);
    }
  },

  // Storage operations
  storage: {
    saveSettings: (settings) => ipcRenderer.invoke('storage-save-settings', settings),
    loadSettings: () => ipcRenderer.invoke('storage-load-settings'),
    saveHistory: (historyItem) => ipcRenderer.invoke('storage-save-history', historyItem),
    loadHistory: () => ipcRenderer.invoke('storage-load-history'),
    saveFavorite: (favorite) => ipcRenderer.invoke('storage-save-favorite', favorite),
    loadFavorites: () => ipcRenderer.invoke('storage-load-favorites'),
    
    // App state operations
    saveAppState: (appState) => ipcRenderer.invoke('storage-save-app-state', appState),
    loadAppState: () => ipcRenderer.invoke('storage-load-app-state'),
    saveConnectionState: (connectionState) => ipcRenderer.invoke('storage-save-connection-state', connectionState),
    loadConnectionState: () => ipcRenderer.invoke('storage-load-connection-state'),
    saveConversations: (conversations) => ipcRenderer.invoke('storage-save-conversations', conversations),
    loadConversations: () => ipcRenderer.invoke('storage-load-conversations'),
    // Clear/reset APIs
    clearConversations: () => ipcRenderer.invoke('storage-clear-conversations'),
    clearHistory: () => ipcRenderer.invoke('storage-clear-history'),
    clearFavorites: () => ipcRenderer.invoke('storage-clear-favorites'),
    clearAppState: () => ipcRenderer.invoke('storage-clear-app-state'),
    clearConnections: () => ipcRenderer.invoke('storage-clear-connections'),
    clearAll: () => ipcRenderer.invoke('storage-clear-all'),
    
    // Schema storage operations
    saveCollectionSchemas: (databaseName, schemas, metadata = null) => ipcRenderer.invoke('storage-save-collection-schemas', databaseName, schemas, metadata),
    loadCollectionSchemas: (databaseName) => ipcRenderer.invoke('storage-load-collection-schemas', databaseName),
    clearAllCollectionSchemas: () => ipcRenderer.invoke('storage-clear-all-collection-schemas'),
    
    // Connection management
    setLastActiveConnection: (connectionId) => ipcRenderer.invoke('storage-set-last-active-connection', connectionId),
    updateLastUsedByConnectionString: (connectionString) => ipcRenderer.invoke('storage-update-last-used-by-connection-string', connectionString)
  },

  // Export operations
  export: {
    exportCSV: (data, filename) => ipcRenderer.invoke('export-csv', data, filename)
  },

  // Shell operations
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell-open-external', url)
  },

  // Dashboard operations
  dashboard: {
    getAllDashboards: () => ipcRenderer.invoke('dashboard-get-all'),
    getDashboard: (dashboardId) => ipcRenderer.invoke('dashboard-get', dashboardId),
    saveDashboard: (dashboard) => ipcRenderer.invoke('dashboard-save', dashboard),
    deleteDashboard: (dashboardId) => ipcRenderer.invoke('dashboard-delete', dashboardId),
    getSettings: () => ipcRenderer.invoke('dashboard-get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('dashboard-save-settings', settings),
    updateLayout: (dashboardId, layout) => ipcRenderer.invoke('dashboard-update-layout', dashboardId, layout),
    addWidget: (dashboardId, widget) => ipcRenderer.invoke('dashboard-add-widget', dashboardId, widget),
    updateWidget: (dashboardId, widgetId, updates) => ipcRenderer.invoke('dashboard-update-widget', dashboardId, widgetId, updates),
    removeWidget: (dashboardId, widgetId) => ipcRenderer.invoke('dashboard-remove-widget', dashboardId, widgetId),
    cleanup: () => ipcRenderer.invoke('dashboard-cleanup'),
    createDefault: () => ipcRenderer.invoke('dashboard-create-default')
  }
});