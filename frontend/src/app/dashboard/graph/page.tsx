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
import { RefreshCw, Search, Sparkles, Link2, Check, X, AlertTriangle, Loader2, Ban, Wand2, Zap, Brain, StopCircle, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fetchWithAuth } from '@/lib/auth-fetch';
import config from '@/config/api.config';
import { useToast } from '@/hooks/use-toast';

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
// Distinct hues for detected communities/clusters (cycled).
const COMMUNITY_COLORS = ['#10b981', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6', '#6366f1', '#f97316', '#eab308'];
const communityColor = (cid: number) => COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length];
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

type UnresolvedRef = {
  ref_key: string;
  target_law_code: string | null;
  target_article_number: string | null;
  target_reference: string | null;
  mentions: number;
  citing_sources: number;
  example_source: string;
};
type WeakLink = {
  id: number;
  source: string;
  target: string;
  relationship_type: string;
  confidence: number;
  extracted_by: string;
};
type Orphan = { source_name: string; source_table: string; chunks: number };
type GapsData = {
  summary: { total: number; resolved: number; unresolved: number; weak: number; completeness: number; confidenceThreshold: number };
  unresolvedRefs: UnresolvedRef[];
  weakLinks: WeakLink[];
  orphans: Orphan[];
  orphansCapped: boolean;
  limit: number;
};

// System-wide extraction coverage (from /api/v2/relationships/stats).
type RelStats = {
  total_chunks: number;
  chunks_with_entities: number;
  total_relationships: number;
  unresolved_references: number;
  extraction_coverage_pct: number;
  active_jobs: number;
};
// One "scan for connections" (extract-batch) job + its live progress.
type ScanProgress = {
  status: string; // pending | running | completed | failed | cancelled
  total_chunks?: number;
  processed_chunks?: number;
  relationships_found?: number;
  eta_seconds?: number | null;
  error_message?: string | null;
};
type ScanJob = { jobId: string; label: string; progress: ScanProgress | null };
// Gaps for a single clicked source (browse + act on that node).
type NodeGaps = {
  source: string;
  source_table: string | null;
  isOrphan: boolean;
  outgoingEdges: number;
  incomingEdges: number;
  danglingRefs: Array<{ ref_key: string; target_law_code: string | null; target_article_number: string | null; target_reference: string | null; mentions: number }>;
  weakLinks: WeakLink[];
};
// Content behind a single clicked source (the "source inspector"): chunk count, origin URL,
// a first-chunk snippet and the top extracted entities grouped by type.
type NodeInfo = {
  source: string;
  chunks: number;
  source_table: string | null;
  source_type: string | null;
  url: string | null;
  snippet: string | null;
  entities: Record<string, Array<{ value: string; n: number }>>;
};

// Relationship types mirror the chunk_relationships CHECK constraint (kept in sync with the backend).
const RELATIONSHIP_TYPES = ['references', 'amends', 'parent_of', 'related_to', 'supersedes', 'interprets'];
// Plain-language labels for non-technical users — the enum values stay as the API contract, but the
// UI shows everyday wording (a user shouldn't need to know what "supersedes" means in graph terms).
const REL_TYPE_LABELS: Record<string, string> = {
  references: 'refers to',
  amends: 'changes',
  supersedes: 'replaces',
  interprets: 'explains',
  parent_of: 'contains',
  related_to: 'is related to',
};
const relTypeLabel = (t: string) => REL_TYPE_LABELS[t] || t;

export default function KnowledgeGraphPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Language filter for mixed (Arabic + English) corpora — the backend splits the graph by
  // Arabic-script presence so each language can be explored as its own network. 'all' = combined.
  const [lang, setLang] = useState<'all' | 'en' | 'ar'>('all');
  const { toast } = useToast();

  // Corpus-health "gaps" (dangling refs, weak links, orphans) that users resolve to strengthen
  // the graph. Loaded alongside the graph and re-loaded after each action.
  const [gaps, setGaps] = useState<GapsData | null>(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showGhosts, setShowGhosts] = useState(false);
  // Keys of in-flight actions, so individual buttons show a spinner without freezing the panel.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  // Inline "link to existing source" picker state (which dangling ref is being linked + search).
  const [linkingRef, setLinkingRef] = useState<string | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<Orphan[]>([]);
  // Live extraction coverage + the "use graph in answers" (graphRetrievalEnabled) setting.
  const [stats, setStats] = useState<RelStats | null>(null);
  const [graphInAnswers, setGraphInAnswers] = useState<boolean | null>(null);
  const [graphAnswersBusy, setGraphAnswersBusy] = useState(false);
  // The single in-flight "scan for connections" job (extract-batch), corpus-wide or per source.
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [scanConfirm, setScanConfirm] = useState(false);
  // Gaps for the node the user clicked (browse + act on a specific source).
  const [nodeGaps, setNodeGaps] = useState<NodeGaps | null>(null);
  const [nodeGapsLoading, setNodeGapsLoading] = useState(false);
  // Content preview for the node the user clicked (chunks, entities, snippet, origin URL).
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);

  const withBusy = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy((prev) => new Set(prev).add(key));
    try { await fn(); } finally {
      setBusy((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, []);
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
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph?limit=600&lang=${lang}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  // Corpus-health gaps, filtered by the same language as the graph.
  const loadGaps = useCallback(async () => {
    setGapsLoading(true);
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph/gaps?lang=${lang}&limit=50`);
      if (res.ok) setGaps(await res.json());
    } catch { /* non-fatal — the quests panel is supplementary to the graph */ }
    finally { setGapsLoading(false); }
  }, [lang]);

  useEffect(() => { loadGaps(); }, [loadGaps]);

  // System-wide extraction stats (coverage %, relationship count, active jobs). Refreshed after scans.
  const loadStats = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/relationships/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* non-fatal — the stats strip is supplementary */ }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  // "Use graph in answers" mirrors the relationships.graphRetrievalEnabled setting, surfaced here in
  // plain language so a non-technical user can turn the payoff on right where they strengthen the graph.
  const loadGraphInAnswers = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/settings/key/relationships.graphRetrievalEnabled`);
      if (res.ok) { const d = await res.json(); setGraphInAnswers(d.value === true || d.value === 'true'); }
    } catch { /* non-fatal */ }
  }, []);
  useEffect(() => { loadGraphInAnswers(); }, [loadGraphInAnswers]);

  const toggleGraphInAnswers = useCallback(async (next: boolean) => {
    setGraphAnswersBusy(true);
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/settings/key/relationships.graphRetrievalEnabled`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next, category: 'relationships', description: 'Use the knowledge graph to improve RAG answers' }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      setGraphInAnswers(next);
      toast({ title: next ? 'Answers now use your knowledge graph' : 'Graph boost turned off' });
    } catch (e: any) {
      toast({ title: 'Could not change setting', description: e?.message, variant: 'destructive' });
    } finally { setGraphAnswersBusy(false); }
  }, [toast]);

  const searchSources = useCallback(async (q: string) => {
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph/sources?q=${encodeURIComponent(q)}`);
      if (res.ok) { const d = await res.json(); setSourceResults(d.sources || []); }
    } catch { /* ignore — picker is best-effort */ }
  }, []);

  // Open the inline "link to existing source" picker for a dangling reference, seeded with a
  // sensible search term (the cited law code / reference text).
  const openLinkPicker = useCallback((ref: UnresolvedRef) => {
    const seed = ref.target_law_code || ref.target_reference || '';
    setLinkingRef(ref.ref_key);
    setSourceQuery(seed);
    searchSources(seed);
  }, [searchSources]);

  // Resolve a dangling reference: link it to an existing source, or mark it as external.
  const resolveRef = useCallback((ref: UnresolvedRef, action: 'link' | 'external', targetSourceName?: string) =>
    withBusy(`ref:${ref.ref_key}`, async () => {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph/references/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          targetLawCode: ref.target_law_code,
          targetReference: ref.target_reference,
          targetSourceName,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      toast({ title: action === 'link' ? 'Reference linked' : 'Marked as external', description: ref.ref_key });
      setLinkingRef(null); setSourceQuery(''); setSourceResults([]);
      await Promise.all([loadGaps(), load()]);
    }).catch((e: any) => toast({ title: 'Action failed', description: e?.message, variant: 'destructive' })),
    [withBusy, toast, loadGaps, load]);

  // Verify a weak (machine-extracted) link: confirm, reject, or fix its relationship type.
  const verifyLink = useCallback((link: WeakLink, action: 'confirm' | 'reject' | 'retype', relationshipType?: string) =>
    withBusy(`link:${link.id}`, async () => {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph/relationships/${link.id}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, relationshipType }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      toast({ title: action === 'reject' ? 'Link removed' : 'Link verified', description: `${link.source} → ${link.target}` });
      await Promise.all([loadGaps(), load()]);
    }).catch((e: any) => toast({ title: 'Action failed', description: e?.message, variant: 'destructive' })),
    [withBusy, toast, loadGaps, load]);

  // Start a "scan for connections" (Python extract-batch) — corpus-wide (no arg) or for one source
  // table. Only one scan runs at a time; the effect below polls its progress.
  const startScan = useCallback(async (sourceTable?: string) => {
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/relationships/extract-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceTable ? { source_table: sourceTable } : {}),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const d = await res.json();
      setScanConfirm(false);
      if (d.job_id) {
        setScanJob({
          jobId: d.job_id,
          label: sourceTable || 'whole library',
          progress: { status: d.status || 'running', total_chunks: d.total_chunks || 0, processed_chunks: 0 },
        });
      } else {
        toast({ title: 'Nothing to scan', description: d.message || 'No new documents to analyze.' });
        loadStats();
      }
    } catch (e: any) {
      toast({ title: 'Scan failed', description: e?.message, variant: 'destructive' });
    }
  }, [toast, loadStats]);

  const cancelScan = useCallback(async () => {
    if (!scanJob?.jobId) return;
    try {
      await fetchWithAuth(`${config.api.baseUrl}/api/v2/relationships/extract-batch/cancel/${scanJob.jobId}`, { method: 'POST' });
      toast({ title: 'Stopping the scan…' });
    } catch (e: any) {
      toast({ title: 'Could not stop', description: e?.message, variant: 'destructive' });
    }
  }, [scanJob?.jobId, toast]);

  // Poll the running scan's progress; refresh graph + gaps + stats when it finishes, then clear.
  useEffect(() => {
    const jobId = scanJob?.jobId;
    if (!jobId) return;
    let active = true;
    const tick = async () => {
      try {
        const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/relationships/extract-batch/status/${jobId}`);
        if (!res.ok || !active) return;
        const p = await res.json();
        setScanJob((prev) => (prev && prev.jobId === jobId ? { ...prev, progress: p } : prev));
        if (['completed', 'failed', 'cancelled'].includes(p.status)) {
          active = false;
          clearInterval(iv);
          loadStats(); loadGaps(); load();
          setTimeout(() => setScanJob((prev) => (prev && prev.jobId === jobId ? null : prev)), 6000);
        }
      } catch { /* transient — keep polling */ }
    };
    const iv = setInterval(tick, 2000);
    tick();
    return () => { active = false; clearInterval(iv); };
  }, [scanJob?.jobId, loadStats, loadGaps, load]);

  const scanActive = !!scanJob && !['completed', 'failed', 'cancelled'].includes(scanJob.progress?.status || '');

  // Gaps for a single clicked source, so browsing the graph and acting on a node happen together.
  const loadNodeGaps = useCallback(async (source: string) => {
    setNodeGapsLoading(true); setNodeGaps(null);
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph/node-gaps?source=${encodeURIComponent(source)}`);
      if (res.ok) setNodeGaps(await res.json());
    } catch { /* non-fatal */ }
    finally { setNodeGapsLoading(false); }
  }, []);

  // Content preview for a single clicked source (the "source inspector"), loaded alongside the
  // node's gaps so the card shows what the source says, not just how it connects.
  const loadNodeInfo = useCallback(async (source: string) => {
    setNodeInfo(null);
    try {
      const res = await fetchWithAuth(`${config.api.baseUrl}/api/v2/dashboard/graph/node-info?source=${encodeURIComponent(source)}`);
      if (res.ok) setNodeInfo(await res.json());
    } catch { /* non-fatal — the inspector is supplementary to the graph */ }
  }, []);

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

  // Lightweight community detection (deterministic label propagation) so clusters are
  // visually distinct. Returns node.id -> community index, plus the community count.
  const { communities, communityCount } = useMemo(() => {
    const ids: string[] = (data?.nodes || []).map((n: any) => n.id);
    const label = new Map<string, string>();
    ids.forEach((id) => label.set(id, id));
    for (let iter = 0; iter < 10; iter++) {
      let changed = false;
      for (const id of ids) {
        const nbrs = adjacency.get(id);
        if (!nbrs || nbrs.size === 0) continue;
        const counts = new Map<string, number>();
        nbrs.forEach((nb) => counts.set(label.get(nb)!, (counts.get(label.get(nb)!) || 0) + 1));
        let best = label.get(id)!, bestC = -1;
        counts.forEach((c, l) => { if (c > bestC || (c === bestC && l < best)) { best = l; bestC = c; } });
        if (best !== label.get(id)) { label.set(id, best); changed = true; }
      }
      if (!changed) break;
    }
    // Map final labels to compact indices, ordered by community size (largest first).
    const size = new Map<string, number>();
    ids.forEach((id) => size.set(label.get(id)!, (size.get(label.get(id)!) || 0) + 1));
    const order = [...size.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    const idx = new Map(order.map((l, i) => [l, i]));
    const communities = new Map<string, number>();
    ids.forEach((id) => communities.set(id, idx.get(label.get(id)!)!));
    return { communities, communityCount: order.length };
  }, [data, adjacency]);

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

    // Ghost nodes for unresolved references: a dashed amber ring (not a filled node) marks a
    // cited-but-missing target the user can resolve. Labelled only on hover/search to avoid clutter.
    if (node.missing) {
      const dim = (!!neighbors && !neighbors.has(node.id)) || (!!highlight && !isHit);
      ctx.globalAlpha = dim ? 0.15 : 0.95;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 1, 0, 2 * Math.PI);
      ctx.setLineDash([2 / scale, 2 / scale]);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.3 / scale;
      ctx.stroke();
      ctx.setLineDash([]);
      if (!dim && (focused || isHit)) {
        const label = String(node.label || node.id).slice(0, 32);
        const fontSize = Math.max(5, 10 / scale);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = dark ? '#fbbf24' : '#b45309';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, node.x + r + 4 / scale, node.y);
      }
      ctx.globalAlpha = 1;
      return;
    }

    ctx.globalAlpha = dimmed ? 0.12 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
    // Colour by detected community so clusters are distinguishable; fall back to source-group
    // colour when the graph is effectively one community.
    const cid = communities.get(node.id);
    ctx.fillStyle = (communityCount > 1 && cid != null) ? communityColor(cid) : colorFor(node.group);
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
  }, [highlight, neighbors, hoverId, hubIds, selected, communities, communityCount]);

  // Memoize graph data + accessors. Passing a fresh { nodes, links } object (or new
  // accessor functions) on every render makes react-force-graph re-ingest the data and
  // re-run the whole simulation — which, combined with hover setting state, caused the
  // graph to "constantly refresh". Stable references => hover only repaints the canvas.
  const graphData = useMemo(() => {
    const nodes = data?.nodes ? [...data.nodes] : [];
    const links = data?.links ? [...data.links] : [];
    // Optionally surface dangling references as dashed "ghost" nodes so the gaps are visible in
    // the network itself (each citing source → the missing target it references).
    if (showGhosts && gaps?.unresolvedRefs?.length) {
      const ids = new Set(nodes.map((n: any) => n.id));
      for (const r of gaps.unresolvedRefs) {
        const ghostId = `gap:${r.ref_key}`;
        if (!ids.has(ghostId)) {
          nodes.push({
            id: ghostId,
            label: String(r.target_reference || r.target_law_code || r.ref_key).slice(0, 40),
            group: '__missing__', val: 1, refs: r.mentions, missing: true,
          });
          ids.add(ghostId);
        }
        // Ensure the citing source exists as a node so the link endpoint resolves.
        if (r.example_source && !ids.has(r.example_source)) {
          nodes.push({ id: r.example_source, label: r.example_source, group: 'other', val: 1, refs: 0 });
          ids.add(r.example_source);
        }
        if (r.example_source) links.push({ source: r.example_source, target: ghostId, weight: r.mentions, missing: true });
      }
    }
    return { nodes, links };
  }, [data, showGhosts, gaps]);

  const nodeVal = useCallback((n: any) => n.val, []);

  const nodeLabel = useCallback((n: any) => {
    const conn = adjacency.get(n.id)?.size || 0;
    return `<div style="padding:8px 10px;background:rgba(15,23,42,0.97);border:1px solid rgba(148,163,184,0.25);border-radius:8px;color:#e2e8f0;font-size:12px;max-width:320px;box-shadow:0 6px 18px rgba(0,0,0,0.45)">
      <div style="font-weight:600;margin-bottom:4px;line-height:1.35">${escapeHtml(n.id)}</div>
      <div style="opacity:0.75;font-size:11px">${escapeHtml(humanizeGroup(n.group))} · ${conn} ${conn === 1 ? 'connection' : 'connections'} · referenced ${n.refs}×</div>
    </div>`;
  }, [adjacency]);

  const linkColor = useCallback((l: any) => {
    if (l.missing) return 'rgba(245,158,11,0.5)'; // amber = dangling reference
    if (!hoverId) return 'rgba(120,120,140,0.16)';
    const s = linkEnd(l.source), t2 = linkEnd(l.target);
    return (s === hoverId || t2 === hoverId) ? 'rgba(96,165,250,0.75)' : 'rgba(120,120,140,0.04)';
  }, [hoverId]);

  const linkLineDash = useCallback((l: any) => (l.missing ? [3, 3] : null), []);

  const linkWidth = useCallback((l: any) => {
    const base = Math.min(3, Math.max(0.4, Math.log2((l.weight || 1) + 1)));
    if (!hoverId) return base;
    const s = linkEnd(l.source), t2 = linkEnd(l.target);
    return (s === hoverId || t2 === hoverId) ? base + 1 : base;
  }, [hoverId]);

  // Particles flowing along the links give a subtle, always-on "information flow" motion —
  // one particle per link at idle, more on the hovered node's links.
  const linkParticles = useCallback((l: any) => {
    if (l.missing) return 0; // no flow on dangling (dashed) links
    if (!hoverId) return 1;
    const s = linkEnd(l.source), t2 = linkEnd(l.target);
    return (s === hoverId || t2 === hoverId) ? 4 : 1;
  }, [hoverId]);
  const particleColor = useCallback(() => (isDarkRef.current ? 'rgba(125,211,252,0.9)' : 'rgba(37,99,235,0.75)'), []);

  const handleNodeHover = useCallback((n: any) => {
    setHoverId(n ? n.id : null);
    if (wrapRef.current) wrapRef.current.style.cursor = n ? 'pointer' : 'default';
  }, []);

  const handleNodeClick = useCallback((n: any) => {
    setSelected(n);
    fgRef.current?.centerAt(n.x, n.y, 600);
    fgRef.current?.zoom(4, 600);
    // Load that source's gaps + content preview so the user can inspect and fix it in place —
    // skip synthetic "missing" ghost nodes.
    if (n && !n.missing) { loadNodeGaps(n.id); loadNodeInfo(n.id); } else { setNodeGaps(null); setNodeInfo(null); }
  }, [loadNodeGaps, loadNodeInfo]);

  const handleBackgroundClick = useCallback(() => { setSelected(null); setNodeGaps(null); setNodeInfo(null); }, []);

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
          {/* Language split — explore the Arabic and English reference networks separately in a
              mixed corpus, or the combined graph. */}
          <div className="inline-flex rounded-md border border-gray-200 dark:border-[#1e3a5f] overflow-hidden">
            {([
              ['all', t('graph.lang.all', { defaultValue: 'All' })],
              ['en', t('graph.lang.en', { defaultValue: 'EN' })],
              ['ar', t('graph.lang.ar', { defaultValue: 'AR' })],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLang(value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  lang === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('graph.search', { defaultValue: 'Highlight a source…' })}
              className="ps-8 w-56"
            />
          </div>
          <Button
            variant={showQuests ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowQuests((v) => !v)}
          >
            <Sparkles className="h-4 w-4 me-2" />
            {t('graph.quests.button', { defaultValue: 'Improve' })}
            {gaps && (gaps.summary.unresolved + gaps.summary.weak) > 0 && (
              <span className="ms-2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold">
                {gaps.summary.unresolved + gaps.summary.weak}
              </span>
            )}
          </Button>
          {/* The payoff: let the assistant use these connections when answering, right where the user
              strengthens the graph. Writes relationships.graphRetrievalEnabled. */}
          <Button
            variant={graphInAnswers ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleGraphInAnswers(!graphInAnswers)}
            disabled={graphAnswersBusy || graphInAnswers === null}
            title={t('graph.useInAnswers.help', { defaultValue: 'When on, the assistant uses these connections to pull in related documents and improve its answers.' })}
          >
            {graphAnswersBusy ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Brain className="h-4 w-4 me-2" />}
            {t('graph.useInAnswers.button', { defaultValue: 'Use in answers' })}
            <span className={`ms-2 text-[10px] font-semibold ${graphInAnswers ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {graphInAnswers ? t('common.on', { defaultValue: 'ON' }) : t('common.off', { defaultValue: 'OFF' })}
            </span>
          </Button>
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
          {communityCount > 1 && (
            <Badge variant="secondary">{communityCount} {t('graph.clusters', { defaultValue: 'clusters' })}</Badge>
          )}
          {gaps && (
            <Badge
              variant="secondary"
              className={gaps.summary.completeness < 0.9 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}
            >
              {Math.round(gaps.summary.completeness * 100)}% {t('graph.health.connected', { defaultValue: 'connected' })}
            </Badge>
          )}
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
              linkLineDash={linkLineDash}
              linkWidth={linkWidth}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              linkDirectionalParticles={linkParticles}
              linkDirectionalParticleSpeed={0.004}
              linkDirectionalParticleWidth={1.8}
              linkDirectionalParticleColor={particleColor}
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

              {/* Source inspector: what THIS source actually contains — chunk count, top extracted
                  entities, a content snippet and a link back to the original document. */}
              {nodeInfo && (
                <div className="mt-2 space-y-1.5 border-t pt-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {nodeInfo.chunks} {t('graph.node.chunks', { defaultValue: 'chunks' })}
                      {nodeInfo.source_table && <> · {nodeInfo.source_table}</>}
                    </span>
                    {nodeInfo.url && (
                      <a
                        href={nodeInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:opacity-80 shrink-0"
                      >
                        {t('graph.node.openSource', { defaultValue: 'Open source' })}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {Object.keys(nodeInfo.entities).length > 0 && (
                    <div className="space-y-1">
                      {Object.entries(nodeInfo.entities).map(([type, values]) => (
                        <div key={type} className="flex flex-wrap items-center gap-1 text-[10px]">
                          <span className="text-muted-foreground shrink-0">{type.replace(/_/g, ' ')}</span>
                          {values.map((v) => (
                            <span
                              key={v.value}
                              title={`${v.value} (${v.n}×)`}
                              className="rounded border px-1.5 py-0.5 bg-muted/40 max-w-[160px] truncate"
                            >
                              {v.value}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {nodeInfo.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-3">{nodeInfo.snippet}</p>
                  )}
                </div>
              )}

              {/* Per-node gaps: fix THIS source in place while browsing (reuses the panel handlers). */}
              {nodeGapsLoading && (
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {t('graph.node.loading', { defaultValue: 'Checking this source…' })}
                </div>
              )}
              {nodeGaps && !nodeGapsLoading && (
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                  {nodeGaps.isOrphan && (
                    <div className="rounded border p-2 text-xs space-y-1">
                      <div className="text-muted-foreground">{t('graph.node.orphan', { defaultValue: 'Not connected to anything yet.' })}</div>
                      <Button variant="outline" size="sm" className="h-6 text-xs" disabled={scanActive} onClick={() => nodeGaps.source_table && startScan(nodeGaps.source_table)}>
                        <Wand2 className="h-3 w-3 me-1" />{t('graph.quests.extract', { defaultValue: 'Find connections' })}
                      </Button>
                    </div>
                  )}
                  {nodeGaps.danglingRefs.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">{t('graph.node.missing', { defaultValue: 'Refers to documents you don’t have' })}</div>
                      {nodeGaps.danglingRefs.slice(0, 4).map((r) => {
                        const refObj: UnresolvedRef = { ref_key: r.ref_key, target_law_code: r.target_law_code, target_article_number: r.target_article_number, target_reference: r.target_reference, mentions: r.mentions, citing_sources: 1, example_source: nodeGaps.source };
                        const isBusy = busy.has(`ref:${r.ref_key}`);
                        return (
                          <div key={r.ref_key} className="flex items-center justify-between gap-2 rounded border p-1.5 text-xs">
                            <span className="truncate">{r.target_reference || r.target_law_code || r.ref_key}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button type="button" disabled={isBusy} title={t('graph.quests.link', { defaultValue: 'I have this' })} onClick={() => { setShowQuests(true); openLinkPicker(refObj); }} className="text-primary hover:opacity-80"><Link2 className="h-3.5 w-3.5" /></button>
                              <button type="button" disabled={isBusy} title={t('graph.quests.external', { defaultValue: 'Outside scope' })} onClick={() => resolveRef(refObj, 'external')} className="text-muted-foreground hover:text-foreground"><Ban className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {nodeGaps.weakLinks.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-orange-600 dark:text-orange-400">{t('graph.node.unsure', { defaultValue: 'Connections to double-check' })}</div>
                      {nodeGaps.weakLinks.slice(0, 4).map((l) => {
                        const isBusy = busy.has(`link:${l.id}`);
                        return (
                          <div key={l.id} className="flex items-center justify-between gap-2 rounded border p-1.5 text-xs">
                            <span className="truncate">{l.source} <span className="text-muted-foreground">{relTypeLabel(l.relationship_type)}</span> {l.target}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button type="button" disabled={isBusy} title={t('graph.quests.confirm', { defaultValue: 'Correct' })} onClick={() => verifyLink(l, 'confirm')} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                              <button type="button" disabled={isBusy} title={t('graph.quests.reject', { defaultValue: 'Wrong' })} onClick={() => verifyLink(l, 'reject')} className="text-red-600 hover:text-red-700"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!nodeGaps.isOrphan && nodeGaps.danglingRefs.length === 0 && nodeGaps.weakLinks.length === 0 && (
                    <div className="text-xs text-muted-foreground">{t('graph.node.clean', { defaultValue: 'This source looks well-connected.' })}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Corpus Quests — surface graph gaps and let the user act on them to strengthen the corpus. */}
      {showQuests && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-lg font-semibold">{t('graph.quests.title', { defaultValue: 'Strengthen your knowledge base' })}</h2>
                {gapsLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
                  <input type="checkbox" checked={showGhosts} onChange={(e) => setShowGhosts(e.target.checked)} className="accent-amber-500" />
                  {t('graph.quests.showOnGraph', { defaultValue: 'Show gaps on graph' })}
                </label>
                <Button variant="outline" size="sm" onClick={loadGaps} disabled={gapsLoading}>
                  <RefreshCw className={`h-4 w-4 ${gapsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Plain-language explainer — this page is used by people who don't know how RAG/embeddings
                work; tell them what the graph is and what fixing these items achieves. */}
            <p className="text-sm text-muted-foreground">
              {t('graph.quests.intro', { defaultValue: 'This map shows how your documents reference each other. The items below are the assistant’s suggestions to make its answers more reliable — add documents your sources rely on (enrich), or tidy up connections it isn’t sure about (maintain). Pick any card and follow the buttons.' })}
            </p>

            {/* System-wide coverage + the master "scan the whole library for connections" action. */}
            <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {stats ? (
                    <>
                      <span><span className="font-semibold text-foreground">{Math.round(stats.extraction_coverage_pct)}%</span> {t('graph.scan.scanned', { defaultValue: 'analyzed' })}</span>
                      <span><span className="font-semibold text-foreground">{stats.total_relationships.toLocaleString()}</span> {t('graph.scan.connections', { defaultValue: 'connections' })}</span>
                      <span><span className="font-semibold text-foreground">{stats.unresolved_references.toLocaleString()}</span> {t('graph.scan.unresolved', { defaultValue: 'unresolved' })}</span>
                    </>
                  ) : <span className="text-muted-foreground/60">…</span>}
                </div>
                {!scanActive && !scanConfirm && (
                  <Button variant="default" size="sm" className="h-8 text-xs" disabled={(stats?.active_jobs || 0) > 0} onClick={() => setScanConfirm(true)}>
                    <Zap className="h-3.5 w-3.5 me-1.5" />
                    {t('graph.scan.scanAll', { defaultValue: 'Scan the whole library for connections' })}
                  </Button>
                )}
              </div>

              {/* Cost/scale confirmation before a corpus-wide scan (opt-in). */}
              {scanConfirm && !scanActive && (
                <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs space-y-2">
                  <div className="text-amber-800 dark:text-amber-200">
                    {t('graph.scan.costNote', { defaultValue: 'This reads your documents with the AI to find connections. On a large library it can take a while and use some API credit. You can stop it anytime.' })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => startScan()}>
                      <Zap className="h-3 w-3 me-1" />{t('graph.scan.start', { defaultValue: 'Start scan' })}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setScanConfirm(false)}>
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </Button>
                  </div>
                </div>
              )}

              {/* Live progress while a scan runs (corpus-wide or per-source). */}
              {scanJob && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-muted-foreground truncate">
                      {scanJob.progress?.status === 'completed' ? t('graph.scan.done', { defaultValue: 'Scan complete' })
                        : scanJob.progress?.status === 'cancelled' ? t('graph.scan.stopped', { defaultValue: 'Scan stopped' })
                        : scanJob.progress?.status === 'failed' ? t('graph.scan.failed', { defaultValue: 'Scan failed' })
                        : t('graph.scan.scanning', { defaultValue: 'Scanning' })}
                      {' · '}{scanJob.label}
                      {scanJob.progress?.relationships_found ? ` · ${scanJob.progress.relationships_found} ${t('graph.scan.found', { defaultValue: 'new connections' })}` : ''}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{(scanJob.progress?.processed_chunks || 0).toLocaleString()}/{(scanJob.progress?.total_chunks || 0).toLocaleString()}</span>
                      {scanActive && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-red-600 px-1" onClick={cancelScan}>
                          <StopCircle className="h-3.5 w-3.5 me-1" />{t('graph.scan.stop', { defaultValue: 'Stop' })}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${scanJob.progress?.total_chunks ? Math.min(100, Math.round(((scanJob.progress.processed_chunks || 0) / scanJob.progress.total_chunks) * 100)) : (scanActive ? 8 : 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {gaps ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: t('graph.health.resolved', { defaultValue: 'Connected references' }), value: gaps.summary.resolved, cls: 'text-emerald-600 dark:text-emerald-400' },
                    { label: t('graph.health.dangling', { defaultValue: 'Missing documents' }), value: gaps.summary.unresolved, cls: 'text-amber-600 dark:text-amber-400' },
                    { label: t('graph.health.weak', { defaultValue: 'Unsure connections' }), value: gaps.summary.weak, cls: 'text-orange-600 dark:text-orange-400' },
                    { label: t('graph.health.completenessLabel', { defaultValue: 'Connected' }), value: `${Math.round(gaps.summary.completeness * 100)}%`, cls: 'text-blue-600 dark:text-blue-400' },
                  ].map((s, i) => (
                    <div key={i} className="rounded-lg border p-3 bg-muted/30">
                      <div className={`text-xl font-bold ${s.cls}`}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
                      <div className="text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* 1) Missing documents (data enrichment) */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Link2 className="h-4 w-4 text-amber-500" />
                      {t('graph.quests.dangling', { defaultValue: 'Missing documents' })}
                      <Badge variant="secondary" className="text-[10px] font-normal">{t('graph.quests.tagEnrich', { defaultValue: 'adds data' })}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('graph.quests.danglingHelp', { defaultValue: 'Your sources mention these, but they aren’t in your library yet. Add them so the assistant can use them.' })}
                    </p>
                    {gaps.unresolvedRefs.length ? gaps.unresolvedRefs.map((r) => {
                      const isBusy = busy.has(`ref:${r.ref_key}`);
                      return (
                        <div key={r.ref_key} className="rounded-lg border p-3 text-xs space-y-2">
                          <div className="font-medium text-sm break-words">{r.target_reference || r.target_law_code || r.ref_key}</div>
                          <div className="text-muted-foreground">
                            {t('graph.quests.referencedBy', { defaultValue: 'Referenced by' })} {r.citing_sources} {r.citing_sources === 1 ? t('graph.quests.sourceOne', { defaultValue: 'source' }) : t('graph.quests.sources', { defaultValue: 'sources' })}
                            {r.example_source && <> · {t('graph.quests.egShort', { defaultValue: 'e.g.' })} <span className="italic">{r.example_source}</span></>}
                          </div>
                          {linkingRef === r.ref_key ? (
                            <div className="space-y-1.5">
                              <div className="text-[11px] text-muted-foreground">{t('graph.quests.whichDoc', { defaultValue: 'Which document in your library is this?' })}</div>
                              <Input
                                value={sourceQuery}
                                onChange={(e) => { setSourceQuery(e.target.value); searchSources(e.target.value); }}
                                placeholder={t('graph.quests.searchSource', { defaultValue: 'Search your library…' })}
                                className="h-8 text-xs"
                              />
                              <div className="max-h-40 overflow-y-auto rounded border divide-y">
                                {sourceResults.map((s) => (
                                  <button
                                    key={s.source_name}
                                    type="button"
                                    onClick={() => resolveRef(r, 'link', s.source_name)}
                                    className="w-full text-left px-2 py-1.5 hover:bg-muted flex items-center justify-between gap-2"
                                  >
                                    <span className="truncate">{s.source_name}</span>
                                    <span className="text-[10px] text-muted-foreground shrink-0">{s.chunks}</span>
                                  </button>
                                ))}
                                {!sourceResults.length && <div className="px-2 py-1.5 text-muted-foreground">{t('graph.quests.noSources', { defaultValue: 'No matches' })}</div>}
                              </div>
                              <button type="button" onClick={() => setLinkingRef(null)} className="text-muted-foreground hover:text-foreground">
                                {t('common.cancel', { defaultValue: 'Cancel' })}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isBusy} onClick={() => openLinkPicker(r)}>
                                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3 me-1" />}
                                {t('graph.quests.link', { defaultValue: 'I have this' })}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" title={t('graph.quests.externalHelp', { defaultValue: 'Referenced on purpose but lives outside your library — stop showing it here.' })} disabled={isBusy} onClick={() => resolveRef(r, 'external')}>
                                <Ban className="h-3 w-3 me-1" />
                                {t('graph.quests.external', { defaultValue: 'Outside scope' })}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    }) : <div className="text-xs text-muted-foreground">{t('graph.quests.noneDangling', { defaultValue: 'Nothing missing — every reference is in your library.' })}</div>}
                  </div>

                  {/* 2) Unsure connections (maintenance) */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      {t('graph.quests.weak', { defaultValue: 'Unsure connections' })}
                      <Badge variant="secondary" className="text-[10px] font-normal">{t('graph.quests.tagMaintain', { defaultValue: 'keeps it tidy' })}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('graph.quests.weakHelp', { defaultValue: 'The assistant guessed these links but isn’t certain. Keep the right ones, drop the wrong ones.' })}
                    </p>
                    {gaps.weakLinks.length ? gaps.weakLinks.map((l) => {
                      const isBusy = busy.has(`link:${l.id}`);
                      return (
                        <div key={l.id} className="rounded-lg border p-3 text-xs space-y-2">
                          <div className="text-sm break-words">
                            <span className="font-medium">{l.source}</span> <span className="text-muted-foreground">{relTypeLabel(l.relationship_type)}</span> <span className="font-medium">{l.target}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">{t('graph.quests.aiGuessed', { defaultValue: 'The assistant guessed this — is it right?' })}</div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isBusy} onClick={() => verifyLink(l, 'confirm')}>
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 me-1 text-emerald-500" />}
                              {t('graph.quests.confirm', { defaultValue: 'Correct' })}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" disabled={isBusy} onClick={() => verifyLink(l, 'reject')}>
                              <X className="h-3 w-3 me-1" />
                              {t('graph.quests.reject', { defaultValue: 'Wrong' })}
                            </Button>
                            <select
                              value={l.relationship_type}
                              disabled={isBusy}
                              onChange={(e) => verifyLink(l, 'retype', e.target.value)}
                              aria-label={t('graph.quests.retype', { defaultValue: 'Fix the wording' })}
                              title={t('graph.quests.retype', { defaultValue: 'Fix the wording' })}
                              className="h-7 rounded border bg-background text-xs px-1"
                            >
                              {RELATIONSHIP_TYPES.map((rt) => <option key={rt} value={rt}>{relTypeLabel(rt)}</option>)}
                            </select>
                          </div>
                        </div>
                      );
                    }) : <div className="text-xs text-muted-foreground">{t('graph.quests.noneWeak', { defaultValue: 'Nothing to check — all connections look solid.' })}</div>}
                  </div>

                  {/* 3) Not connected yet (maintenance) */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Wand2 className="h-4 w-4 text-purple-500" />
                      {t('graph.quests.orphans', { defaultValue: 'Not connected yet' })}
                      <Badge variant="secondary" className="text-[10px] font-normal">{t('graph.quests.tagMaintain', { defaultValue: 'keeps it tidy' })}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('graph.quests.orphansHelp', { defaultValue: 'These documents aren’t linked to anything yet. Let the assistant scan them for connections to the rest of your library.' })}
                    </p>
                    {gaps.orphans.length ? gaps.orphans.map((o) => {
                      const scanningThis = scanActive && scanJob?.label === o.source_table;
                      return (
                        <div key={o.source_name} className="rounded-lg border p-3 text-xs space-y-2">
                          <div className="font-medium text-sm break-words">{o.source_name}</div>
                          <div className="text-muted-foreground">{o.source_table}</div>
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={scanActive} onClick={() => startScan(o.source_table)}>
                            {scanningThis ? <Loader2 className="h-3 w-3 animate-spin me-1" /> : <Wand2 className="h-3 w-3 me-1" />}
                            {t('graph.quests.extract', { defaultValue: 'Find connections' })}
                          </Button>
                        </div>
                      );
                    }) : <div className="text-xs text-muted-foreground">{t('graph.quests.noneOrphans', { defaultValue: 'Every document is connected.' })}</div>}
                    {gaps.orphansCapped && (
                      <div className="text-[10px] text-muted-foreground">{t('graph.quests.capped', { defaultValue: 'Showing the first' })} {gaps.limit}</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
