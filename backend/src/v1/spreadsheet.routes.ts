import { Router, Request, Response } from 'express';
import { SpreadsheetAnalyzer } from '../ai/spreadsheet/SpreadsheetAnalyzer';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    service: 'spreadsheet-analyzer',
    timestamp: new Date().toISOString()
  });
});

// Main spreadsheet analysis endpoint with socket keepalive
router.post('/analyze', async (req: Request, res: Response) => {
  const startTime = Date.now();
  let keepAliveInterval: NodeJS.Timeout | null = null;
  let isCompleted = false;
  
  try {
    console.log('📊 Received spreadsheet analysis request');
    
    const { sheets, relationships, databaseType } = req.body;
    
    // Validate input
    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: sheets array is required and must not be empty'
      });
    }

    // Log database type - ensure it's properly set
    const targetDbType = (databaseType || 'mongodb').toLowerCase();
    console.log(`📊 Target database type: ${targetDbType}`);
    console.log(`📊 Raw databaseType from request: ${JSON.stringify(databaseType)}`);
    
    // Validate database type
    const supportedDbTypes = ['mongodb', 'postgresql', 'mysql', 'sqlite'];
    if (!supportedDbTypes.includes(targetDbType)) {
      console.warn(`⚠️ Unknown database type: ${targetDbType}, using mongodb`);
    }

    // Set up socket keepalive to prevent connection timeout
    if (req.socket) {
      req.socket.setKeepAlive(true, 1000);
      req.socket.setTimeout(0);
    }

    // Set up timeout check interval
    keepAliveInterval = setInterval(async () => {
      if (!isCompleted) {
        const elapsed = Date.now() - startTime;
        
        if (elapsed > 300000) {
          console.log('⏰ Analysis timeout reached (5 minutes)');
          clearInterval(keepAliveInterval!);
          
          if (!res.headersSent && !res.destroyed) {
            res.status(408).json({
              success: false,
              error: 'Analysis took longer than 5 minutes',
              timestamp: new Date().toISOString()
            });
          }
          isCompleted = true;
          return;
        }
      }
    }, 5000);

    // Initialize analyzer
    const analyzer = new SpreadsheetAnalyzer();
    
    // Perform AI analysis
    console.log('🤖 Starting AI analysis...');
    const design = await analyzer.analyzeAndDesign({
      sheets,
      relationships: relationships || [],
      model: req.body?.model || 'gpt-5.1',
      databaseType: targetDbType
    });

    // Clear keepalive interval
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }

    if (!isCompleted && !res.headersSent && !res.destroyed) {
      console.log('✅ Analysis completed successfully');
      console.log(`Strategy: ${design.strategy}`);
      console.log(`Database Type: ${design.databaseType || targetDbType}`);
      console.log(`Collections/Tables: ${design.collections.length}`);
      
      if (design.collections.length > 0) {
        console.log(`First ${targetDbType === 'postgresql' ? 'table' : 'collection'} name: ${design.collections[0].name}`);
      }
      
      const duration = Date.now() - startTime;
      console.log(`📊 Total analysis time: ${duration}ms`);

      // Remove model and tokenUsage from design before sending response
      const { model: _model, tokenUsage: _tokenUsage, ...cleanDesign } = design as any;
      
      // Ensure databaseType is included in the response
      cleanDesign.databaseType = cleanDesign.databaseType || targetDbType;

      // Send final success response
      res.json({
        success: true,
        design: cleanDesign,
        databaseType: targetDbType,
        timestamp: new Date().toISOString(),
        duration
      });
      isCompleted = true;
    }

  } catch (error) {
    console.error('❌ Spreadsheet analysis failed:', error);
    
    // Clear keepalive interval
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    
    if (!isCompleted && !res.headersSent && !res.destroyed) {
      const duration = Date.now() - startTime;

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString(),
        duration
      });
      isCompleted = true;
    }
  }
  
  // Cleanup function
  const cleanup = () => {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    isCompleted = true;
  };
  
  // Handle client disconnect
  req.on('close', () => {
    const duration = Date.now() - startTime;
    console.log(`🔌 Client disconnected after ${duration}ms`);
    cleanup();
  });
  
  req.on('aborted', () => {
    const duration = Date.now() - startTime;
    console.log(`🚫 Request aborted after ${duration}ms`);
    cleanup();
  });
});

export default router;
