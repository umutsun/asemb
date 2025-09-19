import * as dotenv from 'dotenv';
import { ZAIClient } from './zai-integration';

// .env dosyasını yükle
dotenv.config();

/**
 * Z.AI GLM-4.5 ile Claude Code Benzeri Demo
 * Bu script, Z.AI'nin GLM-4.5 modelini kullanarak Claude Code benzeri bir deneyim sunar.
 */

class ZAIClaudeCodeDemo {
  private client: ZAIClient;
  
  constructor() {
    this.client = new ZAIClient();
  }
  
  /**
   * Z.AI GLM-4.5 modelini kullanarak kod oluşturur
   */
  async generateCode(prompt: string, language: string = 'typescript', framework?: string): Promise<string> {
    console.log(`🔄 ${language} kodu oluşturuluyor...`);
    
    const fullPrompt = `
    ${framework ? `Framework: ${framework}` : ''}
    Dil: ${language}
    
    Kullanıcı isteği: ${prompt}
    
    Lütfen temiz, okunabilir ve iyi yapılandırılmış kod oluştur. Kodun başına kısa bir açıklama ekle.
    `;
    
    try {
      const response = await this.client.generateText({
        prompt: fullPrompt,
        maxTokens: 1000,
        temperature: 0.3
      });
      
      return response.choices[0]?.message?.content || 'Kod oluşturulamadı.';
    } catch (error) {
      console.error(`❌ Kod oluşturma hatası: ${(error as Error).message}`);
      return `Hata: ${(error as Error).message}`;
    }
  }
  
  /**
   * React component oluşturma örneği
   */
  async generateReactComponent(componentName: string, props: string[]): Promise<string> {
    const propsDescription = props.length > 0 
      ? `Props: ${props.join(', ')}`
      : 'Props yok';
    
    const prompt = `${componentName} adında bir React componenti oluştur. ${propsDescription}. Component temiz, okunabilir ve TypeScript ile tip güvenli olmalı.`;
    
    return this.generateCode(prompt, 'typescript', 'React');
  }
  
  /**
   * Express API endpoint oluşturma örneği
   */
  async generateExpressAPI(endpoint: string, method: string): Promise<string> {
    const prompt = `${method.toUpperCase()} ${endpoint} için bir Express API endpoint'i oluştur. TypeScript kullan, proper error handling ekle ve response'u JSON formatında döndür.`;
    
    return this.generateCode(prompt, 'typescript', 'Express');
  }
  
  /**
   * Python fonksiyonu oluşturma örneği
   */
  async generatePythonFunction(functionName: string, description: string): Promise<string> {
    const prompt = `${functionName} adında bir Python fonksiyonu oluştur. ${description}. Fonksiyon proper docstring içermeli ve hata yönetimi olmalı.`;
    
    return this.generateCode(prompt, 'python');
  }
  
  /**
   * Kodu göster
   */
  displayCode(code: string, title: string): void {
    console.log(`\n💻 ${title}`);
    console.log('```');
    console.log(code);
    console.log('```\n');
  }
}

// Demo çalıştırma
async function runDemo() {
  console.log('🚀 Z.AI GLM-4.5 Claude Code Demo\n');
  console.log('='.repeat(60));
  
  const demo = new ZAIClaudeCodeDemo();
  
  try {
    // 1. React Component Örneği
    console.log('1. React Component Örneği\n');
    const reactCode = await demo.generateReactComponent(
      'UserProfile', 
      ['name: string', 'email: string', 'age: number']
    );
    demo.displayCode(reactCode, 'React Component');
    
    console.log('='.repeat(60));
    
    // 2. Express API Örneği
    console.log('2. Express API Endpoint Örneği\n');
    const apiCode = await demo.generateExpressAPI('/api/users', 'GET');
    demo.displayCode(apiCode, 'Express API');
    
    console.log('='.repeat(60));
    
    // 3. Python Function Örneği
    console.log('3. Python Function Örneği\n');
    const pythonCode = await demo.generatePythonFunction(
      'calculate_factorial',
      'Bir sayının faktöriyelini hesaplayan bir fonksiyon.'
    );
    demo.displayCode(pythonCode, 'Python Function');
    
    console.log('✅ Demo tamamlandı!');
    
  } catch (error) {
    console.error('❌ Demo çalıştırılırken hata oluştu:', (error as Error).message);
  }
}

// Interactive CLI modu
async function runInteractive() {
  const demo = new ZAIClaudeCodeDemo();
  
  console.log('🤖 Z.AI GLM-4.5 Claude Code - Interactive CLI');
  console.log('📝 Çıkmak için "exit" yazın\n');
  
  while (true) {
    const prompt = await new Promise<string>((resolve) => {
      process.stdout.write('Claude Code> ');
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
      console.log('🔄 Kod oluşturuluyor...\n');
      const code = await demo.generateCode(prompt);
      demo.displayCode(code, 'Oluşturulan Kod');
      
    } catch (error) {
      console.error(`❌ Hata: ${(error as Error).message}\n`);
    }
  }
}

// Doğrudan çalıştırma
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive')) {
    runInteractive().catch(console.error);
  } else {
    runDemo().catch(console.error);
  }
}

export { ZAIClaudeCodeDemo, runDemo, runInteractive };