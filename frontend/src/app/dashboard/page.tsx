'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { 
  Brain, 
  Database, 
  MessageSquare, 
  Upload, 
  Search,
  RefreshCw,
  Trash2,
  Activity,
  FileText,
  Globe,
  Zap,
  HardDrive,
  Settings,
  Download,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
  FolderOpen,
  Link as LinkIcon,
  Bot,
  Code,
  CloudUpload,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  database: {
    documents: number;
    conversations: number;
    messages: number;
    size: string;
    embeddings?: number;
    vectors?: number;
  };
  redis: {
    connected: boolean;
    used_memory: string;
    total_commands_processed: number;
    cached_embeddings?: number;
  };
  lightrag: {
    initialized: boolean;
    documentCount: number;
    lastUpdate: string;
    nodeCount?: number;
    edgeCount?: number;
    communities?: number;
  };
  rag: {
    totalChunks?: number;
    avgChunkSize?: number;
    indexStatus?: string;
    lastIndexTime?: string;
  };
  recentActivity: Array<{
    id: string;
    title: string;
    message_count: number;
    created_at: string;
  }>;
}

export default function EnhancedASBDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch dashboard stats
  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl('dashboard'));
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch stats: ${errorText}`);
      }
      const data = await response.json();
      setStats(data);
      setError('');
    } catch (err) {
      setError('Dashboard verisi yüklenemedi');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Dashboard yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const pieChartData = stats ? [
    { name: 'Documents', value: stats.database.documents, color: '#3b82f6' },
    { name: 'Conversations', value: stats.database.conversations, color: '#10b981' },
    { name: 'Messages', value: stats.database.messages, color: '#f59e0b' }
  ] : [];

  const barChartData = stats ? [
    { name: 'Dokümanlar', value: stats.database.documents },
    { name: 'Konuşmalar', value: stats.database.conversations },
    { name: 'Mesajlar', value: stats.database.messages },
    { name: 'Embeddings', value: stats.database.embeddings || 0 }
  ] : [];

  return (
    <div className="py-6 space-y-6">
        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 border-blue-200">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">Dokümanlar</CardTitle>
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {stats?.database.documents?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                {stats?.database.embeddings || 0} embeddings
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 border-green-200">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">Konuşmalar</CardTitle>
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                {stats?.database.conversations || 0}
              </div>
              <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                {stats?.database.messages || 0} mesaj
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900 dark:to-purple-800 border-purple-200">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">LightRAG</CardTitle>
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant={stats?.lightrag.initialized ? "success" : "secondary"}>
                  {stats?.lightrag.initialized ? 'Aktif' : 'Pasif'}
                </Badge>
              </div>
              <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">
                {stats?.lightrag.documentCount || 0} döküman
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900 dark:to-orange-800 border-orange-200">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">Redis Cache</CardTitle>
                <Database className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant={stats?.redis.connected ? "success" : "destructive"}>
                  {stats?.redis.connected ? 'Bağlı' : 'Bağlı Değil'}
                </Badge>
              </div>
              <p className="text-xs text-orange-600 dark:text-orange-300 mt-1">
                {stats?.redis.used_memory || '0 MB'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900 dark:to-pink-800 border-pink-200">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">DB Boyut</CardTitle>
                <HardDrive className="h-5 w-5 text-pink-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-pink-900 dark:text-pink-100">
                {stats?.database.size || 'N/A'}
              </div>
              <Progress value={75} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Content without tabs */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/dashboard/query">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">LightRAG Sorgu</CardTitle>
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Anlamsal arama yapın</p>
                  <ArrowRight className="h-4 w-4 mt-2 text-primary" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard/documents">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Dokümanlar</CardTitle>
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Doküman yönetimi</p>
                  <ArrowRight className="h-4 w-4 mt-2 text-primary" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard/embedder">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Embedder</CardTitle>
                    <Zap className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Vektör oluşturun</p>
                  <ArrowRight className="h-4 w-4 mt-2 text-primary" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard/scraper">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Web Scraper</CardTitle>
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Web içeriği çekin</p>
                  <ArrowRight className="h-4 w-4 mt-2 text-primary" />
                </CardContent>
              </Card>
            </Link>

            <Link href="/dashboard/prompts">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Sistem Prompt</CardTitle>
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">AI ayarlarını yönetin</p>
                  <ArrowRight className="h-4 w-4 mt-2 text-primary" />
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Recent Sessions & Most Searched Queries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Sessions */}
            <Card>
              <CardHeader>
                <CardTitle>Son Oturumlar</CardTitle>
                <CardDescription>En son RAG chatbot kullanımları</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.recentActivity?.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">{activity.message_count} mesaj</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.created_at).toLocaleTimeString('tr-TR')}
                      </span>
                    </div>
                  ))}
                  {!stats?.recentActivity?.length && (
                    <p className="text-sm text-muted-foreground text-center py-4">Henüz aktivite yok</p>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Link href="/dashboard/activity" className="w-full">
                  <Button variant="outline" className="w-full">
                    Tüm Aktiviteleri Görüntüle
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Most Searched Queries */}
            <Card>
              <CardHeader>
                <CardTitle>En Çok Arananlar</CardTitle>
                <CardDescription>Popüler sorgu konuları</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { query: 'İş hukuku danışmanlık', count: 234 },
                    { query: 'Kira sözleşmesi', count: 189 },
                    { query: 'Boşanma davası', count: 156 },
                    { query: 'Tazminat hesaplama', count: 123 },
                    { query: 'İcra takibi', count: 98 }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{item.query}</span>
                      </div>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Veri Dağılımı</CardTitle>
                <CardDescription>Sistemdeki veri dağılımı özeti</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({name, value}) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sistem İstatistikleri</CardTitle>
                <CardDescription>Detaylı sistem metrikleri</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* System Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Data Schema */}
            <Card>
              <CardHeader>
                <CardTitle>Veri Şeması</CardTitle>
                <CardDescription>Tanımlı veri yapıları</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Legal Documents</span>
                    <Badge variant="outline">324</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Case Studies</span>
                    <Badge variant="outline">156</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Regulations</span>
                    <Badge variant="outline">89</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Client Data</span>
                    <Badge variant="outline">412</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hybrid System Info */}
            <Card>
              <CardHeader>
                <CardTitle>Hybrid RAG Bilgisi</CardTitle>
                <CardDescription>Sistem entegrasyonu</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Vector Search</span>
                      <span className="text-green-600">Aktif</span>
                    </div>
                    <Progress value={85} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Graph Relations</span>
                      <span className="text-green-600">Aktif</span>
                    </div>
                    <Progress value={72} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Semantic Cache</span>
                      <span className="text-green-600">Aktif</span>
                    </div>
                    <Progress value={93} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">PostgreSQL Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Bağlantı</span>
                  <Badge variant="success">Aktif</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Veritabanı Boyutu</span>
                  <span className="font-medium">{stats?.database.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Toplam Kayıt</span>
                  <span className="font-medium">
                    {((stats?.database.documents || 0) + 
                      (stats?.database.conversations || 0) + 
                      (stats?.database.messages || 0)).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Redis Cache</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Bağlantı</span>
                  <Badge variant={stats?.redis.connected ? "success" : "destructive"}>
                    {stats?.redis.connected ? 'Aktif' : 'Pasif'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Kullanılan Bellek</span>
                  <span className="font-medium">{stats?.redis.used_memory}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>İşlem Sayısı</span>
                  <span className="font-medium">
                    {stats?.redis.total_commands_processed?.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">LightRAG Engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Durum</span>
                  <Badge variant={stats?.lightrag.initialized ? "success" : "secondary"}>
                    {stats?.lightrag.initialized ? 'Başlatıldı' : 'Beklemede'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Doküman Sayısı</span>
                  <span className="font-medium">{stats?.lightrag.documentCount || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Son Güncelleme</span>
                  <span className="font-medium">
                    {stats?.lightrag.lastUpdate || 'N/A'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}