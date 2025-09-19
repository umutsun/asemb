import * as dotenv from 'dotenv';
import { ZAIClient } from './zai-integration';
import { ClaudeCodeZAI, CodeGenerationRequest, CodeGenerationResponse } from './claude-code-zai';
import * as fs from 'fs';
import * as path from 'path';

// .env dosyasını yükle
dotenv.config();

export interface AgentCapability {
  name: string;
  description: string;
  category: 'coding' | 'analysis' | 'testing' | 'documentation' | 'deployment';
  languages: string[];
  frameworks: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model: string;
  capabilities: AgentCapability[];
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  agentId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  input: any;
  output?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  tasks: AgentTask[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class MultiAgentOrchestrator {
  private agents: Map<string, AgentConfig> = new Map();
  private workflows: Map<string, AgentWorkflow> = new Map();
  private zaiClient: ZAIClient;
  private claudeCodeZAI: ClaudeCodeZAI;
  private taskQueue: AgentTask[] = [];
  private activeTasks: Map<string, Promise<void>> = new Map();
  private maxConcurrentTasks: number = 3;

  constructor() {
    this.zaiClient = new ZAIClient();
    this.claudeCodeZAI = new ClaudeCodeZAI();
    this.initializeDefaultAgents();
  }

  /**
   * Varsayılan agentları başlatır
   */
  private initializeDefaultAgents(): void {
    // Z.AI GLM-4.5 Coder Agent
    const zaiCoderAgent: AgentConfig = {
      id: 'zai-glm45-coder',
      name: 'Z.AI GLM-4.5 Coder',
      description: 'Z.AI GLM-4.5 modelini kullanarak kod oluşturan, düzenleyen ve analiz eden bir agent',
      model: 'glm-4.5',
      capabilities: [
        {
          name: 'code_generation',
          description: 'Yeni kod oluşturma',
          category: 'coding',
          languages: ['typescript', 'javascript', 'python', 'java', 'c#', 'go', 'rust'],
          frameworks: ['react', 'express', 'nextjs', 'django', 'flask', 'spring']
        },
        {
          name: 'code_refactoring',
          description: 'Mevcut kodu yeniden yapılandırma',
          category: 'coding',
          languages: ['typescript', 'javascript', 'python', 'java', 'c#'],
          frameworks: ['react', 'express', 'nextjs', 'django', 'flask']
        },
        {
          name: 'debugging',
          description: 'Hata ayıklama ve düzeltme',
          category: 'coding',
          languages: ['typescript', 'javascript', 'python', 'java', 'c#'],
          frameworks: ['react', 'express', 'nextjs', 'django', 'flask']
        }
      ],
      systemPrompt: `Sen Claude Code CLI için Z.AI GLM-4.5 Coder agentsın. 
      Kullanıcıların kodlama ihtiyaçlarını karşılamak için tasarlandın.
      Temiz, okunabilir ve iyi yapılandırılmış kod üret.
      En iyi pratikleri takip et ve uygun yorumlar ekle.
      Hata yönetimi için uygun yapılar kullan.`,
      maxTokens: 2000,
      temperature: 0.3
    };

    // Code Reviewer Agent
    const codeReviewerAgent: AgentConfig = {
      id: 'code-reviewer',
      name: 'Code Reviewer',
      description: 'Kod incelemesi yapan ve iyileştirme önerileri sunan bir agent',
      model: 'glm-4.5',
      capabilities: [
        {
          name: 'code_review',
          description: 'Kod incelemesi ve kalite analizi',
          category: 'analysis',
          languages: ['typescript', 'javascript', 'python', 'java', 'c#'],
          frameworks: ['react', 'express', 'nextjs', 'django', 'flask']
        },
        {
          name: 'security_analysis',
          description: 'Güvenlik açığı analizi',
          category: 'analysis',
          languages: ['typescript', 'javascript', 'python', 'java', 'c#'],
          frameworks: ['react', 'express', 'nextjs', 'django', 'flask']
        }
      ],
      systemPrompt: `Sen Claude Code CLI için Code Reviewer agentsın.
      Kodun kalitesini analiz et, güvenlik açıklarını tespit et ve iyileştirme önerileri sun.
      Kodun okunabilirliğini, performansını ve güvenliğini değerlendir.
      En iyi pratiklere uygunluk kontrolü yap.`,
      maxTokens: 1500,
      temperature: 0.2
    };

    // Test Generator Agent
    const testGeneratorAgent: AgentConfig = {
      id: 'test-generator',
      name: 'Test Generator',
      description: 'Kod için test senaryoları oluşturan bir agent',
      model: 'glm-4.5',
      capabilities: [
        {
          name: 'unit_test_generation',
          description: 'Birim testleri oluşturma',
          category: 'testing',
          languages: ['typescript', 'javascript', 'python', 'java'],
          frameworks: ['jest', 'mocha', 'pytest', 'junit']
        },
        {
          name: 'integration_test_generation',
          description: 'Entegrasyon testleri oluşturma',
          category: 'testing',
          languages: ['typescript', 'javascript', 'python', 'java'],
          frameworks: ['jest', 'mocha', 'pytest', 'junit']
        }
      ],
      systemPrompt: `Sen Claude Code CLI için Test Generator agentsın.
      Verilen kod için kapsamlı test senaryoları oluştur.
      Birim testleri, entegrasyon testleri ve edge case'ler için testler yaz.
      Testlerin kod kapsamını maksimize et.`,
      maxTokens: 2000,
      temperature: 0.3
    };

    // Documentation Generator Agent
    const docGeneratorAgent: AgentConfig = {
      id: 'doc-generator',
      name: 'Documentation Generator',
      description: 'Kod için dokümantasyon oluşturan bir agent',
      model: 'glm-4.5',
      capabilities: [
        {
          name: 'api_documentation',
          description: 'API dokümantasyonu oluşturma',
          category: 'documentation',
          languages: ['typescript', 'javascript', 'python', 'java'],
          frameworks: ['express', 'nextjs', 'django', 'flask']
        },
        {
          name: 'code_documentation',
          description: 'Kod dokümantasyonu oluşturma',
          category: 'documentation',
          languages: ['typescript', 'javascript', 'python', 'java', 'c#'],
          frameworks: ['react', 'express', 'nextjs', 'django', 'flask']
        }
      ],
      systemPrompt: `Sen Claude Code CLI için Documentation Generator agentsın.
      Kod için kapsamlı dokümantasyon oluştur.
      API dokümantasyonu, kod yorumları ve kullanım kılavuzları hazırla.
      Dokümantasyonun açık, anlaşılır ve güncel olmasını sağla.`,
      maxTokens: 1500,
      temperature: 0.3
    };

    // Agentları kaydet
    this.agents.set(zaiCoderAgent.id, zaiCoderAgent);
    this.agents.set(codeReviewerAgent.id, codeReviewerAgent);
    this.agents.set(testGeneratorAgent.id, testGeneratorAgent);
    this.agents.set(docGeneratorAgent.id, docGeneratorAgent);
  }

  /**
   * Yeni bir agent ekler
   */
  addAgent(agent: AgentConfig): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Agent bilgilerini döndürür
   */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Tüm agentları döndürür
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Yeni bir workflow oluşturur
   */
  createWorkflow(name: string, description: string, tasks: Omit<AgentTask, 'id' | 'status' | 'createdAt'>[]): AgentWorkflow {
    const workflowId = this.generateId();
    const workflowTasks: AgentTask[] = tasks.map(task => ({
      ...task,
      id: this.generateId(),
      status: 'pending' as const,
      createdAt: new Date()
    }));

    const workflow: AgentWorkflow = {
      id: workflowId,
      name,
      description,
      tasks: workflowTasks,
      status: 'pending',
      createdAt: new Date()
    };

    this.workflows.set(workflowId, workflow);
    return workflow;
  }

  /**
   * Workflow'u başlatır
   */
  async startWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow bulunamadı: ${workflowId}`);
    }

    workflow.status = 'in_progress';
    workflow.startedAt = new Date();

    // Tüm taskları kuyruğa ekle
    workflow.tasks.forEach(task => {
      this.taskQueue.push(task);
    });

    // Task processing'i başlat
    this.processTaskQueue();
  }

  /**
   * Task kuyruğunu işler
   */
  private async processTaskQueue(): Promise<void> {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.maxConcurrentTasks) {
      const task = this.taskQueue.shift();
      if (!task) continue;

      const taskPromise = this.executeTask(task);
      this.activeTasks.set(task.id, taskPromise);

      taskPromise.finally(() => {
        this.activeTasks.delete(task.id);
        this.processTaskQueue();
      });
    }
  }

  /**
   * Tek bir task'ı çalıştırır
   */
  private async executeTask(task: AgentTask): Promise<void> {
    const agent = this.agents.get(task.agentId);
    if (!agent) {
      task.status = 'failed';
      task.error = `Agent bulunamadı: ${task.agentId}`;
      return;
    }

    task.status = 'in_progress';
    task.startedAt = new Date();

    try {
      // Agent'a göre task'ı çalıştır
      const result = await this.runAgentTask(agent, task);
      
      task.output = result;
      task.status = 'completed';
      task.completedAt = new Date();

      console.log(`✅ Task tamamlandı: ${task.title} (${task.id})`);
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      task.completedAt = new Date();

      console.error(`❌ Task başarısız: ${task.title} (${task.id}) - ${task.error}`);
    }
  }

  /**
   * Agent task'ını çalıştırır
   */
  private async runAgentTask(agent: AgentConfig, task: AgentTask): Promise<any> {
    const prompt = this.createTaskPrompt(agent, task);

    if (agent.id === 'zai-glm45-coder') {
      const request: CodeGenerationRequest = {
        prompt,
        language: this.detectLanguage(task.input),
        framework: this.detectFramework(task.input),
        maxTokens: agent.maxTokens,
        temperature: agent.temperature
      };

      const response = await this.claudeCodeZAI.generateCode(request);
      return response;
    } else {
      // Diğer agentlar için genel Z.AI kullanımı
      const response = await this.zaiClient.generateText({
        prompt,
        maxTokens: agent.maxTokens,
        temperature: agent.temperature,
        model: agent.model
      });

      return response.choices[0]?.message?.content;
    }
  }

  /**
   * Task için prompt oluşturur
   */
  private createTaskPrompt(agent: AgentConfig, task: AgentTask): string {
    let prompt = `${agent.systemPrompt}\n\n`;
    prompt += `Task: ${task.title}\n`;
    prompt += `Açıklama: ${task.description}\n`;
    prompt += `Öncelik: ${task.priority}\n`;
    prompt += `Girdi:\n${JSON.stringify(task.input, null, 2)}\n\n`;
    prompt += `Lütfen bu task'ı yerine getir ve sonucu döndür.`;

    return prompt;
  }

  /**
   * Girdiden programlama dilini tespit eder
   */
  private detectLanguage(input: any): string {
    if (typeof input === 'string') {
      if (input.includes('function') || input.includes('const') || input.includes('let')) {
        return input.includes('interface') || input.includes('type') ? 'typescript' : 'javascript';
      } else if (input.includes('def') || input.includes('import')) {
        return 'python';
      } else if (input.includes('public') || input.includes('private') || input.includes('class')) {
        return 'java';
      }
    }
    return 'typescript'; // Varsayılan
  }

  /**
   * Girdiden framework'ü tespit eder
   */
  private detectFramework(input: any): string | undefined {
    if (typeof input === 'string') {
      if (input.includes('React') || input.includes('useState') || input.includes('useEffect')) {
        return 'react';
      } else if (input.includes('express') || input.includes('app.get') || input.includes('app.post')) {
        return 'express';
      } else if (input.includes('Next') || input.includes('getServerSideProps')) {
        return 'nextjs';
      } else if (input.includes('django') || input.includes('models.Model')) {
        return 'django';
      } else if (input.includes('flask') || input.includes('Flask')) {
        return 'flask';
      }
    }
    return undefined;
  }

  /**
   * Workflow durumunu döndürür
   */
  getWorkflowStatus(workflowId: string): AgentWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Tüm workflow'ları döndürür
   */
  getAllWorkflows(): AgentWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Rastgele ID oluşturur
   */
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Orchestrator'u kapatır
   */
  async shutdown(): Promise<void> {
    // Aktif task'ların bitmesini bekle
    await Promise.all(this.activeTasks.values());
    console.log('🔄 Multi-Agent Orchestrator kapatıldı');
  }
}

// CLI için yardımcı fonksiyonlar
export async function runMultiAgentOrchestrator() {
  const orchestrator = new MultiAgentOrchestrator();
  
  console.log('🤖 Multi-Agent Orchestrator - Claude Code CLI Entegrasyonu');
  console.log('📝 Çıkmak için "exit" yazın\n');

  while (true) {
    console.log('📋 Mevcut Agentlar:');
    orchestrator.getAllAgents().forEach(agent => {
      console.log(`  - ${agent.name} (${agent.id})`);
    });
    console.log('');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const command = await new Promise<string>((resolve) => {
      rl.question('Orchestrator> ', (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (command.toLowerCase() === 'exit') {
      await orchestrator.shutdown();
      console.log('👋 Görüşürüz!');
      break;
    }

    if (!command) {
      continue;
    }

    try {
      await processCommand(orchestrator, command);
    } catch (error) {
      console.error(`❌ Hata: ${(error as Error).message}\n`);
    }
  }
}

async function processCommand(orchestrator: MultiAgentOrchestrator, command: string): Promise<void> {
  const parts = command.split(' ');
  const action = parts[0].toLowerCase();

  switch (action) {
    case 'create-workflow':
      await createWorkflowInteractive(orchestrator);
      break;
    case 'list-agents':
      listAgents(orchestrator);
      break;
    case 'list-workflows':
      listWorkflows(orchestrator);
      break;
    case 'start-workflow':
      const workflowId = parts[1];
      if (!workflowId) {
        console.log('❌ Workflow ID gerekli');
        return;
      }
      await orchestrator.startWorkflow(workflowId);
      break;
    case 'help':
      showHelp();
      break;
    default:
      console.log('❌ Bilinmeyen komut. "help" yazarak yardım alabilirsiniz.');
  }
}

async function createWorkflowInteractive(orchestrator: MultiAgentOrchestrator): Promise<void> {
  const readline = require('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const name = await new Promise<string>((resolve) => {
    rl.question('Workflow adı: ', (answer: string) => {
      resolve(answer.trim());
    });
  });

  const description = await new Promise<string>((resolve) => {
    rl.question('Workflow açıklaması: ', (answer: string) => {
      resolve(answer.trim());
    });
  });

  console.log('📋 Mevcut Agentlar:');
  orchestrator.getAllAgents().forEach(agent => {
    console.log(`  - ${agent.name} (${agent.id})`);
  });

  const agentId = await new Promise<string>((resolve) => {
    rl.question('Agent ID: ', (answer: string) => {
      resolve(answer.trim());
    });
  });

  const taskTitle = await new Promise<string>((resolve) => {
    rl.question('Task başlığı: ', (answer: string) => {
      resolve(answer.trim());
    });
  });

  const taskDescription = await new Promise<string>((resolve) => {
    rl.question('Task açıklaması: ', (answer: string) => {
      resolve(answer.trim());
    });
  });

  rl.close();

  const workflow = orchestrator.createWorkflow(name, description, [{
    title: taskTitle,
    description: taskDescription,
    agentId,
    priority: 'medium',
    input: { command: 'generate-code', prompt: taskDescription }
  }]);

  console.log(`✅ Workflow oluşturuldu: ${workflow.id} - ${workflow.name}`);
}

function listAgents(orchestrator: MultiAgentOrchestrator): void {
  console.log('📋 Mevcut Agentlar:');
  orchestrator.getAllAgents().forEach(agent => {
    console.log(`\n🤖 ${agent.name} (${agent.id})`);
    console.log(`   Açıklama: ${agent.description}`);
    console.log(`   Model: ${agent.model}`);
    console.log(`   Yetenekler:`);
    agent.capabilities.forEach(capability => {
      console.log(`     - ${capability.name}: ${capability.description}`);
    });
  });
  console.log('');
}

function listWorkflows(orchestrator: MultiAgentOrchestrator): void {
  console.log('📋 Mevcut Workflow\'lar:');
  orchestrator.getAllWorkflows().forEach(workflow => {
    console.log(`\n🔄 ${workflow.name} (${workflow.id})`);
    console.log(`   Açıklama: ${workflow.description}`);
    console.log(`   Durum: ${workflow.status}`);
    console.log(`   Oluşturulma: ${workflow.createdAt}`);
    if (workflow.startedAt) {
      console.log(`   Başlangıç: ${workflow.startedAt}`);
    }
    if (workflow.completedAt) {
      console.log(`   Tamamlanma: ${workflow.completedAt}`);
    }
    console.log(`   Task sayısı: ${workflow.tasks.length}`);
  });
  console.log('');
}

function showHelp(): void {
  console.log('📖 Komutlar:');
  console.log('  create-workflow   - Yeni bir workflow oluşturur');
  console.log('  list-agents       - Mevcut agentları listeler');
  console.log('  list-workflows    - Mevcut workflow\'ları listeler');
  console.log('  start-workflow ID - Belirtilen workflow\'u başlatır');
  console.log('  help              - Bu yardım mesajını gösterir');
  console.log('  exit              - Programdan çıkar');
  console.log('');
}

// Doğrudan kullanım için
if (require.main === module) {
  runMultiAgentOrchestrator().catch(console.error);
}