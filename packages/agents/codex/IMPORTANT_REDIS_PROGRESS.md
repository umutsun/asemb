# 🚨 CODEX - REDIS PROGRESS TRACKING REQUIRED!

## TRACK EVERY DATABASE OPERATION IN REDIS

### ✅ Task Start:
```bash
asb-cli:asb_redis set asb:progress:codex:{task-name} "started"
```

### 🔄 In Progress:
```bash
asb-cli:asb_redis set asb:progress:codex:{task-name} "working"
```

### ✅ Task Complete:
```bash
asb-cli:asb_redis set asb:progress:codex:{task-name} "done"
```

### 📝 Real Examples:
```bash
# Before creating tables:
asb-cli:asb_redis set asb:progress:codex:create-tables "started"

# After running migration:
asb-cli:asb_redis set asb:progress:codex:create-tables "done"

# Working on batch operations:
asb-cli:asb_redis set asb:progress:codex:batch-ops "working"
```

## 📊 Database Operation Tracking:
```bash
asb-cli:asb_redis set asb:progress:codex:database '{
  "operation": "create-tables",
  "status": "completed",
  "tables_created": [
    "embeddings",
    "chunks",
    "sources",
    "performance_metrics"
  ],
  "indexes_created": 7,
  "timestamp": "2025-01-23T19:00:00Z",
  "issues": "none"
}'
```

## 🗄️ Migration Status:
```bash
# Track migration status:
asb-cli:asb_redis set asb:migration:001 "pending"
asb-cli:asb_redis set asb:migration:001 "running"
asb-cli:asb_redis set asb:migration:001 "completed"
```

## ⚠️ IMPORTANT RULES:
- Update Redis BEFORE and AFTER each task
- Include row counts for operations
- Report any SQL errors immediately
- Use "blocked:permission_denied" if DB access fails

**CODEX: NO REDIS UPDATE = YOUR DATABASE WORK DOESN'T EXIST!** 🔴

## 🔧 Quick Commands:
```bash
# List your progress:
asb-cli:asb_redis keys asb:progress:codex:*

# Check migration status:
asb-cli:asb_redis get asb:migration:001
```
