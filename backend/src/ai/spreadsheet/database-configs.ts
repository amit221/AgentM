/**
 * Database Configuration System
 * 
 * This file contains all database-specific configurations for the SpreadsheetAnalyzer.
 * To add a new database:
 * 1. Create a new config object implementing DatabaseConfig
 * 2. Add it to the DATABASE_CONFIGS map
 * 3. That's it! The analyzer will automatically use the new config.
 */

export interface DatabaseConfig {
  // Basic info
  name: string;
  displayName: string;
  
  // Naming conventions
  naming: {
    tableCase: 'camelCase' | 'snake_case' | 'PascalCase';
    columnCase: 'camelCase' | 'snake_case' | 'PascalCase';
    tableTerm: string;      // "collection", "table", etc.
    columnTerm: string;     // "field", "column", etc.
    rowTerm: string;        // "document", "row", etc.
  };
  
  // Type mappings (internal type -> database type)
  typeMap: {
    string: string;
    number: string;
    integer: string;
    decimal: string;
    boolean: string;
    date: string;
    datetime: string;
    array: string;
    object: string;
  };
  
  // Default type when unknown
  defaultType: string;
  
  // System prompt for AI
  systemPrompt: string;
  
  // Design principles for the analysis prompt
  designPrinciples: string[];
  
  // Field type handling instructions
  fieldTypeInstructions: string[];
}

// ============================================================================
// MongoDB Configuration
// ============================================================================
const MONGODB_CONFIG: DatabaseConfig = {
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
  
  systemPrompt: `You are a MongoDB database design expert. Analyze spreadsheet data and create optimal MongoDB database structures.

CORE PRINCIPLES:
- MongoDB is document-based, not relational
- Embed related data when it makes sense for queries
- Use arrays for one-to-many relationships within documents
- Only create separate collections for truly independent entities
- Design for read performance with denormalization
- Consider document size limits (16MB)

TRANSFORMATION TYPES:
- "direct": Simple field mapping
- "combine": Concatenate multiple fields
- "array": Split comma-separated values into arrays (only for true arrays)
- "dropdown": Single value from dropdown (do not split)
- "calculated": Pre-computed field (store result, not calculation)
- "skip": Exclude calculated fields that shouldn't be stored
- "nested": Create embedded object
- "number": Convert to numeric type
- "date": Convert to date type
- "boolean": Convert to boolean type

ANALYSIS APPROACH:
1. Understand the data relationships and patterns
2. Design document structure for optimal read performance
3. Create indexes based on data patterns and likely queries
4. Pre-compute frequently calculated values

NAMING CONVENTIONS:
- Use camelCase for collection names (e.g., "salesOrders", "userProfiles", "orderItems")
- Use camelCase for field names (e.g., "firstName", "orderDate", "totalAmount")
- Avoid underscores, spaces, or special characters in names

RESPONSE FORMAT:
Return ONLY valid, well-formed JSON with this exact structure. Ensure all arrays and objects are properly closed with matching brackets/braces. Do not include trailing commas:

IMPORTANT FIELD TYPE REPRESENTATIONS:
- Single string values (including dropdowns): "string"
- Numbers: "number" 
- Dates: "date"
- Booleans: "boolean"
- Arrays of strings: "array"
- Nested objects: use object structure

{
  "strategy": "single_collection" | "multiple_collections" | "hybrid",
  "reasoning": "Detailed explanation of design decisions",
  "collections": [
    {
      "name": "camelCaseCollectionName",
      "sourceSheets": ["sheet1", "sheet2"],
      "documentStructure": {
        "regularField": "string",
        "dropdownField": "string",
        "numberField": "number",
        "dateField": "date",
        "booleanField": "boolean",
        "arrayField": "array",
        "embedded_object": {
          "subfield": "string"
        }
      },
      "sampleDocument": {
        "regularField": "example_value",
        "dropdownField": "Active",
        "numberField": 123.45,
        "dateField": "2024-01-01T00:00:00.000Z",
        "booleanField": true,
        "arrayField": ["item1", "item2"],
        "embedded_object": {
          "subfield": "example"
        }
      },
      "indexes": [
        {
          "fields": {"regularField": 1},
          "options": {}
        }
      ]
    }
  ],
  "transformationRules": [
    {
      "sourceSheet": "Sheet1",
      "targetCollection": "collection_name",
      "mappingType": "direct",
      "transformationRules": [
        {
          "sourceColumns": ["col1"],
          "targetField": "field1",
          "transformation": "direct"
        }
      ]
    }
  ]
}`,

  designPrinciples: [
    'Consider embedding vs referencing based on data relationships',
    'Create indexes for frequently accessed fields',
    'Pre-compute values that are frequently calculated',
    'Design for read performance',
    'Keep documents under 16MB limit',
  ],

  fieldTypeInstructions: [
    'Dropdown fields: ALWAYS store as single string values, NEVER as arrays (use "string" type)',
    'Calculated fields: Consider pre-computing or skipping from import',
    'Array fields: Only split on commas when truly comma-separated lists (use "array" type)',
    'Regular fields: Direct mapping (use "string" type)',
  ],
};

// ============================================================================
// PostgreSQL Configuration
// ============================================================================
const POSTGRESQL_CONFIG: DatabaseConfig = {
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
  
  systemPrompt: `You are a PostgreSQL database design expert. Analyze spreadsheet data and create optimal PostgreSQL database structures.

CORE PRINCIPLES:
- PostgreSQL is a relational database with strict schemas
- Normalize data to reduce redundancy (but avoid over-normalization)
- Use proper data types for each column
- Create separate tables for distinct entities
- Use foreign keys for relationships between tables
- Design for data integrity and query efficiency

POSTGRESQL DATA TYPES TO USE:
- TEXT: For strings and text data
- INTEGER: For whole numbers
- NUMERIC: For decimal numbers (money, percentages)
- BOOLEAN: For true/false values
- DATE: For date-only values
- TIMESTAMP: For date and time values
- JSONB: For arrays or complex nested data

TRANSFORMATION TYPES:
- "direct": Simple field mapping (keep as TEXT)
- "number": Convert to NUMERIC or INTEGER
- "date": Convert to DATE or TIMESTAMP
- "boolean": Convert to BOOLEAN
- "array": Store as JSONB array
- "dropdown": Single value stored as TEXT
- "calculated": Pre-computed field stored as appropriate type
- "skip": Exclude from import

ANALYSIS APPROACH:
1. Identify distinct entities that should be separate tables
2. Determine relationships between tables (one-to-many, many-to-many)
3. Choose appropriate PostgreSQL data types
4. Create indexes for frequently queried columns
5. Consider constraints (NOT NULL, UNIQUE) where appropriate

NAMING CONVENTIONS:
- Use snake_case for table names (e.g., "sales_orders", "user_profiles", "order_items")
- Use snake_case for column names (e.g., "first_name", "order_date", "total_amount")
- Avoid spaces or special characters in names

RESPONSE FORMAT:
Return ONLY valid, well-formed JSON with this exact structure. Ensure all arrays and objects are properly closed with matching brackets/braces. Do not include trailing commas:

{
  "strategy": "single_collection" | "multiple_collections" | "hybrid",
  "reasoning": "Detailed explanation of design decisions including normalization choices",
  "collections": [
    {
      "name": "snake_case_table_name",
      "sourceSheets": ["sheet1", "sheet2"],
      "documentStructure": {
        "text_column": "TEXT",
        "number_column": "NUMERIC",
        "integer_column": "INTEGER",
        "date_column": "DATE",
        "timestamp_column": "TIMESTAMP",
        "boolean_column": "BOOLEAN",
        "json_column": "JSONB"
      },
      "sampleDocument": {
        "text_column": "example_value",
        "number_column": 123.45,
        "integer_column": 42,
        "date_column": "2024-01-01",
        "timestamp_column": "2024-01-01T12:00:00Z",
        "boolean_column": true,
        "json_column": ["item1", "item2"]
      },
      "indexes": [
        {
          "fields": {"text_column": 1},
          "options": {}
        }
      ]
    }
  ],
  "transformationRules": [
    {
      "sourceSheet": "Sheet1",
      "targetCollection": "table_name",
      "mappingType": "direct",
      "fieldMappings": [
        {
          "sourceField": "Column Name",
          "targetField": "column_name",
          "targetType": "TEXT"
        }
      ],
      "transformationRules": [
        {
          "sourceColumns": ["Column Name"],
          "targetField": "column_name",
          "transformation": "direct",
          "targetType": "TEXT"
        }
      ]
    }
  ]
}`,

  designPrinciples: [
    'Create properly normalized tables to avoid data redundancy',
    'Use appropriate PostgreSQL data types (TEXT, INTEGER, NUMERIC, BOOLEAN, DATE, TIMESTAMP, JSONB)',
    'Create indexes for columns that will be frequently searched or joined',
    'Design with referential integrity in mind',
  ],

  fieldTypeInstructions: [
    'Text fields: Use TEXT type',
    'Numeric fields: Use INTEGER for whole numbers, NUMERIC for decimals',
    'Date fields: Use DATE or TIMESTAMP as appropriate',
    'Boolean fields: Use BOOLEAN type',
    'Array/list fields: Use JSONB type',
    'Dropdown fields: Store as TEXT (single selected value)',
    'Calculated fields: Pre-compute and store as appropriate type',
  ],
};

// ============================================================================
// MySQL Configuration (Template for future)
// ============================================================================
const MYSQL_CONFIG: DatabaseConfig = {
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
  
  systemPrompt: `You are a MySQL database design expert. Analyze spreadsheet data and create optimal MySQL database structures.

CORE PRINCIPLES:
- MySQL is a relational database with strict schemas
- Normalize data to reduce redundancy
- Use proper data types for each column
- Create separate tables for distinct entities
- Use foreign keys for relationships between tables
- Consider storage engine (InnoDB for transactions, MyISAM for read-heavy)

MYSQL DATA TYPES TO USE:
- VARCHAR(255): For short strings
- TEXT: For long text
- INT: For whole numbers
- DECIMAL(10,2): For decimal numbers
- TINYINT(1): For boolean values (0/1)
- DATE: For date-only values
- DATETIME: For date and time values
- JSON: For arrays or complex nested data

NAMING CONVENTIONS:
- Use snake_case for table names
- Use snake_case for column names
- Avoid spaces or special characters

RESPONSE FORMAT:
Return valid JSON with strategy, reasoning, collections, and transformationRules.`,

  designPrinciples: [
    'Create properly normalized tables',
    'Use appropriate MySQL data types',
    'Create indexes for frequently queried columns',
    'Consider storage engine selection',
  ],

  fieldTypeInstructions: [
    'Text fields: Use VARCHAR or TEXT',
    'Numeric fields: Use INT or DECIMAL',
    'Boolean fields: Use TINYINT(1)',
    'Date fields: Use DATE or DATETIME',
    'Array fields: Use JSON type',
  ],
};

// ============================================================================
// SQLite Configuration (Template for future)
// ============================================================================
const SQLITE_CONFIG: DatabaseConfig = {
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
  
  systemPrompt: `You are a SQLite database design expert. Analyze spreadsheet data and create optimal SQLite database structures.

CORE PRINCIPLES:
- SQLite uses dynamic typing with type affinity
- Keep design simple - SQLite is meant for lightweight applications
- Use appropriate storage classes (NULL, INTEGER, REAL, TEXT, BLOB)
- Consider that SQLite stores everything in a single file

SQLITE DATA TYPES TO USE:
- TEXT: For strings and dates
- INTEGER: For whole numbers and booleans
- REAL: For decimal numbers
- BLOB: For binary data

NAMING CONVENTIONS:
- Use snake_case for table and column names
- Keep names short and descriptive

RESPONSE FORMAT:
Return valid JSON with strategy, reasoning, collections, and transformationRules.`,

  designPrinciples: [
    'Keep design simple and lightweight',
    'Use appropriate SQLite storage classes',
    'Consider file size limitations',
  ],

  fieldTypeInstructions: [
    'Text and dates: Use TEXT',
    'Numbers: Use INTEGER or REAL',
    'Boolean: Use INTEGER (0/1)',
    'Complex data: Store as JSON TEXT',
  ],
};

// ============================================================================
// Configuration Registry
// ============================================================================
export const DATABASE_CONFIGS: Map<string, DatabaseConfig> = new Map([
  ['mongodb', MONGODB_CONFIG],
  ['postgresql', POSTGRESQL_CONFIG],
  ['mysql', MYSQL_CONFIG],
  ['sqlite', SQLITE_CONFIG],
]);

// Default configuration
export const DEFAULT_DATABASE = 'mongodb';

/**
 * Get configuration for a database type
 */
export function getDatabaseConfig(databaseType: string): DatabaseConfig {
  const config = DATABASE_CONFIGS.get(databaseType.toLowerCase());
  if (!config) {
    console.warn(`Unknown database type: ${databaseType}, falling back to ${DEFAULT_DATABASE}`);
    return DATABASE_CONFIGS.get(DEFAULT_DATABASE)!;
  }
  return config;
}

/**
 * Get list of supported database types
 */
export function getSupportedDatabases(): string[] {
  return Array.from(DATABASE_CONFIGS.keys());
}

/**
 * Check if a database type is supported
 */
export function isDatabaseSupported(databaseType: string): boolean {
  return DATABASE_CONFIGS.has(databaseType.toLowerCase());
}

/**
 * Convert a name to the appropriate case for a database
 */
export function convertCase(name: string, caseType: 'camelCase' | 'snake_case' | 'PascalCase'): string {
  // First, split the name into words
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
export function sanitizeTableName(name: string, config: DatabaseConfig): string {
  const converted = convertCase(name, config.naming.tableCase);
  return converted || config.naming.tableTerm;
}

/**
 * Sanitize a column/field name for a specific database
 */
export function sanitizeColumnName(name: string, config: DatabaseConfig): string {
  const converted = convertCase(name, config.naming.columnCase);
  return converted || config.naming.columnTerm;
}

/**
 * Map an internal type to a database-specific type
 */
export function mapType(internalType: string, config: DatabaseConfig): string {
  const type = internalType.toLowerCase();
  return (config.typeMap as any)[type] || config.defaultType;
}

