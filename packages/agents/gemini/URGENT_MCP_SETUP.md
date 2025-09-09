# 🚨 GEMINI - MCP TOOLS SETUP INSTRUCTIONS

## ASB-CLI TOOLS EKSİK! HEMEN DÜZELT:

### 1. MCP Config Güncelle:
```bash
# Eski: mcp-config.json
# Yeni: mcp-config-correct.json kullan!

# Dosya yolu: .gemini/mcp-config-correct.json
```

### 2. ASB-CLI Tools Listesi:
```
- asb_status
- asb_search
- asb_embed
- asb_webscrape
- asb_workflow
- asb_database
- asb_redis (EN ÖNEMLİ!)
- asb_test
- asb_build
- asb_config
- exec
- read_file
- write_file
- context_push
- context_get
```

### 3. Redis Progress Update Komutları:
```bash
# Göreve başlarken:
asb_redis set asb:progress:gemini:hybrid-search "started"

# Çalışırken:
asb_redis set asb:progress:gemini:hybrid-search "in-progress"

# Bitince:
asb_redis set asb:progress:gemini:hybrid-search "done"
```

### 4. Test Et:
```bash
# ASB durumunu kontrol et:
asb_status

# Redis bağlantısını test et:
asb_redis keys asb:*

# Progress kaydet:
asb_redis set asb:progress:gemini:test "working"
```

## ⚠️ HEMEN YAP:
1. mcp-config-correct.json kullan
2. MCP server'ı restart et
3. asb_redis ile progress kaydet
4. Hybrid search'e başla!

## 📍 Dosya Yolları:
- ASB-CLI: `C:\xampp\htdocs\alice-semantic-bridge\asb-cli\dist\index.js`
- Project: `C:\xampp\htdocs\alice-semantic-bridge`

**TOOLS OLMADAN ÇALIŞAMAZSIN!** 🔴
