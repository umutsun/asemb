# n8n-nodes-alice-semantic-bridge (ASEMB)

**Version:** 1.0.0 | **Status:** Production Ready

Community nodes for n8n that provide advanced semantic search and RAG capabilities using PostgreSQL with pgvector, Redis caching, and intelligent document processing.

## 🚀 Features

### Core Capabilities
- **Web Scraping**: Extract content from URLs with CSS selectors and sitemap support
- **Text Chunking**: Intelligent document splitting with configurable overlap
- **Vector Storage**: PostgreSQL with pgvector for semantic search
- **Hybrid Search**: Combine vector similarity, keyword matching, and fuzzy search
- **Redis Integration**: High-performance caching and pub/sub messaging
- **Batch Operations**: Efficient bulk document processing

### Phase 3 Enhancements (In Progress)
- **Manage Operations**: Delete by source, statistics, cleanup orphaned records
- **Performance Optimization**: Sub-50ms search latency target
- **Advanced Caching**: Multi-level cache with intelligent invalidation
- **Production Hardening**: Comprehensive error handling and monitoring

## 📊 Performance Metrics

| Operation | Current | Target | Status |
|-----------|---------|--------|--------|
| Search Latency | 150ms | 50ms | 🔴 Optimizing |
| Insert Throughput | 100/s | 500/s | 🟡 Improving |
| Query Throughput | 10 qps | 100 qps | 🔴 In Progress |
| Cache Hit Rate | 0% | 60% | 🔴 Implementing |

## 🛠️ Installation

### Prerequisites
- Node.js 18+ and npm 9+
- n8n 1.0+
- PostgreSQL 15+ with pgvector extension
- Redis 7+ (optional but recommended)
- OpenAI API key or compatible embedding service

### Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/alice-semantic-bridge.git
cd alice-semantic-bridge
npm install

# Build the nodes
npm run build

# Link to n8n (development)
npm link
cd ~/.n8n/custom
npm link n8n-nodes-alice-semantic-bridge

# Start n8n
n8n start
```

### Production Installation

Install via n8n Community Nodes:
1. Open n8n
2. Go to Settings → Community Nodes
3. Install: `n8n-nodes-alice-semantic-bridge`
4. Restart n8n

## 🔧 Configuration

### Database Setup

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create optimized schema
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  source_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES embeddings(id) ON DELETE CASCADE,
  content TEXT,
  position INTEGER,
  metadata JSONB DEFAULT '{}'
);

-- Performance indexes
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_l2_ops);
CREATE INDEX idx_embeddings_source_id ON embeddings(source_id);
CREATE INDEX idx_embeddings_created_at ON embeddings(created_at DESC);
CREATE INDEX idx_chunks_document_id ON chunks(document_id);
```

### Credentials

Configure in n8n:

1. **PostgreSQL with Vector**
   - Host: `localhost`
   - Port: `5432`
   - Database: `your_db`
   - User: `your_user`
   - Password: `your_password`
   - SSL: Enable for production

2. **OpenAI API**
   - API Key: `sk-...`
   - Model: `text-embedding-3-small`
   - Base URL: (optional for Azure/custom endpoints)

3. **Redis** (optional)
   - Host: `localhost`
   - Port: `6379`
   - Password: (if configured)
   - DB Index: `0`

## 📖 Usage Examples

### Document Processing Pipeline

```javascript
// 1. Scrape content from URL
{
  "node": "webScrape",
  "parameters": {
    "url": "https://example.com/docs",
    "selector": ".content",
    "stripHtml": true
  }
}

// 2. Chunk the content
{
  "node": "textChunk", 
  "parameters": {
    "chunkSize": 512,
    "chunkOverlap": 64,
    "preserveParagraphs": true
  }
}

// 3. Store with embeddings
{
  "node": "pgvectorUpsert",
  "parameters": {
    "table": "embeddings",
    "sourceId": "docs-2024",
    "generateId": true
  }
}
```

### Semantic Search

```javascript
{
  "node": "pgvectorQuery",
  "parameters": {
    "query": "How to configure authentication?",
    "table": "embeddings",
    "limit": 10,
    "threshold": 0.7,
    "includeMetadata": true
  }
}
```

### Manage Operations (Phase 3)

```javascript
// Delete all documents from a source
{
  "node": "pgvectorManage",
  "operation": "deleteBySourceId",
  "parameters": {
    "sourceId": "old-docs-2023",
    "cascade": true
  }
}

// Get statistics
{
  "node": "pgvectorManage",
  "operation": "getStatistics",
  "parameters": {
    "workspace": "production"
  }
}

// Cleanup orphaned records
{
  "node": "pgvectorManage",
  "operation": "cleanupOrphaned",
  "parameters": {
    "dryRun": false,
    "batchSize": 100
  }
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           n8n Workflows                 │
├─────────────────────────────────────────┤
│         ASEMB Nodes                     │
│  ┌──────────┬──────────┬─────────────┐ │
│  │WebScrape │ PgVector │    Redis    │ │
│  │TextChunk │  Query   │   Publish   │ │
│  │ Sitemap  │  Upsert  │   Cache     │ │
│  └──────────┴──────────┴─────────────┘ │
├─────────────────────────────────────────┤
│         Shared Libraries                │
│  ┌──────────┬──────────┬─────────────┐ │
│  │   DB     │Embedding │   Cache     │ │
│  │  Pool    │ Service  │  Manager    │ │
│  └──────────┴──────────┴─────────────┘ │
├─────────────────────────────────────────┤
│         Storage Layer                   │
│  ┌──────────┬──────────┬─────────────┐ │
│  │PostgreSQL│  Redis   │   OpenAI    │ │
│  │pgvector  │  Cache   │ Embeddings  │ │
│  └──────────┴──────────┴─────────────┘ │
└─────────────────────────────────────────┘
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testNamePattern="PgVector"

# Run with coverage
npm test -- --coverage

# Run integration tests
npm run test:integration
```

For detailed guidance on writing and running tests, see `docs/TESTING.md`.

## 📈 Roadmap

### Phase 2 ✅ (Completed)
- Basic CRUD operations
- Search functionality
- CI/CD setup
- Chunking capabilities
- Sitemap support

### Phase 3 🔄 (Current - 60% Complete)
- Manage operations implementation
- Hybrid search algorithm
- Redis caching layer
- Performance optimization
- Comprehensive testing

### Phase 4 📅 (Planned)
- Multi-tenant support
- Real-time updates via WebSocket
- Graph database integration
- Advanced analytics dashboard
- LightRAG integration

## 🤝 Contributing

We use a multi-agent development approach:

| Agent | Role | Focus Area |
|-------|------|------------|
| **Claude** | Architecture | Core design, error handling |
| **Gemini** | Performance | Optimization, caching |
| **Codex** | Implementation | Database operations |
| **DeepSeek** | QA | Testing, documentation |

See agent-specific instructions in `.{agent}/phase3-tasks.md`

## 📊 Development Status

- **Code Coverage**: 45% (Target: 80%)
- **TypeScript Strict**: ✅ Enabled
- **CI/CD**: ✅ GitHub Actions
- **Docker**: ✅ Ready
- **Documentation**: 70% Complete

## ⚠️ Known Issues

- Search latency higher than target (working on optimization)
- Memory usage increases with large batch operations
- Cache invalidation needs refinement
- Some TypeScript strict mode violations remain

## 📝 License

MIT - See [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- n8n community for the amazing workflow platform
- PostgreSQL team for pgvector extension
- OpenAI for embedding models
- All contributors and AI agents

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/alice-semantic-bridge/issues)
- **Documentation**: [Full Docs](docs/)
- **Examples**: [Workflow Examples](examples/)

---

**Built with ❤️ by the Alice Semantic Bridge Team**

*Current Sprint: Phase 3 - Performance & Hardening*
