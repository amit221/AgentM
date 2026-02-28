/**
 * Message factory functions to eliminate duplication in message creation
 * Standardizes message structure and reduces the 42 duplicate addMessageToQueue calls
 */

// Message type constants
export const MessageTypes = {
  USER_MESSAGE: 'USER_MESSAGE',
  AGENT_RESPONSE: 'AGENT_RESPONSE',
  AGENT_ERROR: 'AGENT_ERROR',
  QUERY_DISPLAY: 'QUERY_DISPLAY',
  QUERY_RESULT: 'QUERY_RESULT',
  QUERY_ERROR: 'QUERY_ERROR',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  OPERATION_STARTED: 'OPERATION_STARTED',
  OPERATION_STOPPED: 'OPERATION_STOPPED',
  PARAMETER_AUTOFILL_SUCCESS: 'PARAMETER_AUTOFILL_SUCCESS',
  PARAMETER_AUTOFILL_FAILED: 'PARAMETER_AUTOFILL_FAILED',
  PARAMETER_MANUAL_REQUIRED: 'PARAMETER_MANUAL_REQUIRED',
  DANGEROUS_QUERY_WARNING: 'DANGEROUS_QUERY_WARNING',
  SAFE_QUERY_APPLIED: 'SAFE_QUERY_APPLIED',
  FIX_ATTEMPT: 'FIX_ATTEMPT',
  OPTIMIZATION_SUGGESTION: 'OPTIMIZATION_SUGGESTION'
};

// Level-based prefixes
const LEVEL_PREFIXES = {
  error: '❌',
  warning: '⚠️',
  success: '✅',
  info: 'ℹ️'
};

// ID counter for consistent message IDs
let messageIdCounter = 1;

/**
 * Generate a unique message ID
 */
export function generateMessageId() {
  return messageIdCounter++;
}

/**
 * Reset the message ID counter (useful for testing)
 */
export function resetMessageIdCounter() {
  messageIdCounter = 1;
}

/**
 * Create a standardized timestamp
 */
export function createTimestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get default properties for a message type
 */
function getMessageDefaults(type) {
  switch (type) {
    case MessageTypes.USER_MESSAGE:
      return {
        isUser: true,
        showTypewriter: true
      };
      
    case MessageTypes.QUERY_DISPLAY:
      return {
        isQuery: true,
        content: '',
        showTypewriter: false
      };
      
    case MessageTypes.QUERY_RESULT:
      return {
        isResult: true,
        content: '',
        showTypewriter: false
      };
      
    case MessageTypes.ERROR:
    case MessageTypes.AGENT_ERROR:
    case MessageTypes.QUERY_ERROR:
      return {
        level: 'error',
        showTypewriter: true
      };
      
    case MessageTypes.WARNING:
      return {
        level: 'warning',
        showTypewriter: true
      };
      
    case MessageTypes.SUCCESS:
    case MessageTypes.PARAMETER_AUTOFILL_SUCCESS:
    case MessageTypes.SAFE_QUERY_APPLIED:
      return {
        level: 'success',
        showTypewriter: false
      };
      
    case MessageTypes.INFO:
    case MessageTypes.PARAMETER_MANUAL_REQUIRED:
      return {
        level: 'info',
        showTypewriter: false
      };
      
    case MessageTypes.DANGEROUS_QUERY_WARNING:
      return {
        level: 'warning',
        showTypewriter: true,
        isDangerousQueryWarning: true
      };
      
    case MessageTypes.AGENT_RESPONSE:
    case MessageTypes.FIX_ATTEMPT:
    case MessageTypes.OPTIMIZATION_SUGGESTION:
      return {
        showTypewriter: true
      };
      
    default:
      return {
        showTypewriter: false
      };
  }
}

/**
 * Add level prefix to content if needed
 */
function addLevelPrefix(content, level) {
  if (!level || !LEVEL_PREFIXES[level]) return content;
  
  const prefix = LEVEL_PREFIXES[level];
  // Don't add prefix if it already exists
  if (content.startsWith(prefix)) return content;
  
  return `${prefix} ${content}`;
}

/**
 * Base message factory function
 */
export function createMessage(type, options = {}) {
  const defaults = getMessageDefaults(type);
  const timestamp = options.timestamp || createTimestamp();
  const id = options.id || generateMessageId();
  
  let content = options.content || '';
  
  // Add level prefix if this is a leveled message
  if (defaults.level && content) {
    content = addLevelPrefix(content, defaults.level);
  }
  
  return {
    id,
    timestamp,
    isUser: false,
    showTypewriter: false,
    ...defaults,
    ...options,
    content,
    type // Store the message type for debugging/filtering
  };
}

// Convenience factory functions for common message types

export function createUserMessage(content, options = {}) {
  return createMessage(MessageTypes.USER_MESSAGE, { content, ...options });
}

export function createAgentResponse(content, options = {}) {
  return createMessage(MessageTypes.AGENT_RESPONSE, { content, ...options });
}

export function createAgentError(error, options = {}) {
  const content = typeof error === 'string' ? error : error?.message || 'Unknown error';
  return createMessage(MessageTypes.AGENT_ERROR, { content: `Agent error: ${content}`, ...options });
}

export function createQueryDisplay(queryData, options = {}) {
  if (!queryData || typeof queryData !== 'string' || !queryData.trim()) {
    console.error('🚨 createQueryDisplay called with invalid queryData:', queryData);
    // Return a fallback message to prevent complete failure
    return createMessage(MessageTypes.QUERY_DISPLAY, { 
      queryData: '// Invalid query data received', 
      ...options 
    });
  }
  
  return createMessage(MessageTypes.QUERY_DISPLAY, { queryData, ...options });
}

export function createQueryResult(resultData, options = {}) {
  // Detect if this is an error result and set the appropriate level
  const isErrorResult = resultData?.success === false || Boolean(resultData?.error);
  const messageOptions = {
    resultData,
    ...(isErrorResult && { level: 'error' }),
    ...options
  };
  
  return createMessage(MessageTypes.QUERY_RESULT, messageOptions);
}

export function createQueryError(error, options = {}) {
  const content = typeof error === 'string' ? error : error?.message || 'Unknown error';
  return createMessage(MessageTypes.QUERY_ERROR, { content: `Query execution failed: ${content}`, ...options });
}

export function createInfoMessage(content, options = {}) {
  return createMessage(MessageTypes.INFO, { content, ...options });
}

export function createWarningMessage(content, options = {}) {
  return createMessage(MessageTypes.WARNING, { content, ...options });
}

export function createErrorMessage(content, options = {}) {
  return createMessage(MessageTypes.ERROR, { content, ...options });
}

export function createSuccessMessage(content, options = {}) {
  return createMessage(MessageTypes.SUCCESS, { content, ...options });
}

export function createOperationStarted(operation, options = {}) {
  return createMessage(MessageTypes.OPERATION_STARTED, { 
    content: `🚀 ${operation} started...`, 
    showTypewriter: false,
    ...options 
  });
}

export function createOperationStopped(options = {}) {
  return createMessage(MessageTypes.OPERATION_STOPPED, { 
    content: '🛑 Operation stopped by user', 
    showTypewriter: true,
    ...options 
  });
}

export function createParameterSuccess(content, options = {}) {
  return createMessage(MessageTypes.PARAMETER_AUTOFILL_SUCCESS, { content, ...options });
}

export function createParameterFailed(reason, options = {}) {
  return createMessage(MessageTypes.PARAMETER_AUTOFILL_FAILED, { 
    content: `Parameter auto-fill failed: ${reason}`, 
    ...options 
  });
}

export function createParameterManualRequired(options = {}) {
  return createMessage(MessageTypes.PARAMETER_MANUAL_REQUIRED, { 
    content: 'Please edit the query and provide parameter values manually.', 
    ...options 
  });
}

export function createDangerousQueryWarning(query, safeQuery = null, options = {}) {
  const content = createDangerousQueryWarningContent(query);
  return createMessage(MessageTypes.DANGEROUS_QUERY_WARNING, { 
    content,
    warningQuery: query,
    safeQuery,
    ...options 
  });
}

export function createSafeQueryApplied(options = {}) {
  return createMessage(MessageTypes.SAFE_QUERY_APPLIED, { 
    content: 'Applied safe version with appropriate limit. You can now run the query safely.', 
    ...options 
  });
}

export function createFixAttempt(options = {}) {
  return createMessage(MessageTypes.FIX_ATTEMPT, { 
    content: '🤖 Let me try to fix this error for you...', 
    ...options 
  });
}

export function createOptimizationSuggestion(content, options = {}) {
  return createMessage(MessageTypes.OPTIMIZATION_SUGGESTION, { content, ...options });
}

export function createEditorPlacement(options = {}) {
  return createMessage(MessageTypes.INFO, { 
    content: 'I placed the query into the editor. Edit the query as needed and click Run Query.', 
    showTypewriter: false,
    ...options 
  });
}

/**
 * Create the dangerous query warning content
 */
function createDangerousQueryWarningContent(query) {
  // Extract collection name for better messaging
  const collectionMatch = query.match(/db\.([^.]+)\./);
  const collectionName = collectionMatch ? collectionMatch[1] : null;
  
  const queryType = query.toLowerCase().includes('.find(') ? 'find' : 'aggregation';
  
  return `**Potentially Dangerous Query Detected**

This ${queryType} query doesn't have a limit and could return a large number of documents${collectionName ? ` from collection \`${collectionName}\`` : ''}.

Running find/aggregate queries without limits on large collections can:
• Consume excessive memory and bandwidth
• Slow down the database for other operations  
• Cause the application to become unresponsive
• Take a very long time to complete

**Query to execute:**
\`\`\`
${query}
\`\`\`

Please confirm how you'd like to proceed:`;
}

/**
 * Helper to create a sequence of messages for complex operations
 */
export function createMessageSequence(messages) {
  return messages.map(msg => {
    if (typeof msg === 'string') {
      return createInfoMessage(msg);
    }
    if (msg.type) {
      return createMessage(msg.type, msg.options || {});
    }
    return msg;
  });
}

/**
 * Batch create multiple messages with sequential IDs
 */
export function createMessageBatch(messageConfigs) {
  return messageConfigs.map(config => {
    if (typeof config === 'string') {
      return createInfoMessage(config);
    }
    return createMessage(config.type, config.options || {});
  });
}
