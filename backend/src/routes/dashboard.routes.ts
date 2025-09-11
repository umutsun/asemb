import { Router, Request, Response } from 'express';
import LightRAGService from '../services/lightrag.service';
import axios from 'axios';

const router = Router();
const ragAnythingRouter = Router();

// --- RAG-anything Proxy Setup ---
const RAG_ANYTHING_BASE_URL = process.env.RAG_ANYTHING_URL || 'http://localhost:5000';

ragAnythingRouter.use(async (req, res) => {
  try {
    const response = await axios({
      method: req.method as any,
      url: `${RAG_ANYTHING_BASE_URL}${req.path}`,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error('RAG-anything proxy error:', error.message);
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: 'Proxy request failed' };
    res.status(status).json(data);
  }
});

// --- LightRAG Service Setup ---
const getLightRAG = async (): Promise<LightRAGService> => {
  const { lightRAGService, pgPool, redis } = require('../server');
  if (lightRAGService) return lightRAGService;
  
  console.log('⚠️ Creating new LightRAG instance (fallback)');
  const newInstance = new LightRAGService(pgPool, redis);
  await newInstance.initialize();
  return newInstance;
};

// --- LightRAG API Routes ---

router.get('/api/v2/lightrag/stats', async (req: Request, res: Response) => {
  try {
    const lightrag = await getLightRAG();
    const stats = await lightrag.getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.post('/api/v2/lightrag/query', async (req: Request, res: Response) => {
  try {
    const { query, question, context, temperature, mode, useCache, limit } = req.body;
    const queryText = query || question;
    if (!queryText) return res.status(400).json({ error: 'Query is required' });

    const lightrag = await getLightRAG();
    const result = await lightrag.query(queryText, context, { temperature, mode, useCache, limit });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Query failed' });
  }
});

router.get('/api/v2/lightrag/documents', async (req: Request, res: Response) => {
  try {
    const lightrag = await getLightRAG();
    const documents = await lightrag.listDocuments();
    res.json(documents);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

router.post('/api/v2/lightrag/documents', async (req: Request, res: Response) => {
  try {
    const { documents } = req.body;
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents array is required' });
    }
    const lightrag = await getLightRAG();
    await lightrag.addDocuments(documents);
    res.json({ success: true, message: `${documents.length} documents added.` });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add documents' });
  }
});

router.delete('/api/v2/lightrag/documents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lightrag = await getLightRAG();
    const result = await lightrag.deleteDocument(parseInt(id));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

router.delete('/api/v2/lightrag/clear', async (req: Request, res: Response) => {
  try {
    const lightrag = await getLightRAG();
    await lightrag.clear();
    res.json({ success: true, message: 'LightRAG data cleared' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to clear data' });
  }
});


// --- Main Dashboard Route ---
// Redirect v2 to main dashboard endpoint
router.get('/api/v2/dashboard', async (req: Request, res: Response) => {
  try {
    const { pgPool, redis } = require('../server');
    const lightrag = await getLightRAG();
    
    // Database stats
    const dbStats = await pgPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM rag_data.documents) as documents,
        (SELECT COUNT(*) FROM conversations) as conversations,
        (SELECT COUNT(*) FROM messages) as messages,
        pg_database_size(current_database()) as db_size
    `);
    
    // Redis stats
    let redisStats = {
      connected: false,
      used_memory: '0 MB',
      total_commands_processed: 0,
      cached_embeddings: 0
    };
    
    try {
      if (redis && redis.status === 'ready') {
        const info = await redis.info('memory');
        const memMatch = info.match(/used_memory_human:(.+)/);
        redisStats.connected = true;
        redisStats.used_memory = memMatch ? memMatch[1].trim() : '0 MB';
      }
    } catch (err) {
      console.log('Redis stats error:', err);
    }
    
    // LightRAG stats
    const lightragStats = await lightrag.getStats();
    
    // Recent activity
    const recentActivity = await pgPool.query(`
      SELECT c.id, c.title, 
             COUNT(m.id) as message_count, 
             c.created_at 
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      GROUP BY c.id, c.title, c.created_at
      ORDER BY c.created_at DESC 
      LIMIT 10
    `);
    
    // Format database size
    const dbSize = dbStats.rows[0].db_size;
    const formattedSize = dbSize > 1073741824 
      ? `${(dbSize / 1073741824).toFixed(2)} GB`
      : dbSize > 1048576 
      ? `${(dbSize / 1048576).toFixed(2)} MB`
      : `${(dbSize / 1024).toFixed(2)} KB`;
    
    res.json({
      database: {
        documents: parseInt(dbStats.rows[0].documents) || 0,
        conversations: parseInt(dbStats.rows[0].conversations) || 0,
        messages: parseInt(dbStats.rows[0].messages) || 0,
        size: formattedSize,
        embeddings: 0,
        vectors: 0
      },
      redis: redisStats,
      lightrag: lightragStats,
      rag: {
        totalChunks: 0,
        avgChunkSize: 0,
        indexStatus: 'active',
        lastIndexTime: new Date().toISOString()
      },
      recentActivity: recentActivity.rows
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// --- Simple Dashboard Route for Frontend ---
router.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    // Return simple mock data for now to make dashboard work
    res.json({
      database: {
        documents: 150,
        conversations: 45,
        messages: 320,
        size: '125 MB',
        embeddings: 1500,
        vectors: 1500
      },
      redis: {
        connected: true,
        used_memory: '32 MB',
        total_commands_processed: 12500,
        cached_embeddings: 450
      },
      lightrag: {
        initialized: true,
        documentCount: 150,
        lastUpdate: new Date().toISOString(),
        nodeCount: 250,
        edgeCount: 380,
        communities: 12
      },
      rag: {
        totalChunks: 1500,
        avgChunkSize: 1000,
        indexStatus: 'active',
        lastIndexTime: new Date().toISOString()
      },
      recentActivity: [
        {
          id: '1',
          title: 'Vergi Mevzuatı Sorgusu',
          message_count: 5,
          created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString()
        },
        {
          id: '2',
          title: 'KDV İadesi Hakkında',
          message_count: 3,
          created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
        },
        {
          id: '3',
          title: 'Özelge Araması',
          message_count: 7,
          created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        }
      ]
    });
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

// Combine routers
const mainRouter = Router();
mainRouter.use(router); // LightRAG and main dashboard routes
mainRouter.use('/api/v2/rag-anything', ragAnythingRouter); // RAG-anything proxy

export default mainRouter;
