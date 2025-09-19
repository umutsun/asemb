# Claude Code CLI için Z.AI API Entegrasyonu

Bu proje, Claude Code CLI aracılığıyla Z.AI API'sini kullanmanızı sağlayan bir TypeScript entegrasyonudur.

## Kurulum

### 1. Gerekli Paketleri Yükleyin

```bash
npm install
```

veya

```bash
npm install dotenv node-fetch tsx typescript @types/node
```

### 2. Ortam Değişkenlerini Ayarlayın

`.env` dosyası oluşturun ve Z.AI API anahtarınızı ekleyin:

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:

```env
ZAI_API_KEY=your_zai_api_key_here
ZAI_BASE_URL=https://api.zai.chat/v1
ZAI_DEFAULT_MODEL=gpt-4-turbo
ZAI_MAX_TOKENS=500
ZAI_TEMPERATURE=0.7
```

## Kullanım

### 1. Interactive CLI Modu

```bash
npm start
```

veya

```bash
tsx zai-integration.ts
```

Bu modda doğrudan Z.AI ile sohbet edebilirsiniz. Çıkmak için "exit" yazın.

### 2. Örnekleri Çalıştırma

```bash
tsx zai-example.ts
```

### 3. Programatik Kullanım

```typescript
import { ZAIClient } from './zai-integration';

// Client oluştur
const client = new ZAIClient();

// Basit metin oluşturma
const response = await client.generateText({
  prompt: 'Merhaba! TypeScript hakkında bilgi verir misin?',
  maxTokens: 200,
  temperature: 0.7
});

console.log(response.choices[0]?.message?.content);

// Daha basit kullanım
const text = await client.generateTextSimple(
  'JavaScript ve TypeScript arasındaki farklar nelerdir?',
  150
);

console.log(text);

// Stream olarak metin oluşturma
for await (const chunk of client.generateTextStream({
  prompt: 'Yapay zeka geleceği nasıl şekillendirecek?',
  maxTokens: 300,
  temperature: 0.8
})) {
  process.stdout.write(chunk);
}
```

## API Referansı

### ZAIClient Sınıfı

#### Constructor

```typescript
new ZAIClient(apiKey?: string, baseUrl?: string, defaultModel?: string)
```

- `apiKey`: Z.AI API anahtarı (isteğe bağlı, varsayılan: `process.env.ZAI_API_KEY`)
- `baseUrl`: API base URL (isteğe bağlı, varsayılan: `'https://api.zai.chat/v1'`)
- `defaultModel`: Varsayılan model (isteğe bağlı, varsayılan: `'gpt-4-turbo'`)

#### Metotlar

##### `generateText(options: ZAIRequestOptions): Promise<ZAIResponse>`

Metin oluşturur.

```typescript
const response = await client.generateText({
  prompt: 'Soru',
  maxTokens: 200,
  temperature: 0.7,
  model: 'gpt-4-turbo'
});
```

##### `generateTextSimple(prompt: string, maxTokens?: number): Promise<string>`

Basit metin oluşturma.

```typescript
const text = await client.generateTextSimple('Soru', 150);
```

##### `generateTextStream(options: ZAIRequestOptions): AsyncGenerator<string>`

Stream olarak metin oluşturma.

```typescript
for await (const chunk of client.generateTextStream({
  prompt: 'Soru',
  maxTokens: 300
})) {
  process.stdout.write(chunk);
}
```

### Türler

#### ZAIRequestOptions

```typescript
interface ZAIRequestOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  stream?: boolean;
}
```

#### ZAIResponse

```typescript
interface ZAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

## Geliştirme

### Development Modu

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Önemli Notlar

1. **API Anahtarı**: Z.AI'den aldığınız API anahtarını `.env` dosyasına eklemeyi unutmayın.
2. **Model Seçimi**: `model` parametresini Z.AI tarafından desteklenen modellerden seçebilirsiniz.
3. **Hata Yönetimi**: Tüm API çağrıları try-catch blokları ile sarılmıştır.
4. **Rate Limiting**: Z.AI API'nin rate limitlerini göz önünde bulundurun.
5. **Güvenlik**: API anahtarınızı asla kod içine gömmeyin, her zaman ortam değişkenleri kullanın.

## Desteklenen Modeller

- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- Diğer Z.AI destekli modeller

## Hata Çözümleme

### Yaygın Hatalar

1. **Z.AI API anahtarı gereklidir**
   - Çözüm: `.env` dosyasına `ZAI_API_KEY` ekleyin

2. **401 Unauthorized**
   - Çözüm: API anahtarınızın geçerli olduğundan emin olun

3. **429 Too Many Requests**
   - Çözüm: İsteklerinizi yavaşlatın veya rate limit bekleyin

4. **Stream okunamadı**
   - Çözüm: İnternet bağlantınızı kontrol edin

## Lisans

MIT