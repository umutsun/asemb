import { ClaudeCodeZAI, CodeGenerationRequest, CodeGenerationResponse } from './claude-code-zai';

/**
 * Z.AI GLM-4.5 Agent Örnek Kullanımı
 * Bu script, awesome-claude-code-agents deposundaki zai-glm45-coder ajanını
 * kullanarak Z.AI API'si üzerinden GLM-4.5 modeliyle kod oluşturur.
 */

class ZAIGLM45Agent {
  private client: ClaudeCodeZAI;
  
  constructor(apiKey?: string) {
    this.client = new ClaudeCodeZAI(apiKey);
  }
  
  /**
   * Z.AI GLM-4.5 modelini kullanarak kod oluşturur
   */
  async generateCodeWithAgent(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    console.log('🤖 Z.AI GLM-4.5 Agent kod oluşturuyor...');
    console.log(`📝 Dil: ${request.language || 'typescript'}`);
    console.log(`🔧 Framework: ${request.framework || 'belirtilmemiş'}`);
    console.log(`💡 Prompt: ${request.prompt}\n`);
    
    try {
      const response = await this.client.generateCode(request);
      
      console.log('✅ Kod başarıyla oluşturuldu!\n');
      
      return response;
    } catch (error) {
      console.error(`❌ Kod oluşturma hatası: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * React component oluşturma örneği
   */
  async generateReactComponent(componentName: string, props: string[]): Promise<CodeGenerationResponse> {
    const propsDescription = props.length > 0 
      ? `Props: ${props.join(', ')}`
      : 'Props yok';
    
    const request: CodeGenerationRequest = {
      prompt: `${componentName} adında bir React componenti oluştur. ${propsDescription}. Component temiz, okunabilir ve TypeScript ile tip güvenli olmalı.`,
      language: 'typescript',
      framework: 'react',
      maxTokens: 1000,
      temperature: 0.3
    };
    
    return this.generateCodeWithAgent(request);
  }
  
  /**
   * Express API endpoint oluşturma örneği
   */
  async generateExpressAPI(endpoint: string, method: string): Promise<CodeGenerationResponse> {
    const request: CodeGenerationRequest = {
      prompt: `${method.toUpperCase()} ${endpoint} için bir Express API endpoint'i oluştur. TypeScript kullan, proper error handling ekle ve response'u JSON formatında döndür.`,
      language: 'typescript',
      framework: 'express',
      maxTokens: 800,
      temperature: 0.3
    };
    
    return this.generateCodeWithAgent(request);
  }
  
  /**
   * TypeScript utility function oluşturma örneği
   */
  async generateUtilityFunction(functionName: string, description: string): Promise<CodeGenerationResponse> {
    const request: CodeGenerationRequest = {
      prompt: `${functionName} adında bir TypeScript utility function'ı oluştur. ${description}. Function proper JSDoc comments içermeli ve tip güvenli olmalı.`,
      language: 'typescript',
      maxTokens: 600,
      temperature: 0.3
    };
    
    return this.generateCodeWithAgent(request);
  }
  
  /**
   * Kodu dosyaya kaydet ve göster
   */
  async saveAndDisplayCode(response: CodeGenerationResponse, filename: string): Promise<string> {
    // Kodu göster
    console.log('💻 Oluşturulan Kod:');
    console.log('```' + (response.language === 'typescript' && response.framework === 'react' ? 'tsx' : response.language));
    console.log(response.code);
    console.log('```\n');
    
    // Açıklamayı göster
    console.log('📖 Açıklama:');
    console.log(response.explanation + '\n');
    
    // Önerileri göster
    if (response.suggestions && response.suggestions.length > 0) {
      console.log('💡 Öneriler:');
      response.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
      console.log('');
    }
    
    // Dosyaya kaydet
    const filepath = await this.client.saveCodeToFile(response.code, filename);
    console.log(`💾 Kod dosyaya kaydedildi: ${filepath}\n`);
    
    return filepath;
  }
}

// Örnek kullanımlar
async function runAgentExamples() {
  const agent = new ZAIGLM45Agent();
  
  console.log('🚀 Z.AI GLM-4.5 Agent Örnekleri\n');
  console.log('='.repeat(60));
  
  try {
    // 1. React Component Örneği
    console.log('1. React Component Örneği\n');
    const reactResponse = await agent.generateReactComponent(
      'UserProfile', 
      ['name: string', 'email: string', 'age: number']
    );
    await agent.saveAndDisplayCode(reactResponse, 'UserProfile.tsx');
    
    console.log('='.repeat(60));
    
    // 2. Express API Örneği
    console.log('2. Express API Endpoint Örneği\n');
    const apiResponse = await agent.generateExpressAPI('/api/users', 'GET');
    await agent.saveAndDisplayCode(apiResponse, 'getUsers.ts');
    
    console.log('='.repeat(60));
    
    // 3. Utility Function Örneği
    console.log('3. Utility Function Örneği\n');
    const utilResponse = await agent.generateUtilityFunction(
      'formatDate',
      'Tarih verisini formatlayan bir function. Date objesi alıp string döndürsün.'
    );
    await agent.saveAndDisplayCode(utilResponse, 'formatDate.ts');
    
    console.log('✅ Tüm örnekler başarıyla tamamlandı!');
    
  } catch (error) {
    console.error('❌ Örnekler çalıştırılırken hata oluştu:', (error as Error).message);
  }
}

// Interactive CLI modu
async function runAgentInteractive() {
  const agent = new ZAIGLM45Agent();
  
  console.log('🤖 Z.AI GLM-4.5 Agent - Interactive CLI');
  console.log('📝 Çıkmak için "exit" yazın\n');
  
  while (true) {
    const prompt = await new Promise<string>((resolve) => {
      process.stdout.write('Z.AI Agent> ');
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });

    if (prompt.toLowerCase() === 'exit') {
      console.log('👋 Görüşürüz!');
      break;
    }

    if (!prompt) {
      continue;
    }

    try {
      const request: CodeGenerationRequest = {
        prompt,
        language: 'typescript',
        maxTokens: 1500,
        temperature: 0.3
      };
      
      const response = await agent.generateCodeWithAgent(request);
      await agent.saveAndDisplayCode(response, 'generated-code.ts');
      
    } catch (error) {
      console.error(`❌ Hata: ${(error as Error).message}\n`);
    }
  }
}

// Doğrudan çalıştırma
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive')) {
    runAgentInteractive().catch(console.error);
  } else {
    runAgentExamples().catch(console.error);
  }
}

export { ZAIGLM45Agent, runAgentExamples, runAgentInteractive };