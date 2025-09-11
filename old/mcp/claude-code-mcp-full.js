#!/usr/bin/env node

/**
 * Claude Code MCP Server - Full Version
 * Includes all ASB tools from the main MCP server
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const redis = require('redis');
const { Pool } = require('pg');
const ASBSharedMemory = require('./shared/asb-memory');

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Configuration
const PROJECT_ROOT = process.env.PROJECT_ROOT || 'C:\\xampp\\htdocs\\alice-semantic-bridge';
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  db: parseInt(process.env.REDIS_DB) || 2
};

const POSTGRES_CONFIG = {
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Semsiye!22'
};

const AGENT_NAME = 'claude-code';
const PROJECT_KEY = 'alice-semantic-bridge';

class ClaudeCodeMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'asb-cli',
        version: '5.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.redisClient = null;
    this.pgPool = null;
    this.memory = null;
    this.initConnections();
    this.setupHandlers();
  }

  async initConnections() {
    // Shared Memory
    try {
      this.memory = new ASBSharedMemory(PROJECT_KEY);
      await this.memory.connect();
      await this.memory.registerAgent(AGENT_NAME, [
        'code-editing',
        'project-management',
        'mcp-orchestration',
        'cli-operations'
      ]);
    } catch (error) {
      console.error('Failed to connect to shared memory:', error);
    }

    // Redis connection
    try {
      this.redisClient = redis.createClient({
        socket: {
          host: REDIS_CONFIG.host,
          port: REDIS_CONFIG.port
        },
        database: REDIS_CONFIG.db
      });
      
      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });
      
      await this.redisClient.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }

    // PostgreSQL connection
    try {
      this.pgPool = new Pool(POSTGRES_CONFIG);
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error);
    }
  }

  setupHandlers() {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Original Claude Code tools with mcp__ prefix
          {
            name: 'project_status',
            description: 'Get ASB project status',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'list_agents',
            description: 'List all active ASB agents',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'share_context',
            description: 'Share context with other agents',
            inputSchema: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Context key' },
                value: { type: 'object', description: 'Context value' }
              },
              required: ['key', 'value']
            }
          },
          {
            name: 'get_context',
            description: 'Get shared context',
            inputSchema: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Context key' }
              },
              required: ['key']
            }
          },
          {
            name: 'create_task',
            description: 'Create a task for agents',
            inputSchema: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'Task type' },
                description: { type: 'string', description: 'Task description' },
                priority: { 
                  type: 'string', 
                  enum: ['low', 'medium', 'high'],
                  description: 'Task priority'
                }
              },
              required: ['type', 'description']
            }
          },
          {
            name: 'broadcast_message',
            description: 'Broadcast message to all agents',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Message to broadcast' }
              },
              required: ['message']
            }
          },
          
          // Additional ASB Project Management Tools
          {
            name: 'asb_build',
            description: 'Build and deploy ASB',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string', 
                  enum: ['build', 'clean', 'deploy', 'link'], 
                  description: 'Build action' 
                },
                target: { 
                  type: 'string', 
                  description: 'Deploy target (local/n8n)', 
                  default: 'local' 
                },
              },
              required: ['action'],
            },
          },
          {
            name: 'asb_test',
            description: 'Run ASB tests',
            inputSchema: {
              type: 'object',
              properties: {
                type: { 
                  type: 'string', 
                  enum: ['unit', 'integration', 'all', 'coverage'], 
                  description: 'Test type to run', 
                  default: 'all' 
                },
                pattern: { 
                  type: 'string', 
                  description: 'Test file pattern' 
                },
              },
            },
          },
          {
            name: 'asb_config',
            description: 'Manage ASB configuration',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string', 
                  enum: ['get', 'set', 'list', 'validate'], 
                  description: 'Config action' 
                },
                key: { 
                  type: 'string', 
                  description: 'Configuration key' 
                },
                value: { 
                  type: 'string', 
                  description: 'Configuration value' 
                },
              },
              required: ['action'],
            },
          },

          // Database Operations
          {
            name: 'asb_database',
            description: 'Database operations for pgvector',
            inputSchema: {
              type: 'object',
              properties: {
                operation: { 
                  type: 'string', 
                  enum: ['init', 'stats', 'query', 'upsert', 'delete', 'vacuum'], 
                  description: 'Database operation' 
                },
                query: { 
                  type: 'string', 
                  description: 'SQL query (for query operation)' 
                },
                data: { 
                  type: 'object', 
                  description: 'Data for upsert operation' 
                },
              },
              required: ['operation'],
            },
          },
          {
            name: 'asb_search',
            description: 'Search in ASB database using pgvector',
            inputSchema: {
              type: 'object',
              properties: {
                query: { 
                  type: 'string', 
                  description: 'Search query text' 
                },
                limit: { 
                  type: 'number', 
                  description: 'Number of results to return', 
                  default: 5 
                },
                threshold: { 
                  type: 'number', 
                  description: 'Similarity threshold (0-1)', 
                  default: 0.7 
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'asb_embed',
            description: 'Generate embeddings for text using OpenAI',
            inputSchema: {
              type: 'object',
              properties: {
                text: { 
                  type: 'string', 
                  description: 'Text to generate embeddings for' 
                },
                model: { 
                  type: 'string', 
                  description: 'OpenAI model to use', 
                  default: 'text-embedding-ada-002' 
                },
              },
              required: ['text'],
            },
          },

          // Redis Operations
          {
            name: 'asb_redis',
            description: 'Redis cache operations',
            inputSchema: {
              type: 'object',
              properties: {
                command: { 
                  type: 'string', 
                  enum: ['get', 'set', 'del', 'flush', 'keys', 'publish'], 
                  description: 'Redis command' 
                },
                key: { 
                  type: 'string', 
                  description: 'Redis key' 
                },
                value: { 
                  type: 'string', 
                  description: 'Value to set' 
                },
                channel: { 
                  type: 'string', 
                  description: 'Channel for publish' 
                },
                pattern: { 
                  type: 'string', 
                  description: 'Pattern for keys command', 
                  default: '*' 
                },
              },
              required: ['command'],
            },
          },

          // Web Operations
          {
            name: 'asb_webscrape',
            description: 'Scrape web content and optionally store embeddings',
            inputSchema: {
              type: 'object',
              properties: {
                url: { 
                  type: 'string', 
                  description: 'URL to scrape' 
                },
                store_embeddings: { 
                  type: 'boolean', 
                  description: 'Store embeddings in database', 
                  default: false 
                },
                chunk_size: { 
                  type: 'number', 
                  description: 'Chunk size for text splitting', 
                  default: 1000 
                },
              },
              required: ['url'],
            },
          },

          // Workflow Management
          {
            name: 'asb_workflow',
            description: 'Manage n8n workflows',
            inputSchema: {
              type: 'object',
              properties: {
                action: { 
                  type: 'string', 
                  enum: ['list', 'deploy', 'import', 'export', 'test'], 
                  description: 'Workflow action' 
                },
                workflow_name: { 
                  type: 'string', 
                  description: 'Name of the workflow' 
                },
                workflow_data: { 
                  type: 'string', 
                  description: 'JSON workflow data (for import)' 
                },
              },
              required: ['action'],
            },
          },

          // Core System Tools
          {
            name: 'exec',
            description: 'Execute a shell command (buffered)',
            inputSchema: {
              type: 'object',
              properties: {
                command: { 
                  type: 'string', 
                  description: 'Command to execute' 
                },
                cwd: { 
                  type: 'string', 
                  description: 'Working directory' 
                },
                timeout: { 
                  type: 'number', 
                  description: 'Timeout in milliseconds' 
                },
                env: { 
                  type: 'object', 
                  description: 'Environment variables' 
                }
              },
              required: ['command']
            }
          },
          {
            name: 'read_file',
            description: 'Read file contents',
            inputSchema: {
              type: 'object',
              properties: {
                path: { 
                  type: 'string', 
                  description: 'File path' 
                },
                encoding: { 
                  type: 'string', 
                  description: 'File encoding' 
                }
              },
              required: ['path']
            }
          },
          {
            name: 'write_file',
            description: 'Write file contents',
            inputSchema: {
              type: 'object',
              properties: {
                path: { 
                  type: 'string', 
                  description: 'File path' 
                },
                content: { 
                  type: 'string', 
                  description: 'File content' 
                },
                encoding: { 
                  type: 'string', 
                  description: 'File encoding' 
                }
              },
              required: ['path', 'content']
            }
          },
          {
            name: 'context_push',
            description: 'Push context to shared memory via Redis',
            inputSchema: {
              type: 'object',
              properties: {
                key: { 
                  type: 'string', 
                  description: 'Context key' 
                },
                value: { 
                  type: 'object', 
                  description: 'Context value' 
                },
                ttl: { 
                  type: 'number', 
                  description: 'TTL in seconds' 
                }
              },
              required: ['key', 'value']
            }
          },
          {
            name: 'context_get',
            description: 'Get context from shared memory via Redis',
            inputSchema: {
              type: 'object',
              properties: {
                key: { 
                  type: 'string', 
                  description: 'Context key' 
                }
              },
              required: ['key']
            }
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Handle original Claude Code tools
        switch (name) {
          case 'project_status':
            const stats = await this.memory.getStats();
            const project = await this.memory.getContext('project');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ stats, project }, null, 2)
                }
              ]
            };
            
          case 'list_agents':
            const agents = await this.memory.getAgents();
            return {
              content: [
                {
                  type: 'text',
                  text: `Active Agents:\n${agents.map(a => `- ${a.name}: ${a.status} (${a.capabilities.join(', ')})`).join('\n')}`
                }
              ]
            };
            
          case 'share_context':
            await this.memory.setContext(args.key, args.value);
            return {
              content: [
                {
                  type: 'text',
                  text: `Context '${args.key}' shared successfully`
                }
              ]
            };
            
          case 'get_context':
            const context = await this.memory.getContext(args.key);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(context, null, 2)
                }
              ]
            };
            
          case 'create_task':
            const task = await this.memory.queueTask(args.type, {
              description: args.description,
              priority: args.priority || 'medium',
              createdBy: AGENT_NAME
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `Task created: ${task.id} (${task.type})`
                }
              ]
            };
            
          case 'broadcast_message':
            await this.memory.broadcast({
              type: 'user_message',
              from: AGENT_NAME,
              message: args.message
            });
            return {
              content: [
                {
                  type: 'text',
                  text: 'Message broadcast to all agents'
                }
              ]
            };

          // ASB Project Tools
          case 'asb_build':
            return await this.handleBuild(args);
          case 'asb_test':
            return await this.handleTest(args);
          case 'asb_config':
            return await this.handleConfig(args);

          // Database Tools
          case 'asb_database':
            return await this.handleDatabase(args);
          case 'asb_search':
            return await this.handleSearch(args);
          case 'asb_embed':
            return await this.handleEmbed(args);

          // Redis Tools
          case 'asb_redis':
            return await this.handleRedis(args);

          // Web Tools
          case 'asb_webscrape':
            return await this.handleWebscrape(args);

          // Workflow Tools
          case 'asb_workflow':
            return await this.handleWorkflow(args);

          // Core Tools
          case 'exec':
            return await this.handleExec(args);
          case 'read_file':
            return await this.handleReadFile(args);
          case 'write_file':
            return await this.handleWriteFile(args);
          case 'context_push':
            return await this.handleContextPush(args);
          case 'context_get':
            return await this.handleContextGet(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error in ${AGENT_NAME}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  // Tool Implementation Methods (from index.js)
  async handleRedis(args) {
    const { command, key, value, channel, pattern = '*' } = args;
    
    if (!this.redisClient || !this.redisClient.isReady) {
      return {
        content: [{
          type: 'text',
          text: '❌ Redis client not connected'
        }]
      };
    }

    try {
      switch (command) {
        case 'get':
          const getValue = await this.redisClient.get(key);
          return {
            content: [{
              type: 'text',
              text: getValue ? `📖 Redis GET ${key}: ${getValue}` : `❌ Key not found: ${key}`
            }]
          };
        
        case 'set':
          await this.redisClient.set(key, value);
          return {
            content: [{
              type: 'text',
              text: `✅ Redis SET ${key} = "${value}"`
            }]
          };
        
        case 'keys':
          const keys = await this.redisClient.keys(pattern);
          return {
            content: [{
              type: 'text',
              text: `🔑 Redis KEYS ${pattern}:\n${keys.join('\n')}`
            }]
          };
        
        case 'del':
          const deleted = await this.redisClient.del(key);
          return {
            content: [{
              type: 'text',
              text: deleted ? `🗑️ Deleted key: ${key}` : `❌ Key not found: ${key}`
            }]
          };
        
        case 'flush':
          await this.redisClient.flushDb();
          return {
            content: [{
              type: 'text',
              text: `🧹 Redis database ${REDIS_CONFIG.db} flushed`
            }]
          };
        
        case 'publish':
          await this.redisClient.publish(channel, value);
          return {
            content: [{
              type: 'text',
              text: `📣 Published to '${channel}': ${value}`
            }]
          };
        
        default:
          throw new Error(`Unknown Redis command: ${command}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Redis error: ${error.message}`
        }]
      };
    }
  }

  async handleDatabase(args) {
    const { operation, query, data } = args;
    
    if (!this.pgPool) {
      return {
        content: [{
          type: 'text',
          text: '❌ PostgreSQL connection not available'
        }]
      };
    }

    try {
      switch (operation) {
        case 'query':
          const result = await this.pgPool.query(query);
          return {
            content: [{
              type: 'text',
              text: `📊 Query Result:\n${JSON.stringify(result.rows, null, 2)}\nRows affected: ${result.rowCount}`
            }]
          };
        
        case 'stats':
          const statsQuery = `
            SELECT 
              schemaname,
              tablename,
              pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
              n_live_tup AS row_count
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
          `;
          const stats = await this.pgPool.query(statsQuery);
          return {
            content: [{
              type: 'text',
              text: `📈 Database Stats:\n${JSON.stringify(stats.rows, null, 2)}`
            }]
          };
        
        case 'init':
          const initScript = await readFileAsync(
            path.join(PROJECT_ROOT, 'migrations', '001_create_schema.sql'), 
            'utf8'
          );
          await this.pgPool.query(initScript);
          return {
            content: [{
              type: 'text',
              text: `✅ Database initialized with schema`
            }]
          };
        
        default:
          return {
            content: [{
              type: 'text',
              text: `⚠️ Operation '${operation}' not implemented yet`
            }]
          };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Database error: ${error.message}`
        }]
      };
    }
  }

  async handleExec(args) {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/c', args.command] : ['-c', args.command];
      
      const options = {
        cwd: args.cwd || PROJECT_ROOT,
        env: { ...process.env, ...args.env }
      };
      
      const proc = spawn(shell, shellArgs, options);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code) => {
        resolve({
          content: [{
            type: 'text',
            text: JSON.stringify({ stdout, stderr, exitCode: code }, null, 2)
          }]
        });
      });
      
      if (args.timeout) {
        setTimeout(() => {
          proc.kill();
          resolve({
            content: [{
              type: 'text',
              text: JSON.stringify({ 
                stdout, 
                stderr, 
                exitCode: -1, 
                error: 'Command timed out' 
              }, null, 2)
            }]
          });
        }, args.timeout);
      }
    });
  }

  async handleReadFile(args) {
    try {
      const filePath = path.isAbsolute(args.path) 
        ? args.path 
        : path.join(PROJECT_ROOT, args.path);
      
      const content = await readFileAsync(filePath, args.encoding || 'utf8');
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ content }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: error.message }, null, 2)
        }]
      };
    }
  }

  async handleWriteFile(args) {
    try {
      const filePath = path.isAbsolute(args.path) 
        ? args.path 
        : path.join(PROJECT_ROOT, args.path);
      
      await writeFileAsync(filePath, args.content, args.encoding || 'utf8');
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: error.message }, null, 2)
        }]
      };
    }
  }

  async handleContextPush(args) {
    const { key, value, ttl = 3600 } = args;
    
    if (!this.redisClient || !this.redisClient.isReady) {
      return {
        content: [{
          type: 'text',
          text: '❌ Redis not connected for context push'
        }]
      };
    }

    try {
      const contextKey = `${PROJECT_KEY}:context:${key}`;
      const contextData = {
        agent: AGENT_NAME,
        timestamp: new Date().toISOString(),
        value: value
      };
      
      await this.redisClient.setEx(contextKey, ttl, JSON.stringify(contextData));
      
      return {
        content: [{
          type: 'text',
          text: `✅ Context pushed by ${AGENT_NAME}: ${key}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Context push error: ${error.message}`
        }]
      };
    }
  }

  async handleContextGet(args) {
    const { key } = args;
    
    if (!this.redisClient || !this.redisClient.isReady) {
      return {
        content: [{
          type: 'text',
          text: '❌ Redis not connected for context get'
        }]
      };
    }

    try {
      const contextKey = `${PROJECT_KEY}:context:${key}`;
      const value = await this.redisClient.get(contextKey);
      
      if (value) {
        const contextData = JSON.parse(value);
        return {
          content: [{
            type: 'text',
            text: `📖 Context from ${contextData.agent} (${contextData.timestamp}):\n${JSON.stringify(contextData.value, null, 2)}`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `❌ No context found for key: ${key}`
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Context get error: ${error.message}`
        }]
      };
    }
  }

  // Simplified implementations for other tools
  async handleBuild(args) {
    const { action, target = 'local' } = args;
    const commands = {
      build: 'npm run build',
      clean: 'npm run clean',
      deploy: 'npm run deploy',
      link: 'npm link'
    };
    
    if (commands[action]) {
      return await this.handleExec({ command: commands[action] });
    }
    
    return {
      content: [{
        type: 'text',
        text: `❌ Unknown build action: ${action}`
      }]
    };
  }

  async handleTest(args) {
    const { type = 'all', pattern } = args;
    let command = 'npm test';
    
    if (pattern) {
      command += ` -- ${pattern}`;
    }
    
    if (type === 'coverage') {
      command = 'npm run test:coverage';
    }
    
    return await this.handleExec({ command });
  }

  async handleConfig(args) {
    const { action, key, value } = args;
    const configFile = path.join(PROJECT_ROOT, '.env');
    
    return {
      content: [{
        type: 'text',
        text: `⚙️ Config ${action}: ${key || 'all'}\n[Configuration management would be implemented here]`
      }]
    };
  }

  async handleSearch(args) {
    const { query, limit = 5, threshold = 0.7 } = args;
    return {
      content: [{
        type: 'text',
        text: `🔍 Search for "${query}":\n[pgvector search would be performed here]\nLimit: ${limit}, Threshold: ${threshold}`
      }]
    };
  }

  async handleEmbed(args) {
    const { text, model = 'text-embedding-ada-002' } = args;
    return {
      content: [{
        type: 'text',
        text: `🧠 Embedding generation:\nText: "${text.substring(0, 50)}..."\nModel: ${model}\n[OpenAI API call would be made here]`
      }]
    };
  }

  async handleWebscrape(args) {
    const { url, store_embeddings = false, chunk_size = 1000 } = args;
    return {
      content: [{
        type: 'text',
        text: `🕷️ Web scraping:\nURL: ${url}\nStore embeddings: ${store_embeddings}\nChunk size: ${chunk_size}\n[Web scraping would be performed here]`
      }]
    };
  }

  async handleWorkflow(args) {
    const { action, workflow_name, workflow_data } = args;
    return {
      content: [{
        type: 'text',
        text: `📋 Workflow ${action}: ${workflow_name || 'all'}\n[n8n workflow operations would be performed here]`
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log startup info to stderr
    console.error(`🚀 Claude Code MCP Server v5.0.0 Started`);
    console.error(`👤 Agent: ${AGENT_NAME}`);
    console.error(`📦 Project: ${PROJECT_KEY}`);
    console.error(`📁 Root: ${PROJECT_ROOT}`);
    console.error(`📡 Redis: ${REDIS_CONFIG.host}:${REDIS_CONFIG.port} DB:${REDIS_CONFIG.db}`);
    console.error(`🐘 PostgreSQL: ${POSTGRES_CONFIG.host}:${POSTGRES_CONFIG.port}/${POSTGRES_CONFIG.database}`);
    console.error(`🛠️ Tools: 21 available (6 Original + 10 ASB + 5 Core)`);
    console.error(`✅ Ready to serve MCP requests`);
  }
}

// Start the server
if (require.main === module) {
  const server = new ClaudeCodeMCPServer();
  server.run().catch((error) => {
    console.error('Fatal server error:', error);
    process.exit(1);
  });
}

module.exports = ClaudeCodeMCPServer;