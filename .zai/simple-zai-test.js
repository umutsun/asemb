const https = require('https');
require('dotenv').config();

const apiKey = process.env.ZAI_API_KEY;

if (!apiKey) {
  console.error('Z.AI API anahtarı bulunamadı!');
  process.exit(1);
}

console.log('Z.AI API Testi');
console.log('API Key:', apiKey.substring(0, 10) + '...');

// Test için basit bir istek
function testZaiAPI() {
  try {
    console.log('Z.AI API\'ye istek gönderiliyor...');
    
    const postData = JSON.stringify({
      model: 'glm-4.5',
      messages: [
        {
          role: 'user',
          content: 'Merhaba, bu bir test mesajıdır.'
        }
      ],
      max_tokens: 50,
      temperature: 0.7
    });

    const options = {
      hostname: 'zai.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      console.log('Status:', res.statusCode, res.statusMessage);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('Başarılı!');
          try {
            const jsonData = JSON.parse(data);
            console.log('Yanıt:', JSON.stringify(jsonData, null, 2));
          } catch (e) {
            console.log('Yanıt:', data);
          }
        } else {
          console.log('Hata:', data);
        }
      });
    });

    req.on('error', (e) => {
      console.error('İstek sırasında hata:', e.message);
    });

    req.write(postData);
    req.end();
  } catch (error) {
    console.error('İstek sırasında hata:', error.message);
  }
}

testZaiAPI();