'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  GitBranch, 
  Play, 
  Pause,
  Plus,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Download,
  Upload,
  Eye,
  Trash2,
  Edit,
  Copy,
  ExternalLink,
  Zap,
  Bot,
  Database,
  Globe,
  FileJson
} from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  nodes: number;
  executions: number;
  lastRun?: Date;
  createdAt: Date;
  tags: string[];
  type: 'rag' | 'scraper' | 'embedding' | 'automation' | 'custom';
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: any[];
  icon: React.ReactNode;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    type: 'custom',
  });

  const templates: WorkflowTemplate[] = [
    {
      id: '1',
      name: 'RAG Pipeline',
      description: 'Web scraping → Chunking → Embedding → pgvector storage',
      category: 'rag',
      nodes: [],
      icon: <Bot className="h-5 w-5" />,
    },
    {
      id: '2',
      name: 'Document Processor',
      description: 'PDF/TXT upload → Text extraction → Embedding generation',
      category: 'embedding',
      nodes: [],
      icon: <FileJson className="h-5 w-5" />,
    },
    {
      id: '3',
      name: 'Web Monitor',
      description: 'Schedule web scraping → Change detection → Notification',
      category: 'scraper',
      nodes: [],
      icon: <Globe className="h-5 w-5" />,
    },
    {
      id: '4',
      name: 'Semantic Search API',
      description: 'HTTP webhook → Query embedding → Vector search → Response',
      category: 'automation',
      nodes: [],
      icon: <Database className="h-5 w-5" />,
    },
  ];

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/workflows`);
      const data = await response.json();
      setWorkflows(data.workflows || [
        // Demo data
        {
          id: '1',
          name: 'ASB RAG Pipeline',
          description: 'Main RAG workflow for document processing',
          status: 'active',
          nodes: 8,
          executions: 156,
          lastRun: new Date(),
          createdAt: new Date(),
          tags: ['rag', 'production'],
          type: 'rag',
        },
        {
          id: '2',
          name: 'Daily Web Scraper',
          description: 'Scheduled scraping of news sites',
          status: 'active',
          nodes: 5,
          executions: 42,
          lastRun: new Date(),
          createdAt: new Date(),
          tags: ['scraper', 'scheduled'],
          type: 'scraper',
        },
      ]);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!newWorkflow.name) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkflow),
      });

      if (response.ok) {
        await fetchWorkflows();
        setIsCreateDialogOpen(false);
        setNewWorkflow({ name: '', description: '', type: 'custom' });
      }
    } catch (error) {
      console.error('Failed to create workflow:', error);
    }
  };

  const handleDeployTemplate = async (template: WorkflowTemplate) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083'}/api/v2/workflows/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      });

      if (response.ok) {
        await fetchWorkflows();
      }
    } catch (error) {
      console.error('Failed to deploy template:', error);
    }
  };

  const handleToggleWorkflow = async (workflow: Workflow) => {
    try {
      const newStatus = workflow.status === 'active' ? 'inactive' : 'active';
      const response = await fetch('http://localhost:3003/api/v2/workflows/' + workflow.id + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setWorkflows(workflows.map(w => 
          w.id === workflow.id ? { ...w, status: newStatus } : w
        ));
      }
    } catch (error) {
      console.error('Failed to toggle workflow:', error);
    }
  };

  const getStatusIcon = (status: Workflow['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getTypeIcon = (type: Workflow['type']) => {
    switch (type) {
      case 'rag':
        return <Bot className="h-4 w-4" />;
      case 'scraper':
        return <Globe className="h-4 w-4" />;
      case 'embedding':
        return <Database className="h-4 w-4" />;
      case 'automation':
        return <Zap className="h-4 w-4" />;
      default:
        return <GitBranch className="h-4 w-4" />;
    }
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">n8n Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Otomasyon workflow'larını yönetin ve izleyin
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="http://localhost:5678" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              n8n Panel
            </a>
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Yeni Workflow
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni Workflow Oluştur</DialogTitle>
                <DialogDescription>
                  n8n'de yeni bir workflow başlatın
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">İsim</label>
                  <Input
                    value={newWorkflow.name}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                    placeholder="Workflow ismi"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Açıklama</label>
                  <Textarea
                    value={newWorkflow.description}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                    placeholder="Workflow açıklaması"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Tip</label>
                  <select
                    value={newWorkflow.type}
                    onChange={(e) => setNewWorkflow({ ...newWorkflow, type: e.target.value as any })}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="custom">Custom</option>
                    <option value="rag">RAG Pipeline</option>
                    <option value="scraper">Web Scraper</option>
                    <option value="embedding">Embedding</option>
                    <option value="automation">Automation</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  İptal
                </Button>
                <Button onClick={handleCreateWorkflow}>Oluştur</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Workflow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workflows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {workflows.filter(w => w.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Toplam Çalıştırma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {workflows.reduce((sum, w) => sum + w.executions, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Node Sayısı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {workflows.reduce((sum, w) => sum + w.nodes, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Hazır Şablonlar</CardTitle>
          <CardDescription>
            ASB için özel olarak hazırlanmış workflow şablonları
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {template.icon}
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                    <Badge variant="outline">{template.category}</Badge>
                  </div>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => handleDeployTemplate(template)}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Deploy Et
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Workflows */}
      <Card>
        <CardHeader>
          <CardTitle>Mevcut Workflow'lar</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-12">
              <GitBranch className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Henüz workflow yok</p>
            </div>
          ) : (
            <div className="space-y-4">
              {workflows.map((workflow) => (
                <Card key={workflow.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(workflow.type)}
                          <h3 className="font-semibold">{workflow.name}</h3>
                          {getStatusIcon(workflow.status)}
                          <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
                            {workflow.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {workflow.description}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{workflow.nodes} nodes</span>
                          <span>•</span>
                          <span>{workflow.executions} çalıştırma</span>
                          {workflow.lastRun && (
                            <>
                              <span>•</span>
                              <span>Son: {new Date(workflow.lastRun).toLocaleString('tr-TR')}</span>
                            </>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {workflow.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleWorkflow(workflow)}
                        >
                          {workflow.status === 'active' ? 
                            <Pause className="h-4 w-4" /> : 
                            <Play className="h-4 w-4" />
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a href={'http://localhost:5678/workflow/' + workflow.id} target="_blank" rel="noopener noreferrer">
                            <Edit className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}