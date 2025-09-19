import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// .env dosyasını yükle
dotenv.config();

const apiKey = process.env.ZAI_API_KEY || '';

if (!apiKey) {
  console.error('❌ Z.AI API anahtarı bulunamadı!');
  process.exit(1);
}

// Test edilecek olası endpoint'ler
const possibleEndpoints = [
  'https://api.zai.chat/v1',
  'https://api.zai.ai/v1',
  'https://zai.ai/api/v1',
  'https://openrouter.ai/api/v1',
  'https://api.anthropic.com/v1'
];

async function testEndpoint(endpoint: string) {
  console.log(`🔄 Testing endpoint: ${endpoint}`);
  
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4.5',
        messages: [
          {
            role: 'user',
            content: 'Hello, just testing the API connection.'
          }
        ],
        max_tokens: 50,
        temperature: 0.7
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS: ${endpoint}`);
      console.log(`📝 Response:`, data);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`❌ FAILED: ${endpoint} - Status: ${response.status}`);
      console.log(`📝 Error:`, errorText);
      return false;
    }
  } catch (error) {
    console.log(`❌ ERROR: ${endpoint} - ${(error as Error).message}`);
    return false;
  }
}

async function testAllEndpoints() {
  console.log('🚀 Testing Z.AI API Endpoints\n');
  
  for (const endpoint of possibleEndpoints) {
    const success = await testEndpoint(endpoint);
    console.log(''); // Boş satır için
    
    if (success) {
      console.log(`🎉 Found working endpoint: ${endpoint}`);
      break;
    }
  }
  
  console.log('🏁 Endpoint testing completed!');
}

// Çalıştır
testAllEndpoints().catch(console.error);