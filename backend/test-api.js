const fetch = require('node-fetch');

async function testBackend() {
  try {
    console.log('Testing backend at http://localhost:8082/api/v2/chat');
    
    // Generate proper UUID v4
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    
    const response = await fetch('http://localhost:8082/api/v2/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Claude API test: Özelge nedir?',
        conversationId: uuid,
        userId: 'demo-user'
      })
    });

    const responseText = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\nSuccess! AI Response:', data.response);
      console.log('\nSources found:', data.sources?.length || 0);
      if (data.sources && data.sources.length > 0) {
        console.log('First source:', data.sources[0].title);
      }
    } else {
      console.log('Error response:', responseText);
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testBackend();