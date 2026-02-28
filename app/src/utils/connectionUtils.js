/**
 * Utility functions for handling database connection strings and credentials
 * Supports MongoDB, PostgreSQL, and Supabase
 */

/**
 * Masks username and password in a database connection string
 * @param {string} connectionString - The database connection string
 * @param {string} maskChar - Character to use for masking (default: '*')
 * @returns {string} - Connection string with masked credentials
 */
export const maskConnectionCredentials = (connectionString, maskChar = '*') => {
  if (!connectionString || typeof connectionString !== 'string') {
    return connectionString;
  }

  try {
    // Handle mongodb+srv:// format
    if (connectionString.includes('mongodb+srv://')) {
      return connectionString.replace(
        /mongodb\+srv:\/\/([^:]+):([^@]+)@/,
        `mongodb+srv://${maskChar.repeat(8)}:${maskChar.repeat(8)}@`
      );
    }
    
    // Handle mongodb:// format
    if (connectionString.includes('mongodb://')) {
      return connectionString.replace(
        /mongodb:\/\/([^:]+):([^@]+)@/,
        `mongodb://${maskChar.repeat(8)}:${maskChar.repeat(8)}@`
      );
    }

    // Handle postgresql:// and postgres:// format
    if (connectionString.includes('postgresql://') || connectionString.includes('postgres://')) {
      return connectionString.replace(
        /postgres(ql)?:\/\/([^:]+):([^@]+)@/,
        `postgresql://${maskChar.repeat(8)}:${maskChar.repeat(8)}@`
      );
    }

    // Return as-is if no credentials found
    return connectionString;
  } catch (error) {
    console.warn('Error masking connection credentials:', error);
    return connectionString;
  }
};

/**
 * Checks if a connection string contains embedded credentials
 * @param {string} connectionString - The database connection string
 * @returns {boolean} - True if credentials are found
 */
export const hasEmbeddedCredentials = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return false;
  }

  // Check for username:password pattern in various database formats
  const credentialPattern = /(mongodb(\+srv)?|postgres(ql)?):\/\/[^:]+:[^@]+@/;
  return credentialPattern.test(connectionString);
};

/**
 * Extracts username from a MongoDB connection string
 * @param {string} connectionString - The MongoDB connection string
 * @returns {string|null} - Username if found, null otherwise
 */
export const extractUsername = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return null;
  }

  try {
    const match = connectionString.match(/mongodb(\+srv)?:\/\/([^:]+):[^@]+@/);
    return match ? match[2] : null;
  } catch (error) {
    console.warn('Error extracting username:', error);
    return null;
  }
};

/**
 * Replaces credentials in a connection string with new ones
 * @param {string} connectionString - The original connection string
 * @param {string} username - New username
 * @param {string} password - New password
 * @returns {string} - Updated connection string
 */
export const replaceCredentials = (connectionString, username, password) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return connectionString;
  }

  try {
    // Handle mongodb+srv:// format
    if (connectionString.includes('mongodb+srv://')) {
      if (hasEmbeddedCredentials(connectionString)) {
        return connectionString.replace(
          /mongodb\+srv:\/\/[^:]+:[^@]+@/,
          `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        );
      } else {
        return connectionString.replace(
          /mongodb\+srv:\/\//,
          `mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        );
      }
    }

    // Handle mongodb:// format
    if (connectionString.includes('mongodb://')) {
      if (hasEmbeddedCredentials(connectionString)) {
        return connectionString.replace(
          /mongodb:\/\/[^:]+:[^@]+@/,
          `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        );
      } else {
        return connectionString.replace(
          /mongodb:\/\//,
          `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
        );
      }
    }

    return connectionString;
  } catch (error) {
    console.warn('Error replacing credentials:', error);
    return connectionString;
  }
};

/**
 * Removes credentials from a connection string
 * @param {string} connectionString - The MongoDB connection string
 * @returns {string} - Connection string without credentials
 */
export const removeCredentials = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return connectionString;
  }

  try {
    // Handle mongodb+srv:// format
    if (connectionString.includes('mongodb+srv://')) {
      return connectionString.replace(/mongodb\+srv:\/\/[^:]+:[^@]+@/, 'mongodb+srv://');
    }

    // Handle mongodb:// format  
    if (connectionString.includes('mongodb://')) {
      return connectionString.replace(/mongodb:\/\/[^:]+:[^@]+@/, 'mongodb://');
    }

    return connectionString;
  } catch (error) {
    console.warn('Error removing credentials:', error);
    return connectionString;
  }
};

/**
 * Generates a display-friendly connection name from a connection string
 * @param {string} connectionString - The database connection string
 * @returns {string} - Friendly display name
 */
export const generateConnectionDisplayName = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return 'Database Connection';
  }

  try {
    // MongoDB Atlas
    if (connectionString.includes('mongodb+srv://')) {
      const match = connectionString.match(/mongodb\+srv:\/\/(?:[^:]+:[^@]+@)?([^\/]+)/);
      if (match) {
        return `${match[1]} (Atlas)`;
      }
      return 'MongoDB Atlas';
    }
    
    // MongoDB Local/Network
    if (connectionString.includes('mongodb://')) {
      const match = connectionString.match(/mongodb:\/\/(?:[^:]+:[^@]+@)?([^\/]+)/);
      if (match) {
        return match[1];
      }
    return 'MongoDB Connection';
    }

    // Supabase (check first - can be URL or PostgreSQL connection string)
    if (connectionString.includes('.supabase.co')) {
      // Check if it's a project URL
      if (connectionString.startsWith('https://')) {
        const match = connectionString.match(/https?:\/\/([^\/]+)\.supabase\.co/);
        if (match) {
          return `${match[1]} (Supabase)`;
        }
        return 'Supabase';
      }
      // Check if it's a PostgreSQL connection string
      if (connectionString.includes('postgresql://') || connectionString.includes('postgres://')) {
        const match = connectionString.match(/postgres(ql)?:\/\/(?:[^:]+:[^@]+@)?([^\/:]+)/);
        if (match) {
          return `${match[2]} (Supabase)`;
        }
        return 'Supabase';
      }
    }
    
    // PostgreSQL
    if (connectionString.includes('postgresql://') || connectionString.includes('postgres://')) {
      const match = connectionString.match(/postgres(ql)?:\/\/(?:[^:]+:[^@]+@)?([^\/:]+)/);
      if (match) {
        return `${match[2]} (PostgreSQL)`;
      }
      return 'PostgreSQL Connection';
    }

    return 'Database Connection';
  } catch (error) {
    console.warn('Error generating display name:', error);
    return 'Database Connection';
  }
};