/**
 * Settings utilities for accessing application settings
 */

import { getDefaultViewQuery, getTerminology, isRelationalDatabase } from './databaseTypeUtils';

/**
 * Gets the default settings object
 * @returns {Object} Default settings
 */
export function getDefaultSettings() {
  return {
    queryLimit: 50,
    autoExecuteQueries: false,
    saveQueryHistory: true,
    queryTimeout: 60,
    enableAIFieldDescriptions: false
  };
}

/**
 * Gets the default query limit from settings
 * @param {Object} settings - The application settings object
 * @returns {number} The default query limit
 */
export function getDefaultQueryLimit(settings) {
  if (!settings || typeof settings !== 'object') {
    return 100; // fallback default
  }
  
  return typeof settings.queryLimit === 'number' && settings.queryLimit > 0 
    ? settings.queryLimit 
    : 100;
}

/**
 * Gets the query timeout from settings
 * @param {Object} settings - The application settings object
 * @returns {number} The query timeout in seconds
 */
export function getQueryTimeout(settings) {
  if (!settings || typeof settings !== 'object') {
    return 60; // fallback default
  }
  
  return typeof settings.queryTimeout === 'number' && settings.queryTimeout > 0 
    ? settings.queryTimeout 
    : 60;
}

/**
 * Determines if auto-execution should be enabled for a query
 * @param {Object} settings - The application settings object
 * @param {string} query - The query string to check
 * @returns {boolean} True if the query should be auto-executed
 */
export function shouldAutoExecuteQuery(settings, query) {
  if (!settings || typeof settings !== 'object') {
    return false;
  }
  
  return Boolean(settings.autoExecuteQueries);
}

/**
 * Formats a prompt message with the appropriate limit
 * @param {string} collectionOrTable - Collection or table name
 * @param {number} limit - The limit to use
 * @param {string} databaseType - The database type ('mongodb' or 'postgresql')
 * @returns {string} Formatted prompt message
 */
export function formatCollectionPrompt(collectionOrTable, limit, databaseType = 'mongodb') {
  const terminology = getTerminology(databaseType);
  const recordTerm = terminology.documents;
  const containerTerm = terminology.collection;
  
  if (!collectionOrTable || typeof collectionOrTable !== 'string') {
    return `Get the last ${limit} ${recordTerm} from ${containerTerm}`;
  }
  
  return `Get the last ${limit} ${recordTerm} from ${collectionOrTable} ${containerTerm}`;
}

/**
 * Generates a query with the specified limit for the given database type
 * @param {string} collectionOrTable - Collection or table name
 * @param {number} limit - The limit to use
 * @param {string} databaseType - The database type ('mongodb' or 'postgresql')
 * @returns {string} The formatted query for the database type
 */
export function generateCollectionQuery(collectionOrTable, limit, databaseType = 'mongodb') {
  return getDefaultViewQuery(databaseType, collectionOrTable, limit);
}
