// LightRAG Integration Service
// Combines pgvector embeddings with graph-based entity relationships

const { Pool } = require('pg');
const OpenAI = require('openai');
const neo4j = require('neo4j-driver');

// PostgreSQL connection pool
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // max number of clients in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // how long to wait for a client to connect
});

class LightRAGService {
  constructor() {
    // PostgreSQL with pgvector
    this.pgPool = pgPool;
    
    // OpenAI for embeddings and entity extraction
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Neo4j for graph storage (optional - can use in-memory)
    this.neo4jDriver = process.env.NEO4J_URI ? 
      neo4j.driver(
        process.env.NEO4J_URI,
        neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
      ) : null;
    
    // In-memory graph as fallback
    this.inMemoryGraph = {
      entities: new Map(),
      relationships: new Map()
    };
  }

  async initialize() {
    // Test the connection pool
    await this.pgPool.query('SELECT NOW()');
    console.log('✅ LightRAG initialized with pgvector pool');
    
    if (this.neo4jDriver) {
      const session = this.neo4jDriver.session();
      await session.run('RETURN 1');
      await session.close();
      console.log('✅ Neo4j connected');
    } else {
      console.log('⚠️  Using in-memory graph storage');
    }
  }

  // Extract entities from text using GPT
  async extractEntities(text) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'system',
        content: 'Extract entities (people, organizations, locations, concepts) and their relationships from the text. Return as JSON.'
      }, {
        role: 'user',
        content: text
      }],
      temperature: 0,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response.choices[0].message.content);
  }

  // Build knowledge graph from documents
  async buildKnowledgeGraph() {
    console.log('🔄 Building knowledge graph from documents...');
    
    // Get all documents from pgvector
    const result = await this.pgPool.query(`
      SELECT id, title, content, metadata 
      FROM rag_data.documents 
      LIMIT 100
    `);
    
    for (const doc of result.rows) {
      // Extract entities
      const entities = await this.extractEntities(doc.content);
      
      // Store in graph
      if (this.neo4jDriver) {
        await this.storeInNeo4j(doc.id, entities);
      } else {
        this.storeInMemory(doc.id, entities);
      }
    }
    
    console.log('✅ Knowledge graph built');
  }

  // Store entities in Neo4j
  async storeInNeo4j(docId, entities) {
    const session = this.neo4jDriver.session();
    
    try {
      // Create document node
      await session.run(
        'CREATE (d:Document {id: $id}) RETURN d',
        { id: docId }
      );
      
      // Create entity nodes and relationships
      for (const entity of entities.entities || []) {
        await session.run(`
          MATCH (d:Document {id: $docId})
          MERGE (e:Entity {name: $name, type: $type})
          CREATE (d)-[:CONTAINS]->(e)
        `, {
          docId,
          name: entity.name,
          type: entity.type
        });
      }
      
      // Create entity relationships
      for (const rel of entities.relationships || []) {
        await session.run(`
          MERGE (e1:Entity {name: $from})
          MERGE (e2:Entity {name: $to})
          CREATE (e1)-[:${rel.type}]->(e2)
        `, {
          from: rel.from,
          to: rel.to
        });
      }
    } finally {
      await session.close();
    }
  }

  // Store entities in memory
  storeInMemory(docId, entities) {
    // Store entities
    for (const entity of entities.entities || []) {
      const key = `${entity.type}:${entity.name}`;
      if (!this.inMemoryGraph.entities.has(key)) {
        this.inMemoryGraph.entities.set(key, {
          ...entity,
          documents: []
        });
      }
      this.inMemoryGraph.entities.get(key).documents.push(docId);
    }
    
    // Store relationships
    for (const rel of entities.relationships || []) {
      const key = `${rel.from}-${rel.type}-${rel.to}`;
      this.inMemoryGraph.relationships.set(key, rel);
    }
  }

  // Advanced RAG query with graph context
  async query(question, options = {}) {
    const {
      useGraph = true,
      topK = 5,
      threshold = 0.7
    } = options;
    
    // 1. Generate embedding for question
    const embedding = await this.generateEmbedding(question);
    
    // 2. Vector search in pgvector
    const vectorResults = await this.pgPool.query(`
      SELECT id, title, content, metadata,
             1 - (embedding <=> $1::vector) as similarity
      FROM rag_data.documents
      WHERE 1 - (embedding <=> $1::vector) > $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [`[${embedding.join(',')}]`, threshold, topK]);
    
    // 3. Extract entities from question
    const questionEntities = await this.extractEntities(question);
    
    // 4. Find related entities in graph
    let graphContext = [];
    if (useGraph) {
      graphContext = await this.getGraphContext(questionEntities);
    }
    
    // 5. Combine vector search and graph results
    const context = this.combineContext(vectorResults.rows, graphContext);
    
    // 6. Generate answer using combined context
    const answer = await this.generateAnswer(question, context);
    
    return {
      answer,
      sources: vectorResults.rows.map(r => ({
        title: r.title,
        similarity: r.similarity,
        metadata: r.metadata
      })),
      entities: graphContext,
      tokens_used: this.estimateTokens(context + answer)
    };
  }

  // Get related entities from graph
  async getGraphContext(entities) {
    if (this.neo4jDriver) {
      const session = this.neo4jDriver.session();
      try {
        const result = await session.run(`
          MATCH (e:Entity)-[r]-(related:Entity)
          WHERE e.name IN $names
          RETURN e, r, related
          LIMIT 20
        `, { names: entities.entities?.map(e => e.name) || [] });
        
        return result.records.map(record => ({
          entity: record.get('e').properties,
          relationship: record.get('r').type,
          related: record.get('related').properties
        }));
      } finally {
        await session.close();
      }
    } else {
      // Use in-memory graph
      const results = [];
      for (const entity of entities.entities || []) {
        const key = `${entity.type}:${entity.name}`;
        if (this.inMemoryGraph.entities.has(key)) {
          results.push(this.inMemoryGraph.entities.get(key));
        }
      }
      return results;
    }
  }

  // Combine vector and graph context
  combineContext(vectorResults, graphContext) {
    let context = '## Relevant Documents:\n';
    
    for (const doc of vectorResults) {
      context += `
### ${doc.title}\n${doc.content.substring(0, 500)}...\n`;
    }
    
    if (graphContext.length > 0) {
      context += '\n## Related Entities:\n';
      for (const entity of graphContext) {
        context += `- ${entity.entity?.name || entity.name}: ${entity.entity?.type || entity.type}\n`;
      }
    }
    
    return context;
  }

  // Generate embedding
  async generateEmbedding(text) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  }

  // Generate answer
  async generateAnswer(question, context) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{
        role: 'system',
        content: 'Answer the question based on the provided context. Be specific and cite sources when possible.'
      }, {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`
      }],
      temperature: 0.7,
      max_tokens: 500
    });
    
    return response.choices[0].message.content;
  }

  // Estimate tokens
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  // Index new document
  async indexDocument(title, content, metadata = {}) {
    // Generate embedding
    const embedding = await this.generateEmbedding(content);
    
    // Store in pgvector
    const result = await this.pgPool.query(`
      INSERT INTO rag_data.documents (title, content, metadata, embedding, indexed_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [title, content, JSON.stringify(metadata), `[${embedding.join(',')}]`]);
    
    // Extract and store entities
    const entities = await this.extractEntities(content);
    if (this.neo4jDriver) {
      await this.storeInNeo4j(result.rows[0].id, entities);
    } else {
      this.storeInMemory(result.rows[0].id, entities);
    }
    
    return result.rows[0].id;
  }

  // Get entity graph for visualization
  async getEntityGraph(limit = 50) {
    if (this.neo4jDriver) {
      const session = this.neo4jDriver.session();
      try {
        const result = await session.run(`
          MATCH (e1:Entity)-[r]-(e2:Entity)
          RETURN e1, r, e2
          LIMIT $limit
        `, { limit });
        
        const nodes = new Map();
        const edges = [];
        
        result.records.forEach(record => {
          const e1 = record.get('e1').properties;
          const e2 = record.get('e2').properties;
          const rel = record.get('r');
          
          nodes.set(e1.name, e1);
          nodes.set(e2.name, e2);
          edges.push({
            source: e1.name,
            target: e2.name,
            type: rel.type
          });
        });
        
        return {
          nodes: Array.from(nodes.values()),
          edges
        };
      } finally {
        await session.close();
      }
    } else {
      // Return from in-memory graph
      return {
        nodes: Array.from(this.inMemoryGraph.entities.values()),
        edges: Array.from(this.inMemoryGraph.relationships.values())
      };
    }
  }

  // Cleanup
  async close() {
    await this.pgPool.end();
    if (this.neo4jDriver) {
      await this.neo4jDriver.close();
    }
  }
}

module.exports = LightRAGService;
