# Codex MCP Configuration - ÇÖZÜM

## Problem:
- Codex, Claude ve Gemini gibi JSON formatında MCP yapılandırması kabul ETMİYOR
- Codex sadece TOML formatı kullanıyor
- Yapılandırma dosyası proje dizininde değil, kullanıcı dizininde olmalı

## Çözüm:
1. Yapılandırma dosyası konumu: `C:\Users\umut.demirci\.codex\config.toml`
2. Format: TOML (JSON değil!)
3. Agent name: "codex" olarak ayarlandı

## Yapılandırma:
```toml
[mcp_servers.asb-cli]
command = "node"
args = ["C:\\mcp-servers\\asb-cli\\index.js"]
env = { AGENT_NAME = "codex", PROJECT_KEY = "alice-semantic-bridge", ... }
```

## Test etmek için:
1. PostgreSQL şifrenizi ayarlayın:
   ```cmd
   set POSTGRES_PASSWORD=your_password_here
   ```

2. Codex'i yeniden başlatın ve MCP sunucularını kontrol edin:
   ```cmd
   codex --help
   ```

## NOT:
- Tüm .bat dosyalarını ve JSON yapılandırmalarını silebilirsiniz
- Sadece `~/.codex/config.toml` dosyası gerekli
- AGENT_NAME artık "codex" olarak doğru şekilde ayarlandı
