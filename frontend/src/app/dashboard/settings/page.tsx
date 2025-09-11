'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Database,
  Key,
  Globe,
  Brain,
  Shield,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  Link,
  Server,
  Zap,
  MessageSquare,
  Play,
  Square,
  Terminal,
  Activity,
  Package,
  FileCode,
  Container
} from 'lucide-react';

interface Config {
  app: {
    name: string;
    description: string;
    version: string;
    locale: string;
  };
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    maxConnections: number;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
  };
  openai: {
    apiKey: string;
    model: string;
    embeddingModel: string;
    maxTokens: number;
    temperature: number;
  };
  anthropic: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
    embeddingModel: string;
  };
  huggingface: {
    apiKey: string;
    model: string;
    endpoint: string;
  };
  n8n: {
    url: string;
    apiKey: string;
  };
  scraper: {
    timeout: number;
    maxConcurrency: number;
    userAgent: string;
  };
  embeddings: {
    chunkSize: number;
    chunkOverlap: number;
    batchSize: number;
    provider: string; // openai, ollama, huggingface
  };
  dataSource: {
    useLocalDb: boolean;
    localDbPercentage: number; // 0-100, verilerin yüzde kaçı local DB'den
    externalApiPercentage: number; // 0-100, verilerin yüzde kaçı external API'den
    hybridMode: boolean;
    prioritySource: string; // 'local' | 'external' | 'balanced'
  };
  llmSettings: {
    temperature: number; // 0-1, yaratıcılık seviyesi
    topP: number; // 0-1, kelime seçim çeşitliliği
    maxTokens: number; // maksimum token sayısı
    presencePenalty: number; // -2 to 2, tekrar cezası
    frequencyPenalty: number; // -2 to 2, sıklık cezası
    ragWeight: number; // 0-100, RAG data ağırlığı
    llmKnowledgeWeight: number; // 0-100, LLM kendi bilgisi ağırlığı
    streamResponse: boolean;
    systemPrompt: string;
    activeChatModel: string; // Chatbot için aktif model
    activeEmbeddingModel: string; // Embedding için aktif model
    responseStyle: string; // professional, casual, academic, technical, friendly
    language: string; // tr, en, auto
  };
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<Config>({
    app: {
      name: 'Alice Semantic Bridge',
      description: 'AI-Powered Knowledge Management System',
      version: '1.0.0',
      locale: 'tr'
    },
    database: {
      host: 'localhost',
      port: 5432,
      name: 'alice_semantic_bridge',
      user: 'postgres',
      password: 'postgres',
      ssl: false,
      maxConnections: 20,
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
    },
    openai: {
      apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
      model: 'gpt-4-turbo-preview',
      embeddingModel: 'text-embedding-3-small',
      maxTokens: 4096,
      temperature: 0.7,
    },
    anthropic: {
      apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
    },
    deepseek: {
      apiKey: process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-coder',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      model: 'llama2',
      embeddingModel: 'nomic-embed-text',
    },
    huggingface: {
      apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY || '',
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      endpoint: 'https://api-inference.huggingface.co/models/',
    },
    n8n: {
      url: 'http://localhost:5678',
      apiKey: '',
    },
    scraper: {
      timeout: 30000,
      maxConcurrency: 3,
      userAgent: 'ASB Web Scraper',
    },
    embeddings: {
      chunkSize: 1000,
      chunkOverlap: 200,
      batchSize: 10,
      provider: 'openai',
    },
    dataSource: {
      useLocalDb: true,
      localDbPercentage: 100, // %100 local DB - sadece RAG_DATA kullan
      externalApiPercentage: 0, // %0 external API
      hybridMode: false,
      prioritySource: 'local',
    },
    llmSettings: {
      temperature: 0.1, // Düşük = RAG'e sadık kalır
      topP: 0.9,
      maxTokens: 2048,
      presencePenalty: 0,
      frequencyPenalty: 0,
      ragWeight: 95, // %95 RAG data
      llmKnowledgeWeight: 5, // %5 LLM kendi bilgisi
      streamResponse: true,
      systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
      activeChatModel: 'openai/gpt-4-turbo-preview',
      activeEmbeddingModel: 'openai/text-embedding-3-small',
      responseStyle: 'professional',
      language: 'tr',
    },
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  // Services state
  const [services, setServices] = useState<Record<string, any>>({
    lightrag: { status: 'stopped' },
    raganything: { status: 'stopped' },
    embedder: { status: 'stopped' },
    postgres: { status: 'stopped' },
    redis: { status: 'stopped' }
  });

  const [serviceLoading, setServiceLoading] = useState<Record<string, boolean>>({
    lightrag: false,
    raganything: false,
    embedder: false,
    postgres: false,
    redis: false
  });

  const handleServiceAction = async (service: string, action: string) => {
    setServiceLoading({ ...serviceLoading, [service]: true });
    try {
      const response = await fetch(`http://localhost:8083/api/v2/services/${service}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        setServices({ ...services, [service]: { ...services[service], status: result.status } });

        const actionText = action === 'start' ? 'başlatıldı' : action === 'stop' ? 'durduruldu' : 'yeniden başlatıldı';
        const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
        
        toast({
          title: "İşlem Başarılı",
          description: `${serviceName} servisi ${actionText}.`,
          duration: 2500,
        });
      } else {
        const failText = action === 'start' ? 'başlatılamadı' : action === 'stop' ? 'durdurulamadı' : 'yeniden başlatılamadı';
        const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
        
        toast({
          title: "İşlem Başarısız",
          description: `${serviceName} servisi ${failText}.`,
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Hata Oluştu",
        description: `${service.charAt(0).toUpperCase() + service.slice(1)} servisiyle iletişim kurulamadı.`,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setServiceLoading({ ...serviceLoading, [service]: false });
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchServiceStatus();
  }, []);

  const fetchServiceStatus = async () => {
    try {
      // Check PostgreSQL
      const pgResponse = await fetch('http://localhost:8083/api/v2/services/postgres/status');
      if (pgResponse.ok) {
        const pgData = await pgResponse.json();
        setServices(prev => ({ ...prev, postgres: { status: pgData.status || 'running' } }));
      }

      // Check Redis
      const redisResponse = await fetch('http://localhost:8083/api/v2/services/redis/status');
      if (redisResponse.ok) {
        const redisData = await redisResponse.json();
        setServices(prev => ({ ...prev, redis: { status: redisData.status || 'running' } }));
      }

      // Check other services
      const servicesResponse = await fetch('http://localhost:8083/api/dashboard');
      if (servicesResponse.ok) {
        const data = await servicesResponse.json();
        setServices(prev => ({
          ...prev,
          lightrag: { status: data.lightrag?.initialized ? 'running' : 'stopped' },
          postgres: { status: data.database ? 'running' : 'stopped' },
          redis: { status: data.redis?.connected ? 'running' : 'stopped' }
        }));
      }
    } catch (error) {
      console.error('Failed to fetch service status:', error);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        toast({
          title: "Başarılı ✨",
          description: "Ayarlarınız başarıyla kaydedildi ve uygulandı.",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast({
        title: "Hata Oluştu",
        description: "Ayarlar kaydedilemedi. Lütfen tekrar deneyin.",
        variant: "destructive",
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (service: string) => {
    setTesting(service);
    try {
      const response = await fetch(`http://localhost:8083/api/v2/config/test/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config[service as keyof Config]),
      });

      const result = await response.json();
      setTestResults({ ...testResults, [service]: result.success });

      if (result.success) {
        toast({
          title: "Bağlantı Başarılı",
          description: `${service.charAt(0).toUpperCase() + service.slice(1)} servisi başarıyla test edildi ve çalışıyor.`,
          duration: 2500,
        });
      } else {
        toast({
          title: "Bağlantı Başarısız",
          description: service.charAt(0).toUpperCase() + service.slice(1) + " servisine bağlanılamadı. Ayarları kontrol edin.",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      setTestResults({ ...testResults, [service]: false });
      toast({
        title: "Test Hatası",
        description: service.charAt(0).toUpperCase() + service.slice(1) + " servisi test edilemedi. Bağlantı ayarlarını kontrol edin.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setTesting(null);
    }
  };

  const updateConfig = (section: keyof Config, field: string, value: any) => {
    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [field]: value,
      },
    });
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Ayarlar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ASB sistem konfigürasyonu ve bağlantı ayarları
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Kaydet
            </>
          )}
        </Button>
      </div>

      {/* Configuration Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-7 gap-1">
          <TabsTrigger value="general">Genel</TabsTrigger>
          <TabsTrigger value="services">Servisler</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="ai-services">AI</TabsTrigger>
          <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
          <TabsTrigger value="integrations">Entegrasyon</TabsTrigger>
          <TabsTrigger value="advanced">Gelişmiş</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Genel Ayarlar
              </CardTitle>
              <CardDescription>
                Uygulama adı ve temel yapılandırma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Uygulama Adı</label>
                <Input
                  value={config.app.name}
                  onChange={(e) => updateConfig('app', 'name', e.target.value)}
                  placeholder="Örn: Mali Müşavir Asistanı"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bu isim tüm sayfalarda görünecektir
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Açıklama</label>
                <Input
                  value={config.app.description}
                  onChange={(e) => updateConfig('app', 'description', e.target.value)}
                  placeholder="Sistem açıklaması"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Versiyon</label>
                  <Input
                    value={config.app.version}
                    onChange={(e) => updateConfig('app', 'version', e.target.value)}
                    placeholder="1.0.0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Dil</label>
                  <select
                    value={config.app.locale}
                    onChange={(e) => updateConfig('app', 'locale', e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Services Management Tab */}
        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* LightRAG Service */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">LightRAG</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.lightrag?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.lightrag?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    {services.lightrag?.status === 'stopped' || !services.lightrag ? (
                      <Button
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleServiceAction('lightrag', 'start')}
                        disabled={serviceLoading.lightrag}
                      >
                        Başlat
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 h-7 text-xs"
                          onClick={() => handleServiceAction('lightrag', 'stop')}
                          disabled={serviceLoading.lightrag}
                        >
                          Durdur
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleServiceAction('lightrag', 'restart')}
                          disabled={serviceLoading.lightrag}
                        >
                          ↻
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PostgreSQL */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">PostgreSQL</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.postgres?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.postgres?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      disabled
                    >
                      5432
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Redis */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Redis</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.redis?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.redis?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      disabled
                    >
                      6379
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Embedder Service */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Embedder</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.embedder?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.embedder?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    {services.embedder?.status === 'stopped' || !services.embedder ? (
                      <Button
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleServiceAction('embedder', 'start')}
                        disabled={serviceLoading.embedder}
                      >
                        Başlat
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 h-7 text-xs"
                          onClick={() => handleServiceAction('embedder', 'stop')}
                          disabled={serviceLoading.embedder}
                        >
                          Durdur
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleServiceAction('embedder', 'restart')}
                          disabled={serviceLoading.embedder}
                        >
                          ↻
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RAGAnything Service */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">RAGAnything</CardTitle>
                  <div className={`h-2 w-2 rounded-full ${services.raganything?.status === 'running' ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {services.raganything?.status === 'running' ? 'Çalışıyor' : 'Durduruldu'}
                  </div>
                  <div className="flex gap-1">
                    {services.raganything?.status === 'stopped' || !services.raganything ? (
                      <Button
                        variant="outline"
                        className="flex-1 h-7 text-xs"
                        onClick={() => handleServiceAction('raganything', 'start')}
                        disabled={serviceLoading.raganything}
                      >
                        Başlat
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1 h-7 text-xs"
                          onClick={() => handleServiceAction('raganything', 'stop')}
                          disabled={serviceLoading.raganything}
                        >
                          Durdur
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleServiceAction('raganything', 'restart')}
                          disabled={serviceLoading.raganything}
                        >
                          ↻
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Komut Referansları:</strong>
              <div className="mt-2 space-y-1 text-xs font-mono">
                <div>• LightRAG: python backend/lightrag_api.py --port 8084</div>
                <div>• RAGAnything: python backend/raganything_server.py --port 8085</div>
                <div>• Embedder: python backend/embedder_service.py --port 8086</div>
                <div>• Docker: docker-compose up -d</div>
              </div>
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                PostgreSQL + pgvector
              </CardTitle>
              <CardDescription>
                Vektör veritabanı bağlantı ayarları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Host</label>
                  <Input
                    value={config.database.host}
                    onChange={(e) => updateConfig('database', 'host', e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Port</label>
                  <Input
                    type="number"
                    value={config.database.port}
                    onChange={(e) => updateConfig('database', 'port', parseInt(e.target.value))}
                    placeholder="5432"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Database</label>
                  <Input
                    value={config.database.name}
                    onChange={(e) => updateConfig('database', 'name', e.target.value)}
                    placeholder="alice_semantic_bridge"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">User</label>
                  <Input
                    value={config.database.user}
                    onChange={(e) => updateConfig('database', 'user', e.target.value)}
                    placeholder="postgres"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    value={config.database.password}
                    onChange={(e) => updateConfig('database', 'password', e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  {testResults.database !== undefined && (
                    testResults.database ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Bağlantı Başarılı
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Bağlantı Başarısız
                      </Badge>
                    )
                  )}
                </div>
                <Button
                  onClick={() => testConnection('database')}
                  disabled={testing === 'database'}
                  variant="outline"
                >
                  {testing === 'database' ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Redis Cache
              </CardTitle>
              <CardDescription>
                Cache sunucu bağlantı ayarları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Host</label>
                  <Input
                    value={config.redis.host}
                    onChange={(e) => updateConfig('redis', 'host', e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Port</label>
                  <Input
                    type="number"
                    value={config.redis.port}
                    onChange={(e) => updateConfig('redis', 'port', parseInt(e.target.value))}
                    placeholder="6379"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Password (Opsiyonel)</label>
                  <Input
                    type="password"
                    value={config.redis.password}
                    onChange={(e) => updateConfig('redis', 'password', e.target.value)}
                    placeholder="Şifre yoksa boş bırakın"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  {testResults.redis !== undefined && (
                    testResults.redis ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Bağlantı Başarılı
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Bağlantı Başarısız
                      </Badge>
                    )
                  )}
                </div>
                <Button
                  onClick={() => testConnection('redis')}
                  disabled={testing === 'redis'}
                  variant="outline"
                >
                  {testing === 'redis' ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Services Tab */}
        <TabsContent value="ai-services" className="space-y-4">
          {/* Data Source Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Veri Kaynağı Ayarları
              </CardTitle>
              <CardDescription>
                Verilerin nereden çekileceğini yönetin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.dataSource.useLocalDb}
                      onChange={(e) => updateConfig('dataSource', 'useLocalDb', e.target.checked)}
                      className="rounded"
                    />
                    Local Database Kullan
                  </label>
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.dataSource.hybridMode}
                      onChange={(e) => updateConfig('dataSource', 'hybridMode', e.target.checked)}
                      className="rounded"
                    />
                    Hybrid Mod (Karışık)
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Local DB Kullanım Oranı: %{config.dataSource.localDbPercentage}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.dataSource.localDbPercentage}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      updateConfig('dataSource', 'localDbPercentage', value);
                      updateConfig('dataSource', 'externalApiPercentage', 100 - value);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0% (Sadece API)</span>
                    <span>50% (Dengeli)</span>
                    <span>100% (Sadece DB)</span>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500" />
                      Local Database
                    </span>
                    <Badge variant="outline" className="text-blue-600">
                      %{config.dataSource.localDbPercentage}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-green-500" />
                      External API
                    </span>
                    <Badge variant="outline" className="text-green-600">
                      %{config.dataSource.externalApiPercentage}
                    </Badge>
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>%100 Local DB:</strong> Tüm veriler kendi veritabanınızdan gelir (hızlı, güvenli)<br />
                    <strong>%70 Local / %30 API:</strong> Önce local DB, bulunamazsa API kullanılır<br />
                    <strong>%0 Local DB:</strong> Sadece external API kullanılır (OpenAI, Claude vb.)
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {/* LLM Response Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                LLM Yanıt Kontrolleri
              </CardTitle>
              <CardDescription>
                Model'in RAG data'ya ne kadar sadık kalacağını ayarlayın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active Model Selection */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-purple-500" />
                    Chatbot Modeli
                  </label>
                  <select
                    value={config.llmSettings.activeChatModel}
                    onChange={(e) => updateConfig('llmSettings', 'activeChatModel', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm mt-1"
                  >
                    <optgroup label="OpenAI">
                      <option value="openai/gpt-4-turbo-preview">GPT-4 Turbo</option>
                      <option value="openai/gpt-4">GPT-4</option>
                      <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </optgroup>
                    <optgroup label="Anthropic">
                      <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
                      <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
                      <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
                    </optgroup>
                    <optgroup label="DeepSeek">
                      <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
                      <option value="deepseek/deepseek-coder">DeepSeek Coder</option>
                    </optgroup>
                    <optgroup label="Ollama (Local)">
                      <option value="ollama/llama2">Llama 2</option>
                      <option value="ollama/mistral">Mistral</option>
                      <option value="ollama/codellama">Code Llama</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    Embedding Modeli
                  </label>
                  <select
                    value={config.llmSettings.activeEmbeddingModel}
                    onChange={(e) => updateConfig('llmSettings', 'activeEmbeddingModel', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm mt-1"
                  >
                    <optgroup label="OpenAI">
                      <option value="openai/text-embedding-3-small">text-embedding-3-small (Hızlı)</option>
                      <option value="openai/text-embedding-3-large">text-embedding-3-large (Kaliteli)</option>
                      <option value="openai/text-embedding-ada-002">text-embedding-ada-002 (Klasik)</option>
                    </optgroup>
                    <optgroup label="Ollama (Local)">
                      <option value="ollama/nomic-embed-text">Nomic Embed Text</option>
                      <option value="ollama/all-minilm">All-MiniLM</option>
                    </optgroup>
                    <optgroup label="HuggingFace">
                      <option value="hf/sentence-transformers">Sentence Transformers</option>
                      <option value="hf/e5-large">E5 Large</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Response Style & Language */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Yanıt Tonu/Üslubu</label>
                  <select
                    value={config.llmSettings.responseStyle}
                    onChange={(e) => updateConfig('llmSettings', 'responseStyle', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    <option value="professional">Profesyonel</option>
                    <option value="casual">Samimi/Rahat</option>
                    <option value="academic">Akademik</option>
                    <option value="technical">Teknik</option>
                    <option value="friendly">Arkadaşça</option>
                    <option value="concise">Kısa ve Öz</option>
                    <option value="detailed">Detaylı</option>
                    <option value="empathetic">Empatik</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Chatbot'un konuşma tarzı
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Yanıt Dili</label>
                  <select
                    value={config.llmSettings.language}
                    onChange={(e) => updateConfig('llmSettings', 'language', e.target.value)}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                    <option value="auto">Otomatik (Soruya göre)</option>
                    <option value="tr-formal">Türkçe (Resmi)</option>
                    <option value="tr-casual">Türkçe (Günlük)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Yanıt dili tercihi
                  </p>
                </div>
              </div>
              {/* RAG vs LLM Weight */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">RAG Data Ağırlığı: %{config.llmSettings.ragWeight}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.llmSettings.ragWeight}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      updateConfig('llmSettings', 'ragWeight', value);
                      updateConfig('llmSettings', 'llmKnowledgeWeight', 100 - value);
                    }}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0% (Serbest LLM)</span>
                    <span>95% (Önerilen)</span>
                    <span>100% (Tam RAG)</span>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-cyan-500" />
                      RAG Data (Veritabanı)
                    </span>
                    <Badge variant="outline" className="text-cyan-600">
                      %{config.llmSettings.ragWeight}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      LLM Bilgisi (GPT/Claude)
                    </span>
                    <Badge variant="outline" className="text-purple-600">
                      %{config.llmSettings.llmKnowledgeWeight}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Temperature Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Temperature: {config.llmSettings.temperature.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.llmSettings.temperature}
                    onChange={(e) => updateConfig('llmSettings', 'temperature', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    0 = Deterministik, 1 = Yaratıcı
                  </p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-1">
                    {config.llmSettings.temperature <= 0.3 && '🎯 Kesin - RAG verilerine sadık'}
                    {config.llmSettings.temperature > 0.3 && config.llmSettings.temperature <= 0.6 && '⚖️ Dengeli - Hem doğru hem akıcı'}
                    {config.llmSettings.temperature > 0.6 && config.llmSettings.temperature <= 0.8 && '💡 Yaratıcı - Geniş yorumlama'}
                    {config.llmSettings.temperature > 0.8 && '🚀 Çok yaratıcı - Serbest'}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Top-P: {config.llmSettings.topP.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.llmSettings.topP}
                    onChange={(e) => updateConfig('llmSettings', 'topP', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Kelime seçim çeşitliliği
                  </p>
                </div>
              </div>

              {/* Penalty Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Presence Penalty: {config.llmSettings.presencePenalty}</label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={config.llmSettings.presencePenalty}
                    onChange={(e) => updateConfig('llmSettings', 'presencePenalty', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Frequency Penalty: {config.llmSettings.frequencyPenalty}</label>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={config.llmSettings.frequencyPenalty}
                    onChange={(e) => updateConfig('llmSettings', 'frequencyPenalty', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-sm font-medium">System Prompt (RAG Talimatı)</label>
                <Textarea
                  value={config.llmSettings.systemPrompt}
                  onChange={(e) => updateConfig('llmSettings', 'systemPrompt', e.target.value)}
                  placeholder="LLM'e RAG context'i nasıl kullanacağını anlatan prompt..."
                  className="h-20 text-xs"
                />
              </div>

              <Alert className="bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200">
                <Info className="h-4 w-4 text-cyan-600" />
                <AlertDescription>
                  <strong>%100 RAG:</strong> Sadece veritabanındaki bilgiler kullanılır<br />
                  <strong>%95 RAG (Önerilen):</strong> RAG öncelikli, az format düzeltmesi<br />
                  <strong>Temperature 0.1:</strong> RAG'e maksimum sadakat<br />
                  <strong>Temperature 0.7:</strong> Dengeli yanıt
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Compact API Keys Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Anahtarları
              </CardTitle>
              <CardDescription>
                Tüm AI servislerinin API anahtarlarını buradan yönetin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* OpenAI */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      OpenAI
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.openai.apiKey}
                      onChange={(e) => updateConfig('openai', 'apiKey', e.target.value)}
                      placeholder="sk-proj-..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('openai')}
                      disabled={testing === 'openai'}
                      className="w-full h-8"
                    >
                      {testing === 'openai' ? '...' : 'Test'}
                    </Button>
                  </div>
                </div>

                {/* Anthropic */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-purple-500" />
                      Anthropic
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.anthropic.apiKey}
                      onChange={(e) => updateConfig('anthropic', 'apiKey', e.target.value)}
                      placeholder="sk-ant-..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('anthropic')}
                      disabled={testing === 'anthropic'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* DeepSeek */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      DeepSeek
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.deepseek.apiKey}
                      onChange={(e) => updateConfig('deepseek', 'apiKey', e.target.value)}
                      placeholder="API Key"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('deepseek')}
                      disabled={testing === 'deepseek'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* HuggingFace */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-yellow-500" />
                      HuggingFace
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      type="password"
                      value={config.huggingface.apiKey}
                      onChange={(e) => updateConfig('huggingface', 'apiKey', e.target.value)}
                      placeholder="hf_..."
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('huggingface')}
                      disabled={testing === 'huggingface'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>

                {/* Ollama (Local) */}
                <div className="grid grid-cols-12 gap-2 items-center p-2 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="col-span-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-500" />
                      Ollama (Local)
                    </label>
                  </div>
                  <div className="col-span-7">
                    <Input
                      value={config.ollama.baseUrl}
                      onChange={(e) => updateConfig('ollama', 'baseUrl', e.target.value)}
                      placeholder="http://localhost:11434"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('ollama')}
                      disabled={testing === 'ollama'}
                      className="w-full h-8"
                    >
                      Test
                    </Button>
                  </div>
                </div>
              </div>

              {/* API Key Help */}
              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <div className="space-y-1">
                    <p><strong>OpenAI:</strong> <a href="https://platform.openai.com/api-keys" target="_blank" className="underline">platform.openai.com</a></p>
                    <p><strong>Anthropic:</strong> <a href="https://console.anthropic.com" target="_blank" className="underline">console.anthropic.com</a></p>
                    <p><strong>HuggingFace:</strong> <a href="https://huggingface.co/settings/tokens" target="_blank" className="underline">huggingface.co/settings</a></p>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          {/* n8n Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                n8n Integration
              </CardTitle>
              <CardDescription>
                Workflow otomasyon bağlantı ayarları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">n8n URL</label>
                <Input
                  value={config.n8n.url}
                  onChange={(e) => updateConfig('n8n', 'url', e.target.value)}
                  placeholder="http://localhost:5678"
                />
              </div>
              <div>
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  value={config.n8n.apiKey}
                  onChange={(e) => updateConfig('n8n', 'apiKey', e.target.value)}
                  placeholder="n8n API key"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced">
          {/* Web Scraper Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Web Scraper
              </CardTitle>
              <CardDescription>
                Web scraping ayarları ve limitleri
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Timeout (ms)</label>
                <Input
                  type="number"
                  value={config.scraper.timeout}
                  onChange={(e) => updateConfig('scraper', 'timeout', parseInt(e.target.value))}
                  placeholder="30000"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Max Concurrency</label>
                <Input
                  type="number"
                  value={config.scraper.maxConcurrency}
                  onChange={(e) => updateConfig('scraper', 'maxConcurrency', parseInt(e.target.value))}
                  placeholder="3"
                />
              </div>
              <div>
                <label className="text-sm font-medium">User Agent</label>
                <Input
                  value={config.scraper.userAgent}
                  onChange={(e) => updateConfig('scraper', 'userAgent', e.target.value)}
                  placeholder="ASB Web Scraper"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="embeddings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Embedding Settings
              </CardTitle>
              <CardDescription>
                Text chunking ve embedding parametreleri
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Chunk Size</label>
                <Input
                  type="number"
                  value={config.embeddings.chunkSize}
                  onChange={(e) => updateConfig('embeddings', 'chunkSize', parseInt(e.target.value))}
                  placeholder="1000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Her chunk'ın maksimum karakter sayısı
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Chunk Overlap</label>
                <Input
                  type="number"
                  value={config.embeddings.chunkOverlap}
                  onChange={(e) => updateConfig('embeddings', 'chunkOverlap', parseInt(e.target.value))}
                  placeholder="200"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Chunk'lar arası örtüşme miktarı
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Batch Size</label>
                <Input
                  type="number"
                  value={config.embeddings.batchSize}
                  onChange={(e) => updateConfig('embeddings', 'batchSize', parseInt(e.target.value))}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tek seferde işlenecek embedding sayısı
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
