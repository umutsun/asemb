'use client';

/**
 * Knowledge Graph — interactive, full-page force-directed view of the citation /
 * reference network between sources (node -> node), built from chunk_relationships
 * over unified_embeddings. Domain-agnostic: nodes are whatever sources are ingested
 * (laws, docs, web pages, …), colored by source group. Data: GET /api/v2/dashboard/graph.
 * Uses react-force-graph-2d.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { RefreshCw, Share2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchWithAuth } from '@/lib/auth-fetch';
import config from '@/config/api.config';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-[70vh]"><Spinner size="lg" /></div>,
});

// Well-known source groups get a stable color; anything else falls back to a
// deterministic palette pick (keeps the graph domain-agnostic — no hardcoded set).
const GROUP_COLORS: Record<string, string> = {
  uae_legislation: '#10b981',      // emerald — federal/emirate laws
  uae_gov_services: '#3b82f6',     // blue — gov service pages
  document_embeddings: '#a855f7',  // purple — uploaded docs
  other: '#f59e0b',
};
const PALETTE = ['#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#14b8a6', '#6366f1'];
const colorFor = (g: string) => {
  if (GROUP_COLORS[g]) return GROUP_COLORS[g];
  let h = 0;
  for (let i = 0; i < (g || '').length; i++) h = (h * 31 + g.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

type GraphData = { nodes: any[]; links: any[]; node_count: number; edge_count: number };

export default function KnowledgeGraphPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph?limit=600`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // size the canvas to its container
  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) {
        setDims({ w: wrapRef.current.clientWidth, h: Math.max(480, window.innerHeight - 260) });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [data]);

  const groups = useMemo(() => {
    const s = new Set<string>();
    data?.nodes?.forEach((n) => s.add(n.group));
    return Array.from(s);
  }, [data]);

  const highlight = query.trim().toLowerCase();

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, scale: number) => {
    const r = 2 + (node.val || 1);
    const isHit = highlight && String(node.id).toLowerCase().includes(highlight);
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = colorFor(node.group);
    ctx.globalAlpha = highlight && !isHit ? 0.15 : 1;
    ctx.fill();
    if (isHit || (selected && selected.id === node.id)) {
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.5 / scale; ctx.stroke();
    }
    // label only when zoomed in enough or highlighted
    if (scale > 2.2 || isHit) {
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(3, 10 / scale)}px sans-serif`;
      ctx.fillStyle = '#374151';
      ctx.fillText(String(node.label || node.id).slice(0, 40), node.x + r + 1, node.y + 2);
    }
    ctx.globalAlpha = 1;
  }, [highlight, selected]);

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="h-6 w-6 text-purple-600" />
            {t('graph.title', { defaultValue: 'Knowledge Graph' })}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('graph.subtitle', { defaultValue: 'How your sources reference each other, extracted from the corpus.' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('graph.search', { defaultValue: 'Highlight a source…' })}
              className="ps-8 w-56"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 me-2 ${loading ? 'animate-spin' : ''}`} />
            {t('graph.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <Badge variant="secondary">{data.node_count} {t('graph.nodes', { defaultValue: 'sources' })}</Badge>
          <Badge variant="secondary">{data.edge_count} {t('graph.references', { defaultValue: 'relationships' })}</Badge>
          {groups.map((g) => (
            <span key={g} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(g) }} />
              {g}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0 relative" ref={wrapRef as any}>
          {loading ? (
            <div className="flex items-center justify-center h-[70vh]"><Spinner size="lg" /></div>
          ) : err ? (
            <div className="flex items-center justify-center h-[70vh] text-sm text-gray-500">
              {t('graph.error', { defaultValue: 'Could not load the graph.' })} ({err})
            </div>
          ) : data && data.nodes.length > 0 ? (
            <ForceGraph2D
              ref={fgRef}
              graphData={{ nodes: data.nodes, links: data.links }}
              width={dims.w}
              height={dims.h}
              nodeId="id"
              nodeVal={(n: any) => n.val}
              nodeLabel={(n: any) => `${n.id}  ·  referenced ${n.refs}×`}
              nodeCanvasObject={paintNode as any}
              linkColor={() => 'rgba(120,120,140,0.25)'}
              linkWidth={(l: any) => Math.min(4, Math.max(0.5, Math.log2((l.weight || 1) + 1)))}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(n: any) => { setSelected(n); fgRef.current?.centerAt(n.x, n.y, 600); fgRef.current?.zoom(4, 600); }}
              cooldownTicks={120}
            />
          ) : (
            <div className="flex items-center justify-center h-[70vh] text-sm text-gray-500">
              {t('graph.empty', { defaultValue: 'No relationships extracted yet.' })}
            </div>
          )}

          {selected && (
            <div className="absolute bottom-3 start-3 max-w-md rounded-lg border bg-background/95 backdrop-blur p-3 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{selected.id}</span>
                <button className="text-gray-400 hover:text-gray-600 text-xs" onClick={() => setSelected(null)}>✕</button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorFor(selected.group) }} />
                  {selected.group}
                </span>
                <span>· {t('graph.citedTimes', { defaultValue: 'referenced' })} {selected.refs}×</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
