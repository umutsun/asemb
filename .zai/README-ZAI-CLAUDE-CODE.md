# Z.AI GLM-4.5 Claude Code Entegrasyonu

Bu proje, Claude Code CLI arayüzünü kullanarak Z.AI'nin GLM-4.5 modeliyle kod oluşturmanızı sağlayan bir entegrasyondur.

## 📋 İçerik

- [Gereksinimler](#gereksinimler)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [Örnekler](#örnekler)
- [Awesome Claude Code Agents](#awesome-claude-code-agents)
- [Sorun Giderme](#sorun-giderme)

## 🚀 Gereksinimler

- Node.js (v16 veya üzeri)
- Z.AI API anahtarı
- npm veya yarn

## 📦 Kurulum

1. Depoyu klonlayın:
```bash
git clone <repository-url>
cd <repository-directory>
```

2. Gerekli paketleri yükleyin:
```bash
npm install dotenv node-fetch
```

3. `.env` dosyasını oluşturun:
```bash
cp .env.example .env
```

4. `.env` dosyasını düzenleyin ve Z.AI API anahtarınızı ekleyin:
```env
ZAI_API_KEY=your_zai_api_key_here
ZAI_BASE_URL=https://zai.ai/api/v1
ZAI_DEFAULT_MODEL=glm-4.5
```

## 🎯 Kullanım

### 1. Temel Z.AI Kullanımı

```bash
npx tsx zai-example.ts
```

### 2. Claude Code Benzeri Arayüz

```bash
npx tsx claude-code-example.ts
```

### 3. Z.AI Agent Kullanımı

```bash
npx tsx zai-agent-example.ts
```

### 4. Interactive Demo

```bash
npx tsx zai-claude-code-demo.ts
```

### 5. Interactive CLI Modu

```bash
npx tsx zai-claude-code-demo.ts --interactive
```

## 💡 Örnekler

### React Component Oluşturma

```typescript
import { ZAIClaudeCodeDemo } from './zai-claude-code-demo';

const demo = new ZAIClaudeCodeDemo();

const reactCode = await demo.generateReactComponent(
  'UserProfile', 
  ['name: string', 'email: string', 'age: number']
);

console.log(reactCode);
```

### Express API Oluşturma

```typescript
import { ZAIClaudeCodeDemo } from './zai-claude-code-demo';

const demo = new ZAIClaudeCodeDemo();

const apiCode = await demo.generateExpressAPI('/api/users', 'GET');

console.log(apiCode);
```

### Python Fonksiyonu Oluşturma

```typescript
import { ZAIClaudeCodeDemo } from './zai-claude-code-demo';

const demo = new ZAIClaudeCodeDemo();

const pythonCode = await demo.generatePythonFunction(
  'calculate_factorial',
  'Bir sayının faktöriyelini hesaplayan bir fonksiyon.'
);

console.log(pythonCode);
```

## 🤖 Awesome Claude Code Agents

Bu entegrasyon, [awesome-claude-code-agents](./awesome-claude-code-agents/) deposuna dahil edilen `zai-glm45-coder` ajanını kullanır. Bu ajan, Claude Code'un Sub-Agent özelliği ile Z.AI'nin GLM-4.5 modelini kullanmanızı sağlar.

### Z.AI GLM-4.5 Agent Özellikleri

- **Model**: Z.AI GLM-4.5
- **Uzmanlık Alanları**: Kod oluşturma, refactoring, hata ayıklama
- **Desteklenen Diller**: TypeScript, JavaScript, Python, Java, C#, vb.
- **Desteklenen Framework'ler**: React, Express, Django, Flask, vb.

### Agent Kullanımı

```typescript
import { ZAIGLM45Agent } from './zai-agent-example';

const agent = new ZAIGLM45Agent();

// React component oluştur
const response = await agent.generateReactComponent(
  'UserProfile', 
  ['name: string', 'email: string', 'age: number']
);

// Kodu dosyaya kaydet ve göster
await agent.saveAndDisplayCode(response, 'UserProfile.tsx');
```

## 🔧 Sorun Giderme

### "socket hang up" Hatası

Bu hata, Z.AI API sunucusuna bağlanırken ortaya çıkabilir. Çözüm için:

1. API anahtarınızın doğru olduğundan emin olun
2. İnternet bağlantınızı kontrol edin
3. Z.AI API servisinin çalışır durumda olup olmadığını kontrol edin

### "getaddrinfo ENOTFOUND api.zai.chat" Hatası

Bu hata, Z.AI API adresine erişilemediğini gösterir. Çözüm için:

1. `.env` dosyasındaki `ZAI_BASE_URL` değerini kontrol edin
2. Doğru URL: `https://zai.ai/api/v1`

### API Anahtarı Sorunları

1. API anahtarınızın geçerli olduğundan emin olun
2. API anahtarınızın doğru formatta olduğundan emin olun
3. API anahtarınızın kullanım hakkının olduğundan emin olun

## 📚 Dokümantasyon

- [Claude Code ZAI Entegrasyonu](./claude-code-zai.ts)
- [Z.AI Temel Kullanım](./zai-integration.ts)
- [Z.AI Agent Örnekleri](./zai-agent-example.ts)
- [Claude Code Benzeri Demo](./zai-claude-code-demo.ts)

## 🤝 Katkıda Bulunma

Katkıda bulunmak isterseniz:

1. Depoyu fork edin
2. Yeni bir branch oluşturun (`git checkout -b feature/AmazingFeature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add some AmazingFeature'`)
4. Branch'i push edin (`git push origin feature/AmazingFeature`)
5. Bir Pull Request açın

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.

## 🙏 Teşekkürler

- [Z.AI](https://zai.ai/) - GLM-4.5 modeli için
- [Claude Code](https://claude.ai/code) - CLI arayüzü için
- [awesome-claude-code-agents](https://github.com/paul-gauthier/awesome-claude-code-agents) - Agent deposu için