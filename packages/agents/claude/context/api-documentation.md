# API Documentation

## Base Configuration

- **Base URL**: `http://localhost:3000/api` (development)
- **Authentication**: Bearer token in Authorization header
- **Content-Type**: `application/json`
- **Rate Limiting**: 100 requests per minute per IP

## Endpoints

### Sources Management

#### GET /api/sources
List all data sources with pagination and filtering.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10, max: 100)
- `type` (string): Filter by source type (google_docs, postgres, web)
- `status` (string): Filter by status (active, inactive, error)
- `search` (string): Search in source names

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Source Name",
        "type": "google_docs",
        "status": "active",
        "config": {},
        "lastSync": "2024-01-01T00:00:00Z",
        "statistics": {
          "totalEmbeddings": 100,
          "lastProcessed": "2024-01-01T00:00:00Z"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5
    }
  }
}
```

#### GET /api/sources/:id
Get a specific source by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Source Name",
    "type": "google_docs",
    "status": "active",
    "config": {
      "documentId": "doc-id",
      "syncInterval": 60
    },
    "lastSync": "2024-01-01T00:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

#### POST /api/sources
Create a new data source.

**Request Body:**
```json
{
  "name": "Source Name",
  "type": "google_docs",
  "config": {
    "documentId": "doc-id",
    "credentials": "encrypted-credentials",
    "syncInterval": 60
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Source Name",
    "type": "google_docs",
    "status": "active"
  },
  "message": "Source created successfully"
}
```

#### PUT /api/sources/:id
Update an existing source.

**Request Body:**
```json
{
  "name": "Updated Name",
  "status": "active",
  "config": {
    "syncInterval": 30
  }
}
```

#### DELETE /api/sources/:id
Delete a source and all associated embeddings.

**Response:**
```json
{
  "success": true,
  "message": "Source deleted successfully"
}
```

#### POST /api/sources/:id/sync
Trigger manual synchronization for a source.

**Response:**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "status": "processing",
    "startedAt": "2024-01-01T00:00:00Z"
  },
  "message": "Synchronization started"
}
```

### Embeddings Operations

#### POST /api/embeddings/search
Semantic search across embeddings.

**Request Body:**
```json
{
  "query": "search query text",
  "limit": 10,
  "threshold": 0.7,
  "sourceIds": ["uuid1", "uuid2"],
  "metadata": {
    "category": "documentation"
  },
  "hybridSearch": true,
  "rerank": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "uuid",
        "content": "Matched content",
        "score": 0.95,
        "source": {
          "id": "uuid",
          "name": "Source Name",
          "type": "google_docs"
        },
        "metadata": {
          "section": "Introduction",
          "page": 1
        }
      }
    ],
    "totalResults": 10,
    "executionTime": 150,
    "query": {
      "text": "search query text",
      "embedding": [0.1, 0.2, ...]
    }
  }
}
```

#### POST /api/embeddings/generate
Generate embeddings for custom text.

**Request Body:**
```json
{
  "texts": ["text 1", "text 2"],
  "sourceId": "uuid",
  "metadata": {
    "custom": "data"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "embeddings": [
      {
        "id": "uuid",
        "text": "text 1",
        "embedding": [0.1, 0.2, ...],
        "tokenCount": 50
      }
    ],
    "totalTokens": 100,
    "cost": 0.0002
  }
}
```

#### GET /api/embeddings/stats
Get embedding statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEmbeddings": 10000,
    "totalSources": 50,
    "averageTokensPerChunk": 250,
    "storageUsed": "1.2 GB",
    "lastUpdated": "2024-01-01T00:00:00Z",
    "bySource": [
      {
        "sourceId": "uuid",
        "sourceName": "Source Name",
        "count": 500,
        "lastUpdated": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### DELETE /api/embeddings/:id
Delete a specific embedding.

**Response:**
```json
{
  "success": true,
  "message": "Embedding deleted successfully"
}
```

### Analytics & Monitoring

#### GET /api/analytics/queries
Get query analytics.

**Query Parameters:**
- `startDate` (string): Start date (ISO 8601)
- `endDate` (string): End date (ISO 8601)
- `groupBy` (string): Grouping (hour, day, week, month)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalQueries": 1000,
    "averageExecutionTime": 150,
    "averageResultScore": 0.85,
    "topQueries": [
      {
        "query": "common search",
        "count": 50,
        "averageScore": 0.9
      }
    ],
    "timeline": [
      {
        "date": "2024-01-01",
        "queries": 100,
        "averageTime": 120
      }
    ]
  }
}
```

#### GET /api/analytics/usage
Get API usage statistics.

**Query Parameters:**
- `startDate` (string): Start date (ISO 8601)
- `endDate` (string): End date (ISO 8601)
- `provider` (string): Filter by provider (openai, anthropic)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalTokens": 1000000,
    "totalCost": 2.50,
    "byProvider": {
      "openai": {
        "tokens": 900000,
        "cost": 2.25,
        "calls": 500
      }
    },
    "byModel": {
      "text-embedding-ada-002": {
        "tokens": 900000,
        "cost": 2.25,
        "calls": 500
      }
    },
    "daily": [
      {
        "date": "2024-01-01",
        "tokens": 50000,
        "cost": 0.125,
        "calls": 25
      }
    ]
  }
}
```

#### GET /api/analytics/performance
Get system performance metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "database": {
      "size": "5.2 GB",
      "connections": 10,
      "activeQueries": 2,
      "cacheHitRatio": 0.95
    },
    "indexing": {
      "queueSize": 5,
      "processing": 2,
      "averageProcessingTime": 500,
      "errorsLast24h": 0
    },
    "search": {
      "averageLatency": 150,
      "p95Latency": 300,
      "p99Latency": 500,
      "queriesPerSecond": 10
    }
  }
}
```

### N8N Integration

#### POST /api/n8n/webhook
Webhook endpoint for N8N workflows.

**Request Body:**
```json
{
  "action": "search|index|update|delete",
  "data": {
    "query": "search text",
    "sourceId": "uuid",
    "content": "content to index"
  },
  "metadata": {
    "workflowId": "n8n-workflow-id",
    "executionId": "execution-id"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "action": "search",
    "results": [...],
    "executionTime": 150
  }
}
```

#### GET /api/n8n/config
Get N8N node configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "supportedActions": ["search", "index", "update", "delete"],
    "limits": {
      "maxQueryLength": 1000,
      "maxResults": 100,
      "maxBatchSize": 50
    },
    "models": {
      "embedding": "text-embedding-ada-002",
      "reranking": "cross-encoder/ms-marco-MiniLM-L-12-v2"
    }
  }
}
```

### Admin Operations

#### POST /api/admin/reindex
Trigger full reindexing of a source.

**Request Body:**
```json
{
  "sourceId": "uuid",
  "force": false,
  "clearExisting": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "estimatedTime": 300
  }
}
```

#### POST /api/admin/backup
Create a backup of embeddings.

**Request Body:**
```json
{
  "includeEmbeddings": true,
  "includeSources": true,
  "includeAnalytics": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupId": "uuid",
    "size": "1.2 GB",
    "url": "https://storage.example.com/backups/backup-id.tar.gz",
    "expiresAt": "2024-01-08T00:00:00Z"
  }
}
```

#### POST /api/admin/cleanup
Clean up orphaned data and optimize database.

**Response:**
```json
{
  "success": true,
  "data": {
    "orphanedEmbeddings": 50,
    "expiredCache": 100,
    "freedSpace": "100 MB",
    "optimizationTime": 5000
  }
}
```

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional error context"
    }
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: Insufficient permissions
- `RATE_LIMITED`: Too many requests
- `INTERNAL_ERROR`: Server error
- `SERVICE_UNAVAILABLE`: External service error

## WebSocket Events

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');
ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'authenticate',
    token: 'bearer-token'
  }));
});
```

### Events

#### sync:progress
Real-time synchronization progress updates.
```json
{
  "type": "sync:progress",
  "data": {
    "sourceId": "uuid",
    "progress": 0.75,
    "processed": 750,
    "total": 1000,
    "currentChunk": "Processing page 75"
  }
}
```

#### embedding:created
New embedding created notification.
```json
{
  "type": "embedding:created",
  "data": {
    "id": "uuid",
    "sourceId": "uuid",
    "content": "First 100 chars..."
  }
}
```

#### search:result
Real-time search result streaming.
```json
{
  "type": "search:result",
  "data": {
    "queryId": "uuid",
    "result": {
      "id": "uuid",
      "content": "Matched content",
      "score": 0.95
    },
    "isLast": false
  }
}
```

## Rate Limiting

- **Default**: 100 requests per minute
- **Search**: 30 requests per minute
- **Indexing**: 10 requests per minute
- **Admin**: 5 requests per minute

Headers returned:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Authentication

### Bearer Token
```http
Authorization: Bearer your-api-token
```

### API Key (Alternative)
```http
X-API-Key: your-api-key
```

## Versioning

API version is specified in the URL path:
- Current: `/api/v1/`
- Legacy: `/api/v0/` (deprecated)

Version information in response headers:
```http
X-API-Version: 1.0.0
X-API-Deprecated: false
```