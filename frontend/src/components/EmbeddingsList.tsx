'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Loader2, 
  RefreshCw, 
  Search,
  FileText,
  Calendar,
  Hash,
  Eye,
  Trash2,
  Download
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Embedding {
  id: string;
  content: string;
  metadata: {
    source?: string;
    title?: string;
    url?: string;
    timestamp?: string;
    chunk_size?: number;
  };
  embedding?: number[];
  created_at: string;
  similarity?: number;
}

export default function EmbeddingsList() {
  const [embeddings, setEmbeddings] = useState<Embedding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmbedding, setSelectedEmbedding] = useState<Embedding | null>(null);

  const fetchEmbeddings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/embeddings/list');
      if (response.ok) {
        const data = await response.json();
        setEmbeddings(data);
      }
    } catch (error) {
      console.error('Failed to fetch embeddings:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchEmbeddings = async () => {
    if (!searchQuery.trim()) {
      fetchEmbeddings();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/embeddings/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      
      if (response.ok) {
        const data = await response.json();
        setEmbeddings(data);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteEmbedding = async (id: string) => {
    if (!confirm('Bu embedding\'i silmek istediğinizden emin misiniz?')) return;
    
    try {
      const response = await fetch(`/api/embeddings/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setEmbeddings(embeddings.filter(e => e.id !== id));
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  useEffect(() => {
    fetchEmbeddings();
  }, []);

  const filteredEmbeddings = embeddings.filter(embedding =>
    embedding.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    embedding.metadata?.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Embedding Geçmişi</CardTitle>
            <CardDescription>
              Sistemde kayıtlı {embeddings.length} embedding bulunuyor
            </CardDescription>
          </div>
          <Button onClick={fetchEmbeddings} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Embedding ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchEmbeddings()}
                className="pl-10"
              />
            </div>
            <Button onClick={searchEmbeddings} variant="outline">
              Ara
            </Button>
          </div>

          {/* Embeddings Table */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="h-[400px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>İçerik</TableHead>
                    <TableHead>Kaynak</TableHead>
                    <TableHead>Boyut</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmbeddings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Henüz embedding bulunmuyor
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmbeddings.map((embedding, index) => (
                      <TableRow key={embedding.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <div className="max-w-[300px]">
                            <p className="truncate font-medium">
                              {embedding.metadata?.title || 'İsimsiz'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {embedding.content.slice(0, 100)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {embedding.metadata?.source || 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            <span className="text-sm">
                              {embedding.embedding?.length || 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className="text-sm">
                              {new Date(embedding.created_at).toLocaleDateString('tr-TR')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedEmbedding(embedding)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteEmbedding(embedding.id)}
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

        {/* Detail Modal */}
        {selectedEmbedding && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-[600px] max-h-[80vh] overflow-auto">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Embedding Detayları</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEmbedding(null)}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Metadata</h4>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ID:</span>
                      <span className="font-mono">{selectedEmbedding.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kaynak:</span>
                      <span>{selectedEmbedding.metadata?.source || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tarih:</span>
                      <span>{new Date(selectedEmbedding.created_at).toLocaleString('tr-TR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Boyut:</span>
                      <span>{selectedEmbedding.embedding?.length || 0} dimension</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">İçerik</h4>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm max-h-[200px] overflow-auto">
                    <p className="whitespace-pre-wrap">{selectedEmbedding.content}</p>
                  </div>
                </div>

                {selectedEmbedding.embedding && (
                  <div>
                    <h4 className="font-medium mb-2">Embedding Vektörü (İlk 20)</h4>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <code className="text-xs">
                        [{selectedEmbedding.embedding.slice(0, 20).map(v => v.toFixed(4)).join(', ')}...]
                      </code>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}