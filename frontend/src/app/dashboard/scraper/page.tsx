'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Globe, 
  Play, 
  Link,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
  Trash2,
  RefreshCw,
  FileText,
  Database,
  Hash
} from 'lucide-react';

interface ScrapeJob {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  chunks?: number;
  content?: string;
  contentLength?: number;
  error?: string;
  startTime: Date;
  endTime?: Date;
  metadata?: {
    title?: string;
    description?: string;
    contentLength?: number;
  };
}

export default function WebScraperPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ScrapeJob | null>(null);
  const [scrapeOptions, setScrapeOptions] = useState({
    storeEmbeddings: true,
    saveToDb: false,
    mode: 'static'
  });
  const [scrapingHistory, setScrapingHistory] = useState<any[]>([]);

  useEffect(() => {
    // Fetch scraping history
    fetchHistory();
    // Refresh every 5 seconds
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/scraper?limit=50');
      if (response.ok) {
        const data = await response.json();
        setScrapingHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleScrape = async () => {
    if (!url) return;

    // Validate URL
    try {
      new URL(url);
    } catch {
      alert('Lütfen geçerli bir URL girin');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('http://localhost:3001/api/v2/scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          ...scrapeOptions,
        }),
      });

      // Check if response is JSON
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 200));
        data = { error: 'Server returned non-JSON response' };
      }

      if (response.ok && data && !data.error) {
        // Success - refresh history
        await fetchHistory();
        setUrl('');
        
        // Show latest scraped content
        if (data.content) {
          setSelectedJob({
            id: `job_${Date.now()}`,
            url: url,
            status: 'completed',
            progress: 100,
            content: data.content,
            contentLength: data.contentLength || 0,
            startTime: new Date(),
            endTime: new Date(),
            metadata: data.metadata
          });
        }
      } else {
        alert(data?.error || 'Scraping failed');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      alert('Scraping failed');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', { 
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Web Scraper</h1>
        <p className="text-muted-foreground mt-2">
          Web sayfalarından içerik çekin ve analiz edin
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Scrape Input & Options */}
        <div className="space-y-6">
          {/* Input Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Yeni Scrape</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleScrape()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleScrape} 
                  disabled={loading || !url}
                  size="sm"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Quick Options */}
              <div className="flex gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scrapeOptions.storeEmbeddings}
                    onChange={(e) => setScrapeOptions({...scrapeOptions, storeEmbeddings: e.target.checked})}
                  />
                  Embedding
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scrapeOptions.saveToDb}
                    onChange={(e) => setScrapeOptions({...scrapeOptions, saveToDb: e.target.checked})}
                  />
                  Veritabanına Kaydet
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={scrapeOptions.mode === 'dynamic'}
                    onChange={(e) => setScrapeOptions({...scrapeOptions, mode: e.target.checked ? 'dynamic' : 'static'})}
                  />
                  Dinamik
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Selected Content Preview */}
          {selectedJob && selectedJob.content && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">İçerik Önizleme</CardTitle>
                  <Badge>{selectedJob.contentLength} karakter</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {typeof selectedJob.content === 'string' 
                      ? selectedJob.content.substring(0, 2000) 
                      : JSON.stringify(selectedJob.content, null, 2).substring(0, 2000)}
                    {(selectedJob.contentLength || 0) > 2000 && '...'}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - History */}
        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Scrape Geçmişi</CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={fetchHistory}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {scrapingHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p>Henüz scrape geçmişi yok</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scrapingHistory.map((item, index) => (
                    <div 
                      key={item.id || index}
                      className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedJob(item as any)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {item.title || 'Başlıksız'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.url}
                          </p>
                        </div>
                        {item.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 ml-2" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 ml-2" />
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {item.contentLength ? formatFileSize(item.contentLength) : '0 B'}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {item.contentLength || 0} karakter
                        </span>
                        {item.mode && (
                          <Badge variant="outline" className="text-xs py-0 h-5">
                            {item.mode}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {item.scrapedAt ? formatDate(item.scrapedAt) : 'Tarih yok'}
                        </span>
                        {item.metadata?.description && (
                          <Badge variant="secondary" className="text-xs">
                            Meta
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}