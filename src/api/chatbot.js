// Chatbot API Endpoint
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // For now, use a simple OpenAI completion
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are Alice, an intelligent assistant for the Alice Semantic Bridge system. You help users with semantic search, knowledge management, and workflow automation."
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    const reply = completion.choices[0].message.content;
    
    res.json({
      message: reply,
      sessionId: sessionId || 'default',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Chatbot error:', error);
    
    // Fallback response if OpenAI fails
    res.json({
      message: "I'm having trouble connecting to my AI service. Please try again later.",
      sessionId: req.body.sessionId || 'default',
      timestamp: new Date().toISOString(),
      error: true
    });
  }
});

// Chat history endpoint
router.get('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  // For now, return empty history
  res.json({
    sessionId,
    messages: [],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
