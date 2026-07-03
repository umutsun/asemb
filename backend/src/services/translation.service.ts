import { lsembPool } from '../config/database.config';
import { redis } from '../config/redis';
import { settingsService } from './settings.service';
import { LLMManager } from './llm-manager.service';

/**
 * Translation service — real, settings-driven text translation plus a background
 * table-to-table batch translator.
 *
 * CLAUDE.md Hard Rules:
 *  #1 settings-driven: provider keys and options come from the `settings` table, never env.
 *  #2 no mock: translation is produced by a real provider (the configured chat LLM by default,
 *     or DeepL/Google when their key is set). There is no fake/demo output.
 *  #3 English-only code.
 */

export type TranslationStatus = 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';

export interface TranslationJob {
  id: string;
  table: string;
  targetTable: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  columns: string[];
  status: TranslationStatus;
  progress: number;
  totalRows: number;
  processedRows: number;
  errors: string[];
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  cost?: number;
}

export interface TranslationResult {
  translatedText: string;
  provider: string;
  cost: number;
}

// 400-class errors the routes surface as bad requests.
export class TranslationValidationError extends Error {
  status = 400;
}
export class ProviderKeyMissingError extends Error {
  status = 400;
  constructor(provider: string) {
    super(`API key not configured for provider "${provider}". Configure it in Settings.`);
  }
}

const JOB_PREFIX = 'translation:job:';
const JOB_SET = 'translation:jobs';
const CANCEL_PREFIX = 'translation:cancel:';
const JOB_TTL_SECONDS = 60 * 60 * 24; // keep job records for 24h
const PROGRESS_EVERY = 5; // persist progress every N rows

// SQL identifier guard — only plain identifiers are allowed for interpolation.
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', ar: 'Arabic', tr: 'Turkish', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  el: 'Greek', th: 'Thai', nl: 'Dutch', pl: 'Polish', hi: 'Hindi',
};
const SUPPORTED_LANGS = ['en', 'ar', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'el', 'th'];

// ── Providers ────────────────────────────────────────────────────────────────

async function getDefaultProvider(): Promise<string> {
  const configured = (await settingsService.getSetting('translation.provider')) || 'llm';
  return configured.toString().trim().toLowerCase() || 'llm';
}

/**
 * Provider catalogue derived from settings. `llm` (the configured chat model) is the
 * default and is available whenever any chat provider key exists. DeepL/Google appear
 * only when their own key is configured.
 */
export async function listProviders(): Promise<Record<string, any>> {
  const [openai, anthropic, google, deepseek, deeplKey, googleTrKey] = await Promise.all([
    settingsService.getSetting('openai.apiKey'),
    settingsService.getSetting('anthropic.apiKey'),
    settingsService.getSetting('google.apiKey'),
    settingsService.getSetting('deepseek.apiKey'),
    settingsService.getSetting('deepl.apiKey'),
    settingsService.getSetting('google.translate.apiKey'),
  ]);

  const hasChatLlm = !!(openai || anthropic || google || deepseek);
  const providers: Record<string, any> = {
    llm: {
      name: 'AI Model (chat provider)',
      hasApiKey: hasChatLlm,
      costPerChar: 0,
      model: null,
      supportedLanguages: SUPPORTED_LANGS,
    },
  };
  if (deeplKey) {
    providers.deepl = {
      name: 'DeepL',
      hasApiKey: true,
      costPerChar: 6 / 1_000_000,
      model: null,
      supportedLanguages: SUPPORTED_LANGS.filter((l) => l !== 'ar'),
    };
  }
  if (googleTrKey) {
    providers.google = {
      name: 'Google Translate',
      hasApiKey: true,
      costPerChar: 20 / 1_000_000,
      model: null,
      supportedLanguages: SUPPORTED_LANGS,
    };
  }
  return providers;
}

// ── Core translation primitive ───────────────────────────────────────────────

export async function translateText(
  text: string,
  opts: { sourceLang?: string; targetLang: string; provider?: string }
): Promise<TranslationResult> {
  const sourceLang = (opts.sourceLang || 'auto').toLowerCase();
  const targetLang = (opts.targetLang || '').toLowerCase();
  if (!targetLang) throw new TranslationValidationError('Target language is required');

  const provider = (opts.provider || (await getDefaultProvider())).toLowerCase();
  if (!text || !text.trim()) return { translatedText: text ?? '', provider, cost: 0 };

  if (provider === 'deepl' || provider === 'google') {
    return translateWithRestProvider(text, sourceLang, targetLang, provider);
  }
  return translateWithLLM(text, sourceLang, targetLang);
}

async function translateWithLLM(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult> {
  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;
  const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const systemPrompt = (sourceLang && sourceLang !== 'auto')
    ? `You are a professional translator. Translate the user's text from ${sourceName} to ${targetName}. `
      + `Preserve meaning, tone, formatting, numbers, and named entities. `
      + `Output ONLY the translated text — no preamble, notes, explanations, or surrounding quotes.`
    : `You are a professional translator. Detect the source language and translate the user's text into ${targetName}. `
      + `Preserve meaning, tone, formatting, numbers, and named entities. `
      + `Output ONLY the translated text — no preamble, notes, explanations, or surrounding quotes.`;

  const llm = LLMManager.getInstance();
  const result = await llm.generateChatResponse(text, { systemPrompt, temperature: 0 });
  return {
    translatedText: (result.content || '').trim(),
    provider: 'llm',
    cost: estimateLlmCost(result.usage),
  };
}

async function translateWithRestProvider(
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: 'deepl' | 'google'
): Promise<TranslationResult> {
  if (provider === 'deepl') {
    const key = await settingsService.getSetting('deepl.apiKey');
    if (!key) throw new ProviderKeyMissingError('deepl');
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('target_lang', targetLang.toUpperCase());
    if (sourceLang && sourceLang !== 'auto') params.append('source_lang', sourceLang.toUpperCase());
    const resp = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!resp.ok) throw new Error(`DeepL error ${resp.status}: ${await resp.text()}`);
    const data: any = await resp.json();
    return {
      translatedText: data?.translations?.[0]?.text ?? '',
      provider,
      cost: text.length * (6 / 1_000_000),
    };
  }

  // google
  const key = await settingsService.getSetting('google.translate.apiKey');
  if (!key) throw new ProviderKeyMissingError('google');
  const resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        ...(sourceLang && sourceLang !== 'auto' ? { source: sourceLang } : {}),
        format: 'text',
      }),
    }
  );
  if (!resp.ok) throw new Error(`Google Translate error ${resp.status}: ${await resp.text()}`);
  const data: any = await resp.json();
  return {
    translatedText: data?.data?.translations?.[0]?.translatedText ?? '',
    provider,
    cost: text.length * (20 / 1_000_000),
  };
}

function estimateLlmCost(usage?: { promptTokens: number; completionTokens: number; totalTokens: number }): number {
  if (!usage) return 0;
  // Rough, provider-agnostic estimate; exact pricing depends on the active model.
  return (usage.totalTokens || 0) * 0.000002;
}

// ── DB introspection (settings-driven pool) ──────────────────────────────────

function assertIdentifier(name: string, kind: string): void {
  if (!name || !IDENTIFIER_RE.test(name)) {
    throw new TranslationValidationError(`Invalid ${kind} name: ${JSON.stringify(name)}`);
  }
}

async function tableExists(table: string): Promise<boolean> {
  const r = await lsembPool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return r.rows.length > 0;
}

async function getTableColumns(table: string): Promise<string[]> {
  const r = await lsembPool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((x: any) => x.column_name);
}

async function assertTableWhitelisted(table: string): Promise<void> {
  assertIdentifier(table, 'table');
  if (!(await tableExists(table))) throw new TranslationValidationError(`Table not found: ${table}`);
}

async function getPrimaryKey(table: string): Promise<string[]> {
  const r = await lsembPool.query(
    `SELECT a.attname AS col
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = to_regclass(format('public.%I', $1::text)) AND i.indisprimary
      ORDER BY a.attnum`,
    [table]
  );
  return r.rows.map((x: any) => x.col);
}

export async function listTables(): Promise<Array<{ name: string; columnCount: number; textColumnCount: number; canTranslate: boolean }>> {
  const result = await lsembPool.query(`
    SELECT t.table_name,
           (SELECT COUNT(*) FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS column_count,
           (SELECT COUNT(*) FROM information_schema.columns c
             WHERE c.table_schema = 'public' AND c.table_name = t.table_name
               AND c.data_type IN ('text', 'character varying', 'character')) AS text_column_count
      FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND t.table_name NOT IN ('spatial_ref_sys')
     ORDER BY t.table_name
  `);
  return result.rows.map((row: any) => ({
    name: row.table_name,
    columnCount: parseInt(row.column_count, 10),
    textColumnCount: parseInt(row.text_column_count, 10),
    canTranslate: parseInt(row.text_column_count, 10) > 0,
  }));
}

export async function previewTable(table: string, limit = 5): Promise<any> {
  await assertTableWhitelisted(table);
  const lim = Math.max(1, Math.min(50, parseInt(String(limit), 10) || 5));
  const structure = await lsembPool.query(
    `SELECT column_name, data_type, is_nullable, character_maximum_length
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  // `table` is validated against the whitelist + identifier regex above.
  const data = await lsembPool.query(`SELECT * FROM "${table}" LIMIT ${lim}`);
  const count = await lsembPool.query(`SELECT COUNT(*)::int AS total FROM "${table}"`);
  return {
    name: table,
    structure: structure.rows,
    sampleData: data.rows,
    totalRows: count.rows[0].total,
    previewLimit: lim,
  };
}

// ── Job store (Redis) ────────────────────────────────────────────────────────

async function saveJob(job: TranslationJob): Promise<void> {
  if (!redis) return;
  try {
    await redis.setex(JOB_PREFIX + job.id, JOB_TTL_SECONDS, JSON.stringify(job));
    await redis.sadd(JOB_SET, job.id);
  } catch (e) {
    console.error('[translation] saveJob failed:', e);
  }
}

export async function getJob(id: string): Promise<TranslationJob | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(JOB_PREFIX + id);
    return raw ? (JSON.parse(raw) as TranslationJob) : null;
  } catch (e) {
    console.error('[translation] getJob failed:', e);
    return null;
  }
}

export async function getJobs(limit = 50): Promise<TranslationJob[]> {
  if (!redis) return [];
  try {
    const ids = await redis.smembers(JOB_SET);
    const jobs: TranslationJob[] = [];
    for (const id of ids) {
      const job = await getJob(id);
      if (job) jobs.push(job);
      else await redis.srem(JOB_SET, id); // prune expired records
    }
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return jobs.slice(0, limit);
  } catch (e) {
    console.error('[translation] getJobs failed:', e);
    return [];
  }
}

export async function cancelJob(id: string): Promise<{ cancelled: boolean; message: string }> {
  const job = await getJob(id);
  if (!job) return { cancelled: false, message: 'Job not found' };
  if (job.status === 'completed') return { cancelled: false, message: 'Job already completed' };
  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  await saveJob(job);
  if (redis) {
    try { await redis.setex(CANCEL_PREFIX + id, JOB_TTL_SECONDS, '1'); } catch { /* best effort */ }
  }
  return { cancelled: true, message: 'Job cancelled successfully' };
}

async function isCancelled(id: string): Promise<boolean> {
  if (!redis) return false;
  try { return (await redis.get(CANCEL_PREFIX + id)) === '1'; } catch { return false; }
}

export async function getStats(): Promise<any> {
  const jobs = await getJobs(1000);
  const stats = {
    totalJobs: jobs.length,
    pendingJobs: 0, processingJobs: 0, completedJobs: 0, errorJobs: 0, cancelledJobs: 0,
    totalCost: 0, totalRows: 0,
    providerUsage: {} as Record<string, { jobs: number; cost: number; rows: number }>,
  };
  for (const j of jobs) {
    if (j.status === 'pending') stats.pendingJobs++;
    else if (j.status === 'processing') stats.processingJobs++;
    else if (j.status === 'completed') stats.completedJobs++;
    else if (j.status === 'error') stats.errorJobs++;
    else if (j.status === 'cancelled') stats.cancelledJobs++;
    stats.totalCost += j.cost || 0;
    stats.totalRows += j.processedRows || 0;
    const pu = stats.providerUsage[j.provider] || { jobs: 0, cost: 0, rows: 0 };
    pu.jobs++; pu.cost += j.cost || 0; pu.rows += j.processedRows || 0;
    stats.providerUsage[j.provider] = pu;
  }
  return stats;
}

// ── Batch job: create + run ──────────────────────────────────────────────────

export async function startJob(params: {
  table: string;
  targetTable: string;
  provider?: string;
  sourceLang?: string;
  targetLang: string;
  columns: string[];
}): Promise<TranslationJob> {
  const { table, targetTable, targetLang } = params;
  const columns = params.columns;

  await assertTableWhitelisted(table);
  assertIdentifier(targetTable, 'target table');
  if (!targetLang) throw new TranslationValidationError('Target language is required');
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TranslationValidationError('At least one column must be selected');
  }
  columns.forEach((c) => assertIdentifier(c, 'column'));
  const tableCols = new Set(await getTableColumns(table));
  for (const c of columns) {
    if (!tableCols.has(c)) throw new TranslationValidationError(`Column not found in ${table}: ${c}`);
  }

  const provider = (params.provider || (await getDefaultProvider())).toLowerCase();
  const job: TranslationJob = {
    id: `trans_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    table,
    targetTable,
    provider,
    sourceLang: (params.sourceLang || 'auto').toLowerCase(),
    targetLang: targetLang.toLowerCase(),
    columns,
    status: 'pending',
    progress: 0,
    totalRows: 0,
    processedRows: 0,
    errors: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    cost: 0,
  };
  await saveJob(job);
  // Run asynchronously; the page polls job/stats for progress.
  void runJob(job.id).catch((err) => console.error('[translation] runJob crashed:', err));
  return job;
}

async function runJob(id: string): Promise<void> {
  const job = await getJob(id);
  if (!job) return;
  try {
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    await saveJob(job);

    const maxRows = parseInt((await settingsService.getSetting('translation.maxRowsPerJob')) || '500', 10) || 500;

    // Create the target table as a structural copy of the source.
    // Both identifiers are validated (regex + whitelist) before we reach here.
    await lsembPool.query(`CREATE TABLE IF NOT EXISTS "${job.targetTable}" (LIKE "${job.table}" INCLUDING DEFAULTS)`);

    const availableRes = await lsembPool.query(`SELECT COUNT(*)::int AS c FROM "${job.table}"`);
    const available = availableRes.rows[0].c as number;
    const total = Math.min(available, maxRows);
    job.totalRows = total;
    if (available > maxRows) {
      job.errors.push(`Source has ${available} rows; limited to ${maxRows} (translation.maxRowsPerJob).`);
    }
    await saveJob(job);

    const pk = await getPrimaryKey(job.table);
    const orderBy = pk.length ? pk.map((c) => `"${c}"`).join(', ') : '1';
    const allCols = await getTableColumns(job.table);

    const rowsRes = await lsembPool.query(`SELECT * FROM "${job.table}" ORDER BY ${orderBy} LIMIT ${maxRows}`);

    const insertCols = allCols.map((c) => `"${c}"`).join(', ');
    const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO "${job.targetTable}" (${insertCols}) VALUES (${placeholders})`;

    let processed = 0;
    let costAccum = 0;
    for (const row of rowsRes.rows) {
      if (await isCancelled(id)) {
        job.status = 'cancelled';
        job.completedAt = new Date().toISOString();
        await saveJob(job);
        return;
      }

      const newRow: Record<string, any> = { ...row };
      for (const col of job.columns) {
        const val = row[col];
        if (typeof val === 'string' && val.trim()) {
          try {
            const { translatedText, cost } = await translateText(val, {
              sourceLang: job.sourceLang,
              targetLang: job.targetLang,
              provider: job.provider,
            });
            newRow[col] = translatedText;
            costAccum += cost || 0;
          } catch (e: any) {
            job.errors.push(`Row ${processed + 1}, column "${col}": ${e.message || e}`);
          }
        }
      }

      try {
        const values = allCols.map((c) => newRow[c]);
        await lsembPool.query(insertSql, values);
      } catch (e: any) {
        // One bad row (e.g. a column type that doesn't round-trip) must not abort the whole job.
        job.errors.push(`Row ${processed + 1}: insert failed: ${e.message || e}`);
      }

      processed++;
      if (processed % PROGRESS_EVERY === 0 || processed === total) {
        job.processedRows = processed;
        job.progress = total ? Math.round((processed / total) * 100) : 100;
        job.cost = costAccum;
        await saveJob(job);
      }
    }

    job.processedRows = processed;
    job.progress = 100;
    job.cost = costAccum;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    await saveJob(job);
  } catch (e: any) {
    console.error('[translation] job error:', e);
    const j = (await getJob(id)) || job;
    j.status = 'error';
    j.errors.push(e.message || 'Unknown error');
    j.completedAt = new Date().toISOString();
    await saveJob(j);
  }
}

export const translationService = {
  translateText,
  listProviders,
  listTables,
  previewTable,
  startJob,
  getJob,
  getJobs,
  cancelJob,
  getStats,
};

export default translationService;
