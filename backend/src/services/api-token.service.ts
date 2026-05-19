import crypto from 'crypto';
import pool from '../config/database';

export const API_TOKEN_PREFIX = 'lsemb_';

export interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ApiTokenAuthResult {
  id: string;
  scopes: string[];
}

export function hashToken(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function generatePlaintextToken(): string {
  return API_TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
}

export async function findActiveTokenByPlaintext(
  plaintext: string
): Promise<ApiTokenAuthResult | null> {
  if (!plaintext.startsWith(API_TOKEN_PREFIX)) return null;
  const hash = hashToken(plaintext);
  const { rows } = await pool.query<{ id: string; scopes: string[] }>(
    `SELECT id, scopes
       FROM api_tokens
      WHERE token_hash = $1 AND revoked_at IS NULL
      LIMIT 1`,
    [hash]
  );
  return rows[0] ?? null;
}

export function touchLastUsed(id: string): void {
  pool
    .query(`UPDATE api_tokens SET last_used_at = now() WHERE id = $1`, [id])
    .catch(() => {});
}

export async function createToken(params: {
  name: string;
  scopes?: string[];
  createdBy?: string | null;
}): Promise<{ row: ApiTokenRow; plaintext: string }> {
  const plaintext = generatePlaintextToken();
  const hash = hashToken(plaintext);
  const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : ['chat'];
  const { rows } = await pool.query<ApiTokenRow>(
    `INSERT INTO api_tokens (name, token_hash, scopes, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, scopes, created_by, created_at, last_used_at, revoked_at`,
    [params.name, hash, scopes, params.createdBy ?? null]
  );
  return { row: rows[0], plaintext };
}

export async function listTokens(): Promise<ApiTokenRow[]> {
  const { rows } = await pool.query<ApiTokenRow>(
    `SELECT id, name, scopes, created_by, created_at, last_used_at, revoked_at
       FROM api_tokens
      ORDER BY (revoked_at IS NULL) DESC, created_at DESC`
  );
  return rows;
}

export async function revokeToken(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE api_tokens SET revoked_at = now()
      WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}
