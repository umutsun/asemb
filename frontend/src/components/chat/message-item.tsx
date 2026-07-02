'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { User, Bot, FileText, Volume2, Pause, Loader2, AlertTriangle } from 'lucide-react';
import React from 'react';
import { Message } from '@/types/chat';
import { SourceCitation } from './source-citation';
import { MessageSkeleton } from './message-skeleton';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAudioPlayer } from '@/lib/hooks/use-audio-player';
import { fetchWithAuth } from '@/lib/auth-fetch';
import { prepareMarkdown, detectRtl } from '@/lib/chat-markdown';
import { processCitationRefs } from './citation-refs';
import { FollowUpChips } from './follow-up-chips';
import { getQualityLevel } from './quality-badge';
import type { QualityLevel } from './quality-badge';
import { useCitationSettings } from '@/lib/citation-settings';

// Format file size for display
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Inline [n] citation-reference processing is shared across templates — see ./citation-refs.

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const { t, i18n } = useTranslation();
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const citationSettings = useCitationSettings();

  // Answer language: backend-reported when available; Arabic-script heuristic for legacy messages
  const isRtl = message.language
    ? message.language.toLowerCase().startsWith('ar')
    : (!isUser && detectRtl(message.content));

  // Shared inline [n] citation processing (localized tooltip, RTL-safe markers)
  const withCitationRefs = (children: React.ReactNode) =>
    processCitationRefs(children, {
      getTooltip: (num) => t('citations.sourceN', { num }),
    });

  // Audio player hook for TTS
  const { isPlaying, isLoading, play, pause, stop } = useAudioPlayer({
    onError: (error) => {
      console.error('[MessageItem] TTS error:', error);
    }
  });

  // Fetch voice settings on mount
  useEffect(() => {
    fetchWithAuth(`${apiUrl}/api/v2/chat/voice-settings`)
      .then(res => res.json())
      .then(data => {
        setVoiceOutputEnabled(data.enableVoiceOutput || false);
      })
      .catch(err => {
        console.error('[MessageItem] Failed to fetch voice settings:', err);
      });
  }, [apiUrl]);

  // Handle TTS play/pause
  const handleTTSToggle = () => {
    if (isPlaying) {
      pause();
    } else {
      // Extract plain text from markdown content
      const plainText = message.content
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

  // Show skeleton loading for streaming assistant messages
  if (message.isStreaming && message.isLoading && !isUser) {
    // Map status to skeleton type
    const getSkeletonType = () => {
      switch (message.status) {
        case 'reading-document':
          return 'reading-document';
        case 'searching':
          return 'searching';
        case 'generating':
          return 'generating';
        default:
          return 'default';
      }
    };

    return (
      <MessageSkeleton
        type={getSkeletonType()}
        message={message.statusMessage}
      />
    );
  }

  // Response quality: evidence-gate based when the backend provided it,
  // source-count fallback for legacy messages (see quality-badge.tsx).
  const getResponseQuality = () => {
    if (isUser || (!message.sources && !message.evidence)) return null;
    const level = getQualityLevel(message.evidence, message.sources?.length || 0);
    const styles: Record<QualityLevel, { color: string; bgColor: string }> = {
      veryGood: { color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/70' },
      good: { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/70' },
      medium: { color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/70' },
      low: { color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-900/70' },
    };
    return { text: t(`chatMessage.quality.${level}`), ...styles[level] };
  };

  const responseQuality = getResponseQuality();

  return (
    <div className={cn(
      'flex group animate-in slide-in-from-bottom-2 duration-300',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'rounded-2xl px-4 py-3 sm:px-5 sm:py-4 min-w-0 max-w-[88%] sm:max-w-[80%] transition-all duration-200',
        isUser
          ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30'
          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
      )}>
        {/* Inline bot avatar - removed, now inline with content */}
        {/* Response quality indicator for assistant messages */}
        {responseQuality && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('chatMessage.quality.label')}</span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              responseQuality.bgColor,
              responseQuality.color
            )}>
              {responseQuality.text}
            </span>
            {message.sources && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {t('chatMessage.topicsCount', { count: message.sources.length })}
              </span>
            )}
          </div>
        )}

        {/* Article anchoring warning - when user asked about specific law article but it wasn't found */}
        {!isUser && message.articleQuery?.detected && !message.articleQuery?.exactMatchFound && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-200">
              <strong>{message.articleQuery.lawCode} {t('chatMessage.article')} {message.articleQuery.articleNumber}</strong> {t('chatMessage.articleNotFoundBody')}
            </span>
          </div>
        )}
        
        {isUser ? (
          <div>
            <div className="text-sm whitespace-pre-wrap">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 me-1.5 align-middle">
                <User className="w-3 h-3" />
              </span>
              {message.content}
            </div>
            {/* PDF attachment badge for user messages */}
            {message.pdfAttachment && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-blue-400/30">
                <FileText className="w-3.5 h-3.5 text-blue-100" />
                <span className="text-xs text-blue-100 truncate max-w-[200px]" title={message.pdfAttachment.filename}>
                  {message.pdfAttachment.filename}
                </span>
                <span className="text-xs text-blue-200/70">
                  ({formatFileSize(message.pdfAttachment.size)})
                </span>
              </div>
            )}
          </div>
        ) : (
          <div dir={isRtl ? 'rtl' : 'ltr'} className={cn(
            'prose max-w-none',
            'prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-headings:font-semibold',
            'prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-p:my-2 prose-p:leading-relaxed',
            'prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-semibold',
            'prose-ul:my-2 prose-ul:ps-4 prose-li:my-1',
            'prose-ol:my-2 prose-ol:ps-4',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
          )}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom heading styles — sizes relative to prose (16px base)
                h1: ({ children }) => (
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-4 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4 mb-2">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1">
                    {children}
                  </h3>
                ),
                // Paragraphs - with clickable citation refs
                p: ({ children }) => (
                  <p className="text-gray-800 dark:text-gray-200 my-2 leading-relaxed">
                    {withCitationRefs(children)}
                  </p>
                ),
                // Bold text - with clickable citation refs
                strong: ({ children }) => (
                  <strong className="font-semibold text-gray-900 dark:text-white">
                    {withCitationRefs(children)}
                  </strong>
                ),
                // Unordered lists
                ul: ({ children }) => (
                  <ul className="list-disc list-outside ms-4 my-2 space-y-1">
                    {children}
                  </ul>
                ),
                // Ordered lists
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside ms-4 my-2 space-y-1">
                    {children}
                  </ol>
                ),
                // List items - with clickable citation refs
                li: ({ children }) => (
                  <li className="text-gray-800 dark:text-gray-200 ps-1">
                    {withCitationRefs(children)}
                  </li>
                ),
                // Blockquotes (for warnings/notes)
                blockquote: ({ children }) => (
                  <blockquote className="border-s-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20 ps-4 py-2 my-3 text-amber-800 dark:text-amber-200 italic">
                    {children}
                  </blockquote>
                ),
                // Code blocks
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200">
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-gray-100 dark:bg-gray-800 p-3 rounded-lg text-sm font-mono overflow-x-auto">
                      {children}
                    </code>
                  );
                },
              }}
            >
              {prepareMarkdown(message.content, { lang: message.language })}
            </ReactMarkdown>
          </div>
        )}

        {message.sources && message.sources.length > 0 && (
          <SourceCitation
            sources={message.sources}
            onExcerptClick={(question) => {
              // Send the question to the input field
              const inputEvent = new CustomEvent('addToInput', { detail: question });
              window.dispatchEvent(inputEvent);
            }}
          />
        )}

        {/* Follow-up question chips (backend-generated; gated by chatbot.enableFollowUps) */}
        {!isUser && !message.isLoading && citationSettings.enableFollowUps && (
          <FollowUpChips
            questions={message.followUpQuestions}
            dir={isRtl ? 'rtl' : 'ltr'}
            onQuestionClick={(question) => {
              // Same mechanism as source excerpt clicks: fill the chat input
              window.dispatchEvent(new CustomEvent('addToInput', { detail: question }));
            }}
          />
        )}
        
        <div className={cn(
          'flex items-center justify-between mt-2 opacity-0 group-hover:opacity-70 transition-all duration-200',
          isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
        )}>
          <span className="text-xs">
            {new Date(message.timestamp).toLocaleTimeString(i18n.language || 'en', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          {/* TTS button for assistant messages */}
          {!isUser && voiceOutputEnabled && message.content && !message.isLoading && (
            <button
              type="button"
              onClick={handleTTSToggle}
              disabled={isLoading}
              className={cn(
                'p-1 rounded transition-colors',
                isPlaying
                  ? 'text-blue-500 hover:text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                  : isLoading
                    ? 'text-gray-400 cursor-wait'
                    : 'hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
              title={isPlaying ? t('chatMessage.tts.stop') : isLoading ? t('chatMessage.tts.loading') : t('chatMessage.tts.listen')}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}