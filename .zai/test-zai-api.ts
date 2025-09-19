import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// .env dosyasını yükle
dotenv.config();

const apiKey = process.env.ZAI_API_KEY || '';

if (!apiKey) {
  console.error('❌ Z.AI API anahtarı bulunamadı!');
  process.exit(1);
}

console.log('🔑 API Key:', apiKey.substring(0, 10) + '...');

// Test edilecek olası yapılandırmalar
const testConfigs = [
  {
    url: 'https://zai.ai/api/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: 'glm-4.5',
      messages: [
        {
          role: 'user',
          content: 'Hello, just testing the API connection.'
        }
      ],
      max_tokens: 50,
      temperature: 0.7
    }
  },
  {
    url: 'https://zai.ai/api/v1/chat/completions',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: {
      model: 'glm-4.5',
      messages: [
        {
          role: 'user',
          content: 'Hello, just testing the API connection.'
        }
      ],
      max_tokens: 50,
      temperature: 0.7
    }
  },
  {
    url: 'https://zai.ai/api/v1/completions',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: 'glm-4.5',
      prompt: 'Hello, just testing the API connection.',
      max_tokens: 50,
      temperature: 0.7
    }
  },
  {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://localhost',
      'X-Title': 'Z.AI Test'
    },
    body: {
      model: 'glm-4.5',
      messages: [
        {
          role: 'user',
          content: 'Hello, just testing the API connection.'
        }
      ],
      max_tokens: 50,
      temperature: 0.7
    }
  }
];

async function testConfig(config: any, index: number) {
  console.log(`\n🔄 Testing configuration ${index + 1}: ${config.url}`);
  
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(config.body)
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS: Configuration ${index + 1}`);
      console.log(`📝 Response:`, JSON.stringify(data, null, 2));
      return true;
    } else {
      const errorText = await response.text();
      console.log(`❌ FAILED: Configuration ${index + 1}`);
      console.log(`📝 Error:`, errorText);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: Configuration ${index + 1} - ${(error as Error).message}`);
    return false;
  }
}

async function testAllConfigs() {
  console.log('🚀 Testing Z.AI API Configurations');
  
  for (let i = 0; i < testConfigs.length; i++) {
    const success = await testConfig(testConfigs[i], i);
    
    if (success) {
      console.log(`\n🎉 Found working configuration: ${i + 1}`);
      console.log(`URL: ${testConfigs[i].url}`);
      console.log(`Headers:`, JSON.stringify(testConfigs[i].headers, null, 2));
      console.log(`Body:`, JSON.stringify(testConfigs[i].body, null, 2));
      return;
    }
  }
  
  console.log('\n🏁 No working configuration found!');
}

// Çalıştır
testAllConfigs().catch(console.error);