import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

// Database connections
const asbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

const lawPool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres'
});

// Turkish law tables configuration
const TURKISH_LAW_TABLES = {
  OZELGELER: {
    name: 'OZELGELER',
    displayName: 'Özelgeler',
    searchColumns: ['KONU', 'OZET', 'MADDE_METNI'],
    database: 'postgres'
  },
  DANISTAYKARARLARI: {
    name: 'DANISTAYKARARLARI',
    displayName: 'Danıştay Kararları',
    searchColumns: ['KARAR_METNI', 'KARAR_OZETI'],
    database: 'postgres'
  },
  MAKALELER: {
    name: 'MAKALELER',
    displayName: 'Makaleler',
    searchColumns: ['BASLIK', 'ICERIK', 'OZET'],
    database: 'postgres'
  },
  SORUCEVAP: {
    name: 'SORUCEVAP',
    displayName: 'Soru-Cevap',
    searchColumns: ['SORU', 'CEVAP'],
    database: 'postgres'
  }
};

// Get RAG configuration
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Get settings from database
    const settingsResult = await asbPool.query(`
      SELECT setting_key, setting_value 
      FROM chatbot_settings 
      WHERE setting_key IN ('ai_provider', 'openai_api_key', 'claude_api_key', 'gemini_api_key', 
                           'system_prompt', 'temperature', 'max_tokens', 'fallback_enabled')
    `);
    
    const settings: { [key: string]: any } = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    // Get table statistics
    const tableStats = [];
    for (const [key, config] of Object.entries(TURKISH_LAW_TABLES)) {
      try {
        const countResult = await lawPool.query(
          `SELECT COUNT(*) as count FROM public."${config.name}"`
        );
        
        const embeddingResult = await lawPool.query(
          `SELECT COUNT(*) as count FROM public."${config.name}" WHERE embedding IS NOT NULL`
        );
        
        tableStats.push({
          tableName: config.name,
          displayName: config.displayName,
          totalRecords: parseInt(countResult.rows[0].count),
          embeddedRecords: parseInt(embeddingResult.rows[0].count),
          searchColumns: config.searchColumns,
          database: config.database
        });
      } catch (err) {
        console.error(`Error getting stats for ${config.name}:`, err);
      }
    }
    
    res.json({
      aiProvider: settings.ai_provider || 'openai',
      fallbackEnabled: settings.fallback_enabled === 'true',
      systemPrompt: settings.system_prompt || '',
      temperature: parseFloat(settings.temperature) || 0.1,
      maxTokens: parseInt(settings.max_tokens) || 2048,
      tables: tableStats,
      apiKeys: {
        openai: !!settings.openai_api_key,
        claude: !!settings.claude_api_key,
        gemini: !!settings.gemini_api_key
      }
    });
  } catch (error) {
    console.error('Get RAG config error:', error);
    res.status(500).json({ error: 'Failed to fetch RAG configuration' });
  }
});

// Update RAG configuration
router.put('/config', async (req: Request, res: Response) => {
  try {
    const { 
      aiProvider, 
      fallbackEnabled, 
      systemPrompt, 
      temperature, 
      maxTokens,
      openaiApiKey,
      claudeApiKey,
      geminiApiKey
    } = req.body;
    
    // Update settings in database
    const updates = [
      { key: 'ai_provider', value: aiProvider },
      { key: 'fallback_enabled', value: fallbackEnabled.toString() },
      { key: 'system_prompt', value: systemPrompt },
      { key: 'temperature', value: temperature.toString() },
      { key: 'max_tokens', value: maxTokens.toString() }
    ];
    
    if (openaiApiKey) {
      updates.push({ key: 'openai_api_key', value: openaiApiKey });
    }
    if (claudeApiKey) {
      updates.push({ key: 'claude_api_key', value: claudeApiKey });
    }
    if (geminiApiKey) {
      updates.push({ key: 'gemini_api_key', value: geminiApiKey });
    }
    
    for (const update of updates) {
      await asbPool.query(
        `INSERT INTO chatbot_settings (setting_key, setting_value) 
         VALUES ($1, $2) 
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2`,
        [update.key, update.value]
      );
    }
    
    res.json({ success: true, message: 'RAG configuration updated' });
  } catch (error) {
    console.error('Update RAG config error:', error);
    res.status(500).json({ error: 'Failed to update RAG configuration' });
  }
});

// Search in embedded documents
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, tables = Object.keys(TURKISH_LAW_TABLES), limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Get API key from settings
    const apiKeyResult = await asbPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'openai_api_key'"
    );
    const apiKey = apiKeyResult.rows[0]?.setting_value || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }
    
    // Generate embedding for query
    const openai = new OpenAI({ apiKey });
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    
    // Search in each table
    const results = [];
    for (const tableName of tables) {
      if (!TURKISH_LAW_TABLES[tableName as keyof typeof TURKISH_LAW_TABLES]) continue;
      
      const config = TURKISH_LAW_TABLES[tableName as keyof typeof TURKISH_LAW_TABLES];
      
      try {
        // Perform vector similarity search
        const searchQuery = `
          SELECT *, 
                 1 - (embedding <=> $1::vector) as similarity
          FROM public."${config.name}"
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $2
        `;
        
        const searchResult = await lawPool.query(searchQuery, [
          `[${queryEmbedding.join(',')}]`,
          limit
        ]);
        
        results.push(...searchResult.rows.map(row => ({
          ...row,
          table: config.displayName,
          tableName: config.name
        })));
      } catch (err) {
        console.error(`Search error in ${config.name}:`, err);
      }
    }
    
    // Sort by similarity and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    
    res.json({
      query,
      results: results.slice(0, limit * 2),
      totalFound: results.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Chat with RAG
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversationId, useRag = true } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get settings
    const settingsResult = await asbPool.query(`
      SELECT setting_key, setting_value 
      FROM chatbot_settings 
      WHERE setting_key IN ('ai_provider', 'openai_api_key', 'claude_api_key', 
                           'gemini_api_key', 'system_prompt', 'temperature', 'max_tokens')
    `);
    
    const settings: { [key: string]: any } = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    let context = '';
    
    // If RAG is enabled, search for relevant documents
    if (useRag) {
      const searchResponse = await fetch('http://localhost:8083/api/v2/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: message, 
          limit: 5 
        })
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.results && searchData.results.length > 0) {
          context = searchData.results.map((r: any, i: number) => 
            `[Kaynak ${i + 1} - ${r.table}]: ${JSON.stringify(r)}`
          ).join('\n\n');
        }
      }
    }
    
    // Prepare the prompt
    const systemPrompt = settings.system_prompt || `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.
    Aşağıdaki bağlamda verilen bilgilere dayanarak cevap ver.`;
    
    const fullPrompt = useRag && context 
      ? `${systemPrompt}\n\nBağlam:\n${context}\n\nKullanıcı Sorusu: ${message}`
      : message;
    
    let response = '';
    const provider = settings.ai_provider || 'openai';
    
    try {
      // Try primary provider
      if (provider === 'openai' && settings.openai_api_key) {
        const openai = new OpenAI({ apiKey: settings.openai_api_key });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: useRag && context ? `Bağlam:\n${context}\n\nSoru: ${message}` : message }
          ],
          temperature: parseFloat(settings.temperature) || 0.1,
          max_tokens: parseInt(settings.max_tokens) || 2048
        });
        response = completion.choices[0].message.content || '';
      } else if (provider === 'claude' && settings.claude_api_key) {
        const anthropic = new Anthropic({ apiKey: settings.claude_api_key });
        const completion = await anthropic.messages.create({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: fullPrompt }],
          max_tokens: parseInt(settings.max_tokens) || 2048
        });
        response = completion.content[0].type === 'text' ? completion.content[0].text : '';
      } else if (provider === 'gemini' && settings.gemini_api_key) {
        const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(fullPrompt);
        response = result.response.text();
      }
    } catch (primaryError) {
      console.error(`Primary provider (${provider}) failed:`, primaryError);
      
      // Try fallback providers
      const fallbackProviders = ['openai', 'claude', 'gemini'].filter(p => p !== provider);
      
      for (const fallback of fallbackProviders) {
        try {
          if (fallback === 'openai' && settings.openai_api_key) {
            const openai = new OpenAI({ apiKey: settings.openai_api_key });
            const completion = await openai.chat.completions.create({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: useRag && context ? `Bağlam:\n${context}\n\nSoru: ${message}` : message }
              ],
              temperature: 0.1,
              max_tokens: 2048
            });
            response = completion.choices[0].message.content || '';
            break;
          } else if (fallback === 'claude' && settings.claude_api_key) {
            const anthropic = new Anthropic({ apiKey: settings.claude_api_key });
            const completion = await anthropic.messages.create({
              model: 'claude-3-haiku-20240307',
              messages: [{ role: 'user', content: fullPrompt }],
              max_tokens: 2048
            });
            response = completion.content[0].type === 'text' ? completion.content[0].text : '';
            break;
          } else if (fallback === 'gemini' && settings.gemini_api_key) {
            const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
            const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent(fullPrompt);
            response = result.response.text();
            break;
          }
        } catch (fallbackError) {
          console.error(`Fallback provider (${fallback}) failed:`, fallbackError);
        }
      }
    }
    
    if (!response) {
      return res.status(500).json({ error: 'All AI providers failed' });
    }
    
    // Save conversation if needed
    if (conversationId) {
      await asbPool.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [conversationId, 'user', message]
      );
      await asbPool.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [conversationId, 'assistant', response]
      );
    }
    
    res.json({
      response,
      context: useRag ? context : null,
      provider: settings.ai_provider
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat failed' });
  }
});

// Test AI providers
router.post('/test-provider', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;
    
    const testMessage = 'Merhaba, bu bir test mesajıdır. Lütfen kısa bir yanıt ver.';
    
    try {
      if (provider === 'openai') {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 50
        });
        res.json({ success: true, response: completion.choices[0].message.content });
      } else if (provider === 'claude') {
        const anthropic = new Anthropic({ apiKey });
        const completion = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 50
        });
        res.json({ success: true, response: completion.content[0].type === 'text' ? completion.content[0].text : '' });
      } else if (provider === 'gemini') {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(testMessage);
        res.json({ success: true, response: result.response.text() });
      } else {
        res.status(400).json({ error: 'Invalid provider' });
      }
    } catch (error) {
      res.json({ success: false, error: (error as Error).message });
    }
  } catch (error) {
    console.error('Test provider error:', error);
    res.status(500).json({ error: 'Test failed' });
  }
});

export default router;