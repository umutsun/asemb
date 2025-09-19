const https = require('https');
const http = require('http');

async function testBackendConnection() {
  const urls = [
    'http://localhost:8083/health',
    'http://localhost:8083/api/v2/embeddings/progress',
    'http://localhost:8083/api/embeddings/progress'
  ];

  for (const url of urls) {
    console.log(`\nTesting: ${url}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        timeout: 5000
      });
      console.log(`Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
      } else {
        const text = await response.text();
        console.log('Error:', text);
      }
    } catch (error) {
      console.log('Connection failed:', error.message);
    }
  }
}

testBackendConnection();