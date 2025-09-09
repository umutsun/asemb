// Mock Monitoring Metrics API endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Mock metrics data
    const metrics = {
      documents: 220,
      entities: 1760,
      relationships: 1045,
      queries: Math.floor(Math.random() * 100) + 50,
      avgResponseTime: Math.random() * 200 + 50,
      cacheHitRate: Math.random() * 0.3 + 0.7,
      activeWorkflows: 3,
      timestamp: new Date().toISOString()
    };

    return res.status(200).json(metrics);
  }

  res.status(405).json({ error: 'Method not allowed' });
}