/**
 * Database type utilities for multi-database support
 * Provides terminology, display names, and helper functions for MongoDB and PostgreSQL
 */

// Supported database types
export const DatabaseTypes = {
  MONGODB: 'mongodb',
  POSTGRESQL: 'postgresql',
  SUPABASE: 'supabase' // Treated as PostgreSQL but with different branding
};

// PostgreSQL object types for tree view categorization
export const PostgreSQLObjectTypes = {
  TABLES: 'tables',
  VIEWS: 'views',
  MATERIALIZED_VIEWS: 'materializedViews',
  FUNCTIONS: 'functions',
  SEQUENCES: 'sequences',
  TYPES: 'types'
};

/**
 * Gets the display labels for PostgreSQL object type categories
 * @returns {Object} Object type labels
 */
export function getPostgreSQLObjectLabels() {
  return {
    tables: { singular: 'Table', plural: 'Tables', icon: '📋' },
    views: { singular: 'View', plural: 'Views', icon: '👁️' },
    materializedViews: { singular: 'Materialized View', plural: 'Materialized Views', icon: '📊' },
    functions: { singular: 'Function', plural: 'Functions', icon: 'ƒ' },
    sequences: { singular: 'Sequence', plural: 'Sequences', icon: '🔢' },
    types: { singular: 'Type', plural: 'Types', icon: '📦' }
  };
}

/**
 * Gets the default query to view/inspect a PostgreSQL object
 * @param {string} objectType - The object type (tables, views, functions, etc.)
 * @param {string} objectName - The full object name (may include schema)
 * @param {Object} objectInfo - Additional object info (arguments for functions, etc.)
 * @param {number} limit - Limit for data queries
 * @returns {string} The query string
 */
export function getPostgreSQLObjectQuery(objectType, objectName, objectInfo = {}, limit = 100) {
  // Handle schema.name format
  const parts = objectName.includes('.') ? objectName.split('.') : ['public', objectName];
  const schema = parts[0];
  const name = parts[1] || parts[0];
  const fullName = `"${schema}"."${name}"`;
  
  switch (objectType) {
    case PostgreSQLObjectTypes.TABLES:
    case PostgreSQLObjectTypes.VIEWS:
    case PostgreSQLObjectTypes.MATERIALIZED_VIEWS:
      return `SELECT * FROM ${fullName} LIMIT ${limit}`;
    
    case PostgreSQLObjectTypes.FUNCTIONS:
      // Show function definition
      return `SELECT pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = '${name}'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')`;
    
    case PostgreSQLObjectTypes.SEQUENCES:
      return `SELECT * FROM ${fullName}`;
    
    case PostgreSQLObjectTypes.TYPES:
      // For enums, show values; for others, show definition
      if (objectInfo.typeKind === 'enum') {
        return `SELECT enumlabel as value, enumsortorder as sort_order
FROM pg_enum
WHERE enumtypid = '${fullName}'::regtype
ORDER BY enumsortorder`;
      }
      return `SELECT 
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
FROM pg_catalog.pg_attribute a
WHERE a.attrelid = '${fullName}'::regclass
AND a.attnum > 0
AND NOT a.attisdropped
ORDER BY a.attnum`;
    
    default:
      return `SELECT * FROM ${fullName} LIMIT ${limit}`;
  }
}

/**
 * Gets the display name for a database type
 * @param {string} dbType - The database type
 * @returns {string} Human-readable database name
 */
export function getDatabaseDisplayName(dbType) {
  switch (dbType) {
    case DatabaseTypes.POSTGRESQL:
      return 'PostgreSQL';
    case DatabaseTypes.SUPABASE:
      return 'Supabase';
    case DatabaseTypes.MONGODB:
    default:
      return 'MongoDB';
  }
}

/**
 * Gets terminology mapping for database-specific terms
 * @param {string} dbType - The database type
 * @returns {Object} Terminology mapping
 */
export function getTerminology(dbType) {
  const isRelational = isRelationalDatabase(dbType);
  
  return {
    // Data structure terms
    collection: isRelational ? 'table' : 'collection',
    Collection: isRelational ? 'Table' : 'Collection',
    collections: isRelational ? 'tables' : 'collections',
    Collections: isRelational ? 'Tables' : 'Collections',
    
    // Record terms
    document: isRelational ? 'row' : 'document',
    Document: isRelational ? 'Row' : 'Document',
    documents: isRelational ? 'rows' : 'documents',
    Documents: isRelational ? 'Rows' : 'Documents',
    
    // Field terms
    field: isRelational ? 'column' : 'field',
    Field: isRelational ? 'Column' : 'Field',
    fields: isRelational ? 'columns' : 'fields',
    Fields: isRelational ? 'Columns' : 'Fields',
    
    // Schema terms
    schema: isRelational ? 'table structure' : 'schema',
    Schema: isRelational ? 'Table Structure' : 'Schema',
    
    // Query terms
    query: isRelational ? 'SQL query' : 'query',
    Query: isRelational ? 'SQL Query' : 'Query',
    
    // Export/Import tools
    dumpTool: isRelational ? 'pg_dump' : 'mongodump',
    restoreTool: isRelational ? 'pg_restore' : 'mongorestore',
    
    // Connection fallback name
    connectionFallback: isRelational ? 'Database Connection' : 'MongoDB Connection'
  };
}

/**
 * Checks if the database type is a document database (NoSQL)
 * @param {string} dbType - The database type
 * @returns {boolean} True if document database
 */
export function isDocumentDatabase(dbType) {
  return dbType === DatabaseTypes.MONGODB;
}

/**
 * Checks if the database type is a relational database (SQL)
 * @param {string} dbType - The database type
 * @returns {boolean} True if relational database
 */
export function isRelationalDatabase(dbType) {
  return dbType === DatabaseTypes.POSTGRESQL || dbType === DatabaseTypes.SUPABASE;
}

/**
 * Checks if the database type supports a specific feature
 * @param {string} dbType - The database type
 * @param {string} feature - The feature to check
 * @returns {boolean} True if feature is supported
 */
export function supportsFeature(dbType, feature) {
  const mongoFeatures = [
    'mongodump',
    'mongorestore',
    'aggregation_pipeline',
    'document_embedding',
    'flexible_schema',
    'mongosh'
  ];
  
  const postgresFeatures = [
    'pg_dump',
    'pg_restore',
    'sql_queries',
    'transactions',
    'foreign_keys',
    'views',
    'stored_procedures'
  ];
  
  const commonFeatures = [
    'json_export',
    'csv_export',
    'json_import',
    'csv_import',
    'indexes',
    'schema_info'
  ];
  
  if (commonFeatures.includes(feature)) {
    return true;
  }
  
  if (isDocumentDatabase(dbType)) {
    return mongoFeatures.includes(feature);
  }
  
  if (isRelationalDatabase(dbType)) {
    return postgresFeatures.includes(feature);
  }
  
  return false;
}

/**
 * Gets the default query for viewing data in a collection/table
 * @param {string} dbType - The database type
 * @param {string} collectionOrTable - The collection or table name
 * @param {number} limit - The limit for returned records
 * @returns {string} The query string
 */
export function getDefaultViewQuery(dbType, collectionOrTable, limit = 100) {
  if (!collectionOrTable || typeof collectionOrTable !== 'string') {
    if (isRelationalDatabase(dbType)) {
      return `SELECT * FROM table_name ORDER BY 1 DESC LIMIT ${limit}`;
    }
    return `db.collection.find().sort({ _id: -1 }).limit(${limit})`;
  }
  
  if (isRelationalDatabase(dbType)) {
    return `SELECT * FROM ${collectionOrTable} LIMIT ${limit}`;
  }
  
  return `db.${collectionOrTable}.find().sort({ _id: -1 }).limit(${limit})`;
}

/**
 * Gets the icon/logo path for a database type
 * @param {string} dbType - The database type
 * @returns {string} Path to the icon
 */
export function getDatabaseIcon(dbType) {
  switch (dbType) {
    case DatabaseTypes.POSTGRESQL:
      return './postgre.png';
    case DatabaseTypes.SUPABASE:
      return './supabase-logo-icon.png';
    case DatabaseTypes.MONGODB:
    default:
      return './MongoDB_Logomark_SpringGreen.png';
  }
}

/**
 * Normalizes database type string to a standard format
 * @param {string} dbType - The database type (may be in various formats)
 * @returns {string} Normalized database type
 */
export function normalizeDatabaseType(dbType) {
  if (!dbType) return DatabaseTypes.MONGODB;
  
  const normalized = String(dbType).toLowerCase().trim();
  
  if (normalized === 'postgresql' || normalized === 'postgres' || normalized === 'pg') {
    return DatabaseTypes.POSTGRESQL;
  }
  
  if (normalized === 'supabase') {
    return DatabaseTypes.SUPABASE;
  }
  
  if (normalized === 'mongodb' || normalized === 'mongo') {
    return DatabaseTypes.MONGODB;
  }
  
  return DatabaseTypes.MONGODB;
}

/**
 * Detects database type from a connection string
 * @param {string} connectionString - The connection string
 * @returns {string} Detected database type
 */
export function detectDatabaseTypeFromConnectionString(connectionString) {
  if (!connectionString) return DatabaseTypes.MONGODB;
  
  const connStr = connectionString.toLowerCase();
  
  // Check for Supabase first (before generic PostgreSQL) - Supabase URLs contain supabase.co or supabase.com
  if ((connStr.includes('postgresql://') || connStr.includes('postgres://')) && 
      (connStr.includes('supabase.co') || connStr.includes('supabase.com'))) {
    return DatabaseTypes.SUPABASE;
  }
  
  if (connStr.includes('postgresql://') || connStr.includes('postgres://')) {
    return DatabaseTypes.POSTGRESQL;
  }
  
  if (connStr.includes('mongodb://') || connStr.includes('mongodb+srv://')) {
    return DatabaseTypes.MONGODB;
  }
  
  // Default to MongoDB for backwards compatibility
  return DatabaseTypes.MONGODB;
}

