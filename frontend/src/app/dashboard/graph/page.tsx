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
import { RefreshCw, Search } from 'lucide-react';
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
  // Label bounding boxes drawn this frame (reset each frame) — used to hide labels that would
  // overlap one already drawn, so the graph never turns into a pile of unreadable text.
  const labelRectsRef = useRef<number[][]>([]);
  // Track the active (light/dark) theme so canvas labels stay readable in both.
  const isDarkRef = useRef(false);
  useEffect(() => {
    const sync = () => { isDarkRef.current = document.documentElement.classList.contains('dark'); };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

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
    const R = Math.min(dims.w, dims.h) * 0.42;
    const gi = new Map(groups.map((g, i) => [g, i]));
    const cx = (g: string) => (groups.length <= 1 ? 0 : Math.cos((2 * Math.PI * (gi.get(g) ?? 0)) / groups.length) * R);
    const cy = (g: string) => (groups.length <= 1 ? 0 : Math.sin((2 * Math.PI * (gi.get(g) ?? 0)) / groups.length) * R);
    try {
      // Gentle group centering + strong repulsion + link distance so connected communities
      // pull apart into visible clusters instead of collapsing into one central hairball.
      fg.d3Force('x', forceX((n: any) => cx(n.group)).strength(0.05));
      fg.d3Force('y', forceY((n: any) => cy(n.group)).strength(0.05));
      fg.d3Force('collide', forceCollide((n: any) => 14 + (n.val || 1) * 2));
      const charge = fg.d3Force('charge');
      if (charge) charge.strength(-320);
      const link = fg.d3Force('link');
      if (link && typeof link.distance === 'function') link.distance(70);
      fg.d3ReheatSimulation?.();
    } catch { /* forces are best-effort */ }
  }, [data, groups, dims]);

  const highlight = query.trim().toLowerCase();

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, scale: number) => {
    const dark = isDarkRef.current;
    const r = 2 + (node.val || 1);
    const isHit = highlight && String(node.id).toLowerCase().includes(highlight);
    const dimmed = (!!neighbors && !neighbors.has(node.id)) || (!!highlight && !isHit);
    const focused = node.id === hoverId || (selected && selected.id === node.id);

    ctx.globalAlpha = dimmed ? 0.12 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = colorFor(node.group);
    ctx.fill();

    if (!dimmed && (isHit || focused)) {
      ctx.strokeStyle = dark ? '#f9fafb' : '#0f172a';
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
    }

    // Labels are landmarks only: top hubs, the hovered/selected node, and search hits — NOT
    // "every node when zoomed" (that piled overlapping text). A per-frame collision test then
    // hides any label that would overlap one already drawn (the focused node always wins).
    if (dimmed || !(hubIds.has(node.id) || focused || isHit)) { ctx.globalAlpha = 1; return; }

    const label = String(node.label || node.id).slice(0, 32);
    const fontSize = Math.max(5, 11 / scale);
    ctx.font = `${fontSize}px Inter, sans-serif`;
    const padX = 4 / scale, padY = 2.5 / scale;
    const lx = node.x + r + 4 / scale;
    const ly = node.y;
    const tw = ctx.measureText(label).width;
    const rect = [lx - padX, ly - fontSize / 2 - padY, tw + padX * 2, fontSize + padY * 2];
    const hits = (a: number[], b: number[]) =>
      a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
    if (!focused && labelRectsRef.current.some((rc) => hits(rect, rc))) { ctx.globalAlpha = 1; return; }
    labelRectsRef.current.push(rect);

    // Theme-aware rounded chip behind the text so it is readable on any background.
    const [bx, by, bw, bh] = rect;
    const rr = 3 / scale;
    ctx.globalAlpha = focused ? 0.98 : 0.85;
    ctx.fillStyle = dark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(bx + rr, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, rr);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, rr);
    ctx.arcTo(bx, by + bh, bx, by, rr);
    ctx.arcTo(bx, by, bx + bw, by, rr);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);
    ctx.globalAlpha = 1;
  }, [highlight, neighbors, hoverId, hubIds, selected]);

  // Memoize graph data + accessors. Passing a fresh { nodes, links } object (or new
  // accessor functions) on every render makes react-force-graph re-ingest the data and
  // re-run the whole simulation — which, combined with hover setting state, caused the
  // graph to "constantly refresh". Stable references => hover only repaints the canvas.
  const graphData = useMemo(() => ({ nodes: data?.nodes ?? [], links: data?.links ?? [] }), [data]);

  const nodeVal = useCallback((n: any) => n.val, []);

  const nodeLabel = useCallback((n: any) => {
    const conn = adjacency.get(n.id)?.size || 0;
    return `<div style="padding:8px 10px;background:rgba(15,23,42,0.97);border:1px solid rgba(148,163,184,0.25);border-radius:8px;color:#e2e8f0;font-size:12px;max-width:320px;box-shadow:0 6px 18px rgba(0,0,0,0.45)">
      <div style="font-weight:600;margin-bottom:4px;line-height:1.35">${escapeHtml(n.id)}</div>
      <div style="opacity:0.75;font-size:11px">${escapeHtml(humanizeGroup(n.group))} · ${conn} ${conn === 1 ? 'connection' : 'connections'} · referenced ${n.refs}×</div>
    </div>`;
  }, [adjacency]);

  const linkColor = useCallback((l: any) => {
    if (!hoverId) return 'rgba(120,120,140,0.16)';
    const s = linkEnd(l.source), t2 = linkEnd(l.target);
    return (s === hoverId || t2 === hoverId) ? 'rgba(96,165,250,0.75)' : 'rgba(120,120,140,0.04)';
  }, [hoverId]);

  const linkWidth = useCallback((l: any) => {
    const base = Math.min(3, Math.max(0.4, Math.log2((l.weight || 1) + 1)));
    if (!hoverId) return base;
    const s = linkEnd(l.source), t2 = linkEnd(l.target);
    return (s === hoverId || t2 === hoverId) ? base + 1 : base;
  }, [hoverId]);

  const handleNodeHover = useCallback((n: any) => {
    setHoverId(n ? n.id : null);
    if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'default';
  }, []);

  const handleNodeClick = useCallback((n: any) => {
    setSelected(n);
    fgRef.current?.centerAt(n.x, n.y, 600);
    fgRef.current?.zoom(4, 600);
  }, []);

  const handleBackgroundClick = useCallback(() => setSelected(null), []);

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
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
              graphData={graphData}
              width={dims.w}
              height={dims.h}
              nodeId="id"
              nodeVal={nodeVal}
              nodeLabel={nodeLabel}
              nodeCanvasObject={paintNode as any}
              onNodeHover={handleNodeHover}
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              onRenderFramePre={() => { labelRectsRef.current = []; }}
              onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
              cooldownTicks={160}
              warmupTicks={80}
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
