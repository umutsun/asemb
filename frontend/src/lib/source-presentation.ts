/**
 * Shared source/citation presentation helpers used by every chat template
 * (zen01, modern, base). All tenant-specific presentation (table -> type label,
 * chip fields, chip labels) is settings-driven:
 *
 *   - ragSettings.sourceTypeLabels   -> getSourceTypeInfo() typeLabelMap
 *   - ragSettings.citationPriorityFields -> buildCitationChips() priorityFields
 *   - ragSettings.fieldLabels        -> buildCitationChips() fieldLabels
 *
 * When those settings are absent, tiny generic fallbacks apply (document/webpage/media
 * heuristics and a default chip field order) — nothing tenant- or language-specific
 * is hardcoded here.
 */

import i18n from '@/lib/i18n';

/** Presentation info for a source type badge. */
export interface SourceTypeInfo {
  /** i18n key resolved by the component, e.g. 'sourceTypes.legislation' */
  labelKey: string;
  /**
   * Marker color token (e.g. 'purple', 'blue', 'slate'). Templates prefix it with their
   * own marker class family (zen01-marker-*, marker-*) and fall back when unsupported.
   */
  markerClass: string;
  /** Relative importance; higher = more authoritative source type */
  weight: number;
}

/** Tenant map from source-table pattern to type presentation (ragSettings.sourceTypeLabels). */
export type SourceTypeLabelMap = Record<string, Partial<SourceTypeInfo>>;

/** A chip label: plain string, or a per-language map like { en, ar, tr }. */
export type FieldLabel = string | Record<string, string>;

/** Tenant map from metadata field name to chip label (ragSettings.fieldLabels). */
export type FieldLabelMap = Record<string, FieldLabel>;

/** One resolved citation chip, ready for rendering. */
export interface CitationChipData {
  /** Metadata field name this chip was built from */
  key: string;
  /** Label resolved from the tenant fieldLabels setting (absent -> component falls back to t(labelKey)) */
  label?: string;
  /** i18n fallback key for the label, e.g. 'citations.fields.article_number' */
  labelKey: string;
  value: string;
}

/** Minimal source shape every template's source object satisfies. */
export interface PresentableSource {
  title?: string;
  citation?: string;
  sourceTable?: string;
  sourceType?: string;
  category?: string;
  metadata?: Record<string, unknown> | null;
  databaseInfo?: { table?: string; id?: string | number };
}

const FALLBACK_TYPE: SourceTypeInfo = {
  labelKey: 'sourceTypes.source',
  markerClass: 'slate',
  weight: 0,
};

/**
 * Tiny generic heuristics used only when no tenant sourceTypeLabels setting matches.
 * Matches generic English words in table/type identifiers — never tenant table names.
 */
const GENERIC_TYPE_HINTS: Array<{ match: RegExp; info: SourceTypeInfo }> = [
  { match: /legislation|law/, info: { labelKey: 'sourceTypes.legislation', markerClass: 'purple', weight: 100 } },
  { match: /media/, info: { labelKey: 'sourceTypes.media', markerClass: 'pink', weight: 55 } },
  { match: /document/, info: { labelKey: 'sourceTypes.document', markerClass: 'slate', weight: 40 } },
  { match: /webpage|web/, info: { labelKey: 'sourceTypes.webpage', markerClass: 'blue', weight: 40 } },
];

const normalizeTableKey = (value: string): string =>
  value.toLowerCase().replace(/^csv_/, '').replace(/[^a-z0-9]+/g, '');

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Resolve the type badge (label key, marker color token, weight) for a source.
 * Tenant-configured `typeLabelMap` (ragSettings.sourceTypeLabels) wins; otherwise
 * generic heuristics apply, and finally a neutral 'source' fallback.
 */
export function getSourceTypeInfo(
  sourceTable?: string,
  metadata?: Record<string, unknown> | null,
  typeLabelMap?: SourceTypeLabelMap
): SourceTypeInfo {
  const candidates = [
    sourceTable,
    asText(metadata?.source_table),
    asText(metadata?.source_type),
    asText(metadata?.sourceType),
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  // 1) Tenant-configured map (settings-driven)
  if (typeLabelMap) {
    for (const candidate of candidates) {
      const key = normalizeTableKey(candidate);
      if (!key) continue;
      for (const [pattern, info] of Object.entries(typeLabelMap)) {
        const patternKey = normalizeTableKey(pattern);
        if (patternKey && (key === patternKey || key.includes(patternKey) || patternKey.includes(key))) {
          return { ...FALLBACK_TYPE, ...info };
        }
      }
    }
  }

  // 2) Generic heuristics
  for (const candidate of candidates) {
    const key = normalizeTableKey(candidate);
    for (const hint of GENERIC_TYPE_HINTS) {
      if (hint.match.test(key)) return hint.info;
    }
  }

  return FALLBACK_TYPE;
}

/** Resolve a chip label from the tenant fieldLabels setting for a given UI/content language. */
export function resolveFieldLabel(
  fieldLabels: FieldLabelMap | undefined,
  field: string,
  lang?: string
): string | undefined {
  const entry = fieldLabels?.[field];
  if (!entry) return undefined;
  if (typeof entry === 'string') return entry;
  const short = (lang || 'en').toLowerCase().split('-')[0];
  return entry[short] ?? entry.en ?? Object.values(entry)[0];
}

/** Validated official-source URL from source metadata (http/https only). */
export function getOfficialSourceUrl(source: PresentableSource): string | undefined {
  const url = asText(source.metadata?.url);
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * True when a card "title" is just the head of the excerpt/description below it
 * (chunk-derived titles duplicate the content head, e.g. "7. The Input Tax that
 * could be recoverable shall be calculated as..."). Cards should then skip the
 * title line — the type badge + chips already identify the source.
 */
export function isRedundantTitle(title?: string, body?: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const t = normalize(title || '');
  const b = normalize(body || '');
  if (!t || !b) return false;
  const probe = t.slice(0, Math.min(40, t.length));
  return probe.length >= 15 && (b.startsWith(probe) || b.includes(probe));
}

/**
 * Resolve the display value of one priority field from source metadata.
 * A handful of fields get structured fallbacks (legacy metadata aliases, URL host,
 * date truncation); everything else reads metadata[field] directly.
 */
function resolveFieldValue(field: string, source: PresentableSource): string {
  const m = (source.metadata || {}) as Record<string, unknown>;
  switch (field) {
    case 'law_title':
      return asText(m.law_title) || asText(m.law) || asText(m.law_name);
    case 'issue_date': {
      // ISO timestamp -> date part only
      const raw = asText(m.issue_date);
      return raw ? raw.slice(0, 10) : '';
    }
    case 'source':
      return asText(m.source) || asText(m.source_name) || hostOf(asText(m.url));
    case 'url': {
      const url = getOfficialSourceUrl(source);
      return url ? hostOf(url) : '';
    }
    case 'lang':
      return asText(m.lang).toUpperCase();
    default:
      return asText(m[field]);
  }
}

/**
 * Generic chip order used when the tenant has no citationPriorityFields setting:
 * law title, article number, year, issue date, source host, language badge.
 */
const DEFAULT_PRIORITY_FIELDS = ['law_title', 'article_number', 'law_year', 'issue_date', 'url', 'lang'];

/**
 * Build the ordered citation chips for a source card.
 * `priorityFields` / `fieldLabels` come from settings (ragSettings.*); both optional.
 */
export function buildCitationChips(
  source: PresentableSource,
  lang?: string,
  fieldLabels?: FieldLabelMap,
  priorityFields?: string[]
): CitationChipData[] {
  const fields = Array.isArray(priorityFields) && priorityFields.length > 0
    ? priorityFields
    : DEFAULT_PRIORITY_FIELDS;

  const chips: CitationChipData[] = [];
  for (const field of fields) {
    if (typeof field !== 'string' || !field) continue;
    const value = resolveFieldValue(field, source);
    if (!value) continue;
    chips.push({
      key: field,
      label: resolveFieldLabel(fieldLabels, field, lang),
      labelKey: `citations.fields.${field}`,
      value,
    });
  }
  return chips;
}

/**
 * Human tooltip for a citation reference: "<law title> — Art. <n>" (localized "Art." label),
 * falling back to the source title.
 */
export function buildCitationTooltip(source: PresentableSource, lang?: string): string {
  const m = (source.metadata || {}) as Record<string, unknown>;
  const t = i18n.getFixedT(lang || i18n.language || 'en');
  const lawTitle =
    asText(m.law_title) || asText(m.law) || asText(m.law_name) || asText(source.title) || asText(source.citation);
  const articleNumber = asText(m.article_number);
  if (lawTitle && articleNumber) {
    return `${lawTitle} — ${t('citations.articleShort')} ${articleNumber}`;
  }
  return lawTitle || t('sourceTypes.source');
}
