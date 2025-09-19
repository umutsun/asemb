import * as dotenv from 'dotenv';
import { ClaudeCodeMCPServer } from './claude-code-mcp-server';
import fetch from 'node-fetch';

// .env dosyasını yükle
dotenv.config();

/**
 * Claude Code MCP Sunucusu Demo
 * Bu demo, Claude Code CLI ile MCP sunucusunun nasıl entegre edileceğini gösterir.
 */

interface MCPDemoOptions {
  serverUrl?: string;
  verbose?: boolean;
}

export class ClaudeCodeMCPDemo {
  private serverUrl: string;
  private verbose: boolean;
  private server: ClaudeCodeMCPServer | null = null;

  constructor(options: MCPDemoOptions = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:3000/mcp';
    this.verbose = options.verbose || false;
  }

  /**
   * MCP sunucusunu başlatır
   */
  async startServer(): Promise<void> {
    this.server = new ClaudeCodeMCPServer(3000);
    this.server.start();
    
    // Sunucunun başlamasını bekle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (this.verbose) {
      console.log('✅ MCP Sunucusu başlatıldı');
    }
  }

  /**
   * MCP isteği gönderir
   */
  private async sendMCPRequest(method: string, params?: any): Promise<any> {
    const request = {
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method,
      params
    };

    if (this.verbose) {
      console.log('📤 MCP İsteği:', JSON.stringify(request, null, 2));
    }

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (this.verbose) {
        console.log('📥 MCP Yanıtı:', JSON.stringify(data, null, 2));
      }

      if (data.error) {
        throw new Error(`MCP Hatası: ${data.error.message}`);
      }

      return data.result;
    } catch (error) {
      console.error('❌ MCP İsteği Başarısız:', (error as Error).message);
      throw error;
    }
  }

  /**
   * Sunucu ile bağlantıyı test eder
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.sendMCPRequest('initialize');
      return !!result.protocolVersion;
    } catch (error) {
      return false;
    }
  }

  /**
   * Mevcut araçları listeler
   */
  async listTools(): Promise<any> {
    const result = await this.sendMCPRequest('tools/list');
    return result.tools;
  }

  /**
   * Mevcut kaynakları listeler
   */
  async listResources(): Promise<any> {
    const result = await this.sendMCPRequest('resources/list');
    return result.resources;
  }

  /**
   * Yeni bir agent workflow'u oluşturur
   */
  async createAgentWorkflow(name: string, description: string, tasks: any[]): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'create_agent_workflow',
      arguments: {
        name,
        description,
        tasks
      }
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Workflow'u başlatır
   */
  async startAgentWorkflow(workflowId: string): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'start_agent_workflow',
      arguments: {
        workflowId
      }
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Workflow durumunu kontrol eder
   */
  async getWorkflowStatus(workflowId: string): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'get_workflow_status',
      arguments: {
        workflowId
      }
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Agentları listeler
   */
  async listAgents(): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'list_agents',
      arguments: {}
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Workflow'ları listeler
   */
  async listWorkflows(): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'list_workflows',
      arguments: {}
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Özel agent ekler
   */
  async addCustomAgent(agent: any): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'add_custom_agent',
      arguments: agent
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Tek bir agent task'ı çalıştırır
   */
  async executeAgentTask(agentId: string, taskTitle: string, taskDescription: string, input: any, priority: string = 'medium'): Promise<any> {
    const result = await this.sendMCPRequest('tools/call', {
      name: 'execute_agent_task',
      arguments: {
        agentId,
        taskTitle,
        taskDescription,
        input,
        priority
      }
    });

    return JSON.parse(result.content[0].text);
  }

  /**
   * Kaynak okur
   */
  async readResource(uri: string): Promise<any> {
    const result = await this.sendMCPRequest('resources/read', {
      uri
    });

    return JSON.parse(result.contents[0].text);
  }

  /**
   * Sunucuyu durdurur
   */
  async stopServer(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
      
      if (this.verbose) {
        console.log('🔄 MCP Sunucusu durduruldu');
      }
    }
  }

  /**
   * Tam demo çalıştırır
   */
  async runFullDemo(): Promise<void> {
    console.log('🚀 Claude Code MCP Sunucusu Tam Demo\n');
    console.log('='.repeat(60));

    try {
      // 1. Sunucuyu başlat
      console.log('1. MCP Sunucusu Başlatılıyor...\n');
      await this.startServer();

      // 2. Bağlantıyı test et
      console.log('2. Bağlantı Test Ediliyor...\n');
      const connected = await this.testConnection();
      if (!connected) {
        throw new Error('Sunucuya bağlanılamadı');
      }
      console.log('✅ Bağlantı başarılı!\n');

      // 3. Araçları listele
      console.log('3. Mevcut Araçlar Listeleniyor...\n');
      const tools = await this.listTools();
      console.log('📋 Mevcut Araçlar:');
      tools.forEach((tool: any) => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      console.log('');

      // 4. Kaynakları listele
      console.log('4. Mevcut Kaynaklar Listeleniyor...\n');
      const resources = await this.listResources();
      console.log('📋 Mevcut Kaynaklar:');
      resources.forEach((resource: any) => {
        console.log(`  - ${resource.name}: ${resource.description || 'Açıklama yok'}`);
      });
      console.log('');

      // 5. Agentları listele
      console.log('5. Mevcut Agentlar Listeleniyor...\n');
      const agents = await this.listAgents();
      console.log('🤖 Mevcut Agentlar:');
      agents.agents.forEach((agent: any) => {
        console.log(`  - ${agent.name} (${agent.id}): ${agent.description}`);
      });
      console.log('');

      // 6. React Component oluşturma workflow'u oluştur
      console.log('6. React Component Oluşturma Workflow\'u Oluşturuluyor...\n');
      const reactWorkflow = await this.createAgentWorkflow(
        'React Component Oluşturma',
        'React için bir kullanıcı profili componenti oluşturma workflow\'u',
        [{
          title: 'React Component Oluştur',
          description: 'UserProfile adında bir React componenti oluştur',
          agentId: 'zai-glm45-coder',
          priority: 'high',
          input: {
            command: 'generate-code',
            prompt: 'UserProfile adında bir React componenti oluştur. Props: name: string, email: string, age: number. Component temiz, okunabilir ve TypeScript ile tip güvenli olmalı.',
            language: 'typescript',
            framework: 'react'
          }
        }]
      );
      console.log('✅ Workflow oluşturuldu:', reactWorkflow.workflow.id, '-', reactWorkflow.workflow.name);
      console.log('');

      // 7. Workflow'u başlat
      console.log('7. React Component Workflow\'u Başlatılıyor...\n');
      await this.startAgentWorkflow(reactWorkflow.workflow.id);
      console.log('✅ Workflow başlatıldı!');
      console.log('');

      // 8. Workflow durumunu kontrol et
      console.log('8. React Component Workflow Durumu Kontrol Ediliyor...\n');
      let workflowCompleted = false;
      let workflowResult: any = null;
      
      while (!workflowCompleted) {
        workflowResult = await this.getWorkflowStatus(reactWorkflow.workflow.id);
        
        if (workflowResult.status === 'completed') {
          workflowCompleted = true;
          console.log('✅ Workflow tamamlandı!');
          
          if (workflowResult.tasks && workflowResult.tasks.length > 0) {
            const task = workflowResult.tasks[0];
            console.log('\n📝 Oluşturulan Kod:');
            console.log('```tsx');
            console.log(task.output?.code || 'Kod bulunamadı');
            console.log('```');
            
            if (task.output?.explanation) {
              console.log('\n📖 Açıklama:');
              console.log(task.output.explanation);
            }
          }
        } else if (workflowResult.status === 'failed') {
          throw new Error('Workflow başarısız oldu');
        } else {
          console.log(`⏳ Workflow durumu: ${workflowResult.status}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      console.log('');

      // 9. Express API endpoint oluşturma
      console.log('9. Express API Endpoint Oluşturma...\n');
      const expressResult = await this.executeAgentTask(
        'zai-glm45-coder',
        'Express API Endpoint Oluştur',
        'Kullanıcı listesi için Express API endpoint\'i oluştur',
        {
          command: 'generate-code',
          prompt: '/api/users endpoint\'i için bir Express route oluştur. TypeScript kullan, proper error handling ekle ve response\'u JSON formatında döndür.',
          language: 'typescript',
          framework: 'express'
        }
      );
      
      console.log('✅ Express API endpoint oluşturuldu!');
      console.log('\n📝 Oluşturulan Kod:');
      console.log('```ts');
      console.log(expressResult.result?.code || 'Kod bulunamadı');
      console.log('```');
      
      if (expressResult.result?.explanation) {
        console.log('\n📖 Açıklama:');
        console.log(expressResult.result.explanation);
      }
      console.log('');

      // 10. Kaynakları oku
      console.log('10. Kaynaklar Okunuyor...\n');
      const agentsResource = await this.readResource('mcp://agents/list');
      console.log('📄 Agent Kaynağı:');
      console.log(JSON.stringify(agentsResource, null, 2));
      console.log('');

      // 11. Tüm workflow'ları listele
      console.log('11. Tüm Workflow\'lar Listeleniyor...\n');
      const workflows = await this.listWorkflows();
      console.log('📋 Mevcut Workflow\'lar:');
      workflows.workflows.forEach((workflow: any) => {
        console.log(`  - ${workflow.name} (${workflow.id}): ${workflow.status}`);
      });
      console.log('');

      console.log('🎉 Demo başarıyla tamamlandı!');

    } catch (error) {
      console.error('❌ Demo sırasında hata oluştu:', (error as Error).message);
    } finally {
      // Sunucuyu durdur
      await this.stopServer();
    }
  }

  /**
   * Interactive CLI modu
   */
  async runInteractive(): Promise<void> {
    console.log('🤖 Claude Code MCP Sunucusu - Interactive CLI');
    console.log('📝 Çıkmak için "exit" yazın\n');

    // Sunucuyu başlat
    await this.startServer();

    // Bağlantıyı test et
    const connected = await this.testConnection();
    if (!connected) {
      throw new Error('Sunucuya bağlanılamadı');
    }

    while (true) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const command = await new Promise<string>((resolve) => {
        rl.question('MCP> ', (answer: string) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (command.toLowerCase() === 'exit') {
        await this.stopServer();
        console.log('👋 Görüşürüz!');
        break;
      }

      if (!command) {
        continue;
      }

      try {
        await this.processInteractiveCommand(command);
      } catch (error) {
        console.error(`❌ Hata: ${(error as Error).message}\n`);
      }
    }
  }

  /**
   * Interactive komutları işler
   */
  private async processInteractiveCommand(command: string): Promise<void> {
    const parts = command.split(' ');
    const action = parts[0].toLowerCase();

    switch (action) {
      case 'list-tools':
        const tools = await this.listTools();
        console.log('📋 Mevcut Araçlar:');
        tools.forEach((tool: any) => {
          console.log(`  - ${tool.name}: ${tool.description}`);
        });
        console.log('');
        break;

      case 'list-agents':
        const agents = await this.listAgents();
        console.log('🤖 Mevcut Agentlar:');
        agents.agents.forEach((agent: any) => {
          console.log(`  - ${agent.name} (${agent.id}): ${agent.description}`);
        });
        console.log('');
        break;

      case 'list-workflows':
        const workflows = await this.listWorkflows();
        console.log('📋 Mevcut Workflow\'lar:');
        workflows.workflows.forEach((workflow: any) => {
          console.log(`  - ${workflow.name} (${workflow.id}): ${workflow.status}`);
        });
        console.log('');
        break;

      case 'create-workflow':
        console.log('⚠️ Bu komut şu anda interactive modda desteklenmiyor.');
        console.log('Lütfen runFullDemo() metodunu kullanın.\n');
        break;

      case 'execute-task':
        if (parts.length < 4) {
          console.log('❌ Eksik parametreler. Kullanım: execute-task <agentId> <title> <description>');
          break;
        }
        const agentId = parts[1];
        const title = parts[2];
        const description = parts.slice(3).join(' ');
        
        const result = await this.executeAgentTask(
          agentId,
          title,
          description,
          {
            command: 'generate-code',
            prompt: description,
            language: 'typescript'
          }
        );
        
        console.log('✅ Task tamamlandı!');
        console.log('📝 Sonuç:');
        console.log(JSON.stringify(result, null, 2));
        console.log('');
        break;

      case 'help':
        this.showInteractiveHelp();
        break;

      default:
        console.log('❌ Bilinmeyen komut. "help" yazarak yardım alabilirsiniz.\n');
    }
  }

  /**
   * Interactive yardım mesajını gösterir
   */
  private showInteractiveHelp(): void {
    console.log('📖 Interactive Komutlar:');
    console.log('  list-tools        - Mevcut MCP araçlarını listeler');
    console.log('  list-agents       - Mevcut agentları listeler');
    console.log('  list-workflows    - Mevcut workflow\'ları listeler');
    console.log('  execute-task <agentId> <title> <description> - Tek bir task çalıştırır');
    console.log('  help              - Bu yardım mesajını gösterir');
    console.log('  exit              - Programdan çıkar');
    console.log('');
  }
}

// Doğrudan kullanım için
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive')) {
    const demo = new ClaudeCodeMCPDemo({ verbose: true });
    demo.runInteractive().catch(console.error);
  } else {
    const demo = new ClaudeCodeMCPDemo({ verbose: true });
    demo.runFullDemo().catch(console.error);
  }
}