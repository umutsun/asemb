// Mock RAG Search API endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { query, mode = 'hybrid', topK = 5, threshold = 0.7 } = req.body;

    // Mock search results
    const mockResults = [
      {
        id: '1',
        content: 'The Alice Semantic Bridge (ASB) is a sophisticated RAG system that combines vector embeddings with knowledge graphs for enhanced semantic search capabilities. It uses pgvector for efficient similarity search and LightRAG for entity extraction.',
        score: 0.92,
        source: 'Technical Documentation',
        sourceId: 'doc-001',
        metadata: {
          author: 'ASB Team',
          date: '2025-01-30',
          category: 'Overview'
        },
        chunkIndex: 0,
        totalChunks: 3
      },
      {
        id: '2',
        content: 'The system integrates with n8n workflows to provide automated document processing pipelines. Each document is chunked, embedded using OpenAI models, and stored in PostgreSQL with pgvector extension for fast similarity searches.',
        score: 0.87,
        source: 'Architecture Guide',
        sourceId: 'doc-002',
        metadata: {
          section: 'Integration',
          version: '2.0'
        },
        chunkIndex: 1,
        totalChunks: 5
      },
      {
        id: '3',
        content: 'LightRAG component handles entity extraction and relationship mapping, building a knowledge graph that enhances contextual understanding. This allows for more accurate query responses by considering entity relationships.',
        score: 0.85,
        source: 'LightRAG Documentation',
        sourceId: 'doc-003',
        metadata: {
          module: 'LightRAG',
          type: 'Feature'
        },
        chunkIndex: 0,
        totalChunks: 2
      },
      {
        id: '4',
        content: `Query: "${query}" - This search used ${mode} mode with a similarity threshold of ${threshold}. The system searched through 220 documents containing 1760 entities and 1045 relationships.`,
        score: 0.78,
        source: 'Search Metadata',
        sourceId: 'meta-001',
        metadata: {
          searchMode: mode,
          threshold: threshold,
          timestamp: new Date().toISOString()
        },
        chunkIndex: 0,
        totalChunks: 1
      }
    ];

    // Filter by threshold and limit by topK
    const filteredResults = mockResults
      .filter(r => r.score >= threshold)
      .slice(0, topK);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 300));

    return res.status(200).json({
      success: true,
      results: filteredResults,
      query,
      mode,
      executionTime: 127,
      totalResults: filteredResults.length
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}