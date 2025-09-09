import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Import routes
import searchRoutes from './routes/search.routes';
import chatRoutes from './routes/chat.routes';
import dashboardRoutes from './routes/dashboard.routes';
import scraperRoutes from './routes/scraper.routes';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }
});

// Initialize PostgreSQL
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@91.99.229.96:5432/postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000
});

// Initialize Redis
export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '2')
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // For development
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check PostgreSQL
    await pgPool.query('SELECT 1');
    
    // Check Redis
    await redis.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: 'connected',
        redis: 'connected',
        lightrag: 'initializing'
      },
      agent: 'claude'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// API Routes
app.use(searchRoutes);
app.use(chatRoutes);
app.use(dashboardRoutes);
app.use(scraperRoutes);

// Base route
app.get('/api/v2', (req: Request, res: Response) => {
  res.json({
    message: 'ASB Backend API v2',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      chat: '/api/v2/chat',
      search: {
        semantic: '/api/v2/search/semantic',
        hybrid: '/api/v2/search/hybrid',
        stats: '/api/v2/search/stats'
      },
      scraper: '/api/v2/scraper',
      embeddings: '/api/v2/embeddings',
      dashboard: {
        overview: '/api/v2/dashboard',
        lightrag: {
          stats: '/api/v2/lightrag/stats',
          query: '/api/v2/lightrag/query',
          documents: '/api/v2/lightrag/documents'
        }
      }
    }
  });
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log('New WebSocket connection:', socket.id);
  
  // Join user room
  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined`);
  });
  
  // Handle typing indicators
  socket.on('chat:typing', (data: any) => {
    socket.broadcast.to(`conversation:${data.conversationId}`).emit('chat:typing', data);
  });
  
  // Handle chat messages
  socket.on('chat:message', async (data: any) => {
    // Broadcast to conversation participants
    io.to(`conversation:${data.conversationId}`).emit('chat:message', data);
    
    // Update Redis for real-time sync
    await redis.publish('asb:chat:messages', JSON.stringify(data));
  });
  
  // Dashboard real-time updates
  socket.on('dashboard:subscribe', () => {
    socket.join('dashboard:updates');
    console.log('Client subscribed to dashboard updates');
  });
  
  socket.on('disconnect', () => {
    console.log('WebSocket disconnected:', socket.id);
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  
  // Send error to monitoring
  redis.publish('asb:backend:errors', JSON.stringify({
    timestamp: new Date(),
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  }));
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Import LightRAG service
import LightRAGService from './services/lightrag.service';
export let lightRAGService: LightRAGService | null = null;

// Start server
const PORT = parseInt(process.env.PORT || '8083');
httpServer.listen(PORT, async () => {
  console.log(`🚀 ASB Backend Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    // Test database connection
    await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');
    
    // Test Redis connection
    await redis.ping();
    console.log('✅ Redis connected');
    
    // Pre-initialize LightRAG service
    console.log('🔄 Pre-initializing LightRAG service...');
    lightRAGService = new LightRAGService(pgPool, redis);
    await lightRAGService.initialize();
    console.log('✅ LightRAG service pre-initialized');
    
    // Publish startup event
    await redis.publish('asb:backend:status', JSON.stringify({
      event: 'startup',
      timestamp: new Date(),
      port: PORT,
      status: 'ready'
    }));
  } catch (error) {
    console.error('❌ Startup error:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  
  await pgPool.end();
  await redis.quit();
  
  process.exit(0);
});

export { app, io };
