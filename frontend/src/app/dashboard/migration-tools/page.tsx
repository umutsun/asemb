'use client';

import { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Upload, 
  Download, 
  RefreshCw, 
  CheckCircle, 
  XCircle,
  Zap,
  FileText,
  Hash,
  Brain,
  Sparkles,
  ArrowRight,
  Trash2
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MigrationStats {
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  tables: {
    name: string;
    count: number;
    embedded: number;
  }[];
}

interface EmbeddingProgress {
  current: number;
  total: number;
  percentage: number;
  status: string;
  currentTable?: string;
}

export default function MigrationToolsPage() {
  const [activeTab, setActiveTab] = useState('migration');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Migration settings
  const [migrationConfig, setMigrationConfig] = useState({
    sourceTable: 'all',
    batchSize: 100,
    useOpenAI: true,
    useLightRAG: false,
    chunkSize: 1000,
    overlapSize: 200
  });

  // LightRAG settings
  const [lightragConfig, setLightragConfig] = useState({
    mode: 'hybrid',
    temperature: 0.1,
    maxTokens: 1000,
    useCache: true
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/migration/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const startMigration = async () => {
    setIsLoading(true);
    setMessage(null);
    setProgress({ current: 0, total: 0, percentage: 0, status: 'Başlatılıyor...' });

    try {
      const response = await fetch('http://localhost:3001/api/v2/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(migrationConfig)
      });

      if (!response.ok) throw new Error('Migration failed');

      // Start polling for progress
      const pollInterval = setInterval(async () => {
        const progressResponse = await fetch('http://localhost:3001/api/v2/migration/progress');
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          setProgress(progressData);
          
          if (progressData.status === 'completed' || progressData.status === 'failed') {
            clearInterval(pollInterval);
            setIsLoading(false);
            
            if (progressData.status === 'completed') {
              setMessage({ type: 'success', text: 'Migration tamamlandı!' });
              loadStats();
            } else {
              setMessage({ type: 'error', text: 'Migration başarısız oldu' });
            }
          }
        }
      }, 1000);

    } catch (error) {
      setMessage({ type: 'error', text: 'Migration başlatılamadı' });
      setIsLoading(false);
    }
  };

  const generateEmbeddings = async () => {
    setIsLoading(true);
    setMessage(null);
    setProgress({ current: 0, total: stats?.pendingRecords || 0, percentage: 0, status: 'Embedding oluşturuluyor...' });

    try {
      const response = await fetch('http://localhost:3001/api/v2/embeddings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: migrationConfig.batchSize,
          useOpenAI: migrationConfig.useOpenAI,
          useLightRAG: migrationConfig.useLightRAG
        })
      });

      if (!response.ok) throw new Error('Embedding generation failed');

      // Stream progress updates
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = new TextDecoder().decode(value);
          const lines = text.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              setProgress(data);
            }
          }
        }
      }

      setMessage({ type: 'success', text: 'Tüm embedding\'ler oluşturuldu!' });
      loadStats();
    } catch (error) {
      setMessage({ type: 'error', text: 'Embedding oluşturma başarısız' });
    } finally {
      setIsLoading(false);
    }
  };

  const clearData = async (table: string) => {
    if (!confirm(`${table} tablosundaki tüm veriler silinecek. Emin misiniz?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3003/api/v2/migration/clear/${table}`, {
        method: `DELETE'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: `${table} tablosu temizlendi` });
        loadStats();
      } else {
        throw new Error('Clear failed');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Temizleme başarısız' });
    } finally {
      setIsLoading(false);
    }
  };

  const optimizeWithLightRAG = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:3001/api/v2/lightrag/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lightragConfig)
      });

      if (response.ok) {
        const result = await response.json();
        setMessage({ 
          type: 'success', 
          text: `LightRAG optimizasyonu tamamlandı. ${result.optimizedCount} kayıt optimize edildi.` 
        });
        loadStats();
      } else {
        throw new Error('LightRAG optimization failed');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'LightRAG optimizasyonu başarısız' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Database className="h-8 w-8" />
          Migration & Embedding Araçları
        </h1>
        <p className="text-muted-foreground mt-2">
          Veritabanı migration, embedding oluşturma ve LightRAG optimizasyonu
        </p>
      </div>

      {message && (
        <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-500' : message.type === 'success' ? 'border-green-500' : 'border-blue-500'}`}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Toplam Kayıt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRecords.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Embedding\'li Kayıtlar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.embeddedRecords.toLocaleString()}
              </div>
              <Progress 
                value={(stats.embeddedRecords / stats.totalRecords) * 100} 
                className="mt-2"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Bekleyen Kayıtlar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.pendingRecords.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress Bar */}
      {progress && isLoading && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{progress.status}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <Progress value={progress.percentage} />
              {progress.currentTable && (
                <p className="text-sm text-muted-foreground">
                  İşlenen tablo: {progress.currentTable}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="migration">
            <Upload className="h-4 w-4 mr-2" />
            Migration
          </TabsTrigger>
          <TabsTrigger value="embeddings">
            <Hash className="h-4 w-4 mr-2" />
            Embeddings
          </TabsTrigger>
          <TabsTrigger value="lightrag">
            <Brain className="h-4 w-4 mr-2" />
            LightRAG
          </TabsTrigger>
        </TabsList>

        <TabsContent value="migration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Veri Migration</CardTitle>
              <CardDescription>
                Mevcut tablolardan rag_data.documents tablosuna veri aktarımı
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Kaynak Tablo</Label>
                <Select 
                  value={migrationConfig.sourceTable}
                  onValueChange={(value) => setMigrationConfig(prev => ({ ...prev, sourceTable: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Tablolar</SelectItem>
                    <SelectItem value="SORUCEVAP">SORUCEVAP</SelectItem>
                    <SelectItem value="OZELGELER">ÖZELGELER</SelectItem>
                    <SelectItem value="MAKALELER">MAKALELER</SelectItem>
                    <SelectItem value="DANISTAYKARARLARI">DANIŞTAY KARARLARI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Batch Boyutu</Label>
                  <Input
                    type="number"
                    value={migrationConfig.batchSize}
                    onChange={(e) => setMigrationConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>Chunk Boyutu</Label>
                  <Input
                    type="number"
                    value={migrationConfig.chunkSize}
                    onChange={(e) => setMigrationConfig(prev => ({ ...prev, chunkSize: parseInt(e.target.value) }))}
                  />
                </div>
              </div>

              <Button 
                onClick={startMigration} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Migration Devam Ediyor...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Migration Başlat
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Table Stats */}
          {stats && (
            <Card>
              <CardHeader>
                <CardTitle>Tablo Durumları</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.tables.map(table => (
                    <div key={table.name} className="flex items-center justify-between p-2 border rounded">
                      <span className="font-medium">{table.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {table.count} kayıt
                        </Badge>
                        <Badge variant={table.embedded === table.count ? "success" : "secondary"}>
                          {table.embedded} embedded
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => clearData(table.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="embeddings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Oluşturma</CardTitle>
              <CardDescription>
                OpenAI veya LightRAG kullanarak vektör embedding oluşturma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={migrationConfig.useOpenAI}
                    onChange={(e) => setMigrationConfig(prev => ({ ...prev, useOpenAI: e.target.checked }))}
                    className="mr-2"
                  />
                  OpenAI Kullan
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={migrationConfig.useLightRAG}
                    onChange={(e) => setMigrationConfig(prev => ({ ...prev, useLightRAG: e.target.checked }))}
                    className="mr-2"
                  />
                  LightRAG Kullan
                </label>
              </div>

              <Button 
                onClick={generateEmbeddings}
                disabled={isLoading || stats?.pendingRecords === 0}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Embedding Oluşturuluyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {stats?.pendingRecords} Kayıt için Embedding Oluştur
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lightrag" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LightRAG Optimizasyonu</CardTitle>
              <CardDescription>
                Gelişmiş RAG özellikleri ve optimizasyon
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Arama Modu</Label>
                <Select
                  value={lightragConfig.mode}
                  onValueChange={(value) => setLightragConfig(prev => ({ ...prev, mode: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hybrid">Hybrid (Önerilen)</SelectItem>
                    <SelectItem value="semantic">Semantic</SelectItem>
                    <SelectItem value="keyword">Keyword</SelectItem>
                    <SelectItem value="graph">Graph-based</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={lightragConfig.temperature}
                    onChange={(e) => setLightragConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={lightragConfig.maxTokens}
                    onChange={(e) => setLightragConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={lightragConfig.useCache}
                  onChange={(e) => setLightragConfig(prev => ({ ...prev, useCache: e.target.checked }))}
                  className="mr-2"
                />
                <Label>Cache Kullan</Label>
              </div>

              <Button 
                onClick={optimizeWithLightRAG}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Optimizasyon Yapılıyor...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    LightRAG ile Optimize Et
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>LightRAG Özellikleri</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                  <span>Graph-based document relationships</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                  <span>Intelligent chunking and splitting</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                  <span>Multi-level context understanding</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                  <span>Automatic entity extraction</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500 mt-0.5" />
                  <span>Query expansion and refinement</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}