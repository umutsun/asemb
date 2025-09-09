/**
 * RAG Results Display Component
 * Displays search results with confidence scores and source attribution
 */

import React, { useState } from 'react';
import { 
  FileText, 
  ExternalLink, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  Tag,
  Clock,
  Database,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import type { SearchResult } from '../../lib/api-client';

interface ResultsDisplayProps {
  results: SearchResult[];
  loading?: boolean;
  error?: string | null;
  searchMode?: 'vector' | 'keyword' | 'hybrid';
  query?: string;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  results,
  loading = false,
  error = null,
  searchMode = 'hybrid',
  query = '',
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());

  // Toggle expanded state
  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  // Copy content to clipboard
  const copyToClipboard = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedItems(new Set(copiedItems).add(id));
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Get confidence color
  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.7) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 0.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  // Get confidence label
  const getConfidenceLabel = (score: number) => {
    if (score >= 0.9) return 'Very High';
    if (score >= 0.7) return 'High';
    if (score >= 0.5) return 'Medium';
    return 'Low';
  };

  // Highlight query terms in content
  const highlightQuery = (text: string, query: string) => {
    if (!query) return text;
    
    const terms = query.toLowerCase().split(' ').filter(t => t.length > 2);
    let highlightedText = text;
    
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
    });
    
    return highlightedText;
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
            <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start">
        <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
        <div>
          <h3 className="font-medium text-red-800">Search Error</h3>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // No results
  if (results.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-12 text-center">
        <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Try adjusting your search terms or reducing the similarity threshold
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-medium">Search Results</h3>
          <span className="px-2 py-1 text-xs bg-gray-100 rounded-full">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
          {searchMode === 'hybrid' && (
            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center">
              <Sparkles className="w-3 h-3 mr-1" />
              Hybrid Search
            </span>
          )}
        </div>
      </div>

      {/* Results List */}
      {results.map((result, index) => {
        const isExpanded = expandedItems.has(result.id);
        const isCopied = copiedItems.has(result.id);
        const confidenceClass = getConfidenceColor(result.score);
        const confidenceLabel = getConfidenceLabel(result.score);
        
        return (
          <div
            key={result.id}
            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="p-6">
              {/* Result Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-sm text-gray-500">#{index + 1}</span>
                    
                    {/* Confidence Score */}
                    <div className={`px-2 py-1 rounded-full text-xs font-medium border ${confidenceClass}`}>
                      {(result.score * 100).toFixed(1)}% {confidenceLabel}
                    </div>
                    
                    {/* Source */}
                    {result.source && (
                      <div className="flex items-center text-xs text-gray-500">
                        <FileText className="w-3 h-3 mr-1" />
                        {result.source}
                      </div>
                    )}
                    
                    {/* Chunk Info */}
                    {result.chunkIndex !== undefined && (
                      <div className="text-xs text-gray-500">
                        Chunk {result.chunkIndex + 1}
                        {result.totalChunks && ` of ${result.totalChunks}`}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => copyToClipboard(result.id, result.content)}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Copy content"
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  
                  {result.sourceId && (
                    <button
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="View source"
                    >
                      <ExternalLink className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => toggleExpanded(result.id)}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Content Preview */}
              <div className="text-sm text-gray-700 leading-relaxed">
                {isExpanded ? (
                  <div 
                    dangerouslySetInnerHTML={{ 
                      __html: highlightQuery(result.content, query) 
                    }}
                  />
                ) : (
                  <div 
                    className="line-clamp-3"
                    dangerouslySetInnerHTML={{ 
                      __html: highlightQuery(
                        result.content.substring(0, 300) + (result.content.length > 300 ? '...' : ''),
                        query
                      ) 
                    }}
                  />
                )}
              </div>

              {/* Highlights */}
              {result.highlights && result.highlights.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-xs text-gray-500 mb-2">Key matches:</div>
                  <div className="space-y-1">
                    {result.highlights.slice(0, 3).map((highlight, idx) => (
                      <div 
                        key={idx}
                        className="text-sm text-gray-600 pl-3 border-l-2 border-yellow-300"
                        dangerouslySetInnerHTML={{ __html: highlight }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              {isExpanded && result.metadata && Object.keys(result.metadata).length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-gray-500 mb-2">Metadata:</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(result.metadata).map(([key, value]) => (
                      <div 
                        key={key}
                        className="inline-flex items-center px-2 py-1 bg-gray-100 rounded text-xs"
                      >
                        <Tag className="w-3 h-3 mr-1 text-gray-400" />
                        <span className="text-gray-600">{key}:</span>
                        <span className="ml-1 text-gray-800">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Load More */}
      {results.length >= 10 && (
        <div className="text-center pt-4">
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            Load more results
          </button>
        </div>
      )}
    </div>
  );
};