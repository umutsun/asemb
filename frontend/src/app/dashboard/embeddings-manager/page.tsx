'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Database, 
  Upload, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Activity,
  Search,
  Play,
  Pause,
  Zap,
  Loader2,
  Settings,
  ExternalLink,
  Server
} from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TableInfo {
  name: string;
  displayName: string;
  database: string;
  totalRecords: number;
  embeddedRecords: number;
  textColumns: number;
}

interface MigrationStats {
  database: string;
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  tables: Array<{
    name: string;
    count: number;
    embedded: number;
    pending: number;
  }>;
}

interface EmbeddingProgress {
  status: string;
  current: number;
  total: number;
  percentage: number;
  currentTable: string | null;
  error: string | null;
  tokensUsed?: number;
  estimatedCost?: number;
  startTime?: number;
  estimatedTimeRemaining?: number;
  processedTables?: string[];
  currentBatch?: number;
  totalBatches?: number;
  alreadyEmbedded?: number;
  pendingCount?: number;
  successCount?: number;
  errorCount?: number;
  newlyEmbedded?: number;
}

export default function EmbeddingsManagerPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [migrationStats, setMigrationStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [batchSize, setBatchSize] = useState(50);
  const [workerCount, setWorkerCount] = useState(2);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Backend base URL for direct connections (SSE, pause, etc.)
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  useEffect(() => {
    fetchAvailableTables();
    fetchMigrationStats();
    checkProgress();
    
    // Cleanup on unmount
    return () => {
      if ((window as any).currentEventSource) {
        (window as any).currentEventSource.close();
        (window as any).currentEventSource = null;
      }
      if ((window as any).currentPollInterval) {
        clearInterval((window as any).currentPollInterval);
        (window as any).currentPollInterval = null;
      }
    };
  }, []);

  const fetchAvailableTables = async () => {
    setIsLoadingTables(true);
    try {
      // Use Next.js API proxy to avoid CORS and centralize config
      const response = await fetch('/api/embeddings/tables');
      if (response.ok) {
        try { connectToProgressStream(); } catch (_) {}
        // Open SSE stream for real-time updates after starting
        try { connectToProgressStream(); } catch (_) {}
        const data = await response.json();
        setAvailableTables(data.tables || []);
        // Set first table as default if available
        if (data.tables && data.tables.length > 0 && !selectedTable) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      setError('Veritabanı tabloları yüklenemedi. Veritabanı bağlantınızı kontrol edin.');
    } finally {
      setIsLoadingTables(false);
    }
  };

  const fetchMigrationStats = async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch('/api/embeddings/stats');
      if (response.ok) {
        const data = await response.json();
        setMigrationStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const checkProgress = async () => {
    try {
      console.log('Checking initial progress...');
      // Align with backend route: embeddings/progress (not migration/progress)
      const response = await fetch('/api/embeddings/progress');
      if (response.ok) {
        const data = await response.json();
        console.log('Initial progress check:', data);
        if (data && (data.status === 'processing' || data.status === 'paused')) {
          setProgress(data);
          if (data.status === 'processing') {
            console.log('Process is active, connecting to SSE...');
            // Use SSE for active processes
            connectToProgressStream();
          }
        }
      }
    } catch (error) {
      console.error('Failed to check progress:', error);
    }
  };

  const startMigration = async (resume = false) => {
    setIsProcessing(true);
    setError('');
    setSuccess('');

    try {
      // Use selected tables from checkboxes, or single table from dropdown for backward compatibility
      const tablesToMigrate = selectedTables.length > 0 
        ? selectedTables 
        : (selectedTable === 'all' ? availableTables.map(t => t.name) : [selectedTable]);
        
      if (tablesToMigrate.length === 0) {
        setError('En az bir tablo seçmelisiniz');
        setIsProcessing(false);
        return;
      }
      
      // Set initial progress state immediately
      setProgress({
        status: 'processing',
        current: 0,
        total: 0,
        percentage: 0,
        currentTable: null,
        error: null
      });
      
      // Start or resume via proxy endpoint
      const response = await fetch('/api/embeddings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tables: tablesToMigrate,
          batchSize: batchSize,
          workerCount: workerCount,
          resume: resume,
          startOffset: resume ? (progress?.current || 0) : 0
        })
      });

      if (response.ok) {
        // For SSE response, we need to handle the stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        setSuccess(resume ? 'Migration kaldığı yerden devam ediyor!' : 'Migration başlatıldı!');
        
        if (reader) {
          // Read SSE stream
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value);
            const lines = text.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  console.log('SSE progress update:', data);
                  setProgress(data);
                  
                  // Update stats dynamically
                  if (data.status === 'processing' && data.current > 0) {
                    setMigrationStats(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        embeddedRecords: prev.embeddedRecords + 1,
                        pendingRecords: Math.max(0, prev.pendingRecords - 1)
                      };
                    });
                  }
                  
                  if (data.status === 'completed' || data.status === 'failed') {
                    setIsProcessing(false);
                    setProgress(null); // Clear progress state
                    if (data.status === 'completed') {
                      setSuccess('Migration tamamlandı!');
                    } else {
                      setError(data.error || 'Migration başarısız!');
                    }
                    fetchMigrationStats();
                    fetchAvailableTables();
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
          }
        }
      } else {
        const error = await response.json();
        setError(error.error || 'Migration başlatılamadı');
      }
    } catch (error) {
      setError('Bir hata oluştu');
    } finally {
      setIsProcessing(false);
    }
  };

  const pauseMigration = async () => {
    try {
      console.log('Pausing migration...');
      // Pause endpoint lives under embeddings in backend
      const response = await fetch(`${API_BASE}/api/v2/embeddings/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Pause response:', data);
        if (data.progress) {
          setProgress(data.progress);
        }
        setSuccess('Migration duraklatıldı. Devam etmek için "Devam Et" butonuna tıklayın.');
        setIsProcessing(false);
        
        // Stop SSE connection when paused
        if ((window as any).currentEventSource) {
          (window as any).currentEventSource.close();
          (window as any).currentEventSource = null;
        }
        if ((window as any).currentPollInterval) {
          clearInterval((window as any).currentPollInterval);
          (window as any).currentPollInterval = null;
        }
      } else {
        const error = await response.json();
        setError(error.error || 'Duraklatma başarısız');
      }
    } catch (error) {
      console.error('Pause error:', error);
      setError('Duraklatma başarısız');
    }
  };

  // Server-Sent Events for real-time progress
  const connectToProgressStream = () => {
    // Close any existing connection
    if ((window as any).currentEventSource) {
      (window as any).currentEventSource.close();
    }
    
    console.log('Connecting to SSE stream...');
    // Use backend SSE stream aligned with embeddings namespace
    const eventSource = new EventSource(`${API_BASE}/api/v2/embeddings/progress/stream`);
    
    eventSource.onopen = () => {
      console.log('SSE connection opened');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE progress update:', data);
        setProgress(data);
        
        // Update migration stats dynamically if progress is active
        if (data.status === 'processing' && data.current > 0) {
          setMigrationStats(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              embeddedRecords: data.successCount || data.current,
              pendingRecords: Math.max(0, prev.totalRecords - (data.successCount || data.current))
            };
          });
        }
        
        if (data.status === 'completed' || data.status === 'error' || data.status === 'paused') {
          console.log('Processing finished with status:', data.status);
          eventSource.close();
          fetchMigrationStats();
          fetchAvailableTables();
          
          if (data.status === 'completed') {
            setSuccess('Migration tamamlandı!');
            setIsProcessing(false);
            setProgress(null); // Clear progress state
          } else if (data.status === 'error') {
            setError(data.error || 'Migration sırasında hata oluştu');
            setIsProcessing(false);
            setProgress(null); // Clear progress state
          } else if (data.status === 'paused') {
            setSuccess('Migration duraklatıldı');
            setIsProcessing(false);
            // Keep progress state for pause/resume
          }
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error, 'Raw data:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      console.log('SSE readyState:', eventSource.readyState);
      
      // Only close and fallback if connection is truly lost
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        console.log('Falling back to polling...');
        // Fallback to polling if SSE fails
        pollProgress();
      }
    };
    
    // Store event source for cleanup
    (window as any).currentEventSource = eventSource;
  };

  // Fallback polling method (kept for compatibility)
  const pollProgress = async () => {
    console.log('Starting polling fallback...');
    
    // Clear any existing polling interval
    if ((window as any).currentPollInterval) {
      clearInterval((window as any).currentPollInterval);
    }
    
    const interval = setInterval(async () => {
      // Skip if SSE is connected
      if ((window as any).currentEventSource && (window as any).currentEventSource.readyState === EventSource.OPEN) {
        return;
      }
      
      try {
      const response = await fetch('/api/embeddings/progress');
        if (response.ok) {
          const data = await response.json();
          console.log('Polling progress update:', data);
          setProgress(data);
          
          // Update migration stats dynamically if progress is active
          if (data.status === 'processing' && data.current > 0) {
            setMigrationStats(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                embeddedRecords: data.successCount || data.current,
                pendingRecords: Math.max(0, prev.totalRecords - (data.successCount || data.current))
              };
            });
          }
          
          if (data.status === 'completed' || data.status === 'error' || data.status === 'paused') {
            console.log('Polling finished with status:', data.status);
            clearInterval(interval);
            fetchMigrationStats();
            fetchAvailableTables();
            setIsProcessing(false);
            
            if (data.status === 'completed') {
              setSuccess('Migration tamamlandı!');
              setProgress(null); // Clear progress state
            } else if (data.status === 'error') {
              setError(data.error || 'Migration sırasında hata oluştu');
              setProgress(null); // Clear progress state
            } else if (data.status === 'paused') {
              setSuccess('Migration duraklatıldı');
              // Keep progress state for pause/resume
            }
          }
        }
      } catch (error) {
        console.error('Progress fetch error:', error);
      }
    }, 1000);
    
    // Store interval for cleanup
    (window as any).currentPollInterval = interval;
  };

  const searchEmbeddings = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      // Call backend directly; no Next proxy for search yet
      const response = await fetch(`${API_BASE}/api/v2/embeddings/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: searchQuery,
          tables: availableTables.map(t => t.name),
          limit: 5
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      setError('Arama başarısız');
    } finally {
      setIsSearching(false);
    }
  };

  // Get current table display info
  const getCurrentTableInfo = () => {
    return availableTables.find(t => t.name === progress?.currentTable);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">RAG & Embeddings Yönetimi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vektör Veritabanı İşlemleri
          </p>
        </div>
        <Link href="/dashboard/settings?tab=database">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Veritabanı Ayarları
          </Button>
        </Link>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="overview">
            <Database className="w-4 h-4 mr-2" />
            RAG Durumu
          </TabsTrigger>
          <TabsTrigger value="migration">
            <Upload className="w-4 h-4 mr-2" />
            Embedding İşlemleri
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="w-4 h-4 mr-2" />
            Test & Arama
          </TabsTrigger>
        </TabsList>

        {/* RAG Status Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Toplam Kayıt</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {migrationStats?.totalRecords.toLocaleString('tr-TR') || '0'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {availableTables.length} tabloda
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">İşlenmiş</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {progress?.status === 'processing' 
                    ? progress.current.toLocaleString('tr-TR')
                    : migrationStats?.embeddedRecords.toLocaleString('tr-TR') || '0'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  %{migrationStats && migrationStats.totalRecords > 0 
                    ? Math.round((migrationStats.embeddedRecords / migrationStats.totalRecords) * 100) 
                    : 0} tamamlandı
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Bekleyen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-600">
                  {migrationStats?.pendingRecords.toLocaleString('tr-TR') || '0'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  işlenecek kayıt
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Kullanım</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Token:</span>
                    <span className="font-medium">
                      {((migrationStats?.embeddedRecords || 0) * 500).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Maliyet:</span>
                    <span className="font-medium">
                      ${(((migrationStats?.embeddedRecords || 0) * 500) / 1000 * 0.0001).toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Veri Tabloları</CardTitle>
              <CardDescription>Mevcut tablolar ve embedding durumu</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTables ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                  <span className="text-sm text-muted-foreground">Tablolar yükleniyor...</span>
                </div>
              ) : availableTables.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Henüz veri tablosu bulunamadı</p>
                  <Link href="/dashboard/settings?tab=database">
                    <Button variant="outline" size="sm" className="mt-3">
                      <Settings className="w-4 h-4 mr-2" />
                      Veritabanı Bağlantısını Kontrol Et
                    </Button>
                  </Link>
                </div>
              ) : (
              <div className="space-y-4">
                {availableTables.map((table) => {
                  const stats = migrationStats?.tables.find(t => t.name === table.name);
                  // Use table's own embedded/total records for accurate percentage
                  const percentage = table.totalRecords > 0 
                    ? Math.round((table.embeddedRecords / table.totalRecords) * 100) 
                    : 0;
                  
                  // Token ve maliyet tahmini
                  const estimatedTokens = table.embeddedRecords * 500;
                  const estimatedCost = (estimatedTokens / 1000) * 0.0001;
                  
                  return (
                    <div key={table.name} className="space-y-2 p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{table.displayName}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-sm font-medium">
                              {(table.embeddedRecords || 0).toLocaleString('tr-TR')} / {(table.totalRecords || 0).toLocaleString('tr-TR')}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              ~{estimatedTokens.toLocaleString('tr-TR')} token • ${estimatedCost.toFixed(3)}
                            </p>
                          </div>
                          <Badge variant={percentage === 100 ? 'success' : 'secondary'}>
                            {percentage}%
                          </Badge>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
                
                {/* Toplam Satırı */}
                {availableTables.length > 0 && (
                  <div className="p-3 border-2 border-primary/20 rounded-lg bg-primary/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">TOPLAM</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          <span>PostgreSQL (rag_chatbot)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-sm font-bold">
                            {migrationStats?.embeddedRecords.toLocaleString('tr-TR')} / {migrationStats?.totalRecords.toLocaleString('tr-TR')}
                          </span>
                          <p className="text-xs font-medium">
                            ~{((migrationStats?.embeddedRecords || 0) * 500).toLocaleString('tr-TR')} token • 
                            ${(((migrationStats?.embeddedRecords || 0) * 500) / 1000 * 0.0001).toFixed(2)}
                          </p>
                        </div>
                        <Badge variant={migrationStats && migrationStats.totalRecords > 0 && migrationStats.embeddedRecords === migrationStats.totalRecords ? 'success' : 'default'}>
                          {migrationStats && migrationStats.totalRecords > 0 
                            ? Math.round((migrationStats.embeddedRecords / migrationStats.totalRecords) * 100) 
                            : 0}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Migration Tab */}
        <TabsContent value="migration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Migration</CardTitle>
              <CardDescription>
                Tabloları vektör veritabanına aktarın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sol kolon - İşlem Ayarları */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-3">İşlem Ayarları</h3>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="batch-size" className="text-xs">Batch Size</Label>
                        <Select value={batchSize.toString()} onValueChange={(v) => setBatchSize(parseInt(v))}>
                          <SelectTrigger id="batch-size" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 kayıt</SelectItem>
                            <SelectItem value="25">25 kayıt</SelectItem>
                            <SelectItem value="50">50 kayıt</SelectItem>
                            <SelectItem value="100">100 kayıt</SelectItem>
                            <SelectItem value="200">200 kayıt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="worker-count" className="text-xs">Paralel Embedder</Label>
                        <Select value={workerCount.toString()} onValueChange={(v) => setWorkerCount(parseInt(v))}>
                          <SelectTrigger id="worker-count" className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 embedder</SelectItem>
                            <SelectItem value="2">2 embedder</SelectItem>
                            <SelectItem value="3">3 embedder</SelectItem>
                            <SelectItem value="4">4 embedder</SelectItem>
                            <SelectItem value="5">5 embedder</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Token ve Süre Tahmini */}
                      <div className="p-3 bg-muted rounded-lg space-y-2">
                        <h4 className="text-xs font-semibold">Tahminler</h4>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Süre:</span>
                            <span className="font-medium">
                              ~{Math.ceil((migrationStats?.pendingRecords || 0) / (batchSize * workerCount) * 0.5)} dk
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Token:</span>
                            <span className="font-medium">
                              ~{((migrationStats?.pendingRecords || 0) * 500).toLocaleString('tr-TR')}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Maliyet:</span>
                            <span className="font-medium">
                              ~${(((migrationStats?.pendingRecords || 0) * 500) / 1000 * 0.0001).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {progress?.status === 'paused' ? (
                        <Button 
                          onClick={() => startMigration(true)} 
                          disabled={isProcessing}
                          className="w-full"
                          variant="default"
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Devam Et
                        </Button>
                      ) : isProcessing || progress?.status === 'processing' ? (
                        <Button 
                          onClick={pauseMigration} 
                          disabled={false}
                          className="w-full"
                          variant="secondary"
                        >
                          <Pause className="w-4 h-4 mr-2" />
                          Duraklat
                        </Button>
                      ) : (
                        <Button 
                          onClick={() => startMigration(false)} 
                          disabled={isProcessing || selectedTables.length === 0}
                          className="w-full"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Migration Başlat
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sağ kolon - Tablo Seçimi */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Tablo Seçimi ({selectedTables.length}/{availableTables.length} seçili)</Label>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedTables(availableTables.map(t => t.name))}
                        disabled={isLoadingTables}
                      >
                        Tümünü Seç
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedTables([])}
                        disabled={isLoadingTables}
                      >
                        Temizle
                      </Button>
                    </div>
                  </div>
                  {isLoadingTables ? (
                    <div className="flex items-center justify-center py-8 border rounded-lg">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                      <span className="text-sm text-muted-foreground">Tablolar yükleniyor...</span>
                    </div>
                  ) : availableTables.length === 0 ? (
                    <div className="text-center py-8 border rounded-lg">
                      <Database className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Henüz veri tablosu bulunamadı</p>
                      <Link href="/dashboard/settings?tab=database">
                        <Button variant="outline" size="sm" className="mt-3">
                          <Settings className="w-4 h-4 mr-2" />
                          Veritabanı Bağlantısını Kontrol Et
                        </Button>
                      </Link>
                    </div>
                  ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {availableTables.map((table) => (
                      <div key={table.name} className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                        <input
                          type="checkbox"
                          id={`table-${table.name}`}
                          checked={selectedTables.includes(table.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTables([...selectedTables, table.name]);
                            } else {
                              setSelectedTables(selectedTables.filter(t => t !== table.name));
                            }
                          }}
                          className="mt-1 rounded"
                        />
                        <label htmlFor={`table-${table.name}`} className="text-sm cursor-pointer flex-1">
                          <div className="font-medium">
                            {table.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {table.totalRecords.toLocaleString('tr-TR')} kayıt
                            {table.embeddedRecords > 0 && (
                              <span className="text-green-600 dark:text-green-400">
                                {' • '}{table.embeddedRecords.toLocaleString('tr-TR')} embed edilmiş
                                ({Math.round((table.embeddedRecords / table.totalRecords) * 100)}%)
                              </span>
                            )}
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              </div>

              {progress && progress.status !== 'idle' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Genel İlerleme</span>
                      <span className="text-sm font-bold text-primary">
                        {progress.percentage}%
                      </span>
                    </div>
                    <Progress value={progress.percentage} className="h-4" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {(progress.current ?? 0).toLocaleString('tr-TR')} / {(progress.total ?? 0).toLocaleString('tr-TR')} kayıt
                        {progress.alreadyEmbedded && progress.alreadyEmbedded > 0 && ` (${progress.alreadyEmbedded.toLocaleString('tr-TR')} önceden tamamlanmış)`}
                      </span>
                      {progress.estimatedTimeRemaining && progress.estimatedTimeRemaining > 0 && (
                        <span>Tahmini süre: {Math.ceil(progress.estimatedTimeRemaining / 60000)} dk</span>
                      )}
                    </div>
                  </div>

                  {progress.currentTable && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        İşleniyor: {getCurrentTableInfo()?.displayName || progress.currentTable}
                        {getCurrentTableInfo()?.database && (
                          <span className="text-xs ml-2 opacity-75">
                            ({getCurrentTableInfo()?.database})
                          </span>
                        )}
                      </p>
                      {progress.currentBatch && progress.totalBatches && (
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Batch {progress.currentBatch} / {progress.totalBatches}
                        </p>
                      )}
                      {progress.alreadyEmbedded && progress.alreadyEmbedded > 0 && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {progress.alreadyEmbedded} kayıt zaten embed edilmiş (atlanıyor)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Detailed Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xs text-green-700 dark:text-green-300">Token Kullanımı</p>
                      <p className="text-lg font-bold text-green-900 dark:text-green-100">
                        {progress.tokensUsed ? Math.round(progress.tokensUsed).toLocaleString('tr-TR') : '0'}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {progress.newlyEmbedded ? `${progress.newlyEmbedded} yeni kayıt` : 
                         progress.tokensUsed && progress.current ? `~${Math.round(progress.tokensUsed / progress.current)} token/kayıt` : '0 token/kayıt'}
                      </p>
                    </div>
                    <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <p className="text-xs text-orange-700 dark:text-orange-300">Tahmini Maliyet</p>
                      <p className="text-lg font-bold text-orange-900 dark:text-orange-100">
                        ${progress.estimatedCost ? progress.estimatedCost.toFixed(4) : '0.00'}
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        Ada-002: $0.0001/1K token
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <p className="text-xs text-purple-700 dark:text-purple-300">İşleme Hızı</p>
                      <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
                        {progress.current && progress.startTime 
                          ? Math.round(progress.current / ((Date.now() - progress.startTime) / 1000) * 60)
                          : 0} kayıt/dk
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                        Batch Size: {batchSize}
                      </p>
                    </div>
                  </div>
                  
                  {/* Per-table Progress */}
                  {progress.processedTables && progress.processedTables.length > 0 && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <p className="text-xs font-medium mb-2">İşlenen Tablolar</p>
                      <div className="space-y-1">
                        {progress.processedTables.map((tableName) => {
                          const table = availableTables.find(t => t.name === tableName);
                          return (
                            <div key={tableName} className="flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span className="text-xs">{table?.displayName || tableName}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Migration işlemi kaldığı yerden devam edebilir. Zaten embed edilmiş kayıtlar tekrar işlenmez.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vektör Arama Testi</CardTitle>
              <CardDescription>
                Embedding'ler üzerinde semantik arama yapın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search-query">Arama Sorgusu</Label>
                <div className="flex gap-2">
                  <Input
                    id="search-query"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Örn: KDV oranları nelerdir?"
                    onKeyPress={(e) => e.key === 'Enter' && searchEmbeddings()}
                  />
                  <Button onClick={searchEmbeddings} disabled={isSearching}>
                    {isSearching ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Sonuçlar ({searchResults.length})</p>
                  {searchResults.map((result, index) => {
                    const tableInfo = availableTables.find(t => t.name === result.tableName);
                    return (
                      <div key={index} className="p-4 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">
                            {tableInfo?.displayName || result.tableName}
                          </Badge>
                          <Badge variant="secondary">
                            Benzerlik: {(result.similarity * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {JSON.stringify(result, null, 2).substring(0, 300)}...
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
