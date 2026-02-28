import { getAIServiceManager } from './manager';
import type { DatabaseMetadata, CollectionMetadata } from './CollectionMetadataService';

/**
 * Collection Selection Types
 */
export interface SelectionRequest {
  userQuery: string;
  metadata: DatabaseMetadata;
  conversationContext?: ConversationContext;
}

export interface ConversationContext {
  recentCollections?: string[];
  previousQueries?: string[];
}

export interface SelectionResult {
  selected: string[];
  reasoning: string;
  confidence: number;
  fallbackUsed: boolean;
}

/**
 * CollectionSelectorService
 * 
 * Intelligently selects relevant collections for a user query using:
 * 1. AI-powered selection based on metadata (descriptions, concepts, relationships)
 * 2. Fallback heuristics (keyword matching, recent collections, largest collections)
 * 
 * Only used when schemas exceed token budget (>10K tokens).
 */
export class CollectionSelectorService {
  
  /**
   * Select relevant collections for a query
   * @param userQuery - User's natural language query
   * @param metadata - Database metadata with collection descriptions
   * @param conversationContext - Optional conversation history
   * @returns Selection result with collection names
   */
  async selectRelevantCollections(
    userQuery: string,
    metadata: DatabaseMetadata,
    conversationContext?: ConversationContext
  ): Promise<SelectionResult> {
    
    console.log(`🎯 Selecting relevant collections for query: "${userQuery}"`);
    console.log(`📊 Database has ${metadata.collections.length} collections`);
    
    // Try AI-powered selection first
    try {
      const aiResult = await this.aiBasedSelection(userQuery, metadata, conversationContext);
      console.log(`✅ AI selection: ${aiResult.selected.length} collections (confidence: ${aiResult.confidence})`);
      return aiResult;
    } catch (error) {
      console.warn('⚠️ AI selection failed, using fallback heuristics:', (error as any)?.message);
      
      // Fall back to heuristic-based selection
      const fallbackResult = this.fallbackSelection(userQuery, metadata, conversationContext);
      console.log(`✅ Fallback selection: ${fallbackResult.selected.length} collections`);
      return fallbackResult;
    }
  }
  
  /**
   * AI-powered collection selection
   */
  private async aiBasedSelection(
    userQuery: string,
    metadata: DatabaseMetadata,
    conversationContext?: ConversationContext
  ): Promise<SelectionResult> {
    
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(userQuery, metadata, conversationContext);
    
    const manager = getAIServiceManager();
    
    const response = await manager.call(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      {
        temperature: 0.1,
        maxTokens: 1000,
        model: 'gpt-4o-mini' // Use cheaper model for selection
      }
    );
    
    // Parse response
    const parsed = this.parseSelectionResponse(response.text);
    
    // Validate selected collections exist
    const validSelected = parsed.selected.filter((name: string) =>
      metadata.collections.some(c => c.collectionName === name)
    );
    
    if (validSelected.length === 0) {
      throw new Error('AI selected no valid collections');
    }
    
    // Cap at 10 collections
    const capped = validSelected.slice(0, 10);
    
    return {
      selected: capped,
      reasoning: parsed.reasoning || 'AI-based selection',
      confidence: parsed.confidence || 0.85,
      fallbackUsed: false
    };
  }
  
  /**
   * Build system prompt for AI selection
   */
  private buildSystemPrompt(): string {
    return `You are a MongoDB collection selector. Select relevant collections for a user's query.

Given:
- User's natural language query
- Collection metadata (descriptions, concepts, relationships)
- Conversation context (recently used collections)

Select the MINIMUM set of collections needed to answer the query.

Rules:
1. Map user concepts to actual collection names
   - "orders" might be "transactions" or "purchases"
   - "users" might be "customers" or "account_holders"
2. Include related collections automatically
   - If selecting "transactions", also include "customers" if they're related
3. Prefer recently used collections (from context)
4. Maximum 10 collections (prefer fewer - aim for 3-5)
5. If uncertain, include the collection (better to over-include than miss data)

Return STRICT JSON format (no markdown):
{
  "selected": ["collection1", "collection2"],
  "reasoning": "Why these collections were selected",
  "confidence": 0.85
}`;
  }
  
  /**
   * Build user prompt with collection metadata
   */
  private buildUserPrompt(
    userQuery: string,
    metadata: DatabaseMetadata,
    conversationContext?: ConversationContext
  ): string {
    
    // Format collections
    const collectionsText = metadata.collections.map(c => `
${c.collectionName}:
  Description: ${c.description}
  User might say: ${c.primaryConcepts.join(', ')}
  Related to: ${c.relationships.map(r => r.relatedCollection).join(', ') || 'none'}`
    ).join('\n');
    
    // Format recent collections
    const recentText = conversationContext?.recentCollections?.length
      ? `\nRecently Used Collections: ${conversationContext.recentCollections.join(', ')}`
      : '';
    
    return `User Query: "${userQuery}"

Available Collections:
${collectionsText}
${recentText}

Select relevant collections (max 10, prefer 3-5). Return strict JSON only (no markdown).`;
  }
  
  /**
   * Parse AI response
   */
  private parseSelectionResponse(text: string): any {
    // Remove markdown code blocks if present
    let cleanText = text.trim();
    
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    try {
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('❌ Failed to parse selection JSON:', cleanText);
      throw new Error('Failed to parse selection response as JSON');
    }
  }
  
  /**
   * Fallback selection using heuristics
   */
  private fallbackSelection(
    userQuery: string,
    metadata: DatabaseMetadata,
    conversationContext?: ConversationContext
  ): SelectionResult {
    
    const selected = new Set<string>();
    const queryLower = userQuery.toLowerCase();
    
    // 1. Recently used collections (highest priority)
    if (conversationContext?.recentCollections) {
      conversationContext.recentCollections
        .slice(0, 3) // Top 3 recent
        .forEach(name => {
          if (metadata.collections.some(c => c.collectionName === name)) {
            selected.add(name);
          }
        });
    }
    
    // 2. Keyword matching in collection names
    metadata.collections.forEach(coll => {
      if (queryLower.includes(coll.collectionName.toLowerCase())) {
        selected.add(coll.collectionName);
      }
    });
    
    // 3. Keyword matching in primary concepts
    metadata.collections.forEach(coll => {
      if (coll.primaryConcepts.some(concept =>
        queryLower.includes(concept.toLowerCase())
      )) {
        selected.add(coll.collectionName);
      }
    });
    
    // 4. Keyword matching in descriptions
    metadata.collections.forEach(coll => {
      const words = queryLower.split(/\s+/);
      if (words.some(word =>
        word.length > 3 && coll.description.toLowerCase().includes(word)
      )) {
        selected.add(coll.collectionName);
      }
    });
    
    // 5. If still nothing, use most connected/confident collections (most likely to be relevant)
    if (selected.size === 0) {
      const sorted = [...metadata.collections]
        .sort((a, b) => {
          // Sort by: 1) number of relationships (more connected = more important)
          //          2) confidence score (higher = better metadata quality)
          const aScore = (a.relationships?.length || 0) * 10 + (a.confidence || 0);
          const bScore = (b.relationships?.length || 0) * 10 + (b.confidence || 0);
          return bScore - aScore;
        });
      
      sorted.slice(0, 5).forEach(c => selected.add(c.collectionName));
    }
    
    // 6. Add related collections for high-confidence matches
    const withRelated = new Set(selected);
    selected.forEach(collName => {
      const coll = metadata.collections.find(c => c.collectionName === collName);
      if (coll && coll.relationships) {
        coll.relationships
          .filter(r => r.confidence > 0.8)
          .slice(0, 2) // Max 2 related per collection
          .forEach(r => withRelated.add(r.relatedCollection));
      }
    });
    
    // Cap at 10
    const finalSelected = Array.from(withRelated).slice(0, 10);
    
    return {
      selected: finalSelected,
      reasoning: 'Heuristic-based selection using keyword matching and recent collections',
      confidence: 0.7,
      fallbackUsed: true
    };
  }
  
  /**
   * Check if selection is needed based on database size
   * @param collectionCount - Number of collections
   * @returns True if smart selection should be used
   */
  shouldUseSmartSelection(collectionCount: number): boolean {
    // Use smart selection for databases with >10 collections
    // This is a simplified check; frontend uses token-based check
    return collectionCount > 10;
  }
}

export default new CollectionSelectorService();


