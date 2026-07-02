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
  'underline decoration-dotted decoration-[var(--zen-accent)] underline-offset-4';

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
 * Zen01 Message Component
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
  const isRtl = contentLang ? contentLang.toLowerCase().startsWith('ar') : (!isUser && detectRtl(message.content));
  // Language used for citation-title cleanup and chip label resolution
  const chipLang = contentLang || i18n.language;

  // Extract keywords from last user query for highlighting (only if enabled)
  const highlightKeywords = React.useMemo(() => {
    if (!enableKeywordHighlighting || !lastUserQuery || isUser) return [];
    return extractKeywords(lastUserQuery);
  }, [lastUserQuery, isUser, enableKeywordHighlighting]);

  // Use schema-based rendering when schemaId is provided
  const useSchemaRenderer = Boolean(responseSchemaId);

  // Determine content to display (original or translated)
  const displayContent = translation?.isShowingTranslation
    ? translation.translatedContent
    : message.content;

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

  // Collapsed source count: the minimal skin shows a short list first (design),
  // capped by the tenant's minSourcesToShow so a lower setting still wins.
  const collapsedCount = Math.min(minSourcesToShow, 3);
  const visibleGroups = showAllSources
    ? sourceGroups
    : sourceGroups.slice(0, collapsedCount);

  // Scroll to a citation row and flash it with a brief accent-tinted background.
  // If the target sits in the collapsed tail of the source list, expand first.
  const flashCitation = (anchor: HTMLElement) => {
    const row = (anchor.closest('.zen01-source-item') as HTMLElement) || anchor;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('zen01-cite-flash');
    void row.offsetWidth; // restart the CSS animation
    row.classList.add('zen01-cite-flash');
    window.setTimeout(() => row.classList.remove('zen01-cite-flash'), 1700);
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
  const renderCitationSup = (citationNum: string, key: string) => (
    <bdi key={key} dir="ltr">
      <sup
        className={`text-[0.7em] font-medium text-[var(--zen-accent)] no-underline ${
          enableSourceClick ? 'cursor-pointer hover:underline underline-offset-2' : ''
        }`}
        {...(enableSourceClick && {
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            scrollToCitation(citationNum);
          }
        })}
      >
        [{citationNum}]
      </sup>
    </bdi>
  );

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

  // ---------- User message: quiet right-aligned block ----------
  if (isUser) {
    return (
      <div className="zen01-msg-in flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-[var(--zen-hairline)] bg-[var(--zen-surface)] px-4 py-3 text-[15px] leading-relaxed text-[var(--zen-ink)]">
          {message.content}
        </div>
      </div>
    );
  }

  // ---------- Assistant message: plain typographic block ----------
  return (
    <div className="zen01-msg-in group w-full min-w-0">
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
                className="zen01-schema-response"
                messageId={message.id}
              />
            </div>
          ) : (
            <div className="zen01-prose max-w-none" dir={isRtl ? 'rtl' : 'ltr'}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings: semibold ink, generous top margin — weight over size.
                  h1: ({ children }) => (
                    <h1 className="mt-6 mb-2 text-lg font-semibold text-[var(--zen-ink)]">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="mt-6 mb-2 text-base font-semibold text-[var(--zen-ink)]">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mt-6 mb-2 text-[15px] font-semibold text-[var(--zen-ink)]">
                      {children}
                    </h3>
                  ),
                  // Paragraphs with keyword highlighting and citation anchors
                  p: ({ children }) => {
                    // Apply keyword highlighting and convert citations to clickable anchors
                    // Supports: [1], [Kaynak 1], [Source 1] formats
                    const processChildren = (child: React.ReactNode): React.ReactNode => {
                      // Handle React elements with children (like <strong>, <em>, etc.)
                      if (React.isValidElement(child) && child.props?.children) {
                        const processedChildren = processChildren(child.props.children);
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
                        return child.map((c, i) => <React.Fragment key={i}>{processChildren(c)}</React.Fragment>);
                      }
                      return child;
                    };

                    return (
                      <p className="my-3 first:mt-0 last:mb-0">
                        {processChildren(children)}
                      </p>
                    );
                  },
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[var(--zen-ink)]">
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
                    <ul className="my-3 list-disc list-outside ps-5 space-y-1">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-3 list-decimal list-outside ps-5 space-y-1">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed">
                      {children}
                    </li>
                  ),
                  code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="rounded border border-[var(--zen-hairline)] bg-[var(--zen-surface)] px-1.5 py-0.5 font-mono text-[13px]">
                        {children}
                      </code>
                    ) : (
                      <code className="my-3 block overflow-x-auto rounded-lg border border-[var(--zen-hairline)] bg-[var(--zen-surface)] p-3 font-mono text-[13px]">
                        {children}
                      </code>
                    );
                  },
                  // Blockquote: hairline start border + muted italic (also styles the
                  // PDF relevance notice the backend prepends to PDF answers).
                  blockquote: ({ children }) => (
                    <blockquote className="my-3 border-s-2 border-[var(--zen-hairline)] ps-4 italic text-[var(--zen-muted)]">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--zen-accent)] underline-offset-2 hover:underline"
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
                    <th className="border-b border-[var(--zen-hairline)] px-3 py-2 text-start text-xs font-semibold text-[var(--zen-ink)]">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-[var(--zen-hairline)] px-3 py-2">
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
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--zen-muted)]">
            {message.responseTime !== undefined && (
              <span>{(message.responseTime / 1000).toFixed(1)}s</span>
            )}
            {(message.evidence || message.sources) && (
              <>
                {message.responseTime !== undefined && <span aria-hidden>·</span>}
                <span>
                  {t('chatMessage.quality.label')}:{' '}
                  <span className={`zen01-q-${qualityLevel}`}>
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
                  className="rounded-md p-1.5 text-[var(--zen-muted)] transition-colors hover:bg-[var(--zen-hover)] hover:text-[var(--zen-ink)]"
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
                      ? 'text-[var(--zen-accent)]'
                      : isTTSLoading
                        ? 'cursor-wait text-[var(--zen-muted)]'
                        : 'text-[var(--zen-muted)] hover:bg-[var(--zen-hover)] hover:text-[var(--zen-ink)]'
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
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--zen-warn)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {t('chatMessage.sourcesLoadFailed')}
            </p>
          )}

          {/* Sources: compact hairline-separated rows */}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-6 border-t border-[var(--zen-hairline)] pt-3">
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--zen-muted)]">
                {t('citations.sourcesHeading', { count: sourceGroups.length })}
              </div>
              <div>
                {visibleGroups?.map((group) => {
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
                      className={`zen01-source-item -mx-2 scroll-mt-20 border-b border-[var(--zen-hairline)] px-2 py-2.5 transition-colors last:border-b-0 ${
                        enableSourceClick ? 'cursor-pointer hover:bg-[var(--zen-hover)]' : 'cursor-default'
                      }`}
                      {...(enableSourceClick && {
                        onClick: () => onSourceClick(source, message.sources || [])
                      })}
                    >
                      {/* Hidden anchors for duplicate laws merged into this row, so inline [n]
                          references to those merged sources still scroll here. */}
                      {aliasIndices.map((n) => (
                        <span key={`alias-${n}`} id={`citation-${message.id}-${n + 1}`} aria-hidden className="block h-0 w-0" />
                      ))}

                      {/* Line 1: [n] + source title */}
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0 font-mono text-[11px] text-[var(--zen-muted)]">
                          [{idx + 1}]
                        </span>
                        <span className="min-w-0 truncate text-sm font-medium text-[var(--zen-ink)]" title={titleText}>
                          {titleText}
                        </span>
                      </div>

                      {/* Line 2: dotted metadata built from the citation chips */}
                      {metaSegments.length > 0 && (
                        <div className="mt-0.5 ps-7 text-xs text-[var(--zen-muted)]">
                          {metaSegments.map((segment, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span aria-hidden> · </span>}
                              <bdi dir="auto">{segment}</bdi>
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {/* Line 3: excerpt */}
                      {description && description.length > 15 && (
                        <p className="mt-1 ps-7 text-xs leading-relaxed text-[var(--zen-muted)] line-clamp-2">
                          {description}
                        </p>
                      )}

                      {/* Official source link (from corpus metadata.url, settings-gated) */}
                      {officialUrl && (
                        <a
                          href={officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ms-7 mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--zen-accent)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t('citations.officialSource')}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              {sourceGroups.length > collapsedCount && (
                <button
                  onClick={() => setShowAllSources(!showAllSources)}
                  className="mt-2 text-xs text-[var(--zen-muted)] transition-colors hover:text-[var(--zen-accent)]"
                >
                  {showAllSources
                    ? t('citationPanel.showLess')
                    : t('citations.showAll', { count: sourceGroups.length })}
                </button>
              )}
            </div>
          )}

          {/* Follow-up questions (backend-generated; gated by chatbot.enableFollowUps) */}
          {citationSettings.enableFollowUps && message.followUpQuestions && message.followUpQuestions.length > 0 && (
            <div dir={isRtl ? 'rtl' : 'ltr'} className="mt-4">
              <span className="mb-1.5 block text-[11px] text-[var(--zen-muted)]">
                {t('followUps.title')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {message.followUpQuestions.map((question, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleFollowUpClick(question)}
                    className="rounded-full border border-[var(--zen-hairline)] bg-transparent px-3 py-1 text-start text-xs text-[var(--zen-muted)] transition-colors hover:border-[var(--zen-accent)] hover:text-[var(--zen-accent)]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ZenMessage;
