const { OpenAI } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { Document } = require('langchain/document');
const db = require('../config/database');
const redis = require('../config/redis');

class RAGService {
  constructor() {
    this.llm = new OpenAI({
      temperature: 0,
      modelName: 'gpt-3.5-turbo',
      openAIApiKey: process.env.OPENAI_API_KEY
    });
    
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', '']
    });
    
    this.embeddingModel = new OpenAI({
      modelName: 'text-embedding-ada-002',
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async chunkDocument(content, metadata = {}) {
    try {
      const doc = new Document({
        pageContent: content,
        metadata
      });
      
      const chunks = await this.splitter.splitDocuments([doc]);
      
      return chunks.map((chunk, index) => ({
        content: chunk.pageContent,
        metadata: {
          ...chunk.metadata,
          chunkIndex: index,
          chunkSize: chunk.pageContent.length,
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Error chunking document:', error);
      throw error;
    }
  }
  
  async storeChunks(chunks, documentId) {
    try {
      const storedChunks = [];
      
      for (const chunk of chunks) {
        const embedding = await this.generateEmbedding(chunk.content);
        
        const result = await db.query(
          `INSERT INTO embeddings (document_id, content, embedding, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [documentId, chunk.content, JSON.stringify(embedding), JSON.stringify(chunk.metadata)]
        );
        
        storedChunks.push({
          id: result.rows[0].id,
          ...chunk
        });
      }
      
      await redis.incr('metrics:chunks_stored');
      
      return storedChunks;
    } catch (error) {
      console.error('Error storing chunks:', error);
      throw error;
    }
  }
  
  async generateEmbedding(text) {
    try {
      const cacheKey = `embedding:${Buffer.from(text).toString('base64').substring(0, 50)}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        await redis.incr('metrics:cache_hits');
        return JSON.parse(cached);
      }
      
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: text
        })
      });
      
      const data = await response.json();
      const embedding = data.data[0].embedding;
      
      await redis.setex(cacheKey, 3600, JSON.stringify(embedding));
      await redis.incr('metrics:embeddings_generated');
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
  
  async retrieveContext(query, limit = 5, threshold = 0.7) {
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      const result = await db.query(
        `SELECT 
          id,
          document_id,
          content,
          metadata,
          1 - (embedding <=> $1::vector) as similarity
        FROM embeddings
        WHERE 1 - (embedding <=> $1::vector) > $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
        [JSON.stringify(queryEmbedding), threshold, limit]
      );
      
      await redis.incr('metrics:searches');
      
      return result.rows.map(row => ({
        id: row.id,
        documentId: row.document_id,
        content: row.content,
        metadata: JSON.parse(row.metadata),
        similarity: row.similarity
      }));
    } catch (error) {
      console.error('Error retrieving context:', error);
      throw error;
    }
  }
  
  async query(question, options = {}) {
    try {
      const {
        limit = 5,
        threshold = 0.7,
        includeSource = true,
        checkHallucination = true
      } = options;
      
      const contexts = await this.retrieveContext(question, limit, threshold);
      
      if (contexts.length === 0) {
        return {
          answer: "I couldn't find relevant information to answer your question.",
          sources: [],
          confidence: 0
        };
      }
      
      const contextText = contexts
        .map(ctx => ctx.content)
        .join('\n\n---\n\n');
      
      const prompt = `Based on the following context, answer the question. If the answer cannot be found in the context, say so.

Context:
${contextText}

Question: ${question}

Answer:`;
      
      const response = await this.llm.call(prompt);
      
      let confidence = this.calculateConfidence(contexts);
      
      if (checkHallucination) {
        const isHallucinated = await this.checkHallucination(response, contexts);
        if (isHallucinated) {
          confidence *= 0.5;
        }
      }
      
      const result = {
        answer: response,
        confidence,
        timestamp: new Date().toISOString()
      };
      
      if (includeSource) {
        result.sources = contexts.map(ctx => ({
          documentId: ctx.documentId,
          excerpt: ctx.content.substring(0, 200) + '...',
          similarity: ctx.similarity
        }));
      }
      
      await this.logQuery(question, result);
      
      return result;
    } catch (error) {
      console.error('Error processing RAG query:', error);
      throw error;
    }
  }
  
  calculateConfidence(contexts) {
    if (contexts.length === 0) return 0;
    
    const avgSimilarity = contexts.reduce((sum, ctx) => sum + ctx.similarity, 0) / contexts.length;
    const coverage = Math.min(contexts.length / 3, 1);
    
    return avgSimilarity * coverage;
  }
  
  async checkHallucination(answer, contexts) {
    try {
      const contextText = contexts.map(ctx => ctx.content).join(' ');
      
      const verificationPrompt = `Given the following context and answer, determine if the answer contains information not present in the context.

Context: ${contextText}

Answer: ${answer}

Does the answer contain information not in the context? Reply with only "yes" or "no".`;
      
      const verification = await this.llm.call(verificationPrompt);
      
      return verification.toLowerCase().includes('yes');
    } catch (error) {
      console.error('Error checking hallucination:', error);
      return false;
    }
  }
  
  async logQuery(question, result) {
    try {
      await db.query(
        `INSERT INTO search_history (query, answer, confidence, sources, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          question,
          result.answer,
          result.confidence,
          JSON.stringify(result.sources || []),
          result.timestamp
        ]
      );
      
      await redis.publish('asb:rag:query', JSON.stringify({
        question,
        confidence: result.confidence,
        timestamp: result.timestamp
      }));
    } catch (error) {
      console.error('Error logging query:', error);
    }
  }
  
  async hybridSearch(query, options = {}) {
    try {
      const {
        vectorWeight = 0.7,
        keywordWeight = 0.3,
        limit = 10
      } = options;
      
      const vectorResults = await this.retrieveContext(query, limit);
      
      const keywordResults = await db.query(
        `SELECT 
          id,
          document_id,
          content,
          metadata,
          ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
        FROM embeddings
        WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2`,
        [query, limit]
      );
      
      const combined = new Map();
      
      vectorResults.forEach(result => {
        combined.set(result.id, {
          ...result,
          score: result.similarity * vectorWeight
        });
      });
      
      keywordResults.rows.forEach(result => {
        const existing = combined.get(result.id);
        const keywordScore = (result.rank / 10) * keywordWeight;
        
        if (existing) {
          existing.score += keywordScore;
        } else {
          combined.set(result.id, {
            id: result.id,
            documentId: result.document_id,
            content: result.content,
            metadata: JSON.parse(result.metadata),
            score: keywordScore
          });
        }
      });
      
      return Array.from(combined.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      console.error('Error in hybrid search:', error);
      throw error;
    }
  }
}

module.exports = new RAGService();