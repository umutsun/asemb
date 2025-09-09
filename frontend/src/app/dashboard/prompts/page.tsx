'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertCircle, Save, RotateCcw, Copy, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

interface SystemPrompt {
  id: string;
  name: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const defaultPrompt = `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.
    
GÖREV:
- Aşağıdaki bağlamda verilen bilgilere dayanarak cevap ver
- ÖNEMLİ: Bağlamın BAŞINDAKİ kaynaklara öncelik ver (çünkü en ilgili olanlar başta)
- İlk 3-5 kaynaktan gelen bilgileri kullanarak kapsamlı bir cevap oluştur
- Kaynak referanslarını mutlaka [Kaynak 1], [Kaynak 2] formatında belirt
- Eğer bağlam boşsa veya ilgili bilgi yoksa "Bu konuda veritabanımda bilgi bulunmuyor" de
- Tahmin yapma, sadece verilen bağlamdaki bilgileri kullan
- Cevabını Türkçe olarak ver ve profesyonel bir dil kullan
- Özellikle [Kaynak 1], [Kaynak 2] ve [Kaynak 3]'teki bilgilere odaklan`;

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.1);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const response = await fetch('http://localhost:3003/api/v2/config/prompts');
      if (response.ok) {
        const data = await response.json();
        setPrompts(data.prompts || []);
        const active = data.prompts?.find((p: SystemPrompt) => p.isActive);
        if (active) {
          setActivePrompt(active);
          setEditingPrompt(active.prompt);
          setTemperature(active.temperature);
          setMaxTokens(active.maxTokens);
        } else {
          setEditingPrompt(defaultPrompt);
        }
      }
    } catch (error) {
      console.error('Failed to fetch prompts:', error);
      setEditingPrompt(defaultPrompt);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:3003/api/v2/config/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editingPrompt,
          temperature,
          maxTokens,
          name: 'Custom System Prompt'
        })
      });

      if (response.ok) {
        setSuccess('Sistem prompt başarıyla güncellendi!');
        fetchPrompts();
      } else {
        setError('Güncelleme başarısız oldu');
      }
    } catch (error) {
      setError('Bağlantı hatası');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditingPrompt(defaultPrompt);
    setTemperature(0.1);
    setMaxTokens(2048);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editingPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const promptTemplates = [
    {
      name: 'Detaylı Açıklama',
      prompt: 'Detaylı ve açıklayıcı cevaplar ver. Her konuyu örneklerle açıkla.',
      temp: 0.3
    },
    {
      name: 'Kısa ve Öz',
      prompt: 'Kısa, net ve öz cevaplar ver. Sadece en önemli bilgileri paylaş.',
      temp: 0.1
    },
    {
      name: 'Yaratıcı',
      prompt: 'Yaratıcı ve farklı bakış açıları sun. Alternatif çözümler öner.',
      temp: 0.7
    }
  ];

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sistem Prompt Yönetimi</h1>
        <Button onClick={fetchPrompts} variant="outline" size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          Yenile
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-600">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sistem Prompt</CardTitle>
              <CardDescription>
                AI'nın nasıl cevap vereceğini belirleyen ana talimatlar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt Metni</Label>
                <Textarea
                  id="prompt"
                  value={editingPrompt}
                  onChange={(e) => setEditingPrompt(e.target.value)}
                  rows={15}
                  className="font-mono text-sm"
                  placeholder="Sistem prompt'unu buraya yazın..."
                />
                <p className="text-sm text-muted-foreground">
                  {editingPrompt.length} karakter
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">
                    Temperature: {temperature}
                  </Label>
                  <Slider
                    id="temperature"
                    min={0}
                    max={1}
                    step={0.1}
                    value={[temperature]}
                    onValueChange={(v) => setTemperature(v[0])}
                  />
                  <p className="text-xs text-muted-foreground">
                    Düşük: Tutarlı, Yüksek: Yaratıcı
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxTokens">
                    Max Tokens: {maxTokens}
                  </Label>
                  <Slider
                    id="maxTokens"
                    min={256}
                    max={4096}
                    step={256}
                    value={[maxTokens]}
                    onValueChange={(v) => setMaxTokens(v[0])}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maksimum cevap uzunluğu
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
                <Button onClick={handleReset} variant="outline">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Varsayılana Dön
                </Button>
                <Button onClick={handleCopy} variant="outline">
                  {copied ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hızlı Şablonlar</CardTitle>
              <CardDescription>
                Önceden tanımlı prompt şablonları
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {promptTemplates.map((template) => (
                <Button
                  key={template.name}
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    setEditingPrompt(defaultPrompt + '\n\n' + template.prompt);
                    setTemperature(template.temp);
                  }}
                >
                  {template.name}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt İpuçları</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">Kaynak Referansları</p>
                <p className="text-muted-foreground">
                  [Kaynak 1], [Kaynak 2] formatını kullanın
                </p>
              </div>
              <div>
                <p className="font-medium">Bağlam Kullanımı</p>
                <p className="text-muted-foreground">
                  En ilgili kaynaklar başta gelir
                </p>
              </div>
              <div>
                <p className="font-medium">Temperature</p>
                <p className="text-muted-foreground">
                  0.1: Tutarlı, 0.5: Dengeli, 0.9: Yaratıcı
                </p>
              </div>
            </CardContent>
          </Card>

          {activePrompt && (
            <Card>
              <CardHeader>
                <CardTitle>Aktif Prompt</CardTitle>
                <CardDescription>
                  Şu anda kullanımda olan prompt
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">İsim:</span> {activePrompt.name}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Temperature:</span> {activePrompt.temperature}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Max Tokens:</span> {activePrompt.maxTokens}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Güncelleme:</span>{' '}
                  {new Date(activePrompt.updatedAt).toLocaleString('tr-TR')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}