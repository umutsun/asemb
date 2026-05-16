'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
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
  Trash2,
  Globe,
  FileUp,
  DollarSign,
  Activity,
  AlertCircle,
  Clock,
  HeartPulse,
  Wrench,
  AlertTriangle,
  Copy,
  Ghost,
  Scissors
} from 'lucide-react';
import { ProgressCircle } from '@/components/ui/progress-circle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface MigrationStats {
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  tables: {
    name: string;
    count: number;
    embedded: number;
  }[];
  tokenUsage?: {
    total_tokens: number;
    estimated_cost: number;
    savedTokens?: number;
    savedCost?: number;
    cacheHits?: number;
  };
}

interface EmbeddingProgress {
  current: number;
  total: number;
  percentage: number;
  status: string;
  currentTable?: string;
  currentRecord?: string;
  tokenUsage?: {
    total_tokens: number;
    estimated_cost: number;
  };
}

interface DataHealthReport {
  generated_at: string;
  summary: {
    total_embeddings: number;
    orphan_count: number;
    missing_metadata_count: number;
    duplicate_count: number;
    stale_count: number;
    healthy_count: number;
    health_score: number;
  };
  tables: Record<string, {
    total_embeddings: number;
    orphan_count: number;
    missing_metadata_count: number;
    duplicate_count: number;
    stale_count: number;
    healthy_count: number;
    health_score: number;
  }>;
  recommendations: string[];
}

interface FixResult {
  table: string;
  dry_run: boolean;
  orphans?: { orphans_found: number; deleted_count: number };
  duplicates?: { duplicates_found: number; deleted_count: number };
  metadata?: { total_records: number; fixed_count: number; skipped_count: number; error_count: number };
}

export default function MigrationToolsPage() {

  const [activeTab, setActiveTab] = useState('database');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [progress, setProgress] = useState<EmbeddingProgress | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data Health State
  const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [fixLoading, setFixLoading] = useState<string | null>(null);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [selectedHealthTable, setSelectedHealthTable] = useState<string>('all');
  const [dryRun, setDryRun] = useState(true);

  // Document Optimization State
  const [docOptStatus, setDocOptStatus] = useState<{
    is_running: boolean;
    is_paused: boolean;
    current_job: string | null;
    phase: string;
    progress: number;
    total: number;
    processed: number;
    chunk_fixes: number;
    meta_fixes: number;
    llm_fixes: number;
    errors: number;
    elapsed_seconds: number;
    message: string;
    samples: Array<{
      id: number;
      document_id: number;
      before: string;
      after: string;
      fix_types: string[];
      meta_changes: string[];
      changed: boolean;
    }>;
    analysis: {
      total_records: number;
      affected_records: number;
      clean_records: number;
      issues: {
        spaced_letters: number;
        word_breaks: number;
        concatenated: number;
        html: number;
        metadata: number;
      };
      samples: any[];
    } | null;
  } | null>(null);
  const [docOptPolling, setDocOptPolling] = useState(false);

  // Law Chunking State
  const [chunkingLoading, setChunkingLoading] = useState(false);
  const [chunkingStatus, setChunkingStatus] = useState<{
    running: boolean;
    progress: number;
    total: number;
    processed: number;
    chunks_created: number;
    last_law?: string;
    errors: string[];
  } | null>(null);
  
  // Source selection
  const [sourceType, setSourceType] = useState<'database' | 'file' | 'url'>('database');
  const [sourceConfig, setSourceConfig] = useState({
    // Database source
    database: 'lsemb', // Default to LSEMB database
    table: 'all',
    
    // File source
    file: null as File | null,
    
    // URL source
    url: '',
    selector: '',
    maxPages: 10
  });
  
  // Migration settings
  const [migrationConfig, setMigrationConfig] = useState({
    batchSize: 50,
    chunkSize: 1000,
    overlapSize: 200,
    optimizeTokens: true,
    useCache: true
  });

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/v2/migration/stats`);
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
    setProgress({ current: 0, total: 0, percentage: 0, status: 'Starting...' });

    try {
      let endpoint = '';
      let body: any = {};
      
      switch(sourceType) {
        case 'database':
          endpoint = `${API_URL}/api/v2/migration/start`;
          body = {
            sourceTable: sourceConfig.table,
            ...migrationConfig
          };
          break;
          
        case 'file':
          if (!sourceConfig.file) {
            throw new Error('Please select a file');
          }
          endpoint = `${API_URL}/api/v2/migration/file`;
          const formData = new FormData();
          formData.append('file', sourceConfig.file);
          Object.entries(migrationConfig).forEach(([key, value]) => {
            formData.append(key, value.toString());
          });
          body = formData;
          break;
          
        case 'url':
          if (!sourceConfig.url) {
            throw new Error('Please enter a URL');
          }
          endpoint = `${API_URL}/api/v2/migration/scrape`;
          body = {
            url: sourceConfig.url,
            selector: sourceConfig.selector,
            maxPages: sourceConfig.maxPages,
            ...migrationConfig
          };
          break;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        ...(sourceType !== 'file' && { headers: { 'Content-Type': 'application/json' }}),
        body: sourceType === 'file' ? body : JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Migration failed');

      // Start polling for progress
      const pollInterval = setInterval(async () => {
        const progressResponse = await fetch(`${API_URL}/api/v2/migration/progress`);
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          setProgress(progressData);
          
          if (progressData.status === 'completed' || progressData.status === 'failed') {
            clearInterval(pollInterval);
            setIsLoading(false);
            
            if (progressData.status === 'completed') {
              setMessage({ 
                type: 'success', 
                text: `Migration complete! ${progressData.tokenUsage ?
                  `Tokens used: ${progressData.tokenUsage.total_tokens.toLocaleString()},
                   Cost: $${progressData.tokenUsage.estimated_cost.toFixed(4)}` : ''}`
              });
              loadStats();
            } else {
              setMessage({ type: 'error', text: 'Migration failed' });
            }
          }
        }
      }, 1000);

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not start migration' });
      setIsLoading(false);
    }
  };

  const generateEmbeddings = async () => {
    setIsLoading(true);
    setMessage(null);
    setProgress({ current: 0, total: stats?.pendingRecords || 0, percentage: 0, status: 'Generating embeddings...' });

    try {
      const response = await fetch(`${API_URL}/api/v2/migration/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchSize: migrationConfig.batchSize,
          useCache: migrationConfig.useCache,
          optimizeTokens: migrationConfig.optimizeTokens
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
              try {
                const data = JSON.parse(line.slice(6));
                setProgress(data);
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      setMessage({ type: 'success', text: 'All embeddings generated!' });
      loadStats();
    } catch (error) {
      setMessage({ type: 'error', text: 'Embedding generation failed' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSourceConfig(prev => ({ ...prev, file }));
      setMessage({ type: 'info', text: `File selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` });
    }
  };

  // ==================== LAW CHUNKING FUNCTIONS ====================

  const startLawChunking = async (dryRun: boolean = false) => {
    setChunkingLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/v2/source/chunk-laws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTable: 'vergilex_mevzuat_kanunlar',
          dryRun: dryRun,
          limit: null
        })
      });

      if (!response.ok) throw new Error('Could not start chunking');

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: dryRun ? 'Dry run started...' : 'Law chunking started...' });
        // Start polling for status
        pollChunkingStatus();
      } else {
        throw new Error(data.error || 'Chunking failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Could not start chunking' });
      setChunkingLoading(false);
    }
  };

  const pollChunkingStatus = async () => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v2/source/chunk-laws/status`);
        if (response.ok) {
          const data = await response.json();
          setChunkingStatus(data);

          if (data.running) {
            setTimeout(poll, 2000);
          } else {
            setChunkingLoading(false);
            if (data.chunks_created > 0) {
              setMessage({ type: 'success', text: `Chunking complete! ${data.chunks_created} articles created.` });
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setChunkingLoading(false);
      }
    };
    poll();
  };

  const stopChunking = async () => {
    try {
      const response = await fetch(`${API_URL}/api/v2/source/chunk-laws/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
      if (response.ok) {
        setMessage({ type: 'info', text: 'Stopping chunking...' });
      }
    } catch (error) {
      console.error('Stop error:', error);
    }
  };

  // ==================== DATA HEALTH FUNCTIONS ====================

  const loadHealthReport = async () => {
    setHealthLoading(true);
    try {
      const response = await fetch('/api/python/data-health?endpoint=report');
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setHealthReport(data);
      } else {
        throw new Error('Failed to load health report');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Could not load health report: ${error.message}` });
    } finally {
      setHealthLoading(false);
    }
  };

  const runQuickFix = async (tableName: string) => {
    setFixLoading(tableName);
    setFixResult(null);
    try {
      const response = await fetch(`/api/python/data-health?action=quick-fix&table=${tableName}&dry_run=${dryRun}`, {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setFixResult(data);
        setMessage({
          type: 'success',
          text: dryRun
            ? `Dry run complete for ${tableName} (no changes made)`
            : `Cleanup complete for ${tableName}!`
        });
        // Reload health report after fix
        if (!dryRun) {
          await loadHealthReport();
        }
      } else {
        throw new Error('Quick fix failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Fix failed: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  const runMetadataFix = async (tableName: string) => {
    setFixLoading(`metadata-${tableName}`);
    try {
      const response = await fetch('/api/python/data-health?action=fix-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          dry_run: dryRun,
          batch_size: 100,
          limit: 5000
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${data.fixed_count} records will be fixed (dry run)`
            : `${data.fixed_count} records fixed!`
        });
        if (!dryRun) await loadHealthReport();
      } else {
        throw new Error('Metadata fix failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Metadata fix failed: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  const runOrphanDelete = async (tableName: string) => {
    setFixLoading(`orphan-${tableName}`);
    try {
      const response = await fetch('/api/python/data-health?action=delete-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          dry_run: dryRun,
          limit: 5000
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${data.orphans_found} orphan records found (dry run)`
            : `${data.deleted_count} orphan records deleted!`
        });
        if (!dryRun) await loadHealthReport();
      } else {
        throw new Error('Orphan delete failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Orphan delete failed: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  const runDuplicateDelete = async (tableName: string) => {
    setFixLoading(`duplicate-${tableName}`);
    try {
      const response = await fetch('/api/python/data-health?action=delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          dry_run: dryRun,
          keep: 'newest'
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        setMessage({
          type: 'success',
          text: dryRun
            ? `${data.duplicates_found} duplicate records found (dry run)`
            : `${data.deleted_count} duplicate records deleted!`
        });
        if (!dryRun) await loadHealthReport();
      } else {
        throw new Error('Duplicate delete failed');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `Duplicate delete failed: ${error.message}` });
    } finally {
      setFixLoading(null);
    }
  };

  // Load health report when switching to health tab
  useEffect(() => {
    if (activeTab === 'health' && !healthReport) {
      loadHealthReport();
    }
  }, [activeTab]);

  // Document Optimization functions
  const docOptFetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/doc-optimization/status`);
      if (res.ok) {
        const data = await res.json();
        setDocOptStatus(data);
        return data;
      }
    } catch (e) {
      // Service might not be running
    }
    return null;
  };

  const docOptStartAnalyze = async () => {
    try {
      const res = await fetch(`${API_URL}/api/doc-optimization/analyze/start`, { method: 'POST' });
      if (res.ok) {
        setDocOptPolling(true);
        setMessage({ type: 'info', text: 'Document analysis started...' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Could not start analysis' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Connection error: ${e.message}` });
    }
  };

  const docOptStartOptimize = async (useLlm: boolean = false) => {
    try {
      const res = await fetch(`${API_URL}/api/doc-optimization/optimize/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_llm: useLlm, batch_size: 100 })
      });
      if (res.ok) {
        setDocOptPolling(true);
        setMessage({ type: 'info', text: `OCR fix started${useLlm ? ' (LLM-assisted)' : ''}...` });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Could not start optimization' });
      }
    } catch (e: any) {
      setMessage({ type: 'error', text: `Connection error: ${e.message}` });
    }
  };

  const docOptControl = async (action: 'pause' | 'resume' | 'stop') => {
    try {
      await fetch(`${API_URL}/api/doc-optimization/${action}`, { method: 'POST' });
      if (action === 'stop') setDocOptPolling(false);
    } catch (e) {}
  };

  // Poll document optimization status
  useEffect(() => {
    if (!docOptPolling) return;
    const interval = setInterval(async () => {
      const status = await docOptFetchStatus();
      if (status && !status.is_running && status.phase !== 'idle') {
        setDocOptPolling(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [docOptPolling]);

  // Load status when switching to doc-opt tab
  useEffect(() => {
    if (activeTab === 'doc-optimization') {
      docOptFetchStatus();
    }
  }, [activeTab]);

  return (
    <div className="p-6 lg:p-8 container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database className="h-8 w-8" />
          Migration & Embedding Center
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Embed database, document, and web content
        </p>
      </div>

      {message && (
        <Alert className={'mb-6 ' + (
          message.type === 'error' ? 'border-red-500' : 
          message.type === 'success' ? 'border-green-500' : 
          'border-blue-500'
        )}>
          <AlertDescription className="flex items-center gap-2">
            {message.type === 'error' && <XCircle className="h-4 w-4" />}
            {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
            {message.type === 'info' && <AlertCircle className="h-4 w-4" />}
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRecords.toLocaleString()}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Embedded</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.embeddedRecords.toLocaleString()}
              </div>
              <Progress 
                value={(stats.embeddedRecords / Math.max(stats.totalRecords, 1)) * 100} 
                className="mt-2 h-1"
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {stats.pendingRecords.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Hash className="h-3 w-3" />
                Token Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {stats.tokenUsage?.total_tokens?.toLocaleString() || '0'}
              </div>
              {stats.tokenUsage?.savedTokens && (
                <div className="text-xs text-green-600">
                  {stats.tokenUsage.savedTokens.toLocaleString()} saved
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                ${stats.tokenUsage?.estimated_cost?.toFixed(4) || '0.00'}
              </div>
              {stats.tokenUsage?.savedCost && (
                <div className="text-xs text-green-600">
                  ${stats.tokenUsage.savedCost.toFixed(4)} saved
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress Bar */}
      {progress && isLoading && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6">
            <div className="grid grid-cols-[180px_1fr] gap-6">
              {/* Progress Circle */}
              <div className="flex flex-col items-center justify-center">
                <ProgressCircle
                  progress={progress.percentage || 0}
                  showPulse={true}
                  size={150}
                />
                <div className="text-center mt-2">
                  <div className="text-sm font-medium flex items-center gap-1 justify-center">
                    <Activity className="h-3 w-3" />
                    {progress.status}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {progress.current} / {progress.total}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground content-center">
                {progress.currentTable && (
                  <div>
                    <span className="font-medium">Table:</span> {progress.currentTable}
                  </div>
                )}
                {progress.currentRecord && (
                  <div className="truncate">
                    <span className="font-medium">Record:</span> {progress.currentRecord}
                  </div>
                )}
                {progress.tokenUsage && (
                  <>
                    <div>
                      <span className="font-medium">Token:</span> {progress.tokenUsage.total_tokens.toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Cost:</span> ${progress.tokenUsage.estimated_cost.toFixed(4)}
                    </div>
                  </>
                )}
              </div>
            </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Estimated time: {Math.ceil((progress.total - progress.current) / 10)} seconds</span>
              </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="database">
            <Database className="h-4 w-4 mr-2" />
            Database
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileUp className="h-4 w-4 mr-2" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="webscrape">
            <Globe className="h-4 w-4 mr-2" />
            Web Scraping
          </TabsTrigger>
          <TabsTrigger value="embeddings">
            <Sparkles className="h-4 w-4 mr-2" />
            Embeddings
          </TabsTrigger>
          <TabsTrigger value="health">
            <HeartPulse className="h-4 w-4 mr-2" />
            Data Health
          </TabsTrigger>
          <TabsTrigger value="doc-optimization">
            <Scissors className="h-4 w-4 mr-2" />
            OCR Fix
          </TabsTrigger>
        </TabsList>

        {/* Database Migration Tab */}
        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Database Migration</CardTitle>
              <CardDescription>
                Data transfer and embedding from existing database tables
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Source Database</Label>
                  <Select 
                    value={sourceConfig.database}
                    onValueChange={(value) => setSourceConfig(prev => ({ ...prev, database: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lsemb">LSEMB DB</SelectItem>
                      <SelectItem value="custom">Custom Database</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Table</Label>
                  <Select 
                    value={sourceConfig.table}
                    onValueChange={(value) => setSourceConfig(prev => ({ ...prev, table: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tables</SelectItem>
                      <SelectItem value="SORUCEVAP">Q&A</SelectItem>
                      <SelectItem value="OZELGELER">Tax Rulings</SelectItem>
                      <SelectItem value="MAKALELER">Articles</SelectItem>
                      <SelectItem value="DANISTAYKARARLARI">Council of State Decisions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Batch Size</Label>
                  <Input
                    type="number"
                    value={migrationConfig.batchSize}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      batchSize: parseInt(e.target.value) 
                    }))}
                  />
                </div>
                <div>
                  <Label>Chunk Size</Label>
                  <Input
                    type="number"
                    value={migrationConfig.chunkSize}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      chunkSize: parseInt(e.target.value) 
                    }))}
                  />
                </div>
                <div>
                  <Label>Overlap</Label>
                  <Input
                    type="number"
                    value={migrationConfig.overlapSize}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      overlapSize: parseInt(e.target.value) 
                    }))}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={migrationConfig.optimizeTokens}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      optimizeTokens: e.target.checked 
                    }))}
                    className="mr-2"
                  />
                  Token Optimization
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={migrationConfig.useCache}
                    onChange={(e) => setMigrationConfig(prev => ({ 
                      ...prev, 
                      useCache: e.target.checked 
                    }))}
                    className="mr-2"
                  />
                  Use Cache
                </label>
              </div>

              <Button 
                onClick={() => {
                  setSourceType('database');
                  startMigration();
                }}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Migration in progress...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Start Migration
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Table Stats */}
          {stats && stats.tables.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Table Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.tables.map(table => (
                    <div key={table.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <span className="font-medium">{table.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {table.count} records
                        </Badge>
                        <Badge variant={table.embedded === table.count ? "success" : "secondary"}>
                          {table.embedded} embedded
                        </Badge>
                        <Progress 
                          value={(table.embedded / Math.max(table.count, 1)) * 100} 
                          className="w-20 h-2"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Upload</CardTitle>
              <CardDescription>
                Upload and embed PDF, Word, Excel or text files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Click to select a file or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOCX, XLSX, TXT, CSV (Max 50MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.txt,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {sourceConfig.file && (
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      <div>
                        <p className="font-medium">{sourceConfig.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(sourceConfig.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSourceConfig(prev => ({ ...prev, file: null }))}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <Button 
                onClick={() => {
                  setSourceType('file');
                  startMigration();
                }}
                disabled={isLoading || !sourceConfig.file}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing document...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Embed Document
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Web Scraping Tab */}
        <TabsContent value="webscrape" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Web Scraping</CardTitle>
              <CardDescription>
                Scrape and embed content from websites
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={sourceConfig.url}
                  onChange={(e) => setSourceConfig(prev => ({ ...prev, url: e.target.value }))}
                />
              </div>

              <div>
                <Label>CSS Selector (Optional)</Label>
                <Input
                  placeholder=".content, article, main"
                  value={sourceConfig.selector}
                  onChange={(e) => setSourceConfig(prev => ({ ...prev, selector: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use a CSS selector to filter content
                </p>
              </div>

              <div>
                <Label>Maximum Number of Pages</Label>
                <Input
                  type="number"
                  value={sourceConfig.maxPages}
                  onChange={(e) => setSourceConfig(prev => ({ 
                    ...prev, 
                    maxPages: parseInt(e.target.value) 
                  }))}
                />
              </div>

              <Button 
                onClick={() => {
                  setSourceType('url');
                  startMigration();
                }}
                disabled={isLoading || !sourceConfig.url}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Scraping web content...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Start Scraping
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embeddings Tab */}
        <TabsContent value="embeddings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Embedding Generation</CardTitle>
              <CardDescription>
                Generate vector embeddings for pending records
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && stats.pendingRecords > 0 ? (
                <>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{stats.pendingRecords.toLocaleString()}</strong> records pending embedding.
                      Estimated cost: <strong>${((stats.pendingRecords * 500) / 1000 * 0.0001).toFixed(2)}</strong>
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Token Optimization</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Removes unnecessary words, saves up to 30%
                      </p>
                    </div>
                    
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Cache System</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Avoids API calls for identical content
                      </p>
                    </div>
                  </div>

                  <Button 
                    onClick={generateEmbeddings}
                    disabled={isLoading}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating embeddings...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Embeddings for {stats.pendingRecords} Records
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    All records have been embedded!
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Law Chunking Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="h-5 w-5" />
                Law Article Chunking
              </CardTitle>
              <CardDescription>
                Improve semantic search quality by splitting law texts into articles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Law texts are split as "Article 1", "Article 2", etc. and each article is embedded as a separate record.
                  This gives more accurate results for queries like "VUK 114".
                </AlertDescription>
              </Alert>

              {/* Chunking Progress */}
              {chunkingStatus?.running && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Processing...</span>
                    <span className="text-sm text-muted-foreground">
                      %{chunkingStatus.progress.toFixed(1)}
                    </span>
                  </div>
                  <Progress value={chunkingStatus.progress} className="mb-2" />
                  <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                    <div>Processed: {chunkingStatus.processed}/{chunkingStatus.total}</div>
                    <div>Created: {chunkingStatus.chunks_created}</div>
                    <div className="truncate">Last: {chunkingStatus.last_law}</div>
                  </div>
                </div>
              )}

              {/* Chunking Result */}
              {chunkingStatus && !chunkingStatus.running && chunkingStatus.chunks_created > 0 && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Chunking complete! {chunkingStatus.chunks_created} articles created.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => startLawChunking(false)}
                  disabled={chunkingLoading}
                  className="flex-1"
                >
                  {chunkingLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Chunking in progress...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      Split Laws into Articles
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => startLawChunking(true)}
                  disabled={chunkingLoading}
                >
                  Dry Run
                </Button>
                {chunkingStatus?.running && (
                  <Button
                    variant="destructive"
                    onClick={stopChunking}
                  >
                    Stop
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Token Stats */}
          {stats?.tokenUsage && (
            <Card>
              <CardHeader>
                <CardTitle>Token Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Tokens</p>
                    <p className="text-2xl font-bold">
                      {stats.tokenUsage.total_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-bold">
                      ${stats.tokenUsage.estimated_cost.toFixed(2)}
                    </p>
                  </div>
                  {stats.tokenUsage.savedTokens && (
                    <div>
                      <p className="text-sm text-muted-foreground">Tokens Saved</p>
                      <p className="text-2xl font-bold text-green-600">
                        {stats.tokenUsage.savedTokens.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {stats.tokenUsage.cacheHits && (
                    <div>
                      <p className="text-sm text-muted-foreground">Cache Hit</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {stats.tokenUsage.cacheHits}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Data Health Tab */}
        <TabsContent value="health" className="space-y-4">
          {/* Health Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HeartPulse className="h-5 w-5" />
                    Data Health Report
                  </CardTitle>
                  <CardDescription>
                    Embedding data health status and cleanup tools
                  </CardDescription>
                </div>
                <Button
                  onClick={loadHealthReport}
                  disabled={healthLoading}
                  variant="outline"
                  size="sm"
                >
                  {healthLoading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {healthLoading && !healthReport ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : healthReport ? (
                <div className="space-y-6">
                  {/* Health Score */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <ProgressCircle
                        progress={healthReport.summary.health_score}
                        size={100}
                        showPulse={healthReport.summary.health_score < 80}
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Toplam</p>
                        <p className="text-lg font-bold">{healthReport.summary.total_embeddings.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600">Healthy</p>
                        <p className="text-lg font-bold text-green-700">{healthReport.summary.healthy_count.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-orange-50 rounded-lg">
                        <p className="text-xs text-orange-600 flex items-center justify-center gap-1">
                          <Ghost className="h-3 w-3" /> Orphan
                        </p>
                        <p className="text-lg font-bold text-orange-700">{healthReport.summary.orphan_count.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-yellow-50 rounded-lg">
                        <p className="text-xs text-yellow-600 flex items-center justify-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Missing Meta
                        </p>
                        <p className="text-lg font-bold text-yellow-700">{healthReport.summary.missing_metadata_count.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-xs text-purple-600 flex items-center justify-center gap-1">
                          <Copy className="h-3 w-3" /> Duplicate
                        </p>
                        <p className="text-lg font-bold text-purple-700">{healthReport.summary.duplicate_count.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {healthReport.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Recommendations</h4>
                      <div className="space-y-1">
                        {healthReport.recommendations.map((rec, idx) => (
                          <p key={idx} className="text-sm text-muted-foreground">
                            {rec}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Click the button above to load the health report.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Quick Fix Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Quick Fix
              </CardTitle>
              <CardDescription>
                Table-based data cleanup and fixing operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dry Run Toggle */}
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Dry Run Mode</p>
                    <p className="text-xs text-amber-600">
                      On: Reports only, makes no changes | Off: Performs real delete/fix operations
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span className="text-sm font-medium text-amber-800">
                    {dryRun ? 'Dry Run' : 'LIVE OPERATION'}
                  </span>
                </label>
              </div>

              {/* Table Selection */}
              {healthReport && Object.keys(healthReport.tables).length > 0 && (
                <div className="space-y-3">
                  <Label>Select Table</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(healthReport.tables).map(([tableName, tableStats]) => (
                      <div
                        key={tableName}
                        className={`p-4 border rounded-lg cursor-pointer transition-all ${
                          selectedHealthTable === tableName
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-gray-400'
                        }`}
                        onClick={() => setSelectedHealthTable(tableName)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{tableName}</span>
                          <Badge
                            variant={tableStats.health_score >= 80 ? 'default' : tableStats.health_score >= 50 ? 'secondary' : 'destructive'}
                          >
                            {tableStats.health_score.toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-xs text-muted-foreground">
                          <div title="Total">{tableStats.total_embeddings}</div>
                          <div className="text-orange-600" title="Orphan">{tableStats.orphan_count}</div>
                          <div className="text-yellow-600" title="Missing Meta">{tableStats.missing_metadata_count}</div>
                          <div className="text-purple-600" title="Duplicate">{tableStats.duplicate_count}</div>
                        </div>
                        <Progress
                          value={tableStats.health_score}
                          className="mt-2 h-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedHealthTable && selectedHealthTable !== 'all' && (
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-sm font-medium">
                    Actions: <span className="text-primary">{selectedHealthTable}</span>
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Button
                      onClick={() => runQuickFix(selectedHealthTable)}
                      disabled={!!fixLoading}
                      className="flex items-center gap-2"
                    >
                      {fixLoading === selectedHealthTable ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      Quick Fix
                    </Button>

                    <Button
                      onClick={() => runMetadataFix(selectedHealthTable)}
                      disabled={!!fixLoading}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {fixLoading === `metadata-${selectedHealthTable}` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Fix Metadata
                    </Button>

                    <Button
                      onClick={() => runOrphanDelete(selectedHealthTable)}
                      disabled={!!fixLoading}
                      variant="outline"
                      className="flex items-center gap-2 text-orange-600 hover:text-orange-700"
                    >
                      {fixLoading === `orphan-${selectedHealthTable}` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ghost className="h-4 w-4" />
                      )}
                      Delete Orphans
                    </Button>

                    <Button
                      onClick={() => runDuplicateDelete(selectedHealthTable)}
                      disabled={!!fixLoading}
                      variant="outline"
                      className="flex items-center gap-2 text-purple-600 hover:text-purple-700"
                    >
                      {fixLoading === `duplicate-${selectedHealthTable}` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      Delete Duplicates
                    </Button>
                  </div>
                </div>
              )}

              {/* Fix Result */}
              {fixResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">
                    Operation Result {fixResult.dry_run && <Badge variant="secondary">Dry Run</Badge>}
                  </h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {fixResult.orphans && (
                      <div>
                        <p className="text-muted-foreground">Orphan</p>
                        <p className="font-medium">
                          {fixResult.orphans.orphans_found} found
                          {!fixResult.dry_run && ` → ${fixResult.orphans.deleted_count} deleted`}
                        </p>
                      </div>
                    )}
                    {fixResult.duplicates && (
                      <div>
                        <p className="text-muted-foreground">Duplicate</p>
                        <p className="font-medium">
                          {fixResult.duplicates.duplicates_found} found
                          {!fixResult.dry_run && ` → ${fixResult.duplicates.deleted_count} deleted`}
                        </p>
                      </div>
                    )}
                    {fixResult.metadata && (
                      <div>
                        <p className="text-muted-foreground">Metadata</p>
                        <p className="font-medium">
                          {fixResult.metadata.fixed_count} / {fixResult.metadata.total_records}
                          {!fixResult.dry_run && ' fixed'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Document Optimization Tab */}
        <TabsContent value="doc-optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Scissors className="h-5 w-5" />
                    Document OCR Fix
                  </CardTitle>
                  <CardDescription>
                    Analyze and fix OCR issues in the document_embeddings table
                  </CardDescription>
                </div>
                {!docOptStatus?.is_running && (
                  <div className="flex gap-2">
                    <Button onClick={docOptStartAnalyze} variant="outline" size="sm">
                      <Activity className="h-4 w-4 mr-1" />
                      Analyze
                    </Button>
                    <Button onClick={() => docOptStartOptimize(false)} size="sm">
                      <Wrench className="h-4 w-4 mr-1" />
                      Fix (Regex)
                    </Button>
                    <Button onClick={() => docOptStartOptimize(true)} size="sm" variant="secondary">
                      <Brain className="h-4 w-4 mr-1" />
                      Fix (LLM)
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Running: ProgressCircle + stats */}
              {docOptStatus?.is_running && (
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <ProgressCircle
                      progress={docOptStatus.progress || 0}
                      showPulse={!docOptStatus.is_paused}
                      size={120}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {docOptStatus.processed.toLocaleString()} / {docOptStatus.total.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{docOptStatus.message}</span>
                      <div className="flex gap-2">
                        {docOptStatus.is_paused ? (
                          <Button size="sm" variant="outline" onClick={() => docOptControl('resume')}>Resume</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => docOptControl('pause')}>Pause</Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => docOptControl('stop')}>Stop</Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-xs text-center">
                      <div className="p-2 bg-green-50 rounded">
                        <p className="text-green-600">Chunk Fix</p>
                        <p className="font-bold text-green-700">{docOptStatus.chunk_fixes.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-purple-50 rounded">
                        <p className="text-purple-600">Meta Fix</p>
                        <p className="font-bold text-purple-700">{docOptStatus.meta_fixes.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-orange-50 rounded">
                        <p className="text-orange-600">LLM Fix</p>
                        <p className="font-bold text-orange-700">{docOptStatus.llm_fixes.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-gray-50 rounded">
                        <p className="text-muted-foreground">Duration</p>
                        <p className="font-bold">{Math.round(docOptStatus.elapsed_seconds)}s</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed / Error alerts */}
              {docOptStatus?.phase === 'completed' && !docOptStatus.is_running && (
                <Alert className="mb-4">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription>{docOptStatus.message}</AlertDescription>
                </Alert>
              )}
              {docOptStatus?.phase === 'error' && !docOptStatus.is_running && (
                <Alert className="mb-4" variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{docOptStatus.message}</AlertDescription>
                </Alert>
              )}

              {/* Analysis Results: ProgressCircle (clean %) + compact stats */}
              {docOptStatus?.analysis && !docOptStatus.is_running && (
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <ProgressCircle
                      progress={docOptStatus.analysis.total_records > 0
                        ? Math.round((docOptStatus.analysis.clean_records / docOptStatus.analysis.total_records) * 100)
                        : 0}
                      size={100}
                      showPulse={docOptStatus.analysis.affected_records > 0}
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-2 bg-gray-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-bold">{docOptStatus.analysis.total_records.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-red-50 rounded-lg">
                        <p className="text-xs text-red-600">Issues</p>
                        <p className="text-lg font-bold text-red-700">{docOptStatus.analysis.affected_records.toLocaleString()}</p>
                      </div>
                      <div className="p-2 bg-green-50 rounded-lg">
                        <p className="text-xs text-green-600">Clean</p>
                        <p className="text-lg font-bold text-green-700">{docOptStatus.analysis.clean_records.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {docOptStatus.analysis.issues.spaced_letters > 0 && (
                        <Badge variant="outline">Spaced Letters: {docOptStatus.analysis.issues.spaced_letters}</Badge>
                      )}
                      {docOptStatus.analysis.issues.word_breaks > 0 && (
                        <Badge variant="outline">Word Breaks: {docOptStatus.analysis.issues.word_breaks}</Badge>
                      )}
                      {docOptStatus.analysis.issues.concatenated > 0 && (
                        <Badge variant="outline">Concatenated Text: {docOptStatus.analysis.issues.concatenated}</Badge>
                      )}
                      {docOptStatus.analysis.issues.html > 0 && (
                        <Badge variant="outline">HTML: {docOptStatus.analysis.issues.html}</Badge>
                      )}
                      {docOptStatus.analysis.issues.metadata > 0 && (
                        <Badge variant="outline">Metadata: {docOptStatus.analysis.issues.metadata}</Badge>
                      )}
                    </div>
                    {/* Compact samples */}
                    {docOptStatus.analysis.samples.filter(s => s.changed).length > 0 && (
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {docOptStatus.analysis.samples.filter(s => s.changed).slice(0, 3).map((sample) => (
                          <div key={sample.id} className="p-2 bg-gray-50 rounded text-xs">
                            <p className="text-red-600 line-through truncate">{sample.before}</p>
                            <p className="text-green-700 truncate">{sample.after}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!docOptStatus?.is_running && !docOptStatus?.analysis && docOptStatus?.phase !== 'completed' && docOptStatus?.phase !== 'error' && (
                <div className="text-center py-6 text-muted-foreground">
                  <Scissors className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Click &quot;Analyze&quot; to detect OCR issues.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}