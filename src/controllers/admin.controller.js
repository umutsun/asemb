const { generateToken, hashPassword, comparePassword } = require('../middleware/auth');
const redis = require('../config/redis');
const db = require('../config/database');

class AdminController {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      const adminUsers = {
        'admin@asb.local': {
          id: 1,
          email: 'admin@asb.local',
          password: '$2b$10$YourHashedPasswordHere',
          role: 'admin',
          name: 'ASB Admin'
        }
      };
      
      const user = adminUsers[email];
      
      if (!user) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid credentials'
        });
      }
      
      const validPassword = password === 'admin123';
      
      if (!validPassword) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid credentials'
        });
      }
      
      const token = generateToken(user);
      
      await redis.setex(`auth:token:${token}`, 86400, JSON.stringify({
        userId: user.id,
        email: user.email,
        role: user.role,
        loginAt: new Date().toISOString()
      }));
      
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Login failed',
        message: error.message
      });
    }
  }
  
  async getStats(req, res) {
    try {
      const stats = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        },
        redis: {
          connected: redis.status === 'ready',
          channels: await redis.pubsub('channels'),
          keys: await redis.dbsize()
        },
        database: {
          documents: await this.getDocumentCount(),
          embeddings: await this.getEmbeddingCount(),
          searches: await redis.get('metrics:searches') || 0
        },
        api: {
          requests: await redis.get('metrics:requests') || 0,
          errors: await redis.get('metrics:errors') || 0,
          avgResponseTime: await redis.get('metrics:response_time') || 0
        },
        tokens: JSON.parse(await redis.get('asb:agents:token:usage') || '{}')
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({
        error: 'Failed to get stats',
        message: error.message
      });
    }
  }
  
  async getAgents(req, res) {
    try {
      const agents = [];
      const agentKeys = ['claude', 'gemini', 'codex'];
      
      for (const agent of agentKeys) {
        const status = await redis.get(`asb:${agent}:status`);
        const tasks = await redis.get(`asb:agent:${agent}:tasks`);
        const completed = await redis.get(`asb:${agent}:completed_tasks`);
        
        agents.push({
          name: agent,
          status: status ? JSON.parse(status) : { state: 'inactive' },
          tasks: tasks ? JSON.parse(tasks) : [],
          completedTasks: completed ? JSON.parse(completed) : [],
          lastActive: await redis.get(`asb:${agent}:last_active`)
        });
      }
      
      res.json({ agents });
    } catch (error) {
      console.error('Get agents error:', error);
      res.status(500).json({
        error: 'Failed to get agents',
        message: error.message
      });
    }
  }
  
  async createTask(req, res) {
    try {
      const { title, description, priority, assignedTo, dueDate } = req.body;
      
      const task = {
        id: `TASK-${Date.now()}`,
        title,
        description,
        priority,
        assignedTo,
        dueDate,
        status: 'pending',
        createdBy: req.user.email,
        createdAt: new Date().toISOString()
      };
      
      if (assignedTo) {
        await redis.rpush(`asb:agent:${assignedTo}:tasks`, JSON.stringify(task));
      }
      
      await redis.hset('asb:tasks', task.id, JSON.stringify(task));
      
      await redis.publish('asb:coordination', JSON.stringify({
        type: 'task_created',
        task,
        agent: assignedTo
      }));
      
      res.status(201).json({
        success: true,
        task
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({
        error: 'Failed to create task',
        message: error.message
      });
    }
  }
  
  async getTokenUsage(req, res) {
    try {
      const tokenUsage = await redis.get('asb:agents:token:usage');
      const tokenTracking = await redis.get('asb:agents:token_tracking');
      
      const usage = tokenUsage ? JSON.parse(tokenUsage) : {};
      const tracking = tokenTracking ? JSON.parse(tokenTracking) : {};
      
      const response = {
        total: {
          input: 0,
          output: 0,
          cost: 0
        },
        byAgent: {},
        byModel: {},
        history: []
      };
      
      for (const [agent, data] of Object.entries(usage)) {
        response.byAgent[agent] = data;
        response.total.input += data.input_tokens || 0;
        response.total.output += data.output_tokens || 0;
        response.total.cost += data.estimated_cost || 0;
        
        if (data.model) {
          if (!response.byModel[data.model]) {
            response.byModel[data.model] = {
              input_tokens: 0,
              output_tokens: 0,
              requests: 0
            };
          }
          response.byModel[data.model].input_tokens += data.input_tokens || 0;
          response.byModel[data.model].output_tokens += data.output_tokens || 0;
          response.byModel[data.model].requests += 1;
        }
      }
      
      res.json(response);
    } catch (error) {
      console.error('Get token usage error:', error);
      res.status(500).json({
        error: 'Failed to get token usage',
        message: error.message
      });
    }
  }
  
  async updateConfig(req, res) {
    try {
      const { key, value, scope } = req.body;
      
      const configKey = scope === 'global' 
        ? `asb:config:${key}`
        : `asb:config:${scope}:${key}`;
      
      await redis.set(configKey, JSON.stringify({
        value,
        updatedBy: req.user.email,
        updatedAt: new Date().toISOString()
      }));
      
      await redis.publish('asb:config:update', JSON.stringify({
        key,
        value,
        scope
      }));
      
      res.json({
        success: true,
        message: 'Configuration updated',
        config: { key, value, scope }
      });
    } catch (error) {
      console.error('Update config error:', error);
      res.status(500).json({
        error: 'Failed to update config',
        message: error.message
      });
    }
  }
  
  async getDocumentCount() {
    try {
      const result = await db.query('SELECT COUNT(*) FROM documents');
      return parseInt(result.rows[0].count);
    } catch (error) {
      return 0;
    }
  }
  
  async getEmbeddingCount() {
    try {
      const result = await db.query('SELECT COUNT(*) FROM embeddings');
      return parseInt(result.rows[0].count);
    } catch (error) {
      return 0;
    }
  }
}

module.exports = new AdminController();