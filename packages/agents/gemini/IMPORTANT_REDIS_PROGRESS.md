# 🚨 GEMINI - REDIS PROGRESS TRACKING MANDATORY!

## EVERY TASK MUST BE TRACKED IN REDIS

### ✅ When Starting a Task:
```bash
asb-cli:asb_redis set asb:progress:gemini:{task-name} "started"
```

### 🔄 While Working:
```bash
asb-cli:asb_redis set asb:progress:gemini:{task-name} "in-progress"
```

### ✅ When Completed:
```bash
asb-cli:asb_redis set asb:progress:gemini:{task-name} "completed"
```

### 📝 Example Commands:
```bash
# Starting hybrid search implementation:
asb-cli:asb_redis set asb:progress:gemini:hybrid-search "started"

# Working on cache activation:
asb-cli:asb_redis set asb:progress:gemini:cache-activation "in-progress"

# Completed performance monitoring:
asb-cli:asb_redis set asb:progress:gemini:performance-metrics "completed"
```

## 📊 Detailed Progress Updates:
```bash
asb-cli:asb_redis set asb:progress:gemini:performance '{
  "task": "hybrid-search",
  "status": "in-progress",
  "metrics": {
    "search_latency_before": "150ms",
    "search_latency_current": "95ms",
    "target": "50ms"
  },
  "files_created": [
    "src/nodes/operations/hybrid-search.ts",
    "src/shared/query-optimizer.ts"
  ],
  "timestamp": "2025-01-23T19:00:00Z"
}'
```

## 🎯 Performance Metrics Tracking:
```bash
# Record performance improvements:
asb-cli:asb_redis set asb:metrics:search-latency "95ms"
asb-cli:asb_redis set asb:metrics:cache-hit-rate "15%"
asb-cli:asb_redis set asb:metrics:qps "25"
```

## ⚠️ NO PROGRESS = NO CREDIT:
- Always update Redis when starting work
- Update frequently (every 30 min)
- Include metrics in your updates
- If blocked, write: "blocked:{reason}"

**GEMINI: YOUR PERFORMANCE OPTIMIZATIONS ARE INVISIBLE WITHOUT REDIS TRACKING!** 🔴
