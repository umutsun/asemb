const express = require('express');
const router = express.Router();
const redis = require('../config/redis');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'up',
        redis: 'unknown',
        postgres: 'unknown'
      }
    };
    
    try {
      await redis.ping();
      health.services.redis = 'up';
    } catch (error) {
      health.services.redis = 'down';
      health.status = 'degraded';
    }
    
    try {
      await db.query('SELECT 1');
      health.services.postgres = 'up';
    } catch (error) {
      health.services.postgres = 'down';
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

router.get('/metrics', authMiddleware, async (req, res) => {
  try {
    const [
      requests,
      errors,
      searches,
      cacheHits,
      embeddings,
      chunks,
      tokenUsage
    ] = await Promise.all([
      redis.get('metrics:requests'),
      redis.get('metrics:errors'),
      redis.get('metrics:searches'),
      redis.get('metrics:cache_hits'),
      redis.get('metrics:embeddings_generated'),
      redis.get('metrics:chunks_stored'),
      redis.get('asb:agents:token:usage')
    ]);
    
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      api: {
        requests: parseInt(requests) || 0,
        errors: parseInt(errors) || 0,
        errorRate: requests ? ((parseInt(errors) || 0) / parseInt(requests)) : 0,
        searches: parseInt(searches) || 0
      },
      cache: {
        hits: parseInt(cacheHits) || 0,
        hitRate: embeddings ? ((parseInt(cacheHits) || 0) / (parseInt(embeddings) + parseInt(cacheHits))) : 0
      },
      rag: {
        embeddings: parseInt(embeddings) || 0,
        chunks: parseInt(chunks) || 0
      },
      tokens: tokenUsage ? JSON.parse(tokenUsage) : {}
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    const [
      projectStatus,
      backendStatus,
      sprintBoard,
      agentStatuses
    ] = await Promise.all([
      redis.get('asb:project:context'),
      redis.get('asb:backend:status:current'),
      redis.get('asb:sprint2:board'),
      Promise.all(['claude', 'gemini', 'codex'].map(agent => 
        redis.get(`asb:${agent}:status`)
      ))
    ]);
    
    const status = {
      timestamp: new Date().toISOString(),
      project: projectStatus ? JSON.parse(projectStatus) : null,
      backend: backendStatus ? JSON.parse(backendStatus) : null,
      sprint: sprintBoard ? JSON.parse(sprintBoard) : null,
      agents: {
        claude: agentStatuses[0] ? JSON.parse(agentStatuses[0]) : { state: 'unknown' },
        gemini: agentStatuses[1] ? JSON.parse(agentStatuses[1]) : { state: 'unknown' },
        codex: agentStatuses[2] ? JSON.parse(agentStatuses[2]) : { state: 'unknown' }
      }
    };
    
    res.json(status);
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
});

router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const { level = 'info', limit = 100, from, to } = req.query;
    
    let query = `
      SELECT * FROM logs 
      WHERE level >= $1
    `;
    const params = [level];
    
    if (from) {
      query += ` AND timestamp >= $${params.length + 1}`;
      params.push(from);
    }
    
    if (to) {
      query += ` AND timestamp <= $${params.length + 1}`;
      params.push(to);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await db.query(query, params);
    
    res.json({
      logs: result.rows,
      count: result.rows.length,
      filters: { level, limit, from, to }
    });
  } catch (error) {
    console.error('Logs error:', error);
    res.status(500).json({
      error: 'Failed to get logs',
      message: error.message
    });
  }
});

let eventClients = [];

router.get('/events', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  eventClients.push(newClient);
  
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  
  const subscription = redis.duplicate();
  subscription.on('message', (channel, message) => {
    res.write(`data: ${JSON.stringify({ 
      type: 'redis_event',
      channel,
      message: JSON.parse(message),
      timestamp: new Date().toISOString()
    })}\n\n`);
  });
  
  subscription.subscribe(
    'asb:coordination',
    'asb:rag:query',
    'asb:config:update',
    'asb:workflow:status'
  );
  
  req.on('close', () => {
    eventClients = eventClients.filter(client => client.id !== clientId);
    subscription.unsubscribe();
    subscription.quit();
  });
});

const broadcastEvent = (event) => {
  eventClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
};

router.post('/events/broadcast', authMiddleware, (req, res) => {
  const event = {
    ...req.body,
    timestamp: new Date().toISOString(),
    source: 'manual'
  };
  
  broadcastEvent(event);
  
  res.json({
    success: true,
    message: 'Event broadcasted',
    recipients: eventClients.length
  });
});

module.exports = router;