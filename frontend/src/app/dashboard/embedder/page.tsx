'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  Upload, 
  FileText, 
  Loader2,
  CheckCircle,
  AlertTriangle,
  Download,
  Cpu,
  Database,
  BarChart3,
  Settings,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EmbedderPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState('text-embedding-ada-002');

  const handleGenerateEmbedding = async () => {
    if (!text.trim()) {
      setError('Lütfen metin girin');
      return;
    }

    setLoading(true);
    setError('');
    setProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setResult({
        dimensions: 1536,
        model: selectedModel,
        tokens: 245,
        processingTime: '0.8s',
        vectorPreview: [0.0234, -0.0156, 0.0089, 0.0412, -0.0267],
        cost: '$0.0002'
      });
      setProgress(100);
    } catch (err) {
      setError('Embedding oluşturulurken hata oluştu');
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
    }
  };

  const stats = {
    totalEmbeddings: 12543,
    avgProcessingTime: '0.6s',
    totalTokens: 3456789,
    cacheHitRate: '78%'
  };

  const recentJobs = [
    { id: 1, name: 'Legal Documents Batch', status: 'completed', documents: 156, time: '2 dk önce' },
    { id: 2, name: 'Client Contracts', status: 'processing', documents: 89, time: '5 dk önce' },
    { id: 3, name: 'Case Studies', status: 'completed', documents: 234, time: '15 dk önce' },
    { id: 4, name: 'Regulations Update', status: 'failed', documents: 45, time: '1 saat önce' }
  ];

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Embedder Service</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Metinleri vektör temsillerine dönüştürün
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Cpu className="h-3 w-3" />
            OpenAI API
          </Badge>
          <Badge variant="success" className="gap-1">
            <Zap className="h-3 w-3" />
            Aktif
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Toplam Embedding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmbeddings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">+12% bu hafta</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ort. İşlem Süresi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgProcessingTime}</div>
            <p className="text-xs text-muted-foreground mt-1">%15 daha hızlı</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Token Kullanımı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats.totalTokens / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground mt-1">$34.56 maliyet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.cacheHitRate}</div>
            <Progress value={78} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="single" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
          <TabsTrigger value="single">Tekli İşlem</TabsTrigger>
          <TabsTrigger value="batch">Toplu İşlem</TabsTrigger>
          <TabsTrigger value="jobs">İş Kuyruğu</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Metin Girişi</CardTitle>
                  <CardDescription>
                    Vektör oluşturmak için metninizi girin
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Model Seçimi</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text-embedding-ada-002">text-embedding-ada-002 (OpenAI)</SelectItem>
                        <SelectItem value="text-embedding-3-small">text-embedding-3-small (OpenAI)</SelectItem>
                        <SelectItem value="text-embedding-3-large">text-embedding-3-large (OpenAI)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Metin ({text.length} karakter)</Label>
                    <Textarea
                      placeholder="Embedding oluşturulacak metni buraya girin..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                  </div>

                  {loading && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>İşleniyor...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-2" />
                        Dosyadan Yükle
                      </Button>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Gelişmiş Ayarlar
                      </Button>
                    </div>
                    <Button 
                      onClick={handleGenerateEmbedding}
                      disabled={loading || !text.trim()}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          İşleniyor...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Embedding Oluştur
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {result && (
                <Card className="border-green-200 dark:border-green-800">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          Embedding Başarıyla Oluşturuldu
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Model: {result.model}
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        İndir
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Boyut</p>
                        <p className="font-semibold">{result.dimensions}D</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Token</p>
                        <p className="font-semibold">{result.tokens}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Süre</p>
                        <p className="font-semibold">{result.processingTime}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Maliyet</p>
                        <p className="font-semibold">{result.cost}</p>
                      </div>
                    </div>

                    <div className="p-3 bg-muted/50 rounded-md">
                      <p className="text-sm font-medium mb-2">Vektör Önizleme (ilk 5 değer):</p>
                      <code className="text-xs">
                        [{result.vectorPreview.join(', ')}...]
                      </code>
                    </div>
                  </CardContent>
                </Card>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Kullanım İstatistikleri</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Günlük Limit</span>
                        <span>8,543 / 10,000</span>
                      </div>
                      <Progress value={85} />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Aylık Token</span>
                        <span>2.3M / 5M</span>
                      </div>
                      <Progress value={46} />
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-sm">
                        <span>API Durumu</span>
                        <Badge variant="success">Çalışıyor</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Toplu Embedding İşlemi</CardTitle>
              <CardDescription>
                Birden fazla doküman için embedding oluşturun
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-2">
                  Dosyaları sürükleyin veya tıklayın
                </p>
                <p className="text-xs text-muted-foreground">
                  CSV, TXT, JSON formatları desteklenir (Max: 100MB)
                </p>
                <Button variant="outline" className="mt-4">
                  Dosya Seç
                </Button>
              </div>

              <div className="flex justify-between">
                <div className="text-sm text-muted-foreground">
                  Desteklenen formatlar: .txt, .csv, .json, .pdf
                </div>
                <Button>
                  <Play className="h-4 w-4 mr-2" />
                  Toplu İşlemi Başlat
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>İş Kuyruğu</CardTitle>
                  <CardDescription>Aktif ve tamamlanan embedding işlemleri</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Yenile
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div>
                        {job.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-600" />}
                        {job.status === 'processing' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                        {job.status === 'failed' && <AlertTriangle className="h-5 w-5 text-red-600" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{job.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.documents} doküman • {job.time}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        job.status === 'completed' ? 'success' :
                        job.status === 'processing' ? 'default' : 'destructive'
                      }>
                        {job.status === 'completed' ? 'Tamamlandı' :
                         job.status === 'processing' ? 'İşleniyor' : 'Başarısız'}
                      </Badge>
                      {job.status === 'processing' && (
                        <Button variant="ghost" size="icon">
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}