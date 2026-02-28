const { Pool } = require('pg');
const BaseAdapter = require('./base-adapter');
const pgBinariesManager = require('../utils/pg-binaries-manager');

/**
 * PostgreSQLAdapter - PostgreSQL-specific implementation of BaseAdapter
 * 
 * This adapter provides PostgreSQL-specific functionality including:
 * - Native PostgreSQL connection pooling using pg driver
 * - SQL query execution (no shell needed - pg supports multiple queries)
 * - Schema generation via INFORMATION_SCHEMA (instant, no sampling)
 * - Transaction support
 */

class PostgreSQLAdapter extends BaseAdapter {
  constructor() {
    super();
    
    // Pool-per-database architecture for MongoDB-like flexibility
    // Structure: connectionId -> Map<databaseName, Pool>
    this.databasePools = new Map();
    
    // Store base connection configs (without database) for creating new pools
    // Structure: connectionId -> { host, port, user, password, ssl, etc. }
    this.connectionConfigs = new Map();
    
    // Keep legacy pools map for backward compatibility during transition
    this.pools = new Map(); // Map of connection IDs to default pg.Pool instances
    this.activeOperations = new Map(); // Map of operation IDs to cancellable queries
    this.generatingDatabases = new Set(); // Track databases currently generating schemas
    this.connectionOptions = new Map(); // Map of connection IDs to connection options (isSupabase)
  }

  /**
   * Parse PostgreSQL connection string into components
   */
  parseConnectionString(connectionString) {
    try {
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: url.port || 5432,
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1) || 'postgres',
        ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : undefined
      };
    } catch (error) {
      console.error('Failed to parse connection string:', error);
      return null;
    }
  }

  /**
   * Build connection string from config components
   */
  buildConnectionString(config, databaseName = null) {
    const db = databaseName || config.database || 'postgres';
    const sslParam = config.ssl ? '?sslmode=require' : '';
    return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${db}${sslParam}`;
  }

  /**
   * Get or create a pool for a specific database
   * This enables MongoDB-like database switching within the same connection
   */
  getPoolForDatabase(connectionId, databaseName) {
    // Get the pools map for this connection
    let pools = this.databasePools.get(connectionId);
    if (!pools) {
      pools = new Map();
      this.databasePools.set(connectionId, pools);
    }

    // Check if we already have a pool for this database
    if (pools.has(databaseName)) {
      return pools.get(databaseName);
    }

    // Create a new pool for this database
    const baseConfig = this.connectionConfigs.get(connectionId);
    if (!baseConfig) {
      throw new Error(`No connection config found for ${connectionId}`);
    }

    console.log(`🔄 Creating new pool for database: ${databaseName}`);
    
    const poolConfig = {
      host: baseConfig.host,
      port: baseConfig.port,
      user: baseConfig.user,
      password: baseConfig.password,
      database: databaseName,
      ssl: baseConfig.ssl,
      max: baseConfig.maxPoolSize || 10,
      connectionTimeoutMillis: baseConfig.timeout || 5000,
      idleTimeoutMillis: 30000
    };

    const newPool = new Pool(poolConfig);
    pools.set(databaseName, newPool);
    
    console.log(`✅ Created pool for database: ${databaseName} (connection: ${connectionId})`);
    
    return newPool;
  }

  /**
   * Get the default pool for a connection (the database specified in connection string)
   */
  getDefaultPool(connectionId) {
    return this.pools.get(connectionId);
  }

  /**
   * Get the database type identifier
   */
  getDatabaseType() {
    return 'postgresql';
  }

  // ===== CONNECTION MANAGEMENT =====

  /**
   * Normalize connection string to handle IPv6/IPv4 issues
   * Replaces 'localhost' with '127.0.0.1' to force IPv4 connection
   */
  normalizeConnectionString(connectionString) {
    // Replace localhost with 127.0.0.1 to avoid IPv6 resolution issues
    // This handles cases where PostgreSQL only listens on IPv4
    return connectionString.replace(/localhost/g, '127.0.0.1');
  }

  async connect(connectionString, options = {}) {
    try {
      // Normalize connection string to handle IPv6/IPv4 issues
      const normalizedConnectionString = this.normalizeConnectionString(connectionString);
      
      // Parse connection string to extract components for pool-per-database support
      const parsedConfig = this.parseConnectionString(normalizedConnectionString);
      if (!parsedConfig) {
        throw new Error('Invalid connection string format');
      }
      
      const poolConfig = {
        connectionString: normalizedConnectionString,
        max: options.maxPoolSize || 1,
        connectionTimeoutMillis: options.timeout || 5000,
        idleTimeoutMillis: 30000,
        ...options
      };

      const pool = new Pool(poolConfig);
      
      // Test the connection
      const testClient = await pool.connect();
      await testClient.query('SELECT 1');
      testClient.release();
      
      // Generate a unique connection ID
      const connectionId = `conn_${Date.now()}`;
      this.pools.set(connectionId, pool);
      this.clients.set(connectionId, pool); // For compatibility with base class
      this.connectionStrings.set(connectionId, connectionString); // Store original, not normalized
      
      // Store parsed config for creating additional pools for other databases
      this.connectionConfigs.set(connectionId, {
        ...parsedConfig,
        maxPoolSize: options.maxPoolSize || 1,
        timeout: options.timeout || 5000
      });
      
      // Initialize the database pools map with the default database
      const pools = new Map();
      pools.set(parsedConfig.database, pool);
      this.databasePools.set(connectionId, pools);
      
      // Detect if this is a Supabase connection
      const isSupabase = connectionString.includes('.supabase.co');
      this.connectionOptions.set(connectionId, { isSupabase });
      
      console.log('✅ Successfully connected to PostgreSQL', {
        connectionId,
        defaultDatabase: parsedConfig.database,
        poolsSize: this.pools.size,
        isSupabase
      });

      return {
        success: true,
        message: 'Connected successfully',
        connectionId,
        isSupabase,
        defaultDatabase: parsedConfig.database
      };
    } catch (error) {
      console.error('❌ PostgreSQL connection error:', error);
      
      // Provide helpful error message for connection refused errors
      let errorMessage = error.message;
      if (error.code === 'ECONNREFUSED') {
        const isIPv6 = error.address === '::1' || error.address === '::';
        if (isIPv6) {
          errorMessage = `Connection refused. PostgreSQL may not be listening on IPv6. Try using '127.0.0.1' instead of 'localhost' in your connection string, or ensure PostgreSQL is running and accessible. Original error: ${error.message}`;
        } else {
          errorMessage = `Connection refused. Ensure PostgreSQL is running on ${error.address || 'the specified host'}:${error.port || 5432}. Original error: ${error.message}`;
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async disconnect(connectionId) {
    try {
      // Close all database-specific pools for this connection
      const pools = this.databasePools.get(connectionId);
      if (pools) {
        for (const [databaseName, pool] of pools) {
          try {
            await pool.end();
            console.log(`✅ PostgreSQL pool disconnected: ${connectionId}/${databaseName}`);
          } catch (error) {
            console.warn(`Warning closing pool ${connectionId}/${databaseName}:`, error.message);
          }
        }
        this.databasePools.delete(connectionId);
      }
      
      // Clean up legacy pool reference
      const legacyPool = this.pools.get(connectionId);
      if (legacyPool) {
        // Only close if not already closed via databasePools
        this.pools.delete(connectionId);
        this.clients.delete(connectionId);
      }

      this.connectionStrings.delete(connectionId);
      this.connectionOptions.delete(connectionId);
      this.connectionConfigs.delete(connectionId);
      
      console.log(`✅ Full disconnection completed for ${connectionId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get connection options
   */
  getConnectionOptions(connectionId) {
    return this.connectionOptions.get(connectionId) || { isSupabase: false };
  }

  async testConnection(connectionId) {
    try {
      const pool = this.pools.get(connectionId);
      if (!pool) {
        return { success: false, error: 'Not connected to PostgreSQL' };
      }

      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getConnectionStatus() {
    const connections = Array.from(this.pools.keys()).map(connectionId => ({
      connectionId,
      serverInfo: this.getServerInfo(connectionId),
      hasPool: this.pools.has(connectionId),
      hasConnectionString: this.connectionStrings.has(connectionId),
      poolStats: this.getPoolStats(connectionId)
    }));

    return {
      isConnected: this.pools.size > 0,
      totalConnections: this.pools.size,
      activeConnections: Array.from(this.pools.keys()),
      connections,
      databaseType: 'postgresql'
    };
  }

  getPoolStats(connectionId) {
    const pool = this.pools.get(connectionId);
    if (!pool) return null;
    
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };
  }

  /**
   * Override getServerInfo to parse PostgreSQL connection strings
   */
  getServerInfo(connectionId) {
    const connectionString = this.getConnectionString(connectionId, true);
    if (!connectionString) return null;
    
    try {
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: url.port || 5432,
        database: url.pathname.substring(1) || 'postgres'
      };
    } catch (error) {
      return { host: 'unknown', port: 'unknown', database: 'unknown' };
    }
  }

  // ===== DATABASE OPERATIONS =====

  async listDatabases(connectionId) {
    try {
      const pool = this.pools.get(connectionId);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      try {
        // Reset session state to ensure we see fresh catalog data
        // DISCARD ALL releases temp resources and clears cached catalog snapshots
        await client.query('DISCARD ALL');
        
        const result = await client.query(
          `SELECT datname FROM pg_database 
           WHERE datistemplate = false 
           ORDER BY datname`
        );
        
        return {
          success: true,
          databases: result.rows.map(row => row.datname)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error listing databases:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Helper to format object name with schema prefix
   */
  _formatObjectName(schemaName, objectName) {
    return schemaName === 'public' ? objectName : `${schemaName}.${objectName}`;
  }

  async listCollections(connectionId, databaseName, options = {}) {
    try {
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      try {
        // Single combined query using UNION ALL - reduces 6 round trips to 1
        // Each object type is tagged with 'obj_type' for easy categorization
        const result = await client.query(`
          SELECT 'table' as obj_type, table_schema as schema_name, table_name as obj_name, NULL as extra1, NULL as extra2
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND table_type = 'BASE TABLE'
          
          UNION ALL
          
          SELECT 'view' as obj_type, table_schema as schema_name, table_name as obj_name, NULL as extra1, NULL as extra2
          FROM information_schema.views 
          WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          
          UNION ALL
          
          SELECT 'matview' as obj_type, schemaname as schema_name, matviewname as obj_name, NULL as extra1, NULL as extra2
          FROM pg_matviews
          WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          
          UNION ALL
          
          SELECT 'function' as obj_type, n.nspname as schema_name, p.proname as obj_name, 
                 pg_get_function_arguments(p.oid) as extra1,
                 CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' END as extra2
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND p.prokind IN ('f', 'p')
          
          UNION ALL
          
          SELECT 'sequence' as obj_type, sequence_schema as schema_name, sequence_name as obj_name, NULL as extra1, NULL as extra2
          FROM information_schema.sequences
          WHERE sequence_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          
          UNION ALL
          
          SELECT 'type' as obj_type, n.nspname as schema_name, t.typname as obj_name, 
                 CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'c' THEN 'composite' WHEN 'd' THEN 'domain' END as extra1,
                 NULL as extra2
          FROM pg_type t
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND t.typtype IN ('e', 'c', 'd')
          AND t.typname NOT LIKE '\\_%'
          
          ORDER BY obj_type, schema_name, obj_name
        `);

        // Process combined results - categorize by obj_type
        const tables = [];
        const views = [];
        const materializedViews = [];
        const functions = [];
        const sequences = [];
        const types = [];

        for (const row of result.rows) {
          const formattedName = this._formatObjectName(row.schema_name, row.obj_name);
          
          switch (row.obj_type) {
            case 'table':
              tables.push({ name: formattedName, schema: row.schema_name, objectName: row.obj_name });
              break;
            case 'view':
              views.push({ name: formattedName, schema: row.schema_name, objectName: row.obj_name });
              break;
            case 'matview':
              materializedViews.push({ name: formattedName, schema: row.schema_name, objectName: row.obj_name });
              break;
            case 'function':
              functions.push({
                name: formattedName,
                fullSignature: `${row.obj_name}(${row.extra1 || ''})`,
                schema: row.schema_name,
                objectName: row.obj_name,
                arguments: row.extra1,
                kind: row.extra2
              });
              break;
            case 'sequence':
              sequences.push({ name: formattedName, schema: row.schema_name, objectName: row.obj_name });
              break;
            case 'type':
              types.push({ name: formattedName, schema: row.schema_name, objectName: row.obj_name, typeKind: row.extra1 });
              break;
          }
        }
        
        // Return both flat list (backward compatible) and categorized objects
        const collections = tables.map(t => t.name);
        
        return {
          success: true,
          collections, // Backward compatible - just table names
          objects: {
            tables,
            views,
            materializedViews,
            functions,
            sequences,
            types
          }
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error listing PostgreSQL objects:', error);
      
      // Check if connection is lost
      if (error.message.includes('connection') || error.message.includes('timeout')) {
        return {
          success: false,
          error: 'Connection lost',
          connectionLost: true
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createDatabase(connectionId, databaseName) {
    try {
      const pool = this.pools.get(connectionId);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      try {
        // PostgreSQL requires database names to be identifiers, not strings
        // Use double quotes for case sensitivity if needed
        await client.query(`CREATE DATABASE "${databaseName}"`);
        
        console.log(`✅ Created database "${databaseName}"`);
        
        return {
          success: true,
          message: `Database "${databaseName}" created successfully`,
          databaseName
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error creating database:', error);
      
      // Check if database already exists
      if (error.message && error.message.includes('already exists')) {
        return {
          success: false,
          error: `Database "${databaseName}" already exists`
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteDatabase(connectionId, databaseName) {
    try {
      const pool = this.pools.get(connectionId);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      try {
        // Terminate active connections to the database first
        await client.query(
          `SELECT pg_terminate_backend(pid) 
           FROM pg_stat_activity 
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [databaseName]
        );
        
        // Drop the database
        await client.query(`DROP DATABASE "${databaseName}"`);
        
        console.log(`✅ Deleted database "${databaseName}"`);
        
        return {
          success: true,
          message: `Database "${databaseName}" deleted successfully`
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting database:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== QUERY EXECUTION =====

  async executeRawQuery(conversationId, connectionId, databaseName, queryString, operationId = null, timeoutSeconds = 30) {
    try {
      if (!this.pools.has(connectionId)) {
        throw new Error(`No active connection found for connectionId: ${connectionId}`);
      }

      // Note: conversationId is passed but PostgreSQL doesn't need persistent shells per conversation
      // Each query is executed independently using the connection pool

      console.log(`🔍 Executing PostgreSQL query on connection ${connectionId}, database: ${databaseName}`);

      // Generate operationId if not provided
      if (!operationId) {
        operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      const startTime = Date.now();
      
      // Get a client from the pool
      const client = await pool.connect();
      
      try {
        // Set statement timeout for this query
        await client.query(`SET statement_timeout = ${timeoutSeconds * 1000}`);
        
        // Execute the query
        const result = await client.query(queryString);
        
        const executionTime = Date.now() - startTime;
        
        // Log execution
        const serverInfo = this.getServerInfo(connectionId);
        console.log(`✅ Query completed in ${executionTime}ms on ${serverInfo?.host}:${serverInfo?.port}`);
        
        // Format result based on query type
        let formattedResult;
        let count = 0;
        
        if (result.command === 'SELECT' || result.rows) {
          formattedResult = result.rows;
          count = result.rows.length;
        } else {
          // For INSERT, UPDATE, DELETE, etc.
          formattedResult = {
            command: result.command,
            rowCount: result.rowCount
          };
          count = result.rowCount || 0;
        }
        
        return {
          success: true,
          result: formattedResult,
          count,
          executionTime,
          serverInfo,
          operationId,
          databaseType: 'postgresql'
        };
      } finally {
        // Always release the client back to the pool
        client.release();
      }
    } catch (error) {
      console.error(`❌ Error executing PostgreSQL query:`, error);
      
      // Check if error is due to cancellation
      if (error.message && error.message.includes('cancelled')) {
        return {
          success: false,
          error: 'Query execution was cancelled by user',
          cancelled: true,
          operationId,
          databaseType: 'postgresql'
        };
      }
      
      return {
        success: false,
        error: error.message,
        operationId,
        databaseType: 'postgresql'
      };
    }
  }

  async executeScript(conversationId, connectionId, databaseName, script, operationId = null, timeoutSeconds = 60) {
    // PostgreSQL's pg driver supports multiple statements in a single query
    // No need for special script handling - just execute as a regular query
    return this.executeRawQuery(conversationId, connectionId, databaseName, script, operationId, timeoutSeconds);
  }

  async cancelOperation(operationId) {
    // Check if this is a tracked operation (like CSV import)
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.cancelled = true;
      console.log(`🛑 Marked operation ${operationId} for cancellation`);
      return {
        success: true,
        message: 'Operation marked for cancellation'
      };
    }
    
    // PostgreSQL query cancellation can be done via pg_cancel_backend()
    // For now, return not implemented for non-tracked operations
    return {
      success: false,
      error: 'Operation not found or query cancellation not yet implemented for PostgreSQL'
    };
  }

  // ===== SCHEMA OPERATIONS =====

  async generateCollectionIndex(connectionId, databaseName, silent = false, mainWindow = null, options = {}) {
    // Backend-level lock to prevent concurrent schema generation for the same database
    if (this.generatingDatabases.has(databaseName)) {
      console.log(`⏭️ [BACKEND] Schema generation already in progress for ${databaseName}, rejecting duplicate request`);
      return {
        success: false,
        error: 'Schema generation already in progress for this database'
      };
    }

    // Lock immediately before any async operations
    this.generatingDatabases.add(databaseName);
    console.log(`🔒 [BACKEND] Locked schema generation for ${databaseName}`);

    try {
      console.log(`📊 Generating schemas for PostgreSQL database: ${databaseName} ${silent ? '(silent mode)' : ''}`);
      
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }


      // Send initial progress
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress: 0,
          message: 'Starting schema generation...',
          tablesProcessed: 0,
          tablesTotal: 0,
          currentTable: null,
          estimatedTimeRemaining: null,
          isComplete: false
        });
      }

      const client = await pool.connect();
      let tables = [];
      let views = [];
      let materializedViews = [];
      let functions = [];
      let enumTypes = [];
      
      try {
        // Reset session state to ensure we see fresh catalog data
        // DISCARD ALL releases temp resources and clears cached catalog snapshots
        await client.query('DISCARD ALL');
        
        // First, get all available schemas to help with debugging
        const schemasResult = await client.query(
          `SELECT schema_name 
           FROM information_schema.schemata 
           WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           ORDER BY schema_name`
        );
        const availableSchemas = schemasResult.rows.map(row => row.schema_name);
        console.log(`📊 Available schemas:`, availableSchemas);
        
        // ======= TABLES =======
        const tablesResult = await client.query(
          `SELECT table_schema, table_name 
           FROM information_schema.tables 
           WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           AND table_type = 'BASE TABLE'
           ORDER BY table_schema, table_name`
        );
        tables = tablesResult.rows.map(row => ({ schema: row.table_schema, name: row.table_name, fullName: `${row.table_schema}.${row.table_name}` }));
        
        // ======= VIEWS =======
        const viewsResult = await client.query(
          `SELECT table_schema, table_name 
           FROM information_schema.views 
           WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           ORDER BY table_schema, table_name`
        );
        views = viewsResult.rows.map(row => ({ schema: row.table_schema, name: row.table_name, fullName: `${row.table_schema}.${row.table_name}` }));
        
        // ======= MATERIALIZED VIEWS =======
        const matViewsResult = await client.query(
          `SELECT schemaname as schema_name, matviewname as view_name
           FROM pg_matviews
           WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           ORDER BY schemaname, matviewname`
        );
        materializedViews = matViewsResult.rows.map(row => ({ schema: row.schema_name, name: row.view_name, fullName: `${row.schema_name}.${row.view_name}` }));
        
        // ======= FUNCTIONS (for AI context - signatures only) =======
        const functionsResult = await client.query(
          `SELECT 
             n.nspname as schema_name,
             p.proname as function_name,
             pg_get_function_arguments(p.oid) as arguments,
             pg_get_function_result(p.oid) as return_type,
             CASE p.prokind 
               WHEN 'f' THEN 'function'
               WHEN 'p' THEN 'procedure'
             END as kind
           FROM pg_proc p
           JOIN pg_namespace n ON p.pronamespace = n.oid
           WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           AND p.prokind IN ('f', 'p')
           ORDER BY n.nspname, p.proname
           LIMIT 100`  // Limit functions to avoid huge prompts
        );
        functions = functionsResult.rows.map(row => ({
          schema: row.schema_name,
          name: row.function_name,
          fullName: this._formatObjectName(row.schema_name, row.function_name),
          signature: `${row.function_name}(${row.arguments}) → ${row.return_type}`,
          kind: row.kind
        }));
        
        // ======= ENUM TYPES (critical for AI to know valid values) =======
        const enumsResult = await client.query(
          `SELECT 
             n.nspname as schema_name,
             t.typname as type_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
           FROM pg_type t
           JOIN pg_namespace n ON t.typnamespace = n.oid
           JOIN pg_enum e ON t.oid = e.enumtypid
           WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
           AND t.typtype = 'e'
           GROUP BY n.nspname, t.typname
           ORDER BY n.nspname, t.typname`
        );
        enumTypes = enumsResult.rows.map(row => ({
          schema: row.schema_name,
          name: row.type_name,
          fullName: this._formatObjectName(row.schema_name, row.type_name),
          values: row.enum_values
        }));
        
        console.log(`📊 Found: ${tables.length} tables, ${views.length} views, ${materializedViews.length} mat views, ${functions.length} functions, ${enumTypes.length} enum types`);
        
        if (tables.length === 0) {
          console.warn(`⚠️ No tables found in database ${databaseName}. Available schemas: ${availableSchemas.join(', ')}`);
        }
      } finally {
        client.release();
      }

      // Generate schemas for all tables, views, and materialized views
      const collectionSchemas = {};
      const viewSchemas = {};
      const materializedViewSchemas = {};
      
      // Calculate total objects to process
      const allObjects = [
        ...tables.map(t => ({ ...t, type: 'table' })),
        ...views.map(v => ({ ...v, type: 'view' })),
        ...materializedViews.map(m => ({ ...m, type: 'materializedView' }))
      ];
      const totalObjects = allObjects.length;
      const startTime = Date.now();
      
      for (let i = 0; i < allObjects.length; i++) {
        const obj = allObjects[i];
        const objName = obj.name;
        const objSchema = obj.schema || 'public';
        const processedCount = i + 1;
        const progress = Math.round((processedCount / totalObjects) * 100);
        
        const elapsedTime = (Date.now() - startTime) / 1000;
        const avgTimePerObj = elapsedTime / processedCount;
        const remainingObjs = totalObjects - processedCount;
        const estimatedTimeRemaining = Math.round(avgTimePerObj * remainingObjs);
        
        const displayName = obj.fullName || `${objSchema}.${objName}`;
        const typeLabel = obj.type === 'materializedView' ? 'materialized view' : obj.type;
        console.log(`📊 Processing ${typeLabel} ${processedCount}/${totalObjects}: ${displayName} (${progress}%)`);
        
        if (!silent) {
          this._sendSchemaProgress(mainWindow, {
            database: databaseName,
            progress,
            message: `Indexing ${typeLabel}s... (${processedCount}/${totalObjects})`,
            tablesProcessed: processedCount,
            tablesTotal: totalObjects,
            currentTable: displayName,
            estimatedTimeRemaining,
            isComplete: false
          });
        }
        
        try {
          const schema = await this.getSchema(connectionId, databaseName, objName, objSchema);
          
          if (schema.success) {
            const collectionKey = objSchema !== 'public' ? `${objSchema}.${objName}` : objName;
            const schemaData = {
              schema: schema.schema,
              indexes: schema.indexes || [],
              lastUpdated: new Date().toISOString()
            };
            
            // Store in appropriate collection based on type
            if (obj.type === 'table') {
              collectionSchemas[collectionKey] = schemaData;
            } else if (obj.type === 'view') {
              viewSchemas[collectionKey] = schemaData;
            } else if (obj.type === 'materializedView') {
              materializedViewSchemas[collectionKey] = schemaData;
            }
            
            console.log(`📊 Added schema for ${typeLabel} ${displayName} with ${Object.keys(schema.schema || {}).length} columns`);
          }
        } catch (error) {
          console.warn(`❌ Error generating schema for ${typeLabel} ${displayName}:`, error);
        }
      }

      // Send completion progress
      if (!silent) {
        this._sendSchemaProgress(mainWindow, {
          database: databaseName,
          progress: 100,
          message: 'Schema generation complete',
          tablesProcessed: totalObjects,
          tablesTotal: totalObjects,
          currentTable: null,
          estimatedTimeRemaining: 0,
          isComplete: true
        });
      }

      // Build PostgreSQL-specific metadata for AI agent
      const pgMetadata = {
        views: viewSchemas,
        materializedViews: materializedViewSchemas,
        functions: functions.map(f => ({ name: f.fullName, signature: f.signature, kind: f.kind })),
        enumTypes: enumTypes.reduce((acc, e) => {
          acc[e.fullName] = e.values;
          return acc;
        }, {})
      };

      // Save schemas to storage with PostgreSQL metadata
      if (this.settingsStorage) {
        await this.settingsStorage.saveCollectionSchemas(databaseName, collectionSchemas, pgMetadata);
      }

      console.log(`📊 PostgreSQL schema generation complete: ${Object.keys(collectionSchemas).length} tables, ${Object.keys(viewSchemas).length} views, ${Object.keys(materializedViewSchemas).length} mat views, ${functions.length} functions, ${enumTypes.length} enum types`);

      // Unlock after successful completion
      this.generatingDatabases.delete(databaseName);
      console.log(`🔓 [BACKEND] Unlocked schema generation for ${databaseName} (completed successfully)`);

      return {
        success: true,
        databaseName,
        schemas: collectionSchemas,
        metadata: pgMetadata
      };
    } catch (error) {
      console.error('❌ Error generating collection index:', error);
      
      // Unlock on error
      this.generatingDatabases.delete(databaseName);
      console.log(`🔓 [BACKEND] Unlocked schema generation for ${databaseName} (error)`);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send schema generation progress updates to renderer
   */
  _sendSchemaProgress(mainWindow, progressData) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('schema-generation-progress', progressData);
    }
  }

  async getSchema(connectionId, databaseName, tableName, tableSchema = 'public') {
    try {
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      
      try {
        // Get column information from INFORMATION_SCHEMA
        // Support tables from any schema, not just 'public'
        const columnsResult = await client.query(
          `SELECT 
             column_name, 
             data_type, 
             is_nullable,
             column_default,
             character_maximum_length,
             numeric_precision,
             numeric_scale
           FROM information_schema.columns 
           WHERE table_schema = $1
           AND table_name = $2
           ORDER BY ordinal_position`,
          [tableSchema, tableName]
        );

        // Build schema object
        const schema = {};
        for (const row of columnsResult.rows) {
          let typeInfo = row.data_type;
          
          // Add length/precision info if available
          if (row.character_maximum_length) {
            typeInfo += `(${row.character_maximum_length})`;
          } else if (row.numeric_precision) {
            if (row.numeric_scale) {
              typeInfo += `(${row.numeric_precision},${row.numeric_scale})`;
            } else {
              typeInfo += `(${row.numeric_precision})`;
            }
          }
          
          // Add nullable info
          if (row.is_nullable === 'NO') {
            typeInfo += ' NOT NULL';
          }
          
          // Add default info
          if (row.column_default) {
            typeInfo += ` DEFAULT ${row.column_default}`;
          }
          
          schema[row.column_name] = typeInfo;
        }

        // Get indexes (support tables from any schema)
        const indexesResult = await client.query(
          `SELECT
             i.relname as index_name,
             a.attname as column_name,
             ix.indisunique as is_unique,
             ix.indisprimary as is_primary
           FROM pg_class t
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN pg_index ix ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
           WHERE t.relname = $1
           AND n.nspname = $2
           AND t.relkind = 'r'
           ORDER BY i.relname, a.attnum`,
          [tableName, tableSchema]
        );

        // Group indexes by name
        const indexesMap = new Map();
        for (const row of indexesResult.rows) {
          if (!indexesMap.has(row.index_name)) {
            indexesMap.set(row.index_name, {
              name: row.index_name,
              keys: [],
              unique: row.is_unique,
              primary: row.is_primary
            });
          }
          indexesMap.get(row.index_name).keys.push(row.column_name);
        }

        const indexes = Array.from(indexesMap.values()).map(idx => ({
          name: idx.name,
          keys: idx.keys.reduce((obj, col) => ({ ...obj, [col]: 1 }), {}),
          unique: idx.unique,
          primary: idx.primary
        }));

        return {
          success: true,
          schema,
          indexes
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting schema:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== COLLECTION/TABLE OPERATIONS =====

  async getCollectionStats(connectionId, databaseName, tableName) {
    try {
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      
      try {
        // Get estimated row count and sizes in a single query using pg_class statistics
        // This is MUCH faster than COUNT(*) for large tables - uses PostgreSQL's internal statistics
        // Note: reltuples is an estimate updated by VACUUM/ANALYZE, not exact but near-instant
        const statsResult = await client.query(
          `SELECT 
             c.reltuples::bigint as estimated_count,
             pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
             pg_total_relation_size(c.oid) as total_size_bytes,
             pg_size_pretty(pg_relation_size(c.oid)) as table_size,
             pg_relation_size(c.oid) as table_size_bytes,
             pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
             pg_indexes_size(c.oid) as indexes_size_bytes
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = $1 
             AND c.relkind = 'r'
             AND n.nspname NOT IN ('pg_catalog', 'information_schema')
           LIMIT 1`,
          [tableName]
        );

        // Handle case where table might not be found in pg_class
        const rowCount = statsResult.rows.length > 0 
          ? Math.max(0, parseInt(statsResult.rows[0].estimated_count) || 0)
          : 0;

        // Get indexes
        const indexesResult = await client.query(
          `SELECT
             i.relname as index_name,
             pg_size_pretty(pg_relation_size(i.oid)) as size,
             pg_relation_size(i.oid) as size_bytes,
             ix.indisunique as is_unique,
             ix.indisprimary as is_primary,
             array_agg(a.attname) as columns
           FROM pg_class t
           JOIN pg_index ix ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
           WHERE t.relname = $1
           GROUP BY i.relname, i.oid, ix.indisunique, ix.indisprimary`,
          [tableName]
        );

        // Use stats from pg_class query, with fallbacks for edge cases
        const stats = statsResult.rows[0] || {};

        return {
          success: true,
          stats: {
            documentCount: rowCount,
            isEstimate: true, // Flag to indicate this is an estimate, not exact count
            totalSize: stats.total_size || '0 B',
            totalSizeBytes: parseInt(stats.total_size_bytes) || 0,
            storageSize: stats.table_size || '0 B',
            storageSizeBytes: parseInt(stats.table_size_bytes) || 0,
            indexCount: indexesResult.rows.length,
            totalIndexSize: stats.indexes_size || '0 B',
            totalIndexSizeBytes: parseInt(stats.indexes_size_bytes) || 0,
            indexes: indexesResult.rows.map(idx => ({
              name: idx.index_name,
              keys: Array.isArray(idx.columns) 
                ? idx.columns.reduce((obj, col) => ({ ...obj, [col]: 1 }), {})
                : {},
              size: idx.size,
              sizeBytes: parseInt(idx.size_bytes),
              unique: idx.is_unique,
              primary: idx.is_primary
            }))
          }
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting collection stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteCollection(connectionId, databaseName, tableName) {
    try {
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      try {
        await client.query(`DROP TABLE "${tableName}" CASCADE`);
        
        console.log(`✅ Deleted table "${tableName}"`);
        
        return {
          success: true,
          message: `Table "${tableName}" deleted successfully`
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting table:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async duplicateCollection(targetConnectionId, sourceDatabaseName, sourceCollectionName, targetDatabaseName, targetCollectionName, sourceConnectionId = null, progressCallback = null) {
    // TODO: Implement table duplication for PostgreSQL
    return {
      success: false,
      error: 'Table duplication not yet implemented for PostgreSQL'
    };
  }

  /**
   * Duplicate a PostgreSQL database with method selection
   * @param {string} targetConnectionId - Target connection ID
   * @param {string} sourceDatabaseName - Source database name
   * @param {string} targetDatabaseName - Target database name
   * @param {string} sourceConnectionId - Source connection ID (optional, defaults to targetConnectionId)
   * @param {string} method - Duplication method ('auto', 'template', 'dump_restore')
   * @param {Function} progressCallback - Progress callback function
   */
  async duplicateDatabaseWithMethod(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, method = 'auto', progressCallback = null) {
    try {
      const effectiveSourceConnectionId = sourceConnectionId || targetConnectionId;
      
      // For PostgreSQL, auto defaults to template method (fastest for same-server)
      if (method === 'auto') {
        method = 'template';
      }

      if (progressCallback) {
        progressCallback({
          stage: 'preparing',
          message: `Starting database duplication using ${method} method...`,
          percent: 0
        });
      }

      console.log(`🔄 Duplicating PostgreSQL database "${sourceDatabaseName}" to "${targetDatabaseName}" using ${method} method`);

      if (method === 'template') {
        return await this.duplicateDatabaseViaTemplate(
          targetConnectionId,
          sourceDatabaseName,
          targetDatabaseName,
          effectiveSourceConnectionId,
          progressCallback
        );
      } else if (method === 'dump_restore') {
        // For dump/restore, we need pg_dump/pg_restore tools
        return {
          success: false,
          error: 'pg_dump/pg_restore method not yet implemented for PostgreSQL. Use template method instead.'
        };
      } else {
        throw new Error(`Unknown duplication method: ${method}`);
      }
    } catch (error) {
      console.error(`❌ Error in duplicateDatabaseWithMethod:`, error);
      return {
        success: false,
        error: error.message,
        method: method
      };
    }
  }

  /**
   * Duplicate database using CREATE DATABASE ... WITH TEMPLATE
   * This is the fastest method for same-server duplication
   */
  async duplicateDatabaseViaTemplate(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    try {
      // For template copy, both source and target must be on same server
      // and no active connections to source database
      const pool = this.pools.get(targetConnectionId);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      if (progressCallback) {
        progressCallback({
          stage: 'checking',
          message: 'Checking for active connections to source database...',
          percent: 10
        });
      }

      const client = await pool.connect();
      
      try {
        // Check if target database already exists
        const existsResult = await client.query(
          `SELECT 1 FROM pg_database WHERE datname = $1`,
          [targetDatabaseName]
        );
        
        if (existsResult.rows.length > 0) {
          return {
            success: false,
            error: `Database "${targetDatabaseName}" already exists`
          };
        }

        if (progressCallback) {
          progressCallback({
            stage: 'terminating_connections',
            message: 'Terminating active connections to source database...',
            percent: 20
          });
        }

        // Terminate all connections to the source database (required for template copy)
        await client.query(
          `SELECT pg_terminate_backend(pid) 
           FROM pg_stat_activity 
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [sourceDatabaseName]
        );

        if (progressCallback) {
          progressCallback({
            stage: 'copying',
            message: `Creating database "${targetDatabaseName}" from template "${sourceDatabaseName}"...`,
            percent: 40
          });
        }

        // Create the new database using the source as template
        // Note: We can't use parameterized queries for database names in DDL
        const escapedTarget = targetDatabaseName.replace(/"/g, '""');
        const escapedSource = sourceDatabaseName.replace(/"/g, '""');
        
        await client.query(
          `CREATE DATABASE "${escapedTarget}" WITH TEMPLATE "${escapedSource}"`
        );

        if (progressCallback) {
          progressCallback({
            stage: 'completed',
            message: `Database "${targetDatabaseName}" created successfully`,
            percent: 100
          });
        }

        console.log(`✅ Successfully duplicated PostgreSQL database "${sourceDatabaseName}" to "${targetDatabaseName}"`);

        return {
          success: true,
          message: `Database "${targetDatabaseName}" created successfully from "${sourceDatabaseName}"`,
          method: 'template'
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error duplicating PostgreSQL database:', error);
      
      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.message.includes('being accessed by other users')) {
        errorMessage = `Cannot copy database "${sourceDatabaseName}" because it has active connections. Please close all connections to the source database and try again.`;
      } else if (error.message.includes('already exists')) {
        errorMessage = `Database "${targetDatabaseName}" already exists. Please choose a different name.`;
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Duplicate database (legacy method for backward compatibility)
   */
  async duplicateDatabase(targetConnectionId, sourceDatabaseName, targetDatabaseName, sourceConnectionId = null, progressCallback = null) {
    // Use template method by default for PostgreSQL
    return await this.duplicateDatabaseWithMethod(
      targetConnectionId,
      sourceDatabaseName,
      targetDatabaseName,
      sourceConnectionId,
      'template',
      progressCallback
    );
  }

  /**
   * Check if dump/restore tools are available
   */
  async checkDumpRestoreAvailability() {
    // For PostgreSQL, we would check for pg_dump and pg_restore
    // For now, return that only template method is available
    return {
      available: true,
      methods: ['template'],
      message: 'PostgreSQL template copy is available. pg_dump/pg_restore support coming soon.'
    };
  }

  // ===== INDEX OPERATIONS =====

  async createIndex(connectionId, databaseName, tableName, keys, options = {}) {
    try {
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      
      try {
        // Build index name
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const indexName = options.name || `idx_${tableName}_${keyArray.join('_')}`;
        
        // Build CREATE INDEX statement
        const uniqueClause = options.unique ? 'UNIQUE' : '';
        const columnsClause = keyArray.map(k => `"${k}"`).join(', ');
        
        const sql = `CREATE ${uniqueClause} INDEX "${indexName}" ON "${tableName}" (${columnsClause})`;
        
        await client.query(sql);
        
        console.log(`✅ Created index "${indexName}" on ${tableName}`);
        
        return {
          success: true,
          indexName,
          message: `Index "${indexName}" created successfully`
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error creating index:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async dropIndex(connectionId, databaseName, tableName, indexName) {
    try {
      // Use pool-per-database architecture for correct database targeting
      const pool = this.getPoolForDatabase(connectionId, databaseName);
      if (!pool) {
        throw new Error('Not connected to PostgreSQL');
      }

      const client = await pool.connect();
      
      try {
        // Check if it's a primary key index
        const checkResult = await client.query(
          `SELECT ix.indisprimary 
           FROM pg_class t
           JOIN pg_index ix ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           WHERE t.relname = $1 AND i.relname = $2`,
          [tableName, indexName]
        );
        
        if (checkResult.rows.length > 0 && checkResult.rows[0].indisprimary) {
          throw new Error('Cannot drop primary key index');
        }
        
        await client.query(`DROP INDEX "${indexName}"`);
        
        console.log(`✅ Dropped index "${indexName}" from ${tableName}`);
        
        return {
          success: true,
          message: `Index "${indexName}" dropped successfully`
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error dropping index:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== EXPORT/IMPORT OPERATIONS =====

  async checkExportToolsAvailability() {
    try {
      // Use the binaries manager to check availability
      const binariesStatus = await pgBinariesManager.checkBinariesAvailable();
      const pgDump = !!binariesStatus.pg_dump;
      
      if (pgDump) {
        console.log('✅ pg_dump is available at:', binariesStatus.pg_dump);
        if (binariesStatus.upgradeAvailable) {
          console.log(`📦 Upgrade available: ${binariesStatus.installedVersion?.full} → ${binariesStatus.latestVersion?.full}`);
        }
      } else {
        console.log('⚠️ pg_dump not found. Can be downloaded via settings.');
      }
      
      return {
        success: true,
        available: pgDump,
        tools: {
          pg_dump: pgDump,
          customExport: true // CSV export always available
        },
        binariesStatus: {
          available: pgDump, // Include in binariesStatus for frontend
          systemInstalled: binariesStatus.systemInstalled,
          localInstalled: binariesStatus.localInstalled,
          canDownload: pgBinariesManager.needsDownload(),
          upgradeAvailable: binariesStatus.upgradeAvailable,
          installedVersion: binariesStatus.installedVersion?.full,
          latestVersion: binariesStatus.latestVersion?.full
        }
      };
    } catch (e) {
      console.error('Error checking export tools:', e);
      return {
        success: true,
        available: false,
        tools: {
          pg_dump: false,
          customExport: true
        },
        binariesStatus: {
          available: false,
          systemInstalled: false,
          localInstalled: false,
          canDownload: true,
          upgradeAvailable: false
        }
      };
    }
  }

  async exportDatabase(options, progressCallback = null, operationId = null) {
    const { connectionId, databaseName, collections, format, outputPath, formatOptions } = options;
    
    try {
      // For CSV export, use custom export logic
      if (format === 'csv') {
        return await this.exportToFileFormat(options, progressCallback, operationId);
      }
      
      // For pg_dump, use the native tool
      if (format === 'pg_dump') {
        return await this.exportWithPgDump(options, progressCallback, operationId);
      }
      
      return {
        success: false,
        error: `Unsupported export format: ${format}. Use 'csv' or 'pg_dump'.`
      };
    } catch (error) {
      console.error('❌ PostgreSQL export error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async exportWithPgDump(options, progressCallback = null, operationId = null) {
    const { spawn } = require('child_process');
    const path = require('path');
    const { connectionId, databaseName, outputPath, formatOptions = {} } = options;
    
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString) {
      return { success: false, error: 'Connection not found' };
    }
    
    // Get the pg_dump binary path
    const binariesStatus = await pgBinariesManager.checkBinariesAvailable();
    if (!binariesStatus.pg_dump) {
      return { 
        success: false, 
        error: 'pg_dump is not available. Please download PostgreSQL client tools first.',
        needsDownload: true
      };
    }
    
    const pgDumpPath = binariesStatus.pg_dump;
    console.log(`🔧 Using pg_dump at: ${pgDumpPath}`);
    
    return new Promise((resolve) => {
      const args = [];
      
      // Add format option
      const pgFormat = formatOptions.format || 'plain';
      if (pgFormat === 'custom') {
        args.push('-Fc');
      } else if (pgFormat === 'directory') {
        args.push('-Fd');
      } else if (pgFormat === 'tar') {
        args.push('-Ft');
      }
      // plain format is default, no flag needed
      
      // Add other options
      if (formatOptions.clean) args.push('--clean');
      if (formatOptions.createDb) args.push('--create');
      if (formatOptions.dataOnly) args.push('--data-only');
      if (formatOptions.schemaOnly) args.push('--schema-only');
      
      // Schema filtering - by default only export 'public' schema
      // This avoids exporting Supabase/system schemas (auth, storage, etc.)
      if (formatOptions.schemas && formatOptions.schemas.length > 0) {
        // User specified schemas
        formatOptions.schemas.forEach(schema => args.push('--schema=' + schema));
      } else if (formatOptions.allSchemas) {
        // User explicitly wants all schemas - don't add schema filter
      } else {
        // Default: only export public schema (user data)
        args.push('--schema=public');
      }
      
      // Exclude system schemas that cause permission issues
      args.push('--exclude-schema=auth');
      args.push('--exclude-schema=storage');
      args.push('--exclude-schema=supabase_*');
      args.push('--exclude-schema=extensions');
      args.push('--exclude-schema=graphql');
      args.push('--exclude-schema=graphql_public');
      args.push('--exclude-schema=realtime');
      args.push('--exclude-schema=_realtime');
      args.push('--exclude-schema=pgsodium');
      args.push('--exclude-schema=pgsodium_masks');
      args.push('--exclude-schema=vault');
      
      // Make exports portable - don't include ownership/permissions
      // This avoids "must be owner" and "permission denied" errors on import
      args.push('--no-owner');
      args.push('--no-privileges');
      
      // Output file
      const outputFile = path.join(outputPath, `${databaseName}.${pgFormat === 'plain' ? 'sql' : 'dump'}`);
      args.push('-f', outputFile);
      
      // Build connection string with the correct database name
      // Replace the database in the connection string with the one we want to export
      let exportConnectionString = connectionString;
      try {
        const url = new URL(connectionString);
        // Replace the pathname (database) with the target database
        url.pathname = '/' + encodeURIComponent(databaseName);
        exportConnectionString = url.toString();
      } catch (e) {
        // If URL parsing fails, try regex replacement
        exportConnectionString = connectionString.replace(/\/[^/?]+(\?|$)/, `/${encodeURIComponent(databaseName)}$1`);
      }
      
      // Connection string must be passed with --dbname flag
      args.push(`--dbname=${exportConnectionString}`);
      
      console.log(`🔧 pg_dump args:`, args.map(a => a.includes('password') ? '[REDACTED]' : a));
      
      if (progressCallback) {
        progressCallback({ phase: 'exporting', message: 'Connecting to database...', progress: 5 });
      }
      
      const pgDump = spawn(pgDumpPath, args, { windowsHide: true });
      let stderr = '';
      let hasStartedDumping = false;
      
      pgDump.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pgDump.stdout.on('data', (data) => {
        // pg_dump outputs to file, but we can detect activity
        if (!hasStartedDumping && progressCallback) {
          hasStartedDumping = true;
          progressCallback({ phase: 'exporting', message: 'Dumping database...', progress: 30 });
        }
      });
      
      // Send intermediate progress
      if (progressCallback) {
        setTimeout(() => {
          if (!hasStartedDumping) {
            progressCallback({ phase: 'exporting', message: 'Running pg_dump...', progress: 15 });
          }
        }, 500);
      }
      
      pgDump.on('close', (code) => {
        if (code === 0) {
          if (progressCallback) {
            progressCallback({ phase: 'completed', message: 'Export completed', progress: 100 });
          }
          resolve({
            success: true,
            message: `Database exported to ${outputFile}`,
            outputFile
          });
        } else {
          if (progressCallback) {
            progressCallback({ phase: 'error', message: stderr || 'Export failed', progress: 0 });
          }
          resolve({
            success: false,
            error: stderr || `pg_dump exited with code ${code}`
          });
        }
      });
      
      pgDump.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to run pg_dump: ${error.message}`,
          needsDownload: true
        });
      });
    });
  }

  async exportToFileFormat(options, progressCallback = null, operationId = null) {
    const fs = require('fs');
    const path = require('path');
    const { connectionId, databaseName, collections, format, outputPath, formatOptions = {} } = options;
    
    // Use pool-per-database architecture for correct database targeting
    const pool = this.getPoolForDatabase(connectionId, databaseName);
    if (!pool) {
      return { success: false, error: 'Connection not found' };
    }
    
    try {
      // Create a subfolder with the database name
      const exportFolder = path.join(outputPath, databaseName);
      if (!fs.existsSync(exportFolder)) {
        fs.mkdirSync(exportFolder, { recursive: true });
      }
      
      let exportedCount = 0;
      const totalTables = collections.length;
      
      for (const tableName of collections) {
        if (progressCallback) {
          progressCallback({
            phase: 'exporting',
            message: `Exporting ${tableName}...`,
            progress: Math.round((exportedCount / totalTables) * 100)
          });
        }
        
        const result = await pool.query(`SELECT * FROM ${tableName}`);
        const rows = result.rows;
        
        // CSV export
        let content;
        if (rows.length === 0) {
          content = '';
        } else {
          const headers = Object.keys(rows[0]);
          const csvRows = [
            formatOptions.includeHeaders !== false ? headers.join(',') : null,
            ...rows.map(row => 
              headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
                  return `"${val.replace(/"/g, '""')}"`;
                }
                return String(val);
              }).join(',')
            )
          ].filter(Boolean);
          content = csvRows.join('\n');
        }
        
        const outputFile = path.join(exportFolder, `${tableName}.csv`);
        fs.writeFileSync(outputFile, content, 'utf8');
        exportedCount++;
      }
      
      if (progressCallback) {
        progressCallback({ phase: 'completed', message: 'Export completed', progress: 100 });
      }
      
      return {
        success: true,
        message: `Exported ${exportedCount} tables to ${exportFolder}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async checkImportToolsAvailability() {
    try {
      // Use the binaries manager to check availability
      const binariesStatus = await pgBinariesManager.checkBinariesAvailable();
      const pgRestore = !!binariesStatus.pg_restore;
      const psql = !!binariesStatus.psql;
      
      if (pgRestore) {
        console.log('✅ pg_restore is available at:', binariesStatus.pg_restore);
      } else {
        console.log('⚠️ pg_restore not found. Can be downloaded via settings.');
      }
      
      if (psql) {
        console.log('✅ psql is available at:', binariesStatus.psql);
      } else {
        console.log('⚠️ psql not found. Can be downloaded via settings.');
      }
      
      if (binariesStatus.upgradeAvailable) {
        console.log(`📦 Upgrade available: ${binariesStatus.installedVersion?.full} → ${binariesStatus.latestVersion?.full}`);
      }
      
      const available = pgRestore || psql;
      return {
        success: true,
        available,
        tools: {
          pg_restore: pgRestore,
          psql: psql
        },
        binariesStatus: {
          available, // Include in binariesStatus for frontend
          systemInstalled: binariesStatus.systemInstalled,
          localInstalled: binariesStatus.localInstalled,
          canDownload: pgBinariesManager.needsDownload(),
          upgradeAvailable: binariesStatus.upgradeAvailable,
          installedVersion: binariesStatus.installedVersion?.full,
          latestVersion: binariesStatus.latestVersion?.full
        }
      };
    } catch (e) {
      console.error('Error checking import tools:', e);
      return {
        success: true,
        available: false,
        tools: {
          pg_restore: false,
          psql: false
        },
        binariesStatus: {
          available: false,
          systemInstalled: false,
          localInstalled: false,
          canDownload: true,
          upgradeAvailable: false
        }
      };
    }
  }

  async importDatabase(options, progressCallback = null, operationId = null) {
    const { connectionId, databaseName, files, format } = options;
    
    console.log('📥 PostgreSQL importDatabase called:', { connectionId, databaseName, format, filesCount: files?.length });
    
    try {
      // For CSV import, use custom import logic
      if (format === 'csv') {
        console.log('📥 Using CSV import...');
        return await this.importFromFileFormat(options, progressCallback, operationId);
      }
      
      // For pg_restore, use the native tool
      if (format === 'pg_restore') {
        console.log('📥 Using pg_restore/psql import...');
        return await this.importWithPgRestore(options, progressCallback, operationId);
      }
      
      console.log('❌ Unsupported format:', format);
      return {
        success: false,
        error: `Unsupported import format: ${format}. Use 'csv' or 'pg_restore'.`
      };
    } catch (error) {
      console.error('❌ PostgreSQL import error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async importWithPgRestore(options, progressCallback = null, operationId = null) {
    const { spawn } = require('child_process');
    const { connectionId, databaseName, files } = options;
    
    if (!files || files.length === 0) {
      return { success: false, error: 'No files to import' };
    }
    
    const connectionString = this.connectionStrings.get(connectionId);
    if (!connectionString) {
      return { success: false, error: 'Connection not found' };
    }
    
    // Build connection string with the correct database name
    let importConnectionString = connectionString;
    if (databaseName) {
      try {
        const url = new URL(connectionString);
        // Replace the pathname (database) with the target database
        url.pathname = '/' + encodeURIComponent(databaseName);
        importConnectionString = url.toString();
      } catch (e) {
        // If URL parsing fails, try regex replacement
        importConnectionString = connectionString.replace(/\/[^/?]+(\?|$)/, `/${encodeURIComponent(databaseName)}$1`);
      }
    }
    
    // Get the binary paths
    const binariesStatus = await pgBinariesManager.checkBinariesAvailable();
    
    const file = files[0];
    const isPlainSQL = file.path.endsWith('.sql');
    
    // Check which tool we need
    if (isPlainSQL && !binariesStatus.psql) {
      return { 
        success: false, 
        error: 'psql is not available. Please download PostgreSQL client tools first.',
        needsDownload: true
      };
    }
    if (!isPlainSQL && !binariesStatus.pg_restore) {
      return { 
        success: false, 
        error: 'pg_restore is not available. Please download PostgreSQL client tools first.',
        needsDownload: true
      };
    }
    
    return new Promise((resolve) => {
      if (progressCallback) {
        progressCallback({ phase: 'importing', message: 'Connecting to database...', progress: 5 });
      }
      
      let proc;
      let args;
      let toolPath;
      
      if (isPlainSQL) {
        // Use psql for plain SQL files
        // psql syntax: psql --dbname=connection_string -f file.sql
        toolPath = binariesStatus.psql;
        args = [`--dbname=${importConnectionString}`, '-f', file.path];
        console.log(`🔧 Using psql at: ${toolPath}`);
      } else {
        // Use pg_restore for custom format dumps
        // pg_restore syntax: pg_restore --dbname=connection_string file.dump
        toolPath = binariesStatus.pg_restore;
        args = [`--dbname=${importConnectionString}`, file.path];
        console.log(`🔧 Using pg_restore at: ${toolPath}`);
      }
      
      console.log(`🔧 Import args:`, args.map(a => a.includes('password') ? '[REDACTED]' : a));
      console.log(`🔧 File path: ${file.path}`);
      
      proc = spawn(toolPath, args, { windowsHide: true });
      
      let stderr = '';
      let stdout = '';
      let statementCount = 0;
      
      // Send progress updates as SQL statements execute
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('📥 psql stdout:', data.toString().substring(0, 200));
        
        // Count statements executed
        const lines = data.toString().split('\n');
        statementCount += lines.filter(l => l.trim()).length;
        
        if (progressCallback && statementCount > 0) {
          // Show incremental progress (cap at 90%)
          const progress = Math.min(20 + (statementCount / 10), 90);
          progressCallback({ 
            phase: 'importing', 
            message: `Executing SQL statements... (${statementCount} processed)`, 
            progress: Math.round(progress) 
          });
        }
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('📥 psql stderr:', data.toString().substring(0, 200));
      });
      
      // Initial progress update
      if (progressCallback) {
        setTimeout(() => {
          if (statementCount === 0) {
            progressCallback({ phase: 'importing', message: 'Importing SQL file...', progress: 15 });
          }
        }, 500);
      }
      
      proc.on('error', (error) => {
        console.error('❌ Process spawn error:', error);
        resolve({
          success: false,
          error: `Failed to start import process: ${error.message}`
        });
      });
      
      proc.on('close', (code) => {
        console.log(`📥 Import process exited with code: ${code}`);
        console.log(`📥 stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
        
        if (code === 0) {
          if (progressCallback) {
            progressCallback({ phase: 'completed', message: 'Import completed successfully!', progress: 100 });
          }
          resolve({
            success: true,
            message: `Database restored from ${file.path}`
          });
        } else {
          // pg_restore may return non-zero for warnings, check stderr
          if (stderr.includes('ERROR')) {
            if (progressCallback) {
              progressCallback({ phase: 'error', message: 'Import completed with errors', progress: 100 });
            }
            resolve({
              success: false,
              error: stderr
            });
          } else {
            // Probably just warnings
            if (progressCallback) {
              progressCallback({ phase: 'completed', message: 'Import completed with warnings', progress: 100 });
            }
            resolve({
              success: true,
              message: `Database restored with warnings from ${file.path}`,
              warnings: stderr
            });
          }
        }
      });
    });
  }

  async importFromFileFormat(options, progressCallback = null, operationId = null) {
    const fs = require('fs');
    const { connectionId, databaseName, files, format } = options;
    
    // Use pool-per-database architecture for correct database targeting
    const pool = this.getPoolForDatabase(connectionId, databaseName);
    if (!pool) {
      return { success: false, error: 'Connection not found' };
    }
    
    // Track operation for potential cancellation
    if (operationId) {
      this.activeOperations.set(operationId, { cancelled: false });
    }
    
    const isOperationCancelled = () => {
      if (!operationId) return false;
      const op = this.activeOperations.get(operationId);
      return op && op.cancelled;
    };
    
    try {
      let importedCount = 0;
      const totalFiles = files.length;
      
      for (const file of files) {
        if (isOperationCancelled()) {
          return { success: false, error: 'Import cancelled by user', cancelled: true };
        }
        
        if (progressCallback) {
          progressCallback({
            phase: 'importing',
            message: `Importing ${file.name}...`,
            progress: Math.round((importedCount / totalFiles) * 50)
          });
        }
        
        const content = fs.readFileSync(file.path, 'utf8');
        const tableName = file.targetCollection;
        
        // CSV parsing
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length === 0) continue;
        
        // Parse headers and sanitize - replace empty headers with default names
        const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const headers = rawHeaders.map((h, i) => {
          // If header is empty or whitespace-only, give it a default name
          if (!h || !h.trim()) {
            return `column_${i + 1}`;
          }
          return h;
        });
        
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row = {};
          headers.forEach((h, i) => {
            row[h] = values[i] || null;
          });
          return row;
        });
        
        if (rows.length === 0) continue;
        
        // Drop existing table if override action
        if (file.action === 'override') {
          await pool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
        }
        
        // Create table from first row structure - filter out any empty column names
        const columns = Object.keys(rows[0]).filter(col => col && col.trim());
        if (columns.length === 0) {
          console.warn(`⚠️ Skipping table "${tableName}" - no valid columns found`);
          continue;
        }
        const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');
        await pool.query(`CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs})`);
        
        // Batch insert for performance - insert multiple rows at once
        const BATCH_SIZE = 2000;
        const totalRows = rows.length;
        let insertedRows = 0;
        
        console.log(`📥 Starting batch import of ${totalRows} rows into "${tableName}"...`);
        
        // Use a transaction for the entire file import
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            if (isOperationCancelled()) {
              await client.query('ROLLBACK');
              return { success: false, error: 'Import cancelled by user', cancelled: true };
            }
            
            const batch = rows.slice(i, i + BATCH_SIZE);
            
            // Build multi-row INSERT statement
            const columnNames = columns.map(c => `"${c}"`).join(', ');
            const valueStrings = [];
            const allValues = [];
            let paramIndex = 1;
            
            for (const row of batch) {
              const placeholders = columns.map(() => `$${paramIndex++}`).join(', ');
              valueStrings.push(`(${placeholders})`);
              columns.forEach(col => allValues.push(row[col]));
            }
            
            const insertQuery = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueStrings.join(', ')}`;
            await client.query(insertQuery, allValues);
            
            insertedRows += batch.length;
            
            // Update progress during row insertion
            if (progressCallback) {
              const fileProgress = (importedCount / totalFiles) * 50;
              const rowProgress = (insertedRows / totalRows) * (50 / totalFiles);
              progressCallback({
                phase: 'importing',
                message: `Importing ${file.name}: ${insertedRows}/${totalRows} rows...`,
                progress: Math.round(fileProgress + rowProgress + 50 * (importedCount / totalFiles))
              });
            }
          }
          
          await client.query('COMMIT');
          console.log(`✅ Successfully imported ${insertedRows} rows into "${tableName}"`);
        } catch (batchError) {
          await client.query('ROLLBACK');
          throw batchError;
        } finally {
          client.release();
        }
        
        importedCount++;
      }
      
      if (progressCallback) {
        progressCallback({ phase: 'completed', message: 'Import completed', progress: 100 });
      }
      
      return {
        success: true,
        message: `Imported ${importedCount} files`,
        importedFiles: importedCount
      };
    } catch (error) {
      console.error('❌ CSV import error:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      // Clean up operation tracking
      if (operationId) {
        this.activeOperations.delete(operationId);
      }
    }
  }

  // ===== POSTGRESQL CLIENT TOOLS MANAGEMENT =====

  /**
   * Download PostgreSQL client tools (pg_dump, pg_restore, psql)
   */
  async downloadPgTools(progressCallback = null) {
    try {
      console.log('📥 Starting PostgreSQL client tools download...');
      const result = await pgBinariesManager.downloadBinaries(progressCallback);
      return result;
    } catch (error) {
      console.error('❌ Failed to download PostgreSQL tools:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get PostgreSQL client tools status
   */
  async getPgToolsStatus() {
    try {
      const binariesStatus = await pgBinariesManager.checkBinariesAvailable();
      const size = pgBinariesManager.getBinariesSize();
      
      return {
        success: true,
        status: {
          pg_dump: binariesStatus.pg_dump,
          pg_restore: binariesStatus.pg_restore,
          psql: binariesStatus.psql,
          systemInstalled: binariesStatus.systemInstalled,
          localInstalled: binariesStatus.localInstalled,
          canDownload: pgBinariesManager.needsDownload(),
          localSize: size,
          localSizeFormatted: pgBinariesManager.formatBytes(size)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove downloaded PostgreSQL client tools
   */
  async removePgTools() {
    try {
      console.log('🗑️ Removing downloaded PostgreSQL client tools...');
      const result = await pgBinariesManager.removeBinaries();
      if (result.success) {
        console.log('✅ PostgreSQL tools removed');
      }
      return result;
    } catch (error) {
      console.error('❌ Failed to remove PostgreSQL tools:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ===== CLEANUP =====

  async cleanup() {
    console.log('🧹 Starting PostgreSQLAdapter cleanup...');
    
    // Close all database-specific pools (pool-per-database architecture)
    for (const [connectionId, pools] of this.databasePools) {
      for (const [databaseName, pool] of pools) {
        try {
          console.log(`🔌 Closing PostgreSQL pool: ${connectionId}/${databaseName}`);
          await pool.end();
        } catch (error) {
          console.warn(`Warning closing pool ${connectionId}/${databaseName}:`, error.message);
        }
      }
    }
    
    // Close legacy pools (for backward compatibility)
    for (const [connectionId, pool] of this.pools) {
      try {
        // Skip if already closed via databasePools
        if (!this.databasePools.has(connectionId)) {
          console.log(`🔌 Closing legacy PostgreSQL pool: ${connectionId}`);
          await pool.end();
        }
      } catch (error) {
        console.warn(`Warning closing pool ${connectionId}:`, error.message);
      }
    }
    
    this.databasePools.clear();
    this.connectionConfigs.clear();
    this.pools.clear();
    this.clients.clear();
    this.connectionStrings.clear();
    this.connectionOptions.clear();
    
    console.log('✅ PostgreSQLAdapter cleanup completed');
  }
}

module.exports = PostgreSQLAdapter;

