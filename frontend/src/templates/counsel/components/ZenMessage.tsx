'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, Pause, Loader2, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import { TranslationBadge } from './TranslationBadge';
import { StructuredAnswerBody, isStructuredAnswer } from '@/components/chat/structured-answer';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import { prepareMarkdown, cleanCitationTitle, detectRtl } from '@/lib/chat-markdown';
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
  'underline decoration-dotted decoration-[var(--counsel-accent)] underline-offset-4';

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
 * Counsel Message Component
 * Quiet, typography-first rendering: assistant messages are a plain reading
 * column (no card/bubble/avatar), user messages a subtle right-aligned block.
 */
export const ZenMessage: React.FC<ZenMessageProps> = ({
  message,
  onSourceClick,
  lastUserQuery = '',
  voiceOutputEnabled = false,
  enableSourceClick = true,  // From schema, default true
  enableKeywordHighlighting = true,  // From schema, default true
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

  // Structured answer payload: rendered deterministically when present (and not showing a
  // translated Markdown string). Legacy / non-structured messages use Markdown.
  const structuredAnswer = (!translation?.isShowingTranslation && isStructuredAnswer(message.structured))
    ? message.structured
    : null;

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
    const row = (anchor.closest('.counsel-source-item') as HTMLElement) || anchor;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('counsel-cite-flash');
    void row.offsetWidth; // restart the CSS animation
    row.classList.add('counsel-cite-flash');
    window.setTimeout(() => row.classList.remove('counsel-cite-flash'), 1700);
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
          className={`counsel-cite no-underline ${
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

  // Inline text renderer for the structured body: applies keyword highlighting to plain
  // text spans (the structured renderer handles **bold** + citation chips itself).
  const renderInlineText = (text: string, keyPrefix: string): React.ReactNode => {
    if (highlightKeywords.length > 0) {
      return <React.Fragment key={keyPrefix}>{highlightKeywordsInText(text, highlightKeywords)}</React.Fragment>;
    }
    return text;
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

  // ---------- User message: right-aligned serif question with accent underline, no bubble ----------
  if (isUser) {
    const askedAt = new Date(message.timestamp);
    const hasTime = !Number.isNaN(askedAt.getTime());
    return (
      <div className="counsel-msg-in flex justify-end">
        <div className="max-w-[85%] text-end">
          {/* dir="auto": an RTL question typed in an LTR UI (or vice versa)
              gets the correct base direction from its own first strong char */}
          <span className="counsel-user-q" dir="auto">{message.content}</span>
          {hasTime && (
            <time className="counsel-user-time" dateTime={askedAt.toISOString()}>
              {askedAt.toLocaleTimeString(i18n.language || undefined, { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
        </div>
      </div>
    );
  }

  // ---------- Assistant message: plain typographic block ----------
  return (
    <div className="counsel-msg-in group w-full min-w-0">
      {message.isStreaming ? (
        <ZenTypingIndicator />
      ) : (
        <>
          {/* Answer body: deterministic structured render when present, else Markdown */}
          {structuredAnswer ? (
            <div dir={isRtl ? 'rtl' : 'ltr'}>
              <StructuredAnswerBody
                answer={structuredAnswer}
                renderCite={renderCitationSup}
                renderInline={renderInlineText}
                className="counsel-prose max-w-none"
              />
            </div>
          ) : (
            <div className="counsel-prose max-w-none" dir={isRtl ? 'rtl' : 'ltr'}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings render bare: serif display sizes come from .counsel-prose (counsel.css)
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
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[var(--counsel-ink)]">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic">
                      {children}
                    </em>
                  ),
                  // Lists: visible muted markers (preflight resets list-style)
                  ul: ({ children }) => (
                    <ul className="my-3 list-disc list-outside ps-5 space-y-2.5">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-3 list-decimal list-outside ps-5 space-y-2.5">
                      {children}
                    </ol>
                  ),
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
                      <code className="rounded border border-[var(--counsel-hairline)] bg-[var(--counsel-surface)] px-1.5 py-0.5 font-mono text-[13px]">
                        {children}
                      </code>
                    ) : (
                      <code className="my-3 block overflow-x-auto rounded-lg border border-[var(--counsel-hairline)] bg-[var(--counsel-surface)] p-3 font-mono text-[13px]">
                        {children}
                      </code>
                    );
                  },
                  // Blockquote: hairline start border + muted italic (also styles the
                  // PDF relevance notice the backend prepends to PDF answers).
                  blockquote: ({ children }) => (
                    <blockquote className="my-3 border-s-2 border-[var(--counsel-hairline)] ps-4 italic text-[var(--counsel-muted)]">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--counsel-accent)] underline-offset-2 hover:underline"
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
                    <th className="border-b border-[var(--counsel-hairline)] px-3 py-2 text-start text-xs font-semibold text-[var(--counsel-ink)]">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-[var(--counsel-hairline)] px-3 py-2">
                      {children}
                    </td>
                  ),
                }}
              >
                {prepareMarkdown(displayContent, { lang: contentLang })}
              </ReactMarkdown>
            </div>
          )}

          {/* Meta row: response time · quality, plus hover-revealed ghost actions */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--counsel-muted)]">
            {message.responseTime !== undefined && (
              <span>{(message.responseTime / 1000).toFixed(1)}s</span>
            )}
            {(message.evidence || message.sources) && (
              <>
                {message.responseTime !== undefined && <span aria-hidden>·</span>}
                <span>
                  {t('chatMessage.quality.label')}:{' '}
                  <span className={`counsel-q-${qualityLevel}`}>
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
                  className="rounded-md p-1.5 text-[var(--counsel-muted)] transition-colors hover:bg-[var(--counsel-hover)] hover:text-[var(--counsel-ink)]"
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
                  className={`rounded-md p-1.5 transition-colors ${
                    isPlaying
                      ? 'text-[var(--counsel-accent)]'
                      : isTTSLoading
                        ? 'cursor-wait text-[var(--counsel-muted)]'
                        : 'text-[var(--counsel-muted)] hover:bg-[var(--counsel-hover)] hover:text-[var(--counsel-ink)]'
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
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--counsel-warn)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t('chatMessage.sourcesLoadFailed')}
            </p>
          )}

          {/* Sources: footnote ledger — uppercase label with a hairline rule, numbered serif rows */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-6">
              <div className="counsel-src-label">
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
                  const originLabel = (inChips || isRedundantTitle(sourceName, description) || !isGenuineTitle(sourceName))
                    ? '' : sourceName;
                  // We deliberately do NOT surface the source host/domain (e.g. "u.ae",
                  // "mof.gov.ae") or any official-source link — only a genuine law/document
                  // name shows as the title.

                  // Line 1 title: a genuine origin when we have one, else the type label.
                  const typeLabel = t(typeInfo.labelKey);
                  const titleText = originLabel && originLabel.length > 2 ? originLabel : typeLabel;
                  // Line 2 meta: chip label+value pairs joined with dots; append the type
                  // label unless it already serves as the title.
                  const metaSegments = chips.map((chip) => {
                    const label = chip.label ?? t(chip.labelKey, { defaultValue: '' });
                    return label ? `${label} ${chip.value}` : chip.value;
                  });
                  if (titleText !== typeLabel) metaSegments.push(typeLabel);

                  return (
                    <div
                      key={idx}
                      id={`citation-${message.id}-${idx + 1}`}
                      className={`counsel-source-item counsel-src scroll-mt-20 ${
                        enableSourceClick ? 'counsel-src-clickable' : ''
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

                      {/* Footnote number: the group's ORDINAL position (k+1) keeps the
                          ledger a strict 1..n sequence even when merged duplicates leave
                          gaps in the original indices; inline [n] superscripts show the
                          same ordinal via citationDisplayMap. (visibleGroups is a head
                          slice of sourceGroups, so groupIdx IS the group's position.) */}
                      <span className="counsel-src-n">{groupIdx + 1}</span>

                      <div className="min-w-0 flex-1">
                        {/* Serif source title (row hover turns it accent) */}
                        <div className="counsel-src-title" title={titleText}>
                          {titleText}
                        </div>

                        {/* Meta line: chip data as plain dotted text, leading segment bold ink */}
                        {metaSegments.length > 0 && (
                          <div className="counsel-src-meta">
                            {metaSegments.map((segment, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span aria-hidden> · </span>}
                                {i === 0 ? (
                                  <b><bdi dir="auto">{segment}</bdi></b>
                                ) : (
                                  <bdi dir="auto">{segment}</bdi>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {/* Excerpt: muted italic, clamped to two lines */}
                        {description && description.length > 15 && (
                          <p className="counsel-src-ex">{description}</p>
                        )}

                        {/* Official source link (from corpus metadata.url, settings-gated) */}
                        {officialUrl && (
                          <a
                            href={officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--counsel-accent)] hover:underline"
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
                  className="mt-2 text-xs text-[var(--counsel-muted)] transition-colors hover:text-[var(--counsel-accent)]"
                >
                  {showAllSources
                    ? t('citationPanel.showLess')
                    : t('citations.showAll', { count: sourceGroups.length })}
                </button>
              )}
            </div>
          )}

          {/* Follow-up questions (backend-generated; gated by chatbot.enableFollowUps):
              stacked hairline rows, hover reveals a direction-aware arrow */}
          {citationSettings.enableFollowUps && message.followUpQuestions && message.followUpQuestions.length > 0 && (
            <div dir={isFollowUpsRtl ? 'rtl' : 'ltr'} className="counsel-fups">
              {message.followUpQuestions.map((question, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleFollowUpClick(question)}
                  className="counsel-fup"
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
