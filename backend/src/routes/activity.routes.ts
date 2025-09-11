import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize activity tracking table
router.post('/init-table', async (req: Request, res: Response) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        operation_type VARCHAR(50) NOT NULL,
        source_url TEXT,
        title TEXT,
        status VARCHAR(20) NOT NULL,
        details JSONB,
        metrics JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create indexes for better performance
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_operation_type 
      ON activity_log(operation_type);
      
      CREATE INDEX IF NOT EXISTS idx_activity_status 
      ON activity_log(status);
      
      CREATE INDEX IF NOT EXISTS idx_activity_created_at 
      ON activity_log(created_at DESC);
    `);
    
    res.json({ success: true, message: 'Activity table initialized' });
  } catch (error: any) {
    console.error('Error initializing activity table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get activity history with statistics
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { operation_type, status, limit = 100, offset = 0 } = req.query;
    
    // Build where clause
    const conditions = [];
    const params = [];
    let paramCount = 1;
    
    if (operation_type && operation_type !== 'all') {
      conditions.push(`operation_type = $${paramCount++}`);
      params.push(operation_type);
    }
    
    if (status) {
      conditions.push(`status = $${paramCount++}`);
      params.push(status);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get activities
    params.push(limit, offset);
    const activitiesResult = await pgPool.query(`
      SELECT * FROM activity_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `, params);
    
    // Get statistics
    const statsResult = await pgPool.query(`
      SELECT 
        operation_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
        AVG((metrics->>'token_count')::numeric) as avg_tokens,
        SUM((metrics->>'token_count')::numeric) as total_tokens,
        AVG((metrics->>'chunk_count')::numeric) as avg_chunks,
        SUM((metrics->>'chunk_count')::numeric) as total_chunks,
        AVG((metrics->>'content_length')::numeric) as avg_content_length
      FROM activity_log
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY operation_type
      ORDER BY count DESC
    `);
    
    res.json({
      activities: activitiesResult.rows,
      statistics: statsResult.rows,
      total: activitiesResult.rowCount
    });
  } catch (error: any) {
    console.error('Error fetching activity history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Log a new activity
router.post('/log', async (req: Request, res: Response) => {
  try {
    const {
      operation_type,
      source_url,
      title,
      status,
      details,
      metrics,
      error_message
    } = req.body;
    
    const result = await pgPool.query(`
      INSERT INTO activity_log (
        operation_type, source_url, title, status, 
        details, metrics, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      operation_type,
      source_url,
      title,
      status,
      details || {},
      metrics || {},
      error_message
    ]);
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get activity summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const summaryResult = await pgPool.query(`
      SELECT 
        COUNT(*) as total_activities,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as failed,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as last_7d,
        COUNT(DISTINCT operation_type) as operation_types,
        MAX(created_at) as last_activity
      FROM activity_log
    `);
    
    const topOperationsResult = await pgPool.query(`
      SELECT 
        operation_type,
        COUNT(*) as count
      FROM activity_log
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY operation_type
      ORDER BY count DESC
      LIMIT 5
    `);
    
    res.json({
      summary: summaryResult.rows[0],
      topOperations: topOperationsResult.rows
    });
  } catch (error: any) {
    console.error('Error fetching activity summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear old activities
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    
    const result = await pgPool.query(`
      DELETE FROM activity_log
      WHERE created_at < NOW() - INTERVAL '${parseInt(days as string)} days'
      RETURNING COUNT(*) as deleted_count
    `);
    
    res.json({ 
      success: true, 
      deleted: result.rowCount,
      message: `Deleted ${result.rowCount} activities older than ${days} days`
    });
  } catch (error: any) {
    console.error('Error clearing activities:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;