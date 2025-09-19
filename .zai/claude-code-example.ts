import { ClaudeCodeZAI, CodeGenerationRequest } from './claude-code-zai';

async function basicCodeExample() {
  console.log('🚀 Claude Code Z.AI - Temel Kod Oluşturma Örneği\n');
  
  const client = new ClaudeCodeZAI();
  
  try {
    const request: CodeGenerationRequest = {
      prompt: 'Bir kullanıcıdan isim ve yaş alan ve bunları konsola yazdıran bir fonksiyon yaz',
      language: 'typescript',
      maxTokens: 500,
      temperature: 0.3
    };
    
    const response = await client.generateCode(request);
    
    console.log('💻 Oluşturulan Kod:');
    console.log('```typescript');
    console.log(response.code);
    console.log('```\n');
    
    console.log('📖 Açıklama:');
    console.log(response.explanation);
    
    if (response.suggestions && response.suggestions.length > 0) {
      console.log('\n💡 Öneriler:');
      response.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function reactComponentExample() {
  console.log('🚀 Claude Code Z.AI - React Component Örneği\n');
  
  const client = new ClaudeCodeZAI();
  
  try {
    const request: CodeGenerationRequest = {
      prompt: 'Kullanıcı bilgilerini gösteren basit bir React componenti yaz. Props olarak name, age ve email alsın.',
      language: 'typescript',
      framework: 'react',
      maxTokens: 800,
      temperature: 0.3
    };
    
    const response = await client.generateCode(request);
    
    console.log('💻 Oluşturulan Kod:');
    console.log('```tsx');
    console.log(response.code);
    console.log('```\n');
    
    console.log('📖 Açıklama:');
    console.log(response.explanation);
    
    if (response.suggestions && response.suggestions.length > 0) {
      console.log('\n💡 Öneriler:');
      response.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function expressApiExample() {
  console.log('🚀 Claude Code Z.AI - Express API Örneği\n');
  
  const client = new ClaudeCodeZAI();
  
  try {
    const request: CodeGenerationRequest = {
      prompt: 'Kullanıcıları getiren ve yeni kullanıcı oluşturan basit bir Express API endpoint\'i yaz. TypeScript ve tip güvenliği kullan.',
      language: 'typescript',
      framework: 'express',
      context: 'User interface: { id: number, name: string, email: string, createdAt: Date }',
      maxTokens: 1000,
      temperature: 0.3
    };
    
    const response = await client.generateCode(request);
    
    console.log('💻 Oluşturulan Kod:');
    console.log('```typescript');
    console.log(response.code);
    console.log('```\n');
    
    console.log('📖 Açıklama:');
    console.log(response.explanation);
    
    if (response.suggestions && response.suggestions.length > 0) {
      console.log('\n💡 Öneriler:');
      response.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function saveCodeExample() {
  console.log('🚀 Claude Code Z.AI - Kodu Dosyaya Kaydetme Örneği\n');
  
  const client = new ClaudeCodeZAI();
  
  try {
    const request: CodeGenerationRequest = {
      prompt: 'Basit bir hesap makinesi sınıfı yaz. Toplama, çıkarma, çarpma ve bölme işlemleri yapsın.',
      language: 'typescript',
      maxTokens: 600,
      temperature: 0.3
    };
    
    const { filepath, response } = await client.generateAndSave(request, 'calculator.ts');
    
    console.log(`💻 Kod dosyaya kaydedildi: ${filepath}`);
    console.log('\n📖 Açıklama:');
    console.log(response.explanation);
    
    if (response.suggestions && response.suggestions.length > 0) {
      console.log('\n💡 Öneriler:');
      response.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. ${suggestion}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function runAllExamples() {
  await basicCodeExample();
  console.log('\n' + '='.repeat(60) + '\n');
  
  await reactComponentExample();
  console.log('\n' + '='.repeat(60) + '\n');
  
  await expressApiExample();
  console.log('\n' + '='.repeat(60) + '\n');
  
  await saveCodeExample();
}

// Doğrudan çalıştırma
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export { basicCodeExample, reactComponentExample, expressApiExample, saveCodeExample };