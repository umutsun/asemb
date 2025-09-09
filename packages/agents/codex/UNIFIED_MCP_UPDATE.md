# Unified ASB-CLI MCP Server Update

## ✅ Yaptıklarımız:
1. **Birleşik index.js oluşturuldu** - Tüm agentlar için aynı tool seti
2. **15 tool mevcut:**
   - 10 ASB tool (status, search, embed, webscrape, workflow, database, redis, test, build, config)
   - 5 Core tool (exec, read_file, write_file, context_push, context_get)
3. **Redis entegrasyonu** - Shared memory için
4. **Agent tanıma** - Her agent AGENT_NAME ile kendini tanıtıyor

## 🔧 Yapılması gerekenler:

### 1. Codex'i yeniden başlat
Codex'in yeni MCP server'ı kullanması için.

### 2. Claude yapılandırmasını güncelle
`%APPDATA%\Claude\claude_desktop_config.json`:
```json
"asb-cli": {
  "command": "node",
  "args": ["C:/mcp-servers/asb-cli/index.js"],
  "env": {
    "AGENT_NAME": "claude",
    "PROJECT_KEY": "alice-semantic-bridge",
    "REDIS_HOST": "localhost",
    "REDIS_PORT": "6379",
    "REDIS_DB": "2",
    "POSTGRES_HOST": "91.99.229.96",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "postgres",
    "POSTGRES_USER": "postgres",
    "POSTGRES_PASSWORD": "Semsiye!22",
    "NODE_ENV": "production"
  }
}
```

### 3. Gemini yapılandırmasını güncelle
`.gemini\mcp-config.json` dosyasında aynı env değişkenleri olmalı ama `AGENT_NAME: "gemini"`

### 4. Test et
Her agentta şu komutları dene:
- `asb_status` - Agent adını göstermeli
- `asb_redis set test:agent "Hello from AGENT_NAME"`
- `context_push shared-data {"message": "Agent X reporting"}`
- `context_get shared-data` - Diğer agenttan okuyabilmeli

## 📊 Sonuç:
Artık 3 agent (Claude, Gemini, Codex) aynı tool setini kullanıyor ve Redis üzerinden haberleşebiliyor!
