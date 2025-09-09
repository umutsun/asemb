# AliceSemanticBridge Main Orchestrator Node - Complete ✅

## Overview
The main orchestrator node for the Alice Semantic Bridge project is fully implemented and ready for use.

## Node Details

### Basic Information
- **Name**: AliceSemanticBridge
- **Version**: 1 (not V2)
- **Type**: Main Orchestrator
- **Icon**: alice-bridge.svg

### Three Main Operations

#### 1. Process Content
Processes and stores content as vectors in the database.

**Parameters:**
- `contentSource`: Choose between field, URL, or file
- `contentField`: Field name containing content (when source is field)
- `url`: URL to fetch content from (when source is URL)
- `sourceId`: Unique identifier for the content
- `processOptions`: 
  - `chunkSize`: Size of text chunks (default: 512)
  - `chunkOverlap`: Overlap between chunks (default: 64)
  - `batchSize`: Batch processing size (default: 100)
  - `metadata`: Additional metadata to store

#### 2. Search
Searches stored content using various modes.

**Parameters:**
- `query`: Search query text
- `searchMode`: hybrid, vector, or keyword
- `searchOptions`:
  - `limit`: Maximum results (default: 10)
  - `similarityThreshold`: Minimum similarity (0-1, default: 0.7)
  - `sourceFilter`: Filter by source ID
  - `includeMetadata`: Include metadata in results

#### 3. Manage Data
Manages stored data and workspace.

**Parameters:**
- `manageAction`: statistics, deleteSource, cleanup, or optimize
- `deleteSourceId`: Source ID to delete (for deleteSource action)
- `manageOptions`:
  - `dryRun`: Preview without changes (default: true)
  - `cascade`: Delete related data (default: true)
  - `workspace`: Filter by workspace

### Credentials Required

1. **postgresDb** (Required)
   - PostgreSQL database connection for vector storage

2. **openAiApi** (Required)
   - OpenAI API for generating embeddings

3. **redisApi** (Optional)
   - Redis for caching and performance optimization

### Global Options

- `continueOnError`: Continue processing if an item fails
- `cacheResults`: Use caching for improved performance
- `verbose`: Enable detailed logging

## File Structure

```
nodes/
├── AliceSemanticBridge.node.ts    # Main orchestrator node
├── interfaces/
│   └── IAliceSemanticBridge.ts    # TypeScript interfaces
└── alice-bridge.svg                # Node icon

index.ts                            # Exports configuration
package.json                        # Node registration
```

## Integration with Shared Services

The node uses existing shared services without modification:
- `shared/db.ts` - Database operations
- `shared/embedding-service.ts` - OpenAI embeddings
- `shared/hybrid-search.ts` - Hybrid search implementation
- `shared/chunk.ts` - Text chunking utilities

## Result Format

All operations return data in the standard n8n format with metadata:

```typescript
{
  success: boolean;
  operation: string;
  data: any;
  metadata: {
    executionTime: number;
    itemsProcessed?: number;
    cacheHit?: boolean;
  }
}
```

## Usage Examples

### Process Content
```javascript
// Input
{
  "content": "Text to process and store..."
}

// Node Configuration
Operation: Process Content
Content Source: Input Field
Content Field: content
Source ID: doc-123
```

### Search
```javascript
// Node Configuration
Operation: Search
Query: "semantic search query"
Search Mode: Hybrid (Recommended)
Limit: 10
```

### Manage
```javascript
// Node Configuration
Operation: Manage Data
Action: Get Statistics
Workspace: production
```

## Status: ✅ COMPLETE

The main orchestrator node is fully implemented with:
- Clean, simple architecture
- TypeScript type safety
- Proper error handling
- Integration with all shared services
- Standard n8n node structure
- Version 1 (not V2)

Ready for testing and deployment!