'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Source } from '@/types/chat';
import { ChevronDown, ChevronUp, Plus, MessageSquareText, ExternalLink } from 'lucide-react';
import { stripHtml } from '@/utils/html-utils';
import {
  getSourceTypeInfo as getSharedSourceTypeInfo,
  buildCitationChips,
  getOfficialSourceUrl,
  isRedundantTitle
} from '@/lib/source-presentation';
import { useCitationSettings } from '@/lib/citation-settings';
import { CitationChip } from './citation-chip';

// Marker color tokens available in globals.css (.marker-*); unknown tokens fall back to cyan
const BASE_MARKER_TOKENS = new Set(['cyan', 'green', 'orange', 'pink', 'purple', 'yellow']);
const baseMarkerClass = (token: string): string =>
  `marker-${BASE_MARKER_TOKENS.has(token) ? token : 'cyan'}`;

interface SourceCitationProps {
  sources: Source[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  showLoadMore?: boolean;
  onExcerptClick?: (question: string) => void;
}

/**
 * Clean citation text for readable display
 * Uses Turkish morphological suffix patterns to split concatenated words.
 * Works with both uppercase and lowercase text (case insensitive).
 */
function cleanCitationText(text: string, lng?: string): string {
  if (!text) return '';

  // The suffix/morphology rules below are Turkish-specific and can corrupt
  // legitimate English (primary) or Arabic (secondary) titles. Only run them for
  // Turkish; otherwise just trim. Default (no lng) preserves original behavior.
  if (lng && lng !== 'tr') return text.trim();

  let result = text;

  // 1. Number-word boundaries
  result = result
    .replace(/(\d{2,})([A-ZÇĞİÖŞÜ][a-zçğıöşü])/g, '$1 $2')
    .replace(/(\d{2,})([A-ZÇĞİÖŞÜ]{2,})/g, '$1 $2')
    .replace(/(\d{1,2}\/\d{1,2}\/\d{4})([A-ZÇĞİÖŞÜa-zçğıöşü])/g, '$1 $2');

  // 2. camelCase / lowercase-UPPERCASE transitions
  result = result.replace(/([a-zçğıöşü]{2,})([A-ZÇĞİÖŞÜ]{2,})/g, '$1 $2');

  // 3. Turkish morphological suffix boundaries (case insensitive)
  // After these suffixes, a new word likely begins
  // Order matters: longer suffixes first to avoid partial matches
  const suffixBoundaries = [
    // Derivational suffixes (longest first)
    /(SİNDEN|SİNDE|SİNE|SİNİ|SİNİN)(?=[A-ZÇĞİÖŞÜ])/gi,
    // Verbal noun + case
    /(MASINDA|MESİNDE|MASINA|MESİNE|MASI|MESİ)(?=[A-ZÇĞİÖŞÜ])/gi,
    // Plural + case (long forms first)
    /(LARINDA|LERİNDE|LARINDAN|LERİNDEN|LARINA|LERİNE)(?=[A-ZÇĞİÖŞÜ])/gi,
    /(LARIN|LERİN|LARDAN|LERDEN|LARI|LERİ)(?=[A-ZÇĞİÖŞÜ])/gi,
    // Genitive / possessive (long forms)
    /(ININ|İNİN|UNUN|ÜNÜN)(?=[A-ZÇĞİÖŞÜ])/gi,
    /(NIN|NİN|NUN|NÜN)(?=[A-ZÇĞİÖŞÜ])/gi,
    // Possessive -Sİ (vergisi, kanunu etc.) - CRITICAL for "VERGİSİKANUNU"
    // Require 4+ following chars to avoid false splits
    /(Sİ|SI|SU|SÜ)(?=[A-ZÇĞİÖŞÜ]{4,})/gi,
    // Accusative/possessive -NU/-NÜ etc. - require 4+ following chars
    /(NU|NÜ|NI|Nİ)(?=[A-ZÇĞİÖŞÜ]{4,})/gi,
    // Case suffixes (locative, ablative)
    /(NDAN|NDEN|NDA|NDE)(?=[A-ZÇĞİÖŞÜ])/gi,
    /(DAN|DEN|TAN|TEN)(?=[A-ZÇĞİÖŞÜ]{3,})/gi,
    // DA/DE/TA/TE - very short, require 5+ following chars to reduce false positives
    /(DA|DE|TA|TE)(?=[A-ZÇĞİÖŞÜ]{5,})/gi,
    // Relative / adjective
    /(DAKİ|DEKİ|TAKİ|TEKİ)(?=[A-ZÇĞİÖŞÜ])/gi,
    // Instrumental / comitative
    /(YLA|YLE|İLE)(?=[A-ZÇĞİÖŞÜ]{3,})/gi,
    // Dative
    /(INA|İNE|UNA|ÜNE)(?=[A-ZÇĞİÖŞÜ]{3,})/gi,
  ];

  for (const pattern of suffixBoundaries) {
    result = result.replace(pattern, '$& ');
  }

  // 4. Common conjunctions as boundary markers (case insensitive)
  const conjunctions = ['VE', 'VEYA', 'İLE', 'İÇİN', 'OLAN', 'OLARAK', 'GÖRE', 'DAİR', 'HAKKINDA', 'İLİŞKİN'];
  for (const c of conjunctions) {
    result = result.replace(new RegExp(`([a-zçğıöşüA-ZÇĞİÖŞÜ])(?=${c}(?=[A-ZÇĞİÖŞÜ]))`, 'gi'), '$1 ');
  }

  // 5. Remaining long sequences (>20 chars) - aggressive suffix split
  result = result.replace(/[a-zçğıöşüA-ZÇĞİÖŞÜ]{20,}/g, (match) => {
    return match
      .replace(/(ması|mesi|ları|leri|ının|inin|unun|ünün|sından|sinden|sinde|sine|sini|sinin)/gi, '$1 ')
      .replace(/(ndan|nden|nda|nde|dan|den|nin|nın|nun|nün)/gi, (m, _p1, offset, str) => {
        const after = str.substring(offset + m.length);
        return after.length >= 3 ? m + ' ' : m;
      });
  });

  // 6. Metadata label formatting
  result = result
    .replace(/(Kanun Numarası\s*:\s*\d+)\s*(?=[A-ZÇĞİÖŞÜ])/g, '$1 · ')
    .replace(/(Kabul Tarihi\s*:\s*[\d\/]+)\s*(?=[A-ZÇĞİÖŞÜ])/g, '$1 · ')
    .replace(/(Resmî Gazete\s*:\s*Tarih\s*:\s*[\d\/]+\s*Sayı\s*:\s*\d+)\s*(?=[A-ZÇĞİÖŞÜ])/g, '$1 · ');

  // 7. Clean up
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

export function SourceCitation({ sources, onLoadMore, hasMore = false, showLoadMore = false, onExcerptClick }: SourceCitationProps) {
  if (!sources || sources.length === 0) return null;

  const [showAllSources, setShowAllSources] = useState(false);
  const { t, i18n } = useTranslation();
  const initialSourcesToShow = 7;
  const sourcesToDisplay = showAllSources ? sources : sources.slice(0, initialSourcesToShow);

  // Tenant citation presentation settings (type labels, chip fields/labels)
  const citationSettings = useCitationSettings();

  // Shared, settings-driven type badge (ragSettings.sourceTypeLabels + generic fallbacks).
  // Labels are i18n keys (sourceTypes.*) resolved via t() so they localize (EN/AR/...).
  const getSourceTypeInfo = (sourceTable?: string, category?: string, metadata?: Source['metadata']) => {
    const info = getSharedSourceTypeInfo(sourceTable || category, metadata, citationSettings.sourceTypeLabels);
    return { label: t(info.labelKey), weight: info.weight, markerClass: baseMarkerClass(info.markerClass) };
  };

  // Generate a follow-up question from a source excerpt. Signal-word detection is
  // language-neutral (English primary, Turkish recognised); the question text itself
  // comes from i18n templates (followUps.*) so it localizes to en/ar/tr.
  const generateFollowUpQuestion = (excerpt: string, title: string): string => {
    const text = excerpt.toLowerCase();
    const hasPercentage = /\d+(?:\.\d+)?\s*%/.test(excerpt) || /\b(rate|per ?cent|yüzde)\b/.test(text);
    const hasCondition = /(condition|require|requirement|eligib|criteria|şart|koşul|gerek)/.test(text);
    const hasException = /(exempt|exception|exclu|waiver|muaf|istisna)/.test(text);
    const hasDeadline = /(deadline|due date|within\s+\d|period|süre|tarih)/.test(text);

    const sentences = excerpt.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 20);
    const stop = new Set([
      'this', 'that', 'with', 'from', 'which', 'under', 'shall', 'their', 'there', 'about',
      'the', 'and', 'for', 'are', 'was', 'were', 'have', 'has', 'been',
      'için', 'hakkında', 'ile', 'göre', 'kadar', 'üzerinde', 'olan', 'olarak'
    ]);

    const keyTerm = (): string => {
      const src = (sentences[0] || title || '').replace(/["'()]/g, ' ');
      const words = src
        .split(/\s+/)
        .map(w => w.replace(/[^\p{L}\p{N}-]/gu, ''))
        .filter(w => w.length > 4 && !stop.has(w.toLowerCase()));
      return words.slice(0, 3).join(' ');
    };

    if (hasPercentage) {
      const pm = excerpt.match(/\d+(?:\.\d+)?\s*%/);
      return pm
        ? t('followUps.rateConditions', { rate: pm[0].replace(/\s+/g, '') })
        : t('followUps.rateHow');
    }
    if (hasException) return t('followUps.exemptions');
    if (hasCondition) {
      const k = keyTerm();
      return k ? t('followUps.requirementsFor', { term: k }) : t('followUps.requirements');
    }
    if (hasDeadline) {
      const k = keyTerm();
      return k ? t('followUps.deadlinesFor', { term: k }) : t('followUps.deadlines');
    }

    const k = keyTerm();
    if (k) return t('followUps.explainMore', { term: k });

    const titleWord = (title || '').replace(/["'()]/g, ' ').split(/\s+/).find(w => w.length > 4);
    if (titleWord) return t('followUps.covers', { term: titleWord.replace(/[^\p{L}\p{N}-]/gu, '') });

    return t('followUps.moreDetails');
  };

  return (
    <div className="mt-4 pt-3 border-t border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium text-gray-400">
          {t('citationPanel.label', { count: sources.length })}
        </span>
      </div>
      <div className="space-y-1">
        {sourcesToDisplay.map((source, index) => {
          // Get display title - prioritize metadata fields
          const isUrl = (str: string) => str?.startsWith('http://') || str?.startsWith('https://');
          let displayTitle = '';

          // First try metadata fields (baslik, konusu)
          if (source.metadata?.baslik) {
            displayTitle = cleanCitationText(stripHtml(source.metadata.baslik), i18n.language);
          } else if (source.metadata?.konusu) {
            displayTitle = cleanCitationText(stripHtml(source.metadata.konusu), i18n.language);
          } else {
            // Fall back to citation/title
            const rawTitle = stripHtml(source.citation || source.title || '');

            if (isUrl(rawTitle)) {
              if (source.excerpt) {
                const cleanExcerpt = stripHtml(source.excerpt);
                const firstSentence = cleanExcerpt.split(/[.!?]/)[0]?.trim();
                displayTitle = firstSentence?.length > 10 ? firstSentence : cleanExcerpt.slice(0, 100);
              } else {
                displayTitle = getSourceTypeInfo(source.sourceTable, source.category, source.metadata).label;
              }
            } else {
              displayTitle = rawTitle
                .replace(/ - ID: \d+/g, '')
                .replace(/^sorucevap -\s*/i, '')
                .replace(/^ozelgeler -\s*/i, '')
                .replace(/^danıştay kararları -\s*/i, '')
                .replace(/^makaleler -\s*/i, '')
                .replace(/\s*\([^)]*\)$/, '')
                .trim();
            }
          }

          // Clean up title - fix concatenated text + general cleanup
          displayTitle = cleanCitationText(displayTitle, i18n.language)
            .replace(/Danıştay Kararları$/i, '')
            .replace(/^\s*[-•]\s*/, '')
            .trim() || 'Source';

          // Chunk-derived titles duplicate the excerpt head; in that case the
          // full excerpt wins and the truncated title line is dropped.
          const excerptText = source.excerpt
            ? cleanCitationText(stripHtml(source.excerpt), i18n.language)
            : '';
          const titleRedundant = isRedundantTitle(displayTitle, excerptText);

          return (
            <div
              key={source.id}
              id={`source-ref-${index + 1}`}
              className="group flex items-start gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
            >
              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Source Type and Number with Marker Style */}
                {(() => {
                  const typeInfo = getSourceTypeInfo(source.sourceTable, source.category, source.metadata);
                  // v12.27: Check if synthetic source - show full title with [REFERANS] badge
                  const isSynthetic = source._synthetic === true || (source.metadata as Record<string, unknown>)?.synthetic === true;

                  if (isSynthetic && source.title) {
                    // For synthetic sources, show the full title (includes law number + article + [REFERANS])
                    return (
                      <span className={`marker marker-purple text-[11px] font-semibold text-gray-900 dark:text-gray-100 inline-block mb-2`}>
                        <span className="text-[9px] opacity-70">[{index + 1}]</span> {stripHtml(source.title)}
                      </span>
                    );
                  }

                  return (
                    <span className={`marker ${typeInfo.markerClass} text-[11px] font-semibold text-gray-900 dark:text-gray-100 inline-block mb-2`}>
                      <span className="text-[9px] opacity-70">[{index + 1}]</span> {typeInfo.label}
                    </span>
                  );
                })()}

                {/* Title - Plain text, no link (hidden when it just repeats the excerpt) */}
                {!titleRedundant && (
                  <p className="text-sm text-gray-200 leading-snug line-clamp-2 mb-2">
                    {displayTitle}
                  </p>
                )}

                {/* Media thumbnail (cross-modal results). Renders only when the backend
                    supplies a servable thumbnail_url; safe no-op otherwise. */}
                {(source.metadata?.media_type === 'image' || source.metadata?.media_type === 'video')
                  && source.metadata?.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={String(source.metadata.thumbnail_url)}
                    alt={displayTitle}
                    className="w-full max-w-[180px] h-auto rounded-md border border-white/10 mb-2 object-cover"
                    loading="lazy"
                  />
                )}

                {/* Structured metadata chips (settings-driven priority fields) + official link */}
                {(() => {
                  const chips = buildCitationChips(
                    source,
                    i18n.language,
                    citationSettings.fieldLabels,
                    citationSettings.priorityFields
                  );
                  const officialUrl = citationSettings.showOfficialSourceLink
                    ? getOfficialSourceUrl(source) : undefined;
                  if (chips.length === 0 && !officialUrl) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {chips.map((chip) => (
                        <CitationChip
                          key={chip.key}
                          chip={chip}
                          className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-gray-400"
                        />
                      ))}
                      {officialUrl && (
                        <a
                          href={officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          {t('citations.officialSource')}
                        </a>
                      )}
                    </div>
                  );
                })()}

                {/* Excerpt - fixed display with follow-up button */}
                {(() => {
                  if (!source.excerpt) return null;
                  const excerpt = excerptText;
                  // Show when the title was dropped as redundant (the excerpt IS the
                  // content), or when title and excerpt genuinely differ.
                  if (excerpt && excerpt.length > 20 && (titleRedundant ||
                      (!displayTitle.includes(excerpt.slice(0, 50)) && !excerpt.includes(displayTitle.slice(0, 50))))) {
                    return (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-4">
                          {excerpt}
                        </p>
                        {onExcerptClick && (
                          <button
                            onClick={() => {
                              const question = generateFollowUpQuestion(
                                excerpt,
                                stripHtml(source.citation || source.title || 'This source')
                              );
                              onExcerptClick(question);
                            }}
                            className="flex items-center gap-1 mt-1.5 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                            title={t('citationPanel.askQuestionTooltip')}
                          >
                            <MessageSquareText className="w-3 h-3" />
                            {t('citationPanel.askQuestion')}
                          </button>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Keywords from metadata or category */}
                {(() => {
                  const keywords: string[] = [];

                  // Extract keywords from metadata.keywords field
                  if (source.metadata?.keywords) {
                    if (Array.isArray(source.metadata.keywords)) {
                      keywords.push(...source.metadata.keywords);
                    } else if (typeof source.metadata.keywords === 'string') {
                      keywords.push(...source.metadata.keywords.split(/[,•]/));
                    }
                  }

                  // Add category as keyword if exists
                  if (source.category && !keywords.includes(source.category)) {
                    keywords.push(source.category);
                  }

                  // Add source type as keyword
                  const typeInfo = getSourceTypeInfo(source.sourceTable, source.category, source.metadata);
                  if (typeInfo.label && !keywords.includes(typeInfo.label)) {
                    keywords.unshift(typeInfo.label);
                  }

                  const cleanedKeywords = keywords
                    .map(k => String(k).trim())
                    .filter(k => k.length > 0 && k.length < 30)
                    .slice(0, 5); // Max 5 keywords

                  if (cleanedKeywords.length === 0) return null;

                  return (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {cleanedKeywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          className="marker marker-cyan text-[10px] font-medium px-2 py-1 inline-block"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {sources.length > initialSourcesToShow && (
        <div className="mt-3 pt-2 border-t border-white/5">
          {!showAllSources ? (
            <button
              onClick={() => setShowAllSources(true)}
              className="flex items-center gap-2 mx-auto text-xs px-3 py-1.5 text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              {t('citationPanel.moreSources', { count: sources.length - initialSourcesToShow })}
            </button>
          ) : (
            <button
              onClick={() => setShowAllSources(false)}
              className="flex items-center gap-2 mx-auto text-xs px-3 py-1.5 text-gray-400 hover:text-gray-300 transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
              {t('citationPanel.showLess')}
            </button>
          )}
        </div>
      )}

      {/* External Load More Button */}
      {showLoadMore && hasMore && onLoadMore && (
        <div className="mt-3 pt-2 border-t border-white/5">
          <button
            onClick={onLoadMore}
            className="flex items-center gap-2 mx-auto text-xs px-3 py-1.5 text-purple-400 hover:text-purple-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            {t('citationPanel.loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
