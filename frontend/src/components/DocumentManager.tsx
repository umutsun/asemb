'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  FileText,
  Upload,
  Trash2,
  Download,
  Eye,
  Edit,
  Save,
  X,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Link as LinkIcon,
  Calendar,
  Hash,
  FolderOpen,
  CheckCircle
} from 'lucide-react';

interface Document {
  id: string;
  title: string;
  content: string;
  metadata: {
    source?: string;
    url?: string;
    timestamp?: string;
    type?: string;
    chunks?: number;
    embeddings?: number;
  };
  created_at: string;
  updated_at?: string;
  status?: 'processed' | 'pending' | 'error';
}

export default function DocumentManager() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  
  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch documents from LightRAG
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/lightrag/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      setError('Dokümanlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Add new document
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const document = {
        title: newTitle,
        content: newContent,
        metadata: {
          source: newUrl ? 'url' : 'manual',
          url: newUrl || undefined,
          timestamp: new Date().toISOString(),
          type: 'text'
        }
      };

      const response = await fetch('/api/lightrag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: [document] })
      });

      if (!response.ok) {
        throw new Error('Doküman eklenemedi');
      }

      // Process with embeddings
      const embedResponse = await fetch('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: newContent,
          metadata: { title: newTitle, source: newUrl || 'manual' }
        })
      });

      if (embedResponse.ok) {
        setSuccess('Doküman başarıyla eklendi ve işlendi');
      }

      // Reset form
      setNewTitle('');
      setNewContent('');
      setNewUrl('');
      setNewFile(null);
      
      // Refresh documents list
      await fetchDocuments();
    } catch (err) {
      setError('Doküman eklenemedi');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError('');
    
    try {
      const text = await file.text();
      setNewTitle(file.name);
      setNewContent(text);
      setSuccess('Dosya içeriği yüklendi. Şimdi dokümanı ekleyebilirsiniz.');
    } catch (err) {
      setError('Dosya okunamadı');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // Delete document
  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Bu dokümanı silmek istediğinizden emin misiniz?')) return;

    try {
      const response = await fetch(`/api/lightrag/documents/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setDocuments(documents.filter(d => d.id !== id));
        setSuccess('Doküman silindi');
      }
    } catch (err) {
      setError('Doküman silinemedi');
      console.error(err);
    }
  };

  // Update document
  const handleUpdateDocument = async () => {
    if (!editingDocument) return;

    try {
      const response = await fetch(`/api/lightrag/documents/${editingDocument.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDocument)
      });

      if (response.ok) {
        await fetchDocuments();
        setEditingDocument(null);
        setSuccess('Doküman güncellendi');
      }
    } catch (err) {
      setError('Doküman güncellenemedi');
      console.error(err);
    }
  };

  // Search documents
  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Doküman Listesi</TabsTrigger>
          <TabsTrigger value="add">Yeni Doküman</TabsTrigger>
          <TabsTrigger value="import">URL\'den İçe Aktar</TabsTrigger>
        </TabsList>

        {/* Documents List */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>LightRAG Dokümanları</CardTitle>
                  <CardDescription>
                    Toplam {documents.length} doküman
                  </CardDescription>
                </div>
                <Button onClick={fetchDocuments} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Yenile
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Doküman ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Documents Table */}
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Başlık</TableHead>
                          <TableHead>Kaynak</TableHead>
                          <TableHead>Chunks</TableHead>
                          <TableHead>Durum</TableHead>
                          <TableHead>Tarih</TableHead>
                          <TableHead className="text-right">İşlemler</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDocuments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              Henüz doküman bulunmuyor
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredDocuments.map((doc) => (
                            <TableRow key={doc.id}>
                              <TableCell>
                                <div className="max-w-[250px]">
                                  <p className="font-medium truncate">{doc.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {doc.content.slice(0, 60)}...
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {doc.metadata?.source || 'Manual'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Hash className="h-3 w-3" />
                                  <span className="text-sm">
                                    {doc.metadata?.chunks || 0}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  doc.status === 'processed' ? 'success' :
                                  doc.status === 'error' ? 'destructive' : 'secondary'
                                }>
                                  {doc.status || 'Pending'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  <span className="text-sm">
                                    {new Date(doc.created_at).toLocaleDateString('tr-TR')}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setSelectedDocument(doc)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
                                      <DialogHeader>
                                        <DialogTitle>{doc.title}</DialogTitle>
                                        <DialogDescription>
                                          Doküman detayları
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <div>
                                          <h4 className="font-medium mb-2">Metadata</h4>
                                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm space-y-1">
                                            {Object.entries(doc.metadata || {}).map(([key, value]) => (
                                              <div key={key} className="flex justify-between">
                                                <span className="text-muted-foreground">{key}:</span>
                                                <span>{String(value)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <h4 className="font-medium mb-2">İçerik</h4>
                                          <ScrollArea className="h-[400px] rounded-md border p-4">
                                            <p className="whitespace-pre-wrap">{doc.content}</p>
                                          </ScrollArea>
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingDocument(doc)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteDocument(doc.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Add Document */}
        <TabsContent value="add" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Yeni Doküman Ekle</CardTitle>
              <CardDescription>
                Metin veya dosya yükleyerek yeni doküman ekleyin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddDocument} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Başlık</label>
                  <Input
                    placeholder="Doküman başlığı"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">İçerik</label>
                  <Textarea
                    placeholder="Doküman içeriği"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="min-h-[300px]"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Dosyadan Yükle (Opsiyonel)</label>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept=".txt,.md,.json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setNewFile(file);
                          handleFileUpload(file);
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={uploading}>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Doküman Ekle ve İşle
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => {
                      setNewTitle('');
                      setNewContent('');
                      setNewFile(null);
                    }}
                  >
                    Temizle
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import from URL */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>URL\'den İçe Aktar</CardTitle>
              <CardDescription>
                Web sayfasından içerik çekip doküman olarak ekleyin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    type="url"
                    className="flex-1"
                  />
                  <Button
                    onClick={async () => {
                      if (!newUrl) return;
                      setUploading(true);
                      try {
                        const response = await fetch('/api/scraper', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: newUrl })
                        });
                        
                        if (response.ok) {
                          const data = await response.json();
                          setNewTitle(data.title || 'İsimsiz');
                          setNewContent(data.content || '');
                          setSuccess('İçerik başarıyla çekildi');
                        }
                      } catch (err) {
                        setError('İçerik çekilemedi');
                      } finally {
                        setUploading(false);
                      }
                    }}
                    disabled={uploading || !newUrl}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {newTitle && newContent && (
                  <Card className="bg-gray-50 dark:bg-gray-800">
                    <CardHeader>
                      <CardTitle className="text-lg">{newTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px] rounded-md border p-3 bg-white dark:bg-gray-900">
                        <p className="text-sm whitespace-pre-wrap">
                          {newContent.slice(0, 500)}...
                        </p>
                      </ScrollArea>
                      <div className="mt-4 flex gap-2">
                        <Button onClick={handleAddDocument}>
                          <Save className="h-4 w-4 mr-2" />
                          Doküman Olarak Kaydet
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNewTitle('');
                            setNewContent('');
                            setNewUrl('');
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          İptal
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {editingDocument && (
        <Dialog open={!!editingDocument} onOpenChange={() => setEditingDocument(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Dokümanı Düzenle</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={editingDocument.title}
                onChange={(e) => setEditingDocument({
                  ...editingDocument,
                  title: e.target.value
                })}
                placeholder="Başlık"
              />
              <Textarea
                value={editingDocument.content}
                onChange={(e) => setEditingDocument({
                  ...editingDocument,
                  content: e.target.value
                })}
                className="min-h-[300px]"
                placeholder="İçerik"
              />
              <div className="flex justify-end gap-2">
                <Button onClick={handleUpdateDocument}>
                  <Save className="h-4 w-4 mr-2" />
                  Kaydet
                </Button>
                <Button variant="outline" onClick={() => setEditingDocument(null)}>
                  İptal
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}