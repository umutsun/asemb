/**
 * Relationships Routes - Proxy to Python relationship extraction service
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Default to the real Python service port (:8004); env overrides. (:8003 was a stale default.)
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8004';

/**
 * GET /api/v2/relationships/stats
 * Overall extraction statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/api/python/relationships/stats`, {
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships stats error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * GET /api/v2/relationships/graph-data
 * Cross-table relationship data for dashboard visualization
 */
router.get('/graph-data', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/api/python/relationships/graph-data`, {
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships graph-data error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * POST /api/v2/relationships/resolve
 * Run reference resolution
 */
router.post('/resolve', authenticateToken, async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/relationships/resolve`,
      req.body,
      { timeout: 120000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships resolve error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * POST /api/v2/relationships/extract-batch
 * Start batch extraction job
 */
router.post('/extract-batch', authenticateToken, async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/relationships/extract-batch`,
      req.body,
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships extract-batch error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * GET /api/v2/relationships/extract-batch/status/:jobId
 * Get batch extraction progress
 */
router.get('/extract-batch/status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const response = await axios.get(
      `${PYTHON_SERVICE_URL}/api/python/relationships/extract-batch/status/${jobId}`,
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships batch status error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * POST /api/v2/relationships/extract-batch/cancel/:jobId
 * Cancel a running batch extraction job
 */
router.post('/extract-batch/cancel/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/python/relationships/extract-batch/cancel/${jobId}`,
      {},
      { timeout: 30000 }
    );
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships batch cancel error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

/**
 * POST /api/v2/relationships/sync-neo4j
 * Manually trigger Neo4j synchronization
 */
router.post('/sync-neo4j', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/api/python/relationships/sync-neo4j`, {}, {
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error: any) {
    logger.error('Relationships sync-neo4j error:', error.message);
    res.status(500).json({ error: error.message || 'Python service unreachable' });
  }
});

export default router;
