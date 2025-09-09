const testFrontendAPI = async () => {
  try {
    const response = await fetch('http://localhost:3007/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Test mesajı',
        conversationId: null // Let it generate UUID
      })
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);

    if (response.ok) {
      const data = JSON.parse(text);
      console.log('Success! Message:', data.message.content);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

testFrontendAPI();