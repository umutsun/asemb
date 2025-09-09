'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConfig } from '@/contexts/ConfigContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Brain, 
  ChevronDown, 
  Home,
  Activity,
  Database,
  LogOut,
  User,
  Server,
  Cpu,
  Settings2
} from 'lucide-react';

interface HeaderProps {
  user?: {
    name: string;
    email: string;
  };
  onLogout?: () => void;
}

interface SystemStatus {
  database: {
    connected: boolean;
    size: string;
    documents: number;
  };
  redis: {
    connected: boolean;
    used_memory: string;
  };
  lightrag: {
    initialized: boolean;
    documentCount: number;
  };
  embedder: {
    active: boolean;
    model: string;
  };
}

export default function Header({ user, onLogout }: HeaderProps) {
  const pathname = usePathname();
  const { config } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionProgress, setConnectionProgress] = useState(0);

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSystemStatus = async () => {
    // İlk yüklemede progress animasyonu başlat
    if (isConnecting) {
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 20;
        setConnectionProgress(Math.min(progress, 90)); // Max 90'da beklet
        if (progress >= 90) {
          clearInterval(progressInterval);
        }
      }, 200);
    }

    try {
      const response = await fetch('/api/dashboard');
      if (response.ok) {
        const data = await response.json();
        
        // Bağlantı başarılı, progress'i tamamla
        setConnectionProgress(100);
        
        setTimeout(() => {
          setSystemStatus({
            database: {
              connected: true,
              size: data.database.size,
              documents: data.database.documents
            },
            redis: {
              connected: data.redis.connected,
              used_memory: data.redis.used_memory
            },
            lightrag: {
              initialized: data.lightrag.initialized,
              documentCount: data.lightrag.documentCount
            },
            embedder: {
              active: true,
              model: 'text-embedding-ada-002'
            }
          });
          setIsConnecting(false);
        }, 300); // Progress bar tamamlandıktan sonra göster
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      setIsConnecting(false);
      setConnectionProgress(0);
    }
  };

  const getStatusColor = (status: boolean) => {
    return status ? 'bg-green-500' : 'bg-red-500';
  };

  const getStatusVariant = (status: boolean): "default" | "destructive" | "outline" | "secondary" | "success" => {
    return status ? "success" : "destructive";
  };

  const menuItems = [
    { href: '/dashboard', label: 'Genel Bakış' },
    { href: '/dashboard/query', label: 'LightRAG Sorgu' },
    { href: '/dashboard/documents', label: 'Dokümanlar' },
    { href: '/dashboard/embedder', label: 'Embedder' },
    { href: '/dashboard/scraper', label: 'Web Scraper' },
    { href: '/dashboard/migration-tools', label: 'Migration & Embedding' },
    { href: '/dashboard/database-config', label: 'Veritabanı Ayarları' },
    { href: '/dashboard/rag', label: 'RAG Status' },
    { href: '/dashboard/activity', label: 'Aktiviteler' },
    { href: '/dashboard/analytics', label: 'Analitik' },
    { href: '/dashboard/settings', label: 'Sistem Ayarları' },
  ];

  const allServicesActive = systemStatus?.database.connected && 
                           systemStatus?.redis.connected && 
                           systemStatus?.lightrag.initialized && 
                           systemStatus?.embedder.active;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white dark:bg-gray-900 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo - Left aligned */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="relative">
                <Brain className="h-8 w-8 text-primary" />
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                  {config?.app?.name || 'Alice Semantic Bridge'}
                </h1>
                <p className="text-xs text-muted-foreground">{config?.app?.description || 'Intelligent RAG System'}</p>
              </div>
            </Link>

            {/* Navigation Dropdown with Dashboard Icon */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Home className="h-4 w-4" />
                  Dashboard
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {menuItems.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link 
                      href={item.href} 
                      className={`cursor-pointer ${pathname === item.href ? 'bg-accent' : ''}`}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right side elements */}
          <div className="flex items-center gap-4">
            {/* System Status Indicator with Enhanced Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 relative px-3">
                  <div className={`h-2 w-2 rounded-full ${
                    isConnecting ? 'bg-gray-400' : 
                    allServicesActive ? 'bg-green-500' : 'bg-yellow-500'
                  } ${!isConnecting && 'animate-pulse'}`} />
                  <span className="text-sm">System Status</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 p-4">
                  <div className="space-y-4">
                    {/* Overall Status */}
                    <div className="flex items-center justify-between pb-3 border-b">
                      <h3 className="font-semibold text-sm">Genel Sistem Durumu</h3>
                      {isConnecting ? (
                        <Badge variant="secondary" className="gap-1">
                          <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                          Bağlanıyor...
                        </Badge>
                      ) : (
                        <Badge variant={allServicesActive ? "success" : "warning"}>
                          {allServicesActive ? "Tüm Servisler Aktif" : "Bazı Sorunlar Var"}
                        </Badge>
                      )}
                    </div>

                    {/* Loading Progress Bar */}
                    {isConnecting && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Servisler kontrol ediliyor...</span>
                          <span>{connectionProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-gray-300 to-gray-400 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${connectionProgress}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-2 mt-3">
                          <div className="text-center">
                            <div className={`h-1 w-full rounded ${connectionProgress >= 25 ? 'bg-gray-400' : 'bg-gray-200'}`} />
                            <p className="text-xs text-muted-foreground mt-1">Database</p>
                          </div>
                          <div className="text-center">
                            <div className={`h-1 w-full rounded ${connectionProgress >= 50 ? 'bg-gray-400' : 'bg-gray-200'}`} />
                            <p className="text-xs text-muted-foreground mt-1">Redis</p>
                          </div>
                          <div className="text-center">
                            <div className={`h-1 w-full rounded ${connectionProgress >= 75 ? 'bg-gray-400' : 'bg-gray-200'}`} />
                            <p className="text-xs text-muted-foreground mt-1">LightRAG</p>
                          </div>
                          <div className="text-center">
                            <div className={`h-1 w-full rounded ${connectionProgress >= 100 ? 'bg-gray-400' : 'bg-gray-200'}`} />
                            <p className="text-xs text-muted-foreground mt-1">Embedder</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Service Details */}
                    <div className={`space-y-3 ${isConnecting ? 'opacity-30 pointer-events-none' : 'opacity-100'} transition-opacity duration-500`}>
                      {/* LightRAG Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-background">
                            <Brain className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">LightRAG System</p>
                            <p className="text-xs text-muted-foreground">
                              {systemStatus?.lightrag.documentCount || 0} doküman
                            </p>
                          </div>
                        </div>
                        <Badge variant={systemStatus?.lightrag.initialized ? "success" : "destructive"} className="text-xs">
                          {systemStatus?.lightrag.initialized ? "Aktif" : "İnaktif"}
                        </Badge>
                      </div>

                      {/* PostgreSQL Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-background">
                            <Database className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">PostgreSQL</p>
                            <p className="text-xs text-muted-foreground">
                              {systemStatus?.database.size || 'N/A'} • {systemStatus?.database.documents || 0} kayıt
                            </p>
                          </div>
                        </div>
                        <Badge variant={systemStatus?.database.connected ? "success" : "destructive"} className="text-xs">
                          {systemStatus?.database.connected ? "Bağlı" : "Bağlı Değil"}
                        </Badge>
                      </div>

                      {/* Redis Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-background">
                            <Server className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Redis Cache</p>
                            <p className="text-xs text-muted-foreground">
                              Bellek: {systemStatus?.redis.used_memory || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <Badge variant={systemStatus?.redis.connected ? "success" : "destructive"} className="text-xs">
                          {systemStatus?.redis.connected ? "Bağlı" : "Bağlı Değil"}
                        </Badge>
                      </div>

                      {/* Embedder Status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-background">
                            <Cpu className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Embedder Service</p>
                            <p className="text-xs text-muted-foreground">
                              Model: {systemStatus?.embedder.model || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <Badge variant={systemStatus?.embedder.active ? "success" : "destructive"} className="text-xs">
                          {systemStatus?.embedder.active ? "Aktif" : "İnaktif"}
                        </Badge>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Son güncelleme: {new Date().toLocaleTimeString('tr-TR')}</span>
                        <Link href="/dashboard/rag" className="text-primary hover:underline">
                          Detaylı Görüntüle →
                        </Link>
                      </div>
                    </div>
                    
                    {/* Settings Link */}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/settings" className="cursor-pointer">
                        <Settings2 className="h-4 w-4 mr-2" />
                        Sistem Ayarları
                      </Link>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>


            {/* User Menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 px-3">
                    <User className="h-4 w-4" />
                    <span className="text-sm">{user.name}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" />
                    Çıkış Yap
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/login">
                <Button size="sm" variant="outline">
                  <User className="h-4 w-4 mr-2" />
                  Giriş Yap
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}