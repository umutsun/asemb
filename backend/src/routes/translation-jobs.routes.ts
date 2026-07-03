import { Router, Request, Response } from 'express';
import { translationService } from '../services/translation.service';

/**
 * Data Translations — table-to-table batch translator.
 * Mounted at /api/v2/translations. Backs the /dashboard/translations page.
 * Real + settings-driven (see translation.service.ts). Provider keys come from `settings`.
 */
const router = Router();

function fail(res: Response, error: any) {
  const status = typeof error?.status === 'number' ? error.status : 500;
  if (status >= 500) console.error('[translations] error:', error);
  return res.status(status).json({ success: false, error: error?.message || 'Unknown error' });
}

// Available translation providers (derived from settings).
router.get('/providers', async (_req: Request, res: Response) => {
  try {
    const providers = await translationService.listProviders();
    res.json({ success: true, providers });
  } catch (error) {
    fail(res, error);
  }
});

// Translatable tables in the active database.
router.get('/tables', async (_req: Request, res: Response) => {
  try {
    const tables = await translationService.listTables();
    res.json({ success: true, tables });
  } catch (error) {
    fail(res, error);
  }
});

// Preview a table's structure + sample rows.
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { table, limit = 5 } = req.body || {};
    if (!table) return res.status(400).json({ success: false, error: 'Table name is required' });
    const preview = await translationService.previewTable(table, limit);
    res.json({ success: true, table: preview });
  } catch (error) {
    fail(res, error);
  }
});

// Start a batch translation job.
router.post('/translate-table', async (req: Request, res: Response) => {
  try {
    const { table, targetTable, provider, sourceLang, targetLang, columns } = req.body || {};
    const job = await translationService.startJob({ table, targetTable, provider, sourceLang, targetLang, columns });
    res.json({ success: true, jobId: job.id, message: 'Translation job started', provider: job.provider });
  } catch (error) {
    fail(res, error);
  }
});

// List jobs.
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '50', 10) || 50;
    const jobs = await translationService.getJobs(limit);
    res.json({ success: true, jobs, total: jobs.length });
  } catch (error) {
    fail(res, error);
  }
});

// Aggregate stats.
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await translationService.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    fail(res, error);
  }
});

// Get a single job.
router.get('/job/:jobId', async (req: Request, res: Response) => {
  try {
    const job = await translationService.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, job });
  } catch (error) {
    fail(res, error);
  }
});

// Job actions (cancel).
router.post('/job/:jobId', async (req: Request, res: Response) => {
  try {
    const { action } = req.body || {};
    if (action !== 'cancel') {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }
    const result = await translationService.cancelJob(req.params.jobId);
    if (!result.cancelled) {
      return res.status(400).json({ success: false, error: result.message });
    }
    res.json({ success: true, message: result.message });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
