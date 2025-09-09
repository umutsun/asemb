// Mock System Status API endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Mock system status
    const status = {
      postgres: 'connected',
      redis: 'connected',
      lightrag: 'active',
      openai: 'active',
      services: {
        api: { status: 'healthy', uptime: 86400 },
        websocket: { status: 'healthy', connections: 5 },
        cache: { status: 'healthy', hitRate: 0.82 },
        database: { status: 'healthy', connections: 10 }
      },
      timestamp: new Date().toISOString()
    };

    return res.status(200).json(status);
  }

  res.status(405).json({ error: 'Method not allowed' });
}