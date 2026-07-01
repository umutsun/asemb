'use client';

/**
 * Knowledge Graph — interactive, full-page force-directed view of the citation /
 * reference network between sources (node -> node), built from chunk_relationships
 * over unified_embeddings. Domain-agnostic: nodes are whatever sources are ingested
 * (laws, docs, web pages, …), grouped/colored by source group. Data: GET
 * /api/v2/dashboard/graph. Uses react-force-graph-2d + d3-force clustering.
 *
 * UX: hover shows a rich tooltip and highlights a node + its neighbours (dimming the
 * rest); nodes are pulled into per-group clusters so the network is readable instead
 * of a hairball; hub (high-degree) nodes keep their labels on at all zoom levels.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { forceX, forceY, forceCollide } from 'd3-force';
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

const humanizeGroup = (g: string) =>
  (g || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const escapeHtml = (s: string) =>
  String(s).replace(/[&<>"]/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string));

const linkEnd = (v: any) => (v && typeof v === 'object' ? v.id : v);

type GraphData = { nodes: any[]; links: any[]; node_count: number; edge_count: number };

export default function KnowledgeGraphPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
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
    return Array.from(s).sort();
  }, [data]);

  // Adjacency (for neighbour highlighting) + hub set (top-degree nodes get
  // permanent labels so the main clusters are readable without zooming).
  const { adjacency, hubIds } = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    const deg = new Map<string, number>();
    (data?.links || []).forEach((l: any) => {
      const s = linkEnd(l.source), t2 = linkEnd(l.target);
      if (s == null || t2 == null) return;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t2)) adj.set(t2, new Set());
      adj.get(s)!.add(t2); adj.get(t2)!.add(s);
      deg.set(s, (deg.get(s) || 0) + 1);
      deg.set(t2, (deg.get(t2) || 0) + 1);
    });
    const hubIds = new Set(
      [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0])
    );
    return { adjacency: adj, hubIds };
  }, [data]);

  // Set of the hovered node + its direct neighbours (null when nothing hovered).
  const neighbors = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    adjacency.get(hoverId)?.forEach(n => set.add(n));
    return set;
  }, [hoverId, adjacency]);

  // Cluster nodes by group: pull each group toward its own centroid on a ring
  // around the origin, and keep nodes from overlapping. This turns the hairball
  // into readable, color-coded clusters.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !data || groups.length === 0) return;
    const R = Math.min(dims.w, dims.h) * 0.32;
    const gi = new Map(groups.map((g, i) => [g, i]));
    const cx = (g: string) => (groups.length <= 1 ? 0 : Math.cos((2 * Math.PI * (gi.get(g) ?? 0)) / groups.length) * R);
    const cy = (g: string) => (groups.length <= 1 ? 0 : Math.sin((2 * Math.PI * (gi.get(g) ?? 0)) / groups.length) * R);
    try {
      fg.d3Force('x', forceX((n: any) => cx(n.group)).strength(0.14));
      fg.d3Force('y', forceY((n: any) => cy(n.group)).strength(0.14));
      fg.d3Force('collide', forceCollide((n: any) => 2 + (n.val || 1) + 1.5));
      const charge = fg.d3Force('charge');
      if (charge) charge.strength(-45);
      fg.d3ReheatSimulation?.();
    } catch { /* forces are best-effort */ }
  }, [data, groups, dims]);

  const highlight = query.trim().toLowerCase();

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, scale: number) => {
    const r = 2 + (node.val || 1);
    const isHit = highlight && String(node.id).toLowerCase().includes(highlight);
    const dimmed = (!!neighbors && !neighbors.has(node.id)) || (!!highlight && !isHit);

    ctx.globalAlpha = dimmed ? 0.12 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = colorFor(node.group);
    ctx.fill();

    if (!dimmed && (isHit || node.id === hoverId || (selected && selected.id === node.id))) {
      ctx.strokeStyle = '#f9fafb';
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
    }

    // Labels: hubs always; hovered node + its neighbours; search hits; or when
    // zoomed in. Dimmed nodes never draw labels (keeps it uncluttered).
    const showLabel =
      !dimmed &&
      (hubIds.has(node.id) || node.id === hoverId || isHit || scale > 2.2 || (!!neighbors && neighbors.has(node.id)));
    if (showLabel) {
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(3.5, 11 / scale)}px sans-serif`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(String(node.label || node.id).slice(0, 34), node.x + r + 2, node.y + 3);
    }
    ctx.globalAlpha = 1;
  }, [highlight, neighbors, hoverId, hubIds, selected]);

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="h-6 w-6 text-purple-600" />
            {t('graph.title', { defaultValue: 'Knowledge Graph' })}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('graph.subtitle', { defaultValue: 'How your sources reference each other. Hover a node to see its connections; drag to explore.' })}
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
              {humanizeGroup(g)}
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
              nodeLabel={(n: any) => {
                const conn = adjacency.get(n.id)?.size || 0;
                return `<div style="padding:8px 10px;background:rgba(15,23,42,0.97);border:1px solid rgba(148,163,184,0.25);border-radius:8px;color:#e2e8f0;font-size:12px;max-width:320px;box-shadow:0 6px 18px rgba(0,0,0,0.45)">
                  <div style="font-weight:600;margin-bottom:4px;line-height:1.35">${escapeHtml(n.id)}</div>
                  <div style="opacity:0.75;font-size:11px">${escapeHtml(humanizeGroup(n.group))} · ${conn} ${conn === 1 ? 'connection' : 'connections'} · referenced ${n.refs}×</div>
                </div>`;
              }}
              nodeCanvasObject={paintNode as any}
              onNodeHover={(n: any) => {
                setHoverId(n ? n.id : null);
                if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'default';
              }}
              linkColor={(l: any) => {
                if (!hoverId) return 'rgba(120,120,140,0.16)';
                const s = linkEnd(l.source), t2 = linkEnd(l.target);
                return (s === hoverId || t2 === hoverId) ? 'rgba(96,165,250,0.75)' : 'rgba(120,120,140,0.04)';
              }}
              linkWidth={(l: any) => {
                const base = Math.min(3, Math.max(0.4, Math.log2((l.weight || 1) + 1)));
                if (!hoverId) return base;
                const s = linkEnd(l.source), t2 = linkEnd(l.target);
                return (s === hoverId || t2 === hoverId) ? base + 1 : base;
              }}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(n: any) => { setSelected(n); fgRef.current?.centerAt(n.x, n.y, 600); fgRef.current?.zoom(4, 600); }}
              onBackgroundClick={() => setSelected(null)}
              cooldownTicks={140}
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
                  {humanizeGroup(selected.group)}
                </span>
                <span>· {adjacency.get(selected.id)?.size || 0} {t('graph.connections', { defaultValue: 'connections' })}</span>
                <span>· {t('graph.citedTimes', { defaultValue: 'referenced' })} {selected.refs}×</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
