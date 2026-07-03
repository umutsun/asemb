'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Pause, Loader2, ExternalLink, Copy, Check, AlertTriangle, Shield, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import { SchemaRenderer } from './SchemaRenderer';
import { TranslationBadge } from './TranslationBadge';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import { prepareMarkdown, cleanLLMResponse, cleanCitationTitle, detectRtl } from '@/lib/chat-markdown';
import { getSourceTypeInfo, buildCitationChips, getOfficialSourceUrl, isRedundantTitle, cleanExcerpt } from '@/lib/source-presentation';
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
  'underline decoration-dotted decoration-[var(--atlas-accent)] underline-offset-4';

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

/**
 * True when a candidate source-name reads like a GENUINE identifier (a real law name
 * or document title) rather than a raw chunk fragment. Web / government-service cards
 * often carry a mid-sentence chunk head as their "title" (e.g. "clude a copy of his
 * passport…" or "natural or legal persons…"), which duplicates the excerpt below —
 * those must be suppressed. A genuine title either:
 *   - begins with a legal document keyword (Law / Federal / Cabinet / Decree / Article), or
 *   - is Title Case (most significant words capitalized, none starting lowercase).
 * Anything that starts lowercase, starts mid-word, or is a lowercase sentence fragment
 * is rejected. Non-Latin (e.g. Arabic) names have no case, so they are accepted as-is
 * — the redundant-with-excerpt / in-chips checks still filter fragments there.
 */
function isGenuineTitle(name: string): boolean {
  const s = (name || '').trim();
  if (!s) return false;
  // Legal document identifiers are always genuine.
  if (/^(Law|Federal|Cabinet|Decree|Article)\b/.test(s)) return true;
  // No Latin letters at all (e.g. Arabic script): accept — case can't gate it.
  if (!/[A-Za-z]/.test(s)) return true;
  // Starts lowercase / mid-word: a sentence fragment, not a title.
  if (/^[a-z]/.test(s)) return false;
  // Title Case check: of the alphabetic words, none may start lowercase (allowing
  // short connective words like "of", "the", "and" to stay lowercase mid-title).
  const CONNECTIVES = new Set(['of', 'the', 'and', 'or', 'for', 'to', 'in', 'on', 'a', 'an', 'no', 'de', 'la']);
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0) return false;
  return words.every((w, i) => {
    const first = w[0];
    if (/[A-Z0-9]/.test(first)) return true;
    // A lowercase word is only allowed if it's a short connective and not the first word.
    return i > 0 && CONNECTIVES.has(w.toLowerCase().replace(/[^a-z]/g, ''));
  });
}

/**
 * Atlas Message Component
 * Product-grade rendering: user messages are accent bubbles, assistant
 * messages a sans reading column with chip citations, a tinted quality
 * pill and bordered source cards.
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
    const row = (anchor.closest('.atlas-source-item') as HTMLElement) || anchor;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('atlas-cite-flash');
    void row.offsetWidth; // restart the CSS animation
    row.classList.add('atlas-cite-flash');
    window.setTimeout(() => row.classList.remove('atlas-cite-flash'), 1700);
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

  // Inline [n] reference: accent-soft chip that fills accent on hover.
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
          className={`atlas-cite ${enableSourceClick ? 'atlas-cite-clickable' : ''}`}
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
          {displayNum}
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

  // ---------- User message: right-aligned accent bubble with timestamp below ----------
  if (isUser) {
    const askedAt = new Date(message.timestamp);
    const hasTime = !Number.isNaN(askedAt.getTime());
    return (
      <div className="atlas-msg-in flex justify-end">
        <div className="max-w-[78%] text-end">
          {/* dir="auto": an RTL question typed in an LTR UI (or vice versa)
              gets the correct base direction from its own first strong char */}
          <span className="atlas-user-q" dir="auto">{message.content}</span>
          {hasTime && (
            <time className="atlas-user-time" dateTime={askedAt.toISOString()}>
              {askedAt.toLocaleTimeString(i18n.language || undefined, { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
        </div>
      </div>
    );
  }

  // ---------- Assistant message: plain typographic block ----------
  return (
    <div className="atlas-msg-in group w-full min-w-0">
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
                className="atlas-schema-response"
                messageId={message.id}
                citationDisplayMap={citationDisplayMap}
              />
            </div>
          ) : (
            <div className="atlas-prose max-w-none" dir={isRtl ? 'rtl' : 'ltr'}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings render bare: sans display sizes come from .atlas-prose (atlas.css)
                  h1: ({ children }) => <h1>{children}</h1>,
                  h2: ({ children }) => <h2>{children}</h2>,
                  h3: ({ children }) => <h3>{children}</h3>,
                  // Paragraphs with keyword highlighting and citation anchors
                  // (shared processInlineChildren: [1], [Kaynak 1], [Source 1] formats)
                  p: ({ children }) => (
                    <p className="my-3 first:mt-0 last:mb-0">
                      {processInlineChildren(children)}
                    </p>
                  ),
                  // Weight (650) and color come from .atlas-prose strong (atlas.css)
                  strong: ({ children }) => <strong>{children}</strong>,
                  em: ({ children }) => (
                    <em className="italic">
                      {children}
                    </em>
                  ),
                  // Unordered lists: accent disc markers (preflight resets list-style)
                  ul: ({ children }) => (
                    <ul className="my-3 list-disc list-outside ps-5 space-y-2.5">
                      {children}
                    </ul>
                  ),
                  // Ordered lists render bare: the counter-driven accent-soft
                  // number tiles come from .atlas-prose ol CSS (atlas.css).
                  // Honor markdown's `start` prop by seeding the CSS counter,
                  // since CSS counters ignore the <ol start> attribute.
                  ol: ({ children, start }) => (
                    <ol style={start && start !== 1 ? { counterReset: `item ${start - 1}` } : undefined}>
                      {children}
                    </ol>
                  ),
                  // List items run the same citation/keyword processing as
                  // paragraphs: tight lists give <li> bare string children.
                  // The wrapper div keeps inline flow intact inside the flex
                  // row an ordered-list item becomes (number tile + body).
                  li: ({ children }) => (
                    <li>
                      <div className="min-w-0">{processInlineChildren(children)}</div>
                    </li>
                  ),
                  code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="rounded border border-[var(--atlas-border)] bg-[var(--atlas-surface)] px-1.5 py-0.5 font-mono text-[13px]">
                        {children}
                      </code>
                    ) : (
                      <code className="my-3 block overflow-x-auto rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface)] p-3 font-mono text-[13px]">
                        {children}
                      </code>
                    );
                  },
                  // Blockquote: muted start border + muted italic (also styles the
                  // PDF relevance notice the backend prepends to PDF answers).
                  blockquote: ({ children }) => (
                    <blockquote className="my-3 border-s-2 border-[var(--atlas-border)] ps-4 italic text-[var(--atlas-muted)]">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--atlas-accent)] underline-offset-2 hover:underline"
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
                    <th className="border-b border-[var(--atlas-border)] px-3 py-2 text-start text-xs font-semibold text-[var(--atlas-ink)]">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-[var(--atlas-border)] px-3 py-2">
                      {children}
                    </td>
                  ),
                }}
              >
                {prepareMarkdown(displayContent, { lang: contentLang })}
              </ReactMarkdown>
            </div>
          )}

          {/* Meta row (mock .meta): tinted quality pill, response time, then a
              spacer pushing the ghost icon actions to the end */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-[var(--atlas-muted)]">
            {(message.evidence || message.sources) && (
              <span
                className={`atlas-q-pill atlas-q-${qualityLevel}`}
                title={t('chatMessage.quality.label')}
              >
                {t(`chatMessage.quality.${qualityLevel}`)}
              </span>
            )}
            {message.responseTime !== undefined && (
              <span>{(message.responseTime / 1000).toFixed(1)}s</span>
            )}

            <span className="ms-auto flex items-center gap-0.5">
              {/* Copy answer */}
              {message.content && (
                <button
                  onClick={handleCopy}
                  className="atlas-icon-btn"
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
                  className={`atlas-icon-btn ${
                    isPlaying
                      ? '!text-[var(--atlas-accent)]'
                      : isTTSLoading
                        ? 'cursor-wait'
                        : ''
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
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--atlas-warn)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t('chatMessage.sourcesLoadFailed')}
            </p>
          )}

          {/* Sources: bordered cards — muted heading, icon tile, [n] + title, meta chips */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-5">
              <div className="atlas-src-label">
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
                    // cleanExcerpt (shared) makes a raw chunk fragment readable: it drops a
                    // leading mid-word/lowercase partial and starts at the first real sentence
                    // start, or capitalizes an all-lowercase excerpt — without fabricating text.
                    const cleaned = cleanExcerpt(
                      cleanCitationTitle(raw, { lang: chipLang })
                        .replace(/^(KONU|İLGİ|SORU|CEVAP|Dilekçenizde|konusu|VERGİ\s*Sİ\s*KANUNU[^.]*\.)[:.\s]*/gi, '')
                        .replace(/\.{2,}/g, '.')
                        .trim()
                    );

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
                  // A title line shows ONLY for a GENUINE identifier (a real law name /
                  // document title). Drop it when it is: redundant with the excerpt
                  // (isRedundantTitle), already present in a chip, or a raw chunk fragment
                  // rather than a name (isGenuineTitle rejects lowercase / mid-word / sentence
                  // fragments). Web / government-service cards typically fail isGenuineTitle,
                  // so their mid-sentence chunk head no longer duplicates the excerpt.
                  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
                  const inChips = chips.some((c) => norm(String(c.value)) === norm(sourceName));
                  let originLabel = (inChips || isRedundantTitle(sourceName, description) || !isGenuineTitle(sourceName))
                    ? '' : sourceName;
                  // A distinct crawl host is a legitimate origin even when the source-name was
                  // a fragment — fall back to it (hosts never read as duplicated sentences).
                  if (!originLabel && !inChips && meta?.url) {
                    try { originLabel = new URL(meta.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
                  }

                  // Genuine title line (a real law name for legislation, a document
                  // title, or a crawl origin host). Empty when the would-be title was
                  // redundant with the excerpt, already sits in a chip, or was a chunk
                  // fragment — in that case the type/chips identify the source and no
                  // title line is shown.
                  const typeLabel = t(typeInfo.labelKey);
                  const titleText = originLabel && originLabel.length > 2 ? originLabel : '';
                  // Legislation sources get the shield icon tile; everything else a document
                  const isLegislation = typeInfo.labelKey === 'sourceTypes.legislation';
                  // Article/clause chips get the accent tint; the type label is
                  // appended as a plain chip unless a real title line already shows it.
                  const isArticleChip = (key: string) => /article|madde/i.test(key);
                  const showTypeChip = !titleText;

                  return (
                    <div
                      key={idx}
                      id={`citation-${message.id}-${idx + 1}`}
                      className={`atlas-source-item atlas-src scroll-mt-20 ${
                        enableSourceClick ? 'atlas-src-clickable' : ''
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

                      {/* Left column: icon tile with the ORDINAL citation number
                          beneath it. The number is the group's position (k+1), keeping
                          the cards a strict 1..n sequence even when merged duplicates
                          leave gaps in the original indices; inline [n] chips show the
                          same ordinal via citationDisplayMap. (visibleGroups is a head
                          slice of sourceGroups, so groupIdx IS the group's position.) */}
                      <div className="atlas-src-lead">
                        <div className="atlas-src-icon" aria-hidden>
                          {isLegislation ? (
                            <Shield className="h-[17px] w-[17px]" strokeWidth={1.8} />
                          ) : (
                            <FileText className="h-[17px] w-[17px]" strokeWidth={1.8} />
                          )}
                        </div>
                        <span className="atlas-src-n">[{groupIdx + 1}]</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Genuine title line above the chips (law name for legislation,
                            document title, or crawl origin). Suppressed when redundant
                            with the excerpt, so title==excerpt no longer reads as a bug. */}
                        {titleText && (
                          <div className="atlas-src-title" title={titleText}>
                            {titleText}
                          </div>
                        )}

                        {/* Meta chips: accent-tinted article chip, bordered rest */}
                        {(chips.length > 0 || showTypeChip) && (
                          <div className="atlas-src-meta">
                            {chips.map((chip, i) => {
                              const label = chip.label ?? t(chip.labelKey, { defaultValue: '' });
                              return (
                                <span
                                  key={i}
                                  className={`atlas-chip ${isArticleChip(chip.key) ? 'atlas-chip-art' : ''}`}
                                >
                                  <bdi dir="auto">{label ? `${label} ${chip.value}` : chip.value}</bdi>
                                </span>
                              );
                            })}
                            {showTypeChip && <span className="atlas-chip">{typeLabel}</span>}
                          </div>
                        )}

                        {/* Excerpt: muted, clamped to two lines */}
                        {description && description.length > 15 && (
                          <p className="atlas-src-ex">{description}</p>
                        )}

                        {/* Official source link (from corpus metadata.url, settings-gated) */}
                        {officialUrl && (
                          <a
                            href={officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--atlas-accent-ink)] hover:underline"
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
                  className="mt-2 text-xs text-[var(--atlas-muted)] transition-colors hover:text-[var(--atlas-accent)]"
                >
                  {showAllSources
                    ? t('citationPanel.showLess')
                    : t('citations.showAll', { count: sourceGroups.length })}
                </button>
              )}
            </div>
          )}

          {/* Follow-up questions (backend-generated; gated by chatbot.enableFollowUps):
              bordered pill buttons in a wrapping row. dir follows the ORIGINAL
              answer language (follow-ups are never translated). */}
          {citationSettings.enableFollowUps && message.followUpQuestions && message.followUpQuestions.length > 0 && (
            <div dir={isFollowUpsRtl ? 'rtl' : 'ltr'} className="atlas-fups">
              {message.followUpQuestions.map((question, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleFollowUpClick(question)}
                  className="atlas-fup"
                >
                  <span className="min-w-0 flex-1">{question}</span>
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
