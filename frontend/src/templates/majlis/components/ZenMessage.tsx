'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Pause, Loader2, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import { SchemaRenderer } from './SchemaRenderer';
import { TranslationBadge } from './TranslationBadge';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import { prepareMarkdown, cleanLLMResponse, cleanCitationTitle, detectRtl } from '@/lib/chat-markdown';
import { getSourceTypeInfo, buildCitationChips, getOfficialSourceUrl, isRedundantTitle } from '@/lib/source-presentation';
import { useCitationSettings } from '@/lib/citation-settings';
import { getQualityLevel } from '@/components/chat/quality-badge';
import type { ZenMessageProps, ZenSource } from '../types';

// Default stop words - can be overridden via settings
const DEFAULT_STOP_WORDS = [
  // Turkish
  've', 'veya', 'ile', 'için', 'göre', 'bir', 'bu', 'şu', 'da', 'de', 'ki',
  'mi', 'mı', 'mu', 'mü', 'ise', 'gibi', 'kadar', 'daha', 'çok', 'az',
  'nasıl', 'neden', 'hangi', 'nerede', 'olarak', 'olan', 'olup', 'olduğu',
  'olabilir', 'olur', 'ancak', 'fakat', 'ama', 'lakin', 'hakkında',
  'üzerine', 'sonra', 'önce', 'arasında', 'dolayı', 'nedeniyle',
  // English
  'the', 'and', 'or', 'but', 'for', 'with', 'from', 'this', 'that', 'what',
  'how', 'why', 'when', 'where', 'which', 'who', 'have', 'has', 'had',
  'been', 'being', 'will', 'would', 'could', 'should', 'about', 'into'
];

/**
 * Extract keywords from user query for highlighting
 * @param query - User's search query
 * @param stopWords - Optional custom stop words list
 * @param minLength - Minimum word length (default: 3 for Turkish abbreviations like KDV)
 * @param maxKeywords - Maximum keywords to extract (default: 8)
 */
function extractKeywords(
  query: string,
  stopWords: string[] = DEFAULT_STOP_WORDS,
  minLength: number = 3,  // Reduced for Turkish (KDV, etc.)
  maxKeywords: number = 8  // Increased for better coverage
): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length >= minLength && !stopWords.includes(word))
    .map(word => word.replace(/[.,;:!?'"()]/g, ''))
    .filter(word => word.length >= minLength)
    .slice(0, maxKeywords);
}

/**
 * Single quiet keyword-highlight style: a dotted accent underline instead of the
 * old multicolor marker boxes. Keeps the text tone untouched.
 */
const KEYWORD_HIGHLIGHT_CLASS =
  'underline decoration-dotted decoration-[var(--majlis-accent)] underline-offset-4';

function highlightKeywordsInText(text: string, keywords: string[]): React.ReactNode[] {
  if (!keywords.length) return [text];

  // Sort keywords by length (longest first) to avoid partial matches
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);

  // Create regex pattern with word boundaries to avoid splitting words
  // Use Unicode-aware word boundaries that work with any Latin-based language
  const turkishWordBoundary = '(?<![a-zA-Z\\u00C0-\\u024F0-9])';
  const turkishWordBoundaryEnd = '(?![a-zA-Z\\u00C0-\\u024F0-9])';

  const pattern = new RegExp(
    `(${sortedKeywords.map(k =>
      turkishWordBoundary + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + turkishWordBoundaryEnd
    ).join('|')})`,
    'gi'
  );

  const parts = text.split(pattern);

  return parts.map((part, idx) => {
    const matchedKeyword = sortedKeywords.find(k => k.toLowerCase() === part.toLowerCase());
    if (matchedKeyword) {
      return (
        <span key={idx} className={KEYWORD_HIGHLIGHT_CLASS}>
          {part}
        </span>
      );
    }
    return part;
  });
}

// Markdown/citation-title cleanup helpers live in the shared @/lib/chat-markdown module
// (prepareMarkdown, cleanLLMResponse, cleanCitationTitle) - no local duplicates here.

/** Metadata fields that carry an explicit 4-digit year. */
const YEAR_FIELDS = ['law_year', 'year', 'yil'];
/** Metadata fields that carry a date a year can be extracted from. */
const DATE_FIELDS = ['issue_date', 'date', 'tarih'];

/**
 * Derive a 4-digit display year for the docket ledger's dotted-leader slot.
 * Prefers explicit year fields, then a year embedded in a date field. Returns
 * '' when the metadata has no usable year — the row then omits the leader and
 * year entirely (per the approved design).
 */
function deriveSourceYear(metadata: ZenSource['metadata']): string {
  const m = (metadata || {}) as Record<string, unknown>;
  for (const field of YEAR_FIELDS) {
    const value = String(m[field] ?? '').trim();
    if (/^\d{4}$/.test(value)) return value;
  }
  for (const field of DATE_FIELDS) {
    const match = String(m[field] ?? '').match(/\b(?:19|20)\d{2}\b/);
    if (match) return match[0];
  }
  return '';
}

/**
 * Majlis Message Component
 * Ink-and-brass typographic rendering: assistant messages are a plain reading
 * column (no card/bubble/avatar) with brass numerals and rules; user messages
 * a right-aligned serif block under a small-caps brass label.
 */
export const ZenMessage: React.FC<ZenMessageProps> = ({
  message,
  onSourceClick,
  lastUserQuery = '',
  voiceOutputEnabled = false,
  enableSourceClick = true,  // From schema, default true
  enableKeywordHighlighting = true,  // From schema, default true
  responseSchemaId,  // Response format schema ID
  keywords: backendKeywords = [],  // Backend-extracted keywords for schema sections
  dayanaklar: backendDayanaklar = [],  // Backend-extracted legal references for schema sections
  minSourcesToShow = 5,  // From RAG settings, default 5
  translation,  // Translation state for this message
  onToggleTranslation,  // Callback to toggle translation
  onQuestionClick,  // Fills the chat input with a follow-up question
}) => {
  const isUser = message.role === 'user';
  const { t, i18n } = useTranslation();
  const [showAllSources, setShowAllSources] = useState(false);
  const [copied, setCopied] = useState(false);

  // Tenant citation presentation settings (chips, type labels, follow-up gating)
  const citationSettings = useCitationSettings();

  // Answer language: backend-reported when available; Arabic-script heuristic for legacy messages
  const contentLang = message.language;
  // Language used for citation-title cleanup and chip label resolution
  const chipLang = contentLang || i18n.language;

  // Determine content to display (original or translated)
  const displayContent = translation?.isShowingTranslation
    ? translation.translatedContent
    : message.content;

  // Base direction follows the text ACTUALLY DISPLAYED: when a translation is
  // shown, detect direction from the translated string; otherwise use the
  // backend-reported answer language (script heuristic for legacy messages).
  const isRtl = translation?.isShowingTranslation
    ? detectRtl(displayContent || '')
    : contentLang
      ? contentLang.toLowerCase().startsWith('ar')
      : (!isUser && detectRtl(message.content));

  // Follow-up questions are never translated, so their direction follows the
  // ORIGINAL answer language/content — not the translated display text.
  const isFollowUpsRtl = contentLang
    ? contentLang.toLowerCase().startsWith('ar')
    : (!isUser && detectRtl(message.content));

  // Extract keywords from last user query for highlighting (only if enabled)
  const highlightKeywords = React.useMemo(() => {
    if (!enableKeywordHighlighting || !lastUserQuery || isUser) return [];
    return extractKeywords(lastUserQuery);
  }, [lastUserQuery, isUser, enableKeywordHighlighting]);

  // Use schema-based rendering when schemaId is provided
  const useSchemaRenderer = Boolean(responseSchemaId);

  // Audio player hook for TTS
  const { isPlaying, isLoading: isTTSLoading, play, pause } = useAudioPlayer({
    onError: (error) => {
      console.error('[ZenMessage] TTS error:', error);
    }
  });

  // Handle TTS play/pause
  const handleTTSToggle = () => {
    if (isPlaying) {
      pause();
    } else {
      // Use displayContent (translated if available, otherwise original)
      const contentToRead = displayContent || message.content;

      // Extract plain text from markdown content
      const plainText = contentToRead
        .replace(/#{1,6}\s/g, '') // Remove headers
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
        .replace(/\*([^*]+)\*/g, '$1') // Remove italic
        .replace(/`([^`]+)`/g, '$1') // Remove code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
        .replace(/^\s*[-*]\s/gm, '') // Remove list markers
        .replace(/^\s*\d+\.\s/gm, '') // Remove numbered list markers
        .trim();

      play(plainText);
    }
  };

  // Copy the visible answer text (translated when shown) to the clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent || message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[ZenMessage] Copy failed:', error);
    }
  };

  // Dedup duplicate laws in the citation list. The same law can arrive twice — e.g. a clean
  // uae_legislation ingest AND an uploaded-PDF document_embeddings copy — and used to render
  // as two cards. We collapse them into one group, preferring the clean uae_legislation copy,
  // but keep every original source index so inline [n] refs in the answer still resolve (the
  // backend numbered them against the original, un-deduped order).
  const sourceGroups = React.useMemo(() => {
    const all = message.sources || [];
    const keyOf = (s: ZenSource): string => {
      const m = (s.metadata || {}) as Record<string, unknown>;
      let name = String(
        m.source_name || m.law_name || m.law || m.title || m.baslik
          || (s as { title?: string }).title || ''
      ).toLowerCase()
        .replace(/\.pdf$/i, '')
        .replace(/\s*[-–]\s*id:\s*\d+.*$/i, '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name && typeof m.url === 'string') {
        try { name = new URL(m.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      }
      if (!name) {
        name = String(s.content || s.excerpt || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
      }
      return name;
    };
    const isLegis = (s: ZenSource) => String(s.sourceTable || '').toLowerCase().includes('legislation');
    const scoreOf = (s: ZenSource) => (s.score ?? (s as { relevanceScore?: number }).relevanceScore ?? 0);

    const groups: { primary: ZenSource; primaryIndex: number; indices: number[] }[] = [];
    const byKey = new Map<string, number>();
    all.forEach((s, i) => {
      const k = keyOf(s);
      const gi = k ? byKey.get(k) : undefined;
      if (!k || gi === undefined) {
        if (k) byKey.set(k, groups.length);
        groups.push({ primary: s, primaryIndex: i, indices: [i] });
        return;
      }
      const g = groups[gi];
      g.indices.push(i);
      // Prefer uae_legislation; then higher score; otherwise keep the earliest (already primary).
      const better = (isLegis(s) && !isLegis(g.primary))
        || (isLegis(s) === isLegis(g.primary) && scoreOf(s) > scoreOf(g.primary));
      if (better) { g.primary = s; g.primaryIndex = i; }
    });
    return groups;
  }, [message.sources]);

  // Map every ORIGINAL source index to its group's ordinal display number
  // (group position + 1, in first-occurrence order). Dedup can merge adjacent
  // duplicates, which would leave gaps if rows showed original indices; this
  // map guarantees a strict 1..n numbering shared by the ledger rows and the
  // inline [n] superscripts. Scroll anchors stay keyed by ORIGINAL indices.
  const citationDisplayMap = React.useMemo(() => {
    const map = new Map<number, number>();
    sourceGroups.forEach((group, k) => {
      group.indices.forEach((i) => map.set(i, k + 1));
    });
    return map;
  }, [sourceGroups]);

  // Collapsed source count: the minimal skin shows a short list first (design),
  // capped by the tenant's minSourcesToShow so a lower setting still wins.
  const collapsedCount = Math.min(minSourcesToShow, 3);
  const visibleGroups = showAllSources
    ? sourceGroups
    : sourceGroups.slice(0, collapsedCount);

  // Scroll to a citation row and flash it with a brief accent-tinted background.
  // If the target sits in the collapsed tail of the source list, expand first.
  const flashCitation = (anchor: HTMLElement) => {
    const row = (anchor.closest('.majlis-source-item') as HTMLElement) || anchor;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('majlis-cite-flash');
    void row.offsetWidth; // restart the CSS animation
    row.classList.add('majlis-cite-flash');
    window.setTimeout(() => row.classList.remove('majlis-cite-flash'), 1700);
  };

  const scrollToCitation = (citationNum: string) => {
    const id = `citation-${message.id}-${citationNum}`;
    const el = document.getElementById(id);
    if (el) {
      flashCitation(el);
      return;
    }
    setShowAllSources(true);
    window.setTimeout(() => {
      const later = document.getElementById(id);
      if (later) flashCitation(later);
    }, 60);
  };

  // Inline [n] reference: superscript in the accent color, underline on hover only.
  // <bdi dir="ltr"> keeps the [n] marker from mirroring inside RTL text.
  // When clickable, the marker gets button semantics so keyboard users can
  // reach it (Tab) and activate it (Enter/Space).
  // Displays the group's ORDINAL number (citationDisplayMap) so inline refs
  // match the renumbered ledger; scrolling still targets the ORIGINAL index
  // (hidden alias anchors make merged duplicates land on the right row).
  const renderCitationSup = (citationNum: string, key: string) => {
    const displayNum = citationDisplayMap.get(parseInt(citationNum, 10) - 1) ?? citationNum;
    return (
      <bdi key={key} dir="ltr">
        <sup
          className={`majlis-cite no-underline ${
            enableSourceClick ? 'cursor-pointer hover:underline underline-offset-2' : ''
          }`}
          {...(enableSourceClick && {
            role: 'button',
            tabIndex: 0,
            onClick: (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              scrollToCitation(citationNum);
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                scrollToCitation(citationNum);
              }
            }
          })}
        >
          [{displayNum}]
        </sup>
      </bdi>
    );
  };

  // Shared inline-children processing for markdown renderers: converts [n]
  // citation markers into clickable superscripts and applies keyword
  // highlighting to plain string children. Used by both the `p` and `li`
  // renderers — tight list items get bare string children (no wrapping <p>),
  // so they need the same treatment.
  const processInlineChildren = (child: React.ReactNode): React.ReactNode => {
    // Handle React elements with children (like <strong>, <em>, etc.)
    if (React.isValidElement(child) && child.props?.children) {
      const processedChildren = processInlineChildren(child.props.children);
      return React.cloneElement(child, { ...child.props }, processedChildren);
    }

    if (typeof child === 'string') {
      // Handle multiple citation formats:
      // - [1], [2], [3] - simple format
      // - [Kaynak 1], [Kaynak 2] - Turkish format from backend
      // - [Source 1], [Source 2] - English format from backend
      const citationRegex = /(\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])/gi;
      const parts = child.split(citationRegex);
      const processed = parts.map((part, idx) => {
        // Extract citation number from any format
        const simpleMatch = part.match(/^\[(\d+)\]$/);
        const kaynakMatch = part.match(/^\[Kaynak\s*(\d+)\]$/i);
        const sourceMatch = part.match(/^\[Source\s*(\d+)\]$/i);
        const citationNum = simpleMatch?.[1] || kaynakMatch?.[1] || sourceMatch?.[1];

        if (citationNum) {
          return renderCitationSup(citationNum, `cite-${idx}`);
        }
        // Apply keyword highlighting to non-citation text
        if (highlightKeywords.length > 0) {
          return <React.Fragment key={idx}>{highlightKeywordsInText(part, highlightKeywords)}</React.Fragment>;
        }
        return part;
      });
      return <>{processed}</>;
    }
    if (Array.isArray(child)) {
      return child.map((c, i) => <React.Fragment key={i}>{processInlineChildren(c)}</React.Fragment>);
    }
    return child;
  };

  // Answer quality level (evidence gate when available; count fallback for legacy messages)
  const qualityLevel = getQualityLevel(message.evidence, message.sources?.length || 0);

  // Follow-up click: fill the chat input (onQuestionClick, or the app-wide event fallback)
  const handleFollowUpClick = (question: string) => {
    if (onQuestionClick) {
      onQuestionClick(question);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('addToInput', { detail: question }));
    }
  };

  // ---------- User message: small-caps brass label above a right-aligned serif question, no bubble ----------
  if (isUser) {
    const askedAt = new Date(message.timestamp);
    const hasTime = !Number.isNaN(askedAt.getTime());
    return (
      <div className="majlis-msg-in flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1.5 text-end">
          {/* Label: existing i18n question label combined with the ask time
              ("Your Question — 14:31"); small-caps brass via majlis.css */}
          <span className="majlis-user-label">
            {t('query.yourQuestion')}
            {hasTime && (
              <>
                {' — '}
                <time dateTime={askedAt.toISOString()}>
                  {askedAt.toLocaleTimeString(i18n.language || undefined, { hour: '2-digit', minute: '2-digit' })}
                </time>
              </>
            )}
          </span>
          {/* dir="auto": an RTL question typed in an LTR UI (or vice versa)
              gets the correct base direction from its own first strong char */}
          <span className="majlis-user-q" dir="auto">{message.content}</span>
        </div>
      </div>
    );
  }

  // ---------- Assistant message: plain typographic block ----------
  return (
    <div className="majlis-msg-in group w-full min-w-0">
      {message.isStreaming ? (
        <ZenTypingIndicator />
      ) : (
        <>
          {/* Answer body */}
          {useSchemaRenderer ? (
            <div dir={isRtl ? 'rtl' : 'ltr'}>
              <SchemaRenderer
                content={cleanLLMResponse(displayContent)}
                schemaId={responseSchemaId}
                keywords={backendKeywords}
                dayanaklar={backendDayanaklar}
                className="majlis-schema-response"
                messageId={message.id}
                citationDisplayMap={citationDisplayMap}
              />
            </div>
          ) : (
            <div className="majlis-prose max-w-none" dir={isRtl ? 'rtl' : 'ltr'}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Display headings (serif sizes from .majlis-prose) followed by a
                  // short decorative brass rule (mock .h-rule; aria-hidden, no semantics)
                  h1: ({ children }) => (
                    <>
                      <h1>{children}</h1>
                      <div className="majlis-h-rule" aria-hidden="true" />
                    </>
                  ),
                  h2: ({ children }) => (
                    <>
                      <h2>{children}</h2>
                      <div className="majlis-h-rule" aria-hidden="true" />
                    </>
                  ),
                  h3: ({ children }) => <h3>{children}</h3>,
                  // Paragraphs with keyword highlighting and citation anchors
                  // (shared processInlineChildren: [1], [Kaynak 1], [Source 1] formats)
                  p: ({ children }) => (
                    <p className="my-3.5 first:mt-0 last:mb-0">
                      {processInlineChildren(children)}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[var(--majlis-ink)]">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic">
                      {children}
                    </em>
                  ),
                  // Lists: unordered keeps brass disc markers; ordered renders bare —
                  // majlis.css replaces browser numbering with mono decimal-leading-zero
                  // brass numerals ("01", "02") via a CSS counter
                  ul: ({ children }) => (
                    <ul className="my-3 list-disc list-outside ps-5 space-y-2.5">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => <ol>{children}</ol>,
                  // List items run the same citation/keyword processing as
                  // paragraphs: tight lists give <li> bare string children.
                  li: ({ children }) => (
                    <li className="leading-relaxed">
                      {processInlineChildren(children)}
                    </li>
                  ),
                  code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="rounded-sm border border-[var(--majlis-hairline)] bg-[var(--majlis-surface)] px-1.5 py-0.5 font-mono text-[13px]">
                        {children}
                      </code>
                    ) : (
                      <code className="my-3 block overflow-x-auto rounded-sm border border-[var(--majlis-hairline)] bg-[var(--majlis-surface)] p-3 font-mono text-[13px]">
                        {children}
                      </code>
                    );
                  },
                  // Blockquote: hairline start border + muted italic (also styles the
                  // PDF relevance notice the backend prepends to PDF answers).
                  blockquote: ({ children }) => (
                    <blockquote className="my-3 border-s-2 border-[var(--majlis-hairline)] ps-4 italic text-[var(--majlis-muted)]">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--majlis-accent)] underline-offset-2 hover:underline"
                    >
                      {children}
                    </a>
                  ),
                  table: ({ children }) => (
                    <div className="my-3 overflow-x-auto">
                      <table className="min-w-full border-collapse text-sm">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border-b border-[var(--majlis-hairline)] px-3 py-2 text-start text-xs font-semibold text-[var(--majlis-ink)]">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-[var(--majlis-hairline)] px-3 py-2">
                      {children}
                    </td>
                  ),
                }}
              >
                {prepareMarkdown(displayContent, { lang: contentLang })}
              </ReactMarkdown>
            </div>
          )}

          {/* Meta row: response time, quality (small-caps muted, quality in brass-toned
              colors), plus hover-revealed ghost actions (muted, hover brass).
              Items are separated by plain gaps (gap-x-3), no separators. */}
          <div className="majlis-meta mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {message.responseTime !== undefined && (
              <span>{(message.responseTime / 1000).toFixed(1)}s</span>
            )}
            {(message.evidence || message.sources) && (
              <>
                <span>
                  {t('chatMessage.quality.label')}:{' '}
                  <span className={`majlis-q-${qualityLevel}`}>
                    {t(`chatMessage.quality.${qualityLevel}`)}
                  </span>
                </span>
              </>
            )}

            <span className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {/* Copy answer */}
              {message.content && (
                <button
                  onClick={handleCopy}
                  className="rounded-sm p-1.5 text-[var(--majlis-muted)] transition-colors hover:text-[var(--majlis-accent)]"
                  title={copied ? t('chatMessage.copied') : t('chatMessage.copy')}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}

              {/* TTS - only when voice output is enabled in settings */}
              {voiceOutputEnabled && message.content && (
                <button
                  onClick={handleTTSToggle}
                  disabled={isTTSLoading}
                  className={`rounded-sm p-1.5 transition-colors ${
                    isPlaying
                      ? 'text-[var(--majlis-accent)]'
                      : isTTSLoading
                        ? 'cursor-wait text-[var(--majlis-muted)]'
                        : 'text-[var(--majlis-muted)] hover:text-[var(--majlis-accent)]'
                  }`}
                  title={isPlaying ? t('chatMessage.tts.stop') : isTTSLoading ? t('chatMessage.tts.loading') : t('chatMessage.tts.listen')}
                >
                  {isTTSLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </span>

            {/* Translation toggle - stays visible (it indicates state) */}
            {translation && onToggleTranslation && (
              <TranslationBadge
                targetLanguage={translation.targetLanguage}
                isShowingTranslation={translation.isShowingTranslation}
                onToggle={onToggleTranslation}
              />
            )}
          </div>

          {/* Sources fetch failed warning (streaming mode) */}
          {message.sourcesFetchFailed && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--majlis-warn)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t('chatMessage.sourcesLoadFailed')}
            </p>
          )}

          {/* Sources: docket ledger — small-caps label over baseline-aligned rows with
              mono leading-zero numbers and dotted leaders out to the year */}
          {message.sources && message.sources.length > 0 && (
            <div className="majlis-sources">
              <div className="majlis-src-label">
                {t('citations.sourcesHeading', { count: sourceGroups.length })}
              </div>
              <div>
                {visibleGroups?.map((group, groupIdx) => {
                  // The primary source of this deduped group; `idx` is its ORIGINAL index in
                  // message.sources so the anchor still matches the backend's inline [n] refs.
                  const source: ZenSource = group.primary;
                  const idx = group.primaryIndex;
                  const aliasIndices = group.indices.filter((n) => n !== idx);
                  // Shared, settings-driven presentation: type label (ragSettings.sourceTypeLabels),
                  // metadata chips (ragSettings.citationPriorityFields/fieldLabels) and official link.
                  const typeInfo = getSourceTypeInfo(source.sourceTable, source.metadata, citationSettings.sourceTypeLabels);
                  const chips = buildCitationChips(source, chipLang, citationSettings.fieldLabels, citationSettings.priorityFields);
                  const officialUrl = citationSettings.showOfficialSourceLink ? getOfficialSourceUrl(source) : undefined;
                  const meta = source.metadata as any;

                  // Build a single clean description paragraph (200-300 chars)
                  const getDescription = () => {
                    const m = source.metadata as any;
                    // Start with konu/baslik if available for context
                    const konu = cleanCitationTitle(String(m?.konu || m?.baslik || m?.konusu || ''), { lang: chipLang })
                      .replace(/^(KONU|İLGİ|SORU|CEVAP|Dilekçenizde|konusu|BAŞLIK)[:.\s]*/gi, '')
                      .trim();

                    // Get content for the body
                    const raw = source.summary || source.excerpt || source.content || '';
                    let cleaned = cleanCitationTitle(raw, { lang: chipLang })
                      .replace(/^(KONU|İLGİ|SORU|CEVAP|Dilekçenizde|konusu|VERGİ\s*Sİ\s*KANUNU[^.]*\.)[:.\s]*/gi, '')
                      .replace(/\.{2,}/g, '.')
                      .trim();
                    // Chunk boundaries can cut mid-word/mid-sentence (e.g. "iability Company ..."
                    // from "Liability"). If the excerpt starts with a lowercase Latin fragment,
                    // jump to the first real sentence start nearby; failing that, drop the short
                    // leading partial word. (Arabic/other scripts have no case, so they're left
                    // as-is; the chunker fix prevents mid-word starts for newly-embedded content.)
                    if (/^[a-z]/.test(cleaned)) {
                      const firstSentence = cleaned.search(/[.?!؟]\s+\S/);
                      if (firstSentence > 0 && firstSentence <= 120) {
                        cleaned = cleaned.slice(firstSentence + 1).trimStart();
                      } else {
                        const sp = cleaned.indexOf(' ');
                        if (sp > 0 && sp <= 16) cleaned = cleaned.slice(sp + 1).trimStart();
                      }
                    }

                    // If konu is good and different from content, prefix it
                    let combined = '';
                    if (konu.length >= 15 && !cleaned.toLowerCase().startsWith(konu.toLowerCase().substring(0, 20))) {
                      combined = konu + '. ' + cleaned;
                    } else if (konu.length >= 10) {
                      combined = konu + '. ' + cleaned;
                    } else {
                      combined = cleaned;
                    }

                    // End on a full sentence. Terminators: . ? ! and the Arabic question mark ؟.
                    const lastSentenceEnd = (str: string): number => {
                      for (let k = str.length - 1; k >= 0; k--) {
                        const c = str[k];
                        if (c === '.' || c === '?' || c === '!' || c === '؟') return k;
                      }
                      return -1;
                    };
                    // Truncate to ~300 chars, ending on a full sentence when one is close enough.
                    if (combined.length > 300) {
                      const truncated = combined.substring(0, 300);
                      const end = lastSentenceEnd(truncated);
                      if (end > 150) {
                        return truncated.substring(0, end + 1);
                      }
                      return truncated.trim() + '…';
                    }
                    // Not truncated but ends mid-sentence (a chunk cut): trim back to the last full
                    // sentence so the card never shows a dangling half-sentence, as long as that
                    // still keeps a meaningful amount of text.
                    const endIdx = lastSentenceEnd(combined);
                    if (endIdx !== -1 && endIdx < combined.length - 1 && endIdx > combined.length * 0.45) {
                      return combined.substring(0, endIdx + 1);
                    }
                    return combined;
                  };

                  const description = getDescription();

                  // Source name / origin — show WHERE the citation came from (law name,
                  // document title, or the domain it was crawled from), not just a type badge.
                  const sourceName = cleanCitationTitle(String(
                    meta?.source_name || meta?.law_title || meta?.law_name || meta?.title || meta?.baslik
                      || (source as any).title || (source as any).citation || ''
                  ), { lang: chipLang }).replace(/\.pdf$/i, '').replace(/\s*[-–]\s*ID:\s*\d+.*$/i, '').replace(/_/g, ' ').trim();
                  // Chunk-derived titles are just the head of the description, and
                  // the law name may already sit in a chip — showing either twice
                  // reads as a repeat, so drop the redundant title line.
                  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
                  const inChips = chips.some((c) => norm(String(c.value)) === norm(sourceName));
                  let originLabel = (inChips || isRedundantTitle(sourceName, description)) ? '' : sourceName;
                  if (!originLabel && !inChips && meta?.url) {
                    try { originLabel = new URL(meta.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
                  }

                  // Line 1 title: origin when we have one, else the type label.
                  const typeLabel = t(typeInfo.labelKey);
                  const titleText = originLabel && originLabel.length > 2 ? originLabel : typeLabel;

                  // Year for the dotted-leader slot at the row's end; rows without a
                  // derivable year omit the leader + year entirely.
                  const year = deriveSourceYear(source.metadata);
                  // Drop year/date chips that would repeat the year already shown at
                  // the leader's end (e.g. a bare "2022" chip or its source date).
                  const metaChips = year
                    ? chips.filter((chip) =>
                        !(YEAR_FIELDS.includes(chip.key) || DATE_FIELDS.includes(chip.key))
                        || !String(chip.value).includes(year))
                    : chips;

                  // Line 2 meta: chip label+value pairs joined with em-dashes, small-caps
                  // muted with the leading (article) segment in brass; append the type
                  // label unless it already serves as the title.
                  const metaSegments = metaChips.map((chip) => {
                    const label = chip.label ?? t(chip.labelKey, { defaultValue: '' });
                    return label ? `${label} ${chip.value}` : chip.value;
                  });
                  if (titleText !== typeLabel) metaSegments.push(typeLabel);

                  return (
                    <div
                      key={idx}
                      id={`citation-${message.id}-${idx + 1}`}
                      className={`majlis-source-item majlis-src scroll-mt-20 ${
                        enableSourceClick ? 'majlis-src-clickable' : ''
                      }`}
                      {...(enableSourceClick && {
                        // Button semantics so keyboard users can reach and open the row
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => onSourceClick(source, message.sources || []),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSourceClick(source, message.sources || []);
                          }
                        }
                      })}
                    >
                      {/* Hidden anchors for duplicate laws merged into this row, so inline [n]
                          references to those merged sources still scroll here. */}
                      {aliasIndices.map((n) => (
                        <span key={`alias-${n}`} id={`citation-${message.id}-${n + 1}`} aria-hidden className="hidden" />
                      ))}

                      {/* Docket number: the group's ORDINAL position (k+1), zero-padded
                          ("01", "02"), keeps the ledger a strict 1..n sequence even when
                          merged duplicates leave gaps in the original indices; inline [n]
                          superscripts show the same ordinal (unpadded) via
                          citationDisplayMap. (visibleGroups is a head slice of
                          sourceGroups, so groupIdx IS the group's position.) */}
                      <span className="majlis-src-n">{String(groupIdx + 1).padStart(2, '0')}</span>

                      <div className="min-w-0 flex-1">
                        {/* Title line: serif title (row hover turns it brass), dotted
                            leader filling out to a right-aligned mono year */}
                        <div className="majlis-src-line">
                          <span className="majlis-src-title" title={titleText}>
                            {titleText}
                          </span>
                          {year && (
                            <>
                              <span className="majlis-src-leader" aria-hidden />
                              <span className="majlis-src-year">{year}</span>
                            </>
                          )}
                        </div>

                        {/* Meta line: small-caps chip data, leading (article) segment brass */}
                        {metaSegments.length > 0 && (
                          <div className="majlis-src-meta">
                            {metaSegments.map((segment, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span aria-hidden> — </span>}
                                {i === 0 ? (
                                  <b><bdi dir="auto">{segment}</bdi></b>
                                ) : (
                                  <bdi dir="auto">{segment}</bdi>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Excerpt: muted, clamped to two lines (not italic) */}
                        {description && description.length > 15 && (
                          <p className="majlis-src-ex">{description}</p>
                        )}

                        {/* Official source link (from corpus metadata.url, settings-gated) */}
                        {officialUrl && (
                          <a
                            href={officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--majlis-accent)] hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('citations.officialSource')}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {sourceGroups.length > collapsedCount && (
                <button
                  onClick={() => setShowAllSources(!showAllSources)}
                  className="majlis-src-toggle"
                >
                  {showAllSources
                    ? t('citationPanel.showLess')
                    : t('citations.showAll', { count: sourceGroups.length })}
                </button>
              )}
            </div>
          )}

          {/* Follow-up questions (backend-generated; gated by chatbot.enableFollowUps):
              small-caps label over stacked serif rows with a leading, direction-aware
              brass arrow (the container's own dir attribute keys the arrow in CSS) */}
          {citationSettings.enableFollowUps && message.followUpQuestions && message.followUpQuestions.length > 0 && (
            <div dir={isFollowUpsRtl ? 'rtl' : 'ltr'} className="majlis-fups">
              <div className="majlis-fups-label">{t('followUps.title')}</div>
              {message.followUpQuestions.map((question, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleFollowUpClick(question)}
                  className="majlis-fup"
                >
                  <span className="min-w-0">{question}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ZenMessage;
