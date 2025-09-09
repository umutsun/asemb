// Mock Performance Data API endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { timeRange = '24h' } = req.query;
    
    // Generate mock performance history
    const history = [];
    const points = 24;
    const now = Date.now();
    
    for (let i = 0; i < points; i++) {
      const time = new Date(now - (points - i) * 3600000).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      history.push({
        time,
        queries: Math.floor(Math.random() * 50) + 10,
        avgResponseTime: Math.random() * 100 + 50,
        cacheHitRate: Math.random() * 0.3 + 0.7
      });
    }

    return res.status(200).json({
      timeRange,
      history,
      summary: {
        totalQueries: history.reduce((sum, h) => sum + h.queries, 0),
        avgResponseTime: history.reduce((sum, h) => sum + h.avgResponseTime, 0) / history.length,
        avgCacheHitRate: history.reduce((sum, h) => sum + h.cacheHitRate, 0) / history.length
      }
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
}