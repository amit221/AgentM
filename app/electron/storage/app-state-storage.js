const BaseStorage = require('./base-storage');

/**
 * Dedicated storage manager for app state and preferences
 */
class AppStateStorage extends BaseStorage {
  constructor() {
    super('app-state.json', {
      enableEncryption: false, // App state doesn't contain sensitive data
      enableBackup: true,
      validateData: (data) => this.validateAppStateData(data)
    });
  }

  /**
   * Get default app state structure
   */
  getDefaultData() {
    return {
      currentView: 'query',
      isDarkMode: true,
      sidebarCollapsed: false,
      sidebarWidth: 300,
      windowState: {
        maximized: false,
        bounds: null
      },
      viewPreferences: {
        query: {
          resultsPanelHeight: 400,
          showLineNumbers: true,
          autoFormat: true
        },
        connections: {
          viewMode: 'list',
          sortBy: 'lastUsed'
        },
        history: {
          groupBy: 'date',
          showDetails: true
        }
      },
      notifications: {
        showSuccessMessages: true,
        showErrorMessages: true,
        autoHideDelay: 5000
      },
      performance: {
        maxResultsPerPage: 100,
        enableQueryCache: true,
        enableSchemaCache: true
      }
    };
  }

  /**
   * Get data version for migration purposes
   */
  getDataVersion() {
    return '2.0.0';
  }

  /**
   * Validate app state data structure
   */
  validateAppStateData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Data must be an object' };
    }

    // Validate required fields
    const requiredFields = ['currentView', 'isDarkMode'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    // Validate types
    if (typeof data.isDarkMode !== 'boolean') {
      return { valid: false, error: 'isDarkMode must be a boolean' };
    }

    if (typeof data.currentView !== 'string') {
      return { valid: false, error: 'currentView must be a string' };
    }

    return { valid: true };
  }

  /**
   * Update current view
   */
  async setCurrentView(view) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.currentView = view;

      return await this.save(data);
    } catch (error) {
      console.error('Error setting current view:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Toggle dark mode
   */
  async setDarkMode(isDark) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.isDarkMode = isDark;

      return await this.save(data);
    } catch (error) {
      console.error('Error setting dark mode:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update sidebar state
   */
  async updateSidebar(sidebarState) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      if (typeof sidebarState.collapsed === 'boolean') {
        data.sidebarCollapsed = sidebarState.collapsed;
      }
      
      if (typeof sidebarState.width === 'number' && sidebarState.width > 0) {
        data.sidebarWidth = sidebarState.width;
      }

      return await this.save(data);
    } catch (error) {
      console.error('Error updating sidebar state:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update window state
   */
  async updateWindowState(windowState) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.windowState = {
        ...data.windowState,
        ...windowState
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating window state:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update view preferences
   */
  async updateViewPreferences(view, preferences) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      
      if (!data.viewPreferences) {
        data.viewPreferences = {};
      }
      
      data.viewPreferences[view] = {
        ...data.viewPreferences[view],
        ...preferences
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating view preferences:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(preferences) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.notifications = {
        ...data.notifications,
        ...preferences
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update performance settings
   */
  async updatePerformanceSettings(settings) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data;
      data.performance = {
        ...data.performance,
        ...settings
      };

      return await this.save(data);
    } catch (error) {
      console.error('Error updating performance settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get app state
   */
  async getAppState() {
    try {
      const result = await this.load();
      if (!result.success) {
        return { 
          success: false, 
          error: result.error,
          appState: this.getDefaultData()
        };
      }

      return { success: true, appState: result.data };
    } catch (error) {
      console.error('Error getting app state:', error);
      return { 
        success: false, 
        error: error.message,
        appState: this.getDefaultData()
      };
    }
  }

  /**
   * Reset app state to defaults
   */
  async resetToDefaults() {
    try {
      const defaultData = this.getDefaultData();
      return await this.save(defaultData);
    } catch (error) {
      console.error('Error resetting app state:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate data from old format
   */
  async migrateFromOldFormat(oldAppState) {
    try {
      if (!oldAppState) {
        return { success: true, migrated: false };
      }

      const result = await this.load();
      const data = result.success ? result.data : this.getDefaultData();

      let migrated = false;

      // Migrate basic app state
      if (typeof oldAppState.currentView === 'string') {
        data.currentView = oldAppState.currentView;
        migrated = true;
      }

      if (typeof oldAppState.isDarkMode === 'boolean') {
        data.isDarkMode = oldAppState.isDarkMode;
        migrated = true;
      }

      // Migrate other app state properties
      const migrateableFields = [
        'sidebarCollapsed', 
        'sidebarWidth', 
        'windowState', 
        'viewPreferences',
        'notifications',
        'performance'
      ];

      for (const field of migrateableFields) {
        if (oldAppState[field] !== undefined) {
          data[field] = {
            ...data[field],
            ...oldAppState[field]
          };
          migrated = true;
        }
      }

      if (migrated) {
        const saveResult = await this.save(data);
        return { 
          success: saveResult.success, 
          migrated: true,
          error: saveResult.error
        };
      }

      return { success: true, migrated: false };
    } catch (error) {
      console.error('Error migrating app state data:', error);
      return { success: false, error: error.message, migrated: false };
    }
  }
}

module.exports = AppStateStorage;