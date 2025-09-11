'use client';

import { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Database, Save, TestTube, RefreshCw, Shield, Server } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema: string;
  sslMode: 'disable' | 'require' | 'verify-ca' | 'verify-full';
  poolSize: number;
  connectionString?: string;
}

export default function DatabaseConfigPage() {
  const [config, setConfig] = useState<DatabaseConfig>({
    host: 'localhost',
    port: 5432,
    database: 'asemb',
    username: 'postgres',
    password: '',
    schema: 'rag_data',
    sslMode: 'disable',
    poolSize: 20
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing'>('disconnected');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/config/database');
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig(data.config);
          setConnectionStatus(data.status || 'disconnected');
        }
      }
    } catch (error) {
      console.error('Failed to load database config:', error);
    }
  };

  const handleInputChange = (field: keyof DatabaseConfig, value: string | number) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Auto-generate connection string
    if (field !== 'connectionString') {
      const newConfig = { ...config, [field]: value };
      const connStr = `postgresql://${newConfig.username}:${newConfig.password}@${newConfig.host}:${newConfig.port}/${newConfig.database}`;
      setConfig(prev => ({
        ...prev,
        [field]: value,
        connectionString: connStr
      }));
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    setMessage(null);
    setConnectionStatus('testing');

    try {
      const response = await fetch('http://localhost:3001/api/v2/config/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: `Bağlantı başarılı! Veritabanı: ${result.database}, Versiyon: ${result.version}` });
        setConnectionStatus('connected');
      } else {
        setMessage({ type: 'error', text: result.error || 'Bağlantı başarısız' });
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bağlantı testi başarısız' });
      setConnectionStatus('disconnected');
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfig = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:3001/api/v2/config/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Veritabanı ayarları kaydedildi' });
        
        // Restart backend connection
        await fetch('http://localhost:3001/api/v2/config/database/restart', { method: 'POST' });
        
        setTimeout(() => {
          loadConfig();
        }, 2000);
      } else {
        setMessage({ type: 'error', text: result.error || 'Kaydetme başarısız' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ayarlar kaydedilemedi' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Database className="h-8 w-8" />
          Veritabanı Yapılandırması
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Her müşteri için farklı veritabanı bağlantısı yapılandırabilirsiniz
        </p>
      </div>

      {message && (
        <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-500' : message.type === 'success' ? 'border-green-500' : 'border-blue-500'}`}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Bağlantı Durumu</span>
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' : 
                  connectionStatus === 'testing' ? 'bg-yellow-500 animate-pulse' : 
                  'bg-red-500'
                }`} />
                <span className="text-sm text-muted-foreground">
                  {connectionStatus === 'connected' ? 'Bağlı' : 
                   connectionStatus === 'testing' ? 'Test ediliyor...' : 
                   'Bağlı değil'}
                </span>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>

        {/* PostgreSQL Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              PostgreSQL Ayarları
            </CardTitle>
            <CardDescription>
              Veritabanı sunucu bağlantı bilgileri
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="host">Host / IP Adresi</Label>
                <Input
                  id="host"
                  value={config.host}
                  onChange={(e) => handleInputChange('host', e.target.value)}
                  placeholder="localhost veya IP adresi"
                />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={config.port}
                  onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                  placeholder="5432"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="database">Veritabanı Adı</Label>
              <Input
                id="database"
                value={config.database}
                onChange={(e) => handleInputChange('database', e.target.value)}
                placeholder="asemb veya müşteri veritabanı adı"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="username">Kullanıcı Adı</Label>
                <Input
                  id="username"
                  value={config.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="postgres"
                />
              </div>
              <div>
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  value={config.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="schema">Schema (RAG Data)</Label>
              <Input
                id="schema"
                value={config.schema}
                onChange={(e) => handleInputChange('schema', e.target.value)}
                placeholder="rag_data"
              />
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Gelişmiş Ayarlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sslMode">SSL Modu</Label>
                <Select value={config.sslMode} onValueChange={(value) => handleInputChange('sslMode', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disable">Devre Dışı</SelectItem>
                    <SelectItem value="require">Zorunlu</SelectItem>
                    <SelectItem value="verify-ca">CA Doğrula</SelectItem>
                    <SelectItem value="verify-full">Tam Doğrula</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="poolSize">Bağlantı Havuzu Boyutu</Label>
                <Input
                  id="poolSize"
                  type="number"
                  value={config.poolSize}
                  onChange={(e) => handleInputChange('poolSize', parseInt(e.target.value))}
                  placeholder="20"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="connectionString">Bağlantı Dizesi (Otomatik)</Label>
              <Input
                id="connectionString"
                value={config.connectionString || ''}
                readOnly
                className="bg-muted font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={isTesting}
          >
            {isTesting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Test Ediliyor...
              </>
            ) : (
              <>
                <TestTube className="h-4 w-4 mr-2" />
                Bağlantıyı Test Et
              </>
            )}
          </Button>
          <Button
            onClick={saveConfig}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Ayarları Kaydet
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}