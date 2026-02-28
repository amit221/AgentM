const { BaseDatabaseBuilder } = require('./base-database-builder');

/**
 * PostgreSQLDatabaseBuilder - PostgreSQL-specific implementation
 * 
 * Handles all PostgreSQL-specific operations for spreadsheet imports.
 * 
 * Key differences from MongoDB:
 * - PostgreSQL requires explicit database creation before use
 * - Each database requires a separate connection pool
 * - Tables must be created with explicit schema before inserting data
 * - Has parameter limits per query (32,767 max)
 */
class PostgreSQLDatabaseBuilder extends BaseDatabaseBuilder {
  constructor(dbConnection) {
    super(dbConnection);
    // Track which databases we've already ensured exist
    this.ensuredDatabases = new Set();
    // Cache pools for target databases
    this.targetPools = new Map();
  }

  /**
   * Get database type name for logging
   */
  getDatabaseTypeName() {
    return 'PostgreSQL';
  }

  /**
   * Get the PostgreSQL adapter
   */
  getAdapter() {
    return this.dbConnection.adapters?.get('postgresql');
  }

  /**
   * Get the default PostgreSQL pool for a connection (usually 'postgres' database)
   */
  getDefaultPool(connectionId) {
    const adapter = this.getAdapter();
    return adapter?.pools?.get(connectionId);
  }

  /**
   * Get the PostgreSQL pool for a connection - legacy compatibility method
   * NOTE: This returns the DEFAULT pool, not necessarily for the target database
   */
  getClient(connectionId) {
    return this.getDefaultPool(connectionId);
  }

  /**
   * Check if a database exists
   */
  async databaseExists(connectionId, databaseName) {
    const pool = this.getDefaultPool(connectionId);
    if (!pool) {
      throw new Error(`No active PostgreSQL connection found for ID: ${connectionId}`);
    }

    try {
      const result = await pool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [databaseName]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error(`Error checking if database exists: ${error.message}`);
      return false;
    }
  }

  /**
   * Create a database if it doesn't exist
   */
  async createDatabaseIfNotExists(connectionId, databaseName) {
    // Skip if we've already ensured this database exists in this session
    const cacheKey = `${connectionId}:${databaseName}`;
    if (this.ensuredDatabases.has(cacheKey)) {
      return true;
    }

    const pool = this.getDefaultPool(connectionId);
    if (!pool) {
      throw new Error(`No active PostgreSQL connection found for ID: ${connectionId}`);
    }

    try {
      // Check if database already exists
      const exists = await this.databaseExists(connectionId, databaseName);
      if (exists) {
        console.log(`📊 Database "${databaseName}" already exists`);
        this.ensuredDatabases.add(cacheKey);
        return true;
      }

      // Create the database
      console.log(`📊 Creating database "${databaseName}"...`);
      const escapedDbName = this.escapeIdentifier(databaseName);
      await pool.query(`CREATE DATABASE ${escapedDbName}`);
      console.log(`✅ Database "${databaseName}" created successfully`);
      
      this.ensuredDatabases.add(cacheKey);
      return true;
    } catch (error) {
      // Handle race condition where database was created by another process
      if (error.code === '42P04') { // duplicate_database
        console.log(`📊 Database "${databaseName}" was created by another process`);
        this.ensuredDatabases.add(cacheKey);
        return true;
      }
      console.error(`❌ Failed to create database "${databaseName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create a pool for a specific target database
   * This is crucial because PostgreSQL connections are database-specific
   */
  async getPoolForDatabase(connectionId, databaseName) {
    const cacheKey = `${connectionId}:${databaseName}`;
    
    // Return cached pool if available
    if (this.targetPools.has(cacheKey)) {
      return this.targetPools.get(cacheKey);
    }

    const adapter = this.getAdapter();
    if (!adapter) {
      throw new Error('PostgreSQL adapter not found');
    }

    // Ensure the database exists first
    await this.createDatabaseIfNotExists(connectionId, databaseName);

    // Use the adapter's method to get/create a pool for this database
    try {
      const pool = adapter.getPoolForDatabase(connectionId, databaseName);
      
      // Test the connection
      await pool.query('SELECT 1');
      
      this.targetPools.set(cacheKey, pool);
      console.log(`✅ Connected to target database: ${databaseName}`);
      return pool;
    } catch (error) {
      console.error(`❌ Failed to get pool for database "${databaseName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Map AI design types to PostgreSQL types
   */
  mapToPostgreSQLType(designType) {
    const typeMap = {
      'string': 'TEXT',
      'text': 'TEXT',
      'number': 'NUMERIC',
      'integer': 'INTEGER',
      'int': 'INTEGER',
      'float': 'NUMERIC',
      'double': 'DOUBLE PRECISION',
      'decimal': 'NUMERIC',
      'boolean': 'BOOLEAN',
      'bool': 'BOOLEAN',
      'date': 'DATE',
      'datetime': 'TIMESTAMP',
      'timestamp': 'TIMESTAMP',
      'time': 'TIME',
      'array': 'JSONB',
      'object': 'JSONB',
      'json': 'JSONB'
    };
    
    const lowerType = (designType || 'string').toLowerCase();
    return typeMap[lowerType] || 'TEXT';
  }

  /**
   * Escape a PostgreSQL identifier (table/column name)
   */
  escapeIdentifier(name) {
    // Replace any double quotes with escaped double quotes
    const escaped = name.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  /**
   * Create a PostgreSQL table in the TARGET database
   */
  async createTable(connectionId, database, tableName, columns, mapping) {
    // Get pool for the TARGET database (not the default connection database)
    const pool = await this.getPoolForDatabase(connectionId, database);
    
    // Map field types from the transformation rules to PostgreSQL types
    const fieldMappings = mapping?.fieldMappings || [];
    const columnDefs = columns.map(col => {
      const fieldMapping = fieldMappings.find(fm => fm.targetField === col);
      let pgType = 'TEXT'; // Default type
      
      if (fieldMapping && fieldMapping.targetType) {
        pgType = this.mapToPostgreSQLType(fieldMapping.targetType);
      }
      
      // Escape column name
      const escapedCol = this.escapeIdentifier(col);
      return `${escapedCol} ${pgType}`;
    }).join(', ');
    
    // Create table (drop if exists for clean import)
    const escapedTableName = this.escapeIdentifier(tableName);
    const createQuery = `
      DROP TABLE IF EXISTS ${escapedTableName} CASCADE;
      CREATE TABLE ${escapedTableName} (
        id SERIAL PRIMARY KEY,
        ${columnDefs}
      );
    `;
    
    console.log(`📊 Creating PostgreSQL table: ${tableName} in database: ${database}`);
    await pool.query(createQuery);
    console.log(`✅ Table ${tableName} created successfully`);
  }

  /**
   * Calculate the maximum batch size based on number of columns
   * PostgreSQL has a limit of 32,767 parameters per query
   */
  calculateMaxBatchSize(columnCount) {
    const PG_PARAM_LIMIT = 32767;
    const SAFETY_MARGIN = 0.9; // Use 90% of limit for safety
    const maxParams = Math.floor(PG_PARAM_LIMIT * SAFETY_MARGIN);
    return Math.max(1, Math.floor(maxParams / columnCount));
  }

  /**
   * Insert a batch of rows into PostgreSQL in the TARGET database
   */
  async insertBatch(connectionId, database, tableName, columns, rows) {
    if (!rows || rows.length === 0) return 0;
    if (!columns || columns.length === 0) {
      console.error('❌ No columns provided for insert');
      return 0;
    }
    
    // Get pool for the TARGET database (not the default connection database)
    const pool = await this.getPoolForDatabase(connectionId, database);
    
    // Calculate safe batch size based on column count
    const columnCount = columns.length;
    const maxBatchSize = this.calculateMaxBatchSize(columnCount);
    
    // If rows exceed max batch size, split into smaller batches
    if (rows.length > maxBatchSize) {
      console.log(`📊 Splitting batch: ${rows.length} rows into chunks of ${maxBatchSize} (${columnCount} columns)`);
      let totalInserted = 0;
      for (let i = 0; i < rows.length; i += maxBatchSize) {
        const chunk = rows.slice(i, i + maxBatchSize);
        const inserted = await this.insertBatchInternal(pool, tableName, columns, chunk);
        totalInserted += inserted;
      }
      return totalInserted;
    }
    
    return await this.insertBatchInternal(pool, tableName, columns, rows);
  }

  /**
   * Internal method to insert a batch of rows
   */
  async insertBatchInternal(pool, tableName, columns, rows) {
    // Convert columns to array to ensure consistent iteration
    const columnArray = Array.isArray(columns) ? columns : Array.from(columns);
    const columnCount = columnArray.length;
    
    // Build parameterized INSERT query
    const placeholders = [];
    const values = [];
    let paramIndex = 1;
    
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      const rowPlaceholders = [];
      
      for (let colIdx = 0; colIdx < columnCount; colIdx++) {
        const col = columnArray[colIdx];
        rowPlaceholders.push(`$${paramIndex++}`);
        
        let value = row[col];
        // Convert objects/arrays to JSON string for JSONB columns
        if (value !== null && value !== undefined && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        values.push(value);
      }
      
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }
    
    // Validate that placeholders and values are in sync
    const expectedParams = rows.length * columnCount;
    if (values.length !== expectedParams) {
      console.error(`❌ Parameter mismatch: expected ${expectedParams} values, got ${values.length}`);
      console.error(`   Rows: ${rows.length}, Columns: ${columnCount}`);
      throw new Error(`Parameter count mismatch: expected ${expectedParams}, got ${values.length}`);
    }
    
    const escapedTableName = this.escapeIdentifier(tableName);
    const columnNames = columnArray.map(c => this.escapeIdentifier(c)).join(', ');
    const insertQuery = `INSERT INTO ${escapedTableName} (${columnNames}) VALUES ${placeholders.join(', ')}`;
    
    try {
      const result = await pool.query(insertQuery, values);
      return result.rowCount || rows.length;
    } catch (error) {
      console.error(`❌ PostgreSQL insert error: ${error.message}`);
      console.error(`   Query had ${placeholders.length} row placeholders, ${values.length} values`);
      throw error;
    }
  }

  /**
   * Create indexes on a PostgreSQL table in the TARGET database
   */
  async createIndexes(connectionId, database, tableName, indexes) {
    if (!indexes || indexes.length === 0) {
      return;
    }

    // Get pool for the TARGET database
    const pool = await this.getPoolForDatabase(connectionId, database);
    
    const escapedTableName = this.escapeIdentifier(tableName);
    
    for (const index of indexes) {
      try {
        const indexColumns = Object.keys(index.fields);
        const indexName = `idx_${tableName}_${indexColumns.join('_')}`.substring(0, 63); // PostgreSQL limit
        const escapedIndexName = this.escapeIdentifier(indexName);
        const columns = indexColumns.map(col => this.escapeIdentifier(col)).join(', ');
        const unique = index.options?.unique ? 'UNIQUE ' : '';
        
        const createIndexQuery = `CREATE ${unique}INDEX IF NOT EXISTS ${escapedIndexName} ON ${escapedTableName} (${columns})`;
        await pool.query(createIndexQuery);
        console.log(`  ✅ Created index: ${indexName}`);
      } catch (error) {
        console.warn(`  ⚠️ Failed to create index:`, error.message);
      }
    }
  }

  /**
   * Clean up resources when done
   */
  cleanup() {
    this.ensuredDatabases.clear();
    this.targetPools.clear();
  }
}

module.exports = PostgreSQLDatabaseBuilder;
