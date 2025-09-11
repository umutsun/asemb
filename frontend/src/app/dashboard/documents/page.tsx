'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import toast, { Toaster } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download,
  Eye,
  Loader2,
  CheckCircle,
  AlertCircle,
  Database,
  FolderOpen,
  File,
  FileJson,
  FileCode,
  Search,
  Filter,
  RefreshCw,
  History,
  Calendar,
  Hash,
  Brain,
  Zap
} from 'lucide-react';

interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  size: number;
  metadata: {
    source?: string;
    created_at: string;
    updated_at: string;
    chunks?: number;
    embeddings?: boolean;
  };
}

interface HistoryEntry {
  id: number;
  filename: string;
  file_size?: number;
  file_type?: string;
  content?: string;
  chunks_count: number;
  embeddings_created: boolean;
  success: boolean;
  error_message?: string;
  metadata?: any;
  created_at: string;
}

export default function DocumentManagerPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [uploadProgress, setUploadProgress] = useState(0);
      const [activeTab, setActiveTab] = useState('documents');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    initHistoryTables();
    initDocumentsTable();
    fetchDocuments();
    fetchHistory();
  }, []);

  const initDocumentsTable = async () => {
    try {
      await fetch('http://localhost:8083/api/v2/documents/init', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to init documents table:', error);
    }
  };

  const initHistoryTables = async () => {
    try {
      await fetch('http://localhost:8083/api/v2/history/init', {
        method: 'POST'
      });
    } catch (error) {
      console.error('Failed to init history tables:', error);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/history/documents');
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveToHistory = async (filename: string, file_size: number, file_type: string, content: string, success: boolean, error_message?: string) => {
    try {
      await fetch('http://localhost:8083/api/v2/history/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          file_size,
          file_type,
          content: content?.substring(0, 5000),
          chunks_count: 0,
          embeddings_created: false,
          success,
          error_message
        })
      });
      fetchHistory();
    } catch (error) {
      console.error('Failed to save to history:', error);
    }
  };

  const deleteHistoryEntry = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/history/documents/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchHistory();
        toast.success('Geçmiş kaydı silindi');
      } else {
        toast.error('Geçmiş kaydı silinemedi');
      }
    } catch (error) {
      console.error('Failed to delete history entry:', error);
      toast.error('Geçmiş kaydı silinirken hata oluştu');
    }
  };

  const clearAllHistory = async () => {
    if (!confirm('Tüm geçmiş silinecek. Emin misiniz?')) return;
    
    try {
      const response = await fetch('http://localhost:8083/api/v2/history/documents', {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchHistory();
        toast.success('Tüm geçmiş temizlendi');
      } else {
        toast.error('Geçmiş temizlenemedi');
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error('Geçmiş temizlenirken hata oluştu');
    }
  };

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/documents`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const data = await response.json();
        await fetchDocuments();
        
        // Save to history
        await saveToHistory(file.name, file.size, file.type || 'text', '', true);
        
        // Success toast
        toast.success(`${file.name} başarıyla yüklendi!`);
        
        // Reset progress after a delay
        setTimeout(() => {
          setUploadProgress(0);
          // Reset file input
          const fileInput = document.getElementById('file-upload') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        }, 1500);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        const errorMessage = errorData.error || 'Upload failed';
        
        // Check for specific database errors
        if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
          toast.error('Veritabanı tablosu eksik. Lütfen sayfayı yenileyin.');
          // Try to reinitialize table
          await initDocumentsTable();
        } else {
          toast.error(errorMessage);
        }
        
        // Save failed attempt to history
        await saveToHistory(file.name, file.size, file.type || 'text', '', false, errorMessage);
        setUploadProgress(0);
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      const errorMessage = error.message || 'Upload error';
      toast.error(`Yükleme hatası: ${errorMessage}`);
      await saveToHistory(file.name, file.size, file.type || 'text', '', false, errorMessage);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };


  const handleDeleteDocument = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDocuments();
        toast.success('Döküman silindi');
      } else {
        toast.error('Döküman silinemedi');
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast.error('Döküman silinirken hata oluştu');
    }
  };

  const handleCreateEmbeddings = async (id: string, title: string) => {
    setEmbeddingProgress(prev => ({ ...prev, [id]: true }));
    
    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/${id}/embeddings`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchDocuments();
        toast.success(`${title} için embedding'ler oluşturuldu`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Embedding oluşturulamadı');
      }
    } catch (error) {
      console.error('Failed to create embeddings:', error);
      toast.error('Embedding oluşturulurken hata oluştu');
    } finally {
      setEmbeddingProgress(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDeleteEmbeddings = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/documents/${id}/embeddings`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDocuments();
        toast.success('Embedding\'ler silindi');
      } else {
        toast.error('Embedding silinemedi');
      }
    } catch (error) {
      console.error('Failed to delete embeddings:', error);
      toast.error('Embedding silinirken hata oluştu');
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="h-4 w-4" />;
      case 'json': return <FileJson className="h-4 w-4" />;
      case 'code': return <FileCode className="h-4 w-4" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', { 
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="py-6 space-y-6">
      <Toaster position="top-right" />
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Döküman Yönetimi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dökümanlarınızı yönetin ve organize edin
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="documents">
            <FileText className="w-4 h-4 mr-2" />
            Dokümanlar
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Geçmiş
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">

      {/* Stats Cards with Upload */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Döküman
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Boyut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatFileSize(documents.reduce((sum, doc) => sum + doc.size, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Embedding'li
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter(d => d.metadata?.embeddings).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chunk Sayısı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.reduce((sum, doc) => sum + (doc.metadata?.chunks || 0), 0)}
            </div>
          </CardContent>
        </Card>
        
        {/* Compact Upload Card */}
        <Card className={`border-dashed border-2 transition-all ${uploading ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
          <CardContent className="p-0 relative">
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              accept=".txt,.pdf,.json,.md,.csv,.doc,.docx,.xls,.xlsx"
              disabled={uploading}
            />
            <label 
              htmlFor="file-upload" 
              className={`cursor-pointer flex flex-col items-center justify-center h-full py-6 ${uploading ? 'pointer-events-none' : ''}`}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary mb-2 animate-spin" />
                  <span className="text-sm font-medium text-primary">Yükleniyor...</span>
                  <span className="text-xs text-muted-foreground mt-1">{uploadProgress}%</span>
                  <div className="w-full px-4 mt-3">
                    <Progress value={uploadProgress} className="w-full h-2" />
                  </div>
                </>
              ) : uploadProgress === 100 ? (
                <>
                  <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                  <span className="text-sm font-medium text-green-500">Başarılı!</span>
                  <span className="text-xs text-muted-foreground mt-1">Dosya yüklendi</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm font-medium">Dosya Yükle</span>
                  <span className="text-xs text-muted-foreground mt-1">Max 10MB</span>
                  <span className="text-xs text-muted-foreground">txt, pdf, json, md, csv, doc, docx, xls, xlsx</span>
                </>
              )}
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Dökümanlar</CardTitle>
              <Button onClick={fetchDocuments} variant="ghost" size="icon" className="h-8 w-8">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[200px]"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="all">Tümü</option>
                <option value="text">Text</option>
                <option value="pdf">PDF</option>
                <option value="json">JSON</option>
                <option value="code">Code</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Henüz döküman yok</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Başlık</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Boyut</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Embedding</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.type)}
                        {doc.title}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.type}</Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(doc.size)}</TableCell>
                    <TableCell>{doc.metadata?.chunks || 0}</TableCell>
                    <TableCell>
                      {doc.metadata?.embeddings ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-gray-400" />
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(doc.metadata.created_at).toLocaleDateString('tr-TR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!doc.metadata?.embeddings ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCreateEmbeddings(doc.id, doc.title)}
                            disabled={embeddingProgress[doc.id]}
                            title="Embedding Oluştur"
                          >
                            {embeddingProgress[doc.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Brain className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteEmbeddings(doc.id)}
                            title="Embedding'leri Sil"
                          >
                            <Zap className="h-4 w-4 text-yellow-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDocument(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Doküman Yükleme Geçmişi</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={fetchHistory}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearAllHistory}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardDescription>
                Daha önce yüklediğiniz veya eklediğiniz dokümanlar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                  <p className="mt-2 text-muted-foreground">Yükleniyor...</p>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="mx-auto h-12 w-12 mb-2 opacity-50" />
                  <p>Henüz kayıtlı geçmiş yok</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((entry) => (
                    <div 
                      key={entry.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base mb-1 flex items-center gap-2">
                            {getFileIcon(entry.file_type || 'text')}
                            {entry.filename}
                          </h3>
                          {entry.file_type && (
                            <Badge variant="outline" className="text-xs">
                              {entry.file_type}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.success ? (
                            <Badge variant="success">Başarılı</Badge>
                          ) : (
                            <Badge variant="destructive">Başarısız</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteHistoryEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {entry.error_message && (
                        <Alert className="mb-3">
                          <AlertDescription>{entry.error_message}</AlertDescription>
                        </Alert>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          <span>{formatFileSize(entry.file_size || 0)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{entry.chunks_count} chunk</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span>{entry.embeddings_created ? 'Embedding var' : 'Embedding yok'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{formatDate(entry.created_at)}</span>
                        </div>
                      </div>

                      {entry.content && (
                        <div className="mt-3">
                          <details className="cursor-pointer">
                            <summary className="text-sm font-medium mb-2">İçerik Önizleme</summary>
                            <div className="bg-muted/50 rounded-lg p-3 mt-2">
                              <pre className="text-xs whitespace-pre-wrap font-mono">
                                {entry.content.substring(0, 500)}
                                {entry.content.length > 500 && '...'}
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Re-upload functionality removed
                            toast.info('Tekrar yükleme özelliği kaldırıldı');
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Tekrar Yükle
                        </Button>
                        {entry.content && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedDoc({
                                id: `history_${entry.id}`,
                                title: entry.filename,
                                content: entry.content || '',
                                type: entry.file_type || 'text',
                                size: entry.file_size || 0,
                                metadata: {
                                  created_at: entry.created_at,
                                  updated_at: entry.created_at,
                                  chunks: entry.chunks_count,
                                  embeddings: entry.embeddings_created
                                }
                              });
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Görüntüle
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}