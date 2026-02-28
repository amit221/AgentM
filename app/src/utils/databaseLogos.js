/**
 * Utility functions for database logos and branding
 */

// Logo paths - use relative paths for compatibility with base: './' in vite.config.js
const mongodbLogo = './MongoDB_Logomark_SpringGreen.png';
const postgresLogo = './postgre.png';
const supabaseLogo = './supabase-logo-icon.png';

/**
 * Detects database type and provider from connection string
 * @param {string} connectionString - The database connection string
 * @returns {Object} - Object with databaseType and provider
 */
export const detectDatabaseInfo = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return { databaseType: 'mongodb', provider: 'mongodb' };
  }

  try {
    // Supabase detection (check first - can be URL or PostgreSQL connection string)
    if (connectionString.includes('.supabase.co')) {
      return { databaseType: 'postgresql', provider: 'supabase' };
    }
    
    // MongoDB detection
    if (connectionString.includes('mongodb+srv://')) {
      return { databaseType: 'mongodb', provider: 'mongodb-atlas' };
    }
    if (connectionString.includes('mongodb://')) {
      return { databaseType: 'mongodb', provider: 'mongodb' };
    }

    // PostgreSQL detection
    if (connectionString.includes('postgresql://') || connectionString.includes('postgres://')) {
      return { databaseType: 'postgresql', provider: 'postgresql' };
    }

    return { databaseType: 'mongodb', provider: 'mongodb' };
  } catch (error) {
    console.warn('Error detecting database info:', error);
    return { databaseType: 'mongodb', provider: 'mongodb' };
  }
};

/**
 * Gets the logo image for a database provider
 * @param {string} provider - The database provider (mongodb, mongodb-atlas, postgresql, supabase)
 * @returns {string} - Path to the logo image
 */
export const getDatabaseLogo = (provider) => {
  switch (provider) {
    case 'mongodb':
    case 'mongodb-atlas':
      return mongodbLogo;
    case 'postgresql':
      return postgresLogo;
    case 'supabase':
      return supabaseLogo;
    default:
      return mongodbLogo;
  }
};

/**
 * Gets the display name for a database provider
 * @param {string} provider - The database provider
 * @returns {string} - Display name
 */
export const getDatabaseProviderName = (provider) => {
  switch (provider) {
    case 'mongodb':
      return 'MongoDB';
    case 'mongodb-atlas':
      return 'MongoDB Atlas';
    case 'postgresql':
      return 'PostgreSQL';
    case 'supabase':
      return 'Supabase';
    default:
      return 'Database';
  }
};

/**
 * Gets database info from connection string or database type
 * @param {string} connectionString - The connection string (optional)
 * @param {string} databaseType - The database type (optional, used as fallback)
 * @returns {Object} - Object with logo, provider name, and database type
 */
export const getDatabaseBranding = (connectionString = null, databaseType = null) => {
  let info;
  
  if (connectionString) {
    info = detectDatabaseInfo(connectionString);
  } else if (databaseType) {
    // Fallback to database type if no connection string
    info = { databaseType: databaseType, provider: databaseType };
  } else {
    info = { databaseType: 'mongodb', provider: 'mongodb' };
  }

  return {
    logo: getDatabaseLogo(info.provider),
    providerName: getDatabaseProviderName(info.provider),
    databaseType: info.databaseType,
    provider: info.provider
  };
};

