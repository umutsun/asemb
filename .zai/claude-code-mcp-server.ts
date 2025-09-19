import * as dotenv from 'dotenv';
import { MultiAgentOrchestrator, AgentConfig, AgentWorkflow } from './multi-agent-orchestrator';
import * as http from 'http';
import * as url from 'url';

// .env dosyasını yükle
dotenv.config();

/**
 * Claude Code CLI için MCP Sunucusu
 * Bu sunucu, multi-agent orkestrasyon sistemini Claude Code CLI üzerinden kullanılabilir hale getirir.
 */

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export class ClaudeCodeMCPServer {
  private orchestrator: MultiAgentOrchestrator;
  private server: http.Server;
  private port: number;
  private tools: MCPTool[];
  private resources: MCPResource[];

  constructor(port: number = 3000) {
    this.orchestrator = new MultiAgentOrchestrator();
    this.port = port;
    this.server = http.createServer(this.handleRequest.bind(this));
    this.tools = this.initializeTools();
    this.resources = this.initializeResources();
  }

  /**
   * MCP araçlarını başlatır
   */
  private initializeTools(): MCPTool[] {
    return [
      {
        name: 'create_agent_workflow',
        description: 'Yeni bir multi-agent workflow\'u oluşturur',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Workflow adı'
            },
            description: {
              type: 'string',
              description: 'Workflow açıklaması'
            },
            tasks: {
              type: 'array',
              description: 'Workflow task\'ları',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Task başlığı'
                  },
                  description: {
                    type: 'string',
                    description: 'Task açıklaması'
                  },
                  agentId: {
                    type: 'string',
                    description: 'Çalıştırılacak agent ID\'si'
                  },
                  priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'critical'],
                    description: 'Task önceliği'
                  },
                  input: {
                    type: 'object',
                    description: 'Task girdisi'
                  }
                },
                required: ['title', 'description', 'agentId', 'input']
              }
            }
          },
          required: ['name', 'description', 'tasks']
        }
      },
      {
        name: 'start_agent_workflow',
        description: 'Belirtilen workflow\'u başlatır',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'Başlatılacak workflow ID\'si'
            }
          },
          required: ['workflowId']
        }
      },
      {
        name: 'get_workflow_status',
        description: 'Workflow durumunu getirir',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'Workflow ID\'si'
            }
          },
          required: ['workflowId']
        }
      },
      {
        name: 'list_agents',
        description: 'Mevcut tüm agentları listeler',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_workflows',
        description: 'Mevcut tüm workflow\'ları listeler',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'add_custom_agent',
        description: 'Özel bir agent ekler',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Agent ID\'si'
            },
            name: {
              type: 'string',
              description: 'Agent adı'
            },
            description: {
              type: 'string',
              description: 'Agent açıklaması'
            },
            model: {
              type: 'string',
              description: 'Kullanılacak model'
            },
            systemPrompt: {
              type: 'string',
              description: 'Agent sistem prompt\'u'
            },
            maxTokens: {
              type: 'number',
              description: 'Maksimum token sayısı'
            },
            temperature: {
              type: 'number',
              description: 'Temperature değeri'
            }
          },
          required: ['id', 'name', 'description', 'model', 'systemPrompt']
        }
      },
      {
        name: 'execute_agent_task',
        description: 'Belirtilen agent ile tek bir task çalıştırır',
        inputSchema: {
          type: 'object',
          properties: {
            agentId: {
              type: 'string',
              description: 'Agent ID\'si'
            },
            taskTitle: {
              type: 'string',
              description: 'Task başlığı'
            },
            taskDescription: {
              type: 'string',
              description: 'Task açıklaması'
            },
            input: {
              type: 'object',
              description: 'Task girdisi'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Task önceliği'
            }
          },
          required: ['agentId', 'taskTitle', 'taskDescription', 'input']
        }
      }
    ];
  }

  /**
   * MCP kaynaklarını başlatır
   */
  private initializeResources(): MCPResource[] {
    return [
      {
        uri: 'mcp://agents/list',
        name: 'Agent Listesi',
        description: 'Mevcut tüm agentların listesi',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://workflows/list',
        name: 'Workflow Listesi',
        description: 'Mevcut tüm workflow\'ların listesi',
        mimeType: 'application/json'
      },
      {
        uri: 'mcp://workflows/active',
        name: 'Aktif Workflow\'lar',
        description: 'Şu anda çalışan workflow\'ların listesi',
        mimeType: 'application/json'
      }
    ];
  }

  /**
   * HTTP isteklerini işler
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS başlıkları
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/mcp') {
      try {
        const body = await this.getRequestBody(req);
        const mcpRequest: MCPRequest = JSON.parse(body);
        const response = await this.handleMCPRequest(mcpRequest);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: 'error',
          error: {
            code: -32603,
            message: 'Internal error',
            data: (error as Error).message
          }
        };
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  /**
   * İstek gövdesini okur
   */
  private async getRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        resolve(body);
      });
      
      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * MCP isteğini işler
   */
  private async handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id);
        case 'tools/list':
          return this.handleToolsList(id);
        case 'tools/call':
          return this.handleToolCall(id, params);
        case 'resources/list':
          return this.handleResourcesList(id);
        case 'resources/read':
          return this.handleResourceRead(id, params);
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: (error as Error).message
        }
      };
    }
  }

  /**
   * Initialize isteğini işler
   */
  private handleInitialize(id: string | number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: 'Claude Code MCP Server',
          version: '1.0.0'
        }
      }
    };
  }

  /**
   * Tools list isteğini işler
   */
  private handleToolsList(id: string | number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: this.tools
      }
    };
  }

  /**
   * Tool call isteğini işler
   */
  private async handleToolCall(id: string | number, params: any): Promise<MCPResponse> {
    const { name, arguments: args } = params;

    try {
      let result;

      switch (name) {
        case 'create_agent_workflow':
          result = await this.createAgentWorkflow(args);
          break;
        case 'start_agent_workflow':
          result = await this.startAgentWorkflow(args);
          break;
        case 'get_workflow_status':
          result = await this.getWorkflowStatus(args);
          break;
        case 'list_agents':
          result = await this.listAgents();
          break;
        case 'list_workflows':
          result = await this.listWorkflows();
          break;
        case 'add_custom_agent':
          result = await this.addCustomAgent(args);
          break;
        case 'execute_agent_task':
          result = await this.executeAgentTask(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid params',
          data: (error as Error).message
        }
      };
    }
  }

  /**
   * Resources list isteğini işler
   */
  private handleResourcesList(id: string | number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resources: this.resources
      }
    };
  }

  /**
   * Resource read isteğini işler
   */
  private async handleResourceRead(id: string | number, params: any): Promise<MCPResponse> {
    const { uri } = params;

    try {
      let content;

      switch (uri) {
        case 'mcp://agents/list':
          content = await this.listAgents();
          break;
        case 'mcp://workflows/list':
          content = await this.listWorkflows();
          break;
        case 'mcp://workflows/active':
          content = await this.getActiveWorkflows();
          break;
        default:
          throw new Error(`Unknown resource: ${uri}`);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Invalid params',
          data: (error as Error).message
        }
      };
    }
  }

  /**
   * Agent workflow oluşturur
   */
  private async createAgentWorkflow(args: any): Promise<any> {
    const { name, description, tasks } = args;
    
    const workflow = this.orchestrator.createWorkflow(name, description, tasks);
    
    return {
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        taskCount: workflow.tasks.length
      }
    };
  }

  /**
   * Agent workflow başlatır
   */
  private async startAgentWorkflow(args: any): Promise<any> {
    const { workflowId } = args;
    
    await this.orchestrator.startWorkflow(workflowId);
    
    return {
      success: true,
      message: `Workflow ${workflowId} başlatıldı`
    };
  }

  /**
   * Workflow durumunu getirir
   */
  private async getWorkflowStatus(args: any): Promise<any> {
    const { workflowId } = args;
    
    const workflow = this.orchestrator.getWorkflowStatus(workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow bulunamadı: ${workflowId}`);
    }
    
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      status: workflow.status,
      createdAt: workflow.createdAt,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      tasks: workflow.tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        error: task.error
      }))
    };
  }

  /**
   * Agentları listeler
   */
  private async listAgents(): Promise<any> {
    const agents = this.orchestrator.getAllAgents();
    
    return {
      agents: agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model: agent.model,
        capabilities: agent.capabilities
      }))
    };
  }

  /**
   * Workflow'ları listeler
   */
  private async listWorkflows(): Promise<any> {
    const workflows = this.orchestrator.getAllWorkflows();
    
    return {
      workflows: workflows.map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        createdAt: workflow.createdAt,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        taskCount: workflow.tasks.length
      }))
    };
  }

  /**
   * Aktif workflow'ları getirir
   */
  private async getActiveWorkflows(): Promise<any> {
    const workflows = this.orchestrator.getAllWorkflows();
    const activeWorkflows = workflows.filter(w => w.status === 'in_progress');
    
    return {
      workflows: activeWorkflows.map(workflow => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        createdAt: workflow.createdAt,
        startedAt: workflow.startedAt,
        taskCount: workflow.tasks.length
      }))
    };
  }

  /**
   * Özel agent ekler
   */
  private async addCustomAgent(args: any): Promise<any> {
    const { id, name, description, model, systemPrompt, maxTokens = 1000, temperature = 0.3 } = args;
    
    const agent: AgentConfig = {
      id,
      name,
      description,
      model,
      capabilities: [],
      systemPrompt,
      maxTokens,
      temperature
    };
    
    this.orchestrator.addAgent(agent);
    
    return {
      success: true,
      message: `Agent ${id} eklendi`,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model: agent.model
      }
    };
  }

  /**
   * Agent task'ı çalıştırır
   */
  private async executeAgentTask(args: any): Promise<any> {
    const { agentId, taskTitle, taskDescription, input, priority = 'medium' } = args;
    
    const workflow = this.orchestrator.createWorkflow(
      'Single Task Workflow',
      `Tek task çalıştırma: ${taskTitle}`,
      [{
        title: taskTitle,
        description: taskDescription,
        agentId,
        priority,
        input
      }]
    );
    
    await this.orchestrator.startWorkflow(workflow.id);
    
    // Task'ın tamamlanmasını bekle
    let completed = false;
    let result: any = null;
    
    while (!completed) {
      const status = this.orchestrator.getWorkflowStatus(workflow.id);
      if (status && status.tasks.length > 0) {
        const task = status.tasks[0];
        if (task.status === 'completed') {
          result = task.output;
          completed = true;
        } else if (task.status === 'failed') {
          throw new Error(`Task başarısız: ${task.error}`);
        }
      }
      
      if (!completed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return {
      success: true,
      result
    };
  }

  /**
   * Sunucuyu başlatır
   */
  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`🚀 Claude Code MCP Server http://localhost:${this.port}/mcp adresinde başlatıldı`);
    });
  }

  /**
   * Sunucuyu durdurur
   */
  public stop(): void {
    this.server.close(() => {
      console.log('🔄 Claude Code MCP Server durduruldu');
    });
  }
}

// Doğrudan kullanım için
if (require.main === module) {
  const server = new ClaudeCodeMCPServer();
  server.start();
}