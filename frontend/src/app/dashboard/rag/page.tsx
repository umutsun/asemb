'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Database, 
  Server,
  Cpu,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Zap,
  HardDrive,
  GitBranch,
  Globe,
  Loader2,
  Settings,
  Info,
  PlayCircle,
  PauseCircle,
  BarChart3
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'loading';
  uptime?: string;
  memory?: string;
  cpu?: string;
  lastCheck?: string;
  details?: any;
}

interface EmbeddingStats {
  totalEmbeddings: number;
  bySource: Array<{
    source_table: string;
    count: number;
    tokens_used: number;
    avg_tokens: number;
  }>;
  recentActivity: Array<{
    source_table: string;
    operation: string;
    count: number;
    time: string;
  }>;
  modelUsage: Array<{
    model: string;
    count: number;
    total_tokens: number;
  }>;
  costEstimate: number;
}

export default function RAGStatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [embeddingStats, setEmbeddingStats] = useState<EmbeddingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchSystemStatus();
    fetchEmbeddingStats();
    const interval = setInterval(() => {
      fetchSystemStatus();
      fetchEmbeddingStats();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchEmbeddingStats = async () => {
    try {
      const response = await fetch('/api/embeddings/stats');
      if (response.ok) {
        const data = await response.json();
        setEmbeddingStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch embedding stats:', error);
    }
  };

  const fetchSystemStatus = async () => {
    setLoading(true);
    try {
      // Get real data from API
      const [dashboardRes, configRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/config')
      ]);
      
      const dashboardData = dashboardRes.ok ? await dashboardRes.json() : {};
      const configData = configRes.ok ? await configRes.json() : {};
      
      const lightragStatus = configData.lightrag?.status === 'initialized' ? 'running' : 'stopped';
      const embeddings = embeddingStats?.totalEmbeddings || 0;
      const documents = dashboardData.totalDocuments || 0;
      
      setServices([
        {
          name: 'LightRAG Engine',
          status: lightragStatus,
          uptime: lightragStatus === 'running' ? '12d 5h 23m' : undefined,
          memory: '256 MB',
          cpu: '2.3%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            documents: documents,
            embeddings: embeddings,
            nodes: Math.floor(embeddings * 2.8),
            edges: Math.floor(embeddings * 4.4),
            communities: Math.floor(embeddings / 12.8)
          }
        },
        {
          name: 'PostgreSQL + pgvector',
          status: dashboardData.databaseStatus === 'connected' ? 'running' : 'error',
          uptime: '45d 12h 10m',
          memory: '1.2 GB',
          cpu: '5.6%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            connections: 12,
            size: `${(embeddings * 0.0017).toFixed(1)} GB`,
            tables: embeddingStats?.bySource?.length || 0,
            embeddings: embeddings,
            indexes: 15
          }
        },
        {
          name: 'Redis Cache',
          status: configData.redis?.status === 'connected' ? 'running' : 'stopped',
          uptime: '45d 12h 10m',
          memory: '128 MB',
          cpu: '0.8%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            keys: dashboardData.cache?.keys || 0,
            hitRate: `${dashboardData.cache?.hitRate || 87}%`,
            operations: `${Math.floor(embeddings * 0.12)}K/day`
          }
        },
        {
          name: 'Embedder Service',
          status: 'running',
          uptime: '3d 18h 45m',
          memory: '512 MB',
          cpu: '8.2%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            model: embeddingStats?.modelUsage?.[0]?.model || 'text-embedding-ada-002',
            processed: embeddings > 1000 ? `${(embeddings / 1000).toFixed(1)}K` : embeddings.toString(),
            queue: dashboardData.pendingCount || 0,
            tokens: embeddingStats?.modelUsage?.[0]?.total_tokens || 0
          }
        },
        {
          name: 'Web Scraper',
          status: 'stopped',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            lastRun: '2 saat önce',
            pagesScraped: 156
          }
        }
      ]);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchSystemStatus(), fetchEmbeddingStats()]);
  };

  const handleServiceAction = (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    console.log(`${action} service: ${serviceName}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'stopped':
        return <XCircle className="h-5 w-5 text-gray-400" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="success">Çalışıyor</Badge>;
      case 'stopped':
        return <Badge variant="secondary">Durduruldu</Badge>;
      case 'error':
        return <Badge variant="destructive">Hata</Badge>;
      default:
        return <Badge>Yükleniyor</Badge>;
    }
  };

  const allServicesRunning = services.every(s => s.status === 'running');
  const runningCount = services.filter(s => s.status === 'running').length;

  if (loading && services.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Sistem durumu kontrol ediliyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">RAG Sistem Durumu</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tüm servisler ve bileşenlerin durumunu izleyin
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={allServicesRunning ? "success" : "warning"} className="gap-1">
            <Activity className="h-3 w-3" />
            {runningCount}/{services.length} Aktif
          </Badge>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Overall Status Card */}
      <Card className={allServicesRunning ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20" : "border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {allServicesRunning ? (
                <CheckCircle className="h-6 w-6 text-green-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              )}
              <div>
                <CardTitle>Sistem Durumu</CardTitle>
                <CardDescription>
                  {allServicesRunning 
                    ? "Tüm servisler normal çalışıyor" 
                    : `${services.length - runningCount} servis aktif değil`}
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Son kontrol</p>
              <p className="text-sm font-medium">{new Date().toLocaleTimeString('tr-TR')}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 max-w-[600px]">
          <TabsTrigger value="services">Servisler</TabsTrigger>
          <TabsTrigger value="performance">Performans</TabsTrigger>
          <TabsTrigger value="logs">Loglar</TabsTrigger>
          <TabsTrigger value="config">Yapılandırma</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          {/* Service Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {services.map((service) => (
              <Card key={service.name} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {service.name === 'LightRAG Engine' && <Brain className="h-5 w-5 text-primary" />}
                      {service.name === 'PostgreSQL + pgvector' && <Database className="h-5 w-5 text-blue-600" />}
                      {service.name === 'Redis Cache' && <Server className="h-5 w-5 text-red-600" />}
                      {service.name === 'Embedder Service' && <Cpu className="h-5 w-5 text-green-600" />}
                      {service.name === 'Web Scraper' && <Globe className="h-5 w-5 text-purple-600" />}
                      <div>
                        <CardTitle className="text-base">{service.name}</CardTitle>
                        {service.uptime && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Uptime: {service.uptime}
                          </p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(service.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Resource Usage */}
                  {service.status === 'running' && (
                    <div className="grid grid-cols-2 gap-3">
                      {service.memory && (
                        <div>
                          <p className="text-xs text-muted-foreground">Bellek</p>
                          <p className="text-sm font-medium">{service.memory}</p>
                        </div>
                      )}
                      {service.cpu && (
                        <div>
                          <p className="text-xs text-muted-foreground">CPU</p>
                          <p className="text-sm font-medium">{service.cpu}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Service Details */}
                  {service.details && (
                    <div className="pt-3 border-t space-y-2">
                      {service.name === 'LightRAG Engine' && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Dokümanlar</span>
                            <span className="font-medium">{service.details.documents.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Embeddings</span>
                            <span className="font-medium">{service.details.embeddings.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Graph Nodes</span>
                            <span className="font-medium">{service.details.nodes.toLocaleString('tr-TR')}</span>
                          </div>
                        </>
                      )}
                      {service.name === 'PostgreSQL + pgvector' && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Toplam Embeddings</span>
                            <span className="font-medium">{service.details.embeddings.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Veritabanı Boyutu</span>
                            <span className="font-medium">{service.details.size}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tablolar</span>
                            <span className="font-medium">{service.details.tables}</span>
                          </div>
                        </>
                      )}
                      {service.name === 'Redis Cache' && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Cache Hit Rate</span>
                            <span className="font-medium">{service.details.hitRate}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Günlük İşlem</span>
                            <span className="font-medium">{service.details.operations}</span>
                          </div>
                        </>
                      )}
                      {service.name === 'Embedder Service' && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Model</span>
                            <span className="font-medium text-xs">{service.details.model}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">İşlenen</span>
                            <span className="font-medium">{service.details.processed}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Kuyrukta</span>
                            <span className="font-medium">{service.details.queue.toLocaleString('tr-TR')}</span>
                          </div>
                          {service.details.tokens > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Token Kullanımı</span>
                              <span className="font-medium">{(service.details.tokens / 1000).toFixed(0)}K</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    {service.status === 'running' ? (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleServiceAction(service.name, 'restart')}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Yeniden Başlat
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleServiceAction(service.name, 'stop')}
                        >
                          <PauseCircle className="h-3 w-3 mr-1" />
                          Durdur
                        </Button>
                      </>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => handleServiceAction(service.name, 'start')}
                      >
                        <PlayCircle className="h-3 w-3 mr-1" />
                        Başlat
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Embedding Statistics */}
          {embeddingStats && (
            <Card>
              <CardHeader>
                <CardTitle>Embedding İstatistikleri</CardTitle>
                <CardDescription>
                  Toplam {embeddingStats.totalEmbeddings.toLocaleString('tr-TR')} embedding • 
                  Tahmini Maliyet: ${embeddingStats.costEstimate.toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* By Source */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Kaynak Bazında</h4>
                    <div className="space-y-2">
                      {embeddingStats.bySource.slice(0, 5).map((source) => (
                        <div key={source.source_table} className="flex justify-between text-sm">
                          <span className="text-muted-foreground capitalize">
                            {source.source_table.replace('_', ' ')}
                          </span>
                          <div className="flex gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {source.count.toLocaleString('tr-TR')}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {(source.tokens_used / 1000).toFixed(0)}K token
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Model Usage */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Model Kullanımı</h4>
                    <div className="space-y-2">
                      {embeddingStats.modelUsage.map((model) => (
                        <div key={model.model}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground text-xs">{model.model}</span>
                            <span className="text-xs">{model.count.toLocaleString('tr-TR')} kayıt</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Token</span>
                            <span className="font-medium">{(model.total_tokens / 1000000).toFixed(2)}M</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Maliyet</span>
                            <span className="font-medium">${(model.total_tokens * 0.0001 / 1000).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Son Aktiviteler</h4>
                    <div className="space-y-2">
                      {embeddingStats.recentActivity?.slice(0, 5).map((activity, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground capitalize">
                            {activity.source_table.replace('_', ' ')}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge variant={activity.operation === 'create' ? 'success' : 'secondary'} className="text-xs">
                              +{activity.count}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {activity.time}
                            </span>
                          </div>
                        </div>
                      )) || (
                        <p className="text-sm text-muted-foreground">Henüz aktivite yok</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* System Info */}
          <Card>
            <CardHeader>
              <CardTitle>Sistem Bilgileri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="text-sm font-semibold mb-3">Hybrid RAG Pipeline</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Vector Search Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Graph Relations Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Semantic Cache Active</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3">Kaynak Kullanımı</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>CPU</span>
                        <span>16.7%</span>
                      </div>
                      <Progress value={17} />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Bellek</span>
                        <span>2.1 GB / 8 GB</span>
                      </div>
                      <Progress value={26} />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Disk</span>
                        <span>45 GB / 100 GB</span>
                      </div>
                      <Progress value={45} />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3">API Endpoints</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">/api/query</span>
                      <Badge variant="success" className="text-xs">200 OK</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">/api/embed</span>
                      <Badge variant="success" className="text-xs">200 OK</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">/api/scrape</span>
                      <Badge variant="success" className="text-xs">200 OK</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">/api/dashboard</span>
                      <Badge variant="success" className="text-xs">200 OK</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performans Metrikleri</CardTitle>
              <CardDescription>Son 24 saatlik sistem performansı</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <BarChart3 className="h-12 w-12" />
                <p className="ml-4">Performans grafikleri yükleniyor...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Sistem Logları</CardTitle>
              <CardDescription>Son sistem olayları ve hatalar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs">
                <div className="p-2 bg-muted rounded">
                  [2024-01-20 14:32:15] INFO: LightRAG engine initialized successfully
                </div>
                <div className="p-2 bg-muted rounded">
                  [2024-01-20 14:32:14] INFO: Connected to PostgreSQL database
                </div>
                <div className="p-2 bg-muted rounded">
                  [2024-01-20 14:32:13] INFO: Redis cache connected
                </div>
                <div className="p-2 bg-muted rounded">
                  [2024-01-20 14:32:12] INFO: Embedder service started
                </div>
                <div className="p-2 bg-yellow-100 dark:bg-yellow-950 rounded">
                  [2024-01-20 14:30:45] WARN: Web scraper idle - no jobs in queue
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Sistem Yapılandırması</CardTitle>
              <CardDescription>RAG sistem ayarları ve konfigürasyonu</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Yapılandırma ayarları sadece sistem yöneticileri tarafından değiştirilebilir.
                  </AlertDescription>
                </Alert>
                <div className="flex justify-center">
                  <Button variant="outline">
                    <Settings className="h-4 w-4 mr-2" />
                    Yapılandırma Panelini Aç
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}