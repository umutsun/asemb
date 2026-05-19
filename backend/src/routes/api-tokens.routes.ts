import { Router, Response } from 'express';
import {
  authenticateToken,
  requireAdmin,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import {
  createToken,
  listTokens,
  revokeToken,
} from '../services/api-token.service';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/tokens', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tokens = await listTokens();
    return res.json({ tokens });
  } catch (err: any) {
    console.error('[api-tokens] list failed:', err);
    return res.status(500).json({ error: 'Failed to list tokens' });
  }
});

router.post('/tokens', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const rawScopes = req.body?.scopes;
    const scopes =
      Array.isArray(rawScopes) && rawScopes.every((s) => typeof s === 'string')
        ? (rawScopes as string[])
        : undefined;

    const createdBy = req.user?.userId ?? null;
    const { row, plaintext } = await createToken({ name, scopes, createdBy });

    // Plaintext returned ONCE here; never stored, never retrievable again.
    return res.status(201).json({
      token: plaintext,
      id: row.id,
      name: row.name,
      scopes: row.scopes,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
    });
  } catch (err: any) {
    console.error('[api-tokens] create failed:', err);
    return res.status(500).json({ error: 'Failed to create token' });
  }
});

router.delete('/tokens/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ok = await revokeToken(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Token not found or already revoked' });
    }
    return res.json({ revoked: true });
  } catch (err: any) {
    console.error('[api-tokens] revoke failed:', err);
    return res.status(500).json({ error: 'Failed to revoke token' });
  }
});

export default router;
