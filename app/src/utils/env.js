/**
 * Environment configuration utility for frontend
 * Single source of environment-related functions for React components
 */

import { getUrls, getBackendUrl, getAiApiUrl, DEFAULT_URLS } from '../config/urls.js';

/**
 * Get current environment configuration
 * @returns {object} Environment configuration object
 */
export const getEnvironment = () => {
  const env = process.env.NODE_ENV || 'development';
  const urls = getUrls(env);
  return {
    backendUrl: urls.BACKEND_BASE,
    authApiBase: urls.AUTH_API,
    appEnv: env
  };
};

/**
 * Environment detection helpers
 */
export const isDevelopment = () => (process.env.NODE_ENV || 'development') === 'development';
export const isStaging = () => process.env.NODE_ENV === 'staging';
export const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Get backend URL with settings override support (for frontend)
 * @param {object} settings - User settings object
 * @returns {string} Backend URL
 */
export const getBackendUrlForFrontend = (settings = null) => {
  // Check localStorage override first (browser-specific)
  const localStorageUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('backend-url') : null;
  if (localStorageUrl) return localStorageUrl;
  
  // Check settings override
  if (settings?.backendUrl) return settings.backendUrl;
  
  // Check build-time environment variable
  if (typeof __BACKEND_URL__ !== 'undefined') return __BACKEND_URL__;
  
  // Fall back to environment default
  return getUrls().BACKEND_BASE;
};

/**
 * Default values for fallback - use centralized defaults
 */
export const DEFAULT_BACKEND_URL = DEFAULT_URLS.BACKEND_BASE;

// Legacy support - will be removed in future versions
export const getCurrentEnvironment = getEnvironment;
