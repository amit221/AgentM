const BaseStorage = require('./base-storage');

/**
 * Dashboard storage - manages dashboards and widgets separately from main settings
 * This prevents contextBridge recursion depth errors by isolating large dashboard data
 */
class DashboardStorage extends BaseStorage {
  constructor() {
    super('dashboards.json');
  }

  /**
   * Get default dashboard data structure
   */
  getDefaultData() {
    return {
      dashboards: {},
      settings: {
        defaultDashboardId: null,
        autoRefresh: true,
        refreshInterval: 300000, // 5 minutes
        gridCompact: true,
        showWidgetTitles: true
      },
      lastModified: new Date().toISOString()
    };
  }

  /**
   * Get all dashboards
   */
  async getAllDashboards() {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, dashboards: [], error: result.error };
      }

      const data = result.data || this.getDefaultData();
      return {
        success: true,
        dashboards: Object.values(data.dashboards || {})
      };
    } catch (error) {
      console.error('Error getting all dashboards:', error);
      return { success: false, dashboards: [], error: error.message };
    }
  }

  /**
   * Get a specific dashboard by ID
   */
  async getDashboard(dashboardId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, dashboard: null, error: result.error };
      }

      const data = result.data || this.getDefaultData();
      const dashboard = data.dashboards[dashboardId];

      if (!dashboard) {
        return {
          success: false,
          dashboard: null,
          error: `Dashboard ${dashboardId} not found`
        };
      }

      return { success: true, dashboard };
    } catch (error) {
      console.error('Error getting dashboard:', error);
      return { success: false, dashboard: null, error: error.message };
    }
  }

  /**
   * Save or update a dashboard
   */
  async saveDashboard(dashboard) {
    try {
      const result = await this.load();
      const data = result.success ? result.data : this.getDefaultData();

      // Ensure dashboard has an ID
      if (!dashboard.id) {
        dashboard.id = this._generateDashboardId();
      }

      // Add timestamps
      const now = Date.now();
      dashboard.updatedAt = now;
      if (!dashboard.createdAt) {
        dashboard.createdAt = now;
      }

      // Save dashboard
      data.dashboards[dashboard.id] = dashboard;
      data.lastModified = new Date().toISOString();

      const saveResult = await this.save(data);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      return { success: true, dashboard };
    } catch (error) {
      console.error('Error saving dashboard:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(dashboardId) {
    try {
      const result = await this.load();
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const data = result.data || this.getDefaultData();

      if (!data.dashboards[dashboardId]) {
        return {
          success: false,
          error: `Dashboard ${dashboardId} not found`
        };
      }

      delete data.dashboards[dashboardId];
      data.lastModified = new Date().toISOString();

      // If this was the default dashboard, clear the default
      if (data.settings.defaultDashboardId === dashboardId) {
        data.settings.defaultDashboardId = null;
      }

      const saveResult = await this.save(data);
      return saveResult;
    } catch (error) {
      console.error('Error deleting dashboard:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get dashboard settings
   */
  async getSettings() {
    try {
      const result = await this.load();
      const data = result.success ? result.data : this.getDefaultData();

      return {
        success: true,
        settings: data.settings || this.getDefaultData().settings
      };
    } catch (error) {
      console.error('Error getting dashboard settings:', error);
      return {
        success: false,
        settings: this.getDefaultData().settings,
        error: error.message
      };
    }
  }

  /**
   * Save dashboard settings
   */
  async saveSettings(settings) {
    try {
      const result = await this.load();
      const data = result.success ? result.data : this.getDefaultData();

      data.settings = {
        ...data.settings,
        ...settings
      };
      data.lastModified = new Date().toISOString();

      const saveResult = await this.save(data);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      return { success: true, settings: data.settings };
    } catch (error) {
      console.error('Error saving dashboard settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update dashboard layout
   */
  async updateDashboardLayout(dashboardId, layout) {
    try {
      const dashboardResult = await this.getDashboard(dashboardId);
      if (!dashboardResult.success) {
        return dashboardResult;
      }

      const dashboard = dashboardResult.dashboard;
      dashboard.layout = layout;
      dashboard.updatedAt = Date.now();

      return await this.saveDashboard(dashboard);
    } catch (error) {
      console.error('Error updating dashboard layout:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add widget to dashboard
   */
  async addWidget(dashboardId, widget) {
    try {
      const dashboardResult = await this.getDashboard(dashboardId);
      if (!dashboardResult.success) {
        return dashboardResult;
      }

      const dashboard = dashboardResult.dashboard;

      // Ensure widget has an ID
      if (!widget.id) {
        widget.id = this._generateWidgetId();
      }

      // Add timestamps
      widget.createdAt = Date.now();
      widget.lastUpdated = null;

      // Add widget
      dashboard.widgets = dashboard.widgets || {};
      dashboard.widgets[widget.id] = widget;

      // Update dashboard
      const saveResult = await this.saveDashboard(dashboard);
      if (!saveResult.success) {
        return saveResult;
      }

      return { success: true, widget, dashboard: saveResult.dashboard };
    } catch (error) {
      console.error('Error adding widget:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update widget
   */
  async updateWidget(dashboardId, widgetId, updates) {
    try {
      const dashboardResult = await this.getDashboard(dashboardId);
      if (!dashboardResult.success) {
        return dashboardResult;
      }

      const dashboard = dashboardResult.dashboard;

      if (!dashboard.widgets || !dashboard.widgets[widgetId]) {
        return {
          success: false,
          error: `Widget ${widgetId} not found in dashboard`
        };
      }

      // Update widget
      dashboard.widgets[widgetId] = {
        ...dashboard.widgets[widgetId],
        ...updates,
        updatedAt: Date.now()
      };

      // Save dashboard
      const saveResult = await this.saveDashboard(dashboard);
      if (!saveResult.success) {
        return saveResult;
      }

      return {
        success: true,
        widget: dashboard.widgets[widgetId],
        dashboard: saveResult.dashboard
      };
    } catch (error) {
      console.error('Error updating widget:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove widget from dashboard
   */
  async removeWidget(dashboardId, widgetId) {
    try {
      const dashboardResult = await this.getDashboard(dashboardId);
      if (!dashboardResult.success) {
        return dashboardResult;
      }

      const dashboard = dashboardResult.dashboard;

      if (!dashboard.widgets || !dashboard.widgets[widgetId]) {
        return {
          success: false,
          error: `Widget ${widgetId} not found in dashboard`
        };
      }

      // Remove widget
      delete dashboard.widgets[widgetId];

      // Remove from layout
      if (dashboard.layout) {
        Object.keys(dashboard.layout).forEach(breakpoint => {
          dashboard.layout[breakpoint] = dashboard.layout[breakpoint].filter(
            item => item.i !== widgetId
          );
        });
      }

      // Save dashboard
      const saveResult = await this.saveDashboard(dashboard);
      if (!saveResult.success) {
        return saveResult;
      }

      return { success: true, dashboard: saveResult.dashboard };
    } catch (error) {
      console.error('Error removing widget:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup invalid dashboard references
   */
  async cleanup() {
    try {
      const result = await this.load();
      if (!result.success) {
        return result;
      }

      const data = result.data || this.getDefaultData();
      let needsUpdate = false;

      // Check if default dashboard exists
      if (data.settings.defaultDashboardId) {
        const defaultExists = data.dashboards[data.settings.defaultDashboardId];
        if (!defaultExists) {
          console.warn('Removing invalid default dashboard ID:', data.settings.defaultDashboardId);
          data.settings.defaultDashboardId = null;
          needsUpdate = true;
        }
      }

      // If we have dashboards but no default, set the first one as default
      const dashboardIds = Object.keys(data.dashboards);
      if (!data.settings.defaultDashboardId && dashboardIds.length > 0) {
        data.settings.defaultDashboardId = dashboardIds[0];
        needsUpdate = true;
      }

      if (needsUpdate) {
        data.lastModified = new Date().toISOString();
        await this.save(data);
        return {
          success: true,
          cleaned: true,
          message: 'Dashboard settings cleaned up successfully'
        };
      }

      return {
        success: true,
        cleaned: false,
        message: 'No cleanup needed'
      };
    } catch (error) {
      console.error('Error cleaning up dashboard storage:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Migrate dashboards from old settings.json format
   */
  async migrateFromOldFormat(oldDashboards, oldSettings) {
    try {
      console.log('📤 Migrating dashboard data from old format...');

      const currentResult = await this.load();
      const data = currentResult.success ? currentResult.data : this.getDefaultData();

      // Check if already migrated
      if (Object.keys(data.dashboards).length > 0) {
        console.log('✅ Dashboard data already migrated, skipping');
        return { success: true, migrated: false, reason: 'Already migrated' };
      }

      // Migrate dashboards
      if (oldDashboards && Object.keys(oldDashboards).length > 0) {
        data.dashboards = oldDashboards;
        console.log(`✅ Migrated ${Object.keys(oldDashboards).length} dashboards`);
      }

      // Migrate settings
      if (oldSettings) {
        data.settings = {
          ...data.settings,
          ...oldSettings
        };
        console.log('✅ Migrated dashboard settings');
      }

      data.lastModified = new Date().toISOString();

      const saveResult = await this.save(data);
      if (!saveResult.success) {
        return { success: false, migrated: false, error: saveResult.error };
      }

      console.log('✅ Dashboard migration complete');
      return { success: true, migrated: true };
    } catch (error) {
      console.error('Error migrating dashboard data:', error);
      return { success: false, migrated: false, error: error.message };
    }
  }

  /**
   * Generate a unique dashboard ID
   */
  _generateDashboardId() {
    return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique widget ID
   */
  _generateWidgetId() {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = DashboardStorage;

