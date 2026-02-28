import { getAIServiceManager } from './manager';

/**
 * Collection Metadata Types
 */
export interface CollectionMetadata {
  collectionName: string;
  databaseName: string;
  description: string;
  primaryConcepts: string[];
  alternativeNames: string[];
  relationships: CollectionRelationship[];
  generatedAt: Date;
  confidence: number;
}

export interface CollectionRelationship {
  relatedCollection: string;
  relationshipType: 'one-to-many' | 'many-to-one' | 'many-to-many';
  localField: string;
  foreignField: string;
  confidence: number;
  reasoning: string;
}

export interface DatabaseMetadata {
  databaseName: string;
  collections: CollectionMetadata[];
  generatedAt: Date;
  version: number;
}

export interface CollectionInfo {
  name: string;
  fields: string[];
  documentCount?: number;
}

/**
 * CollectionMetadataService
 * 
 * Generates AI-powered metadata for MongoDB collections including:
 * - Human-readable descriptions
 * - Primary concepts and alternative names (for natural language matching)
 * - Relationships between collections
 * 
 * Uses a single AI call to analyze all collections in a database at once.
 */
export class CollectionMetadataService {
  
  /**
   * Generate metadata for entire database in one AI call
   * @param databaseName - Name of the database
   * @param collections - Array of collection info (names + fields)
   * @returns Database metadata
   */
  async generateDatabaseMetadata(
    databaseName: string,
    collections: CollectionInfo[]
  ): Promise<DatabaseMetadata> {
    
    console.log(`🤖 Generating metadata for database: ${databaseName} (${collections.length} collections)`);
    
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(databaseName, collections);
    
    const manager = getAIServiceManager();
    
    try {
      const response = await manager.call(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          maxTokens: 20000,
          model: 'gpt-4.1-mini' // Use cheaper model for metadata generation
        }
      );
      
      console.log('🤖 Metadata generation response received, parsing...');
      
      // Parse the JSON response
      const parsed = this.parseMetadataResponse(response.text);
      
      // Build final metadata object
      const metadata: DatabaseMetadata = {
        databaseName,
        collections: parsed.collections.map((col: any) => ({
          collectionName: col.name,
          databaseName,
          description: col.description || '',
          primaryConcepts: col.primaryConcepts || [],
          alternativeNames: col.alternativeNames || [],
          relationships: col.relationships || [],
          generatedAt: new Date(),
          confidence: col.confidence || 0.8
        })),
        generatedAt: new Date(),
        version: 1
      };
      
      console.log(`✅ Generated metadata for ${metadata.collections.length} collections`);
      
      return metadata;
      
    } catch (error) {
      console.error('❌ Metadata generation failed:', error);
      throw new Error(`Failed to generate metadata: ${(error as any)?.message}`);
    }
  }
  
  /**
   * Build system prompt for metadata generation
   */
  private buildSystemPrompt(): string {
    return `You are a MongoDB database analyzer. Analyze all collections in a database and provide metadata.

For each collection, determine:
1. **Description**: What data does this collection store? (Max 20 words)
2. **Primary Concepts**: What would users call this? What are the main concepts?
3. **Alternative Names**: What alternative names or synonyms might users use?
4. **Relationships**: Which collections relate to each other? (Look for fields ending in "Id", "_id", "Ref", etc.)

IMPORTANT: Users don't know collection names. Map natural language to technical names.
- Analyze the actual field names and structure to understand the collection's purpose
- Think about how users would naturally describe this data in everyday language
- Include industry-standard terms and common synonyms

Return STRICT JSON format (no markdown, no extra text):
{
  "collections": [
    {
      "name": "<collection_name>",
      "description": "<clear description of what this collection stores>",
      "primaryConcepts": ["<concept1>", "<concept2>", "<concept3>"],
      "alternativeNames": ["<synonym1>", "<synonym2>"],
      "confidence": <0.0-1.0>,
      "relationships": [
        {
          "relatedCollection": "<related_collection_name>",
          "relationshipType": "<one-to-many|many-to-one|many-to-many>",
          "localField": "<field_name>",
          "foreignField": "<field_name>",
          "confidence": <0.0-1.0>,
          "reasoning": "<explanation of how you identified this relationship>"
        }
      ]
    }
  ]
}

DO NOT use example values. Analyze the actual collections provided and generate metadata based on their real field names and structure.`;
  }
  
  /**
   * Build user prompt with collection information
   */
  private buildUserPrompt(databaseName: string, collections: CollectionInfo[]): string {
    const collectionsText = collections.map(c => `
${c.name}:
  Fields: ${c.fields.join(', ')}
  ${c.documentCount !== undefined ? `Document Count: ${c.documentCount}` : ''}`
    ).join('\n');
    
    return `Database: ${databaseName}

Collections:
${collectionsText}

Analyze all collections and return complete metadata. Return strict JSON only (no markdown code blocks).`;
  }
  
  /**
   * Parse AI response into metadata structure
   */
  private parseMetadataResponse(text: string): any {
    // Remove markdown code blocks if present
    let cleanText = text.trim();
    
    // Remove ```json or ``` markers
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    try {
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('❌ Failed to parse metadata JSON:', cleanText);
      throw new Error('Failed to parse metadata response as JSON');
    }
  }
  
  /**
   * Update metadata for specific collections (incremental update)
   * @param databaseName - Name of the database
   * @param existingMetadata - Current metadata
   * @param changedCollections - Collections that changed
   * @param collectionInfo - Info for changed collections
   */
  async updateMetadata(
    databaseName: string,
    existingMetadata: DatabaseMetadata,
    changedCollections: string[],
    collectionInfo: CollectionInfo[]
  ): Promise<DatabaseMetadata> {
    
    console.log(`🔄 Updating metadata for ${changedCollections.length} collections in ${databaseName}`);
    
    // For small number of changes, regenerate only those collections
    if (changedCollections.length <= 5) {
      const changedInfo = collectionInfo.filter(c => changedCollections.includes(c.name));
      const newMetadata = await this.generateDatabaseMetadata(databaseName, changedInfo);
      
      // Merge with existing metadata
      const updatedCollections = existingMetadata.collections.map(col => {
        const updated = newMetadata.collections.find(c => c.collectionName === col.collectionName);
        return updated || col;
      });
      
      // Add any new collections
      newMetadata.collections.forEach(col => {
        if (!updatedCollections.find(c => c.collectionName === col.collectionName)) {
          updatedCollections.push(col);
        }
      });
      
      return {
        ...existingMetadata,
        collections: updatedCollections,
        generatedAt: new Date()
      };
    }
    
    // For large number of changes, full regeneration is faster
    return this.generateDatabaseMetadata(databaseName, collectionInfo);
  }
}

export default new CollectionMetadataService();






