#!/usr/bin/env node

/**
 * Codex Agent MCP Server
 */

const ASBSharedMemory = require('../shared/asb-memory');

class CodexMCPServer {
  constructor() {
    this.agentName = 'codex';
    this.memory = null;
  }

  async initialize() {
    this.memory = new ASBSharedMemory('alice-semantic-bridge');
    await this.memory.connect();
    await this.memory.registerAgent(this.agentName, [
      'code-generation',
      'template-creation',
      'refactoring',
      'automation-scripts'
    ]);
    console.error(`[MCP] ${this.agentName} agent connected`);
  }

  async handleRequest(request) {
    const { method, params, id } = request;
    
    try {
      let result = {};
      
      switch (method) {
        case 'initialize':
          await this.initialize();
          result = {
            protocolVersion: '1.0',
            capabilities: {
              tools: ['generate_code', 'create_template', 'refactor']
            }
          };
          break;
          
        case 'tools/list':
          result = {
            tools: [
              {
                name: 'generate_code',
                description: 'Generate code from description',
                parameters: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    language: { type: 'string' }
                  },
                  required: ['description']
                }
              },
              {
                name: 'create_template',
                description: 'Create code template',
                parameters: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    name: { type: 'string' }
                  },
                  required: ['type', 'name']
                }
              },
              {
                name: 'refactor',
                description: 'Refactor code',
                parameters: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    target: { type: 'string' }
                  },
                  required: ['code']
                }
              }
            ]
          };
          break;
          
        case 'tools/call':
          if (!this.memory) await this.initialize();
          
          const { name, arguments: args } = params;
          
          switch (name) {
            case 'generate_code':
              await this.memory.queueTask('code-generation', {
                description: args.description,
                language: args.language || 'javascript',
                requestedBy: this.agentName
              });
              result = { status: 'generation queued' };
              break;
              
            case 'create_template':
              await this.memory.setContext(`template:${args.name}`, {
                type: args.type,
                name: args.name,
                createdBy: this.agentName,
                timestamp: new Date().toISOString()
              });
              result = { status: 'template created', name: args.name };
              break;
              
            case 'refactor':
              await this.memory.queueTask('refactoring', {
                code: args.code,
                target: args.target || 'optimize',
                requestedBy: this.agentName
              });
              result = { status: 'refactoring queued' };
              break;
              
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
          break;
          
        default:
          throw new Error(`Unknown method: ${method}`);
      }
      
      return {
        jsonrpc: '2.0',
        result,
        id
      };
      
    } catch (error) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message
        },
        id
      };
    }
  }

  async start() {
    console.error('[MCP] Codex MCP Server starting...');
    
    let buffer = '';
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            const response = await this.handleRequest(request);
            process.stdout.write(JSON.stringify(response) + '\n');
          } catch (error) {
            console.error('[MCP] Error:', error);
          }
        }
      }
    });
    
    process.stdin.on('end', () => {
      if (this.memory) this.memory.disconnect();
      process.exit(0);
    });
  }
}

// Start server
const server = new CodexMCPServer();
server.start();
