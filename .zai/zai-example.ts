import { ZAIClient } from './zai-integration';

async function basicExample() {
  console.log('🚀 Z.AI Temel Kullanım Örneği\n');
  
  // Z.AI client oluştur
  const client = new ZAIClient();
  
  try {
    // Basit metin oluşturma
    const response = await client.generateText({
      prompt: 'Merhaba! TypeScript hakkında kısa bir bilgi verir misin?',
      maxTokens: 200,
      temperature: 0.7
    });
    
    console.log('📝 Yanıt:', response.choices[0]?.message?.content);
    console.log('📊 Kullanım:', response.usage);
    console.log('🤖 Model:', response.model);
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function simpleExample() {
  console.log('🚀 Z.AI Basit Kullanım Örneği\n');
  
  const client = new ZAIClient();
  
  try {
    // Daha basit kullanım
    const text = await client.generateTextSimple(
      'JavaScript ve TypeScript arasındaki farklar nelerdir?',
      150
    );
    
    console.log('📝 Yanıt:', text);
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function streamingExample() {
  console.log('🚀 Z.AI Stream Kullanım Örneği\n');
  
  const client = new ZAIClient();
  
  try {
    console.log('📝 Stream yanıtı: ');
    
    // Stream olarak metin oluşturma
    for await (const chunk of client.generateTextStream({
      prompt: 'Yapay zeka gelecekte dünyayı nasıl değiştirecek?',
      maxTokens: 300,
      temperature: 0.8
    })) {
      process.stdout.write(chunk);
    }
    
    console.log('\n✅ Stream tamamlandı!');
    
  } catch (error) {
    console.error('❌ Hata:', (error as Error).message);
  }
}

async function runAllExamples() {
  await basicExample();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await simpleExample();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await streamingExample();
}

// Doğrudan çalıştırma
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export { basicExample, simpleExample, streamingExample };