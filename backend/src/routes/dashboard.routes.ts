import { Router, Request, Response } from 'express';
import LightRAGService from '../services/lightrag.service';

const router = Router();

// Get the pre-initialized LightRAG service
const getLightRAG = async (): Promise<LightRAGService> => {
  const { lightRAGService, pgPool, redis } = require('../server');
  
  // Use pre-initialized service if available
  if (lightRAGService) {
    return lightRAGService;
  }
  
  // Fallback: create new instance if needed (shouldn't happen normally)
  console.log('⚠️ Creating new LightRAG instance (fallback)');
  const newInstance = new LightRAGService(pgPool, redis);
  await newInstance.initialize();
  return newInstance;
};

/**
 * LightRAG Dashboard Stats
 */
router.get('/api/v2/lightrag/stats', async (req: Request, res: Response) => {
  try {
    const lightrag = await getLightRAG();
    const stats = await lightrag.getStats();
    res.json(stats);
  } catch (error: any) {
    console.error('LightRAG stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Query LightRAG
 */
router.post('/api/v2/lightrag/query', async (req: Request, res: Response) => {
  try {
    const { query, question, context, temperature, mode, useCache, limit } = req.body;
    
    // Support both 'query' and 'question' parameter names
    const queryText = query || question;
    
    if (!queryText) {
      return res.status(400).json({ error: 'Query or question is required' });
    }

    const lightrag = await getLightRAG();
    const result = await lightrag.query(queryText, context, {
      temperature: temperature || 0.3,
      mode: mode || 'hybrid',
      useCache: useCache !== false,
      limit: limit || 5
    });
    res.json(result);
  } catch (error: any) {
    console.error('LightRAG query error:', error);
    res.status(500).json({ error: 'Query failed' });
  }
});

/**
 * Add documents to LightRAG
 */
router.post('/api/v2/lightrag/documents', async (req: Request, res: Response) => {
  try {
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents array is required' });
    }

    const lightrag = await getLightRAG();
    await lightrag.addDocuments(documents);
    res.json({ 
      success: true, 
      count: documents.length,
      message: `${documents.length} documents added successfully`
    });
  } catch (error: any) {
    console.error('Add documents error:', error);
    res.status(500).json({ error: 'Failed to add documents' });
  }
});

/**
 * Clear LightRAG data
 */
router.delete('/api/v2/lightrag/clear', async (req: Request, res: Response) => {
  try {
    const lightrag = await getLightRAG();
    await lightrag.clear();
    res.json({ success: true, message: 'LightRAG data cleared' });
  } catch (error: any) {
    console.error('Clear error:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

/**
 * Dashboard overview data
 */
router.get('/api/v2/dashboard', async (req: Request, res: Response) => {
  try {
    // Import server dependencies when needed
    const { pgPool, redis } = require('../server');
    
    // Check Redis cache first
    const cacheKey = 'asb:dashboard:stats';
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // Get various stats
    const [
      dbStats,
      redisInfo,
      lightragStats,
      recentChats
    ] = await Promise.all([
      // Database stats
      pgPool.query(`
        SELECT 
          (SELECT COUNT(*) FROM rag_data.documents) as document_count,
          (SELECT COUNT(*) FROM conversations) as conversation_count,
          (SELECT COUNT(*) FROM messages) as message_count,
          (SELECT pg_database_size(current_database())) as db_size
      `),
      
      // Redis stats
      redis.info('stats'),
      
      // LightRAG stats - now using pre-initialized service
      (async () => {
        try {
          const lightrag = await getLightRAG();
          return await lightrag.getStats();
        } catch (error) {
          console.error('Failed to get LightRAG stats:', error);
          return { documents: 0, provider: 'unavailable' };
        }
      })(),
      
      // Recent conversations
      pgPool.query(`
        SELECT 
          c.id,
          c.title,
          c.created_at,
          COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT 5
      `)
    ]);

    // Parse Redis info
    const redisStats = {
      connected: true,
      used_memory: '0',  // Changed to string
      total_commands_processed: 0
    };
    
    redisInfo.split('\n').forEach((line: string) => {
      if (line.includes('used_memory_human:')) {
        redisStats.used_memory = line.split(':')[1].trim();  // Keep as string
      }
      if (line.includes('total_commands_processed:')) {
        redisStats.total_commands_processed = parseInt(line.split(':')[1].trim());
      }
    });

    const dashboardData = {
      database: {
        documents: parseInt(dbStats.rows[0].document_count) || 0,
        conversations: parseInt(dbStats.rows[0].conversation_count) || 0,
        messages: parseInt(dbStats.rows[0].message_count) || 0,
        size: Math.round(parseInt(dbStats.rows[0].db_size) / 1024 / 1024) + ' MB'
      },
      redis: redisStats,
      lightrag: lightragStats,
      recentActivity: recentChats.rows,
      timestamp: new Date()
    };
    
    // Cache for 30 seconds
    await redis.set(cacheKey, JSON.stringify(dashboardData), 'EX', 30);
    
    res.json(dashboardData);
  } catch (error: any) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

export default router;