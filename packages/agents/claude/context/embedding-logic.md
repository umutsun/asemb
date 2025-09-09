# Embedding Logic Documentation

## Overview
This document describes the embedding generation and management logic used in the Alice Semantic Bridge project.

## Embedding Pipeline

### 1. Data Ingestion
- **Sources**: Google Docs, PostgreSQL, Web Pages
- **Format**: Raw text, HTML, Markdown, JSON
- **Processing**: Content extraction, cleaning, normalization

### 2. Text Processing

#### Chunking Strategy
```typescript
interface ChunkingConfig {
  maxChunkSize: 1000;      // Maximum tokens per chunk
  chunkOverlap: 200;       // Overlap between chunks
  minChunkSize: 100;       // Minimum viable chunk size
  preserveContext: true;   // Maintain semantic boundaries
}
```

#### Chunking Rules
1. **Semantic Boundaries**: Respect paragraph, section, and sentence boundaries
2. **Context Preservation**: Include surrounding context for better retrieval
3. **Metadata Retention**: Keep source, position, and hierarchy information
4. **Dynamic Sizing**: Adjust chunk size based on content type

### 3. Embedding Generation

#### Model Configuration
- **Provider**: OpenAI
- **Model**: text-embedding-ada-002
- **Dimensions**: 1536
- **Batch Size**: 100 documents
- **Rate Limiting**: 3000 requests/minute

#### Generation Process
```typescript
async function generateEmbedding(text: string): Promise<number[]> {
  // 1. Preprocess text
  const cleaned = preprocessText(text);
  
  // 2. Check cache
  const cached = await checkEmbeddingCache(cleaned);
  if (cached) return cached;
  
  // 3. Generate embedding
  const embedding = await openai.createEmbedding({
    model: 'text-embedding-ada-002',
    input: cleaned,
  });
  
  // 4. Store in cache
  await cacheEmbedding(cleaned, embedding);
  
  return embedding;
}
```

### 4. Storage Strategy

#### PostgreSQL with pgvector
```sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id),
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}',
  chunk_index INTEGER,
  total_chunks INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_embedding_vector ON embeddings 
USING ivfflat (embedding vector_cosine_ops);
```

#### Metadata Structure
```json
{
  "source": {
    "type": "google_docs|postgres|web",
    "id": "source_identifier",
    "url": "original_url",
    "title": "document_title"
  },
  "chunk": {
    "index": 0,
    "total": 10,
    "start_char": 0,
    "end_char": 1000,
    "tokens": 250
  },
  "context": {
    "section": "section_name",
    "hierarchy": ["chapter", "section", "subsection"],
    "tags": ["tag1", "tag2"]
  },
  "processing": {
    "model": "text-embedding-ada-002",
    "timestamp": "2024-01-01T00:00:00Z",
    "version": "1.0.0"
  }
}
```

### 5. Retrieval Strategy

#### Similarity Search
```typescript
interface SearchConfig {
  method: 'cosine' | 'euclidean' | 'dot_product';
  threshold: 0.7;           // Minimum similarity score
  topK: 10;                 // Number of results
  rerank: true;             // Apply reranking
  hybridSearch: true;       // Combine with keyword search
}
```

#### Hybrid Search Implementation
1. **Vector Search**: Find semantically similar chunks
2. **Keyword Search**: Full-text search on content
3. **Score Fusion**: Combine scores with weighted average
4. **Reranking**: Apply cross-encoder for final ranking

### 6. Update Strategy

#### Incremental Updates
- **Change Detection**: Track document modifications
- **Partial Re-embedding**: Only update changed chunks
- **Version Control**: Maintain embedding history
- **Rollback Support**: Restore previous versions if needed

#### Batch Processing
```typescript
interface BatchConfig {
  batchSize: 100;
  parallel: 5;              // Concurrent processing threads
  retryAttempts: 3;
  retryDelay: 1000;        // ms
  errorThreshold: 0.05;    // 5% error rate tolerance
}
```

### 7. Quality Assurance

#### Validation Checks
1. **Dimension Verification**: Ensure 1536 dimensions
2. **Magnitude Check**: Verify normalized vectors
3. **Duplicate Detection**: Identify similar chunks
4. **Coverage Analysis**: Ensure complete document coverage

#### Performance Metrics
- **Indexing Speed**: Documents/second
- **Query Latency**: P50, P95, P99
- **Accuracy**: Retrieval precision and recall
- **Cost**: API calls and storage usage

### 8. Optimization Techniques

#### Caching Strategy
- **Embedding Cache**: LRU cache for frequent queries
- **Result Cache**: Cache search results
- **TTL Management**: Expire based on source updates

#### Cost Optimization
- **Batch Processing**: Reduce API calls
- **Compression**: Store compressed embeddings
- **Pruning**: Remove low-value chunks
- **Tiered Storage**: Hot/cold data separation

## Error Handling

### Common Issues and Solutions

1. **Rate Limiting**
   - Implement exponential backoff
   - Queue management for requests
   - Distribute load across time

2. **Large Documents**
   - Progressive chunking
   - Streaming processing
   - Memory management

3. **API Failures**
   - Retry mechanism
   - Fallback to cached data
   - Error logging and monitoring

## Best Practices

1. **Always validate input** before embedding generation
2. **Monitor embedding quality** with periodic evaluations
3. **Maintain metadata consistency** across all chunks
4. **Implement proper error handling** at every stage
5. **Use batch operations** for efficiency
6. **Cache aggressively** but invalidate appropriately
7. **Version your embeddings** for reproducibility
8. **Document processing decisions** for maintenance