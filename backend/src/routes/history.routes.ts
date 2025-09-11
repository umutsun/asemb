import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

// Initialize history tables
router.post('/api/v2/history/init', async (req: Request, res: Response) => {
  try {
    // Create scraper history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scraper_history (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT,
        content TEXT,
        chunks_count INTEGER DEFAULT 0,
        embeddings_created BOOLEAN DEFAULT FALSE,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create document history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_history (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        file_size INTEGER,
        file_type TEXT,
        content TEXT,
        chunks_count INTEGER DEFAULT 0,
        embeddings_created BOOLEAN DEFAULT FALSE,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    res.json({ 
      success: true, 
      message: 'History tables created successfully' 
    });
  } catch (error) {
    console.error('Error initializing history tables:', error);
    res.status(500).json({ 
      error: 'Failed to initialize history tables' 
    });
  }
});

// Get scraper history
router.get('/api/v2/history/scraper', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM scraper_history 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM scraper_history'
    );

    res.json({
      history: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Error fetching scraper history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch scraper history' 
    });
  }
});

// Add scraper history entry
router.post('/api/v2/history/scraper', async (req: Request, res: Response) => {
  try {
    const { 
      url, 
      title, 
      content, 
      chunks_count, 
      embeddings_created,
      success,
      error_message,
      metadata 
    } = req.body;

    const result = await pool.query(
      `INSERT INTO scraper_history 
       (url, title, content, chunks_count, embeddings_created, success, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [url, title, content, chunks_count, embeddings_created, success, error_message, metadata]
    );

    res.json({
      success: true,
      entry: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding scraper history:', error);
    res.status(500).json({ 
      error: 'Failed to add scraper history' 
    });
  }
});

// Get document history
router.get('/api/v2/history/documents', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM document_history 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM document_history'
    );

    res.json({
      history: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Error fetching document history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch document history' 
    });
  }
});

// Add document history entry
router.post('/api/v2/history/documents', async (req: Request, res: Response) => {
  try {
    const { 
      filename, 
      file_size, 
      file_type, 
      content, 
      chunks_count, 
      embeddings_created,
      success,
      error_message,
      metadata 
    } = req.body;

    const result = await pool.query(
      `INSERT INTO document_history 
       (filename, file_size, file_type, content, chunks_count, embeddings_created, success, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [filename, file_size, file_type, content, chunks_count, embeddings_created, success, error_message, metadata]
    );

    res.json({
      success: true,
      entry: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding document history:', error);
    res.status(500).json({ 
      error: 'Failed to add document history' 
    });
  }
});

// Delete scraper history entry
router.delete('/api/v2/history/scraper/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'DELETE FROM scraper_history WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'History entry deleted'
    });
  } catch (error) {
    console.error('Error deleting scraper history:', error);
    res.status(500).json({ 
      error: 'Failed to delete history entry' 
    });
  }
});

// Delete document history entry
router.delete('/api/v2/history/documents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      'DELETE FROM document_history WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'History entry deleted'
    });
  } catch (error) {
    console.error('Error deleting document history:', error);
    res.status(500).json({ 
      error: 'Failed to delete history entry' 
    });
  }
});

// Clear all scraper history
router.delete('/api/v2/history/scraper', async (req: Request, res: Response) => {
  try {
    await pool.query('TRUNCATE TABLE scraper_history');
    
    res.json({
      success: true,
      message: 'All scraper history cleared'
    });
  } catch (error) {
    console.error('Error clearing scraper history:', error);
    res.status(500).json({ 
      error: 'Failed to clear history' 
    });
  }
});

// Clear all document history
router.delete('/api/v2/history/documents', async (req: Request, res: Response) => {
  try {
    await pool.query('TRUNCATE TABLE document_history');
    
    res.json({
      success: true,
      message: 'All document history cleared'
    });
  } catch (error) {
    console.error('Error clearing document history:', error);
    res.status(500).json({ 
      error: 'Failed to clear history' 
    });
  }
});

// Get statistics
router.get('/api/v2/history/stats', async (req: Request, res: Response) => {
  try {
    const scraperStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN success = true THEN 1 END) as successful,
        COUNT(CASE WHEN success = false THEN 1 END) as failed,
        COUNT(CASE WHEN embeddings_created = true THEN 1 END) as with_embeddings
      FROM scraper_history
    `);

    const documentStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN success = true THEN 1 END) as successful,
        COUNT(CASE WHEN success = false THEN 1 END) as failed,
        COUNT(CASE WHEN embeddings_created = true THEN 1 END) as with_embeddings,
        SUM(file_size) as total_size
      FROM document_history
    `);

    res.json({
      scraper: scraperStats.rows[0],
      documents: documentStats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching history stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics' 
    });
  }
});

export default router;