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

// --- Embeddings Management Routes ---

// Get available tables for embedding
router.get('/api/v2/embeddings/tables', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    
    // Mock data for available tables
    const tables = [
      {
        name: 'documents',
        displayName: 'Dokümanlar',
        database: 'asemb',
        totalRecords: 1500,
        embeddedRecords: 1200,
        textColumns: 3
      },
      {
        name: 'knowledge_base',
        displayName: 'Bilgi Tabanı',
        database: 'asemb',
        totalRecords: 850,
        embeddedRecords: 850,
        textColumns: 2
      },
      {
        name: 'tax_regulations',
        displayName: 'Vergi Mevzuatı',
        database: 'asemb',
        totalRecords: 2300,
        embeddedRecords: 1800,
        textColumns: 4
      },
      {
        name: 'case_studies',
        displayName: 'Örnek Olaylar',
        database: 'asemb',
        totalRecords: 450,
        embeddedRecords: 0,
        textColumns: 2
      }
    ];
    
    res.json({ tables });
  } catch (error: any) {
    console.error('Failed to get tables:', error);
    res.status(500).json({ error: 'Failed to get tables' });
  }
});

// Get migration progress
router.get('/api/v2/embeddings/progress', async (req: Request, res: Response) => {
  try {
    // Return mock progress data
    res.json({
      progress: {
        status: 'idle', // idle, processing, paused, completed
        current: 0,
        total: 0,
        percentage: 0,
        currentTable: null,
        error: null,
        tokensUsed: 0,
        estimatedCost: 0,
        startTime: null,
        estimatedTimeRemaining: null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// Get migration history
router.get('/api/v2/embeddings/history', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    
    // Mock history data
    const history = [
      {
        migration_id: 'mig_001',
        table_name: 'documents',
        total_records: 500,
        processed_records: 500,
        successful_records: 500,
        tokens_used: 125000,
        estimated_cost: 0.0125,
        status: 'completed',
        model_used: 'text-embedding-ada-002',
        started_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        completed_at: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
        duration_seconds: 3600,
        progress_percentage: 100
      },
      {
        migration_id: 'mig_002',
        table_name: 'knowledge_base',
        total_records: 850,
        processed_records: 850,
        successful_records: 850,
        tokens_used: 212500,
        estimated_cost: 0.0213,
        status: 'completed',
        model_used: 'text-embedding-ada-002',
        started_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        completed_at: new Date(Date.now() - 1000 * 60 * 60 * 47).toISOString(),
        duration_seconds: 3600,
        progress_percentage: 100
      }
    ];
    
    res.json({ history });
  } catch (error: any) {
    console.error('Failed to get history:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Start migration
router.post('/api/v2/embeddings/migrate', async (req: Request, res: Response) => {
  try {
    const { tables, batchSize } = req.body;
    
    // Mock migration start
    console.log('Starting migration for tables:', tables);
    console.log('Batch size:', batchSize);
    
    res.json({
      success: true,
      message: 'Migration started',
      migrationId: `mig_${Date.now()}`
    });
  } catch (error: any) {
    console.error('Failed to start migration:', error);
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Pause migration
router.post('/api/v2/embeddings/pause', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Migration paused'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to pause migration' });
  }
});

// Resume migration
router.post('/api/v2/embeddings/resume', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Migration resumed'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to resume migration' });
  }
});

// Generate embedding for text
router.post('/api/v2/embeddings/generate', async (req: Request, res: Response) => {
  try {
    const { text, provider } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Mock embedding generation
    const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
    
    res.json({
      success: true,
      embedding,
      dimensions: 1536,
      provider: provider || 'openai',
      tokens: Math.ceil(text.length / 4),
      cached: false,
      processingTime: '0.5s'
    });
  } catch (error: any) {
    console.error('Failed to generate embedding:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// Semantic search
router.post('/api/v2/search/semantic', async (req: Request, res: Response) => {
  try {
    const { query, limit = 5, threshold = 0.7 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Mock search results
    const results = [
      {
        content: 'ASB (Alice Semantic Bridge) yapay zeka destekli bir RAG sistemidir.',
        similarity: 0.92,
        document_type: 'documentation',
        document_id: 'doc_001'
      },
      {
        content: 'Sistem, dokümanları vektör veritabanında saklar ve anlamsal aramalar yapar.',
        similarity: 0.85,
        document_type: 'knowledge_base',
        document_id: 'kb_002'
      },
      {
        content: 'LightRAG modülü ile gelişmiş sorgulama yetenekleri sağlar.',
        similarity: 0.78,
        document_type: 'documentation',
        document_id: 'doc_003'
      }
    ];
    
    res.json({
      results: results.filter(r => r.similarity >= threshold).slice(0, limit),
      executionTime: '125ms'
    });
  } catch (error: any) {
    console.error('Failed to search:', error);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// LightRAG embed endpoint
router.post('/api/v2/lightrag/embed', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Mock LightRAG embedding
    const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
    
    res.json({
      success: true,
      embedding,
      dimensions: 1536,
      provider: 'lightrag',
      tokens: Math.ceil(text.length / 4),
      cached: false,
      processingTime: '0.3s'
    });
  } catch (error: any) {
    console.error('Failed to generate LightRAG embedding:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});



// --- Main Dashboard Route ---
// Redirect v2 to main dashboard endpoint
router.get('/api/v2/dashboard', async (req: Request, res: Response) => {
  try {
    const { pgPool, redis } = require('../server');
    const lightrag = await getLightRAG();
    
    // Database stats - check what tables exist first
    let documentsCount = 0;
    let conversationsCount = 0;
    let messagesCount = 0;
    let dbSize = 0;
    
    try {
      // Try to get documents count from embeddings table instead
      const embeddingsResult = await pgPool.query(`
        SELECT COUNT(DISTINCT document_id) as count FROM embeddings
      `);
      documentsCount = embeddingsResult.rows[0].count || 0;
    } catch (err) {
      console.log('Error counting documents:', err);
    }
    
    try {
      const convResult = await pgPool.query(`SELECT COUNT(*) as count FROM conversations`);
      conversationsCount = convResult.rows[0].count || 0;
    } catch (err) {
      console.log('Error counting conversations:', err);
    }
    
    try {
      const msgResult = await pgPool.query(`SELECT COUNT(*) as count FROM messages`);
      messagesCount = msgResult.rows[0].count || 0;
    } catch (err) {
      console.log('Error counting messages:', err);
    }
    
    try {
      const sizeResult = await pgPool.query(`SELECT pg_database_size(current_database()) as db_size`);
      dbSize = sizeResult.rows[0].db_size || 0;
    } catch (err) {
      console.log('Error getting db size:', err);
    }
    
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
    const formattedSize = dbSize > 1073741824 
      ? `${(dbSize / 1073741824).toFixed(2)} GB`
      : dbSize > 1048576 
      ? `${(dbSize / 1048576).toFixed(2)} MB`
      : `${(dbSize / 1024).toFixed(2)} KB`;
    
    res.json({
      database: {
        documents: documentsCount,
        conversations: conversationsCount,
        messages: messagesCount,
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
