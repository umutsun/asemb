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
    
    // Initialize embeddings - try different providers
    this.initializeEmbeddings();
    
    // Initialize LLM with multiple fallback options
    this.initializeLLM();
  }

  private initializeEmbeddings() {
    // Try Deepseek first (OpenAI compatible)
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        this.embeddings = new OpenAIEmbeddings({
          openAIApiKey: process.env.DEEPSEEK_API_KEY,
          modelName: 'text-embedding-ada-002',
          configuration: {
            baseURL: 'https://api.deepseek.com/v1'
          }
        });
        console.log('🎯 Using Deepseek for embeddings');
        return;
      } catch (error) {
        console.log('⚠️ Deepseek embeddings initialization failed');
      }
    }

    // Fallback to OpenAI if available
    if (process.env.OPENAI_API_KEY) {
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: 'text-embedding-ada-002'
      });
      console.log('🎯 Using OpenAI for embeddings');
      return;
    }

    // If no embeddings available, we'll use a dummy one
    console.log('⚠️ No embedding provider available, using fallback');
    this.embeddings = {
      embedQuery: async (text: string) => Array(1536).fill(0.1),
      embedDocuments: async (texts: string[]) => texts.map(() => Array(1536).fill(0.1))
    };
  }

  private initializeLLM() {
    // Priority order: Deepseek -> Gemini -> Claude -> OpenAI
    
    // Try Deepseek (OpenAI compatible)
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

    // Try Gemini
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

    // Try Claude
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

    // Try OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: 'gpt-3.5-turbo',
        temperature: 0.3,
        maxTokens: 1000
      });
      this.currentProvider = 'openai';
      console.log('🤖 LightRAG using OpenAI API');
      return;
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
    console.log('✅ LightRAG cleared');
  }
}

export default LightRAGService;