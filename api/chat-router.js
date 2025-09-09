const express = require('express');
const router = express.Router();
const { Client } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// PostgreSQL connection
const getDbClient = () => {
  return new Client({
    connectionString: process.env.TARGET_DB || process.env.DATABASE_URL,
  });
};

// Generate embedding for query
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Search similar documents using pgvector
async function searchDocuments(query, limit = 5) {
  const client = getDbClient();
  
  try {
    await client.connect();
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Search using pgvector cosine similarity
    const searchQuery = `
      SELECT 
        id,
        title,
        content,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM rag_data.documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;
    
    const result = await client.query(searchQuery, [JSON.stringify(queryEmbedding), limit]);
    
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      metadata: row.metadata,
      score: row.similarity
    }));
    
  } catch (error) {
    console.error('Error searching documents:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Generate response using OpenAI with context
async function generateResponse(query, context, systemPrompt) {
  try {
    const messages = [
      {
        role: 'system',
        content: systemPrompt || `Sen bir yardımcı asistansın. SADECE verilen context'ten cevap ver. Context'te olmayan bilgileri verme.`
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nSoru: ${query}`
      }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.1,
      max_tokens: 2048,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}

// POST /api/v2/chat - Main chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { 
      message, 
      conversationId, 
      limit = 5,
      systemPrompt,
      temperature = 0.1 
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('[Chat API] Processing query:', message);

    // Search for relevant documents
    const documents = await searchDocuments(message, limit);
    
    console.log('[Chat API] Found documents:', documents.length);

    if (documents.length === 0) {
      return res.json({
        response: 'Bu konuda veritabanımda bilgi bulunmuyor. Lütfen önce ilgili dokümanları sisteme yükleyin.',
        sources: [],
        conversationId: conversationId || `conv-${Date.now()}`
      });
    }

    // Build context from found documents
    const context = documents
      .map(doc => `Başlık: ${doc.title}\nİçerik: ${doc.content}`)
      .join('\n\n---\n\n');

    // Generate response
    const response = await generateResponse(message, context, systemPrompt);

    // Format sources
    const sources = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      excerpt: doc.content.substring(0, 200) + '...',
      score: doc.score,
      metadata: doc.metadata
    }));

    return res.json({
      response,
      sources,
      conversationId: conversationId || `conv-${Date.now()}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Chat API] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process chat message',
      details: error.message 
    });
  }
});

// GET /api/v2/chat/health - Health check
router.get('/health', async (req, res) => {
  const client = getDbClient();
  
  try {
    await client.connect();
    const result = await client.query('SELECT COUNT(*) FROM rag_data.documents');
    await client.end();
    
    return res.json({
      status: 'healthy',
      documentCount: parseInt(result.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
