/**
 * Serializer for safe data transfer through Electron's contextBridge
 * Handles deep nesting, circular references, and large objects
 */

const MAX_DEPTH = 50; // Safe limit well below contextBridge's 1000 limit
const MAX_ARRAY_LENGTH = 1000; // Limit array sizes
const MAX_OBJECT_KEYS = 100; // Limit object key count

/**
 * Safely serialize data for contextBridge transfer
 * @param {*} obj - The object to serialize
 * @param {number} maxDepth - Maximum nesting depth
 * @returns {*} Serialized object safe for contextBridge
 */
function serializeForContextBridge(obj, maxDepth = MAX_DEPTH) {
  const seen = new WeakSet();
  
  function serialize(value, depth = 0) {
    // Check depth limit
    if (depth > maxDepth) {
      return '[Max Depth Exceeded]';
    }
    
    // Handle primitives
    if (value === null || value === undefined) {
      return value;
    }
    
    if (typeof value !== 'object') {
      return value;
    }
    
    // Handle circular references
    if (seen.has(value)) {
      return '[Circular Reference]';
    }
    
    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    // Handle Buffer objects
    if (Buffer.isBuffer(value)) {
      return '[Buffer]';
    }
    
    // Handle Arrays
    if (Array.isArray(value)) {
      seen.add(value);
      const result = value.slice(0, MAX_ARRAY_LENGTH).map(item => serialize(item, depth + 1));
      if (value.length > MAX_ARRAY_LENGTH) {
        result.push(`[... ${value.length - MAX_ARRAY_LENGTH} more items]`);
      }
      return result;
    }
    
    // Handle plain objects
    seen.add(value);
    const result = {};
    const keys = Object.keys(value);
    const limitedKeys = keys.slice(0, MAX_OBJECT_KEYS);
    
    for (const key of limitedKeys) {
      try {
        result[key] = serialize(value[key], depth + 1);
      } catch (error) {
        result[key] = '[Serialization Error]';
      }
    }
    
    if (keys.length > MAX_OBJECT_KEYS) {
      result['__truncated__'] = `${keys.length - MAX_OBJECT_KEYS} more properties`;
    }
    
    return result;
  }
  
  return serialize(obj);
}

/**
 * Safely prepare settings data for contextBridge
 * Removes large/problematic data sections
 */
function prepareSettingsForContextBridge(settings) {
  if (!settings || typeof settings !== 'object') {
    return settings;
  }
  
  const safeSettings = { ...settings };
  
  // Remove potentially large data sections
  // These should be loaded separately when needed
  delete safeSettings.dashboards; // Dashboards can be huge
  delete safeSettings.conversations; // Conversations can be huge
  delete safeSettings.queryHistory; // History can be huge
  delete safeSettings.collectionSchemas; // Schemas can be huge
  
  // Serialize the remaining data
  return serializeForContextBridge(safeSettings, MAX_DEPTH);
}

/**
 * Safely prepare conversations for contextBridge
 */
function prepareConversationsForContextBridge(conversations) {
  if (!conversations || typeof conversations !== 'object') {
    return conversations;
  }
  
  const safeConversations = { ...conversations };
  
  // Limit conversation data depth
  if (Array.isArray(safeConversations.conversations)) {
    safeConversations.conversations = safeConversations.conversations.map(conv => {
      const safeConv = { ...conv };
      
      // Limit messages array
      if (Array.isArray(safeConv.messages)) {
        safeConv.messages = safeConv.messages.slice(0, 100); // Limit to last 100 messages
      }
      
      return safeConv;
    });
  }
  
  return serializeForContextBridge(safeConversations, MAX_DEPTH);
}

/**
 * Safely prepare dashboard data for contextBridge
 */
function prepareDashboardsForContextBridge(dashboards) {
  if (!dashboards || typeof dashboards !== 'object') {
    return dashboards;
  }
  
  // Limit the data returned for dashboards
  const safeDashboards = Array.isArray(dashboards) ? dashboards : Object.values(dashboards);
  
  return safeDashboards.map(dashboard => {
    const safeDashboard = {
      id: dashboard.id,
      name: dashboard.name,
      description: dashboard.description,
      layout: dashboard.layout,
      isDefault: dashboard.isDefault,
      createdAt: dashboard.createdAt,
      updatedAt: dashboard.updatedAt,
      widgets: {}
    };
    
    // Include widget metadata but not large data
    if (dashboard.widgets) {
      for (const [widgetId, widget] of Object.entries(dashboard.widgets)) {
        safeDashboard.widgets[widgetId] = {
          id: widget.id,
          type: widget.type,
          title: widget.title,
          description: widget.description,
          query: widget.query,
          chartConfig: widget.chartConfig,
          refreshInterval: widget.refreshInterval,
          lastUpdated: widget.lastUpdated,
          createdAt: widget.createdAt,
          // Database and connection info (required for widget execution)
          database: widget.database,
          connectionId: widget.connectionId,
          connectionString: widget.connectionString,
          connectionName: widget.connectionName,
          // Additional query context
          queryContext: widget.queryContext,
          collection: widget.collection,
          operation: widget.operation,
          executionTime: widget.executionTime,
          // Exclude large data like cached results
          // data: widget.data  // <-- Don't include this
        };
      }
    }
    
    return safeDashboard;
  });
}

module.exports = {
  serializeForContextBridge,
  prepareSettingsForContextBridge,
  prepareConversationsForContextBridge,
  prepareDashboardsForContextBridge,
  MAX_DEPTH
};
