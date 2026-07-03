/**
 * Media routes (multimodal RAG) — browser-facing proxy to the Python media service.
 *
 * The Python media endpoints require an internal X-API-Key and are not reachable
 * from the browser. These authenticated routes proxy ingest/list/status and stream
 * media files (for thumbnails) by reading media_assets.file_path from the DB.
 *
 * Gated downstream by mediaEmbedding.enabled (Python returns 409 when off).
 */
import { Router, Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';
import { lsembPool } from '../config/database.config';

const router = Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'default-dev-key';

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB hard cap (video)
});

// Ingest: proxy multipart upload to the Python media service.
router.post('/api/v2/media/upload', authenticateToken, mediaUpload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file is required' });
      const language = req.body.language || 'tr';
      const sync = req.body.sync ?? 'true';

      const form = new FormData();
      form.append('file', new Blob([req.file.buffer as unknown as BlobPart], { type: req.file.mimetype }), req.file.originalname);
      form.append('language', String(language));
      form.append('sync', String(sync));

      const r = await axios.post(`${PYTHON_URL}/api/python/media/upload`, form, {
        headers: { 'X-API-Key': INTERNAL_API_KEY },
        timeout: 300000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      res.json(r.data);
    } catch (error: any) {
      const status = error.response?.status || 500;
      res.status(status).json({ error: 'media upload failed', details: error.response?.data || error.message });
    }
  }
);

// List assets
router.get('/api/v2/media/assets', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { limit = 50, status } = req.query;
    const r = await axios.get(`${PYTHON_URL}/api/python/media/assets`, {
      headers: { 'X-API-Key': INTERNAL_API_KEY },
      params: { limit, status },
      timeout: 30000,
    });
    res.json(r.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json({ error: 'failed to list media assets' });
  }
});

// Asset status
router.get('/api/v2/media/assets/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const r = await axios.get(`${PYTHON_URL}/api/python/media/assets/${req.params.id}`, {
      headers: { 'X-API-Key': INTERNAL_API_KEY },
      timeout: 30000,
    });
    res.json(r.data);
  } catch (error: any) {
    res.status(error.response?.status || 500).json({ error: 'failed to get media asset' });
  }
});

// Stream the underlying media file (used for thumbnails / previews).
// Reads file_path from the DB; only serves image/video on the same host.
router.get('/api/v2/media/file/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(
      'SELECT file_path, mime_type, asset_type FROM media_assets WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'asset not found' });
    const { file_path, mime_type } = result.rows[0];
    if (!file_path || !fs.existsSync(file_path)) {
      return res.status(404).json({ error: 'file not available' });
    }
    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(path.resolve(file_path)).pipe(res);
  } catch (error: any) {
    res.status(500).json({ error: 'failed to stream media file' });
  }
});

export default router;
