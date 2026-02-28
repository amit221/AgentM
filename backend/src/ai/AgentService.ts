import { getAIServiceManager } from '../services/manager';
import PromptBuilder from './PromptBuilder';
import type { DecideRequest, AgentResponse, AgentAction, ErrorRequest, ErrorResponse } from './AgentProtocol';


function extractJsonObject(text: string): any {
  const trimmed = (text || '').trim();
  
  let jsonCandidate = '';
  if (trimmed.startsWith('{')) {
    jsonCandidate = trimmed;
  } else {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');
    jsonCandidate = match[0];
  }
  
  // Try to parse as-is first
  try {
    return JSON.parse(jsonCandidate);
  } catch (parseErr) {
    // If parsing fails, try to fix common escape sequence issues
    try {
      // Fix double backslashes before quotes (common AI output issue)
      const fixedCandidate = jsonCandidate.replace(/\\\\"/g, '\\"');
      return JSON.parse(fixedCandidate);
    } catch (fixedParseErr) {
      // If still failing, throw the original parse error with more context
      throw new Error(`JSON parsing failed: ${(parseErr as any)?.message}. Candidate: ${jsonCandidate.slice(0, 200)}...`);
    }
  }
}

async function extractOrRepairJsonObject(
  manager: ReturnType<typeof getAIServiceManager>,
  text: string,
  options?: { expectedShapeHint?: string }
): Promise<any> {
  // Enhanced logging for debugging
  console.log('[AgentService] Attempting to extract JSON from response (length:', text?.length || 0, ')');
  
  // 1) Try the fast extractor
  try {
    const result = extractJsonObject(text);
    console.log('[AgentService] Successfully extracted JSON using fast extractor');
    return result;
  } catch (fastErr) {
    console.log('[AgentService] Fast extractor failed:', (fastErr as any)?.message);
    // continue
  }

  // 2) Try code-fence blocks
  try {
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
    let match: RegExpExecArray | null;
    while ((match = fenceRegex.exec(text)) !== null) {
      const candidate = (match[1] || '').trim();
      if (!candidate) continue;
      try {
        const result = JSON.parse(candidate);
        console.log('[AgentService] Successfully extracted JSON from code fence');
        return result;
      } catch (fenceErr) {
        console.log('[AgentService] Code fence candidate failed:', (fenceErr as any)?.message);
        // Skip regex-based repairs; move on to next candidate
      }
    }
  } catch (fenceBlockErr) {
    console.log('[AgentService] Code fence extraction failed:', (fenceBlockErr as any)?.message);
  }

  // 3) Try to clean up common JSON issues before repair
  try {
    // Fix common escape sequence issues
    let cleanedText = text;
    
    // Fix double backslashes in strings (common AI output issue)
    cleanedText = cleanedText.replace(/\\\\"/g, '\\"');
    
    // Try to extract and parse the cleaned text
    const result = extractJsonObject(cleanedText);
    console.log('[AgentService] Successfully extracted JSON after cleanup');
    return result;
  } catch (cleanupErr) {
    console.log('[AgentService] Cleanup attempt failed:', (cleanupErr as any)?.message);
  }

  // 4) Ask model to repair into strict JSON
  try {
    console.log('[AgentService] Attempting AI-powered JSON repair');
    const repairSystem = [
      'You are a strict JSON formatter. Convert the given content into a valid JSON object only.',
      options?.expectedShapeHint
        ? `Conform to this shape as much as possible: ${options.expectedShapeHint}`
        : 'Ensure top-level is an object; include fields like mode, assistant_message, query, messages, conversation_summary, agent_state where applicable.',
      'Return ONLY the JSON. No extra text or markdown.',
      'Fix any escape sequence issues in string values.'
    ].filter(Boolean).join('\n');

    const repairUser = [
      'INPUT (may contain non-JSON text around an intended JSON object):',
      text,
      '',
      'Output strict JSON only. Fix any escape sequence issues.'
    ].join('\n');

    const ai = await manager.call(
      [
        { role: 'system', content: repairSystem },
        { role: 'user', content: repairUser }
      ],
      { temperature: 0.0, maxTokens: 9000 }
    );
    if (ai.success && ai.text) {
      console.log('[AgentService] AI repair raw response:', ai.text);
      const result = extractJsonObject(ai.text as string);
      console.log('[AgentService] Successfully extracted JSON after AI repair');
      return result;
    }
  } catch (repairErr) {
    console.error('[AgentService] JSON repair attempt failed:', (repairErr as any)?.message || repairErr);
  }

  // Enhanced error logging
  console.error('[AgentService] All JSON extraction methods failed');
  console.error('[AgentService] Original text preview (first 500 chars):', (text || '').slice(0, 500));
  console.error('[AgentService] Original text preview (last 500 chars):', (text || '').slice(-500));
  
  throw new Error('No valid JSON object could be extracted from model response');
}

function finalizeQueryBlock(block: any, defaultLimit: number) {
  if (!block || typeof block !== 'object') return null;
  const operation = String(block.operation || '').trim();
  const text = String(block.text || block.query || '').trim();
  if (!text) return null;
  const requiresWriteConfirm = PromptBuilder.isWriteOperation(operation) || PromptBuilder.isWriteQuery(text);
  return {
    text,
    operation: operation || 'find',
    requires_confirmation: !!requiresWriteConfirm,
    parameters: Array.isArray(block.parameters) ? block.parameters : [],
    execution_instructions: typeof block.execution_instructions === 'string' ? block.execution_instructions : undefined,
    result_validation: block.result_validation || undefined,
  };
}

/**
 * Normalize various AI response shapes into a query-block like object that finalizeQueryBlock understands.
 * Supports:
 * - { query: { text, operation, parameters } }
 * - { query: "db.collection.find(...)" , operation, parameters }
 * - { text: "db.collection.find(...)" } or { generated_query: "..." }
 */
function normalizeQueryCandidate(json: any): any | undefined {
  if (!json || typeof json !== 'object') return undefined;
  // Case 1: query is already an object
  if (json.query && typeof json.query === 'object') {
    return json.query;
  }
  // Case 2: query is a string with possible top-level operation/parameters
  if (typeof json.query === 'string') {
    return {
      text: json.query,
      operation: json.operation || 'find',
      parameters: Array.isArray(json.parameters) ? json.parameters : [],
      execution_instructions: typeof json.execution_instructions === 'string' ? json.execution_instructions : undefined,
      result_validation: json.result_validation || undefined,
    };
  }
  // Case 3: alternate field names
  const altText =
    (typeof json.text === 'string' && json.text) ||
    (typeof json.generated_query === 'string' && json.generated_query) ||
    (typeof json.mongo === 'string' && json.mongo) ||
    (typeof json.command === 'string' && json.command) ||
    '';
  if (altText && altText.trim()) {
    return {
      text: altText,
      operation: json.operation || 'find',
      parameters: Array.isArray(json.parameters) ? json.parameters : [],
      execution_instructions: typeof json.execution_instructions === 'string' ? json.execution_instructions : undefined,
      result_validation: json.result_validation || undefined,
    };
  }
  return undefined;
}

export async function agentDecide(
  input: DecideRequest,
  requestMetadata: { endpoint: string; requestId?: string; conversationId?: string }
): Promise<AgentResponse> {
  const { user_input, conversation, app_context, knowledge, agent_state } = input;
  const manager = getAIServiceManager();
  const defaultLimit = app_context.default_limit ?? 100;
  const databaseType = input.type; // Required field - 'mongodb' or 'postgresql'
  
  // Extract query results if provided
  const queryResults = knowledge?.query_results;

  // Get database-specific prompt intro
  const getDatabaseIntro = (dbType: string) => {
    const normalizedType = dbType.toLowerCase();
    switch (normalizedType) {
      case 'postgresql':
      case 'postgres':
        return 'You are a helpful PostgreSQL assistant for a desktop application. Respond to user requests naturally and return STRICT JSON only.';
      case 'mongodb':
      default:
        return 'You are a helpful MongoDB assistant for a desktop application. Respond to user requests naturally and return STRICT JSON only.';
    }
  };

  const system = [
    getDatabaseIntro(databaseType),
    '',
    '🎯 **CORE PRINCIPLE: BE HELPFUL AND DO WHAT THE USER ASKS** 🎯',
    'Your primary goal is to help users accomplish their MongoDB tasks efficiently.',
    '',
    'PROACTIVE BEHAVIOR:',
    '- When users ask you to do something, DO IT immediately',
    '- Make reasonable assumptions when details are minor or obvious from context',
    '- Users are working with their own data - they know what they want',
    '- Only ask for clarification when truly critical information is missing',
    '- Be confident in interpreting user intent and providing working solutions',
    '- NEVER say something is "not supported" unless it truly violates MongoDB capabilities',
    '- NEVER redirect users to alternatives unless what they asked for is genuinely impossible',
    '',
    'RESPONSE FLEXIBILITY:',
    '- You can provide just an explanation (assistant_message only)',
    '- You can provide an explanation with a query',
    '- You can provide a query with minimal explanation',
    '- You decide what makes sense based on the user input',
    '- Include a query whenever the user wants to interact with their database',
    '- Omit the query when the user is asking general questions or seeking information',
    '',
    'FIELD HANDLING:',
    '- If schemas are provided, prefer using existing fields',
    '- If a field seems reasonable but not in the schema, use it anyway with a note',
    '- For new collections or dummy data, create appropriate fields freely',
    '',
    'STRING SEARCHES:',
    '- Always use case-insensitive searches with {$regex: "value", $options: "i"}',
    '- Apply this automatically unless explicitly asked for case-sensitive',
    '',
    'OPERATION TYPE SELECTION:',
    '- Use standard MongoDB methods (insertOne, updateOne, deleteOne, find, aggregate) for most operations',
    '- Use "script" operation for: database creation, complex multi-collection operations, loops, or bulk operations over 100 items',
    '',
    'DATABASE AND COLLECTION CREATION:',
    '- MongoDB does NOT require explicit database creation commands',
    '- To create a new database: generate a script with operation="script" that includes:',
    '  1. use newDatabaseName',
    '  2. db.collectionName.insertOne() or insertMany() with sample data',
    '- The database is automatically created when you first write data to it',
    '- To create a new collection: generate insertOne or insertMany query - the collection is auto-created',
    '- NEVER tell users they cannot create databases or collections - they absolutely can',
    '',
    'CONVERSATION CONTEXT:',
    '- Pay attention to last_messages to understand what the user was discussing',
    '- Use conversation history to resolve ambiguity without asking',
    '',
    'QUERY RESULTS CONTEXT:',
    '- Users can provide query results for additional context',
    '- When results are provided, use them to understand the data structure and content',
    '- Reference specific data from results when answering questions',
    '- If results are sampled, be aware you may not have the complete dataset',
    '',
    'USER CORRECTIONS:',
    '- When corrected, acknowledge gracefully and fix the issue immediately',
    '',
    'PARAMETER HANDLING:',
    '- Use concrete values directly in query when provided by user',
    '- Only use parameter placeholders when values are truly missing',
    '- Include parameters array only when query has placeholders',
    '',
    'VALIDATION:',
    '- Include result_validation for queries with: sorting, aggregation pipelines, projections, $lookup, or complex conditions',
    '',
    // Normalize database type for comparison
    (() => {
      const normalizedDbType = databaseType.toLowerCase();
      const isMongoDB = normalizedDbType === 'mongodb';
      const isPostgres = normalizedDbType === 'postgresql' || normalizedDbType === 'postgres';
      return isMongoDB ? 'MongoDB Query Rules:' : (isPostgres ? 'PostgreSQL Query Rules:' : `${databaseType.toUpperCase()} Query Rules:`);
    })(),
    (() => {
      const normalizedDbType = databaseType.toLowerCase();
      const isMongoDB = normalizedDbType === 'mongodb';
      return isMongoDB
        ? PromptBuilder.getCoreMongoDBRules(defaultLimit)
        : PromptBuilder.getDatabaseRules(databaseType, defaultLimit);
    })(),
    PromptBuilder.getSchemaRules(),
    PromptBuilder.getValidationRules(),
    PromptBuilder.getResponseFormat(databaseType),
    '',
    'Output JSON shape (no markdown, no extra text):',
    '{"assistant_message":"...","query":{"text":"...","operation":"...","parameters":[...],"result_validation":{...}},' +
      '"actions":[...],"param_suggestions":[...],"conversation_summary":"...","agent_state":"..."}',
    '',
    'RESPONSE FIELD RULES:',
    '- assistant_message: ALWAYS include this - your natural response to the user',
    '- query: ONLY include when user wants to interact with database (read, write, create, update, delete, etc.)',
    '- actions: ONLY include when truly needed (missing parameters, performance warnings, interactive UI)',
    '- param_suggestions: Include when you have helpful parameter value suggestions',
    '- conversation_summary: Brief summary of the conversation so far',
    '- agent_state: Internal state tracking (optional)',
    '',
    'WHEN TO INCLUDE QUERY:',
    '- User wants to find/search/list/count data → include query',
    '- User wants to create/insert/add data → include query',
    '- User wants to update/modify/change data → include query',
    '- User wants to delete/remove data → include query',
    '- User wants to create database/collection → include query (script)',
    '- User asks "how do I..." → explain in assistant_message, optionally include example query',
    '- User asks general MongoDB questions → assistant_message only, no query',
    '- User asks to explain a query → assistant_message only, no query',
    '',
    'ACTIONS (use sparingly):',
    '- require_parameters: Only when values are truly needed and cannot be inferred',
    '- warn_performance: Only for serious performance concerns',
    '- execute_query: Provide helpful alternative queries',
    '- quick_buttons: Common next actions',
    '',
    'Be natural, be helpful, be smart. Just give users what they need.',
  ].join('\n');

  // Format conversation context for better AI understanding
  const conversationContext = conversation?.last_messages && conversation.last_messages.length > 0
    ? [
        'RECENT CONVERSATION HISTORY:',
        ...conversation.last_messages.map((msg, idx) => 
          `${idx + 1}. ${msg.role.toUpperCase()}: ${msg.content}`
        ),
        ''
      ].join('\n')
    : 'RECENT CONVERSATION HISTORY: (No previous messages)\n';

  // Format query results if provided
  const queryResultsSection = queryResults 
    ? [
        '',
        '─'.repeat(60),
        'QUERY RESULTS:',
        queryResults.sample_info ? `Note: ${queryResults.sample_info}` : `Total: ${queryResults.total_count} results`,
        '',
        'Results data:',
        JSON.stringify(queryResults.results, null, 2),
        '─'.repeat(60),
        ''
      ].join('\n')
    : '';

  const user = [
    'CURRENT USER INPUT:',
    user_input,
    '',
    conversationContext,
    queryResultsSection,
    'ADDITIONAL CONTEXT:',
    JSON.stringify(
      {
        conversation_summary: conversation?.summary || null,
        app_context,
        knowledge: {
          has_schemas: !!knowledge?.collection_schemas && Object.keys(knowledge.collection_schemas || {}).length > 0,
          relevant_collections: knowledge?.relevant_collections || [],
          collection_schemas: knowledge?.collection_schemas || null,
          collection_indexes: knowledge?.collection_indexes || null,
          has_query_results: !!queryResults,
          // PostgreSQL metadata (views, functions, enum types) - include FULL schemas for views
          pg_metadata: knowledge?.pg_metadata ? {
            // Include full view schemas (like table schemas) so AI can query them correctly
            views: knowledge.pg_metadata.views && Object.keys(knowledge.pg_metadata.views).length > 0 
              ? knowledge.pg_metadata.views 
              : null,
            materialized_views: knowledge.pg_metadata.materializedViews && Object.keys(knowledge.pg_metadata.materializedViews).length > 0 
              ? knowledge.pg_metadata.materializedViews 
              : null,
            functions: (knowledge.pg_metadata.functions && knowledge.pg_metadata.functions.length > 0) 
              ? knowledge.pg_metadata.functions.map((f: any) => ({ name: f.name, signature: f.signature, kind: f.kind }))
              : null,
            enum_types: knowledge.pg_metadata.enumTypes && Object.keys(knowledge.pg_metadata.enumTypes).length > 0 
              ? knowledge.pg_metadata.enumTypes 
              : null
          } : null,
        },
        agent_state,
      },
      null,
      2,
    ),
    '',
    'INSTRUCTIONS: Analyze the current user input in the context of the recent conversation history.',
    queryResults ? 'The user has provided query results for context. Use this data to inform your response.' : '',
    'Use the conversation history to understand what the user is referring to, building upon, or following up on.',
    'Return STRICT JSON only. Do not include Markdown or code fences.',
  ].join('\n');

  const ai = await manager.call(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { 
      temperature: 0.2, 
      maxTokens: 50000,
      model: input.model || 'gpt-5.1'
    },
  );
  if (!ai.success || !ai.text) throw new Error(ai.error || 'AI call failed');
  console.log('[AgentService] AI decide raw response:', ai.text);
  const json = await extractOrRepairJsonObject(
    manager, 
    ai.text as string,
    {
      expectedShapeHint:
        '{"assistant_message":"...","query":{"text":"...","operation":"...","parameters":[{"name":"param1","field":"...","isEnum":true}],"result_validation":{"reason":"...","expected_fields":["..."],"sample_count":5}},"actions":[{"type":"require_parameters|warn_performance|execute_query|quick_buttons","message":"..."}],"param_suggestions":[{"field":"...","values":["..."],"source":"db"}],"conversation_summary":"...","agent_state":"..."}'
    }
  );

  // Normalize common simplified shapes where query is provided as a string at the top level
  const normalizedQueryCandidate = normalizeQueryCandidate(json);

  // Mode is now optional and inferred from response content
  const hasQuery = !!(normalizedQueryCandidate ?? json.query);
  const mode: AgentResponse['mode'] = hasQuery ? 'generate_query' : 'mongo_general';
  const assistant_message: string = String(json.assistant_message || json.explanation || '').trim();
  const conversation_summary: string = String(json.conversation_summary || conversation.summary || '');
  const new_agent_state: string = typeof json.agent_state === 'string' ? json.agent_state : (agent_state || '');
  
  // Process query first (needed for actions processing)
  const query = finalizeQueryBlock(normalizedQueryCandidate ?? json.query, defaultLimit) || undefined;
  
  // Process actions - only include commonly used action types
  const actions = Array.isArray(json.actions)
    ? json.actions
        .map((a: any) => {
          const type = a?.type;
          const message = String(a?.message || '').trim();
          if (!message) return null;
          
          switch (type) {
            case 'require_parameters':
              let paramNames = Array.isArray(a.parameters) ? a.parameters.map((p: any) => String(p || '').trim()).filter(Boolean) : [];
              
              // If no parameter names provided in action but we have a query with placeholders, extract them
              if (paramNames.length === 0 && query && query.text) {
                const placeholderMatches = query.text.match(/\{([^}]+)\}/g);
                if (placeholderMatches) {
                  paramNames = placeholderMatches.map(match => match.slice(1, -1)); // Remove { and }
                }
              }
              
              return {
                type: 'require_parameters',
                message,
                parameters: paramNames
              };
            
            case 'warn_performance':
              return {
                type: 'warn_performance',
                message,
                suggestions: Array.isArray(a.suggestions) ? a.suggestions.map((s: any) => ({
                  label: String(s?.label || '').trim(),
                  query: String(s?.query || '').trim()
                })).filter((s: any) => s.label && s.query) : undefined
              };

            case 'execute_query':
              const queryText = String(a?.query || '').trim();
              if (!queryText) return null;
              return {
                type: 'execute_query',
                label: String(a?.label || '').trim(),
                description: typeof a?.description === 'string' ? a.description : undefined,
                query: queryText,
                auto_execute: typeof a?.auto_execute === 'boolean' ? a.auto_execute : false
              };
            
            case 'quick_buttons':
              return {
                type: 'quick_buttons',
                message,
                buttons: Array.isArray(a.buttons) ? a.buttons.map((b: any) => ({
                  label: String(b?.label || '').trim(),
                  sends_text: String(b?.sends_text || '').trim(),
                  icon: typeof b?.icon === 'string' ? b.icon : undefined
                })).filter((b: any) => b.label && b.sends_text) : []
              };
            
            default:
              // Silently ignore unknown action types
              return null;
          }
        })
        .filter(Boolean)
    : undefined;

  // Use actions provided by AI directly
  const enrichedActions = Array.isArray(actions) && actions.length > 0 ? actions : undefined;

  return {
    mode,
    assistant_message,
    query,
    actions: enrichedActions,
    param_suggestions: Array.isArray((json as any).param_suggestions) ? (json as any).param_suggestions : undefined,
    conversation: { summary: conversation_summary },
    agent_state: new_agent_state,
  };
}

export async function agentErrorRepair(
  input: ErrorRequest,
  requestMetadata: { endpoint: string; requestId?: string; conversationId?: string }
): Promise<ErrorResponse> {
  const { failed_query, error_message, app_context, knowledge, conversation } = input;
  const databaseType = input.type; // Required field - 'mongodb' or 'postgresql'
  const manager = getAIServiceManager();

  const isPostgres = databaseType === 'postgresql';
  const dbName = isPostgres ? 'PostgreSQL' : 'MongoDB';
  const queryType = isPostgres ? 'SQL query' : 'MongoDB query';

  const system = [
    `You are a ${dbName} query repair specialist. Your job is to fix broken ${queryType}s or explain why they cannot be fixed.`,
    'CRITICAL: Pay attention to the conversation context to understand what the user was trying to accomplish with the failed query.',
    'Use the conversation history to understand the user\'s original intent and provide more targeted fixes.',
    'Rules:',
    '- If you can fix the query, provide a corrected version with explanation',
    '- If you cannot fix the query, explain clearly why it cannot be fixed',
    '- Common fixable issues: syntax errors, wrong field names, incorrect operators, type mismatches',
    '- Unfixable issues: missing schema information, ambiguous requirements, fundamental logic errors',
    '- Always provide helpful context about what went wrong',
    '- Consider the conversation context to understand what the user was originally trying to achieve',
    'Return STRICT JSON only in this format:',
    '{"mode":"error_repair","assistant_message":"[explanation of fix or why it cannot be fixed]",' +
      '"fixed_query":{"text":"[fixed query]","operation":"[operation]","parameters":[...]} OR null if cannot fix}',
  ].join('\n');

  const contextInfo = {
    app_context,
    has_schemas: !!knowledge?.collection_schemas && Object.keys(knowledge.collection_schemas || {}).length > 0,
    collection_schemas: knowledge?.collection_schemas || null,
    collection_indexes: knowledge?.collection_indexes || null,
    relevant_collections: knowledge?.relevant_collections || []
  };

  // Format conversation context for error repair
  const conversationContext = conversation?.summary 
    ? `CONVERSATION CONTEXT: ${conversation.summary}\n`
    : 'CONVERSATION CONTEXT: (No conversation context available)\n';

  const user = [
    'FAILED_QUERY:',
    failed_query,
    '',
    'ERROR_MESSAGE:',
    error_message,
    '',
    conversationContext,
    'TECHNICAL CONTEXT:',
    JSON.stringify(contextInfo, null, 2),
    '',
    'INSTRUCTIONS: Analyze the error in the context of what the user was trying to accomplish.',
    'Use the conversation context to understand the user\'s original intent.',
    'Either fix the query or explain clearly why it cannot be fixed.',
    'Return STRICT JSON only. No markdown.',
  ].join('\n');

  const ai = await manager.call(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { 
      temperature: 0.1, 
      maxTokens: 9000,
      model: input.model
    },
  );
  
  if (!ai.success || !ai.text) {
    return {
      mode: 'error_repair',
      assistant_message: `I couldn't analyze the query error due to an AI service issue: ${ai.error || 'Unknown error'}. Please check the query syntax manually or try again.`,
      fixed_query: undefined
    };
  }

  console.log('[AgentService] AI error-repair raw response:', ai.text);
  
  try {
    const json = await extractOrRepairJsonObject(
      manager, 
      ai.text as string,
      {
        expectedShapeHint:
          '{"mode":"error_repair","assistant_message":"...","fixed_query":{"text":"...","operation":"...","parameters":[{"name":"param1","field":"...","isEnum":true}]} OR null}'
      }
    );
    
    const assistant_message: string = String(json.assistant_message || '').trim();
    const fixed = json.fixed_query ? finalizeQueryBlock(json.fixed_query, 100) || undefined : undefined;
    
    // If no assistant message was provided, generate a default one
    const finalMessage = assistant_message || (fixed 
      ? 'I was able to fix the query. Please review the corrected version.'
      : 'I could not automatically fix this query. Please review the error and make manual corrections.');
    
    return { 
      mode: 'error_repair', 
      assistant_message: finalMessage, 
      fixed_query: fixed
    };
  } catch (parseError) {
    return {
      mode: 'error_repair',
      assistant_message: `I encountered an issue while analyzing your query error. The error appears to be: "${error_message}". Please check your query syntax, field names, and collection structure manually.`,
      fixed_query: undefined
    };
  }
}


