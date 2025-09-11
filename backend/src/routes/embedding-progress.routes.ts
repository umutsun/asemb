import { Router, Request, Response } from 'express';
import { pgPool } from '../server';

const router = Router();

// Get embedding progress
router.get('/api/v2/embeddings/progress', async (req: Request, res: Response) => {
  try {
    // Check if table exists
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS embedding_progress (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        document_type TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    const result = await pgPool.query(`
      SELECT * FROM embedding_progress 
      WHERE status IN ('pending', 'processing')
      ORDER BY started_at DESC
      LIMIT 10
    `);

    const stats = await pgPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing
      FROM embedding_progress
      WHERE started_at > NOW() - INTERVAL '24 hours'
    `);

    res.json({
      success: true,
      active: result.rows,
      stats: stats.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching embedding progress:', error);
    res.json({
      success: false,
      active: [],
      stats: { total: 0, completed: 0, failed: 0, processing: 0 },
      error: error.message
    });
  }
});

// Start embedding process
router.post('/api/v2/embeddings/start', async (req: Request, res: Response) => {
  try {
    const { document_id, document_type, total_chunks } = req.body;

    const result = await pgPool.query(`
      INSERT INTO embedding_progress (document_id, document_type, status, total_chunks)
      VALUES ($1, $2, 'processing', $3)
      RETURNING *
    `, [document_id, document_type, total_chunks || 0]);

    res.json({
      success: true,
      progress: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error starting embedding process:', error);
    res.status(500).json({
      error: 'Failed to start embedding process',
      message: error.message
    });
  }
});

// Update embedding progress
router.put('/api/v2/embeddings/progress/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { processed_chunks, status, error_message } = req.body;

    let query = `
      UPDATE embedding_progress 
      SET processed_chunks = $2, 
          progress = CASE WHEN total_chunks > 0 THEN (processed_chunks * 100 / total_chunks) ELSE 0 END
    `;
    const params: any[] = [id, processed_chunks];

    if (status) {
      query += `, status = $${params.length + 1}`;
      params.push(status);
      
      if (status === 'completed' || status === 'failed') {
        query += `, completed_at = CURRENT_TIMESTAMP`;
      }
    }

    if (error_message) {
      query += `, error_message = $${params.length + 1}`;
      params.push(error_message);
    }

    query += ` WHERE id = $1 RETURNING *`;

    const result = await pgPool.query(query, params);

    res.json({
      success: true,
      progress: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating embedding progress:', error);
    res.status(500).json({
      error: 'Failed to update embedding progress',
      message: error.message
    });
  }
});

export default router;