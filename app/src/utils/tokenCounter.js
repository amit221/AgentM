import { encode } from 'gpt-tokenizer';

/**
 * TokenCounter - Frontend utility for accurate OpenAI token counting
 * 
 * Uses gpt-tokenizer (pure JS) to estimate token counts for schema payloads before sending to backend.
 * This allows the frontend to decide whether to filter schemas based on token budget.
 */
export class TokenCounter {
  constructor(model = 'gpt-4') {
    this.model = model;
  }

  /**
   * Count tokens in any text
   * @param {string} text - Text to count tokens for
   * @returns {number} Token count
   */
  countTokens(text) {
    try {
      const tokens = encode(text);
      return tokens.length;
    } catch (error) {
      console.error('Token counting error:', error);
      // Fallback: rough approximation (1 token ≈ 4 characters)
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Format schemas as they appear in agent prompts
   * This matches how PromptBuilder formats them in the backend
   * @param {Object} schemas - Schema object { collectionName: { schema, fieldDescriptions } }
   * @returns {string} Formatted prompt text
   */
  formatSchemasForPrompt(schemas) {
    let text = 'ALL AVAILABLE COLLECTIONS AND THEIR SCHEMAS:\n';
    
    Object.entries(schemas).forEach(([collName, collData]) => {
      text += `\n${collName} collection:\n`;
      
      // Add schema
      if (collData.schema) {
        text += 'Schema:\n';
        text += JSON.stringify(collData.schema, null, 2);
        text += '\n';
      }
      
      // Add field descriptions if present
      if (collData.fieldDescriptions && collData.fieldDescriptions.length > 0) {
        text += 'Field Descriptions:\n';
        collData.fieldDescriptions.forEach(fd => {
          text += `- ${fd.fieldName}: ${fd.description}\n`;
        });
      }
    });
    
    return text;
  }

  /**
   * Estimate tokens for schema objects
   * @param {Object} schemas - Schema object
   * @returns {number} Estimated token count
   */
  estimateSchemaTokens(schemas) {
    if (!schemas || Object.keys(schemas).length === 0) {
      return 0;
    }
    
    const formatted = this.formatSchemasForPrompt(schemas);
    return this.countTokens(formatted);
  }

  /**
   * Check if schemas would exceed token budget
   * @param {Object} schemas - Schema object
   * @param {number} maxTokens - Maximum allowed tokens (default 10000)
   * @returns {boolean} True if schemas exceed budget
   */
  exceedsTokenBudget(schemas, maxTokens = 10000) {
    const estimatedTokens = this.estimateSchemaTokens(schemas);
    return estimatedTokens > maxTokens;
  }

  /**
   * Get detailed token breakdown for debugging
   * @param {Object} schemas - Schema object
   * @returns {Object} Breakdown with total and per-collection counts
   */
  getTokenBreakdown(schemas) {
    const breakdown = {
      total: 0,
      collections: {}
    };

    Object.entries(schemas).forEach(([collName, collData]) => {
      const singleCollectionSchema = { [collName]: collData };
      const tokens = this.estimateSchemaTokens(singleCollectionSchema);
      breakdown.collections[collName] = tokens;
      breakdown.total += tokens;
    });

    return breakdown;
  }

  /**
   * Cleanup method (no-op for gpt-tokenizer, kept for API compatibility)
   * gpt-tokenizer is pure JS and doesn't require resource cleanup
   */
  cleanup() {
    // No cleanup needed for gpt-tokenizer (pure JS, no WASM)
  }
}

/**
 * Helper function to check if schemas need filtering
 * @param {Object} schemas - Schema object
 * @param {number} threshold - Token threshold (default 10000)
 * @returns {Object} { needsFiltering, tokenCount, breakdown }
 */
export function shouldFilterSchemas(schemas, threshold = 10000) {
  const counter = new TokenCounter('gpt-4');
  
  try {
    const tokenCount = counter.estimateSchemaTokens(schemas);
    const needsFiltering = tokenCount > threshold;
    const breakdown = needsFiltering ? counter.getTokenBreakdown(schemas) : null;
    
    return {
      needsFiltering,
      tokenCount,
      threshold,
      breakdown
    };
  } finally {
    counter.cleanup();
  }
}

export default TokenCounter;

