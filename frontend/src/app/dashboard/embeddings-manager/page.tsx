'use client';

import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import EmbeddingStats from '@/components/EmbeddingStats';
import VerticalProgressDisplay from '@/components/VerticalProgressDisplay';
import {
  Database,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Search,
  Play,
  Pause,
  Loader2,
  Settings,
  AlertTriangle,
  X
} from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TableInfo {
  name: string;
  displayName: string;
  database: string;
  totalRecords: number;
  embeddedRecords: number;
}

interface MigrationStats {
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  databaseName?: string;
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
  newlyEmbedded?: number;
  errorCount?: number;
  processingSpeed?: number;
  fallbackMode?: boolean;
  fallbackReason?: string;
}

export default function EmbeddingsManagerPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [migrationStats, setMigrationStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [progressUpdateCount, setProgressUpdateCount] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isStartingMigration, setIsStartingMigration] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [embeddingStats, setEmbeddingStats] = useState<any>(null);
  const [batchSize, setBatchSize] = useState(50);
  const [workerCount, setWorkerCount] = useState(2);
  const [embeddingMethod, setEmbeddingMethod] = useState('google-text-embedding-004');
  const [currentEmbeddingMethod, setCurrentEmbeddingMethod] = useState<string | null>(null);
  const [currentBatchSize, setCurrentBatchSize] = useState<number | null>(null);
  const [currentWorkerCount, setCurrentWorkerCount] = useState<number | null>(null);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [displayProgress, setDisplayProgress] = useState<EmbeddingProgress | null>(null);
  const [migrationTables, setMigrationTables] = useState<string[]>([]);
  const [embeddingHistory, setEmbeddingHistory] = useState<any[]>([]);
  const { toast } = useToast();

  const API_BASE = '/api/embeddings';

  // Component cleanup - ensure state is properly reset when component unmounts
  useEffect(() => {
    return () => {
      // Clean up any pending state
      cleanupMigrationState();
    };
  }, []);

  // Smooth animation effect for progress
  useEffect(() => {
    let animationFrame: number;
    let lastUpdateTime = Date.now();

    const animateProgress = () => {
      if (!progress) {
        setDisplayProgress(null);
        return;
      }

      setDisplayProgress(prev => {
        if (!prev) return progress;

        // Calculate time-based smoothing for more natural progress
        const now = Date.now();
        const timeDiff = now - lastUpdateTime;
        lastUpdateTime = now;

        // Smooth transition for percentage
        const targetPercentage = progress.percentage || 0;
        const currentPercentage = prev.percentage || 0;
        const diff = targetPercentage - currentPercentage;

        // Adaptive smoothing based on difference and time
        let smoothingFactor = 0.3; // Default 30% smoothing for faster response

        // If difference is large, use more aggressive smoothing
        if (Math.abs(diff) > 10) {
          smoothingFactor = 0.5; // 50% smoothing for large jumps
        } else if (Math.abs(diff) < 0.2) {
          // If difference is very small, update directly
          return progress;
        }

        // Apply time-based smoothing
        const timeAdjustment = Math.min(timeDiff / 50, 1); // Faster adjustment
        const newPercentage = currentPercentage + diff * smoothingFactor * timeAdjustment;

        return {
          ...progress,
          percentage: Math.max(0, Math.min(100, newPercentage))
        };
      });

      animationFrame = requestAnimationFrame(animateProgress);
    };

    animationFrame = requestAnimationFrame(animateProgress);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [progress]);

  const fetchAvailableTablesAndStats = async () => {
    setIsLoadingTables(true);
    try {
      const response = await fetch(`${API_BASE}/tables`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTables(data.tables || []);
        const totalRecords = data.tables.reduce((acc: number, t: TableInfo) => acc + t.totalRecords, 0);
        const embeddedRecords = data.tables.reduce((acc: number, t: TableInfo) => acc + t.embeddedRecords, 0);
        setMigrationStats({
            totalRecords,
            embeddedRecords,
            pendingRecords: totalRecords - embeddedRecords,
            databaseName: data.databaseName,
        });

        // Fetch embedding statistics
        try {
          const statsResponse = await fetch(`${API_BASE}/stats`);
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setEmbeddingStats(statsData);
          }
        } catch (statsError) {
          console.error('Failed to fetch embedding stats:', statsError);
        }

        // Fetch embedding history - disabled for now (v2 endpoint doesn't exist)
        // try {
        //   const historyResponse = await fetch(`${API_BASE}/history?limit=100`);
        //   if (historyResponse.ok) {
        //     const historyData = await historyResponse.json();
        //     setEmbeddingHistory(historyData);
        //   }
        // } catch (historyError) {
        //   console.error('Error fetching embedding history:', historyError);
        // }
      } else {
        setError('Failed to fetch tables.');
      }
    } catch (error) {
      setError('Could not connect to the server to fetch tables.');
    } finally {
      setIsLoadingTables(false);
    }
  };

  // Cleanup function to reset all migration-related state
  const cleanupMigrationState = () => {
    setProgress(null);
    setDisplayProgress(null);
    setSelectedTables([]);
    setMigrationTables([]);
    setCurrentEmbeddingMethod(null);
    setCurrentBatchSize(null);
    setCurrentWorkerCount(null);
    setProgressUpdateCount(0);
    // Note: Not refreshing tables here to avoid unnecessary API calls
  };

  // Custom hook for SSE progress updates
  const useProgressStream = () => {
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
      // Only connect if there's an active process
      if (progress?.status === 'processing' || progress?.status === 'paused') {
        const eventSource = new EventSource('/api/embeddings/progress/stream');
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📡 SSE Progress update:', data);

            if (data.status && data.status !== 'idle') {
              setProgress(prev => {
                if (!prev) return data;
                // If status changed, always update
                if (prev.status !== data.status) return data;
                // If current table changed, always update
                if (prev.currentTable !== data.currentTable) return data;
                // If percentage changed by more than 1%, update
                const prevPercentage = prev.percentage || 0;
                const newPercentage = data.percentage || 0;
                if (Math.abs(newPercentage - prevPercentage) > 1) return data;
                // If count changed significantly, update
                const prevCurrent = prev.current || 0;
                const newCurrent = data.current || 0;
                if (Math.abs(newCurrent - prevCurrent) > 10) return data;
                // Otherwise, keep previous state to prevent unnecessary re-renders
                return prev;
              });

              // Update display progress for vertical display
              setDisplayProgress(data);

              // Update progress and potentially refresh tables
              if (data.status === 'processing') {
                const newCount = progressUpdateCount + 1;
                setProgressUpdateCount(newCount);
              }

              if (data.status === 'completed' || data.status === 'error') {
                console.log('🔄 Process completed');
                setProgressUpdateCount(0);

                // Show completion notification
                if (data.status === 'completed') {
                  toast({
                    title: "Tamamlandı",
                    description: `Embedding işlemi başarıyla tamamlandı. ${data.current || 0} kayıt işlendi.`,
                  });
                  // Keep progress visible for 5 seconds after completion
                  setTimeout(() => {
                    setProgress(null);
                    setDisplayProgress(null);
                  }, 5000);
                } else if (data.status === 'error' && data.error) {
                  toast({
                    title: "Hata Oluştu",
                    description: `Embedding işlemi hata ile sonlandı: ${data.error}`,
                    variant: "destructive",
                  });
                  // Keep progress visible for 5 seconds after error
                  setTimeout(() => {
                    setProgress(null);
                    setDisplayProgress(null);
                  }, 5000);
                }
              }
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          // Fallback to polling if SSE fails
          eventSource.close();
          eventSourceRef.current = null;
        };

        return () => {
          eventSource.close();
          eventSourceRef.current = null;
        };
      }
    }, [progress?.status, progressUpdateCount]);
  };

  // Use the SSE hook
  useProgressStream();

  useEffect(() => {
    fetchAvailableTablesAndStats();

    // Initial progress check
    const checkInitialProgress = async () => {
      try {
        const response = await fetch(`${API_BASE}/progress`);
        if (response.ok) {
          const data = await response.json();
          console.log('Initial progress check:', data);
          if (data.status && data.status !== 'idle') {
            setProgress(data);
            // If there's a paused migration, restore the selected tables
            if (data.status === 'paused') {
              // Use processedTables as the selected tables for resume
              const tablesToRestore = data.tables || data.processedTables || [];
              if (tablesToRestore.length > 0) {
                setSelectedTables(tablesToRestore);
                setMigrationTables(tablesToRestore);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking initial progress:', error);
      }
    };

    checkInitialProgress();
  }, []);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const pollProgress = async () => {
      try {
        const response = await fetch(`${API_BASE}/progress`);
        if (response.ok) {
          const data = await response.json();
          console.log('🔄 Progress update:', data);
          console.log('📊 Current table in progress:', data.currentTable);
          console.log('⚡ Polling active for status:', progress?.status);

          if (data.status && data.status !== 'idle') {
            // Only update progress if there's a significant change AND it's not idle
            setProgress(prev => {
              if (!prev) return data;

              // If status changed, always update
              if (prev.status !== data.status) return data;

              // If current table changed, always update
              if (prev.currentTable !== data.currentTable) return data;

              // If percentage changed by more than 1%, update
              const prevPercentage = prev.percentage || 0;
              const newPercentage = data.percentage || 0;
              if (Math.abs(newPercentage - prevPercentage) > 1) return data;

              // If count changed significantly, update
              const prevCurrent = prev.current || 0;
              const newCurrent = data.current || 0;
              if (Math.abs(newCurrent - prevCurrent) > 10) return data;

              // Otherwise, keep previous state to prevent unnecessary re-renders
              return prev;
            });

            // Check for quota exceeded error, which now pauses the process
            if ((data.status === 'paused' || data.status === 'error') && data.error &&
                (data.error.includes('OpenAI API kotası aşıldı') ||
                 data.error.includes('You exceeded your current quota') ||
                 data.error.includes('insufficient_quota'))) {
              toast({
                title: "OpenAI Kota Aşıldı",
                description: "İşlem duraklatıldı. Lütfen OpenAI faturalandırmanızı kontrol edip devam edin.",
                variant: "destructive",
              });
            }

            // Update progress and potentially refresh tables
            if (data.status === 'processing') {
              const newCount = progressUpdateCount + 1;
              setProgressUpdateCount(newCount);

              // Note: Automatic table refresh disabled per user request
              // Tables will only refresh when manually clicked
            }

            if (data.status === 'completed' || data.status === 'error') {
              // Note: Automatic table refresh disabled per user request
              console.log('🔄 Process completed');
              // Reset counter
              setProgressUpdateCount(0);

              // Show completion notification
              if (data.status === 'completed') {
                toast({
                  title: "Tamamlandı",
                  description: `Embedding işlemi başarıyla tamamlandı. ${data.current || 0} kayıt işlendi.`,
                });
                // Note: Automatic table refresh disabled per user request
                // Keep progress visible for 5 seconds after completion
                setTimeout(() => {
                  setProgress(null);
                  setDisplayProgress(null);
                }, 5000);
              } else if (data.status === 'error' && data.error) {
                toast({
                  title: "Hata Oluştu",
                  description: `Embedding işlemi hata ile sonlandı: ${data.error}`,
                  variant: "destructive",
                });
                // Keep progress visible for 5 seconds after error
                setTimeout(() => {
                  setProgress(null);
                  setDisplayProgress(null);
                }, 5000);
              }
            }

            // Note: Automatic table refresh disabled per user request
            // Tables will only refresh when manually clicked
          }
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    };

    // Only poll if there's an active process (processing or paused)
    if (progress?.status === 'processing' || progress?.status === 'paused') {
      // Initial check
      pollProgress();

      // Start polling more frequently for smoother updates
      pollInterval = setInterval(pollProgress, 500); // Update every 500ms for real-time feel
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [progress?.status, progressUpdateCount]);

  const startMigration = async (resume = false) => {
    if (selectedTables.length === 0) {
        setError('Please select at least one table.');
        toast({
          title: "Hata",
          description: "Lütfen en az bir tablo seçin.",
          variant: "destructive",
        });
        return;
    }
    setError('');
    setSuccess('');
    setIsStartingMigration(true);

    // Save current settings when starting or resuming migration
    setCurrentEmbeddingMethod(embeddingMethod);
    setCurrentBatchSize(batchSize);
    setCurrentWorkerCount(workerCount);
    setMigrationTables(selectedTables);

    try {
      const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: selectedTables,
          batchSize,
          workerCount,
          resume,
          options: { embeddingMethod }
        })
      });
      if (!response.ok) {
        if (response.status === 401) {
          toast({
            title: "Geçersiz API Anahtarı",
            description: "Lütfen ayarlar'dan OpenAI API anahtarınızı güncelleyin.",
            variant: "destructive",
          });
          setError('Invalid API Key. Please update your OpenAI API key in settings.');
        } else {
          const errorData = await response.json();
          const errorMessage = errorData.error || 'Migration başlatılamadı.';
          setError(errorMessage);

          // Özel hata mesajları
          let detailedMessage = errorMessage;
          if (errorMessage.includes('HuggingFace API key')) {
            detailedMessage = "HuggingFace API anahtarı bulunamadı. Lütfen ayarlardan ekleyin.";
          } else if (errorMessage.includes('Invalid credentials')) {
            detailedMessage = "HuggingFace API anahtarı geçersiz. Lütfen kontrol edin.";
          } else if (errorMessage.includes('quota')) {
            detailedMessage = "API kotası aşıldı. Lütfen faturalandırmanızı kontrol edin.";
          }

          toast({
            title: "Hata",
            description: detailedMessage,
            variant: "destructive",
          });
        }
      } else {
        const data = await response.json();

        // Embedder bilgisini al
        const embedderInfo = data.progress?.embeddingSettings
          ? `${data.progress.embeddingSettings.provider} (${data.progress.embeddingSettings.model})`
          : currentEmbeddingMethod || 'Seçili Embedder';

        // Başlangıç toast'ı
        toast({
          title: resume ? "Devam Ediliyor" : "Başlatıldı",
          description: resume
            ? `Embedding işlemi devam ettiriliyor. (${embedderInfo})`
            : `Embedding işlemi başlatılıyor... (${embedderInfo})`,
        });

        // Backend'den gelen progress durumunu ayarla
        if (data.progress) {
          setProgress(data.progress);
          setDisplayProgress(data.progress);
        } else {
          // Eğer progress yoksa, manuel olarak ayarla
          const newProgress = {
            status: 'processing',
            current: 0,
            total: 100, // Varsayılan değer
            percentage: 0,
            currentTable: selectedTables[0],
            error: null,
            tokensUsed: 0,
            estimatedCost: 0,
            startTime: Date.now(),
            estimatedTimeRemaining: null,
            processedTables: [],
            currentBatch: 0,
            totalBatches: 0,
            migrationId: data.migrationId,
            newlyEmbedded: 0,
            tables: selectedTables,
            embeddingSettings: { provider: 'huggingface', model: 'intfloat/multilingual-e5-small' }
          };
          setProgress(newProgress);
          setDisplayProgress(newProgress);
        }
      }
    } catch (error) {
      setError('An error occurred while starting the migration.');
      toast({
        title: "Hata",
        description: "Migration başlatılırken bir hata oluştu.",
        variant: "destructive",
      });
    } finally {
      setIsStartingMigration(false);
    }
  };

  const abortMigration = async () => {
    try {
      // If migration is processing, try to stop it first
      if (progress?.status === 'processing') {
        const stopResponse = await fetch(`${API_BASE}/stop`, { method: 'POST' });
        // If stop fails with 400, it might already be paused, which is ok
        if (!stopResponse.ok && stopResponse.status !== 400) {
          throw new Error('Failed to stop migration');
        }
      }

      // Always clear the progress completely
      const clearResponse = await fetch(`${API_BASE}/clear`, { method: 'POST' });
      if (!clearResponse.ok) {
        throw new Error('Failed to clear migration progress');
      }

      // Frontend state'ini temizle
      cleanupMigrationState();

      // Manually set progress to null to ensure UI updates immediately
      setProgress(null);

      toast({
        title: "İptal Edildi",
        description: "Embedding işlemi tamamen iptal edildi.",
      });

      // Note: Automatic table refresh disabled per user request
      // User will manually refresh tables when needed
    } catch (error) {
      console.error('Failed to abort migration:', error);
      toast({
        title: "Hata",
        description: "Migration iptal edilemedi.",
        variant: "destructive",
      });
    }
  };

  const pauseMigration = async () => {
    try {
      const response = await fetch(`${API_BASE}/pause`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to pause migration.');
        toast({
          title: "Hata",
          description: errorData.error || 'Migration durdurulamadı.',
          variant: "destructive",
        });
      } else {
        toast({
          title: "Durduruldu",
          description: "Embedding işlemi durduruldu.",
        });

        // UI'ı güncellemek için progress durumunu manuel olarak güncelle
        if (progress) {
          setProgress({
            ...progress,
            status: 'paused'
          });
        }
      }
    } catch (error) {
      setError('An error occurred while pausing the migration.');
      toast({
        title: "Hata",
        description: "Migration durdurulurken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  const stopMigration = async () => {
    try {
      const response = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to stop migration.');
        toast({
          title: "Hata",
          description: errorData.error || 'Migration durdurulamadı.',
          variant: "destructive",
        });
      } else {
        toast({
          title: "Durduruldu",
          description: "Embedding işlemi tamamen durduruldu.",
        });

        // Progress durumunu temizle
        cleanupMigrationState();
        // Note: Automatic table refresh disabled per user request
      }
    } catch (error) {
      setError('An error occurred while stopping the migration.');
      toast({
        title: "Hata",
        description: "Migration durdurulurken bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  
  
  const searchEmbeddings = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 5 })
      });
      if (response.ok) {
        setSearchResults(await response.json());
      } else {
        setError('Search failed.');
      }
    } catch (error) {
      setError('An error occurred during search.');
    } finally {
      setIsSearching(false);
    }
  };

  const getCurrentTableInfo = () => availableTables.find(t => t.name === displayProgress?.currentTable);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">RAG & Embeddings Yönetimi</h1>
          <p className="text-sm text-muted-foreground mt-1">Vektör Veritabanı İşlemleri</p>
        </div>
        <Link href="/dashboard/settings?tab=database"><Button variant="outline" size="sm"><Settings className="w-4 h-4 mr-2" />Veritabanı Ayarları</Button></Link>
      </div>

      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert><CheckCircle className="h-4 w-4" /><AlertDescription>{success}</AlertDescription></Alert>}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="overview">RAG Durumu</TabsTrigger>
          <TabsTrigger value="migration">Embedding İşlemleri</TabsTrigger>
          <TabsTrigger value="history">Geçmiş</TabsTrigger>
          <TabsTrigger value="statistics">İstatistikler</TabsTrigger>
          <TabsTrigger value="search">Test & Arama</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
            {/* Summary Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Toplam Kayıt</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{migrationStats?.totalRecords.toLocaleString('tr-TR') || '0'}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">İşlenmiş</p>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">{migrationStats?.embeddedRecords.toLocaleString('tr-TR') || '0'}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Bekleyen</p>
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{migrationStats?.pendingRecords.toLocaleString('tr-TR') || '0'}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Tamamlandi</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {migrationStats?.totalRecords > 0 ? Math.round((migrationStats.embeddedRecords / migrationStats.totalRecords) * 100) : 0}%
                    </p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">Tahmini Maliyet</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">
                        ${(((migrationStats?.pendingRecords || 0) * 250) / 1000 * 0.0001).toFixed(2)}
                    </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-300 dark:border-gray-700">
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Database</p>
                    <p className="text-lg font-bold text-gray-700 dark:text-gray-300 truncate">
                        {migrationStats?.databaseName || 'rag_chatbot'}
                    </p>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Veri Tabloları</CardTitle>
                    {migrationStats?.databaseName && (
                        <CardDescription className="text-sm">
                            Database: {migrationStats.databaseName}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    {isLoadingTables ? <div className="text-center"><Loader2 className="h-8 w-8 animate-spin" /></div> :
                    <div className="space-y-4">
                        {availableTables.map(table => (
                            <div key={table.name}>
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">{table.displayName}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">
                                            {table.embeddedRecords?.toLocaleString('tr-TR') || '0'} / {table.totalRecords?.toLocaleString('tr-TR') || '0'}
                                        </span>
                                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                                            {table.totalRecords > 0 ? Math.round((table.embeddedRecords / table.totalRecords) * 100) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <Progress value={(table.totalRecords > 0 ? (table.embeddedRecords / table.totalRecords) * 100 : 100)} className="h-2 mt-1" />
                            </div>
                        ))}
                    </div>}
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Geçmişi</CardTitle>
              <CardDescription>Yapılan embedding işlemlerinin detaylı kayıtları</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {embeddingHistory && embeddingHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Tarih</th>
                          <th className="text-left p-2">Model</th>
                          <th className="text-left p-2">Tablolar</th>
                          <th className="text-right p-2">Kayıt Sayısı</th>
                          <th className="text-right p-2">Token Kullanımı</th>
                          <th className="text-right p-2">Maliyet</th>
                          <th className="text-center p-2">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {embeddingHistory.map((record: any, index: number) => (
                          <tr key={index} className="border-b hover:bg-muted/50">
                            <td className="p-2">
                              {new Date(record.started_at).toLocaleString('tr-TR')}
                            </td>
                            <td className="p-2 font-mono text-xs">
                              {record.model_used || '-'}
                            </td>
                            <td className="p-2">
                              <div className="flex flex-wrap gap-1">
                                {record.tables?.map((table: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {table}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="p-2 text-right">
                              {record.processed_records?.toLocaleString('tr-TR') || '0'}
                            </td>
                            <td className="p-2 text-right">
                              {record.tokens_used?.toLocaleString('tr-TR') || '0'}
                            </td>
                            <td className="p-2 text-right">
                              ${record.estimated_cost?.toFixed(4) || '0.0000'}
                            </td>
                            <td className="p-2 text-center">
                              <Badge variant={
                                record.status === 'completed' ? 'default' :
                                record.status === 'failed' ? 'destructive' :
                                record.status === 'processing' ? 'default' :
                                'secondary'
                              }>
                                {record.status === 'completed' ? 'Tamamlandı' :
                                 record.status === 'failed' ? 'Başarısız' :
                                 record.status === 'processing' ? 'İşleniyor' :
                                 record.status === 'paused' ? 'Duraklatıldı' : record.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Henüz embedding geçmişi bulunmuyor
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="migration" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-1 space-y-6">
              <Card>
                <CardHeader><CardTitle>İşlem Ayarları</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Embedding Provider</Label>
                    {progress?.status === 'processing' || progress?.status === 'paused' ? (
                      <div className="p-2 border rounded-md bg-muted">
                        {currentEmbeddingMethod === 'e5-mistral' && 'E5-Mistral-7B (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'bge-m3' && 'BGE-M3 (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'mistral' && 'Mistral-7B (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'openai-text-embedding-3-large' && 'OpenAI text-embedding-3-large (Ücretli)'}
                        {currentEmbeddingMethod === 'openai-text-embedding-3-small' && 'OpenAI text-embedding-3-small (Ücretli)'}
                        {currentEmbeddingMethod === 'cohere-embed-v3' && 'Cohere embed-v3.0 (Ücretli)'}
                        {currentEmbeddingMethod === 'voyage-large-2' && 'Voyage AI voyage-large-2 (Ücretli)'}
                        {currentEmbeddingMethod === 'google-text-embedding-004' && 'Google text-embedding-004 (Ücretli)'}
                        {currentEmbeddingMethod === 'jina-embeddings-v2' && 'Jina AI jina-embeddings-v2 (API - Ücretli)'}
                        {currentEmbeddingMethod === 'jina-embeddings-v2-small' && 'Jina AI jina-embeddings-v2-small (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'all-mpnet-base-v2' && 'all-mpnet-base-v2 (HuggingFace - Ücretsiz)'}
                        {currentEmbeddingMethod === 'local' && 'Local (Basit)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'e5-mistral' && 'E5-Mistral-7B (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'bge-m3' && 'BGE-M3 (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'mistral' && 'Mistral-7B (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'openai-text-embedding-3-large' && 'OpenAI text-embedding-3-large (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'openai-text-embedding-3-small' && 'OpenAI text-embedding-3-small (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'cohere-embed-v3' && 'Cohere embed-v3.0 (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'voyage-large-2' && 'Voyage AI voyage-large-2 (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'google-text-embedding-004' && 'Google text-embedding-004 (Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'jina-embeddings-v2' && 'Jina AI jina-embeddings-v2 (API - Ücretli)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'jina-embeddings-v2-small' && 'Jina AI jina-embeddings-v2-small (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'all-mpnet-base-v2' && 'all-mpnet-base-v2 (HuggingFace - Ücretsiz)'}
                        {!currentEmbeddingMethod && embeddingMethod === 'local' && 'Local (Basit)'}
                      </div>
                    ) : (
                      <Select
                        value={embeddingMethod}
                        onValueChange={setEmbeddingMethod}
                        disabled={progress?.status === 'processing'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="e5-mistral">E5-Multilingual (HuggingFace - Türkçe Destekli)</SelectItem>
                          <SelectItem value="bge-m3">BGE-M3 (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="mistral">Mistral-7B (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="openai-text-embedding-3-large">OpenAI text-embedding-3-large (Ücretli)</SelectItem>
                          <SelectItem value="openai-text-embedding-3-small">OpenAI text-embedding-3-small (Ücretli)</SelectItem>
                          <SelectItem value="cohere-embed-v3">Cohere embed-v3.0 (Ücretli)</SelectItem>
                          <SelectItem value="voyage-large-2">Voyage AI voyage-large-2 (Ücretli)</SelectItem>
                          <SelectItem value="google-text-embedding-004">Google text-embedding-004 (Ücretli)</SelectItem>
                          <SelectItem value="jina-embeddings-v2">Jina AI jina-embeddings-v2 (API - Ücretli)</SelectItem>
                          <SelectItem value="jina-embeddings-v2-small">Jina AI jina-embeddings-v2-small (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="all-mpnet-base-v2">all-mpnet-base-v2 (HuggingFace - Ücretsiz)</SelectItem>
                          <SelectItem value="local">Local (Test)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <Label>Batch Size</Label>
                    {progress?.status === 'processing' ? (
                      <div className="p-2 border rounded-md bg-muted">
                        {currentBatchSize || batchSize}
                      </div>
                    ) : (
                      <Select
                        value={batchSize.toString()}
                        onValueChange={(v) => setBatchSize(parseInt(v))}
                        disabled={progress?.status === 'processing'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="30">30</SelectItem>
                          <SelectItem value="40">40</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <Label>Paralel Embedder</Label>
                    {progress?.status === 'processing' ? (
                      <div className="p-2 border rounded-md bg-muted">
                        {currentWorkerCount || workerCount}
                      </div>
                    ) : (
                      <Select
                        value={workerCount.toString()}
                        onValueChange={(v) => setWorkerCount(parseInt(v))}
                        disabled={progress?.status === 'processing'}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {!progress || progress?.status === 'idle' || progress?.status === 'completed' || progress?.status === 'error' ?
                    <div className="space-y-2">
                      <Button
                        onClick={() => startMigration(false)}
                        disabled={selectedTables.length === 0 || isStartingMigration}
                        className="w-full"
                      >
                        {isStartingMigration ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {isStartingMigration ? "Başlatılıyor..." : selectedTables.length === 0 ? "Tablo Seçin" : "Migration Başlat"}
                      </Button>
                      {selectedTables.length > 0 && (
                        <p className="text-xs text-muted-foreground text-center">
                          {selectedTables.length} tablo seçildi
                        </p>
                      )}
                    </div> :
                  progress?.status === 'paused' ?
                    <div className="flex gap-2">
                      <Button onClick={() => startMigration(true)} className="flex-1">
                        <Play className="w-4 h-4 mr-2" />Devam Et
                      </Button>
                      <Button onClick={abortMigration} variant="destructive" className="flex-1">
                        <X className="w-4 h-4 mr-2" />İptal Et
                      </Button>
                    </div> :
                  progress?.status === 'processing' ?
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button onClick={pauseMigration} variant="secondary" className="flex-1">
                          <Pause className="w-4 h-4 mr-2" />Duraklat
                        </Button>
                        <Button onClick={abortMigration} variant="destructive" className="flex-1">
                          <X className="w-4 h-4 mr-2" />İptal Et
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {progress.currentTable ? `${progress.currentTable} işleniyor...` : "İşlem devam ediyor..."}
                      </p>
                    </div> :
                  null
                  }
                </CardContent>
              </Card>
              {displayProgress && (displayProgress.status === 'processing' || displayProgress.status === 'paused') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {displayProgress.status === 'processing' ? 'Aktif Embedding İşlemi' : 'Duraklatılmış Embedding İşlemi'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VerticalProgressDisplay
                      progress={displayProgress}
                      getCurrentTableInfo={getCurrentTableInfo}
                      migrationTables={migrationTables}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="xl:col-span-3">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Tablo Seçimi</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchAvailableTablesAndStats}
                      disabled={isLoadingTables}
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingTables ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selectedTables.length === availableTables.length) {
                          setSelectedTables([]);
                        } else {
                          setSelectedTables(availableTables.map(t => t.name));
                        }
                      }}
                      disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                    >
                      {selectedTables.length === availableTables.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingTables ? <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> :
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
                          disabled={progress?.status === 'processing' || progress?.status === 'paused'}
                          className="mt-1 rounded"
                        />
                        <label htmlFor={`table-${table.name}`} className="text-sm cursor-pointer flex-1">
                          <div className="font-medium">
                            {table.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {table.totalRecords?.toLocaleString('tr-TR') || '0'} kayıt
                            {table.embeddedRecords > 0 && (
                              <span className="text-green-600 dark:text-green-400">
                                {' • '}{table.embeddedRecords?.toLocaleString('tr-TR') || '0'} embed edilmiş
                                ({Math.round((table.embeddedRecords / table.totalRecords) * 100)}%)
                              </span>
                            )}
                            {table.pendingRecords > 0 && (
                              <span className="text-orange-600 dark:text-orange-400">
                                {' • '}{table.pendingRecords?.toLocaleString('tr-TR') || '0'} bekliyor
                              </span>
                            )}
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="statistics">
          <Card>
            <CardHeader>
              <CardTitle>İstatistikler Taşındı</CardTitle>
              <CardDescription>
                Embedding istatistikleri artık RAG Durumu sayfasında bulunmaktadır.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/rag?tab=embeddings">
                <Button>
                  İstatistikleri Görüntüle
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
            <Card>
                <CardHeader><CardTitle>Test & Arama</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search query..." />
                        <Button onClick={searchEmbeddings} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
                    </div>
                    {searchResults.map((result, i) => <div key={i} className="p-2 border rounded">...</div>)}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}