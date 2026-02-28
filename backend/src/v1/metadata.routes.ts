import { Router, Request, Response } from 'express';
import collectionMetadataService, { CollectionInfo } from '../services/CollectionMetadataService';
import collectionSelectorService from '../services/CollectionSelectorService';

const router = Router();

/**
 * POST /api/v1/metadata/generate
 * 
 * Generate metadata for entire database
 * 
 * Request body:
 * {
 *   databaseName: string,
 *   collections: Array<{ name: string, fields: string[], documentCount?: number }>
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   metadata: DatabaseMetadata,
 *   fromCache: false
 * }
 */
router.post('/generate', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    console.log('📊 /generate endpoint hit');
    console.log('📊 Request body:', JSON.stringify(req.body, null, 2));
    
    const { databaseName, collections } = req.body;
    
    // Validate input
    if (!databaseName || typeof databaseName !== 'string') {
      console.error('❌ Invalid databaseName:', databaseName);
      return res.status(400).json({
        success: false,
        error: 'Invalid databaseName parameter'
      });
    }
    
    if (!Array.isArray(collections) || collections.length === 0) {
      console.error('❌ Invalid collections:', collections);
      return res.status(400).json({
        success: false,
        error: 'Invalid collections parameter (must be non-empty array)'
      });
    }
    
    // Validate collection structure
    for (const col of collections) {
      if (!col.name || !Array.isArray(col.fields)) {
        console.error('❌ Invalid collection structure:', col);
        return res.status(400).json({
          success: false,
          error: 'Each collection must have name and fields array'
        });
      }
    }
    
    console.log(`📊 Metadata generation requested for ${databaseName} (${collections.length} collections)`);
    console.log(`📊 Collection names: ${collections.map((c: any) => c.name).join(', ')}`);
    
    // Generate metadata
    const metadata = await collectionMetadataService.generateDatabaseMetadata(
      databaseName,
      collections as CollectionInfo[]
    );
    
    const durationMs = Date.now() - start;
    
    console.log(`✅ Metadata generated successfully for ${databaseName}`);
    console.log(`✅ Metadata collections count: ${metadata.collections.length}`);
    
    return res.json({
      success: true,
      metadata,
      fromCache: false
    });
    
  } catch (error) {
    console.error('❌ Metadata generation failed:', error);
    console.error('❌ Error stack:', (error as any)?.stack);
    return res.status(500).json({
      success: false,
      error: (error as any)?.message || 'Metadata generation failed'
    });
  }
});

/**
 * POST /api/v1/metadata/select-collections
 * 
 * Intelligently select relevant collections for a query
 * Used when schema token count exceeds budget
 * 
 * Request body:
 * {
 *   userQuery: string,
 *   metadata: DatabaseMetadata,
 *   recentCollections?: string[]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   selected: string[],
 *   reasoning: string,
 *   confidence: number
 * }
 */
router.post('/select-collections', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    console.log('🎯 /select-collections endpoint hit');
    
    const { userQuery, metadata, recentCollections } = req.body;
    
    // Validate input
    if (!userQuery || typeof userQuery !== 'string') {
      console.error('❌ Invalid userQuery:', userQuery);
      return res.status(400).json({
        success: false,
        error: 'Invalid userQuery parameter'
      });
    }
    
    if (!metadata || !metadata.collections || !Array.isArray(metadata.collections)) {
      console.error('❌ Invalid metadata:', metadata);
      return res.status(400).json({
        success: false,
        error: 'Invalid metadata parameter'
      });
    }
    
    console.log(`🎯 Selecting collections for query: "${userQuery}"`);
    console.log(`📊 Database has ${metadata.collections.length} collections`);
    
    // Call selection service
    const result = await collectionSelectorService.selectRelevantCollections(
      userQuery,
      metadata,
      { recentCollections }
    );
    
    console.log(`✅ Selected ${result.selected.length} collections: ${result.selected.join(', ')}`);
    console.log(`📝 Reasoning: ${result.reasoning}`);
    
    return res.json({
      success: true,
      selected: result.selected,
      reasoning: result.reasoning,
      confidence: result.confidence,
      fallbackUsed: result.fallbackUsed
    });
    
  } catch (error) {
    console.error('❌ Collection selection failed:', error);
    console.error('❌ Error stack:', (error as any)?.stack);
    return res.status(500).json({
      success: false,
      error: (error as any)?.message || 'Collection selection failed'
    });
  }
});

export default router;
