'use client';

import React, { useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import {
    ExternalLink,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Loader2,
    Copy,
    Check,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { prepareMarkdown, detectRtl } from '@/lib/chat-markdown';
import {
    getSourceTypeInfo,
    buildCitationChips,
    buildCitationTooltip,
    getOfficialSourceUrl
} from '@/lib/source-presentation';
import { useCitationSettings } from '@/lib/citation-settings';
import { processCitationRefs } from '@/components/chat/citation-refs';
import { CitationChip } from '@/components/chat/citation-chip';
import { FollowUpChips } from '@/components/chat/follow-up-chips';
import { QualityBadge } from '@/components/chat/quality-badge';
import type { Message, Source } from '../types';

interface ModernMessageItemProps {
    message: Message;
    visibleSourcesCount: number;
    initialSourcesCount: number;
    lastUserQuery: string;
    onSourceClick: (source: Source) => void;
    onShowMoreSources: (messageId: string, newCount: number, totalCount: number) => void;
    onShowLessSources: (messageId: string, initialCount: number) => void;
    onRetry?: (messageContent: string) => void;
    /** Fills the chat input with a follow-up question (defaults to the app-wide addToInput event) */
    onQuestionClick?: (question: string) => void;
    getSemanticKeywords: (source: Source) => string[];
    getKeywordColor: (keyword: string, isBoosted: boolean) => string;
}

const ModernMessageItem = memo(function ModernMessageItem({
    message,
    visibleSourcesCount,
    initialSourcesCount,
    lastUserQuery,
    onSourceClick,
    onShowMoreSources,
    onShowLessSources,
    onRetry,
    onQuestionClick,
    getSemanticKeywords,
    getKeywordColor
}: ModernMessageItemProps) {
    const { t, i18n } = useTranslation();
    const [copied, setCopied] = useState(false);
    const citationSettings = useCitationSettings();

    // Answer language: backend-reported when available; Arabic-script heuristic for legacy messages
    const isRtl = message.language
        ? message.language.toLowerCase().startsWith('ar')
        : (message.role === 'assistant' && detectRtl(message.content));
    const chipLang = message.language || i18n.language;

    // Keep each source's ORIGINAL index: inline [n] refs in the answer are numbered
    // against the backend's source order, not the score-sorted display order.
    const indexedSources = (message.sources || []).map((source, originalIndex) => ({ source, originalIndex }));
    const sortedSources = [...indexedSources].sort((a, b) => (b.source.score || 0) - (a.source.score || 0));
    const visibleSources = sortedSources.slice(0, visibleSourcesCount);
    const hasMore = sortedSources.length > visibleSourcesCount;
    const canShowLess = visibleSourcesCount > initialSourcesCount;

    const refAnchorId = useCallback(
        (num: string) => `source-ref-${message.id}-${num}`,
        [message.id]
    );
    const refTooltip = useCallback(
        (num: string) => {
            const item = indexedSources[parseInt(num, 10) - 1];
            return item
                ? buildCitationTooltip(item.source, message.language)
                : t('citations.sourceN', { num });
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [message.sources, message.language, t]
    );
    const withCitationRefs = (children: React.ReactNode) =>
        processCitationRefs(children, { getAnchorId: refAnchorId, getTooltip: refTooltip });

    // Copy message content
    const handleCopy = useCallback(async () => {
        try {
            // Strip HTML tags for plain text copy
            const plainText = message.content
                .replace(/<[^>]*>/g, '')
                .replace(/\*\*\[([0-9,\s]+)\]\*\*/g, '[$1]');

            await navigator.clipboard.writeText(plainText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [message.content]);

    // Retry failed message
    const handleRetry = useCallback(() => {
        if (onRetry && message.isError) {
            onRetry(lastUserQuery);
        }
    }, [onRetry, message.isError, lastUserQuery]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            role="listitem"
            aria-label={message.role === 'user' ? t('chat.userMessage', 'User message') : t('chat.assistantMessage', 'Assistant message')}
        >
            <div className={`max-w-[90%] sm:max-w-[80%]`}>
                {/* Message Bubble */}
                <div
                    className={`group relative p-3 sm:p-4 transition-all duration-200 ${
                        message.role === 'user'
                            ? message.isFromSource
                                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border border-amber-200 dark:border-amber-700 rounded-2xl rounded-tr-sm'
                                : 'bg-violet-600 text-white rounded-2xl rounded-tr-sm shadow-md'
                            : message.isError
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-200 rounded-2xl rounded-tl-sm'
                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm'
                    }`}
                >
                    {/* From Source Badge */}
                    {message.role === 'user' && message.isFromSource && (
                        <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
                            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="text-xs font-medium">{t('chat.fromSource', 'From source')}</span>
                        </div>
                    )}

                    {/* Error Icon */}
                    {message.isError && (
                        <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                            <AlertCircle className="w-4 h-4" aria-hidden="true" />
                            <span className="text-xs font-medium">{t('chat.error', 'Error')}</span>
                        </div>
                    )}

                    {/* Message Content */}
                    {message.isTyping || (message.isStreaming && !message.content) ? (
                        <div className="space-y-2 py-1" role="status" aria-label={t('chat.typing', 'Typing...')}>
                            <Skeleton className="h-3 w-full bg-slate-200 dark:bg-slate-700" />
                            <Skeleton className="h-3 w-4/5 bg-slate-200 dark:bg-slate-700" />
                            <Skeleton className="h-3 w-3/5 bg-slate-200 dark:bg-slate-700" />
                        </div>
                    ) : message.role === 'assistant' ? (
                        <div
                            dir={isRtl ? 'rtl' : 'ltr'}
                            className="prose prose-slate dark:prose-invert prose-sm max-w-none text-sm sm:text-base leading-relaxed prose-strong:text-violet-700 dark:prose-strong:text-violet-300 prose-headings:text-slate-800 dark:prose-headings:text-slate-100 prose-p:my-2 prose-li:my-0.5"
                        >
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    // Clickable inline [n] citation refs (scroll to the matching card)
                                    p: ({ children }) => <p>{withCitationRefs(children)}</p>,
                                    li: ({ children }) => <li>{withCitationRefs(children)}</li>,
                                    strong: ({ children }) => <strong>{withCitationRefs(children)}</strong>
                                }}
                            >
                                {prepareMarkdown(message.content, { lang: message.language })}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                            {message.content}
                        </p>
                    )}

                    {/* Action Buttons - Show on hover for assistant messages */}
                    {message.role === 'assistant' && !message.isStreaming && !message.isTyping && (
                        <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1">
                            {/* Copy Button */}
                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                aria-label={copied ? t('chat.copied', 'Copied') : t('chat.copy', 'Copy')}
                                title={copied ? t('chat.copied', 'Copied') : t('chat.copy', 'Copy')}
                            >
                                {copied ? (
                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                )}
                            </button>

                            {/* Retry Button - Only for error messages */}
                            {message.isError && onRetry && (
                                <button
                                    onClick={handleRetry}
                                    className="p-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                    aria-label={t('chat.retry', 'Retry')}
                                    title={t('chat.retry', 'Retry')}
                                >
                                    <RefreshCw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Sources Section - Hidden in Fast Mode */}
                    {message.sources && message.sources.length > 0 && !message.fastMode && (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div
                                className="space-y-2.5 max-h-[400px] sm:max-h-[500px] overflow-y-auto pr-2 modern-scrollbar"
                                aria-label={t('chat.sources', 'Sources')}
                            >
                                {visibleSources.map(({ source, originalIndex }) => {
                                    const typeInfo = getSourceTypeInfo(source.sourceTable, source.metadata, citationSettings.sourceTypeLabels);
                                    const chips = buildCitationChips(source, chipLang, citationSettings.fieldLabels, citationSettings.priorityFields);
                                    const officialUrl = citationSettings.showOfficialSourceLink
                                        ? getOfficialSourceUrl(source) : undefined;
                                    return (
                                        <div
                                            key={originalIndex}
                                            id={`source-ref-${message.id}-${originalIndex + 1}`}
                                            tabIndex={0}
                                            onClick={() => onSourceClick(source)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    onSourceClick(source);
                                                }
                                            }}
                                            className="group/source w-full text-left scroll-mt-20 cursor-pointer p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                                            aria-label={`${t('citations.sourceN', { num: originalIndex + 1 })}: ${source.title || source.summary || t('chat.untitledSource', 'Untitled source')}`}
                                        >
                                            <div className="flex items-start gap-2.5 sm:gap-3">
                                                <div className="min-w-0 flex-1">
                                                    {/* Source Number & Type & Category */}
                                                    <div className="flex items-center gap-2 mb-1.5 sm:mb-2 flex-wrap">
                                                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-200 border border-violet-300 dark:border-violet-600 font-bold">
                                                            {originalIndex + 1}
                                                        </span>
                                                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                                                            {t(typeInfo.labelKey)}
                                                        </span>
                                                        {source.category && (
                                                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                                                                {source.category}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Structured metadata chips (law title, article, year, ...) */}
                                                    {chips.length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-1.5">
                                                            {chips.map((chip) => (
                                                                <CitationChip
                                                                    key={chip.key}
                                                                    chip={chip}
                                                                    className="rounded bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700/50 px-1.5 py-0.5 text-[9px] sm:text-[10px] text-violet-700 dark:text-violet-200"
                                                                />
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Summary/Excerpt */}
                                                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed line-clamp-2 sm:line-clamp-3">
                                                        {source.summary || source.excerpt || source.content || source.title || t('chat.untitledSource', 'Untitled source')}
                                                    </p>

                                                    {/* Keywords */}
                                                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mt-1.5 sm:mt-2">
                                                        {getSemanticKeywords(source).slice(0, 3).map((keyword: string, kidx: number) => {
                                                            const isBoosted = kidx < 2 && lastUserQuery.length > 0;
                                                            return (
                                                                <span
                                                                    key={kidx}
                                                                    className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded border ${getKeywordColor(keyword, isBoosted)}`}
                                                                >
                                                                    {keyword}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Official source link (from corpus metadata.url) */}
                                                    {officialUrl && (
                                                        <a
                                                            href={officialUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-violet-600 dark:text-violet-300 hover:underline"
                                                        >
                                                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                                            {t('citations.officialSource')}
                                                        </a>
                                                    )}
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover/source:text-violet-500 dark:group-hover/source:text-violet-400 flex-shrink-0 transition-colors" aria-hidden="true" />
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Show more/less buttons */}
                                {(hasMore || canShowLess) && (
                                    <div className="flex items-center justify-center gap-2 pt-2 sm:pt-3">
                                        {hasMore && (
                                            <button
                                                onClick={() => onShowMoreSources(message.id, Math.min(visibleSourcesCount + 5, sortedSources.length), sortedSources.length)}
                                                className="group/btn flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-500/10 hover:bg-violet-200 dark:hover:bg-violet-500/20 border border-violet-300 dark:border-violet-500/20 hover:border-violet-400 dark:hover:border-violet-500/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                aria-label={t('citationPanel.moreSources', { count: Math.min(5, sortedSources.length - visibleSourcesCount) })}
                                            >
                                                <span className="text-[10px] sm:text-xs font-medium text-violet-700 dark:text-violet-400">
                                                    {t('citationPanel.moreSources', { count: Math.min(5, sortedSources.length - visibleSourcesCount) })}
                                                </span>
                                                <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-violet-700 dark:text-violet-400 group-hover/btn:translate-y-0.5 transition-transform" aria-hidden="true" />
                                            </button>
                                        )}
                                        {canShowLess && (
                                            <button
                                                onClick={() => onShowLessSources(message.id, initialSourcesCount)}
                                                className="group/btn flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-200 dark:bg-slate-700/30 hover:bg-slate-300 dark:hover:bg-slate-700/50 border border-slate-300 dark:border-slate-600/20 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
                                                aria-label={t('citationPanel.showLess')}
                                            >
                                                <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-600 dark:text-slate-400 group-hover/btn:-translate-y-0.5 transition-transform" aria-hidden="true" />
                                                <span className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400">
                                                    {t('citationPanel.showLess')}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Follow-up question chips (backend-generated; gated by chatbot.enableFollowUps) */}
                    {message.role === 'assistant' && !message.isStreaming && !message.isTyping && citationSettings.enableFollowUps && (
                        <FollowUpChips
                            questions={message.followUpQuestions}
                            onQuestionClick={onQuestionClick}
                            dir={isRtl ? 'rtl' : 'ltr'}
                            chipClassName="inline-flex items-center gap-1.5 rounded-full border border-violet-300 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 text-xs text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors text-start"
                        />
                    )}
                </div>

                {/* Message Footer */}
                {message.role === 'assistant' && (
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 sm:mt-2 px-1">
                        <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 tabular-nums">
                            {message.isStreaming && message.startTime ? (
                                <span className="inline-flex items-center gap-1" role="status" aria-label={t('chat.generating', 'Generating')}>
                                    <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" aria-hidden="true" />
                                    {Math.floor((Date.now() - message.startTime) / 1000)}s
                                </span>
                            ) : (
                                <>
                                    <time dateTime={new Date(message.timestamp).toISOString()}>
                                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </time>
                                    {message.responseTime && (
                                        <span aria-label={t('chat.responseTime', 'Response time')}>
                                            {' '}&bull; {(message.responseTime / 1000).toFixed(1)}s
                                        </span>
                                    )}
                                    {message.tokens?.total && (
                                        <span className="hidden sm:inline" aria-label={t('chat.tokens', 'Token count')}>
                                            {' '}&bull; {message.tokens.total.toLocaleString()} tokens
                                        </span>
                                    )}
                                </>
                            )}
                        </span>

                        {/* Evidence-based answer quality badge (count fallback for legacy messages) */}
                        {!message.isStreaming && (message.evidence || message.sources) && (
                            <QualityBadge evidence={message.evidence} sourceCount={message.sources?.length || 0} />
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
});

export default ModernMessageItem;
