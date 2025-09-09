# 📊 Agent Progress Tracking

## Token Usage Format

When agents complete tasks, they should update Redis with the following format:

```bash
# Example command for agents to report progress
asb redis --command set --key 'asb:progress:{agent}:{task}' --value '{
  "task": "TASK_ID",
  "status": "completed|in_progress|failed",
  "progress": 75,
  "tokens_used": {
    "prompt": 1500,
    "completion": 2500,
    "total": 4000
  },
  "timestamp": "ISO_DATE",
  "duration": "45 minutes",
  "deliverables": ["file1.js", "file2.json"]
}'
```

## Progress Update Examples

### Claude Progress Update
```bash
asb redis --command set --key 'asb:progress:claude:CL-102' --value '{
  "task": "CL-102",
  "name": "Vector Search Enhancement",
  "status": "completed",
  "progress": 100,
  "tokens_used": {
    "prompt": 2000,
    "completion": 3000,
    "total": 5000,
    "model": "gpt-4"
  },
  "timestamp": "2025-08-29T13:00:00Z",
  "duration": "2 hours",
  "metrics": {
    "search_latency": "28ms",
    "accuracy": "96%"
  },
  "deliverables": [
    "hybrid-search.js",
    "vector-index.sql"
  ]
}'
```

### Gemini Progress Update
```bash
asb redis --command set --key 'asb:progress:gemini:GM-004' --value '{
  "task": "GM-004",
  "name": "Live Monitoring Dashboard",
  "status": "in_progress",
  "progress": 60,
  "tokens_used": {
    "prompt": 1000,
    "completion": 1500,
    "total": 2500,
    "model": "claude-3"
  },
  "timestamp": "2025-08-29T13:00:00Z",
  "components_completed": [
    "AgentStatusCard.jsx",
    "SprintProgressBar.jsx"
  ],
  "remaining": [
    "TaskBoard.jsx",
    "MessageStream.jsx"
  ]
}'
```

### Codex Progress Update
```bash
asb redis --command set --key 'asb:progress:codex:migration' --value '{
  "task": "RAG_MIGRATION",
  "status": "in_progress",
  "progress": 35,
  "tokens_used": {
    "embedding_generation": 15000,
    "code_completion": 3000,
    "total": 18000,
    "model": "text-embedding-ada-002"
  },
  "timestamp": "2025-08-29T13:00:00Z",
  "tables_migrated": {
    "danistaykararlari": 25,
    "sorucevap": 0,
    "makaleler": 0,
    "ozelgeler": 0
  },
  "total_records": 70,
  "records_processed": 25
}'
```

## Aggregated Token Report

```bash
# Generate daily token report
asb redis --command publish --channel 'asb:tokens:report' --value '{
  "date": "2025-08-29",
  "agents": {
    "claude": {"tasks": 6, "tokens": 45000, "cost": "$0.90"},
    "gemini": {"tasks": 5, "tokens": 32000, "cost": "$0.64"},
    "codex": {"tasks": 4, "tokens": 28000, "cost": "$0.56"}
  },
  "total": {
    "tasks_completed": 15,
    "tokens_used": 105000,
    "cost": "$2.10",
    "avg_tokens_per_task": 7000
  }
}'
```

## Cost Optimization Tips

1. **Batch Operations**: Combine multiple small requests
2. **Caching**: Store frequently used embeddings
3. **Local Models**: Use local models for development/testing
4. **Efficient Prompts**: Optimize prompt length
5. **Result Reuse**: Cache API responses in Redis

## Monitoring Commands

```bash
# Check total token usage
asb redis --command get --key 'asb:agents:token:usage'

# Check individual agent progress
asb redis --command keys --pattern 'asb:progress:*'

# Subscribe to token updates
asb redis --command subscribe --channel 'asb:tokens:*'
```

## Token Budget Alerts

```javascript
// Set budget alerts
const TOKEN_BUDGET = {
  daily: 150000,
  weekly: 1000000,
  alert_threshold: 0.8
};

// Alert when 80% of budget is used
if (totalTokens > TOKEN_BUDGET.daily * TOKEN_BUDGET.alert_threshold) {
  redis.publish('asb:alerts', {
    type: 'TOKEN_BUDGET_WARNING',
    usage: totalTokens,
    budget: TOKEN_BUDGET.daily,
    percentage: (totalTokens / TOKEN_BUDGET.daily) * 100
  });
}
```

---
*Token tracking implemented: 2025-08-29*
*Budget: $10/day across all agents*
