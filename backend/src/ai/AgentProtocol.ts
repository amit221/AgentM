import { z } from 'zod';

export const DecideRequestSchema = z.object({
  session_id: z.string().min(1),
  user_input: z.string().min(1),
  type: z.enum(['mongodb', 'postgresql']), // Required - database type, must be provided by app
  conversation: z.object({
    summary: z.string().optional().nullable(),
    last_messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).optional().default([]),
  }),
  app_context: z.object({
    database: z.string().optional().default(''),
    allow_writes: z.boolean().optional().default(true),
    default_limit: z.number().int().positive().optional().default(100),
    // Optional feedback from last execution to guide follow-ups
    last_execution: z
      .object({
        query_text: z.string().optional(),
        matched_count: z.number().int().nonnegative().optional(),
        docs_returned: z.number().int().nonnegative().optional(),
        nReturned: z.number().int().nonnegative().optional(),
        elapsed_ms: z.number().int().nonnegative().optional(),
        error: z.string().optional(),
      })
      .optional(),
  }),
  knowledge: z
    .object({
      collection_schemas: z.record(z.any()).optional(),
      // New: include collection indexes alongside schemas for performance-aware reasoning
      collection_indexes: z
        .record(
          z.array(
            z.object({
              name: z.string().optional(),
              keys: z.record(z.any()).optional(),
              unique: z.boolean().optional(),
              sparse: z.boolean().optional(),
              partialFilterExpression: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      relevant_collections: z.array(z.string()).optional(),
      schema_version: z.string().optional(),
      // Query results to provide context about data the user is working with
      query_results: z
        .object({
          results: z.array(z.any()),
          total_count: z.number().int().nonnegative(),
          sampled: z.boolean(),
          sample_info: z.string().optional(),
          token_count: z.number().int().nonnegative().optional(),
        })
        .optional(),
      // PostgreSQL metadata (views, functions, enum types) - can be null for MongoDB
      pg_metadata: z
        .object({
          views: z.record(z.any()).optional(),
          materializedViews: z.record(z.any()).optional(),
          functions: z.array(z.object({
            name: z.string(),
            signature: z.string().optional(),
            kind: z.string().optional(),
          })).optional(),
          enumTypes: z.record(z.array(z.string())).optional(),
        })
        .nullable()
        .optional(),
    })
    .optional()
    .default({}),
  agent_state: z.string().optional().default(''),
  client_info: z.object({ app_version: z.string().optional(), capabilities: z.array(z.string()).optional() }).optional(),
  model: z.string().optional(), // Optional: AI model to use (must be in pricing config)
});

export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export const ErrorRequestSchema = z.object({
  session_id: z.string().min(1),
  failed_query: z.string().min(1),
  error_message: z.string().min(1),
  user_input: z.string().optional(),
  type: z.enum(['mongodb', 'postgresql']), // Required - database type, must be provided by app
  app_context: z.object({
    database: z.string().optional().default(''),
    allow_writes: z.boolean().optional().default(true),
  }),
  model: z.string().optional(), // Optional: AI model to use (must be in pricing config)
  knowledge: z
    .object({
      collection_schemas: z.record(z.any()).optional(),
      collection_indexes: z
        .record(
          z.array(
            z.object({
              name: z.string().optional(),
              keys: z.record(z.any()).optional(),
              unique: z.boolean().optional(),
              sparse: z.boolean().optional(),
              partialFilterExpression: z.record(z.any()).optional(),
            })
          )
        )
        .optional(),
      relevant_collections: z.array(z.string()).optional(),
      schema_version: z.string().optional(),
      // PostgreSQL metadata (views, functions, enum types) - can be null for MongoDB
      pg_metadata: z
        .object({
          views: z.record(z.any()).optional(),
          materializedViews: z.record(z.any()).optional(),
          functions: z.array(z.object({
            name: z.string(),
            signature: z.string().optional(),
            kind: z.string().optional(),
          })).optional(),
          enumTypes: z.record(z.array(z.string())).optional(),
        })
        .nullable()
        .optional(),
    })
    .optional()
    .default({}),
  agent_state: z.string().optional().default(''),
  conversation: z.object({ summary: z.string().optional().nullable() }).optional(),
});

export type ErrorRequest = z.infer<typeof ErrorRequestSchema>;

export type AgentMode =
  | 'teach'
  | 'mongo_general'
  | 'guide_exploration'
  | 'clarify'
  | 'generate_query'
  | 'explain_query'
  | 'format_query'
  | 'error_repair';

export interface QueryBlock {
  text: string;
  operation:
    | 'find'
    | 'aggregate'
    | 'countDocuments'
    | 'distinct'
    | 'insertOne'
    | 'insertMany'
    | 'updateOne'
    | 'updateMany'
    | 'deleteOne'
    | 'deleteMany'
    | 'script'
    | string;
  requires_confirmation: boolean;
  parameters?: Array<{ name: string; field: string; isEnum?: boolean; description?: string }>;
  execution_instructions?: string;
  result_validation?: {
    reason: string;
    expected_fields: string[];
    sample_count?: number;
  };
}

export type AgentAction = 
  | { type: 'require_parameters'; message: string; parameters: string[] }
  | { type: 'warn_performance'; message: string; suggestions?: Array<{ label: string; query: string }> }
  | { type: 'clarify_choices'; message: string; choices: Array<{ label: string; sends_text: string }> }
  | { type: 'execute_query'; label: string; description?: string; query: string; auto_execute?: boolean }
  | { type: 'quick_buttons'; message: string; buttons: Array<{ label: string; sends_text: string; icon?: string }> }
  | { type: 'collection_picker'; message: string; collections: Array<{ name: string; description?: string }> }
  | { type: 'field_selector'; message: string; fields: Array<{ name: string; type: string; description?: string }> };

export type AgentResponse = {
  mode: AgentMode;
  assistant_message: string;
  query?: QueryBlock;
  actions?: AgentAction[];
  param_suggestions?: Array<{ field: string; values: Array<string | number | boolean>; source?: 'agent' | 'app' | 'db' }>;
  conversation: { summary: string };
  agent_state: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
};

export type ErrorResponse = {
  mode: 'error_repair';
  assistant_message: string;
  fixed_query?: QueryBlock;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string;
};


