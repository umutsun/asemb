'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Brain, 
  Zap, 
  Database,
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Hash,
  FileText,
  RefreshCw,
  Download,
  Upload,
  Sparkles,
  Info
} from 'lucide-react';

interface EmbeddingJob {
  id: string;
  text: string;
  model: string;
  dimensions: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  vector?: number[];
  error?: string;
}

interface EmbeddingStats {
  totalEmbeddings: number;
  totalDimensions: number;
  averageProcessingTime: number;
  modelsUsed: string[];
}

export default function EmbeddingsPage() {
  const [text, setText] = useState('');
  const [model, setModel] = useState('text-embedding-ada-002');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<EmbeddingJob[]>([]);
  const [stats, setStats] = useState<EmbeddingStats>({
    totalEmbeddings: 0,
    totalDimensions: 1536,
    averageProcessingTime: 0,
    modelsUsed: ['text-embedding-ada-002'],
  });
  const [selectedVector, setSelectedVector] = useState<number[] | null>(null);

  useEffect(() => {
    fetchStats();
    fetchJobs();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/embeddings/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/embeddings/jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  };

  const generateEmbedding = async () => {
    if (!text.trim()) {
      alert('Lütfen bir metin girin');
      return;
    }

    setLoading(true);
    
    const newJob: EmbeddingJob = {
      id: Date.now().toString(),
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      model,
      dimensions: model === 'text-embedding-ada-002' ? 1536 : 768,
      status: 'processing',
      createdAt: new Date(),
    };
    
    setJobs([newJob, ...jobs]);

    try {
      const response = await fetch('http://localhost:3001/api/v2/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setJobs(prevJobs =>
          prevJobs.map(job =>
            job.id === newJob.id
              ? { ...job, status: 'completed', vector: data.embedding }
              : job
          )
        );
        
        // Update stats
        setStats(prev => ({
          ...prev,
          totalEmbeddings: prev.totalEmbeddings + 1,
        }));
      } else {
        setJobs(prevJobs =>
          prevJobs.map(job =>
            job.id === newJob.id
              ? { ...job, status: 'failed', error: data.error }
              : job
          )
        );
      }
    } catch (error: any) {
      setJobs(prevJobs =>
        prevJobs.map(job =>
          job.id === newJob.id
            ? { ...job, status: 'failed', error: error.message }
            : job
        )
      );
    } finally {
      setLoading(false);
      setText('');
    }
  };

  const visualizeVector = (vector: number[]) => {
    // Take first 50 dimensions for visualization
    const sample = vector.slice(0, 50);
    const max = Math.max(...sample.map(Math.abs));
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
          <span>İlk 50 boyut</span>
          <span>Min: {Math.min(...sample).toFixed(4)} | Max: {Math.max(...sample).toFixed(4)}</span>
        </div>
        <div className="flex gap-[1px] h-20 items-center">
          {sample.map((value, index) => {
            const height = Math.abs(value / max) * 100;
            const isPositive = value > 0;
            return (
              <div
                key={index}
                className={`flex-1 ${isPositive ? 'bg-blue-500' : 'bg-red-500'}`}
                style={{ height: `${height}%`, opacity: 0.7 }}
                title={`Dimension ${index}: ${value.toFixed(4)}`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const downloadVector = (vector: number[], jobId: string) => {
    const blob = new Blob([JSON.stringify(vector, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `embedding_${jobId}.json`;
    a.click();
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Embeddings</h1>
          <p className="text-muted-foreground mt-2">
            OpenAI API ile vektör embedding oluşturun
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Brain className="h-4 w-4" />
          OpenAI
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Embedding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEmbeddings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Boyut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDimensions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ortalama Süre
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageProcessingTime}ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktif Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">ada-002</div>
          </CardContent>
        </Card>
      </div>

      {/* Embedding Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Embedding Oluştur
          </CardTitle>
          <CardDescription>
            Metninizi vektör temsiline dönüştürün
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Embedding oluşturmak istediğiniz metni girin..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
          />
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value="text-embedding-ada-002">text-embedding-ada-002 (1536 dim)</option>
                <option value="text-embedding-3-small">text-embedding-3-small (768 dim)</option>
                <option value="text-embedding-3-large">text-embedding-3-large (3072 dim)</option>
              </select>
            </div>
            <Button 
              onClick={generateEmbedding} 
              disabled={loading || !text.trim()}
              className="mt-6"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Oluştur
                </>
              )}
            </Button>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Embedding'ler otomatik olarak pgvector veritabanına kaydedilir ve semantic search için kullanılabilir.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Recent Embeddings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Son Oluşturulan Embedding'ler</CardTitle>
            <Button onClick={fetchJobs} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Yenile
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">Liste</TabsTrigger>
              <TabsTrigger value="visualization">Görselleştirme</TabsTrigger>
            </TabsList>
            
            <TabsContent value="list">
              {jobs.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">Henüz embedding oluşturulmadı</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metin</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Boyut</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>İşlemler</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="max-w-xs truncate">
                          {job.text}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{job.model}</Badge>
                        </TableCell>
                        <TableCell>{job.dimensions}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {job.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                            {job.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                            {job.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin" />}
                            <span className="text-sm">
                              {job.status === 'completed' ? 'Tamamlandı' :
                               job.status === 'failed' ? 'Başarısız' : 'İşleniyor'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(job.createdAt).toLocaleString('tr-TR')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {job.vector && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedVector(job.vector!)}
                                >
                                  <BarChart3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => downloadVector(job.vector!, job.id)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            
            <TabsContent value="visualization">
              {selectedVector ? (
                <div className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Vektörün ilk 50 boyutu görselleştirilmiştir. Pozitif değerler mavi, negatif değerler kırmızı renkte gösterilir.
                    </AlertDescription>
                  </Alert>
                  {visualizeVector(selectedVector)}
                </div>
              ) : (
                <div className="text-center py-12">
                  <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">
                    Görselleştirmek için bir embedding seçin
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}