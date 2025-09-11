'use client';

import React, { useState } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Send, 
  Loader2, 
  FileText,
  Brain,
  Sparkles,
  History,
  Settings2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Database
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useEffect } from 'react';

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('hybrid');
  const [temperature, setTemperature] = useState([0.7]);
  const [useCache, setUseCache] = useState(true);
  const [dataSource, setDataSource] = useState('database'); // 'database' | 'mock' | 'external'
  const [useRealAPI, setUseRealAPI] = useState(true);
  const [config, setConfig] = useState<any>(null);

  // Sayfa yüklendiğinde config'i al
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch(getApiUrl('config') || `${API_CONFIG.baseUrl}/api/v2/config`);
      const data = await response.json();
      setConfig(data);
      // Kaydedilmiş temperature değerini kullan
      if (data?.llmSettings?.temperature !== undefined) {
        setTemperature([data.llmSettings.temperature]);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  // Temperature değiştiğinde config'i güncelle
  const handleTemperatureChange = async (value: number[]) => {
    setTemperature(value);
    
    // Config'i güncelle
    if (config) {
      const updatedConfig = {
        ...config,
        llmSettings: {
          ...config.llmSettings,
          temperature: value[0]
        }
      };
      
      try {
        await fetch(getApiUrl('config') || `${API_CONFIG.baseUrl}/api/v2/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedConfig),
        });
        setConfig(updatedConfig);
      } catch (error) {
        console.error('Failed to save temperature setting:', error);
      }
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Lütfen bir sorgu girin');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      if (useRealAPI && dataSource === 'database') {
        // Gerçek veritabanı API çağrısı
        const response = await fetch(getApiUrl('query'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            mode,
            temperature: temperature[0],
            useCache,
            limit: 5
          })
        });

        if (!response.ok) {
          throw new Error('API hatası');
        }

        const data = await response.json();
        
        // API'den gelen veriyi formatla
        setResults({
          answer: data.answer || data.response,
          sources: data.sources || data.documents || [],
          confidence: data.confidence || 0.85,
          processingTime: data.processingTime || "N/A"
        });
      } else {
        // Mock veri (test için)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setResults({
          answer: "Bu, LightRAG sisteminden gelen örnek bir yanıttır. Gerçek uygulamada, sorgunuz anlamsal olarak işlenecek ve en alakalı bilgiler döndürülecektir.",
          sources: [
            { 
              id: 1, 
              title: "Türk Borçlar Kanunu - Kira Sözleşmeleri", 
              relevance: 0.95,
              author: "Resmi Gazete",
              date: "2024-01-15",
              page: "Sayfa 234-256"
            },
            { 
              id: 2, 
              title: "Kira Hukuku Uygulamaları", 
              relevance: 0.87,
              author: "Prof. Dr. Ahmet Yılmaz",
              date: "2023-11-20",
              page: "Bölüm 5.3"
            },
            { 
              id: 3, 
              title: "Yargıtay 6. HD Kararı", 
              relevance: 0.82,
              author: "Yargıtay",
              date: "2023-09-12",
              page: "Karar No: 2023/4567"
            }
          ],
          confidence: 0.89,
          processingTime: "1.2s"
        });
      }
    } catch (err) {
      setError('Sorgu işlenirken bir hata oluştu: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const recentQueries = [
    "Kira sözleşmesi fesih prosedürü nedir?",
    "İş kazası tazminat hesaplama",
    "Boşanma davası süreçleri",
    "Fikri mülkiyet hakları korunması"
  ];

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">LightRAG Sorgu</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anlamsal arama ile dokümanlarınızdan bilgi çıkarın
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Brain className="h-3 w-3" />
          LightRAG Engine v2.0
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Query Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sorgu Girin</CardTitle>
              <CardDescription>
                Doğal dilde sorunuzu yazın, sistem en alakalı bilgileri getirecektir
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Textarea
                  placeholder="Örn: Kira sözleşmesinin feshi için gerekli prosedürler nelerdir?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {query.length} karakter
                    </Badge>
                    {useCache && (
                      <Badge variant="outline" className="text-green-600">
                        Cache aktif
                      </Badge>
                    )}
                  </div>
                  <Button 
                    onClick={handleSearch}
                    disabled={loading || !query.trim()}
                    className="gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        İşleniyor...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Sorgula
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI ile Geliştir
                </Button>
                <Button variant="outline" size="sm" className="text-xs">
                  <History className="h-3 w-3 mr-1" />
                  Geçmiş Sorgular
                </Button>
                <Button variant="outline" size="sm" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  Şablonlar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Section */}
          {results && (
            <Card className="border-primary/20">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Sorgu Sonuçları</CardTitle>
                    <CardDescription className="mt-1">
                      İşlem süresi: {results.processingTime} • Güven: %{(results.confidence * 100).toFixed(0)}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gradient-to-br from-muted/30 to-muted/50 rounded-lg border border-primary/10">
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm leading-relaxed space-y-3">
                      <p>
                        <span className="marker-cyan animate-shimmer">Kira sözleşmesinin feshi</span> için gerekli prosedürler {" "}
                        <span className="marker-yellow animate-shimmer">Türk Borçlar Kanunu'nun 347-356. maddeleri</span> arasında düzenlenmiştir.
                      </p>
                      <p>
                        Kiracı veya kiraya veren, <span className="marker-pink animate-shimmer">belirli şartlar altında</span> sözleşmeyi 
                        feshedebilir. <span className="marker-green">Önemli sebepler</span> arasında:
                      </p>
                      <ul className="ml-4 space-y-1 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="text-cyan-500 mt-1">•</span>
                          <span>Kira bedelinin <span className="marker-cyan">ödenmemesi</span></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-yellow-500 mt-1">•</span>
                          <span>Taşınmazın <span className="marker-yellow">amacına aykırı kullanımı</span></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-pink-500 mt-1">•</span>
                          <span>Komşuları <span className="marker-pink">rahatsız edici davranışlar</span></span>
                        </li>
                      </ul>
                    </div>
                    
                    <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-md border-l-4 border-cyan-500 animate-fadeIn">
                      <p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1 flex items-center gap-1">
                        <span className="animate-pulse">📌</span> Önemli Not:
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Fesih bildirimi <strong className="marker-cyan">noter aracılığıyla</strong> yapılmalı ve 
                        <strong className="marker-yellow ml-1">kanuni sürelere</strong> uyulmalıdır.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-600" />
                    <span className="text-gradient">Kaynak Dokümanlar ve Referanslar</span>
                  </h4>
                  <div className="space-y-2">
                    {results.sources.map((source: any, index: number) => (
                      <div 
                        key={source.id} 
                        className={`
                          p-3 rounded-lg transition-all hover:shadow-lg animate-slideInLeft
                          ${index === 0 ? 'bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border border-cyan-200 dark:border-cyan-800' : ''}
                          ${index === 1 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border border-yellow-200 dark:border-yellow-800' : ''}
                          ${index === 2 ? 'bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 border border-pink-200 dark:border-pink-800' : ''}
                          ${index > 2 ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-200 dark:border-green-800' : ''}
                        `}
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-start gap-3 flex-1">
                            <div className={`
                              p-1.5 rounded-md
                              ${index === 0 ? 'bg-cyan-100 dark:bg-cyan-900/50' : ''}
                              ${index === 1 ? 'bg-yellow-100 dark:bg-yellow-900/50' : ''}
                              ${index === 2 ? 'bg-pink-100 dark:bg-pink-900/50' : ''}
                              ${index > 2 ? 'bg-green-100 dark:bg-green-900/50' : ''}
                            `}>
                              <FileText className={`
                                h-4 w-4
                                ${index === 0 ? 'text-cyan-600' : ''}
                                ${index === 1 ? 'text-yellow-600' : ''}
                                ${index === 2 ? 'text-pink-600' : ''}
                                ${index > 2 ? 'text-green-600' : ''}
                              `} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {index === 0 && <span className="marker-cyan">{source.title}</span>}
                                {index === 1 && <span className="marker-yellow">{source.title}</span>}
                                {index === 2 && <span className="marker-pink">{source.title}</span>}
                                {index > 2 && <span className="marker-green">{source.title}</span>}
                              </p>
                              <div className="flex flex-wrap gap-3 mt-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span className="opacity-70">✍️</span> {source.author}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span className="opacity-70">📅</span> {source.date}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span className="opacity-70">📖</span> {source.page}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`
                              ml-2 font-semibold
                              ${source.relevance > 0.9 ? 'border-cyan-500 text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50' : ''}
                              ${source.relevance > 0.8 && source.relevance <= 0.9 ? 'border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/50' : ''}
                              ${source.relevance > 0.7 && source.relevance <= 0.8 ? 'border-pink-500 text-pink-600 bg-pink-50 dark:bg-pink-950/50' : ''}
                              ${source.relevance <= 0.7 ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/50' : ''}
                            `}
                          >
                            %{(source.relevance * 100).toFixed(0)}
                          </Badge>
                        </div>
                        <div className="mt-2 pt-2 border-t border-current/10">
                          <p className="text-xs italic opacity-80">
                            {source.relevance > 0.9 && "✨ Sorgunuzla mükemmel eşleşme - En güvenilir kaynak"}
                            {source.relevance > 0.8 && source.relevance <= 0.9 && "🎯 Yüksek benzerlik - Güvenilir referans"}
                            {source.relevance > 0.7 && source.relevance <= 0.8 && "📌 Orta düzey eşleşme - Destekleyici kaynak"}
                            {source.relevance <= 0.7 && "🔍 İlişkili içerik - Ek bilgi kaynağı"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-md border border-amber-200 dark:border-amber-800 animate-glow">
                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <span className="animate-pulse text-lg">💡</span>
                      <span><strong className="marker-yellow">Tavsiye:</strong> Hukuki konularda kesin bilgi için bir avukata danışmanız önerilir.</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Settings Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Sorgu Ayarları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-3 w-3" />
                  Veri Kaynağı
                </Label>
                <Select value={dataSource} onValueChange={setDataSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="database">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-green-600">Canlı</Badge>
                        PostgreSQL + pgvector
                      </span>
                    </SelectItem>
                    <SelectItem value="mock">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-yellow-600">Test</Badge>
                        Simüle Veri
                      </span>
                    </SelectItem>
                    <SelectItem value="external">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-blue-600">Harici</Badge>
                        OpenAI API
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {dataSource === 'database' && 'Kendi veritabanınızdan gerçek veriler'}
                  {dataSource === 'mock' && 'Test amaçlı örnek veriler'}
                  {dataSource === 'external' && 'Harici AI servislerinden veriler'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Arama Modu</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hybrid">Hybrid (Önerilen)</SelectItem>
                    <SelectItem value="vector">Vector Search</SelectItem>
                    <SelectItem value="keyword">Keyword Search</SelectItem>
                    <SelectItem value="graph">Graph Relations</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Temperature: {temperature[0].toFixed(1)}</Label>
                <Slider
                  value={temperature}
                  onValueChange={handleTemperatureChange}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Düşük: Daha kesin • Yüksek: Daha yaratıcı
                </p>
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                  {temperature[0] <= 0.3 && '🎯 Çok kesin - RAG verilerine sadık kalır'}
                  {temperature[0] > 0.3 && temperature[0] <= 0.6 && '⚖️ Dengeli - Hem doğru hem akıcı'}
                  {temperature[0] > 0.6 && temperature[0] <= 0.8 && '💡 Yaratıcı - Daha geniş yorumlama'}
                  {temperature[0] > 0.8 && '🚀 Çok yaratıcı - Serbest yorumlama'}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="realapi">Gerçek API Kullan</Label>
                <Switch
                  id="realapi"
                  checked={useRealAPI}
                  onCheckedChange={setUseRealAPI}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="cache">Önbellek Kullan</Label>
                <Switch
                  id="cache"
                  checked={useCache}
                  onCheckedChange={setUseCache}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="streaming">Streaming Yanıt</Label>
                <Switch id="streaming" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Son Sorgular
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentQueries.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(q)}
                    className="w-full text-left p-2 text-sm hover:bg-muted rounded-md transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}