const { app, BrowserWindow, ipcMain, shell, screen, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('🚨 [GLOBAL ERROR] Uncaught Exception:', {
    message: error.message,
    stack: error.stack?.substring(0, 500),
    timestamp: new Date().toISOString()
  });
  
  console.error('🚨 [GLOBAL ERROR] Critical error detected, attempting to continue...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [GLOBAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Ensure single instance
console.log('🔍 [STARTUP] Requesting single instance lock...');
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('🔒 [STARTUP] Another instance is already running, quitting this instance...');
  app.quit();
} else {
  console.log('✅ [STARTUP] Got single instance lock, this is the main instance');
  
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus the main window if it exists
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
const ConnectionManager = require('./database/connection-manager');
let AIServiceManager = null;
try {
  AIServiceManager = require('./ai/ai-service-manager');
} catch (e) {
  console.warn('AI module not found. Running without built-in AI.');
}
const StorageManager = require('./storage/storage-manager');
const SpreadsheetService = require('./services/spreadsheet/spreadsheet-service');

const isDev = !app.isPackaged;

// Keep a global reference of the window object
let mainWindow;
let dbConnection;
let aiService;
let storageManager;
let spreadsheetService;

// Cleanup function to close all resources
async function performCleanup() {
  console.log('🧹 Performing application cleanup...');
  
  try {
    // Clean up database connections and shells
    if (dbConnection) {
      await dbConnection.cleanup();
    }
    
    // Clear all conversations when app closes
    if (storageManager) {
      try {
        const clearResult = await storageManager.clearConversations();
        if (clearResult.success) {
          console.log('✅ All conversations cleared on app close');
        } else {
          console.warn('⚠️ Failed to clear conversations:', clearResult.error);
        }
      } catch (error) {
        console.error('❌ Error clearing conversations:', error);
      }
    }
    
    console.log('✅ Application cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Create application menu
function createApplicationMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Agent M',
          click: () => {
            const packageJson = require('../package.json');
            dialog.showMessageBox({
              type: 'info',
              title: 'About Agent M',
              message: 'Agent M',
              detail: `AI-Powered MongoDB Management Tool\n\nVersion ${packageJson.version}\n\n© 2025 Agent M LLC\nAll rights reserved.`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  // Get the primary display's work area (excluding taskbars, docks, etc.)
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Calculate window size as a percentage of screen size
  // Use 80% of screen width and height, with minimum and maximum constraints
  const windowWidth = Math.max(1000, Math.min(1600, Math.floor(screenWidth * 0.85)));
  const windowHeight = Math.max(700, Math.min(1200, Math.floor(screenHeight * 0.85)));
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'Agent M - AI-Powered MongoDB Query Tool',
    show: false // Don't show until maximized
  });

  // Create application menu
  createApplicationMenu();

  // Maximize the window but don't go fullscreen
  mainWindow.maximize();
  mainWindow.show();

  // Load the app
  console.log('isDev:', isDev);
  console.log('app.isPackaged:', app.isPackaged);
  console.log('__dirname:', __dirname);
  
  // For development, always load from localhost
  // Use development mode ONLY if app is not packaged AND (NODE_ENV is development OR --dev flag is passed)
  // For packaged apps, always use production mode regardless of environment variables
  const isDevMode = !app.isPackaged && (process.env.NODE_ENV === 'development' || process.argv.includes('--dev'));
  
  console.log('🔍 Development mode check:', {
    isPackaged: app.isPackaged,
    nodeEnv: process.env.NODE_ENV,
    hasDevArg: process.argv.includes('--dev'),
    finalIsDevMode: isDevMode
  });
  
  if (isDevMode) {
    console.log('🚀 RUNNING IN DEVELOPMENT MODE - Loading from Vite dev server');
    const { getUrls } = require('./config/urls.cjs');
    const urls = getUrls();
    
    console.log('Loading development server at', urls.FRONTEND_DEV);
    mainWindow.loadURL(urls.FRONTEND_DEV).catch(err => {
      console.error('Failed to load development server:', err);
      // Fallback to loading production build if dev server fails - check if window still exists
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(fallbackErr => {
          console.error('Failed to load fallback:', fallbackErr);
        });
      } else {
        console.warn('Window was destroyed before fallback could be loaded');
      }
    });
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    console.log('📦 RUNNING IN PRODUCTION MODE - Loading from dist build');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Add error handling for failed loads
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load URL:', validatedURL, 'Error:', errorDescription);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App event listeners - consolidated initialization
app.whenReady().then(async () => {
  console.log('🚀 [STARTUP] App is ready, initializing...');
  
  console.log('🪟 [STARTUP] Creating main window...');
  createWindow();
  
  // Initialize storage and other services
  console.log('📦 [STARTUP] Initializing storage manager...');
  try {
    await storageManager.initialize();
    console.log('✅ [STARTUP] Storage manager initialized');
    
    // Initialize AI service
    console.log('🔧 [STARTUP] Loading AI settings...');
    const settingsResult = await storageManager.loadSettings();
    console.log('📊 [STARTUP] Settings load result:', {
      success: settingsResult.success,
      hasSettings: !!settingsResult.settings,
      hasOpenAI: !!settingsResult.settings?.openaiApiKey,
      hasGemini: !!settingsResult.settings?.geminiApiKey,
      activeService: settingsResult.settings?.selectedAiService
    });
    
    console.log('🔧 [STARTUP] Initializing AI service from settings...');
    if (typeof initializeAIFromSettings === 'function') {
      const aiResult = await initializeAIFromSettings(settingsResult.settings);
      console.log('🔧 [STARTUP] AI service initialization result:', aiResult);
    } else {
      console.log('🔧 [STARTUP] AI service initialization result: { success: false }');
    }
  } catch (error) {
    console.error('❌ [STARTUP] Error during app initialization:', error.message);
  }
  
  console.log('✅ [STARTUP] App initialization complete');
});


// Log when HTTP handlers are registered
console.log('🚀 HTTP Request handlers registered:', [
  'http-request',
  'ai-api-request', 
  'agent-api-request'
].join(', '));

app.on('window-all-closed', async () => {
  // Clean up resources before quitting
  await performCleanup();
  
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


// Handle app termination
app.on('before-quit', async (event) => {
  console.log('🛑 App is about to quit, performing cleanup...');
  event.preventDefault(); // Prevent immediate quit
  
  await performCleanup();
  app.exit(0); // Force quit after cleanup
});

// Handle process termination signals
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, performing cleanup...');
  await performCleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, performing cleanup...');
  await performCleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught exception:', error);
  await performCleanup();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  await performCleanup();
  process.exit(1);
});

// Initialize services
dbConnection = new ConnectionManager();
if (AIServiceManager) {
  aiService = new AIServiceManager();
} else {
  // Fallback stub to keep IPC handlers functional when AI is removed
  aiService = {
    configure: () => ({ success: false, error: 'AI disabled in Electron' }),
    setActiveService: () => ({ success: false, error: 'AI disabled in Electron' }),
    getStatus: () => ({
      isReady: false,
      activeService: null,
      configuredServices: [],
      configurations: { openai: { isConfigured: false }, gemini: { isConfigured: false } }
    }),
    removeConfiguration: () => ({ success: false, error: 'AI disabled in Electron' }),
    generateQuery: async () => ({ success: false, error: 'AI disabled in Electron' }),
    explainQuery: async () => ({ success: false, error: 'AI disabled in Electron' }),
    validateFieldValues: async () => ({ success: false, error: 'AI disabled in Electron', fieldValues: [], hasFieldValues: false }),
    validateParameters: async () => ({ success: false, error: 'AI disabled in Electron', parametersToValidate: [], hasParameters: false }),
    checkFieldPerformance: async () => ({ success: false, error: 'AI disabled in Electron', hasIndex: false, collectionSizeBytes: 0, shouldWarn: false }),
    getFieldValues: async () => ({ success: false, error: 'AI disabled in Electron', values: [] }),
    refineQueryWithActualValues: async () => ({ success: false, error: 'AI disabled in Electron' }),
    replaceWithManualValues: () => ({ success: false, error: 'AI disabled in Electron' }),
    replaceParametersWithValues: () => ({ success: false, error: 'AI disabled in Electron' }),
    formatQuery: async () => ({ success: false, error: 'AI disabled in Electron' }),
    fixQuery: async () => ({ success: false, error: 'AI disabled in Electron' }),
    isReady: () => false,
    initializeFromSettings: () => ({ success: false })
  };
}
storageManager = new StorageManager();
spreadsheetService = new SpreadsheetService(dbConnection);

// Set up database connection with settings storage
dbConnection.setSettingsStorage(storageManager);

// Load saved AI configurations on startup
app.whenReady().then(async () => {
  console.log('🚀 App is ready, initializing services...');
  
  // Initialize storage system and perform migration if needed
  console.log('📦 Initializing storage manager...');
  await storageManager.initialize();
  console.log('✅ Storage manager initialized');
  
  // Load AI settings
  console.log('🔧 Loading AI settings...');
  const result = await storageManager.loadSettings();
  console.log('📊 Settings load result:', {
    success: result.success,
    hasSettings: !!result.settings,
    hasOpenAI: !!result.settings?.openaiApiKey,
    hasGemini: !!result.settings?.geminiApiKey,
    activeService: result.settings?.activeAIService
  });
  
  if (result.success && result.settings) {
    console.log('🔧 Initializing AI service from settings...');
    const initResult = aiService.initializeFromSettings(result.settings);
    console.log('🔧 AI service initialization result:', initResult);
  } else {
    console.log('⚠️ No settings found or settings load failed');
  }
  
  // console.log('✅ App initialization complete'); // Reduced logging for performance
});

// IPC handlers
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

// Database IPC handlers
ipcMain.handle('db-connect', async (event, connectionString, options) => {
  try {
    const result = await dbConnection.connect(connectionString, options);
    return result;
  } catch (error) {
    console.error('Connection failed:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-disconnect', async (event, connectionId) => {
  try {
    const result = await dbConnection.disconnect(connectionId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-list-databases', async (event, connectionId) => {
  try {
    const result = await dbConnection.listDatabases(connectionId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-list-collections', async (event, connectionId, databaseName, options = {}) => {
  try {
    const result = await dbConnection.listCollections(connectionId, databaseName, options);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-connection-options', async (event, connectionId) => {
  try {
    const options = dbConnection.getConnectionOptions(connectionId);
    return { success: true, options };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-create-database', async (event, connectionId, databaseName) => {
  try {
    const result = await dbConnection.createDatabase(connectionId, databaseName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-execute-query', async (event, connectionId, query, options) => {
  try {
    const { database, collection, operation, queryData } = query;
    const result = await dbConnection.executeQuery(connectionId, database, collection, operation, queryData, options);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-schema', async (event, connectionId, databaseName, collectionName) => {
  try {
    const result = await dbConnection.getSchema(connectionId, databaseName, collectionName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-collection-stats', async (event, connectionId, databaseName, collectionName) => {
  try {
    const result = await dbConnection.getCollectionStats(connectionId, databaseName, collectionName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-status', async (event) => {
  return dbConnection.getConnectionStatus();
});

ipcMain.handle('db-execute-raw-query', async (event, conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = null) => {
  try {
    // Get default timeout from settings if not provided
    let finalTimeout = timeoutSeconds;
    
    // Check if timeout was provided (not null and not undefined)
    if (finalTimeout === null || finalTimeout === undefined) {
      try {
        const settingsResult = await storageManager.settings.loadSettings();
        if (settingsResult.success && settingsResult.settings && settingsResult.settings.queryTimeout) {
          finalTimeout = settingsResult.settings.queryTimeout;
        } else {
          finalTimeout = 60; // fallback default
        }
      } catch (error) {
        console.warn('Could not load timeout from settings, using default:', error);
        finalTimeout = 60; // fallback default
      }
    }

    // Heuristic to decide if the input is a multi-statement MongoDB script (needs stdout capture)
    const isLikelyScript = (text) => {
      if (!text || typeof text !== 'string') return false;
      const t = text.trim();
      // Fast checks
      if (t.includes('// MongoDB Script') || t.includes('/* MongoDB Script */')) return true;
      if (t.includes('var adminDB = db.getSiblingDB')) return true;
      if (t.includes('print(') || t.includes('console.log(')) return true;
      if (/\b(use|function|var|let|const)\b/.test(t)) return true;
      // Multiple statements or lines often indicate a script
      const hasManySemicolons = (t.match(/;/g) || []).length >= 2;
      if (hasManySemicolons) return true;
      // Looks like a pipeline/aggregation assignment or flow control
      if (/\b(for|while|if|switch|try)\b/.test(t)) return true;
      // Default: treat single-expression queries as raw queries
      return false;
    };

    if (isLikelyScript(queryString)) {
      console.log('🚀 Detected script-like input, using executeScript method');
      const result = await dbConnection.executeScript(conversationId, connectionId, databaseName, queryString, operationId, finalTimeout);
      return result;
    }

    const result = await dbConnection.executeRawQuery(conversationId, connectionId, databaseName, queryString, operationId, finalTimeout);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle shell status debugging
ipcMain.handle('db-get-shell-status', async (event) => {
  try {
    return {
      success: true,
      status: dbConnection.shellManager.getShellStatus()
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handle query cancellation
ipcMain.handle('db-cancel-operation', async (event, operationId) => {
  try {
    const result = await dbConnection.cancelOperation(operationId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Enhanced database duplication with method selection
ipcMain.handle('db-duplicate-database-with-method', async (event, targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, method = 'auto') => {
  try {
    const result = await dbConnection.duplicateDatabaseWithMethod(
      targetConnectionId, 
      sourceDatabaseName, 
      targetDatabaseName,
      sourceConnectionId,
      method,
      (progress) => {
        // Send progress updates to renderer
        event.sender.send('db-duplicate-progress', progress);
      }
    );
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Legacy database duplication (for backward compatibility)
ipcMain.handle('db-duplicate-database', async (event, targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null) => {
  try {
    const result = await dbConnection.duplicateDatabase(
      targetConnectionId, 
      sourceDatabaseName, 
      targetDatabaseName,
      sourceConnectionId,
      (progress) => {
        // Send progress updates to renderer
        event.sender.send('db-duplicate-progress', progress);
      }
    );
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Check available database tools
ipcMain.handle('db-check-tools-availability', async (event) => {
  try {
    const availability = await dbConnection.checkDumpRestoreAvailability();
    return {
      success: true,
      tools: {
        mongodump: availability.available,
        mongorestore: availability.available,
        dumpRestoreAvailable: availability.available
      },
      error: availability.error
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tools: {
        mongodump: false,
        mongorestore: false,
        dumpRestoreAvailable: false
      }
    };
  }
});

// ===== DATABASE EXPORT HANDLERS =====

ipcMain.handle('db-export', async (event, options, operationId = null) => {
  try {
    const result = await dbConnection.exportDatabase(
      options,
      (progress) => {
        event.sender.send('db-export-progress', { operationId, progress });
      },
      operationId
    );
    return { success: true, ...result };
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-check-export-tools-availability', async (event, connectionId = null) => {
  try {
    const availability = await dbConnection.checkExportToolsAvailability(connectionId);
    return {
      success: true,
      tools: availability.tools || availability,
      binariesStatus: availability.binariesStatus
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      tools: {
        mongodump: false,
        mongoexport: false,
        pg_dump: false,
        customExport: true
      }
    };
  }
});

ipcMain.handle('db-get-collections-for-export', async (event, connectionId, databaseName) => {
  try {
    const collections = await dbConnection.getCollectionsForExport(connectionId, databaseName);
    return { success: true, collections };
  } catch (error) {
    return { success: false, error: error.message, collections: [] };
  }
});

ipcMain.handle('db-get-collection-metadata', async (event, connectionId, databaseName, collectionName) => {
  try {
    const metadata = await dbConnection.getCollectionMetadata(connectionId, databaseName, collectionName);
    return { success: true, metadata };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-select-export-path', async (event, options = {}) => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: options.title || 'Select Export Location',
      defaultPath: options.defaultPath || require('electron').app.getPath('downloads'),
      buttonLabel: 'Select Folder'
    });

    if (result.canceled) {
      return { success: false, cancelled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-cancel-export', async (event, operationId) => {
  try {
    const cancelled = await dbConnection.cancelExportOperation(operationId);
    return { success: true, cancelled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ===== DATABASE IMPORT HANDLERS =====

ipcMain.handle('db-import', async (event, options, operationId = null) => {
  try {
    console.log('📥 Starting import:', { connectionId: options.connectionId, database: options.databaseName, format: options.format, files: options.files.length });
    
    const result = await dbConnection.importDatabase(
      options.connectionId,
      options,
      (progress) => {
        event.sender.send('db-import-progress', { operationId, progress });
      },
      operationId
    );
    
    console.log('✅ Import completed successfully:', result);
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Import error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-check-import-tools-availability', async (event, connectionId = null) => {
  try {
    const result = await dbConnection.checkImportToolsAvailability(connectionId);
    return {
      success: true,
      tools: result.tools || result,
      binariesStatus: result.binariesStatus
    };
  } catch (error) {
    console.error('Error checking import tools:', error);
    return {
      success: false,
      error: error.message,
      tools: {
        mongoimport: false,
        mongorestore: false
      }
    };
  }
});

// PostgreSQL client tools management
ipcMain.handle('db-download-pg-tools', async (event) => {
  try {
    const result = await dbConnection.downloadPgTools((progress) => {
      // Send progress updates to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pg-tools-download-progress', progress);
      }
    });
    return result;
  } catch (error) {
    console.error('Error downloading PostgreSQL tools:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('db-get-pg-tools-status', async (event) => {
  try {
    const result = await dbConnection.getPgToolsStatus();
    return result;
  } catch (error) {
    console.error('Error getting PostgreSQL tools status:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('db-remove-pg-tools', async (event) => {
  try {
    const result = await dbConnection.removePgTools();
    return result;
  } catch (error) {
    console.error('Error removing PostgreSQL tools:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('db-select-import-files', async (event, options = {}) => {
  try {
    const { dialog } = require('electron');
    const filters = [];
    
    // Add file type filters based on format
    if (options.format === 'json') {
      filters.push({ name: 'JSON Files', extensions: ['json', 'jsonl'] });
    } else if (options.format === 'csv') {
      filters.push({ name: 'CSV Files', extensions: ['csv'] });
    } else if (options.format === 'bson') {
      filters.push({ name: 'BSON Files', extensions: ['bson'] });
    } else if (options.format === 'mongodump' || options.format === 'archive') {
      filters.push({ name: 'Archive Files', extensions: ['archive', 'gz', 'agz'] });
    } else if (options.format === 'pg_restore' || options.format === 'sql') {
      // PostgreSQL formats
      filters.push(
        { name: 'SQL Files', extensions: ['sql'] },
        { name: 'PostgreSQL Dump', extensions: ['dump', 'backup', 'pgdump'] }
      );
    } else {
      // Allow all supported formats
      filters.push(
        { name: 'JSON Files', extensions: ['json', 'jsonl'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'SQL Files', extensions: ['sql'] },
        { name: 'BSON Files', extensions: ['bson'] },
        { name: 'Archive Files', extensions: ['archive', 'gz', 'agz'] }
      );
    }
    
    filters.push({ name: 'All Files', extensions: ['*'] });

    const result = await dialog.showOpenDialog({
      properties: options.format === 'archive' ? ['openFile'] : ['openFile', 'multiSelections'],
      title: options.title || 'Select Files to Import',
      defaultPath: options.defaultPath || require('electron').app.getPath('downloads'),
      buttonLabel: 'Select',
      filters
    });

    if (result.canceled) {
      return { success: false, cancelled: true };
    }

    // Return file paths and names
    const files = result.filePaths.map(filePath => ({
      path: filePath,
      name: require('path').basename(filePath)
    }));

    return { success: true, files };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-select-import-directory', async (event, options = {}) => {
  try {
    const { dialog } = require('electron');
    const fs = require('fs');
    const path = require('path');
    
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: options.title || 'Select mongodump Directory',
      defaultPath: options.defaultPath || require('electron').app.getPath('downloads'),
      buttonLabel: 'Select Folder'
    });

    if (result.canceled) {
      return { success: false, cancelled: true };
    }

    const dirPath = result.filePaths[0];
    
    // Scan for BSON files in the directory
    const scanForBsonFiles = (scanPath) => {
      const bsonFiles = [];
      try {
        const entries = fs.readdirSync(scanPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isFile()) {
            const fileName = entry.name;
            if (fileName.endsWith('.bson') || fileName.endsWith('.bson.gz')) {
              // Extract collection name (remove .bson or .bson.gz extension)
              const collectionName = fileName
                .replace(/\.bson\.gz$/, '')
                .replace(/\.bson$/, '');
              bsonFiles.push(collectionName);
            }
          }
        }
      } catch (err) {
        console.error('Error scanning directory:', err);
      }
      return bsonFiles;
    };
    
    // First, try to find BSON files in the selected directory
    let bsonFiles = scanForBsonFiles(dirPath);
    let actualPath = dirPath;
    
    // If no BSON files found, check subdirectories (mongodump creates a db-name subdirectory)
    if (bsonFiles.length === 0) {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDirPath = path.join(dirPath, entry.name);
            const subBsonFiles = scanForBsonFiles(subDirPath);
            if (subBsonFiles.length > 0) {
              bsonFiles = subBsonFiles;
              actualPath = subDirPath;
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error scanning subdirectories:', err);
      }
    }
    
    console.log(`📂 Found ${bsonFiles.length} BSON files in ${actualPath}`);
    
    return { 
      success: true, 
      path: actualPath,
      collections: bsonFiles
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-cancel-import', async (event, operationId) => {
  try {
    const cancelled = await dbConnection.cancelImportOperation(operationId);
    return { success: true, cancelled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Cancel an active operation - REMOVED DUPLICATE HANDLER
// This handler already exists at line 340-347

ipcMain.handle('db-duplicate-collection', async (event, targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null) => {
  try {
    const result = await dbConnection.duplicateCollection(
      targetConnectionId, 
      sourceDatabaseName, 
      sourceCollectionName, 
      targetDatabaseName, 
      targetCollectionName,
      sourceConnectionId,
      (progress) => {
        // Send progress updates to renderer
        event.sender.send('db-duplicate-collection-progress', progress);
      }
    );
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-delete-database', async (event, connectionId, databaseName) => {
  try {
    const result = await dbConnection.deleteDatabase(connectionId, databaseName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-rename-database', async (event, connectionId, oldDatabaseName, newDatabaseName) => {
  try {
    // Set up progress callback
    const progressCallback = (progress) => {
      event.sender.send('db-rename-progress', progress);
    };
    
    const result = await dbConnection.renameDatabase(connectionId, oldDatabaseName, newDatabaseName, progressCallback);
    return result;
  } catch (error) {
    console.error('Error renaming database:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-delete-collection', async (event, connectionId, databaseName, collectionName) => {
  try {
    const result = await dbConnection.deleteCollection(connectionId, databaseName, collectionName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// AI IPC handlers
ipcMain.handle('ai-configure', async (event, serviceType, apiKey) => {
  try {
    const result = aiService.configure(serviceType, apiKey);
    if (result.success) {
      // Load current settings first
      const currentSettings = await storageManager.loadSettings();
      const settings = currentSettings.success ? currentSettings.settings : {};
      
      // Save the API key securely with the service type
      if (serviceType === 'openai') {
        settings.openaiApiKey = apiKey;
      } else if (serviceType === 'gemini') {
        settings.geminiApiKey = apiKey;
      }
      
      // Save active service
      const status = aiService.getStatus();
      settings.activeAIService = status.activeService;
      
      await storageManager.saveSettings(settings);
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set active AI service
ipcMain.handle('ai-set-active-service', async (event, serviceType) => {
  try {
    const result = aiService.setActiveService(serviceType);
    if (result.success) {
      // Save active service to settings
      const currentSettings = await storageManager.loadSettings();
      const settings = currentSettings.success ? currentSettings.settings : {};
      settings.activeAIService = serviceType;
      await storageManager.saveSettings(settings);
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get AI service status
ipcMain.handle('ai-get-service-status', async (event) => {
  try {
    return aiService.getStatus();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Remove AI service configuration
ipcMain.handle('ai-remove-configuration', async (event, serviceType) => {
  try {
    const result = aiService.removeConfiguration(serviceType);
    if (result.success) {
      // Remove API key from settings
      const currentSettings = await storageManager.loadSettings();
      const settings = currentSettings.success ? currentSettings.settings : {};
      
      if (serviceType === 'openai') {
        delete settings.openaiApiKey;
      } else if (serviceType === 'gemini') {
        delete settings.geminiApiKey;
      }
      
      // Update active service
      const status = aiService.getStatus();
      settings.activeAIService = status.activeService;
      
      await storageManager.saveSettings(settings);
    }
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-generate-query', async (event, prompt, schema, databaseName, collectionName, collectionSchemas) => {
  try {
    console.log('🔧 ai-generate-query handler called');
    console.log('🔧 AI service status:', aiService.getStatus());
    
    // Check if AI service is ready, if not, try to reinitialize
    if (!aiService.isReady()) {
      console.log('⚠️ AI service not ready, attempting to reinitialize...');
      const result = await storageManager.loadSettings();
      if (result.success && result.settings) {
        aiService.initializeFromSettings(result.settings);
        console.log('🔧 Reinitialized AI service status:', aiService.getStatus());
      }
    }
    
    // Get the query limit from database connection settings
    const queryLimit = await dbConnection.getQueryLimit();
    
    const result = await aiService.generateQuery(prompt, schema, databaseName, collectionName, collectionSchemas, queryLimit);

    return result;
  } catch (error) {
    console.error('Error in query generation:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-explain-query', async (event, query) => {
  try {
    const result = await aiService.explainQuery(query);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Field value validation endpoints
console.log('Registering ai-validate-field-values handler');
ipcMain.handle('ai-validate-field-values', async (event, queryString, collectionSchemas) => {
  try {
    console.log('ai-validate-field-values handler called with:', { queryString, collectionSchemas });
    const result = await aiService.validateFieldValues(queryString, collectionSchemas);
    console.log('ai-validate-field-values result:', result);
    return result;
  } catch (error) {
    console.error('Error validating field values:', error);
    return { success: false, error: error.message };
  }
});

// NEW: Parameter validation endpoint
console.log('Registering ai-validate-parameters handler');
ipcMain.handle('ai-validate-parameters', async (event, parameters, collectionSchemas) => {
  try {
    console.log('ai-validate-parameters handler called with:', { parameters, collectionSchemas });
    const result = await aiService.validateParameters(parameters, collectionSchemas);
    console.log('ai-validate-parameters result:', result);
    return result;
  } catch (error) {
    console.error('Error validating parameters:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-check-field-performance', async (event, connectionId, databaseName, collection, field) => {
  try {
    const result = await aiService.checkFieldPerformance(connectionId, databaseName, collection, field, dbConnection);
    return result;
  } catch (error) {
    console.error('Error checking field performance:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-get-field-values', async (event, connectionId, databaseName, collection, field) => {
  try {
    const result = await aiService.getFieldValues(connectionId, databaseName, collection, field, dbConnection);
    return result;
  } catch (error) {
    console.error('Error getting field values:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-refine-query-with-actual-values', async (event, originalQuery, fieldsWithValues, originalPrompt, collectionSchemas, databaseName) => {
  try {
    const result = await aiService.refineQueryWithActualValues(
      originalQuery,
      fieldsWithValues,
      originalPrompt,
      collectionSchemas,
      databaseName
    );
    return result;
  } catch (error) {
    console.error('Error refining query with actual values:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-replace-with-manual-values', async (event, originalQuery, fieldsWithValues) => {
  try {
    const result = aiService.replaceWithManualValues(originalQuery, fieldsWithValues);
    return result;
  } catch (error) {
    console.error('Error replacing with manual values:', error);
    return { success: false, error: error.message };
  }
});

// NEW: Parameter replacement endpoint
ipcMain.handle('ai-replace-parameters-with-values', async (event, originalQuery, parametersWithValues) => {
  try {
    const result = aiService.replaceParametersWithValues(originalQuery, parametersWithValues);
    return result;
  } catch (error) {
    console.error('Error replacing parameters with values:', error);
    return { success: false, error: error.message };
  }
});

// Cache functionality removed for simplicity

ipcMain.handle('ai-format-query', async (event, query) => {
  try {
    const result = await aiService.formatQuery(query);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Fix query based on error
ipcMain.handle('ai-fix-query', async (event, originalQuery, errorMessage, databaseName, collectionSchemas) => {
  try {
    const result = await aiService.fixQuery(originalQuery, errorMessage, databaseName, collectionSchemas);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-status', async (event) => {
  return aiService.getStatus();
});

// Storage IPC handlers
const { prepareSettingsForContextBridge, prepareDashboardsForContextBridge, prepareConversationsForContextBridge } = require('./utils/contextBridgeSerializer');

ipcMain.handle('storage-save-settings', async (event, settings) => {
  try {
    const result = await storageManager.saveSettings(settings);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-settings', async (event) => {
  try {
    const result = await storageManager.loadSettings();
    
    // If successful, serialize the settings to prevent contextBridge recursion errors
    if (result.success && result.settings) {
      result.settings = prepareSettingsForContextBridge(result.settings);
    }
    
    return result;
  } catch (error) {
    console.error('Error in storage-load-settings handler:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-save-history', async (event, historyItem) => {
  try {
    const result = await storageManager.saveHistory(historyItem);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-history', async (event) => {
  try {
    const result = await storageManager.loadHistory();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-save-favorite', async (event, favorite) => {
  try {
    const result = await storageManager.saveFavorite(favorite);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-favorites', async (event) => {
  try {
    const result = await storageManager.loadFavorites();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App state IPC handlers
ipcMain.handle('storage-save-app-state', async (event, appState) => {
  try {
    const result = await storageManager.saveAppState(appState);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-app-state', async (event) => {
  try {
    const result = await storageManager.loadAppState();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-save-connection-state', async (event, connectionState) => {
  try {
    const result = await storageManager.saveConnectionState(connectionState);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-connection-state', async (event) => {
  try {
    const result = await storageManager.loadConnectionState();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-set-last-active-connection', async (event, connectionId) => {
  try {
    const result = await storageManager.setLastActiveConnection(connectionId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-update-last-used-by-connection-string', async (event, connectionString) => {
  try {
    const result = await storageManager.updateLastUsedByConnectionString(connectionString);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-save-conversations', async (event, conversations) => {
  try {
    const result = await storageManager.saveConversations(conversations);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-conversations', async (event) => {
  try {
    const result = await storageManager.loadConversations();
    
    // Serialize conversations to prevent contextBridge recursion errors
    if (result.success && result.conversations) {
      result.conversations = prepareConversationsForContextBridge(result.conversations);
    }
    
    return result;
  } catch (error) {
    console.error('Error in storage-load-conversations handler:', error);
    return { success: false, error: error.message };
  }
});

  // New: clear/reset storage sections
  ipcMain.handle('storage-clear-conversations', async () => {
    try {
      return await storageManager.clearConversations();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('storage-clear-history', async () => {
    try {
      return await storageManager.clearHistory();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('storage-clear-favorites', async () => {
    try {
      return await storageManager.clearFavorites();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('storage-clear-app-state', async () => {
    try {
      return await storageManager.clearAppState();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('storage-clear-connections', async () => {
    try {
      return await storageManager.clearConnections();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('storage-clear-all', async () => {
    try {
      return await storageManager.clearAllData();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Dashboard storage IPC handlers
  ipcMain.handle('dashboard-get-all', async (event) => {
    try {
      const result = await storageManager.getAllDashboards();
      
      // Serialize dashboards to prevent contextBridge recursion errors
      if (result.success && result.dashboards) {
        result.dashboards = prepareDashboardsForContextBridge(result.dashboards);
      }
      
      return result;
    } catch (error) {
      console.error('Error in dashboard-get-all handler:', error);
      return { success: false, dashboards: [], error: error.message };
    }
  });

  ipcMain.handle('dashboard-get', async (event, dashboardId) => {
    try {
      const result = await storageManager.getDashboard(dashboardId);
      
      // Serialize dashboard to prevent contextBridge recursion errors
      if (result.success && result.dashboard) {
        const serialized = prepareDashboardsForContextBridge([result.dashboard]);
        result.dashboard = serialized[0];
      }
      
      return result;
    } catch (error) {
      console.error('Error in dashboard-get handler:', error);
      return { success: false, dashboard: null, error: error.message };
    }
  });

  ipcMain.handle('dashboard-save', async (event, dashboard) => {
    try {
      return await storageManager.saveDashboard(dashboard);
    } catch (error) {
      console.error('Error in dashboard-save handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-delete', async (event, dashboardId) => {
    try {
      return await storageManager.deleteDashboard(dashboardId);
    } catch (error) {
      console.error('Error in dashboard-delete handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-get-settings', async (event) => {
    try {
      return await storageManager.getDashboardSettings();
    } catch (error) {
      console.error('Error in dashboard-get-settings handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-save-settings', async (event, settings) => {
    try {
      return await storageManager.saveDashboardSettings(settings);
    } catch (error) {
      console.error('Error in dashboard-save-settings handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-update-layout', async (event, dashboardId, layout) => {
    try {
      return await storageManager.updateDashboardLayout(dashboardId, layout);
    } catch (error) {
      console.error('Error in dashboard-update-layout handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-add-widget', async (event, dashboardId, widget) => {
    try {
      return await storageManager.addWidgetToDashboard(dashboardId, widget);
    } catch (error) {
      console.error('Error in dashboard-add-widget handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-update-widget', async (event, dashboardId, widgetId, updates) => {
    try {
      return await storageManager.updateWidget(dashboardId, widgetId, updates);
    } catch (error) {
      console.error('Error in dashboard-update-widget handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-remove-widget', async (event, dashboardId, widgetId) => {
    try {
      return await storageManager.removeWidgetFromDashboard(dashboardId, widgetId);
    } catch (error) {
      console.error('Error in dashboard-remove-widget handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-cleanup', async (event) => {
    try {
      return await storageManager.cleanupDashboardSettings();
    } catch (error) {
      console.error('Error in dashboard-cleanup handler:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('dashboard-create-default', async (event) => {
    try {
      return await storageManager.createDefaultDashboard();
    } catch (error) {
      console.error('Error in dashboard-create-default handler:', error);
      return { success: false, error: error.message };
    }
  });


// Schema indexing IPC handlers
ipcMain.handle('db-generate-collection-index', async (event, connectionId, databaseName, silent = false) => {
  try {
    console.log(`📊 [MAIN.JS] Starting schema generation for ${databaseName} ${silent ? '(silent mode)' : ''}`);
    const result = await dbConnection.generateCollectionIndex(connectionId, databaseName, silent, mainWindow);
    
    console.log(`📊 [MAIN.JS] Schema generation result:`, {
      success: result.success,
      schemasCount: result.schemas ? Object.keys(result.schemas).length : 0,
      hasMetadata: !!result.metadata,
      metadataCollections: result.metadata?.collections?.length || 0
    });
    
    if (result.success) {
      // Save schemas and metadata together
      console.log(`💾 [MAIN.JS] Saving to storage...`, {
        databaseName,
        schemasCount: Object.keys(result.schemas).length,
        metadata: result.metadata ? 'YES' : 'NO',
        metadataCollections: result.metadata?.collections?.length || 0
      });
      
      console.log(`💾 [MAIN.JS] Actual result.metadata value:`, result.metadata);
      console.log(`💾 [MAIN.JS] typeof result.metadata:`, typeof result.metadata);
      console.log(`💾 [MAIN.JS] result.metadata is null:`, result.metadata === null);
      console.log(`💾 [MAIN.JS] result.metadata is undefined:`, result.metadata === undefined);
      
      await storageManager.saveCollectionSchemas(databaseName, result.schemas, result.metadata);
      console.log(`✅ [MAIN.JS] Saved schemas${result.metadata ? ' and metadata' : ''} for ${databaseName}`);
    }
    return result;
  } catch (error) {
    console.error('❌ [MAIN.JS] Schema generation failed:', error.message);
    return { success: false, error: error.message };
  }
});

// Schema storage IPC handlers
ipcMain.handle('storage-save-collection-schemas', async (event, databaseName, schemas, metadata = null) => {
  try {
    const result = await storageManager.saveCollectionSchemas(databaseName, schemas, metadata);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-load-collection-schemas', async (event, databaseName) => {
  try {
    const result = await storageManager.loadCollectionSchemas(databaseName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('storage-clear-all-collection-schemas', async (event) => {
  try {
    const result = await storageManager.clearAllCollectionSchemas();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-load-collection-schemas', async (event, databaseName) => {
  try {
    const result = await storageManager.loadCollectionSchemas(databaseName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Index management IPC handlers
ipcMain.handle('db-create-index', async (event, connectionId, databaseName, collectionName, keys, options) => {
  try {
    const result = await dbConnection.createIndex(connectionId, databaseName, collectionName, keys, options);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-drop-index', async (event, connectionId, databaseName, collectionName, indexName) => {
  try {
    const result = await dbConnection.dropIndex(connectionId, databaseName, collectionName, indexName);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-identify-collections', async (event, prompt, collectionSchemas) => {
  try {
    console.log('Identifying collections for:', { prompt });
    console.log('Available schemas:', collectionSchemas);
    const result = await aiService.identifyRelevantCollections(prompt, collectionSchemas);

    return result;
  } catch (error) {
    console.error('Error in collection identification:', error);
    return { success: false, error: error.message };
  }
});

// Shell operations (for opening external links)
ipcMain.handle('shell-open-external', async (event, url) => {
  try {
    // Validate URL to ensure it's safe to open
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL provided' };
    }
    
    // Only allow HTTP/HTTPS URLs for security
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { success: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }
    
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Error opening external URL:', error);
    return { success: false, error: error.message };
  }
});

// Export operations
ipcMain.handle('export-csv', async (event, data, filename) => {
  try {
    // Validate input
    if (!data || !Array.isArray(data)) {
      return { success: false, error: 'Invalid data provided - must be an array' };
    }
    
    if (!filename || typeof filename !== 'string') {
      return { success: false, error: 'Invalid filename provided' };
    }
    
    if (data.length === 0) {
      return { success: false, error: 'No data to export' };
    }
    
    // Show native save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save CSV Export',
      defaultPath: path.join(app.getPath('documents'), filename),
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['createDirectory']
    });
    
    // Check if user cancelled
    if (result.canceled) {
      return { success: false, error: 'Export cancelled by user', cancelled: true };
    }
    
    const filePath = result.filePath;
    
    // Convert JSON data to CSV
    const csvContent = convertToCSV(data);
    
    // Write CSV file
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    return { 
      success: true, 
      filePath: filePath,
      recordCount: data.length 
    };
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return { success: false, error: error.message };
  }
});

// Shared HTTP request helper
async function performHttpRequest(event, options) {
  const { method, url, headers, body, timeout = 30000 } = options || {};
  const requestId = Math.random().toString(36).substr(2, 9);

  console.log(`🌐 [${requestId}] HTTP Request initiated:`, {
    method,
    url,
    hasBody: !!body,
    bodySize: body ? JSON.stringify(body).length : 0,
    timestamp: new Date().toISOString(),
    rendererProcessId: event?.processId
  });

  try {
    const fetch = require('node-fetch');

    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Agent-M/1.0 (Electron)',
      ...headers
    };

    const requestOptions = {
      method: method || 'GET',
      headers: requestHeaders,
      timeout
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      requestOptions.body = JSON.stringify(body);
    }

    console.log(`📤 [${requestId}] Sending request with options:`, {
      method: requestOptions.method,
      url,
      hasBody: !!requestOptions.body,
      timeout: requestOptions.timeout
    });

    const startTime = Date.now();
    const response = await fetch(url, requestOptions);
    const responseTime = Date.now() - startTime;

    console.log(`📥 [${requestId}] Response received:`, {
      status: response.status,
      statusText: response.statusText,
      responseTime: `${responseTime}ms`,
      url
    });

    const contentType = response.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    console.log(`📋 [${requestId}] Response data summary:`, {
      status: response.status,
      dataType: typeof responseData,
      dataSize: typeof responseData === 'string' ? responseData.length : JSON.stringify(responseData).length,
      url,
      responseTime: `${responseTime}ms`
    });

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
      responseTime
    };
  } catch (error) {
    console.error(`❌ [${requestId}] HTTP Request failed:`, {
      method,
      url,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      rendererProcessId: event?.processId
    });

    return {
      success: false,
      error: error.message,
      status: 0,
      data: null
    };
  }
}

// HTTP request handlers for external API calls
ipcMain.handle('http-request', async (event, options) => {
  return performHttpRequest(event, options);
});

// Specific AI API request handlers for backward compatibility
ipcMain.handle('ai-api-request', async (event, endpoint, options = {}) => {
  const { method = 'GET', body, headers = {}, timeout } = options;

  // Get backend URL using centralized configuration
  const { getBackendUrl } = require('../config/urls.cjs');
  
  let settings = null;
  try {
    const settingsResult = await storageManager.loadSettings();
    if (settingsResult.success) {
      settings = settingsResult.settings;
    }
  } catch (error) {
    console.warn('Failed to load settings:', error.message);
  }
  
  const backendUrl = getBackendUrl(settings);

  const url = `${backendUrl}/api/v1/ai${endpoint}`;

  console.log('🤖 AI API Request:', {
    endpoint,
    fullUrl: url,
    method,
    hasBody: !!body,
    timestamp: new Date().toISOString()
  });

  return performHttpRequest(event, { method, url, headers, body, timeout });
});

// Agent API request handler
ipcMain.handle('agent-api-request', async (event, endpoint, options = {}) => {
  const { method = 'GET', body, headers = {}, timeout } = options;

  // Get backend URL using centralized configuration
  const { getBackendUrl } = require('../config/urls.cjs');
  
  let settings = null;
  try {
    const settingsResult = await storageManager.loadSettings();
    if (settingsResult.success) {
      settings = settingsResult.settings;
    }
  } catch (error) {
    console.warn('Failed to load settings:', error.message);
  }
  
  const backendUrl = getBackendUrl(settings);

  const url = `${backendUrl}/api/v1/agent${endpoint}`;

  console.log('🧠 Agent API Request:', {
    endpoint,
    fullUrl: url,
    method,
    hasBody: !!body,
    timestamp: new Date().toISOString()
  });

  return performHttpRequest(event, { method, url, headers, body, timeout });
});

// Spreadsheet IPC handlers
ipcMain.handle('spreadsheet:analyze', async (event, filePath, connectionId = null) => {
  try {
    const validation = spreadsheetService.validateFile(filePath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Pass connectionId for database type detection (for correct AI analysis)
    console.log(`📊 Main: Analyzing spreadsheet for connection: ${connectionId || 'none'}`);
    const result = await spreadsheetService.processSpreadsheetToDatabase(filePath, connectionId, null, { 
      previewOnly: true
    });
    return { success: true, ...result };
  } catch (error) {
    console.error('Spreadsheet analysis failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:analyze-buffer', async (event, buffer, fileName, connectionId = null) => {
  try {
    console.log('📊 Main: Received buffer analysis request for:', fileName);
    console.log(`📊 Main: Connection ID for analysis: ${connectionId || 'none'}`);
    
    // Pass connectionId for database type detection (for correct AI analysis)
    const result = await spreadsheetService.processSpreadsheetToDatabaseFromBuffer(Buffer.from(buffer), fileName, connectionId, null, { 
      previewOnly: true
    });
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Main: Buffer analysis error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:check-database-conflict', async (event, connectionId, databaseName) => {
  try {
    const result = await spreadsheetService.checkDatabaseNameConflict(connectionId, databaseName);
    return { success: true, ...result };
  } catch (error) {
    console.error('Database conflict check failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:generate-alternative-names', async (event, baseName, existingDatabases) => {
  try {
    const suggestions = spreadsheetService.generateAlternativeNames(baseName, existingDatabases);
    return { success: true, suggestions };
  } catch (error) {
    console.error('Alternative name generation failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:process', async (event, filePath, connectionId, database, options = {}) => {
  try {
    const validation = spreadsheetService.validateFile(filePath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const result = await spreadsheetService.processSpreadsheetToDatabase(
      filePath, 
      connectionId, 
      database,
      {
        ...options,
        onProgress: (progress) => {
          // Send progress updates to renderer
          event.sender.send('spreadsheet:progress', progress);
        }
      }
    );
    
    return { success: true, ...result };
  } catch (error) {
    console.error('Spreadsheet processing failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:create-with-design', async (event, filePath, aiDesign, connectionId, database, options = {}) => {
  try {
    const validation = spreadsheetService.validateFile(filePath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const result = await spreadsheetService.createDatabaseWithExistingDesign(
      filePath, 
      aiDesign,
      connectionId, 
      database,
      {
        ...options,
        onProgress: (progress) => {
          // Send progress updates to renderer
          event.sender.send('spreadsheet:progress', progress);
        }
      }
    );
    
    return { success: true, ...result };
  } catch (error) {
    console.error('Spreadsheet creation with existing design failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:create-with-design-buffer', async (event, buffer, fileName, aiDesign, connectionId, database, options = {}) => {
  try {
    console.log('📊 Main: Received buffer database creation request for:', fileName);
    
    const result = await spreadsheetService.createDatabaseWithExistingDesignFromBuffer(
      Buffer.from(buffer), 
      fileName,
      aiDesign,
      connectionId, 
      database,
      {
        ...options,
        onProgress: (progress) => {
          // Send progress updates to renderer
          event.sender.send('spreadsheet:progress', progress);
        }
      }
    );
    
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Main: Buffer database creation with design failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:create-simple-direct-import', async (event, filePath, connectionId, database, options = {}) => {
  try {
    const validation = spreadsheetService.validateFile(filePath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    console.log('🚀 Main: Starting simple direct import...');
    
    

    // Set up progress callback
    const progressCallback = (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('spreadsheet:progress', progress);
      }
    };

    const result = await spreadsheetService.createDatabaseSimpleDirectImport(
      filePath, 
      connectionId, 
      database, 
      progressCallback
    );

    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Main: Simple direct import failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:validate', async (event, filePath) => {
  try {
    const validation = spreadsheetService.validateFile(filePath);
    return validation;
  } catch (error) {
    return { valid: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:get-file-stats', async (event, filePath) => {
  try {
    const stats = spreadsheetService.fileAnalyzer.getFileStats(filePath);
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:estimate', async (event, filePath) => {
  try {
    const estimate = await spreadsheetService.getFileProcessingEstimate(filePath);
    return { success: true, estimate };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:test-ai', async (event) => {
  try {
    const result = await spreadsheetService.testAIConnection();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('spreadsheet:supported-types', async (event) => {
  try {
    const types = spreadsheetService.getSupportedFileTypes();
    return { success: true, types };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File dialog handler for spreadsheet upload
ipcMain.handle('dialog:open-spreadsheet', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Spreadsheet File',
      filters: [
        { name: 'Spreadsheet Files', extensions: ['xlsx', 'xls', 'csv'] },
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, filePath: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler for dropped files - analyze directly from buffer (no temp file needed)
ipcMain.handle('dialog:analyze-dropped-file', async (event, fileData, fileName) => {
  try {
    console.log(`📁 Analyzing dropped file directly from buffer: "${fileName}"`);
    
    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(fileData);
    
    // Analyze directly from buffer using the file analyzer with progress updates
    const estimate = await spreadsheetService.getFileProcessingEstimateFromBuffer(buffer, fileName, {
      onProgress: (progress) => {
        console.log('📊 Main: Sending progress update:', progress);
        // Send progress updates to renderer for dropped file analysis
        event.sender.send('dialog:analyze-progress', progress);
      }
    });
    
    console.log(`✅ Buffer analysis complete for: "${fileName}"`);
    
    return { success: true, estimate, isBuffer: true, fileName, buffer: fileData };
  } catch (error) {
    console.error('❌ Error analyzing dropped file buffer:', error);
    console.error('❌ Original fileName:', fileName);
    console.error('❌ Error details:', error);
    return { success: false, error: error.message };
  }
});

// Helper function to convert JSON array to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  
  // Get all unique keys from all objects
  const allKeys = new Set();
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(flattenObject(item)).forEach(key => allKeys.add(key));
    }
  });
  
  const headers = Array.from(allKeys).sort();
  
  // Create CSV header
  const csvRows = [headers.map(escapeCSVField).join(',')];
  
  // Add data rows
  data.forEach(item => {
    const flatItem = flattenObject(item);
    const row = headers.map(header => {
      const value = flatItem[header];
      return escapeCSVField(value);
    });
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

// Helper function to flatten nested objects for CSV export
function flattenObject(obj, prefix = '') {
  const flattened = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        // Convert arrays to JSON strings
        flattened[newKey] = JSON.stringify(value);
      } else if (value instanceof Date) {
        // Format dates as ISO strings
        flattened[newKey] = value.toISOString();
      } else {
        flattened[newKey] = String(value);
      }
    }
  }
  
  return flattened;
}

// Helper function to escape CSV fields
function escapeCSVField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If the field contains comma, newline, or double quote, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  
  return stringValue;
}

// Removed duplicate initialization - now handled in single app.whenReady() above