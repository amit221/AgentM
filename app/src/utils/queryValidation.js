/**
 * Query validation utilities for safety checks
 */

/**
 * Checks if a query is a read operation (safe to auto-execute)
 * @param {string} queryString - The MongoDB query string
 * @returns {boolean} True if it's a read operation
 */
export function isReadOperation(queryString) {
  if (!queryString || typeof queryString !== 'string') {
    return false;
  }

  const normalizedQuery = queryString.trim().toLowerCase();
  
  // Read operations that are safe to auto-execute
  const readOperations = [
    '.find(',
    '.findone(',
    '.aggregate(',
    '.count(',
    '.countdocuments(',
    '.estimateddocumentcount(',
    '.distinct(',
    '.explain(',
    '.stats(',
    '.indexes(',
    '.getindexes(',
    '.getcollectionnames(',
    '.listindexes('
  ];

  // Write operations that should NOT be auto-executed
  const writeOperations = [
    '.insert(',
    '.insertone(',
    '.insertmany(',
    '.update(',
    '.updateone(',
    '.updatemany(',
    '.replace(',
    '.replaceone(',
    '.delete(',
    '.deleteone(',
    '.deletemany(',
    '.remove(',
    '.findandmodify(',
    '.findoneandupdate(',
    '.findoneandreplace(',
    '.findoneanddelete(',
    '.drop(',
    '.dropdatabase(',
    '.dropindex(',
    '.dropindexes(',
    '.createindex(',
    '.createindexes(',
    '.renamecollection(',
    '.bulkwrite(',
    '.save(',
    '.mapreduce(',
    // Admin operations that should not be auto-executed
    '.adduser(',
    '.removeuser(',
    '.createuser(',
    '.dropuser(',
    '.createrole(',
    '.droprole(',
    '.grantrolestorole(',
    '.revokerolesfromrole(',
    '.grantroletouser(',
    '.revokerolesfromuser(',
    // Replication and sharding operations
    '.replsetadd(',
    '.replsetremove(',
    '.replsetreconfig(',
    '.shardcollection(',
    '.addshard(',
    '.removeshard('
  ];

  // First check if it's a write operation - if so, definitely not safe to auto-execute
  const hasWriteOperation = writeOperations.some(operation => normalizedQuery.includes(operation));
  if (hasWriteOperation) {
    
    return false;
  }

  // Then check if it's a known read operation
  const hasReadOperation = readOperations.some(operation => normalizedQuery.includes(operation));
  if (hasReadOperation) {
    console.log('✅ Query approved for auto-execute (read operation):', queryString);
  } else {
    console.log('❓ Query not recognized as read operation:', queryString);
  }
  
  return hasReadOperation;
}

/**
 * Checks if a query is a dangerous read operation (find or aggregate only)
 * @param {string} queryString - The MongoDB query string
 * @returns {boolean} True if it's a dangerous read operation
 */
function isDangerousReadOperation(queryString) {
  if (!queryString || typeof queryString !== 'string') {
    return false;
  }

  const normalizedQuery = queryString.trim().toLowerCase();
  
  // Only check for find and aggregate operations that can return large result sets
  const dangerousOperations = [
    '.find(',
    '.aggregate('
  ];

  return dangerousOperations.some(operation => normalizedQuery.includes(operation));
}

/**
 * Checks if a query has a limit clause
 * @param {string} queryString - The MongoDB query string
 * @returns {boolean} True if the query has a limit
 */
function hasLimitClause(queryString) {
  if (!queryString || typeof queryString !== 'string') {
    return false;
  }

  const normalizedQuery = queryString.trim().toLowerCase();
  
  // Check for limit in various forms
  const limitPatterns = [
    /\.limit\s*\(\s*\d+\s*\)/,  // .limit(number)
    /limit\s*:\s*\d+/,          // limit: number (in options)
    /["']limit["']\s*:\s*\d+/,  // "limit": number
  ];

  return limitPatterns.some(pattern => pattern.test(normalizedQuery));
}

/**
 * Checks if a query uses aggregation with $limit stage
 * @param {string} queryString - The MongoDB query string
 * @returns {boolean} True if aggregation has $limit stage
 */
function hasAggregationLimit(queryString) {
  if (!queryString || typeof queryString !== 'string') {
    return false;
  }

  const normalizedQuery = queryString.trim().toLowerCase();
  
  // Check if it's an aggregation query
  if (!normalizedQuery.includes('.aggregate(')) {
    return false;
  }

  // Check for $limit stage in aggregation pipeline
  const limitStagePatterns = [
    /\{\s*\$limit\s*:\s*\d+\s*\}/,     // { $limit: number }
    /["']\$limit["']\s*:\s*\d+/,       // "$limit": number
    /\{\s*["']\$limit["']\s*:\s*\d+\s*\}/,  // { "$limit": number }
  ];

  return limitStagePatterns.some(pattern => pattern.test(normalizedQuery));
}

/**
 * Main function to check if a query is dangerous (find/aggregate without limit)
 * @param {string} queryString - The MongoDB query string
 * @returns {boolean} True if it's a dangerous find/aggregate query without limits
 */
export function isDangerousReadQuery(queryString) {
  if (!isDangerousReadOperation(queryString)) {
    return false;
  }

  const hasLimit = hasLimitClause(queryString) || hasAggregationLimit(queryString);
  return !hasLimit;
}

/**
 * Extracts the collection name from a MongoDB query
 * @param {string} queryString - The MongoDB query string
 * @returns {string|null} The collection name or null if not found
 */
export function extractCollectionName(queryString) {
  if (!queryString || typeof queryString !== 'string') {
    return null;
  }

  const match = queryString.match(/db\.([^.]+)\./);
  return match ? match[1] : null;
}

/**
 * Suggests a safe limit for the query
 * @param {string} queryString - The MongoDB query string
 * @param {number} [defaultLimit=100] - The default limit to use
 * @returns {string} A suggested query with a reasonable limit
 */
export function suggestSafeQuery(queryString, defaultLimit = 100) {
  if (!queryString || typeof queryString !== 'string') {
    return queryString;
  }

  const trimmedQuery = queryString.trim();
  const safeLimit = Math.max(1, Math.min(defaultLimit, 10000)); // Ensure reasonable bounds
  
  // For find operations, add .limit(safeLimit) before any existing method chains
  if (trimmedQuery.includes('.find(')) {
    // Find the position after the find() method
    const findMatch = trimmedQuery.match(/\.find\([^)]*\)/);
    if (findMatch) {
      const findEnd = trimmedQuery.indexOf(findMatch[0]) + findMatch[0].length;
      const beforeFind = trimmedQuery.substring(0, findEnd);
      const afterFind = trimmedQuery.substring(findEnd);
      
      // Add limit if not already present
      if (!afterFind.toLowerCase().includes('.limit(')) {
        return `${beforeFind}.limit(${safeLimit})${afterFind}`;
      }
    }
  }
  
  // For aggregation, add $limit stage if missing
  if (trimmedQuery.includes('.aggregate(')) {
    // Find the position after the ".aggregate(" part
    const aggregateIndex = trimmedQuery.indexOf('.aggregate(');
    if (aggregateIndex !== -1) {
      const aggregateStart = aggregateIndex + '.aggregate('.length;
      const beforeAggregate = trimmedQuery.substring(0, aggregateStart);
      const afterAggregate = trimmedQuery.substring(aggregateStart);
      
      // Check if there's already a $limit stage in the pipeline
      // Use the same logic as hasAggregationLimit to ensure consistency
      if (!hasAggregationLimit(trimmedQuery)) {
        // Parse the pipeline to add $limit stage - handle both cases:
        // 1. Just the pipeline: [...]
        // 2. Pipeline with method calls: [...].toArray() or [...].explain()
        
        // Find the matching closing bracket for the pipeline array
        let bracketCount = 0;
        let pipelineEnd = -1;
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < afterAggregate.length; i++) {
          const char = afterAggregate[i];
          
          // Handle string literals to avoid counting brackets inside strings
          if ((char === '"' || char === "'") && (i === 0 || afterAggregate[i-1] !== '\\')) {
            if (!inString) {
              inString = true;
              stringChar = char;
            } else if (char === stringChar) {
              inString = false;
              stringChar = '';
            }
          }
          
          if (!inString) {
            if (char === '[') {
              bracketCount++;
            } else if (char === ']') {
              bracketCount--;
              if (bracketCount === 0) {
                pipelineEnd = i;
                break;
              }
            }
          }
        }
        
        if (pipelineEnd !== -1) {
          const pipelineContent = afterAggregate.substring(1, pipelineEnd).trim(); // Skip opening [
          const methodCalls = afterAggregate.substring(pipelineEnd + 1); // Everything after closing ]
          
          if (pipelineContent) {
            // Add $limit stage to existing pipeline, preserve method calls
            return `${beforeAggregate}[${pipelineContent}, { $limit: ${safeLimit} }]${methodCalls}`;
          } else {
            // Empty pipeline, add $limit stage, preserve method calls
            return `${beforeAggregate}[{ $limit: ${safeLimit} }]${methodCalls}`;
          }
        } else {
          // No pipeline brackets found, wrap in brackets and add $limit
          // This handles cases where the pipeline might be missing entirely
          return `${beforeAggregate}[{ $limit: ${safeLimit} }]`;
        }
      }
    }
  }

  return trimmedQuery;
}
