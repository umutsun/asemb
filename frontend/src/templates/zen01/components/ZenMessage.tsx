'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { User, Bot, Clock, Volume2, Pause, Loader2, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ZenTypingIndicator } from './ZenTypingIndicator';
import { SchemaRenderer } from './SchemaRenderer';
import { TranslationBadge } from './TranslationBadge';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import { prepareMarkdown, cleanLLMResponse, cleanCitationTitle, detectRtl } from '@/lib/chat-markdown';
import { getSourceTypeInfo, buildCitationChips, getOfficialSourceUrl, isRedundantTitle } from '@/lib/source-presentation';
import { useCitationSettings } from '@/lib/citation-settings';
import { CitationChip } from '@/components/chat/citation-chip';
import { FollowUpChips } from '@/components/chat/follow-up-chips';
import { QualityBadge } from '@/components/chat/quality-badge';
import type { ZenMessageProps, ZenSource, MessageTranslation } from '../types';

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
 * Highlight keywords in text with marker class
 */
// Marker colors - like different highlighter pens
const MARKER_COLORS = [
  'zen01-marker-yellow',  // Yellow highlighter
  'zen01-marker-green',   // Green highlighter
  'zen01-marker-pink',    // Pink highlighter
  'zen01-marker-blue',    // Blue highlighter
];

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

  // Track which color to use for each keyword
  const keywordColorMap = new Map<string, string>();
  let colorIndex = 0;

  return parts.map((part, idx) => {
    const matchedKeyword = sortedKeywords.find(k => k.toLowerCase() === part.toLowerCase());
    if (matchedKeyword) {
      // Assign consistent color to each keyword
      const keyLower = matchedKeyword.toLowerCase();
      if (!keywordColorMap.has(keyLower)) {
        keywordColorMap.set(keyLower, MARKER_COLORS[colorIndex % MARKER_COLORS.length]);
        colorIndex++;
      }
      const markerClass = keywordColorMap.get(keyLower);
      return (
        <span key={idx} className={`zen01-marker ${markerClass}`}>
          <span>{part}</span>
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
 * Renders user and assistant messages with glassmorphism styling
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

  // Tenant citation presentation settings (chips, type labels, follow-up gating)
  const citationSettings = useCitationSettings();

  // Answer language: backend-reported when available; Arabic-script heuristic for legacy messages
  const contentLang = message.language;
  const isRtl = contentLang ? contentLang.toLowerCase().startsWith('ar') : (!isUser && detectRtl(message.content));
  // Language used for citation-title cleanup and chip label resolution
  const chipLang = contentLang || i18n.language;

  // Debug: Log component version on mount
  React.useEffect(() => {
    console.log('[ZenMessage] 🔄 v2026.01.21 - Dynamic suggestion cards', {
      enableSourceClick,
      enableKeywordHighlighting,
      messageId: message.id,
      sourcesCount: message.sources?.length || 0,
      minSourcesToShow,
      showAllSources
    });
  }, [message.sources?.length, minSourcesToShow]);

  // Extract keywords from last user query for highlighting (only if enabled)
  const highlightKeywords = React.useMemo(() => {
    if (!enableKeywordHighlighting || !lastUserQuery || isUser) {
      console.log('[ZenMessage] Keyword highlighting:', {
        enabled: enableKeywordHighlighting,
        hasQuery: !!lastUserQuery,
        isUser,
        reason: !enableKeywordHighlighting ? 'disabled' : !lastUserQuery ? 'no query' : 'user message'
      });
      return [];
    }
    const keywords = extractKeywords(lastUserQuery);
    console.log('[ZenMessage] Extracted keywords:', { query: lastUserQuery, keywords });
    return keywords;
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

  // Show sources based on settings (dynamic from ragSettings.minSourcesToShow)
  const visibleGroups = showAllSources
    ? sourceGroups
    : sourceGroups.slice(0, minSourcesToShow);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} zen01-fade-in`}
    >
      <div className={`max-w-[90%] sm:max-w-[80%]`}>
        {/* Message Bubble */}
        <div className={isUser ? 'zen01-message-user' : 'zen01-message-assistant'}>
          <div className="p-4">
            {message.isStreaming ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </span>
                <ZenTypingIndicator />
                <span className="text-slate-500 dark:text-cyan-400/60 text-sm">{t('chatMessage.analyzing')}</span>
              </div>
            ) : isUser ? (
              <div className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 mr-1.5 align-middle flex-shrink-0">
                  <User className="h-3 w-3" />
                </span>
                {message.content}
              </div>
            ) : (
              <>
                {useSchemaRenderer ? (
              // Schema-based structured response rendering
              <div className="flex gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </span>
                <div className="flex-1 min-w-0" dir={isRtl ? 'rtl' : 'ltr'}>
                  <SchemaRenderer
                    content={cleanLLMResponse(displayContent)}
                    schemaId={responseSchemaId}
                    keywords={backendKeywords}
                    dayanaklar={backendDayanaklar}
                    className="zen01-schema-response"
                    messageId={message.id}
                  />
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm flex-shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </span>
                <div className="flex-1 min-w-0 zen01-markdown prose prose-sm max-w-none dark:prose-invert" dir={isRtl ? 'rtl' : 'ltr'}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Headings — light mode: near-black, clearly heavier than body text;
                    // dark mode keeps the approved cyan accent.
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold text-slate-900 dark:text-cyan-200 mt-4 mb-2 pb-1 border-b border-slate-200 dark:border-cyan-500/30">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-bold text-slate-900 dark:text-cyan-300 mt-4 mb-2">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-bold text-slate-900 dark:text-cyan-300 mt-3 mb-1">
                        {children}
                      </h3>
                    ),
                    // Paragraphs with keyword highlighting and citation anchors
                    p: ({ children }) => {
                      // DEBUG: Log what we receive
                      console.log('[ZenMessage] p children:', {
                        type: typeof children,
                        isArray: Array.isArray(children),
                        enableSourceClick,
                        value: typeof children === 'string' ? children.substring(0, 100) : 'not-string'
                      });

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
                              // Clean, simple citation format - no fancy styling.
                              // <bdi dir="ltr"> keeps the [n] marker from mirroring inside RTL text.
                              if (enableSourceClick) {
                                return (
                                  <bdi key={`cite-${idx}`} dir="ltr">
                                    <sup
                                      className="cursor-pointer text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300"
                                      style={{ fontSize: '0.7em', fontWeight: 500 }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const el = document.getElementById(`citation-${message.id}-${citationNum}`);
                                        if (el) {
                                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          el.style.boxShadow = '0 0 0 2px rgba(34, 211, 238, 0.5)';
                                          el.style.transition = 'box-shadow 0.3s ease';
                                          setTimeout(() => { el.style.boxShadow = 'none'; }, 2000);
                                        }
                                      }}
                                    >
                                      [{citationNum}]
                                    </sup>
                                  </bdi>
                                );
                              } else {
                                // Not clickable - just display as superscript
                                return (
                                  <bdi key={`cite-${idx}`} dir="ltr">
                                    <sup
                                      className="text-cyan-600 dark:text-cyan-400"
                                      style={{ fontSize: '0.7em', fontWeight: 500 }}
                                    >
                                      [{citationNum}]
                                    </sup>
                                  </bdi>
                                );
                              }
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
                        <p className="text-slate-700 dark:text-slate-100 leading-relaxed my-6 first:mt-0 last:mb-0" style={{ marginBottom: '1.5em', marginTop: '1.5em' }}>
                          {processChildren(children)}
                        </p>
                      );
                    },
                    // Bold — light mode: near-black + heavier weight so it clearly differs
                    // from body text; dark mode keeps the approved cyan accent.
                    strong: ({ children }) => (
                      <strong className="font-bold text-slate-900 dark:text-cyan-300 dark:font-semibold inline-block">
                        {children}
                      </strong>
                    ),
                    // Italic
                    em: ({ children }) => (
                      <em className="italic text-slate-600 dark:text-slate-200">
                        {children}
                      </em>
                    ),
                    // Unordered lists — visible markers + indent (preflight resets list-style)
                    ul: ({ children }) => (
                      <ul className="list-disc list-outside pl-5 my-3 space-y-1.5 text-slate-700 dark:text-slate-100">
                        {children}
                      </ul>
                    ),
                    // Ordered lists — visible numbers + indent
                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside pl-5 my-3 space-y-1.5 text-slate-700 dark:text-slate-100">
                        {children}
                      </ol>
                    ),
                    // List items
                    li: ({ children }) => (
                      <li className="text-slate-700 dark:text-slate-100 pl-1 leading-relaxed">
                        {children}
                      </li>
                    ),
                    // Code blocks
                    code: ({ className, children }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200 px-1.5 py-0.5 rounded text-sm font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-slate-100 dark:bg-[#0a1628] text-cyan-700 dark:text-cyan-200 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2">
                          {children}
                        </code>
                      );
                    },
                    // Blockquotes
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-cyan-500/50 pl-4 my-2 text-slate-600 dark:text-slate-100 italic">
                        {children}
                      </blockquote>
                    ),
                    // Links
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors"
                      >
                        {children}
                      </a>
                    ),
                    // Tables
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border border-cyan-300/40 dark:border-cyan-500/30 rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-cyan-50 dark:bg-cyan-900/30">
                        {children}
                      </thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-cyan-700 dark:text-cyan-200 border-b border-cyan-300/40 dark:border-cyan-500/30">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-sm text-slate-600 dark:text-slate-200 border-b border-cyan-200/30 dark:border-cyan-500/20">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {prepareMarkdown(displayContent, { lang: contentLang })}
                </ReactMarkdown>
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* Response Time Badge & TTS Button & Translation Badge */}
          {!isUser && !message.isStreaming && (
            <div className="px-4 pb-3 flex items-center gap-2">
              {message.responseTime && (
                <div className="zen01-response-time">
                  <Clock className="h-3 w-3" />
                  <span>{(message.responseTime / 1000).toFixed(1)}s</span>
                </div>
              )}

              {/* TTS Button - only show for assistant messages when enabled */}
              {voiceOutputEnabled && message.content && (
                <button
                  onClick={handleTTSToggle}
                  disabled={isTTSLoading}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isPlaying
                      ? 'text-cyan-500 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/20'
                      : isTTSLoading
                        ? 'text-slate-500 dark:text-slate-400 cursor-wait'
                        : 'text-slate-500 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10'
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

              {/* Translation Badge - show when message has been translated */}
              {translation && onToggleTranslation && (
                <TranslationBadge
                  targetLanguage={translation.targetLanguage}
                  isShowingTranslation={translation.isShowingTranslation}
                  onToggle={onToggleTranslation}
                />
              )}

              {/* Evidence-based answer quality badge (count fallback for legacy messages) */}
              {(message.evidence || message.sources) && (
                <QualityBadge evidence={message.evidence} sourceCount={message.sources?.length || 0} />
              )}
            </div>
          )}
        </div>

        {/* Sources Fetch Failed Warning */}
        {!isUser && message.sourcesFetchFailed && !message.isStreaming && (
          <div className="zen01-sources-warning mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ {t('chatMessage.sourcesLoadFailed')}
            </span>
          </div>
        )}

        {/* Sources Section - Enhanced Citations */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="zen01-sources mt-3">
            <div className="mb-2">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {t('citationPanel.label', { count: sourceGroups.length })}
              </span>
            </div>
            <div className="space-y-2">
              {visibleGroups?.map((group) => {
                // The primary source of this deduped group; `idx` is its ORIGINAL index in
                // message.sources so the badge/anchor still match the backend's inline [n] refs.
                const source: ZenSource = group.primary;
                const idx = group.primaryIndex;
                const aliasIndices = group.indices.filter((n) => n !== idx);
                // Shared, settings-driven presentation: type badge (ragSettings.sourceTypeLabels),
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

                return (
                  <div
                    key={idx}
                    id={`citation-${message.id}-${idx + 1}`}
                    className={`zen01-source-item scroll-mt-20 ${enableSourceClick ? 'cursor-pointer hover:bg-slate-800/30 dark:hover:bg-slate-800/30' : 'cursor-default'}`}
                    {...(enableSourceClick && {
                      onClick: () => onSourceClick(source, message.sources || [])
                    })}
                  >
                    {/* Hidden anchors for duplicate laws merged into this card, so inline [n]
                        references to those merged sources still scroll here. */}
                    {aliasIndices.map((n) => (
                      <span key={`alias-${n}`} id={`citation-${message.id}-${n + 1}`} aria-hidden className="block h-0 w-0" />
                    ))}
                    {/* Header Row: [1] + type badge + structured metadata chips.
                        Quiet .zen01-chip pills (theme-safe via zen01.css) instead of the
                        loud highlighter markers — keep the info, reduce visual weight. */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        [{idx + 1}]
                      </span>
                      <span className="zen01-chip font-medium">
                        {t(typeInfo.labelKey)}
                      </span>
                      {chips.map((chip) => (
                        <CitationChip
                          key={chip.key}
                          chip={chip}
                          className="zen01-chip"
                        />
                      ))}
                    </div>

                    {/* Source name / origin (law name, document title, or crawl domain) */}
                    {originLabel && originLabel.length > 2 && (
                      <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 mb-1 line-clamp-1" title={originLabel}>
                        {originLabel}
                      </p>
                    )}

                    {/* Single clean description paragraph */}
                    {description && description.length > 15 && (
                      <p className="text-[11px] text-slate-600/90 dark:text-slate-300/80 line-clamp-3 leading-relaxed">
                        {description}
                      </p>
                    )}

                    {/* Official source link (from corpus metadata.url) */}
                    {officialUrl && (
                      <a
                        href={officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t('citations.officialSource')}
                      </a>
                    )}

                  </div>
                );
              })}
            </div>
            {sourceGroups.length > minSourcesToShow && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="mt-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {showAllSources
                  ? t('citationPanel.showLess')
                  : t('citationPanel.moreSources', { count: sourceGroups.length - minSourcesToShow })}
              </button>
            )}
          </div>
        )}

        {/* Follow-up question chips (backend-generated; gated by chatbot.enableFollowUps) */}
        {!isUser && !message.isStreaming && citationSettings.enableFollowUps && (
          <FollowUpChips
            questions={message.followUpQuestions}
            onQuestionClick={onQuestionClick}
            dir={isRtl ? 'rtl' : 'ltr'}
            chipClassName="zen01-followup-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors text-start"
          />
        )}
      </div>

    </motion.div>
  );
};

export default ZenMessage;
