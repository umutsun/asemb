'use client';

import React, { useState, useCallback } from 'react';
import { Search, Loader2, Filter, X, FileText, Database, Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  category: string;
  sourceTable: string;
  metadata?: any;
}

interface SearchFilters {
  category?: string;
  sourceTable?: string;
  minScore?: number;
  dateRange?: { start: Date; end: Date };
}

export default function RAGSearchInterface() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [searchTime, setSearchTime] = useState<number>(0);

  const performSearch = useCallback(async () => {
    if (!query.trim()) return;

    const startTime = performance.now();
    setLoading(true);
    
    try {
      const response = await apiRequest<{ results: SearchResult[]; total: number }>('/api/search', {
        method: 'POST',
        body: JSON.stringify({ query, filters }),
        cache: true,
      });
      
      setResults(response.results || []);
      setSearchTime(performance.now() - startTime);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, filters]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSearch();
    }
  };

  const getCategoryColor = (category: string): string => {
    const colors: { [key: string]: string } = {
      mevzuat: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      ozelge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      makale: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      karar: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      dokuman: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    };
    return colors[category?.toLowerCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  const getSourceIcon = (source: string) => {
    if (source?.includes('documents')) return <FileText className="w-4 h-4" />;
    if (source?.includes('database')) return <Database className="w-4 h-4" />;
    return <Brain className="w-4 h-4" />;
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            Semantic RAG Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Enter your search query..."
                className="pl-10 pr-4"
                disabled={loading}
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              size="icon"
            >
              <Filter className="w-4 h-4" />
            </Button>
            <Button
              onClick={performSearch}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Search'
              )}
            </Button>
          </div>

          {/* Filters Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-4 p-4 border rounded-lg bg-muted/20"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">Category</label>
                    <select 
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                      onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    >
                      <option value="">All Categories</option>
                      <option value="mevzuat">Mevzuat</option>
                      <option value="ozelge">Özelge</option>
                      <option value="makale">Makale</option>
                      <option value="karar">Karar</option>
                      <option value="dokuman">Doküman</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Min Score</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="0-100"
                      className="mt-1"
                      onChange={(e) => setFilters({ ...filters, minScore: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Source</label>
                    <select 
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                      onChange={(e) => setFilters({ ...filters, sourceTable: e.target.value })}
                    >
                      <option value="">All Sources</option>
                      <option value="documents">Documents</option>
                      <option value="SORUCEVAP">Soru-Cevap</option>
                      <option value="MAKALELER">Makaleler</option>
                      <option value="OZELGELER">Özelgeler</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Stats */}
          {results.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>{results.length} results found</span>
              <span className={searchTime < 200 ? 'text-green-600' : 'text-orange-600'}>
                {searchTime.toFixed(0)}ms
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <ScrollArea className="h-[600px]">
        <AnimatePresence mode="popLayout">
          {results.map((result, index) => (
            <motion.div
              key={result.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="mb-4 hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg flex-1">{result.title}</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {getSourceIcon(result.sourceTable)}
                        <span className="text-xs text-muted-foreground">
                          {result.sourceTable}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {result.score}
                      </Badge>
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
                    {result.content}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={getCategoryColor(result.category)}>
                      {result.category}
                    </Badge>
                    {result.metadata?.date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(result.metadata.date).toLocaleDateString('tr-TR')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </ScrollArea>

      {/* No Results */}
      {!loading && query && results.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">
              No results found for "{query}"
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}