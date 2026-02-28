const ConnectionStorage = require('./connection-storage');
const ConversationStorage = require('./conversation-storage');
const AppStateStorage = require('./app-state-storage');
const DashboardStorage = require('./dashboard-storage');
const SettingsStorage = require('./settings'); // Keep the original for API keys and other settings

/**
 * Unified storage manager that coordinates all storage types
 */
class StorageManager {
  constructor() {
    this.connections = new ConnectionStorage();
    this.conversations = new ConversationStorage();
    this.appState = new AppStateStorage();
    this.dashboards = new DashboardStorage();
    this.settings = new SettingsStorage(); // For API keys, favorites, history, schemas
    
    this.migrationComplete = false;
  }

  /**
   * Initialize storage and perform any necessary migrations
   */
  async initialize() {
    try {
      console.log('🔧 Initializing modular storage system...');
      
      // Check if migration is needed
      const migrationResult = await this.performMigration();
      if (migrationResult.success) {
        this.migrationComplete = true;
        console.log('✅ Storage system initialized successfully');
        
        if (migrationResult.migrated) {
          console.log(`📦 Migrated data: ${JSON.stringify(migrationResult.details)}`);
        }
      } else {
        console.error('❌ Storage migration failed:', migrationResult.error);
      }

      return migrationResult;
    } catch (error) {
      console.error('❌ Error initializing storage:', error);
      return { success: false, error: error.message };
    }
  }


  /**
   * Perform migration from old storage format to new modular format
   */
  async performMigration() {
    try {
      console.log('🔄 Checking for data migration...');
      
      // Load old settings to check for migration
      const oldSettingsResult = await this.settings.loadSettings();
      const oldSettings = oldSettingsResult.success ? oldSettingsResult.settings : {};
      
      const migrationResults = {
        connections: { migrated: false },
        conversations: { migrated: false },
        appState: { migrated: false },
        dashboards: { migrated: false }
      };

      // Migrate connection state
      if (oldSettings.connectionState) {
        console.log('📤 Migrating connection data...');
        const connResult = await this.connections.migrateFromOldFormat(oldSettings.connectionState);
        migrationResults.connections = connResult;
      }

      // Migrate conversation data
      if (oldSettings.conversations?.data) {
        console.log('📤 Migrating conversation data...');
        const convResult = await this.conversations.migrateFromOldFormat(oldSettings.conversations.data);
        migrationResults.conversations = convResult;
      }

      // Migrate app state
      if (oldSettings.appState) {
        console.log('📤 Migrating app state data...');
        const appResult = await this.appState.migrateFromOldFormat(oldSettings.appState);
        migrationResults.appState = appResult;
      }

      // Migrate dashboard data
      if (oldSettings.dashboards || oldSettings['dashboard-settings']) {
        console.log('📤 Migrating dashboard data...');
        const dashResult = await this.dashboards.migrateFromOldFormat(
          oldSettings.dashboards || {},
          oldSettings['dashboard-settings'] || {}
        );
        migrationResults.dashboards = dashResult;
      }

      // Clean up migrated data from old settings file
      const anyMigrated = Object.values(migrationResults).some(r => r.migrated);
      if (anyMigrated) {
        console.log('🧹 Cleaning up old settings format...');
        await this.cleanupOldSettings(oldSettings);
      }

      return {
        success: true,
        migrated: anyMigrated,
        details: migrationResults
      };
    } catch (error) {
      console.error('Error during migration:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up migrated data from old settings file
   */
  async cleanupOldSettings(oldSettings) {
    try {
      // Create new settings without migrated data
      const cleanSettings = { ...oldSettings };
      
      // Remove migrated sections
      delete cleanSettings.connectionState;
      delete cleanSettings.conversations;
      delete cleanSettings.appState;
      delete cleanSettings.dashboards;
      delete cleanSettings['dashboard-settings'];
      
      // Keep other data (API keys, favorites, history, schemas)
      await this.settings.saveSettings(cleanSettings);
      
      console.log('✅ Old settings cleaned up');
    } catch (error) {
      console.warn('Warning: Could not clean up old settings:', error);
    }
  }

  // ===========================================
  // CONNECTION STORAGE METHODS
  // ===========================================

  async saveConnectionState(connectionState) {
    // Handle the case where connectionState contains savedConnections array
    if (connectionState && connectionState.savedConnections) {
      // Save the entire connection state structure
      const result = await this.connections.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }
      
      const data = result.data;
      data.savedConnections = connectionState.savedConnections;
      
      return await this.connections.save(data);
    } else {
      // Handle single connection addition (legacy support)
      return await this.connections.addConnection(connectionState);
    }
  }

  async loadConnectionState() {
    const result = await this.connections.getConnections();
    if (result.success) {
      return {
        success: true,
        connectionState: {
          savedConnections: result.connections,
          preferences: result.preferences
        }
      };
    }
    return result;
  }

  async addSavedConnection(connectionData) {
    return await this.connections.addConnection(connectionData);
  }

  async removeSavedConnection(connectionId) {
    return await this.connections.removeConnection(connectionId);
  }

  async updateSavedConnection(connectionId, updates) {
    return await this.connections.updateConnection(connectionId, updates);
  }

  async setLastActiveConnection(connectionId) {
    return await this.connections.setLastActiveConnection(connectionId);
  }

  async updateLastUsedByConnectionString(connectionString) {
    return await this.connections.updateLastUsedByConnectionString(connectionString);
  }

  // ===========================================
  // CONVERSATION STORAGE METHODS
  // ===========================================

  async saveConversations(conversationData) {
    const currentData = await this.conversations.getConversations();
    const data = currentData.success ? currentData.data : this.conversations.getDefaultData();
    
    // Update with new data
    if (conversationData.conversations) {
      data.conversations = conversationData.conversations;
    }
    if (conversationData.activeConversationId) {
      data.activeConversationId = conversationData.activeConversationId;
    }
    if (conversationData.queryHistory) {
      // Enforce storage-side cap to last 50 items
      data.queryHistory = (conversationData.queryHistory || []).slice(-50);
    }
    if (conversationData.favorites) {
      data.favorites = conversationData.favorites;
    }

    // Persist to the conversation storage file
    const saveResult = await this.conversations.save(data);

    // Mirror critical arrays to legacy settings for backward compatibility
    try {
      const settingsRes = await this.settings.loadSettings();
      const settings = settingsRes.success ? (settingsRes.settings || {}) : {};
      if (conversationData.favorites) {
        settings.favorites = Array.isArray(conversationData.favorites) ? conversationData.favorites : [];
      }
      if (conversationData.queryHistory) {
        settings.history = Array.isArray(conversationData.queryHistory) ? conversationData.queryHistory.slice(-50) : [];
      }
      // Don't overwrite other settings keys
      await this.settings.saveSettings(settings);
    } catch (e) {
      // Non-fatal; keep going
      console.warn('Warning: could not mirror favorites/history to settings.json:', e?.message || e);
    }

    return saveResult;
  }

  async loadConversations() {
    const result = await this.conversations.getConversations();
    if (!result.success) return result;

    const data = result.data || this.conversations.getDefaultData();

    // If favorites/history are empty, attempt to hydrate from legacy settings store
    try {
      const settingsRes = await this.settings.loadSettings();
      if (settingsRes.success) {
        const settings = settingsRes.settings || {};

        if (!Array.isArray(data.favorites) || data.favorites.length === 0) {
          if (Array.isArray(settings.favorites) && settings.favorites.length > 0) {
            data.favorites = settings.favorites;
          }
        }
        if (!Array.isArray(data.queryHistory) || data.queryHistory.length === 0) {
          if (Array.isArray(settings.history) && settings.history.length > 0) {
            data.queryHistory = settings.history.slice(-50);
          }
        }
      }
    } catch (e) {
      console.warn('Warning: could not hydrate from settings.json:', e?.message || e);
    }

    return { success: true, conversations: data };
  }

  async addConversation(conversationData) {
    return await this.conversations.addConversation(conversationData);
  }

  async removeConversation(conversationId) {
    return await this.conversations.removeConversation(conversationId);
  }

  async updateConversation(conversationId, updates) {
    return await this.conversations.updateConversation(conversationId, updates);
  }

  async setActiveConversation(conversationId) {
    return await this.conversations.setActiveConversation(conversationId);
  }

  // ===========================================
  // APP STATE STORAGE METHODS
  // ===========================================

  async saveAppState(appState) {
    const currentResult = await this.appState.getAppState();
    const currentData = currentResult.success ? currentResult.appState : this.appState.getDefaultData();
    
    // Merge with current state
    const mergedState = {
      ...currentData,
      ...appState,
      lastSaved: new Date().toISOString()
    };

    return await this.appState.save(mergedState);
  }

  async loadAppState() {
    return await this.appState.getAppState();
  }

  async setCurrentView(view) {
    return await this.appState.setCurrentView(view);
  }

  async setDarkMode(isDark) {
    return await this.appState.setDarkMode(isDark);
  }

  async updateSidebar(sidebarState) {
    return await this.appState.updateSidebar(sidebarState);
  }


  // ===========================================
  // DASHBOARD STORAGE METHODS
  // ===========================================

  async getAllDashboards() {
    return await this.dashboards.getAllDashboards();
  }

  async getDashboard(dashboardId) {
    return await this.dashboards.getDashboard(dashboardId);
  }

  async saveDashboard(dashboard) {
    return await this.dashboards.saveDashboard(dashboard);
  }

  async deleteDashboard(dashboardId) {
    return await this.dashboards.deleteDashboard(dashboardId);
  }

  async getDashboardSettings() {
    return await this.dashboards.getSettings();
  }

  async saveDashboardSettings(settings) {
    return await this.dashboards.saveSettings(settings);
  }

  async updateDashboardLayout(dashboardId, layout) {
    return await this.dashboards.updateDashboardLayout(dashboardId, layout);
  }

  async addWidgetToDashboard(dashboardId, widget) {
    return await this.dashboards.addWidget(dashboardId, widget);
  }

  async updateWidget(dashboardId, widgetId, updates) {
    return await this.dashboards.updateWidget(dashboardId, widgetId, updates);
  }

  async removeWidgetFromDashboard(dashboardId, widgetId) {
    return await this.dashboards.removeWidget(dashboardId, widgetId);
  }

  async cleanupDashboardSettings() {
    return await this.dashboards.cleanup();
  }

  async createDefaultDashboard() {
    const defaultDashboard = {
      name: 'My Dashboard',
      description: 'Your first dashboard - add widgets from query results!',
      layout: {
        lg: [],
        md: [],
        sm: [],
        xs: []
      },
      widgets: {},
      isDefault: true
    };

    return await this.dashboards.saveDashboard(defaultDashboard);
  }

  // ===========================================
  // LEGACY SETTINGS METHODS (for API keys, etc.)
  // ===========================================

  async saveSettings(settings) {
    return await this.settings.saveSettings(settings);
  }

  async loadSettings() {
    return await this.settings.loadSettings();
  }

  async saveFavorite(favorite) {
    return await this.settings.saveFavorite(favorite);
  }

  async loadFavorites() {
    return await this.settings.loadFavorites();
  }

  async saveHistory(historyItem) {
    return await this.settings.saveHistory(historyItem);
  }

  async loadHistory() {
    return await this.settings.loadHistory();
  }

  async saveCollectionSchemas(databaseName, schemas, metadata = null) {
    return await this.settings.saveCollectionSchemas(databaseName, schemas, metadata);
  }

  async loadCollectionSchemas(databaseName) {
    return await this.settings.loadCollectionSchemas(databaseName);
  }

  async clearAllCollectionSchemas() {
    return await this.settings.clearAllCollectionSchemas();
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  /**
   * Get storage health status
   */
  async getHealthStatus() {
    try {
      const health = {
        connections: { healthy: false, error: null },
        conversations: { healthy: false, error: null },
        appState: { healthy: false, error: null },
        settings: { healthy: false, error: null }
      };

      // Test each storage
      const connectionResult = await this.connections.load();
      health.connections = {
        healthy: connectionResult.success,
        error: connectionResult.error || null
      };

      const conversationResult = await this.conversations.load();
      health.conversations = {
        healthy: conversationResult.success,
        error: conversationResult.error || null
      };

      const appStateResult = await this.appState.load();
      health.appState = {
        healthy: appStateResult.success,
        error: appStateResult.error || null
      };

      const settingsResult = await this.settings.loadSettings();
      health.settings = {
        healthy: settingsResult.success,
        error: settingsResult.error || null
      };

      const overallHealthy = Object.values(health).every(h => h.healthy);

      return {
        success: true,
        healthy: overallHealthy,
        details: health
      };
    } catch (error) {
      return {
        success: false,
        healthy: false,
        error: error.message
      };
    }
  }

  // ===========================================
  // CLEAR/RESET METHODS
  // ===========================================

  /**
   * Clear all conversations (reset to default conversation)
   */
  async clearConversations() {
    try {
      const result = await this.conversations.clear();
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear only query history
   */
  async clearHistory() {
    try {
      const current = await this.conversations.getConversations();
      const data = current.success ? current.data : this.conversations.getDefaultData();
      data.queryHistory = [];
      return await this.conversations.save(data);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear only favorites
   */
  async clearFavorites() {
    try {
      const current = await this.conversations.getConversations();
      const data = current.success ? current.data : this.conversations.getDefaultData();
      data.favorites = [];
      return await this.conversations.save(data);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset app state to defaults
   */
  async clearAppState() {
    try {
      if (this.appState.resetToDefaults) {
        return await this.appState.resetToDefaults();
      }
      return await this.appState.clear();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all saved connections
   */
  async clearConnections() {
    try {
      return await this.connections.clear();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all user data managed by storage (except API keys and schemas unless separately requested)
   */
  async clearAllData() {
    try {
      const results = await Promise.all([
        this.clearConversations(),
        this.clearHistory(),
        this.clearFavorites(),
        this.clearAppState(),
        this.clearConnections()
      ]);
      const allSuccessful = results.every(r => r.success);
      return { success: allSuccessful, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear conversations on app close for privacy
   */
  async clearConversationsOnExit() {
    try {
      console.log('🧹 Clearing conversations for privacy...');
      return await this.clearConversations();
    } catch (error) {
      console.error('Error clearing conversations on exit:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create backup of all storage files
   */
  async createFullBackup() {
    try {
      const results = await Promise.all([
        this.connections.createBackup(),
        this.conversations.createBackup(),
        this.appState.createBackup()
      ]);

      const allSuccessful = results.every(r => r.success);
      return {
        success: allSuccessful,
        results: {
          connections: results[0],
          conversations: results[1],
          appState: results[2]
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup() {
    try {
      const results = await Promise.all([
        this.connections.restoreFromBackup(),
        this.conversations.restoreFromBackup(),
        this.appState.restoreFromBackup()
      ]);

      const anySuccessful = results.some(r => r.success);
      return {
        success: anySuccessful,
        results: {
          connections: results[0],
          conversations: results[1],
          appState: results[2]
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = StorageManager;