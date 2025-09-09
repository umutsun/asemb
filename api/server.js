const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { cacheManager } = require('../src/shared/cache-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.DASHBOARD_URL || 'http://localhost:3001',
    methods: ['GET', 'POST']
  }
});

// Redis clients from CacheManager
const redis = cacheManager.getRedisClient();
const pubClient = redis.duplicate();
const subClient = redis.duplicate();

// --- Production Readiness Middleware ---

// 1. CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3002', // Default for local dashboard
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 2. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', limiter); // Apply to all API routes

// 3. Performance Monitoring (Logging)
app.use(morgan('combined'));

// --- Standard Middleware ---
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    redis: redis.status
  });
});

// API Routes

// Workflow Management Routes
const workflowRouter = require('./workflow-api');
app.use('/api/workflows', workflowRouter);

// LightRAG Routes
const lightragRouter = require('./lightrag-router');
app.use('/api/lightrag', lightragRouter);

// LightRAG v2 Routes
const lightragV2Router = require('./lightrag-v2-router');
app.use('/api/v2/lightrag', lightragV2Router);

// Chat v2 Routes - MAIN CHAT ENDPOINT
const chatRouter = require('./chat-router');
app.use('/api/v2', chatRouter);

// Semantic Upsert
app.post('/api/v1/semantic/upsert', async (req, res) => {
  try {
    const { projectKey, sourceId, content, chunkingStrategy, metadata } = req.body;
    
    // Queue for processing
    const jobData = {
      type: 'upsert',
      projectKey,
      sourceId,
      content,
      chunkingStrategy: chunkingStrategy || 'auto',
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    };
    
    await redis.lpush(`asb:${projectKey}:queue:upsert`, JSON.stringify(jobData));
    
    // Publish metric
    await pubClient.publish(`asb:${projectKey}:metrics`, JSON.stringify({
      type: 'upsert_queued',
      sourceId,
      timestamp: jobData.timestamp
    }));
    
    res.json({
      success: true,
      jobId: `${projectKey}-${Date.now()}`,
      status: 'queued',
      queueLength: await redis.llen(`asb:${projectKey}:queue:upsert`)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Semantic Search
app.post('/api/v1/semantic/search', async (req, res) => {
  try {
    const { projectKey, query, searchMode, limit, filters } = req.body;
    
    const cacheKey = `asb:${projectKey}:cache:search:${Buffer.from(query).toString('base64')}`;
    
    const results = await cacheManager.getOrCompute(
      cacheKey,
      async () => {
        // Simulate search (in production, this would call the actual search logic)
        const searchResults = [];
        const pattern = `asb:${projectKey}:chunk:*`;
        const keys = await redis.keys(pattern);
        
        for (const key of keys.slice(0, limit || 5)) {
          const data = await redis.get(key);
          if (data) {
            searchResults.push(JSON.parse(data));
          }
        }
        return searchResults;
      },
      { ttl: 300 } // 5 minutes
    );

    const stats = await cacheManager.getStats();
    
    res.json({
      success: true,
      results,
      cached: stats.hits > 0, // This is a simplification, we'd need more fine-grained stats
      searchMode: searchMode || 'hybrid'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Workflow Status
app.get('/api/v1/workflow/status/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params;
    
    const status = {
      projectKey,
      queues: {
        upsert: await redis.llen(`asb:${projectKey}:queue:upsert`),
        search: await redis.llen(`asb:${projectKey}:queue:search`)
      },
      sources: await redis.smembers(`asb:${projectKey}:sources`),
      metrics: {
        totalChunks: (await redis.keys(`asb:${projectKey}:chunk:*`)).length,
        cacheSize: (await redis.keys(`asb:${projectKey}:cache:*`)).length
      },
      lastUpdate: new Date().toISOString()
    };
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/v1/cache/stats', async (req, res) => {
  try {
    const stats = await cacheManager.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Migration Status Endpoint
app.get('/api/migration/status', async (req, res) => {
  try {
    // Get migration status from Redis
    const migrationKey = 'asb:rag:migration:complete';
    const migrationData = await redis.get(migrationKey);
    
    if (migrationData) {
      res.json({
        status: 'completed',
        data: JSON.parse(migrationData)
      });
    } else {
      res.json({
        status: 'pending',
        message: 'Migration not yet completed'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics Metrics Endpoint
app.get('/api/analytics/metrics', async (req, res) => {
  try {
    const metrics = {
      cache: await cacheManager.getStats(),
      lightrag: {
        status: 'initializing',
        entities: 0,
        relationships: 0
      },
      performance: {
        avgResponseTime: '45ms',
        successRate: '99.5%',
        activeConnections: io.engine.clientsCount || 0
      },
      timestamp: new Date().toISOString()
    };
    
    // Try to get LightRAG metrics if service is available
    try {
      const lightragRouter = require('./lightrag-router');
      // This would be better implemented with a shared service instance
      metrics.lightrag = {
        status: 'active',
        entities: 150, // Mock data
        relationships: 320 // Mock data
      };
    } catch (e) {
      // LightRAG not available
    }
    
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket support for real-time migration updates
const migrationNamespace = io.of('/api/migration/stream');
migrationNamespace.on('connection', (socket) => {
  console.log('Client connected to migration stream');
  
  // Send initial status
  redis.get('asb:rag:migration:complete').then(data => {
    if (data) {
      socket.emit('migration:status', {
        status: 'completed',
        data: JSON.parse(data)
      });
    }
  });
  
  // Subscribe to migration updates
  const migrationChannel = 'asb:migration:updates';
  subClient.subscribe(migrationChannel);
  
  subClient.on('message', (channel, message) => {
    if (channel === migrationChannel) {
      socket.emit('migration:update', JSON.parse(message));
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected from migration stream');
  });
});

// Start server
const PORT = process.env.API_PORT || process.env.PORT || 8083;
server.listen(PORT, () => {
  console.log(`Alice Semantic Bridge API running on port ${PORT}`);
});
