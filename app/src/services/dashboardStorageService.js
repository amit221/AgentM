/**
 * Dashboard storage service using Electron's local storage APIs
 * Manages dashboards, widgets, and their configurations
 */

/**
 * Dashboard data structure:
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   layout: { lg: [...], md: [...], sm: [...], xs: [...] },
 *   widgets: {
 *     widgetId: {
 *       id: string,
 *       type: 'chart' | 'summary' | 'table',
 *       title: string,
 *       query: {
 *         template: string,
 *         parameters: [...],
 *         database: string,
 *         collection: string
 *       },
 *       chartConfig: { ... },
 *       refreshInterval: number,
 *       lastUpdated: timestamp
 *     }
 *   },
 *   createdAt: timestamp,
 *   updatedAt: timestamp,
 *   isDefault: boolean
 * }
 */

const STORAGE_KEYS = {
  DASHBOARDS: 'dashboards',
  DASHBOARD_SETTINGS: 'dashboard-settings',
  WIDGET_CACHE: 'widget-cache'
};

/**
 * Gets all dashboards from storage
 */
export async function getAllDashboards() {
  try {
    // Try new dedicated dashboard API first
    if (window.electronAPI?.dashboard?.getAllDashboards) {
      try {
        const result = await window.electronAPI.dashboard.getAllDashboards();
        if (result.success) {
          return result;
        }
        console.warn('getAllDashboards: Dashboard API failed:', result.error);
      } catch (electronError) {
        console.warn('getAllDashboards: Dashboard API error:', electronError);
      }
    }
    
    // Fallback to localStorage
    try {
      const localStorageKey = 'agent-m-dashboards';
      const localData = localStorage.getItem(localStorageKey);
      if (localData) {
        const localDashboards = JSON.parse(localData);
        return {
          success: true,
          dashboards: Object.values(localDashboards)
        };
      }
    } catch (localError) {
      console.error('getAllDashboards: Failed to load from localStorage:', localError);
    }
    
    return {
      success: true,
      dashboards: []
    };
  } catch (error) {
    console.error('Failed to load dashboards:', error);
    return {
      success: false,
      dashboards: [],
      error: error.message
    };
  }
}

/**
 * Gets a specific dashboard by ID
 */
export async function getDashboard(dashboardId) {
  try {
    const result = await getAllDashboards();
    if (!result.success) {
      throw new Error(result.error);
    }

    const dashboard = result.dashboards.find(d => d.id === dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard with ID ${dashboardId} not found`);
    }

    return {
      success: true,
      dashboard
    };
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    return {
      success: false,
      dashboard: null,
      error: error.message
    };
  }
}

/**
 * Saves a dashboard (create or update)
 */
export async function saveDashboard(dashboard) {
  try {
    // Prepare dashboard data first
    const now = Date.now();
    const dashboardData = {
      ...dashboard,
      id: dashboard.id || generateDashboardId(),
      updatedAt: now,
      createdAt: dashboard.createdAt || now
    };
    
    // Try new dedicated dashboard API first
    if (window.electronAPI?.dashboard?.saveDashboard) {
      try {
        const result = await window.electronAPI.dashboard.saveDashboard(dashboardData);
        if (result.success) {
          return result;
        }
        console.warn('saveDashboard: Dashboard API failed:', result.error);
      } catch (electronError) {
        console.error('saveDashboard: Dashboard API error:', electronError);
      }
    }

    // Fallback to localStorage
    console.warn('saveDashboard: Using localStorage fallback');
    try {
      const localStorageKey = 'agent-m-dashboards';
      const existingData = localStorage.getItem(localStorageKey);
      const localDashboards = existingData ? JSON.parse(existingData) : {};
      
      localDashboards[dashboardData.id] = dashboardData;
      localStorage.setItem(localStorageKey, JSON.stringify(localDashboards));
      
      return {
        success: true,
        dashboard: dashboardData
      };
    } catch (localError) {
      console.error('saveDashboard: localStorage fallback also failed:', localError);
      throw localError;
    }
  } catch (error) {
    console.error('Failed to save dashboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Deletes a dashboard
 */
export async function deleteDashboard(dashboardId) {
  try {
    let currentSettings = {};
    let dashboards = {};
    let useElectronStorage = false;

    // Try to load from Electron storage first
    if (window.electronAPI?.storage?.loadSettings) {
      try {
        const electronSettings = await window.electronAPI.storage.loadSettings() || {};
        const electronDashboards = electronSettings[STORAGE_KEYS.DASHBOARDS] || {};
        
        if (electronDashboards[dashboardId]) {
          // Dashboard found in Electron storage
          currentSettings = electronSettings;
          dashboards = electronDashboards;
          useElectronStorage = true;
          
        }
      } catch (electronError) {
        console.warn('deleteDashboard: Electron storage failed:', electronError);
      }
    }

    // If not found in Electron storage, try localStorage fallback
    if (!useElectronStorage) {
      try {
        const localStorageKey = 'agent-m-dashboards';
        const localData = localStorage.getItem(localStorageKey);
        if (localData) {
          const localDashboards = JSON.parse(localData);
          if (localDashboards[dashboardId]) {
            // Dashboard found in localStorage
            dashboards = localDashboards;
            
          }
        }
      } catch (localError) {
        console.error('deleteDashboard: Failed to load from localStorage:', localError);
      }
    }

    // Check if dashboard exists in either storage
    if (!dashboards[dashboardId]) {
      throw new Error(`Dashboard with ID ${dashboardId} not found`);
    }

    // Remove dashboard
    delete dashboards[dashboardId];

    // Save to the appropriate storage
    if (useElectronStorage) {
      // Save to Electron storage
      const updatedSettings = {
        ...currentSettings,
        [STORAGE_KEYS.DASHBOARDS]: dashboards
      };
      await window.electronAPI.storage.saveSettings(updatedSettings);
      
    } else {
      // Save to localStorage
      const localStorageKey = 'agent-m-dashboards';
      localStorage.setItem(localStorageKey, JSON.stringify(dashboards));
      
    }

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete dashboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a new widget and adds it to a dashboard
 */
export async function addWidgetToDashboard(dashboardId, widget) {
  try {
    const dashboardResult = await getDashboard(dashboardId);
    if (!dashboardResult.success) {
      throw new Error(dashboardResult.error);
    }

    const dashboard = dashboardResult.dashboard;
    const widgetId = widget.id || generateWidgetId();
    
    // Prepare widget data
    const widgetData = {
      ...widget,
      id: widgetId,
      createdAt: Date.now(),
      lastUpdated: null
    };

    // Add widget to dashboard
    dashboard.widgets = dashboard.widgets || {};
    dashboard.widgets[widgetId] = widgetData;

    // Add layout items for all breakpoints using widget size presets
    dashboard.layout = dashboard.layout || {};
    
    // Use widget's size presets for all breakpoints
    const sizePresets = widget.sizePresets;
    if (sizePresets) {
      // Add layout for each breakpoint
      Object.keys(sizePresets).forEach(breakpoint => {
        dashboard.layout[breakpoint] = dashboard.layout[breakpoint] || [];
        dashboard.layout[breakpoint].push({
          i: widgetId,
          x: 0,
          y: 0,
          w: sizePresets[breakpoint].w,
          h: sizePresets[breakpoint].h,
          minW: 2,
          minH: 2
        });
      });
    } else {
      // Fallback to old behavior if no size presets
      const layoutItem = {
        i: widgetId,
        x: 0,
        y: 0,
        w: widget.defaultWidth || 6,
        h: widget.defaultHeight || 4,
        minW: 3,
        minH: 2
      };
      dashboard.layout.lg = dashboard.layout.lg || [];
      dashboard.layout.lg.push(layoutItem);
    }

    // Save updated dashboard
    const saveResult = await saveDashboard(dashboard);
    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    return {
      success: true,
      widget: widgetData,
      dashboard: saveResult.dashboard
    };
  } catch (error) {
    console.error('Failed to add widget to dashboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates a widget in a dashboard
 */
export async function updateWidget(dashboardId, widgetId, updates) {
  try {
    const dashboardResult = await getDashboard(dashboardId);
    if (!dashboardResult.success) {
      throw new Error(dashboardResult.error);
    }

    const dashboard = dashboardResult.dashboard;
    
    if (!dashboard.widgets || !dashboard.widgets[widgetId]) {
      throw new Error(`Widget with ID ${widgetId} not found in dashboard`);
    }

    // Update widget
    dashboard.widgets[widgetId] = {
      ...dashboard.widgets[widgetId],
      ...updates,
      updatedAt: Date.now()
    };

    // Save updated dashboard
    const saveResult = await saveDashboard(dashboard);
    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    return {
      success: true,
      widget: dashboard.widgets[widgetId],
      dashboard: saveResult.dashboard
    };
  } catch (error) {
    console.error('Failed to update widget:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Removes a widget from a dashboard
 */
export async function removeWidgetFromDashboard(dashboardId, widgetId) {
  try {
    const dashboardResult = await getDashboard(dashboardId);
    if (!dashboardResult.success) {
      throw new Error(dashboardResult.error);
    }

    const dashboard = dashboardResult.dashboard;
    
    if (!dashboard.widgets || !dashboard.widgets[widgetId]) {
      throw new Error(`Widget with ID ${widgetId} not found in dashboard`);
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

    // Save updated dashboard
    const saveResult = await saveDashboard(dashboard);
    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    return {
      success: true,
      dashboard: saveResult.dashboard
    };
  } catch (error) {
    console.error('Failed to remove widget from dashboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates dashboard layout (for drag & drop)
 */
export async function updateDashboardLayout(dashboardId, layout) {
  try {
    const dashboardResult = await getDashboard(dashboardId);
    if (!dashboardResult.success) {
      throw new Error(dashboardResult.error);
    }

    const dashboard = dashboardResult.dashboard;
    dashboard.layout = layout;

    // Save updated dashboard
    const saveResult = await saveDashboard(dashboard);
    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    return {
      success: true,
      dashboard: saveResult.dashboard
    };
  } catch (error) {
    console.error('Failed to update dashboard layout:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Gets dashboard settings (default dashboard, preferences, etc.)
 */
export async function getDashboardSettings() {
  try {
    // Try new dedicated dashboard API first
    if (window.electronAPI?.dashboard?.getSettings) {
      try {
        const result = await window.electronAPI.dashboard.getSettings();
        if (result.success) {
          return result;
        }
        console.warn('getDashboardSettings: Dashboard API failed:', result.error);
      } catch (electronError) {
        console.warn('getDashboardSettings: Dashboard API error:', electronError);
      }
    }
    
    // Return defaults
    return {
      success: true,
      settings: {
        defaultDashboardId: null,
        autoRefresh: true,
        refreshInterval: 300000, // 5 minutes
        gridCompact: true,
        showWidgetTitles: true
      }
    };
  } catch (error) {
    console.error('Failed to load dashboard settings:', error);
    return {
      success: false,
      settings: {},
      error: error.message
    };
  }
}

/**
 * Saves dashboard settings
 */
export async function saveDashboardSettings(settings) {
  try {
    // Try new dedicated dashboard API first
    if (window.electronAPI?.dashboard?.saveSettings) {
      try {
        const result = await window.electronAPI.dashboard.saveSettings(settings);
        if (result.success) {
          return result;
        }
        console.warn('saveDashboardSettings: Dashboard API failed:', result.error);
      } catch (electronError) {
        console.error('saveDashboardSettings: Dashboard API error:', electronError);
      }
    }

    // Return success with the settings passed in
    return {
      success: true,
      settings
    };
  } catch (error) {
    console.error('Failed to save dashboard settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Utility functions
 */
function generateDashboardId() {
  return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateWidgetId() {
  return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Creates a default dashboard for new users
 */
export async function createDefaultDashboard() {
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

  return await saveDashboard(defaultDashboard);
}

/**
 * Debug function to inspect storage contents
 */
export async function debugStorage() {
  try {
    
    
    if (!window.electronAPI?.storage?.loadSettings) {
      console.error('Electron storage API not available');
      return;
    }
    
    const result = await window.electronAPI.storage.loadSettings();
    
    
    const dashboards = result?.[STORAGE_KEYS.DASHBOARDS] || {};
    const settings = result?.[STORAGE_KEYS.DASHBOARD_SETTINGS] || {};
    
    
    
    
    
    
    
    
    // Check if default dashboard exists
    if (settings.defaultDashboardId) {
      const exists = Object.keys(dashboards).includes(settings.defaultDashboardId);
      
    }
    
    
    
    return {
      raw: result,
      dashboards,
      settings,
      dashboardCount: Object.keys(dashboards).length,
      dashboardIds: Object.keys(dashboards),
      defaultDashboardExists: settings.defaultDashboardId ? Object.keys(dashboards).includes(settings.defaultDashboardId) : null
    };
    
  } catch (error) {
    console.error('Debug storage failed:', error);
    return { error: error.message };
  }
}

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  window.debugDashboardStorage = debugStorage;
}

/**
 * Cleans up corrupted dashboard settings
 */
export async function cleanupDashboardSettings() {
  try {
    const dashboardsResult = await getAllDashboards();
    const settingsResult = await getDashboardSettings();
    
    if (!dashboardsResult.success || !settingsResult.success) {
      return { success: false, error: 'Failed to load data for cleanup' };
    }
    
    const { dashboards } = dashboardsResult;
    const { settings } = settingsResult;
    
    let needsUpdate = false;
    const cleanedSettings = { ...settings };
    
    // Check if default dashboard exists
    if (settings.defaultDashboardId) {
      const defaultExists = dashboards.some(d => d.id === settings.defaultDashboardId);
      if (!defaultExists) {
        console.warn('Removing invalid default dashboard ID:', settings.defaultDashboardId);
        cleanedSettings.defaultDashboardId = null;
        needsUpdate = true;
      }
    }
    
    // If we have dashboards but no default, set the first one as default
    if (!cleanedSettings.defaultDashboardId && dashboards.length > 0) {
      cleanedSettings.defaultDashboardId = dashboards[0].id;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await saveDashboardSettings(cleanedSettings);
      return { 
        success: true, 
        cleaned: true, 
        settings: cleanedSettings,
        message: 'Dashboard settings cleaned up successfully'
      };
    }
    
    return { 
      success: true, 
      cleaned: false, 
      settings,
      message: 'No cleanup needed'
    };
    
  } catch (error) {
    console.error('Failed to cleanup dashboard settings:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
