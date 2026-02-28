/**
 * Database Configuration System (Frontend/Electron)
 * 
 * This file contains all database-specific configurations for spreadsheet imports.
 * To add a new database:
 * 1. Create a new config object
 * 2. Add it to DATABASE_CONFIGS
 * 3. That's it!
 */

// ============================================================================
// MongoDB Configuration
// ============================================================================
const MONGODB_CONFIG = {
  name: 'mongodb',
  displayName: 'MongoDB',
  
  naming: {
    tableCase: 'camelCase',
    columnCase: 'camelCase',
    tableTerm: 'collection',
    columnTerm: 'field',
    rowTerm: 'document',
  },
  
  typeMap: {
    string: 'string',
    number: 'number',
    integer: 'number',
    decimal: 'number',
    boolean: 'boolean',
    date: 'date',
    datetime: 'date',
    array: 'array',
    object: 'object',
  },
  
  defaultType: 'string',
};

// ============================================================================
// PostgreSQL Configuration
// ============================================================================
const POSTGRESQL_CONFIG = {
  name: 'postgresql',
  displayName: 'PostgreSQL',
  
  naming: {
    tableCase: 'snake_case',
    columnCase: 'snake_case',
    tableTerm: 'table',
    columnTerm: 'column',
    rowTerm: 'row',
  },
  
  typeMap: {
    string: 'TEXT',
    number: 'NUMERIC',
    integer: 'INTEGER',
    decimal: 'NUMERIC',
    boolean: 'BOOLEAN',
    date: 'DATE',
    datetime: 'TIMESTAMP',
    array: 'JSONB',
    object: 'JSONB',
  },
  
  defaultType: 'TEXT',
};

// ============================================================================
// MySQL Configuration (Template for future)
// ============================================================================
const MYSQL_CONFIG = {
  name: 'mysql',
  displayName: 'MySQL',
  
  naming: {
    tableCase: 'snake_case',
    columnCase: 'snake_case',
    tableTerm: 'table',
    columnTerm: 'column',
    rowTerm: 'row',
  },
  
  typeMap: {
    string: 'VARCHAR(255)',
    number: 'DECIMAL(10,2)',
    integer: 'INT',
    decimal: 'DECIMAL(10,2)',
    boolean: 'TINYINT(1)',
    date: 'DATE',
    datetime: 'DATETIME',
    array: 'JSON',
    object: 'JSON',
  },
  
  defaultType: 'VARCHAR(255)',
};

// ============================================================================
// SQLite Configuration (Template for future)
// ============================================================================
const SQLITE_CONFIG = {
  name: 'sqlite',
  displayName: 'SQLite',
  
  naming: {
    tableCase: 'snake_case',
    columnCase: 'snake_case',
    tableTerm: 'table',
    columnTerm: 'column',
    rowTerm: 'row',
  },
  
  typeMap: {
    string: 'TEXT',
    number: 'REAL',
    integer: 'INTEGER',
    decimal: 'REAL',
    boolean: 'INTEGER',
    date: 'TEXT',
    datetime: 'TEXT',
    array: 'TEXT',
    object: 'TEXT',
  },
  
  defaultType: 'TEXT',
};

// ============================================================================
// Configuration Registry
// ============================================================================
const DATABASE_CONFIGS = {
  mongodb: MONGODB_CONFIG,
  postgresql: POSTGRESQL_CONFIG,
  mysql: MYSQL_CONFIG,
  sqlite: SQLITE_CONFIG,
};

const DEFAULT_DATABASE = 'mongodb';

/**
 * Get configuration for a database type
 */
function getDatabaseConfig(databaseType) {
  const type = (databaseType || DEFAULT_DATABASE).toLowerCase();
  const config = DATABASE_CONFIGS[type];
  if (!config) {
    console.warn(`Unknown database type: ${databaseType}, falling back to ${DEFAULT_DATABASE}`);
    return DATABASE_CONFIGS[DEFAULT_DATABASE];
  }
  return config;
}

/**
 * Get list of supported database types
 */
function getSupportedDatabases() {
  return Object.keys(DATABASE_CONFIGS);
}

/**
 * Check if a database type is supported
 */
function isDatabaseSupported(databaseType) {
  return databaseType && DATABASE_CONFIGS.hasOwnProperty(databaseType.toLowerCase());
}

/**
 * Check if a database is relational (SQL)
 */
function isRelationalDatabase(databaseType) {
  return ['postgresql', 'mysql', 'sqlite'].includes((databaseType || '').toLowerCase());
}

/**
 * Convert a name to the appropriate case
 */
function convertCase(name, caseType) {
  const words = name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(word => word.length > 0);

  if (words.length === 0) return 'unnamed';

  switch (caseType) {
    case 'camelCase':
      return words[0].toLowerCase() + 
             words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    
    case 'snake_case':
      return words.map(w => w.toLowerCase()).join('_');
    
    case 'PascalCase':
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    
    default:
      return name;
  }
}

/**
 * Sanitize a table/collection name for a specific database
 */
function sanitizeTableName(name, config) {
  const converted = convertCase(name, config.naming.tableCase);
  return converted || config.naming.tableTerm;
}

/**
 * Sanitize a column/field name for a specific database
 */
function sanitizeColumnName(name, config) {
  const converted = convertCase(name, config.naming.columnCase);
  return converted || config.naming.columnTerm;
}

/**
 * Map an internal type to a database-specific type
 */
function mapType(internalType, config) {
  const type = (internalType || 'string').toLowerCase();
  return config.typeMap[type] || config.defaultType;
}

module.exports = {
  DATABASE_CONFIGS,
  DEFAULT_DATABASE,
  getDatabaseConfig,
  getSupportedDatabases,
  isDatabaseSupported,
  isRelationalDatabase,
  convertCase,
  sanitizeTableName,
  sanitizeColumnName,
  mapType,
};

