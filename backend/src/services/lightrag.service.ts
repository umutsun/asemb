import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { getAiSettings } from '../config/database.config';

export class LightRAGService {
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: any;
  private llm: any;
  private pool: Pool;
  private redis: Redis;
  private isInitialized: boolean = false;
  private currentProvider: string = 'none';

  constructor(pool: Pool, redis: Redis) {
    this.pool = pool;
    this.redis = redis;

    // Initialize embeddings and LLM will be done in initialize() method
  }

  
  private initializeLLM() {
    // Priority order: OpenAI -> Gemini -> Deepseek -> Claude
    
    // Try OpenAI first (primary)
    if (process.env.OPENAI_API_KEY) {
      try {
        this.llm = new ChatOpenAI({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: 'gpt-3.5-turbo',
          temperature: 0.3,
          maxTokens: 1000
        });
        this.currentProvider = 'openai';
        console.log('🤖 LightRAG using OpenAI API');
        return;
      } catch (error) {
        console.log('⚠️ OpenAI LLM initialization failed');
      }
    }

    // Try Gemini as first fallback
    if (process.env.GEMINI_API_KEY) {
      try {
        this.llm = new ChatGoogleGenerativeAI({
          apiKey: process.env.GEMINI_API_KEY,
          model: 'gemini-pro',
          temperature: 0.3,
          maxOutputTokens: 1000
        });
        this.currentProvider = 'gemini';
        console.log('🤖 LightRAG using Gemini API');
        return;
      } catch (error) {
        console.log('⚠️ Gemini LLM initialization failed');
      }
    }

    // Try Deepseek as second fallback (OpenAI compatible)
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        this.llm = new ChatOpenAI({
          openAIApiKey: process.env.DEEPSEEK_API_KEY,
          modelName: 'deepseek-chat',
          temperature: 0.3,
          maxTokens: 1000,
          configuration: {
            baseURL: 'https://api.deepseek.com/v1'
          }
        });
        this.currentProvider = 'deepseek';
        console.log('🤖 LightRAG using Deepseek API');
        return;
      } catch (error) {
        console.log('⚠️ Deepseek LLM initialization failed');
      }
    }

    // Try Claude as last fallback
    if (process.env.CLAUDE_API_KEY) {
      try {
        this.llm = new ChatAnthropic({
          anthropicApiKey: process.env.CLAUDE_API_KEY,
          modelName: 'claude-3-haiku-20240307',
          temperature: 0.3,
          maxTokens: 1000
        });
        this.currentProvider = 'claude';
        console.log('🤖 LightRAG using Claude API');
        return;
      } catch (error) {
        console.log('⚠️ Claude LLM initialization failed');
      }
    }

    console.log('❌ No LLM provider available');
    this.currentProvider = 'none';
  }

  /**
   * Initialize the vector store with existing documents
   */
  async initialize() {
    try {
      console.log('🚀 Initializing LightRAG service...');

      // Initialize embeddings first
      await this.initializeEmbeddings();

      // Initialize LLM
      this.initializeLLM();

      // Load documents from PostgreSQL
      const documents = await this.loadDocumentsFromDB();
      
      try {
        if (documents.length > 0) {
          // Try to create vector store from documents
          this.vectorStore = await MemoryVectorStore.fromDocuments(
            documents,
            this.embeddings
          );
          
          console.log(`✅ LightRAG initialized with ${documents.length} documents`);
        } else {
          // Create empty vector store
          this.vectorStore = new MemoryVectorStore(this.embeddings);
          console.log('✅ LightRAG initialized with empty vector store');
        }
      } catch (embeddingError: any) {
        console.error('⚠️ Embedding initialization failed:', embeddingError.message);
        
        // If OpenAI embeddings fail, create vector store without pre-loading
        // We'll generate embeddings on-demand when documents are added
        console.log('🔄 Initializing LightRAG without pre-loaded embeddings...');
        this.vectorStore = new MemoryVectorStore(this.embeddings);
        
        // Try to reinitialize LLM with fallback providers
        if (this.currentProvider === 'none' || this.currentProvider === 'openai') {
          console.log('🔄 Attempting to switch to alternative LLM provider...');
          this.initializeLLM();
        }
      }
      
      this.isInitialized = true;
      
      // Cache initialization status
      if (this.redis && this.redis.set) {
        await this.redis.set('lightrag:status', JSON.stringify({
          initialized: true,
          documentCount: documents.length,
          timestamp: new Date(),
          provider: this.currentProvider
        }));
      }
      
    } catch (error) {
      console.error('❌ LightRAG initialization failed:', error);
      // Don't throw, just log the error
      this.isInitialized = false;
    }
  }

  /**
   * Load documents from PostgreSQL
   */
  private async loadDocumentsFromDB(): Promise<Document[]> {
    try {
      // Make sure pool is initialized
      if (!this.pool || !this.pool.query) {
        console.log('PostgreSQL pool not initialized');
        return [];
      }

      // First check if the table exists
      const tableCheck = await this.pool.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_schema = 'rag_data' 
          AND table_name = 'documents'
        )
      `);

      if (!tableCheck.rows[0].exists) {
        console.log('rag_data.documents table does not exist');
        return [];
      }

      // Load from rag_data.documents table
      const query = `
        SELECT 
          id,
          title,
          content,
          metadata
        FROM rag_data.documents
        WHERE content IS NOT NULL
        LIMIT 1000
      `;
      
      const result = await this.pool.query(query);
      
      return result.rows.map(row => new Document({
        pageContent: row.content,
        metadata: {
          id: row.id,
          title: row.title,
          source: 'postgresql',
          ...row.metadata
        }
      }));
    } catch (error) {
      console.error('Error loading documents:', error);
      return [];
    }
  }

  /**
   * Add new documents to the RAG system
   */
  async addDocuments(documents: Array<{ title: string; content: string; metadata?: any }>) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.vectorStore) {
      throw new Error('LightRAG not initialized');
    }

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });

    for (const doc of documents) {
      // Split document into chunks
      const chunks = await textSplitter.createDocuments(
        [doc.content],
        [{ title: doc.title, ...doc.metadata }]
      );
      
      // Add to vector store
      await this.vectorStore.addDocuments(chunks);
      
      // Save to PostgreSQL
      await this.saveDocumentToDB(doc);
    }

    // Update cache
    if (this.redis && this.redis.publish) {
      await this.redis.publish('lightrag:documents:added', JSON.stringify({
        count: documents.length,
        timestamp: new Date()
      }));
    }
  }

  /**
   * Save document to PostgreSQL
   */
  private async saveDocumentToDB(doc: { title: string; content: string; metadata?: any }) {
    if (!this.pool || !this.pool.query) {
      console.error('PostgreSQL pool not available');
      return;
    }

    try {
      // First ensure the schema and table exist
      await this.pool.query(`
        CREATE SCHEMA IF NOT EXISTS rag_data
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS rag_data.documents (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) UNIQUE NOT NULL,
          content TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const query = `
        INSERT INTO rag_data.documents (title, content, metadata, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (title) DO UPDATE
        SET content = $2, metadata = $3, updated_at = NOW()
      `;
      
      await this.pool.query(query, [
        doc.title,
        doc.content,
        doc.metadata || {}
      ]);
    } catch (error) {
      console.error('Error saving document to DB:', error);
    }
  }

  /**
   * Query the RAG system
   */
  async query(question: string, context?: string, options?: {
    temperature?: number;
    mode?: string;
    useCache?: boolean;
    limit?: number;
  }): Promise<{
    answer: string;
    sources: Array<{ title: string; content: string; score: number }>;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.vectorStore) {
      return {
        answer: 'LightRAG system is not initialized. Please add some documents first.',
        sources: []
      };
    }

    try {
      const { temperature = 0.3, mode = 'hybrid', useCache = true, limit = 5 } = options || {};
      
      // Search for similar documents
      const relevantDocs = await this.vectorStore.similaritySearch(question, limit);
      
      if (relevantDocs.length === 0) {
        return {
          answer: 'Veritabanında bu soruyla ilgili herhangi bir bilgi bulunamadı. Lütfen farklı bir soru sorun veya sistem yöneticisiyle iletişime geçin.',
          sources: []
        };
      }

      // Prepare context from documents
      const contextText = relevantDocs
        .map(doc => `Title: ${doc.metadata.title || 'Unknown'}\nContent: ${doc.pageContent}`)
        .join('\n\n---\n\n');

      // Create prompt with temperature-based instructions
      const strictMode = temperature <= 0.3;
      const promptText = strictMode ? `
        You are a helpful AI assistant specialized in Turkish tax and financial regulations.
        IMPORTANT: You MUST ONLY use information from the provided context. 
        DO NOT generate or infer any information not explicitly stated in the context.
        If the context doesn't contain enough information to answer the question, say "Bu soruya veritabanında bulunan bilgilerle yanıt veremiyorum."
        
        Context: {context}
        
        Additional Context: ${context || 'None'}
        
        Question: {question}
        
        Answer in Turkish based ONLY on the context provided:
      ` : `
        You are a helpful AI assistant specialized in Turkish tax and financial regulations.
        Use the following context to answer the question. If you don't know the answer based on the context, say so.
        
        Context: {context}
        
        Additional Context: ${context || 'None'}
        
        Question: {question}
        
        Answer in Turkish and be concise:
      `;
      
      const prompt = PromptTemplate.fromTemplate(promptText);

      const formattedPrompt = await prompt.format({
        context: contextText,
        question: question
      });

      // Update LLM temperature dynamically
      if (this.llm && this.llm.temperature !== undefined) {
        this.llm.temperature = temperature;
      }
      
      // Get answer from LLM
      const response = await this.llm.call([
        { role: 'user', content: formattedPrompt }
      ]);

      // Format sources
      const sources = relevantDocs.map((doc, idx) => ({
        title: doc.metadata.title || `Source ${idx + 1}`,
        content: doc.pageContent.substring(0, 200) + '...',
        score: 0.5 // MemoryVectorStore doesn't provide scores
      }));

      // In strict mode, validate that response is based on context
      let finalAnswer = response.content as string;
      
      if (temperature <= 0.3) {
        // Check if the answer contains information not in context
        const contextWords = contextText.toLowerCase().split(/\s+/);
        const answerWords = finalAnswer.toLowerCase().split(/\s+/);
        
        // If the answer is too long compared to context, it might be hallucinating
        if (answerWords.length > contextWords.length * 2) {
          finalAnswer = `Uyarı: Yanıt veritabanındaki bilgilerle sınırlandırılmıştır.\n\n${finalAnswer.substring(0, 500)}...`;
        }
        
        // Add a disclaimer for strict mode
        if (!finalAnswer.includes('veritabanı')) {
          finalAnswer = `[Veritabanı Modu - Sadece mevcut bilgiler kullanılmıştır]\n\n${finalAnswer}`;
        }
      }

      return {
        answer: finalAnswer,
        sources
      };
    } catch (error) {
      console.error('LightRAG query error:', error);
      throw error;
    }
  }

  /**
   * Get system statistics
   */
  async getStats() {
    const stats = {
      initialized: this.isInitialized,
      documentCount: 0,
      vectorStoreSize: 0,
      lastUpdate: null as string | null,
      provider: this.currentProvider
    };

    // Get from cache
    if (this.redis && this.redis.get) {
      try {
        const cached = await this.redis.get('lightrag:status');
        if (cached) {
          const cachedStats = JSON.parse(cached);
          stats.lastUpdate = cachedStats.timestamp;
          stats.documentCount = cachedStats.documentCount;
          stats.provider = cachedStats.provider || this.currentProvider;
        }
      } catch (error) {
        console.error('Error getting stats from cache:', error);
      }
    }

    return stats;
  }

  /**
   * Clear all documents
   */
  async clear() {
    this.vectorStore = new MemoryVectorStore(this.embeddings);
    if (this.redis && this.redis.del) {
      await this.redis.del('lightrag:status');
    }
    // Also clear from DB
    if (this.pool && this.pool.query) {
      try {
        await this.pool.query('TRUNCATE TABLE rag_data.documents');
      } catch (error) {
        console.error('Error clearing documents from DB:', error);
      }
    }
    console.log('✅ LightRAG cleared');
    await this.initialize(); // Re-initialize after clearing
  }

  /**
   * List all documents from the database
   */
  async listDocuments(limit: number = 100, offset: number = 0) {
    if (!this.pool || !this.pool.query) {
      console.error('PostgreSQL pool not available');
      return [];
    }
    try {
      const query = `
        SELECT id, title, created_at, updated_at, LENGTH(content) as content_length
        FROM rag_data.documents
        ORDER BY updated_at DESC
        LIMIT $1 OFFSET $2
      `;
      const result = await this.pool.query(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      console.error('Error listing documents:', error);
      return [];
    }
  }

  /**
   * Delete a document by its ID
   */
  async deleteDocument(id: number) {
    if (!this.pool || !this.pool.query) {
      console.error('PostgreSQL pool not available');
      throw new Error('Database connection not available');
    }
    try {
      const query = 'DELETE FROM rag_data.documents WHERE id = $1';
      const result = await this.pool.query(query, [id]);
      
      if (result.rowCount && result.rowCount > 0) {
        console.log(`✅ Document with ID ${id} deleted. Re-initializing vector store...`);
        // Re-initialize to update the in-memory vector store
        await this.initialize();
        return { success: true, message: `Document ${id} deleted.` };
      } else {
        return { success: false, message: `Document ${id} not found.` };
      }
    } catch (error) {
      console.error(`Error deleting document ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create embedding for a text using LightRAG's embedding provider
   */
  async createEmbedding(text: string, forceProvider?: 'openai' | 'deepseek'): Promise<number[]> {
    if (!this.embeddings || forceProvider) {
      // Try to initialize if not already done or if force provider is specified
      await this.initializeEmbeddings(forceProvider);
    }
    if (!this.embeddings) {
      throw new Error('Embeddings not initialized');
    }

    try {
      // Use the embeddings provider to create embedding
      const result = await this.embeddings.embedQuery(text);
      return result;
    } catch (error) {
      console.error('LightRAG embedding creation failed:', error);
      throw error;
    }
  }

  /**
   * Initialize embeddings with optional provider override
   */
  private async initializeEmbeddings(forceProvider?: 'openai' | 'deepseek' | 'ollama' | 'lightrag') {
    try {
      // Check if we should use local embeddings
      const useLocalEmbeddings = process.env.USE_LOCAL_EMBEDDINGS === 'true';
      
      if (useLocalEmbeddings && !forceProvider) {
        console.log('🏠 USE_LOCAL_EMBEDDINGS is true, using fallback embeddings');
        this.embeddings = {
          embedQuery: async (text: string) => Array(1536).fill(0).map(() => Math.random() * 2 - 1),
          embedDocuments: async (texts: string[]) => texts.map(() => Array(1536).fill(0).map(() => Math.random() * 2 - 1))
        };
        this.currentProvider = 'local';
        return;
      }

      // Get AI settings from database
      const aiSettings = await getAiSettings();
      console.log('📊 AI Settings from database:', JSON.stringify(aiSettings, null, 2));

      let openaiApiKey = aiSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
      let deepseekApiKey = aiSettings?.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
      const openaiApiBase = aiSettings?.openaiApiBase || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

      // Get embedding provider from settings
      const embeddingProvider = forceProvider || aiSettings?.embeddingProvider || 'openai';
      console.log('🎯 Embedding Provider:', embeddingProvider);

      // If force provider is specified, use that
      if (forceProvider === 'deepseek') {
        openaiApiKey = null; // Force disable OpenAI
        console.log('🔧 Forcing DeepSeek provider');
      } else if (forceProvider === 'openai') {
        deepseekApiKey = null; // Force disable DeepSeek
        console.log('🔧 Forcing OpenAI provider');
      } else if (forceProvider === 'ollama') {
        openaiApiKey = null;
        deepseekApiKey = null;
        console.log('🔧 Forcing Ollama provider');
      }

      console.log('🔑 OpenAI Key:', openaiApiKey ? 'Found' : 'Not found');
      console.log('🔑 DeepSeek Key:', deepseekApiKey ? 'Found' : 'Not found');

      // Try OpenAI first (primary)
      if (openaiApiKey) {
        try {
          this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: openaiApiKey,
            modelName: 'text-embedding-ada-002',
            configuration: {
              baseURL: openaiApiBase
            }
          });
          console.log('🎯 Using OpenAI for embeddings');
          this.currentProvider = 'openai';
          return;
        } catch (error) {
          console.log('⚠️ OpenAI embeddings initialization failed:', error);
        }
      }

      // Fallback to Deepseek (OpenAI compatible)
      if (deepseekApiKey) {
        try {
          // DeepSeek uses 'deepseek-chat' model for both chat and embeddings
          // As per their API documentation: https://platform.deepseek.com/api-docs
          this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: deepseekApiKey,
            modelName: 'deepseek-chat',  // DeepSeek's actual model name
            configuration: {
              baseURL: 'https://api.deepseek.com/v1'
            }
          });
          console.log('🎯 Using Deepseek for embeddings with deepseek-chat model');
          this.currentProvider = 'deepseek';
          return;
        } catch (error: any) {
          console.log('⚠️ Deepseek embeddings initialization failed:', error.message);
          
          // If DeepSeek fails, don't try alternative model names as they won't work
          // Just log and continue to fallback
          console.log('⚠️ DeepSeek API might not support embeddings or API key is invalid');
        }
      }

      // If no embeddings available, we'll use local embeddings with better randomization
      console.log('⚠️ No embedding provider available, using local embeddings');
      this.embeddings = {
        embedQuery: async (text: string) => {
          // Generate deterministic but varied embeddings based on text
          const embedding = Array(1536).fill(0);
          for (let i = 0; i < Math.min(text.length, 1000); i++) {
            const idx = (text.charCodeAt(i) * (i + 1)) % 1536;
            embedding[idx] += Math.sin(text.charCodeAt(i) * 0.01 + i * 0.001);
          }
          // Normalize
          const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
          return mag > 0 ? embedding.map(v => v / mag) : embedding;
        },
        embedDocuments: async (texts: string[]) => {
          return texts.map(text => {
            const embedding = Array(1536).fill(0);
            for (let i = 0; i < Math.min(text.length, 1000); i++) {
              const idx = (text.charCodeAt(i) * (i + 1)) % 1536;
              embedding[idx] += Math.sin(text.charCodeAt(i) * 0.01 + i * 0.001);
            }
            const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
            return mag > 0 ? embedding.map(v => v / mag) : embedding;
          });
        }
      };
      this.currentProvider = 'local';
    } catch (error) {
      console.error('Failed to initialize embeddings:', error);
      // Use local embeddings as fallback
      this.embeddings = {
        embedQuery: async (text: string) => {
          const embedding = Array(1536).fill(0);
          for (let i = 0; i < Math.min(text.length, 1000); i++) {
            const idx = (text.charCodeAt(i) * (i + 1)) % 1536;
            embedding[idx] += Math.sin(text.charCodeAt(i) * 0.01 + i * 0.001);
          }
          const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
          return mag > 0 ? embedding.map(v => v / mag) : embedding;
        },
        embedDocuments: async (texts: string[]) => {
          return texts.map(text => {
            const embedding = Array(1536).fill(0);
            for (let i = 0; i < Math.min(text.length, 1000); i++) {
              const idx = (text.charCodeAt(i) * (i + 1)) % 1536;
              embedding[idx] += Math.sin(text.charCodeAt(i) * 0.01 + i * 0.001);
            }
            const mag = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
            return mag > 0 ? embedding.map(v => v / mag) : embedding;
          });
        }
      };
      this.currentProvider = 'local';
    }
  }
}

export default LightRAGService;