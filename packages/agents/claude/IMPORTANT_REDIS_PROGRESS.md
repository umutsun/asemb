# 🚨 CLAUDE - REDIS PROGRESS TRACKING ZORUNLU!

## HER GÖREV SONRASI REDIS'E KAYIT

### ✅ Görev Tamamlandığında:
```bash
asb-cli:asb_redis set asb:progress:claude:{task-name} "completed"
```

### 🔄 Görev Devam Ederken:
```bash
asb-cli:asb_redis set asb:progress:claude:{task-name} "in-progress"
```

### 📝 Örnek Kullanımlar:
```bash
# TypeScript hatalarını düzelttikten sonra:
asb-cli:asb_redis set asb:progress:claude:typescript-fixes "completed"

# Error handling üzerinde çalışırken:
asb-cli:asb_redis set asb:progress:claude:error-handling "in-progress"

# Redis integration pattern tamamlandığında:
asb-cli:asb_redis set asb:progress:claude:redis-patterns "completed"
```

## 📊 Detaylı Progress Kaydı:
```bash
asb-cli:asb_redis set asb:progress:claude:detail '{
  "task": "error-handling",
  "status": "completed",
  "files_modified": [
    "shared/error-handler.ts",
    "src/errors/AsembError.ts"
  ],
  "timestamp": "2025-01-23T19:00:00Z",
  "notes": "Logger property yerine console.warn kullanıldı"
}'
```

## 🔍 Progress Kontrolü:
```bash
# Kendi progress'ini kontrol et:
asb-cli:asb_redis keys asb:progress:claude:*

# Tüm agentların progress'i:
asb-cli:asb_redis keys asb:progress:*
```

## ⚠️ UNUTMA:
- Her görev bitiminde Redis'e kaydet
- "in-progress" ile başla
- "completed" ile bitir
- Blocker varsa "blocked:{reason}" yaz

**BU KURALI İHLAL EDEN AGENT'LAR PERFORMANS PUANI KAYBEDER!** 🔴
