'use client';

/**
 * WS-D: Consolidated Data / Knowledge-Base Overview.
 *
 * One page that shows the whole embedding pipeline in one place, reading the REAL
 * corpus from unified_embeddings (via existing endpoints) instead of the legacy
 * external-source-DB model that left Migrations/Crawled-Data looking empty.
 *
 * Reuses existing endpoints (no new backend surface for this page); each section
 * loads independently (Promise.allSettled) so one slow/down source never blanks the
 * rest. Numbers shown are real or "—" when a source is unavailable — never faked
 * (CLAUDE.md Hard Rule #2).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { fetchWithAuth } from '@/lib/auth-fetch';
import config from '@/config/api.config';
import {
  RefreshCw,
  Database,
  FileText,
  Globe,
  Share2,
  Activity,
  HeartPulse,
  Layers,
} from 'lucide-react';

const base = config.api.baseUrl;

type Loaded<T> = { data: T | null; ok: boolean };

async function getJson(url: string): Promise<Loaded<any>> {
  try {
    const res = await fetchWithAuth(url);
    if (!res.ok) return { data: null, ok: false };
    return { data: await res.json(), ok: true };
  } catch {
    return { data: null, ok: false };
  }
}

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt = (v: any): string => num(v).toLocaleString();

/** Pull the first finite number found at any of the given dotted paths. */
function pick(obj: any, paths: string[]): number | null {
  for (const p of paths) {
    let cur = obj;
    for (const part of p.split('.')) cur = cur?.[part];
    if (cur !== undefined && cur !== null && Number.isFinite(Number(cur))) return Number(cur);
  }
  return null;
}

export default function DataOverviewPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [corpus, setCorpus] = useState<Loaded<any>>({ data: null, ok: false });
  const [docs, setDocs] = useState<Loaded<any>>({ data: null, ok: false });
  const [crawl, setCrawl] = useState<Loaded<any>>({ data: null, ok: false });
  const [scrapers, setScrapers] = useState<Loaded<any>>({ data: null, ok: false });
  const [kg, setKg] = useState<Loaded<any>>({ data: null, ok: false });
  const [progress, setProgress] = useState<Loaded<any>>({ data: null, ok: false });
  const [health, setHealth] = useState<Loaded<any>>({ data: null, ok: false });

  const load = useCallback(async () => {
    const [c, d, cr, sc, k, pr, h] = await Promise.all([
      getJson(`${base}/api/v2/embeddings/stats`),
      getJson(`${base}/api/v2/documents/stats`),
      getJson(`${base}/api/v2/crawler/crawler-directories`),
      getJson(`${base}/api/v2/scraped-embeddings/scrapers`),
      getJson(`${base}/api/v2/relationships/stats`),
      getJson(`${base}/api/v2/embeddings/progress`),
      getJson(`${base}/api/data-health/report`),
    ]);
    setCorpus(c); setDocs(d); setCrawl(cr); setScrapers(sc); setKg(k); setProgress(pr); setHealth(h);
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  // ── Corpus (unified_embeddings) ─────────────────────────────────────────────
  const bySource: any[] = Array.isArray(corpus.data?.by_source) ? corpus.data.by_source : [];
  const totalChunks = num(corpus.data?.totalEmbeddings ?? corpus.data?.total_embeddings);
  const totalDocs = bySource.reduce((s, r) => s + num(r.record_count), 0);
  const dims: any[] = Array.isArray(corpus.data?.dimensions) ? corpus.data.dimensions : [];
  const maxChunks = Math.max(1, ...bySource.map((r) => num(r.embedding_count)));

  // ── Documents ───────────────────────────────────────────────────────────────
  const dStat = docs.data?.documents || {};

  // ── Crawl / scrape ──────────────────────────────────────────────────────────
  const crawlList: any[] = Array.isArray(crawl.data)
    ? crawl.data
    : Array.isArray(crawl.data?.directories)
      ? crawl.data.directories
      : Array.isArray(crawl.data?.crawlers)
        ? crawl.data.crawlers
        : [];
  const scraperList: any[] = Array.isArray(scrapers.data)
    ? scrapers.data
    : Array.isArray(scrapers.data?.scrapers)
      ? scrapers.data.scrapers
      : [];
  const scrapedEmbedded = scraperList.reduce(
    (s, x) => s + num(x?.stats?.embedded ?? x?.embedded ?? x?.total_entries ?? x?.total),
    0,
  );

  // ── Knowledge graph (Python proxy — defensive) ──────────────────────────────
  const kgEntities = pick(kg.data, ['entities', 'total_entities', 'stats.entities', 'data.entities', 'entity_count', 'nodes']);
  const kgRels = pick(kg.data, ['relationships', 'total_relationships', 'stats.relationships', 'data.relationships', 'relationship_count', 'edges']);

  // ── Live embedding job ──────────────────────────────────────────────────────
  const jobStatus = String(progress.data?.status || 'idle');
  const jobActive = ['processing', 'running', 'paused'].includes(jobStatus);
  const jobPct = num(progress.data?.percentage);

  // ── Data health (Python proxy — defensive) ──────────────────────────────────
  const metaMissing = pick(health.data, ['metadata_missing', 'metadataMissing', 'missing_metadata', 'report.metadata_missing', 'summary.metadata_missing']);
  const duplicates = pick(health.data, ['duplicates', 'duplicate', 'duplicate_count', 'report.duplicates', 'summary.duplicates']);

  const dash = '—';

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-emerald-600" />
            {t('overview.title', { defaultValue: 'Data Overview' })}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('overview.subtitle', {
              defaultValue: 'Everything in your knowledge base — the live embedding pipeline at a glance.',
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 me-2 ${refreshing ? 'animate-spin' : ''}`} />
          {t('overview.refresh', { defaultValue: 'Refresh' })}
        </Button>
      </div>

      {/* Hero corpus metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('overview.totalChunks', { defaultValue: 'Embedded chunks' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{corpus.ok ? fmt(totalChunks) : dash}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('overview.totalDocuments', { defaultValue: 'Documents' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{corpus.ok ? fmt(totalDocs) : dash}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('overview.sourceTables', { defaultValue: 'Source tables' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{corpus.ok ? fmt(bySource.length) : dash}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('overview.embeddingModel', { defaultValue: 'Embedding model' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {dims.length > 0 ? `${dims[0].provider} · ${dims[0].dimension}d` : dash}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Corpus by source table — the real embedding state */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-emerald-600" />
            {t('overview.corpusBySource', { defaultValue: 'Corpus by source' })}
          </CardTitle>
          <CardDescription>
            {t('overview.corpusBySourceHelp', {
              defaultValue: 'Embedded content in unified_embeddings, grouped by source table.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!corpus.ok ? (
            <p className="text-sm text-gray-500">{t('overview.unavailable', { defaultValue: 'Unavailable' })}</p>
          ) : bySource.length === 0 ? (
            <p className="text-sm text-gray-500">{t('overview.noCorpus', { defaultValue: 'No embedded content yet.' })}</p>
          ) : (
            <div className="space-y-3">
              {bySource.map((r) => {
                const chunks = num(r.embedding_count);
                return (
                  <div key={`${r.source_table}-${r.dimension}`} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{r.name || r.source_table}</span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {fmt(chunks)} {t('overview.chunks', { defaultValue: 'chunks' })}
                        {' · '}
                        {fmt(r.record_count)} {t('overview.docs', { defaultValue: 'docs' })}
                        {r.dimension ? ` · ${r.dimension}d` : ''}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(2, Math.round((chunks / maxChunks) * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Secondary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-600" />
              {t('overview.documents', { defaultValue: 'Documents' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!docs.ok ? (
              <p className="text-sm text-gray-500">{t('overview.unavailable', { defaultValue: 'Unavailable' })}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label={t('overview.total', { defaultValue: 'Total' })} value={fmt(dStat.total)} />
                <Stat label={t('overview.embedded', { defaultValue: 'Embedded' })} value={fmt(dStat.embedded)} />
                <Stat label={t('overview.pending', { defaultValue: 'Pending' })} value={fmt(dStat.pending)} />
                <Stat label={t('overview.failed', { defaultValue: 'Failed' })} value={fmt(dStat.failed)} tone={num(dStat.failed) > 0 ? 'warn' : undefined} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Crawled & scraped */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-cyan-600" />
              {t('overview.crawledScraped', { defaultValue: 'Crawled & scraped' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label={t('overview.crawlerDirs', { defaultValue: 'Crawler sets' })} value={crawl.ok ? fmt(crawlList.length) : dash} />
              <Stat label={t('overview.scrapers', { defaultValue: 'Scrapers' })} value={scrapers.ok ? fmt(scraperList.length) : dash} />
              <Stat label={t('overview.scrapedEmbedded', { defaultValue: 'Scraped embeddings' })} value={scrapers.ok ? fmt(scrapedEmbedded) : dash} />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {t('overview.crawlNote', {
                defaultValue: 'Note: directly-ingested web content (e.g. u.ae) is counted under Corpus, not here.',
              })}
            </p>
          </CardContent>
        </Card>

        {/* Knowledge graph */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-purple-600" />
              {t('overview.knowledgeGraph', { defaultValue: 'Knowledge graph' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!kg.ok ? (
              <p className="text-sm text-gray-500">{t('overview.unavailable', { defaultValue: 'Unavailable' })}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label={t('overview.entities', { defaultValue: 'Entities' })} value={kgEntities === null ? dash : fmt(kgEntities)} />
                <Stat label={t('overview.relationships', { defaultValue: 'Relationships' })} value={kgRels === null ? dash : fmt(kgRels)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live embedding + data health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-amber-600" />
              {t('overview.pipelineStatus', { defaultValue: 'Pipeline status' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{t('overview.embeddingJob', { defaultValue: 'Embedding job' })}</span>
              {jobActive ? (
                <Badge>{jobStatus} · {jobPct}%</Badge>
              ) : (
                <Badge variant="secondary">{t('overview.idle', { defaultValue: 'Idle' })}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <HeartPulse className="h-4 w-4 text-rose-500" />
              <span className="text-gray-500 dark:text-gray-400">{t('overview.dataHealth', { defaultValue: 'Data health' })}:</span>
              {health.ok ? (
                <span>
                  {metaMissing === null ? dash : fmt(metaMissing)} {t('overview.metaMissing', { defaultValue: 'missing metadata' })}
                  {' · '}
                  {duplicates === null ? dash : fmt(duplicates)} {t('overview.duplicates', { defaultValue: 'duplicates' })}
                </span>
              ) : (
                <span className="text-gray-500">{t('overview.unavailable', { defaultValue: 'Unavailable' })}</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div>
      <div className={`text-xl font-semibold ${tone === 'warn' ? 'text-amber-600' : ''}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
