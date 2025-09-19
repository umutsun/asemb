# Awesome Claude Code Multi-Agent Orkestrasyon Sistemi

Bu proje, Claude Code CLI ile tam entegre çalışan bir multi-agent orkestrasyon sistemidir. Z.AI GLM-4.5 ve Kilo modellerini kullanarak birden fazla uzman agent'ı koordine eder ve karmaşık görevleri otomatik olarak dağıtır. Redis üzerinden asb-cli MCP sunucusu ile iletişim kurar.

## Özellikler

- 🤖 **Multi-Agent Orkestrasyon**: Birden fazla uzman agent'ı koordine etme
- 🔄 **İş Akışı Yönetimi**: Karmaşık görevleri otomatik olarak daha küçük task'lara bölme
- ⚡ **Paralel Çalışma**: Birden fazla task'ı aynı anda çalıştırabilme
- 🌐 **MCP Entegrasyonu**: Model Context Protocol (MCP) sunucusu ile Redis üzerinden iletişim
- 🛠️ **Özelleştirilebilir Agent'lar**: Kendi agent'larınızı oluşturma ve ekleme imkanı
- 📊 **Durum Takibi**: Task ve workflow durumlarını gerçek zamanlı takip etme
- 🔄 **Çoklu Model Desteği**: Z.AI GLM-4.5 ve Kilo modellerini kullanabilme
- 💾 **Redis Entegrasyonu**: asb-cli MCP sunucusu üzerinden Redis ile veri yönetimi

## Sistem Mimarisi

Sistem aşağıdaki bileşenlerden oluşur:

1. **Multi-Agent Orchestrator**: Agent'ları koordine eden ve iş akışlarını yöneten ana bileşen
2. **MCP Sunucusu (asb-cli)**: Claude Code CLI ile entegre çalışan Redis tabanlı MCP sunucusu
3. **Uzman Agent'lar**: Farklı uzmanlık alanlarına sahip özel agent'lar
4. **Model Entegrasyonları**: Z.AI GLM-4.5 ve Kilo API entegrasyonları
5. **Demo Uygulaması**: Sistemin nasıl kullanılacağını gösteren örnek uygulama

## asb-cli MCP Sunucusu

Sistem, `asb-cli` adlı gelişmiş MCP sunucusunu kullanır. Bu sunucu, 22 farklı araç ile sağlam bir altyapı sunar:

### Özellikler
- **Version**: 1.2.0
- **Transport**: Stdio
- **Tools**: 22 farklı araç
- **Redis Entegrasyonu**: Tam Redis desteği
- **Agent İletişimi**: Agent'lar arası iletişim protokolü
- **Session Yönetimi**: Oturum oluşturma ve yönetme
- **Buffer Yönetimi**: Büyük veriler için buffer yönetimi
- **Monitoring**: Agent ve sistem izleme

### Araçlar
1. **Shell Execution**:
   - `exec`: Shell komutu çalıştırma (buffered)
   - `spawn`: Shell komutu çalıştırma (streaming)

2. **Session Management**:
   - `session_create`: Yeni oturum oluşturma
   - `session_get`: Oturum bilgilerini getirme
   - `session_update`: Oturum verilerini güncelleme

3. **Context Management**:
   - `context_push`: Paylaşılan belleğe bağlam ekleme
   - `context_get`: Paylaşılan bellekten bağlam getirme

4. **Buffer Management**:
   - `buffer_allocate`: Büyük veriler için buffer ayırma
   - `buffer_write`: Buffer'a veri yazma
   - `buffer_read`: Buffer'dan veri okuma
   - `buffer_flush`: Buffer'ı diske yazma veya temizleme

5. **Agent Communication**:
   - `agent_register`: Agent kaydetme
   - `agent_communicate`: Belirli bir agent'a mesaj gönderme
   - `agent_broadcast`: Tüm agent'lara mesaj yayma

6. **Task Orchestration**:
   - `orchestrate_task`: Karmaşık multi-agent görev düzenleme

7. **System Operations**:
   - `execute_command`: Sistem komutu çalıştırma
   - `read_file`: Dosya okuma
   - `write_file`: Dosya yazma

8. **Redis Operations**:
   - `redis_get`: Redis'ten değer getirme
   - `redis_set`: Redis'e değer ayarlama

9. **Monitoring**:
   - `dashboard_status`: Dashboard durumu
   - `monitor_agents`: Aktif agent'ları izleme
   - `sacred_status`: Sacred sistem durumu

## Mevcut Agent'lar

### 1. Z.AI GLM-4.5 Coder
- **ID**: `zai-glm45-coder`
- **Model**: Z.AI GLM-4.5
- **Açıklama**: Z.AI GLM-4.5 modelini kullanarak kod oluşturan, düzenleyen ve analiz eden bir agent
- **Yetenekler**: Kod oluşturma, kod refactoring, hata ayıklama
- **Diller**: TypeScript, JavaScript, Python, Java, C#, Go, Rust
- **Framework'ler**: React, Express, NextJS, Django, Flask, Spring

### 2. Kilo Coder
- **ID**: `kilo-coder`
- **Model**: Kilo Latest
- **Açıklama**: Kilo modelini kullanarak kod oluşturan ve analiz eden bir agent
- **Yetenekler**: Kod oluşturma, optimizasyon, çoklu dil desteği
- **Diller**: TypeScript, JavaScript, Python, Java, C#, Go, Rust, Ruby, PHP
- **Framework'ler**: React, Express, NextJS, Django, Flask, Spring, Rails, Laravel

### 3. Code Reviewer
- **ID**: `code-reviewer`
- **Açıklama**: Kod incelemesi yapan ve iyileştirme önerileri sunan bir agent
- **Yetenekler**: Kod incelemesi, güvenlik analizi
- **Diller**: TypeScript, JavaScript, Python, Java, C#
- **Framework'ler**: React, Express, NextJS, Django, Flask

### 4. Test Generator
- **ID**: `test-generator`
- **Açıklama**: Kod için test senaryoları oluşturan bir agent
- **Yetenekler**: Birim testleri, entegrasyon testleri
- **Diller**: TypeScript, JavaScript, Python, Java
- **Framework'ler**: Jest, Mocha, Pytest, JUnit

### 5. Documentation Generator
- **ID**: `doc-generator`
- **Açıklama**: Kod için dokümantasyon oluşturan bir agent
- **Yetenekler**: API dokümantasyonu, kod dokümantasyonu
- **Diller**: TypeScript, JavaScript, Python, Java, C#
- **Framework'ler**: Express, NextJS, Django, Flask

## Kurulum

### Gereksinimler

- Node.js 18+
- TypeScript
- Z.AI API anahtarı
- Kilo API anahtarı
- Redis sunucusu
- asb-cli MCP sunucusu

### Adımlar

1. Depoyu klonlayın:
```bash
git clone https://github.com/yourusername/yourrepo.git
cd yourrepo
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. Ortam değişkenlerini ayarlayın:
```bash
cp .env.example .env
```

`.env` dosyasını düzenleyerek API anahtarlarınızı ekleyin:
```env
ZAI_API_KEY=your_zai_api_key_here
KILO_API_KEY=your_kilo_api_key_here
REDIS_URL=redis://localhost:6379
```

4. asb-cli MCP sunucusunu kurun:
```bash
# MCP sunucusunu kurun
git clone https://github.com/yourusername/asb-cli.git c:\mcp-servers\asb-cli
cd c:\mcp-servers\asb-cli
npm install
```

## Kullanım

### 1. MCP Sunucusunu Başlatma

```bash
# asb-cli MCP sunucusunu başlatın
node c:\\mcp-servers\\asb-cli\\index.js
```

### 2. Multi-Agent Sistemini Başlatma

```bash
npx tsx start-multi-agent-system.ts
```

### 3. Demo Çalıştırma

```bash
npx tsx start-multi-agent-system.ts --demo
```

### 4. Interactive Mod

```bash
npx tsx start-multi-agent-system.ts --interactive
```

### 5. Claude Code CLI ile Kullanım

#### MCP Sunucusunu Başlatın

```bash
node c:\\mcp-servers\\asb-cli\\index.js
```

#### Claude Code ile Agent'ı Kullanın

```bash
claude --agent multi-agent-orchestrator
```

## Örnek Kullanım Senaryoları

### Senaryo 1: React Component Geliştirme

```
Kullanıcı: React için bir kullanıcı profili componenti oluştur, kod inceleme yap ve testler oluştur

Multi-Agent Orchestrator:
🔄 İş akışı oluşturuluyor...
📋 Task 1: React component oluşturuluyor (Agent: zai-glm45-coder)
📋 Task 2: Kod incelemesi yapılıyor (Agent: code-reviewer)
📋 Task 3: Testler oluşturuluyor (Agent: test-generator)
📋 Task 4: Sonuçlar Redis'e kaydediliyor (MCP: asb-cli)

✅ İş akışı tamamlandı!

📝 Oluşturulan Kod:
```tsx
import React from 'react';

interface UserProfileProps {
  name: string;
  email: string;
  age: number;
  avatar?: string;
}

const UserProfile: React.FC<UserProfileProps> = ({ 
  name, 
  email, 
  age, 
  avatar 
}) => {
  return (
    <div className="user-profile">
      {avatar && (
        <img src={avatar} alt={`${name}'s avatar`} className="avatar" />
      )}
      <h2>{name}</h2>
      <p>Email: {email}</p>
      <p>Age: {age}</p>
    </div>
  );
};

export default UserProfile;
```

📋 Kod İnceleme Sonuçları:
- ✅ TypeScript tipleri doğru kullanılmış
- ✅ Component yapısı temiz ve okunabilir
- ⚠️ Props validation eklenmeli
- ✅ Export default doğru kullanılmış

📝 Oluşturulan Testler:
```tsx
import { render, screen } from '@testing-library/react';
import UserProfile from './UserProfile';

describe('UserProfile Component', () => {
  test('renders user information correctly', () => {
    const props = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    };
    
    render(<UserProfile {...props} />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Email: john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Age: 30')).toBeInTheDocument();
  });

  test('renders avatar when provided', () => {
    const props = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      avatar: 'avatar.jpg'
    };
    
    render(<UserProfile {...props} />);
    
    const avatar = screen.getByAltText('John Doe\'s avatar');
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', 'avatar.jpg');
  });
});
```

📊 Redis Kayıtları:
- ✅ İş akışı sonuçları kaydedildi
- ✅ Kod inceleme raporu kaydedildi
- ✅ Test sonuçları kaydedildi
```

### Senaryo 2: Express API Endpoint Oluşturma

```
Kullanıcı: Express.js için bir kullanıcı API endpoint'i oluştur ve dokümantasyon yaz

Multi-Agent Orchestrator:
🔄 İş akışı oluşturuluyor...
📋 Task 1: Express API endpoint oluşturuluyor (Agent: kilo-coder)
📋 Task 2: Kod incelemesi yapılıyor (Agent: code-reviewer)
📋 Task 3: API dokümantasyonu oluşturuluyor (Agent: doc-generator)
📋 Task 4: Sonuçlar Redis'e kaydediliyor (MCP: asb-cli)

✅ İş akışı tamamlandı!
```

## MCP API Referansı

### Araçlar

#### create_agent_workflow
Yeni bir multi-agent workflow'u oluşturur.

**Parametreler:**
- `name` (string): Workflow adı
- `description` (string): Workflow açıklaması
- `tasks` (array): Workflow task'ları

#### start_agent_workflow
Belirtilen workflow'u başlatır.

**Parametreler:**
- `workflowId` (string): Başlatılacak workflow ID'si

#### get_workflow_status
Workflow durumunu getirir.

**Parametreler:**
- `workflowId` (string): Workflow ID'si

#### list_agents
Mevcut tüm agentları listeler.

#### list_workflows
Mevcut tüm workflow'ları listeler.

#### add_custom_agent
Özel bir agent ekler.

**Parametreler:**
- `id` (string): Agent ID'si
- `name` (string): Agent adı
- `description` (string): Agent açıklaması
- `model` (string): Kullanılacak model
- `systemPrompt` (string): Agent sistem prompt'u
- `maxTokens` (number): Maksimum token sayısı
- `temperature` (number): Temperature değeri

#### execute_agent_task
Belirtilen agent ile tek bir task çalıştırır.

**Parametreler:**
- `agentId` (string): Agent ID'si
- `taskTitle` (string): Task başlığı
- `taskDescription` (string): Task açıklaması
- `input` (object): Task girdisi
- `priority` (string): Task önceliği

#### store_results
Sonuçları Redis'e kaydeder.

**Parametreler:**
- `key` (string): Redis anahtarı
- `data` (object): Kaydedilecek veri
- `ttl` (number): TTL (saniye)

#### retrieve_results
Redis'ten sonuçları getirir.

**Parametreler:**
- `key` (string): Redis anahtarı

### asb-cli MCP Araçları

#### Shell Execution
- `exec`: Shell komutu çalıştırma (buffered)
- `spawn`: Shell komutu çalıştırma (streaming)

#### Session Management
- `session_create`: Yeni oturum oluşturma
- `session_get`: Oturum bilgilerini getirme
- `session_update`: Oturum verilerini güncelleme

#### Context Management
- `context_push`: Paylaşılan belleğe bağlam ekleme
- `context_get`: Paylaşılan bellekten bağlam getirme

#### Buffer Management
- `buffer_allocate`: Büyük veriler için buffer ayırma
- `buffer_write`: Buffer'a veri yazma
- `buffer_read`: Buffer'dan veri okuma
- `buffer_flush`: Buffer'ı diske yazma veya temizleme

#### Agent Communication
- `agent_register`: Agent kaydetme
- `agent_communicate`: Belirli bir agent'a mesaj gönderme
- `agent_broadcast`: Tüm agent'lara mesaj yayma

#### Task Orchestration
- `orchestrate_task`: Karmaşık multi-agent görev düzenleme

#### System Operations
- `execute_command`: Sistem komutu çalıştırma
- `read_file`: Dosya okuma
- `write_file`: Dosya yazma

#### Redis Operations
- `redis_get`: Redis'ten değer getirme
- `redis_set`: Redis'e değer ayarlama

#### Monitoring
- `dashboard_status`: Dashboard durumu
- `monitor_agents`: Aktif agent'ları izleme
- `sacred_status`: Sacred sistem durumu

### Kaynaklar

#### mcp://agents/list
Mevcut tüm agentların listesi.

#### mcp://workflows/list
Mevcut tüm workflow'ların listesi.

#### mcp://workflows/active
Şu anda çalışan workflow'ların listesi.

#### redis://results/*
Redis'te saklanan sonuçlar.

## Özel Agent Oluşturma

Kendi agent'ınızı oluşturmak için aşağıdaki adımları izleyin:

1. **Agent Tanımlama**: Yeni bir agent tanımlayın:
```typescript
const customAgent: AgentConfig = {
  id: 'custom-agent',
  name: 'Custom Agent',
  description: 'Özel agent açıklaması',
  model: 'glm-4.5',
  capabilities: [
    {
      name: 'custom_capability',
      description: 'Özel yetenek açıklaması',
      category: 'coding',
      languages: ['typescript'],
      frameworks: ['react']
    }
  ],
  systemPrompt: 'Sen özel bir agentsın...',
  maxTokens: 2000,
  temperature: 0.3
};
```

2. **Agent'ı Ekleme**: Agent'ı orkestratöre ekleyin:
```typescript
orchestrator.addAgent(customAgent);
```

3. **Agent'ı Kullanma**: Agent'ı workflow'larda kullanın:
```typescript
const workflow = orchestrator.createWorkflow(
  'Özel Workflow',
  'Özel agent kullanarak görevleri gerçekleştir',
  [{
    title: 'Özel Task',
    description: 'Özel agent ile task gerçekleştir',
    agentId: 'custom-agent',
    priority: 'medium',
    input: { /* task girdisi */ }
  }]
);
```

## asb-cli MCP Sunucusu Yapılandırması

### Claude Code Yapılandırması

```json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": ["c:\\mcp-servers\\asb-cli\\index.js"],
      "env": {
        "REDIS_URL": "${REDIS_URL}",
        "API_BASE": "http://localhost:3001"
      }
    }
  }
}
```

### Ortam Değişkenleri

- `REDIS_URL`: Redis bağlantı URL'si
- `API_BASE`: API base URL'si (varsayılan: http://localhost:3001)
- `ALICE_SHELL_MAX_CONCURRENCY`: Maksimum eşzamanlı işlem sayısı (varsayılan: 2)

## Sınırlamalar

- Maksimum eşzamanlı task sayısı: 3
- Maksimum workflow başına task sayısı: 10
- Desteklenen diller ve framework'ler sınırlıdır
- Z.AI ve Kilo API kotaları geçerlidir
- Redis bağlantısı gereklidir
- asb-cli MCP sunucusu gereklidir

## Katkıda Bulunma

Projeye katkıda bulunmak için:

1. Depoyu fork edin
2. Yeni bir branch oluşturun (`git checkout -b feature/AmazingFeature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add some AmazingFeature'`)
4. Branch'inizi push edin (`git push origin feature/AmazingFeature`)
5. Bir Pull Request açın

## Lisans

Bu proje MIT lisansı altında dağıtılmaktadır. Daha fazla bilgi için [LICENSE](LICENSE) dosyasına bakın.

## İletişim

Sorularınız veya önerileriniz için lütfen bir issue açın veya bize ulaşın.

---

**Not**: Bu proje, [Awesome Claude Code Agents](https://github.com/hesreallyhim/awesome-claude-code-agents) koleksiyonuna dahil edilmiştir.