// Mock Query Suggestions API endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { query = '', limit = 5 } = req.query;
    
    // Mock suggestions based on query
    const allSuggestions = [
      'What is Alice Semantic Bridge?',
      'How does pgvector work?',
      'Explain LightRAG entity extraction',
      'What are n8n workflows?',
      'How to configure Redis caching?',
      'Database optimization techniques',
      'Vector similarity search',
      'Knowledge graph relationships',
      'Embedding generation process',
      'RAG pipeline architecture'
    ];

    // Filter suggestions based on query
    const suggestions = allSuggestions
      .filter(s => s.toLowerCase().includes(query.toLowerCase()))
      .slice(0, parseInt(limit));

    return res.status(200).json({ suggestions });
  }

  res.status(405).json({ error: 'Method not allowed' });
}