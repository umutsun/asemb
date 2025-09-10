'use client';

import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';
import { Message } from '@/types/chat';
import { SourceCitation } from './source-citation';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  
  // Calculate response quality based on sources
  const getResponseQuality = () => {
    if (isUser || !message.sources) return null;
    const sourceCount = message.sources.length;
    if (sourceCount >= 5) return { text: 'Çok İyi', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    if (sourceCount >= 3) return { text: 'İyi', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
    if (sourceCount >= 1) return { text: 'Orta', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' };
    return { text: 'Düşük', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-900/30' };
  };

  const responseQuality = getResponseQuality();
  
  return (
    <div className={cn(
      'flex gap-3 group animate-in slide-in-from-bottom-2 duration-300',
      isUser ? 'justify-end' : 'justify-start'
    )}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg flex-shrink-0 ring-2 ring-blue-100 dark:ring-blue-900/30">
          <Bot className="w-4 h-4" />
        </div>
      )}
      
      <div className={cn(
        'rounded-2xl px-4 py-3 max-w-[80%] shadow-md transition-all duration-200 hover:shadow-lg',
        isUser 
          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/25' 
          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
      )}>
        {/* Response quality indicator for assistant messages */}
        {responseQuality && (
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">Yanıt Kalitesi:</span>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              responseQuality.bgColor,
              responseQuality.color
            )}>
              {responseQuality.text}
            </span>
            {message.sources && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({message.sources.length} kaynak)
              </span>
            )}
          </div>
        )}
        
        <div className={cn(
          'prose prose-sm max-w-none',
          isUser ? 'prose-invert' : 'prose-gray dark:prose-invert',
          '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
        )}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
        
        {message.sources && message.sources.length > 0 && (
          <SourceCitation sources={message.sources} />
        )}
        
        <div className={cn(
          'text-xs mt-2 opacity-0 group-hover:opacity-70 transition-all duration-200',
          isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
        )}>
          {new Date(message.timestamp).toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
      
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white shadow-lg flex-shrink-0 ring-2 ring-gray-200 dark:ring-gray-700">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}