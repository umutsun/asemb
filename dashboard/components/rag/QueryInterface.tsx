'use client';

import { useState } from 'react';
import { Search, Settings, Database, Loader2 } from 'lucide-react';

export function QueryInterface() {
  const [query, setQuery] = useState('');
  const [hybridMode, setHybridMode] = useState(true);
  const [threshold, setThreshold] = useState(0.7);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    
    // TODO: Claude Code - implement actual API call here
    // const response = await apiClient.search(query, { hybridMode, threshold });
    
    // Simulated search for now
    setTimeout(() => {
      setResults([
        {
          id: 1,
          content: 'Sample result for: ' + query,
          score: 0.95,
          source: 'Document 1',
          highlights: [query]
        }
      ]);
      setIsSearching(false);
    }, 1000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search semantic knowledge..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </button>
        </div>
        
        {/* Search Options */}
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hybridMode}
              onChange={(e) => setHybridMode(e.target.checked)}
              className="w-4 h-4"
            />
            <Database className="w-4 h-4 text-gray-600" />
            <span>Hybrid Search (Vector + Keyword)</span>
          </label>
          
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-600" />
            <span>Similarity Threshold:</span>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.1"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="font-mono bg-gray-100 px-2 py-1 rounded">
              {threshold.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">
            Results ({results.length})
          </h3>
          {results.map((result) => (
            <div key={result.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium">{result.source}</h4>
                <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                  Score: {result.score.toFixed(2)}
                </span>
              </div>
              <p className="text-gray-700">{result.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isSearching && results.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Enter a query to search the semantic knowledge base</p>
        </div>
      )}
    </div>
  );
}
