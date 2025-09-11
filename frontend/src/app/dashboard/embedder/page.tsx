'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  FileText, 
  Loader2,
  CheckCircle,
  AlertTriangle,
  Cpu,
  Database,
  Brain,
  Play,
  Search,
  Hash
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function EmbedderPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightragStats, setLightragStats] = useState<any>(null);

  useEffect(() => {
    fetchLightRAGStats();
  }, []);

  const fetchLightRAGStats = async () => {
    try {
      const response = await fetch('/api/v2/lightrag/stats');
      if (response.ok) {
        const data = await response.json();
        setLightragStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch LightRAG stats:', error);
    }
  };

  const handleGenerateEmbedding = async () => {
    if (!text.trim()) {
      setError('Lütfen metin girin');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const endpoint = selectedProvider === 'lightrag' 
        ? '/api/v2/lightrag/embed'
        : '/api/v2/embeddings/generate';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text.trim(),
          provider: selectedProvider 
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setResult({
          embedding: data.embedding,
          dimensions: data.embedding?.length || 1536,
          provider: selectedProvider,
          tokens: data.tokens || Math.ceil(text.length / 4),
          cached: data.cached || false,
          processingTime: data.processingTime || '0.5s'
        });
        toast.success('Embedding başarıyla oluşturuldu');
      } else {
        setError(data.error || 'Embedding oluşturulamadı');
        toast.error(data.error || 'Embedding oluşturulamadı');
      }
    } catch (err) {
      setError('Bağlantı hatası');
      toast.error('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  const handleTestLightRAG = async () => {
    setTestLoading(true);
    setTestResult(null);

    try {
      // First, add a test document
      const addResponse = await fetch('/api/v2/lightrag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim() || 'Bu bir test dokümandır. ASB sistemi yapay zeka tabanlı bir RAG sistemidir.',
          metadata: {
            source: 'embedder_test',
            timestamp: new Date().toISOString()
          }
        })
      });

      if (!addResponse.ok) {
        throw new Error('Doküman eklenemedi');
      }

      // Then query it
      const queryResponse = await fetch('/api/v2/lightrag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'ASB sistemi nedir?',
          k: 3
        })
      });

      const queryData = await queryResponse.json();
      
      setTestResult({
        success: true,
        documentAdded: true,
        queryResult: queryData.answer || 'Sorgu sonucu alınamadı',
        provider: lightragStats?.provider || 'unknown'
      });

      toast.success('LightRAG testi başarılı');
      fetchLightRAGStats(); // Refresh stats
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message
      });
      toast.error('LightRAG testi başarısız');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Lütfen arama sorgusu girin');
      return;
    }

    setSearchLoading(true);
    setSearchResult(null);

    try {
      const response = await fetch('/api/v2/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery.trim(),
          limit: 5,
          threshold: 0.7
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setSearchResult({
          results: data.results || [],
          count: data.results?.length || 0,
          executionTime: data.executionTime || 'N/A'
        });
        toast.success(`${data.results?.length || 0} sonuç bulundu`);
      } else {
        toast.error('Arama başarısız');
      }
    } catch (err) {
      toast.error('Arama hatası');
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Embedder Service</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vektör embedding oluştur ve test et
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" />
            pgvector
          </Badge>
          {lightragStats?.initialized && (
            <Badge variant="outline" className="gap-1">
              <Brain className="h-3 w-3" />
              LightRAG Active
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generate">
            <Zap className="h-4 w-4 mr-2" />
            Embedding Oluştur
          </TabsTrigger>
          <TabsTrigger value="test">
            <Brain className="h-4 w-4 mr-2" />
            LightRAG Test
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            Semantic Ara
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Metin Embedding</CardTitle>
                  <CardDescription>
                    Metni vektör temsiline dönüştür
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Provider Seçin</Label>
                    <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">
                          <div className="flex items-center gap-2">
                            <Cpu className="h-4 w-4" />
                            OpenAI (text-embedding-ada-002)
                          </div>
                        </SelectItem>
                        <SelectItem value="lightrag">
                          <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4" />
                            LightRAG (Langchain)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Metin</Label>
                    <Textarea
                      placeholder="Embedding oluşturmak istediğiniz metni girin..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {text.length} karakter • ~{Math.ceil(text.length / 4)} token
                    </p>
                  </div>

                  <Button 
                    onClick={handleGenerateEmbedding}
                    disabled={loading || !text.trim()}
                    className="w-full"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        İşleniyor...
                      </>
                    ) : (
                      <>
                        <Hash className="h-4 w-4 mr-2" />
                        Embedding Oluştur
                      </>
                    )}
                  </Button>

                  {result && (
                    <Alert className="border-green-200">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription>
                        <div className="space-y-2">
                          <p className="font-semibold">Embedding başarıyla oluşturuldu!</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>Provider: {result.provider}</div>
                            <div>Boyut: {result.dimensions}D</div>
                            <div>Token: {result.tokens}</div>
                            <div>Cache: {result.cached ? 'Evet' : 'Hayır'}</div>
                          </div>
                          {result.embedding && (
                            <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                              [{result.embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Sistem Durumu</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>OpenAI API</span>
                      <Badge variant="success">Aktif</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>LightRAG</span>
                      <Badge variant={lightragStats?.initialized ? "success" : "secondary"}>
                        {lightragStats?.initialized ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Doküman Sayısı</span>
                      <span className="font-mono">{lightragStats?.documentCount || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Redis Cache</span>
                      <Badge variant="success">Aktif</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>LightRAG Test</CardTitle>
              <CardDescription>
                LightRAG sistemini test edin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Test Metni</Label>
                <Textarea
                  placeholder="Test için kullanılacak metin (boş bırakılırsa varsayılan kullanılır)"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                />
              </div>

              <Button 
                onClick={handleTestLightRAG}
                disabled={testLoading}
                className="w-full"
              >
                {testLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Test ediliyor...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    LightRAG'i Test Et
                  </>
                )}
              </Button>

              {testResult && (
                <Alert className={testResult.success ? "border-green-200" : "border-red-200"}>
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold">
                        {testResult.success ? 'Test başarılı!' : 'Test başarısız!'}
                      </p>
                      {testResult.success ? (
                        <>
                          <p className="text-sm">Doküman eklendi: ✓</p>
                          <p className="text-sm">Sorgu sonucu:</p>
                          <div className="p-2 bg-muted rounded text-sm">
                            {testResult.queryResult}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Provider: {testResult.provider}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-red-600">{testResult.error}</p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Semantic Search</CardTitle>
              <CardDescription>
                Vektör veritabanında anlamsal arama yapın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Arama Sorgusu</Label>
                <Textarea
                  placeholder="Aramak istediğiniz soruyu yazın..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  rows={3}
                />
              </div>

              <Button 
                onClick={handleSemanticSearch}
                disabled={searchLoading || !searchQuery.trim()}
                className="w-full"
              >
                {searchLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aranıyor...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Ara
                  </>
                )}
              </Button>

              {searchResult && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-semibold">
                      {searchResult.count} sonuç bulundu
                    </p>
                    <Badge variant="outline">
                      {searchResult.executionTime}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {searchResult.results.map((result: any, index: number) => (
                      <Card key={index} className="p-3">
                        <div className="space-y-1">
                          <div className="flex justify-between items-start">
                            <p className="text-sm font-medium">
                              Benzerlik: {(result.similarity * 100).toFixed(1)}%
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {result.document_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {result.content}
                          </p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}