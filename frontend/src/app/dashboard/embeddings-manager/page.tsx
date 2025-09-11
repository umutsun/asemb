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
  Zap
} from 'lucide-react';
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
  const [batchSize, setBatchSize] = useState(10);

  useEffect(() => {
    fetchAvailableTables();
    fetchMigrationStats();
    checkProgress();
  }, []);

  const fetchAvailableTables = async () => {
    try {
      const response = await fetch('/api/embeddings/tables');
      if (response.ok) {
        const data = await response.json();
        setAvailableTables(data.tables || []);
        // Set first table as default if available
        if (data.tables && data.tables.length > 0 && !selectedTable) {
          setSelectedTable(data.tables[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    }
  };

  const fetchMigrationStats = async () => {
    try {
      const response = await fetch('/api/embeddings/stats');
      if (response.ok) {
        const data = await response.json();
        setMigrationStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const checkProgress = async () => {
    try {
      const response = await fetch('/api/embeddings/progress');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'processing' || data.status === 'paused') {
          setProgress(data);
          if (data.status === 'processing') {
            pollProgress();
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
      
      const response = await fetch('/api/embeddings/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tables: tablesToMigrate,
          batchSize: batchSize,
          resume: resume
        })
      });

      if (response.ok) {
        const data = await response.json();
        setProgress(data.progress);
        setSuccess(resume ? 'Migration kaldığı yerden devam ediyor!' : 'Migration başlatıldı!');
        pollProgress();
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
      const response = await fetch('/api/embeddings/stop', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        setProgress(data.progress);
        setSuccess('Migration duraklatıldı. Devam etmek için "Devam Et" butonuna tıklayın.');
      }
    } catch (error) {
      setError('Duraklatma başarısız');
    }
  };

  const pollProgress = async () => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/embeddings/progress');
        if (response.ok) {
          const data = await response.json();
          setProgress(data);
          
          if (data.status === 'completed' || data.status === 'error' || data.status === 'paused') {
            clearInterval(interval);
            fetchMigrationStats();
            fetchAvailableTables();
          }
        }
      } catch (error) {
        console.error('Progress fetch error:', error);
      }
    }, 1000);
  };

  const searchEmbeddings = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      const response = await fetch('/api/rag/search', {
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
      <div>
        <h1 className="text-xl font-semibold">RAG & Embeddings Yönetimi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vektör Veritabanı İşlemleri
        </p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Toplam Kayıt</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {migrationStats?.totalRecords.toLocaleString('tr-TR') || '0'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {availableTables.length} tabloda
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Embedding Durumu</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">
                  {migrationStats && migrationStats.totalRecords > 0 
                    ? Math.round((migrationStats.embeddedRecords / migrationStats.totalRecords) * 100) 
                    : 0}%
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {migrationStats?.embeddedRecords.toLocaleString('tr-TR') || '0'} işlenmiş
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bekleyen</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-600">
                  {migrationStats?.pendingRecords.toLocaleString('tr-TR') || '0'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">kayıt işlenecek</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Veri Tabloları</CardTitle>
              <CardDescription>Mevcut tablolar ve embedding durumu</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {availableTables.map((table) => {
                  const stats = migrationStats?.tables.find(t => t.name === table.name);
                  const percentage = stats && stats.count > 0 
                    ? Math.round((stats.embedded / stats.count) * 100) 
                    : 0;
                  
                  return (
                    <div key={table.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{table.displayName}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({table.database})
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground">
                            {(table.embeddedRecords || 0).toLocaleString('tr-TR')} / {(table.totalRecords || 0).toLocaleString('tr-TR')}
                          </span>
                          <Badge variant={percentage === 100 ? 'success' : 'secondary'}>
                            {percentage}%
                          </Badge>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sistem Durumu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Veritabanı Bağlantısı
                </span>
                <Badge variant="success">Aktif</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  OpenAI API
                </span>
                <Badge variant="success">Erişilebilir</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  pgvector Extension
                </span>
                <Badge variant="success">Yüklü</Badge>
              </div>
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
              {/* Table Selection with Checkboxes */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Tablo Seçimi ({selectedTables.length}/{availableTables.length} seçili)</Label>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedTables(availableTables.map(t => t.name))}
                      >
                        Tümünü Seç
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedTables([])}
                      >
                        Temizle
                      </Button>
                    </div>
                  </div>
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
                          <div className="font-medium">{table.displayName}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {table.totalRecords.toLocaleString('tr-TR')} kayıt
                            {table.embeddedRecords > 0 && (
                              <span className="text-green-600 dark:text-green-400">
                                {' • '}{table.embeddedRecords.toLocaleString('tr-TR')} embed edilmiş
                              </span>
                            )}
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label htmlFor="batch-size">Batch Size</Label>
                    <Select value={batchSize.toString()} onValueChange={(v) => setBatchSize(parseInt(v))}>
                      <SelectTrigger id="batch-size" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 kayıt/batch (çok yavaş)</SelectItem>
                        <SelectItem value="10">10 kayıt/batch (yavaş)</SelectItem>
                        <SelectItem value="25">25 kayıt/batch (orta)</SelectItem>
                        <SelectItem value="50">50 kayıt/batch (hızlı)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Daha büyük batch size daha hızlı ama API limitlerine dikkat
                    </p>
                  </div>

                  <div className="flex items-end gap-2 flex-1">
                  {progress?.status === 'paused' ? (
                    <Button 
                      onClick={() => startMigration(true)} 
                      disabled={isProcessing}
                      className="flex-1"
                      variant="default"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Devam Et
                    </Button>
                  ) : progress?.status === 'processing' ? (
                    <Button 
                      onClick={pauseMigration} 
                      disabled={isProcessing}
                      className="flex-1"
                      variant="secondary"
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Duraklat
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => startMigration(false)} 
                      disabled={isProcessing || selectedTables.length === 0}
                      className="flex-1"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          İşleniyor...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Migration Başlat
                        </>
                      )}
                    </Button>
                  )}
                  </div>
                </div>
              </div>

              {progress && (
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
                      <span>{progress.current.toLocaleString('tr-TR')} / {progress.total.toLocaleString('tr-TR')} kayıt</span>
                      {progress.estimatedTimeRemaining && (
                        <span>Tahmini süre: {Math.ceil(progress.estimatedTimeRemaining / 60000)} dk</span>
                      )}
                    </div>
                  </div>

                  {progress.currentTable && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        İşleniyor: {getCurrentTableInfo()?.displayName || progress.currentTable}
                      </p>
                    </div>
                  )}

                  {/* Detailed Metrics */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xs text-green-700 dark:text-green-300">Token Kullanımı</p>
                      <p className="text-lg font-bold text-green-900 dark:text-green-100">
                        {progress.tokensUsed ? progress.tokensUsed.toLocaleString('tr-TR') : '0'}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        ~{progress.tokensUsed && progress.current ? Math.round(progress.tokensUsed / progress.current) : 0} token/kayıt
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