/**
 * Centralized URL configuration for Agent-M
 * Single source of truth for all URLs across the application
 */

// Default URLs for development
const DEFAULT_URLS = {
  FRONTEND_DEV: 'http://localhost:5173',
  BACKEND_BASE: 'http://localhost:8787',
  BACKEND_API: 'http://localhost:8787/api/v1'
};

// Environment-specific URL overrides
const ENVIRONMENT_URLS = {
  development: {
    ...DEFAULT_URLS
  },
  staging: {
    ...DEFAULT_URLS
  },
  production: {
    ...DEFAULT_URLS
  }
};

/**
 * Get URLs for the current environment
 * @param {string} env - Environment name (development, staging, production)
 * @returns {object} URL configuration object
 */
export function getUrls(env = null) {
  let currentEnv = env;
  
  if (!currentEnv) {
    // Check if we're in Electron and if the app is packaged
    try {
      const { app } = require('electron');
      if (app && app.isPackaged) {
        currentEnv = 'production';
      } else {
        currentEnv = process.env.NODE_ENV || 'development';
      }
    } catch (e) {
      // Not in Electron context, use NODE_ENV
      currentEnv = process.env.NODE_ENV || 'development';
    }
  }
  
  return ENVIRONMENT_URLS[currentEnv] || ENVIRONMENT_URLS.development;
}

/**
 * Get backend URL with settings override support
 * @param {object} settings - User settings object
 * @returns {string} Backend URL
 */
export function getBackendUrl(settings = null) {
  // Check for user settings override first
  if (settings?.backendUrl) {
    return settings.backendUrl;
  }
  
  // Check environment variable
  if (process.env.VITE_BACKEND_URL) {
    return process.env.VITE_BACKEND_URL;
  }
  
  // Fall back to environment default
  const urls = getUrls();
  return urls.BACKEND_BASE;
}

/**
 * Get AI API URL with settings override support
 * @param {object} settings - User settings object
 * @returns {string} AI API URL
 */
export function getAiApiUrl(settings = null) {
  const backendUrl = getBackendUrl(settings);
  return `${backendUrl}/api/v1/ai`;
}

// Export individual URLs for convenience
export const URLS = getUrls();

// Export defaults for reference
export { DEFAULT_URLS };

