'use client';

import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';
import { Message } from '@/types/chat';
import { MessageItem } from './message-item';
import { TypingIndicator } from './typing-indicator';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-lg mx-auto p-8 animate-in fade-in-50 slide-in-from-bottom-4 duration-700">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg ring-2 ring-blue-100 dark:ring-blue-900/30 animate-pulse">
            <MessageSquare className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            ASB Hukuki Asistan
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Türk hukuku hakkında soru sorun, belgeler arasında arama yapın ve hukuki danışmanlık alın.
          </p>
          <div className="grid grid-cols-1 gap-3 text-left">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">📚 Hukuki Araştırma</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">İlgili kararları ve kanunları bulun</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">📄 Belge Analizi</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sözleşme ve yasal belgeleri inceleyin</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">⚖️ İçtihat Hukuku</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Emsal kararları ve içtihatlari keşfedin</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 bg-gradient-to-b from-gray-50/30 to-transparent dark:from-gray-900/30">
      {messages.map((message, index) => (
        <div
          key={message.id}
          className="animate-in slide-in-from-bottom-4 fade-in-50"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <MessageItem message={message} />
        </div>
      ))}
      {isLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}