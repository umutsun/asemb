'use client';

import { Source } from '@/types/chat';
import { ExternalLink, FileText, Scale, BookOpen, MessageSquare, Database } from 'lucide-react';

interface SourceCitationProps {
  sources: Source[];
}

export function SourceCitation({ sources }: SourceCitationProps) {
  if (!sources || sources.length === 0) return null;

  // Helper function to get source table display name
  const getSourceTableName = (sourceTable?: string) => {
    const tableNames: { [key: string]: string } = {
      'OZELGELER': 'Özelgeler',
      'DANISTAYKARARLARI': 'Danıştay Kararları',
      'MAKALELER': 'Makaleler',
      'SORUCEVAP': 'Soru Cevap',
      'Kaynak': 'Genel Kaynak',
      'embeddings': 'Dokümanlar',
      'chunks': 'Metin Parçaları',
      'sources': 'Kaynaklar'
    };
    return tableNames[sourceTable || ''] || sourceTable || 'Kaynak';
  };

  // Helper function to get icon based on source table
  const getSourceIcon = (sourceTable?: string) => {
    switch (sourceTable) {
      case 'OZELGELER':
        return <FileText className="w-3 h-3" />;
      case 'DANISTAYKARARLARI':
        return <Scale className="w-3 h-3" />;
      case 'MAKALELER':
        return <BookOpen className="w-3 h-3" />;
      case 'SORUCEVAP':
        return <MessageSquare className="w-3 h-3" />;
      default:
        return <Database className="w-3 h-3" />;
    }
  };

  // Helper function to get badge color based on source table
  const getBadgeColor = (sourceTable?: string) => {
    switch (sourceTable) {
      case 'OZELGELER':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'DANISTAYKARARLARI':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'MAKALELER':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'SORUCEVAP':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-gray-100/60 dark:border-gray-600/30">
      <p className="text-xs font-medium mb-3 text-gray-600 dark:text-gray-400 flex items-center gap-1">
        <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
        Kaynaklar:
      </p>
      <div className="space-y-2">
        {sources.map((source, index) => (
          <div key={source.id} className="group">
            <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors duration-200">
              <div className="mt-0.5 text-blue-500 dark:text-blue-400 opacity-70 group-hover:opacity-100 transition-opacity">
                {getSourceIcon(source.sourceTable)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium line-clamp-2"
                    >
                      {source.citation || source.title}
                    </a>
                  ) : (
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-2">
                      {source.citation || source.title}
                    </span>
                  )}
                  {source.sourceTable && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getBadgeColor(source.sourceTable)}`}>
                      {getSourceTableName(source.sourceTable)}
                    </span>
                  )}
                  {source.relevanceScore && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      %{source.relevanceScore}
                    </span>
                  )}
                </div>
                {source.excerpt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                    {source.excerpt}
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {index + 1}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}