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

export default function RAGStatusPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSystemStatus = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setServices([
        {
          name: 'LightRAG Engine',
          status: 'running',
          uptime: '12d 5h 23m',
          memory: '256 MB',
          cpu: '2.3%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            documents: 1234,
            nodes: 5678,
            edges: 8912,
            communities: 156
          }
        },
        {
          name: 'PostgreSQL + pgvector',
          status: 'running',
          uptime: '45d 12h 10m',
          memory: '1.2 GB',
          cpu: '5.6%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            connections: 12,
            size: '3.4 GB',
            tables: 8,
            indexes: 15
          }
        },
        {
          name: 'Redis Cache',
          status: 'running',
          uptime: '45d 12h 10m',
          memory: '128 MB',
          cpu: '0.8%',
          lastCheck: new Date().toLocaleTimeString('tr-TR'),
          details: {
            keys: 3456,
            hitRate: '87%',
            operations: '234K/day'
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
            model: 'text-embedding-ada-002',
            processed: '12.3K',
            queue: 0
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
    await fetchSystemStatus();
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
          <h1 className="text-3xl font-bold tracking-tight">RAG Sistem Durumu</h1>
          <p className="text-muted-foreground mt-2">
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
                            <span className="font-medium">{service.details.documents}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Graph Nodes</span>
                            <span className="font-medium">{service.details.nodes}</span>
                          </div>
                        </>
                      )}
                      {service.name === 'PostgreSQL + pgvector' && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Bağlantılar</span>
                            <span className="font-medium">{service.details.connections}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Veritabanı Boyutu</span>
                            <span className="font-medium">{service.details.size}</span>
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