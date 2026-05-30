/**
 * DataFreshnessMonitor — Redis Iris "real-time / fresh context" pillar (OSS, air-gapped).
 *
 * Iris promises agents act on "up-to-the-instant" state, not stale exports. Its Enterprise
 * mechanism (RDI/CDC) is excluded by our OSS-only decision, so we deliver the same guarantee
 * centrally: instead of hooking every ingest/embed site, we WATCH THE DESTINATION. This
 * service polls `unified_embeddings` (row count + MAX(updated_at)); whenever the corpus
 * changes — by ANY path (document upload, scrape, crawl, CSV, re-embed) — it bumps
 * `ragSettings.corpusVersion`, which changes the WS2 semantic-cache scope_key so stale cached
 * answers are orphaned (they TTL out — no FLUSH). One central mechanism, uniform across paths.
 *
 * Safety: read-only on unified_embeddings; only writes ragSettings.corpusVersion. Every step is
 * wrapped — any error is logged and skipped. Disabled by default (ragSettings.autoFreshnessEnabled);
 * config (enable + interval) is re-read each tick so it can be toggled at runtime.
 */

import { lsembPool } from '../config/database.config';
import { settingsService } from './settings.service';
import { logger } from '../utils/logger';

interface FreshnessSnapshot {
  count: number;
  maxUpdatedEpoch: number;
}

export class DataFreshnessMonitorService {
  private static instance: DataFreshnessMonitorService;
  private timer: NodeJS.Timeout | null = null;
  private last: FreshnessSnapshot | null = null;
  private lastBumpAt: string | null = null;
  private running = false;

  static getInstance(): DataFreshnessMonitorService {
    if (!DataFreshnessMonitorService.instance) {
      DataFreshnessMonitorService.instance = new DataFreshnessMonitorService();
    }
    return DataFreshnessMonitorService.instance;
  }

  /** Start the polling loop (idempotent). Reschedules each tick using the live poll interval. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      try {
        await this.checkOnce();
      } catch (e: any) {
        logger.warn('[freshness] tick error: ' + (e?.message || e));
      }
      const secs = await this.pollSeconds();
      this.timer = setTimeout(tick, secs * 1000);
    };
    // Delay the first tick so the DB/pool is ready at boot.
    this.timer = setTimeout(tick, 5000);
    logger.info('[freshness] DataFreshnessMonitor started (polls unified_embeddings; bumps corpusVersion on change)');
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
  }

  private async isEnabled(): Promise<boolean> {
    try {
      const v = await settingsService.getSetting('ragSettings.autoFreshnessEnabled');
      return String(v).toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  private async pollSeconds(): Promise<number> {
    try {
      const v = await settingsService.getSetting('ragSettings.freshnessPollSeconds');
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) && n >= 10 && n <= 3600 ? n : 30;
    } catch {
      return 30;
    }
  }

  private async snapshot(): Promise<FreshnessSnapshot> {
    // bigint (EXTRACT EPOCH) comes back as a string from node-pg; coerce with Number().
    const r = await lsembPool.query(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(EXTRACT(EPOCH FROM MAX(updated_at))::bigint, 0) AS maxupd
       FROM unified_embeddings`
    );
    return {
      count: Number(r.rows[0]?.cnt ?? 0),
      maxUpdatedEpoch: Number(r.rows[0]?.maxupd ?? 0),
    };
  }

  private async checkOnce(): Promise<void> {
    if (!(await this.isEnabled())) return;
    const snap = await this.snapshot();
    if (this.last === null) {
      this.last = snap; // first observation: establish baseline, do not bump
      return;
    }
    if (snap.count !== this.last.count || snap.maxUpdatedEpoch !== this.last.maxUpdatedEpoch) {
      this.last = snap;
      await this.bumpCorpusVersion();
    }
  }

  /** Bump ragSettings.corpusVersion to a fresh epoch token → WS2 cache scope_key changes. */
  private async bumpCorpusVersion(): Promise<void> {
    try {
      await lsembPool.query(
        `INSERT INTO settings (key, value, category)
         VALUES ('ragSettings.corpusVersion', EXTRACT(EPOCH FROM NOW())::bigint::text, 'rag')
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`
      );
      try { settingsService.forceInvalidateCache(); } catch { /* non-fatal */ }
      this.lastBumpAt = new Date().toISOString();
      logger.info('[freshness] corpus changed → bumped ragSettings.corpusVersion (semantic cache invalidated)');
    } catch (e: any) {
      logger.warn('[freshness] corpusVersion bump failed (non-fatal): ' + (e?.message || e));
    }
  }

  /** Read-only status for the Settings UI / health endpoint. Never throws. */
  async getStatus(): Promise<any> {
    const enabled = await this.isEnabled();
    const pollSeconds = await this.pollSeconds();
    let snap: FreshnessSnapshot | null = null;
    try {
      snap = await this.snapshot();
    } catch { /* DB may be down */ }
    let corpusVersion: string | null = null;
    try {
      corpusVersion = await settingsService.getSetting('ragSettings.corpusVersion');
    } catch { /* ignore */ }
    return {
      enabled,
      pollSeconds,
      totalEmbeddings: snap ? snap.count : null,
      lastUpdated: snap && snap.maxUpdatedEpoch ? new Date(snap.maxUpdatedEpoch * 1000).toISOString() : null,
      corpusVersion,
      lastBumpAt: this.lastBumpAt,
    };
  }
}

export const dataFreshnessMonitor = DataFreshnessMonitorService.getInstance();
