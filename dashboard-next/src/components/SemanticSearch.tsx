'use client';

import { useState } from 'react';
import { Search, Loader2, FileText, Database, Brain } from 'lucide-react';

interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: any;
  source?: string;
}

export default function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('embeddings');

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          table: selectedTable,
          limit: 10 
        }),
      });
      
      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <Brain className="w-6 h-6 text-blue-500" />
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Semantic Search
        </h2>
      </div>

      {/* Table Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Select Database Table
        </label>
        <select
          value={selectedTable}
          onChange={(e) => setSelectedTable(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="embeddings">Embeddings</option>
          <option value="chunks">Chunks</option>
          <option value="SORUCEVAP">Soru-Cevap</option>
          <option value="MAKALELER">Makaleler</option>
          <option value="DANISTAYKARARLARI">Danıştay Kararları</option>
        </select>
      </div>

      {/* Search Input */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Enter your semantic search query..."
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                     placeholder-gray-500 dark:placeholder-gray-400"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 
                     text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
          Search
        </button>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {results.length > 0 && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Found {results.length} results in {selectedTable}
          </div>
        )}
        
        {results.map((result, index) => (
          <div
            key={result.id || index}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg
                       hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Similarity: {(result.similarity * 100).toFixed(1)}%
                </span>
              </div>
              {result.source && (
                <div className="flex items-center gap-1">
                  <Database className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-gray-500">{result.source}</span>
                </div>
              )}
            </div>
            
            <p className="text-gray-800 dark:text-gray-200 line-clamp-3">
              {result.content}
            </p>
            
            {result.metadata && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {JSON.stringify(result.metadata).substring(0, 100)}...
              </div>
            )}
          </div>
        ))}
        
        {!loading && query && results.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No results found for your query
          </div>
        )}
      </div>
    </div>
  );
}