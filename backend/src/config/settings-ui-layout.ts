// =============================================================================
// Settings UI layout — the PRESENTATION layer for the redesigned settings shell.
//
// The settings registry (settings-registry.ts) stays the single source of truth for
// each key's type / default / min-max / enum / secret / validation. This file only
// decides HOW keys are grouped and labelled in the UI (nav sections → groups → fields),
// and provides Answer-Safety presets. `buildSettingsSchema()` merges the two into a
// ready-to-render schema (no secret values) that the frontend renders generically.
//
// Scope (v1): RAG + Chatbot — the messiest area. Other categories reuse this same
// mechanism later by adding more sections here.
// =============================================================================

import { getDef, SettingType } from './settings-registry';

export type ControlType =
  | 'switch'
  | 'slider'
  | 'segmented'
  | 'select'
  | 'text'
  | 'secret'
  | 'textarea'
  | 'json'
  | 'range'
  | 'sourceBars';

interface LayoutField {
  key: string;
  label: string;
  help?: string;
  control?: ControlType; // override the inferred control
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[]; // override enum options
  advanced?: boolean; // hidden under a per-group "Advanced" expander
  rangeMaxKey?: string; // for control 'range': this key is the min, rangeMaxKey the max
}

interface LayoutGroup {
  id: string;
  title: string;
  fields?: LayoutField[];
  component?: 'patterns'; // embed a bespoke component instead of generated fields
  preset?: 'answerSafety'; // render preset cards at the top of this section
}

interface LayoutSection {
  id: string;
  navGroup: string; // top-level nav heading (e.g. "RAG", "Chatbot")
  title: string;
  blurb: string;
  groups: LayoutGroup[];
}

// -----------------------------------------------------------------------------
// Nav layout: 6 focused groups (was 10 flat sections in the old monolith).
// -----------------------------------------------------------------------------
const NAV: LayoutSection[] = [
  {
    id: 'safety',
    navGroup: 'RAG',
    title: 'Answer Safety',
    blurb: 'Decide when the model answers versus admits it lacks enough evidence. A preset sets most thresholds; open Custom to fine-tune.',
    groups: [
      { id: 'presets', title: '', preset: 'answerSafety' },
      {
        id: 'evidence',
        title: 'Evidence gate',
        fields: [
          { key: 'ragSettings.evidenceGateEnabled', label: 'Refuse when evidence is weak', help: 'Honestly decline when no sufficiently relevant sources are found', advanced: true },
          { key: 'ragSettings.evidenceGateMinScore', label: 'Minimum source quality', help: 'Sources below this score do not count', min: 0, max: 1, step: 0.05, advanced: true },
          { key: 'ragSettings.evidenceGateMinChunks', label: 'Minimum supporting sources', help: 'Strong sources required to answer', min: 1, max: 10, step: 1, advanced: true },
        ],
      },
      {
        id: 'confidence',
        title: 'Confidence & determinism',
        fields: [
          { key: 'ragSettings.strictModeLevel', label: 'Strictness level', control: 'segmented', options: [{ value: 'relaxed', label: 'Relaxed' }, { value: 'medium', label: 'Medium' }, { value: 'strict', label: 'Strict' }], advanced: true },
          { key: 'ragSettings.strictModeTemperature', label: 'Answer determinism', help: 'Lower = more consistent, higher = more creative (temperature)', min: 0, max: 1, step: 0.05, advanced: true },
        ],
      },
    ],
  },
  {
    id: 'retrieval',
    navGroup: 'RAG',
    title: 'Retrieval',
    blurb: 'How many sources are fetched, the vector/keyword mix, and reranking.',
    groups: [
      {
        id: 'scope',
        title: 'Scope',
        fields: [
          { key: 'ragSettings.similarityThreshold', label: 'Similarity threshold', help: 'Lower value = more results', min: 0.001, max: 0.5, step: 0.005 },
          { key: 'ragSettings.minResults', label: 'Results range', help: 'Minimum / maximum sources', control: 'range', rangeMaxKey: 'ragSettings.maxResults', min: 0, max: 50, step: 1 },
        ],
      },
      {
        id: 'hybrid',
        title: 'Hybrid search',
        fields: [
          { key: 'ragSettings.enableHybridSearch', label: 'Hybrid search (vector + BM25)', help: 'Combine semantic and full-text search' },
          { key: 'ragSettings.bm25Weight', label: 'BM25 / vector balance', help: 'Left = semantic-weighted, right = keyword-weighted', min: 0, max: 1, step: 0.05 },
          { key: 'ragSettings.ftsLanguage', label: 'Full-text search language', control: 'select' },
        ],
      },
      {
        id: 'rerank',
        title: 'Reranking',
        fields: [
          { key: 'ragSettings.rerankEnabled', label: 'Reranker', help: 'Re-order results with a cross-encoder' },
          { key: 'ragSettings.rerankProvider', label: 'Reranker provider', control: 'segmented', options: [{ value: 'local', label: 'Local' }, { value: 'jina', label: 'Jina' }] },
          { key: 'ragSettings.rerankMinScore', label: 'Rerank min score', min: 0, max: 1, step: 0.05, advanced: true },
          { key: 'ragSettings.rerankModel', label: 'Reranker model', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'sources',
    navGroup: 'RAG',
    title: 'Sources',
    blurb: 'Which tables retrieval trusts more. Weights bias ordering during retrieval.',
    groups: [
      {
        id: 'tables',
        title: 'Table weights',
        fields: [
          { key: 'search.sourceTableWeights', label: 'Per-table weights', control: 'sourceBars' },
        ],
      },
    ],
  },
  {
    id: 'cache',
    navGroup: 'RAG',
    title: 'Cache & Memory',
    blurb: 'Performance and context: response cache, agent memory, data freshness and batching.',
    groups: [
      {
        id: 'performance',
        title: 'Performance',
        fields: [
          { key: 'ragSettings.semanticCacheEnabled', label: 'Semantic response cache', help: 'Reuse answers for similar questions' },
          { key: 'ragSettings.agentMemoryEnabled', label: 'Agent memory', help: 'Remember across turns' },
          { key: 'ragSettings.autoFreshnessEnabled', label: 'Real-time data freshness', help: 'Auto-reflect new embeddings' },
          { key: 'ragSettings.parallelLLMBatchSize', label: 'Batch size', help: 'Chunks processed in parallel', min: 1, max: 10, step: 1 },
        ],
      },
      {
        id: 'cache-adv',
        title: 'Advanced',
        fields: [
          { key: 'ragSettings.semanticCacheThreshold', label: 'Cache similarity threshold', min: 0, max: 1, step: 0.01, advanced: true },
          { key: 'ragSettings.semanticCacheTTL', label: 'Cache TTL (seconds)', advanced: true },
          { key: 'ragSettings.freshnessPollSeconds', label: 'Freshness poll (seconds)', advanced: true },
          { key: 'ragSettings.agentMemoryRecallLimit', label: 'Agent memory recall limit', min: 0, max: 20, step: 1, advanced: true },
          { key: 'ragSettings.parallelLLMCount', label: 'Parallel LLM workers', min: 1, max: 16, step: 1, advanced: true },
        ],
      },
    ],
  },
  {
    id: 'chat',
    navGroup: 'Chatbot',
    title: 'Chat',
    blurb: 'Input features and voice. (Welcome message and suggestion cards live in the chatbot config blob and are edited separately.)',
    groups: [
      {
        id: 'input',
        title: 'Input features',
        fields: [
          { key: 'ragSettings.enablePdfUpload', label: 'PDF upload' },
          { key: 'ragSettings.enableVoiceInput', label: 'Voice input (STT)' },
          { key: 'ragSettings.enableVoiceOutput', label: 'Voice output (TTS)' },
          { key: 'ragSettings.streamingEnabled', label: 'Streaming responses' },
        ],
      },
      {
        id: 'voice',
        title: 'Voice',
        fields: [
          { key: 'voiceSettings.ttsProvider', label: 'TTS provider', control: 'select' },
          { key: 'voiceSettings.ttsVoice', label: 'TTS voice' },
          { key: 'voiceSettings.ttsSpeed', label: 'TTS speed', min: 0.25, max: 4, step: 0.05, advanced: true },
          { key: 'voiceSettings.maxRecordingSeconds', label: 'Max recording (seconds)', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'patterns',
    navGroup: 'Chatbot',
    title: 'Question Patterns',
    blurb: 'Rules that shape follow-up questions by content type.',
    groups: [{ id: 'patterns', title: '', component: 'patterns' }],
  },
];

// -----------------------------------------------------------------------------
// Answer-Safety presets — atomic bundles applied to real ragSettings keys.
// -----------------------------------------------------------------------------
export const ANSWER_SAFETY_PRESETS = {
  strict: {
    label: 'Strict',
    blurb: 'Answers only with strong evidence. For legal / critical content.',
    values: {
      'ragSettings.evidenceGateEnabled': true,
      'ragSettings.evidenceGateMinScore': 0.7,
      'ragSettings.evidenceGateMinChunks': 2,
      'ragSettings.strictMode': true,
      'ragSettings.strictModeLevel': 'strict',
      'ragSettings.strictModeTemperature': 0.2,
    },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'Balances evidence and coverage. Recommended default.',
    values: {
      'ragSettings.evidenceGateEnabled': true,
      'ragSettings.evidenceGateMinScore': 0.55,
      'ragSettings.evidenceGateMinChunks': 1,
      'ragSettings.strictMode': true,
      'ragSettings.strictModeLevel': 'medium',
      'ragSettings.strictModeTemperature': 0.4,
    },
  },
  comprehensive: {
    label: 'Comprehensive',
    blurb: 'Answers even with weaker evidence, refuses less. For exploration.',
    values: {
      'ragSettings.evidenceGateEnabled': false,
      'ragSettings.evidenceGateMinScore': 0.35,
      'ragSettings.evidenceGateMinChunks': 1,
      'ragSettings.strictMode': false,
      'ragSettings.strictModeLevel': 'relaxed',
      'ragSettings.strictModeTemperature': 0.6,
    },
  },
} as const;

// -----------------------------------------------------------------------------
// Merge layout + registry → a ready-to-render schema. No secret values are emitted
// (the schema is structure only; current values come from GET /settings?category).
// -----------------------------------------------------------------------------
export interface SchemaField {
  key: string;
  label: string;
  help?: string;
  control: ControlType;
  type: SettingType;
  secret: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default?: unknown;
  advanced: boolean;
  rangeMaxKey?: string;
}

function resolveOptions(lf: LayoutField, defEnum?: string[]): { value: string; label: string }[] | undefined {
  if (lf.options) return lf.options;
  if (defEnum) return defEnum.map((v) => ({ value: v, label: v }));
  return undefined;
}

function resolveControl(lf: LayoutField, type: SettingType, hasBounds: boolean, options?: unknown[]): ControlType {
  if (lf.control) return lf.control;
  switch (type) {
    case 'secret':
      return 'secret';
    case 'boolean':
      return 'switch';
    case 'json':
      return 'json';
    case 'number':
      return hasBounds ? 'slider' : 'text';
    case 'string':
      if (options && options.length) return options.length <= 3 ? 'segmented' : 'select';
      return 'text';
    default:
      return 'text';
  }
}

function mergeField(lf: LayoutField): SchemaField {
  const def = getDef(lf.key);
  const type: SettingType = def?.type ?? 'string';
  const min = lf.min ?? def?.min;
  const max = lf.max ?? def?.max;
  const options = resolveOptions(lf, def?.enum);
  const hasBounds = min !== undefined && max !== undefined;
  return {
    key: lf.key,
    label: lf.label,
    help: lf.help,
    control: resolveControl(lf, type, hasBounds, options),
    type,
    secret: type === 'secret',
    options,
    min,
    max,
    step: lf.step,
    unit: lf.unit,
    default: type === 'secret' ? undefined : def?.default,
    advanced: lf.advanced ?? false,
    rangeMaxKey: lf.rangeMaxKey,
  };
}

export function buildSettingsSchema() {
  const sections = NAV.map((s) => {
    const groups = s.groups.map((g) => ({
      id: g.id,
      title: g.title,
      component: g.component,
      preset: g.preset,
      fields: (g.fields ?? []).map(mergeField),
    }));
    const count = groups.reduce((n, g) => n + g.fields.length, 0);
    return { id: s.id, navGroup: s.navGroup, title: s.title, blurb: s.blurb, count, groups };
  });
  return { sections, presets: ANSWER_SAFETY_PRESETS };
}
