// LightRAG Service for ASB Dashboard
const { OpenAI } = require('openai');
const { createHash } = require('crypto');
const { Pool } = require('pg');
const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

class LightRAGService {
  constructor() {
    // Initialize PostgreSQL
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
    });

    // Initialize Redis
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '2')
    });

    // Initialize OpenAI (or Claude)
    this.aiClient = null;
    this.initializeAI();

    // Graph structure for relationships
    this.graphCache = new Map();
  }

  async initializeAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        const { OpenAI } = require('openai');
        this.aiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        this.aiProvider = 'openai';
      } else if (process.env.CLAUDE_API_KEY) {
        const Anthropic = require('@anthropic-ai/sdk');
        this.aiClient = new Anthropic({
          apiKey: process.env.CLAUDE_API_KEY
        });
        this.aiProvider = 'claude';
      }
      console.log(`✅ LightRAG AI Provider: ${this.aiProvider}`);
    } catch (error) {
      console.error('❌ Failed to initialize AI:', error);
    }
  }

  /**
   * Extract entities and relationships from text
   */
  async extractEntitiesAndRelationships(text, metadata = {}) {
    if (!this.aiClient) {
      throw new Error('AI client not initialized');
    }

    const prompt = `Analyze the following text and extract:
1. KEY ENTITIES (people, organizations, concepts, laws, regulations)
2. RELATIONSHIPS between entities
3. IMPORTANT FACTS and their connections

Text: ${text}

Format your response as JSON:
{
  "entities": [
    {"name": "entity name", "type": "person|organization|concept|law|regulation", "description": "brief description"}
  ],
  "relationships": [
    {"source": "entity1", "target": "entity2", "type": "relationship type", "description": "relationship description"}
  ],
  "facts": [
    {"fact": "important fact", "relatedEntities": ["entity1", "entity2"]}
  ]
}`;

    try {
      let response;
      
      if (this.aiProvider === 'openai') {
        const completion = await this.aiClient.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a knowledge graph extraction expert. Extract entities and relationships from text.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3
        });
        response = completion.choices[0].message.content;
      } else if (this.aiProvider === 'claude') {
        const message = await this.aiClient.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        });
        response = message.content[0].text;
      }

      // Parse JSON response
      const extracted = JSON.parse(response);
      
      // Add metadata
      extracted.metadata = {
        ...metadata,
        extractedAt: new Date().toISOString(),
        textHash: this.generateHash(text)
      };

      return extracted;
    } catch (error) {
      console.error('Entity extraction error:', error);
      // Fallback to simple extraction
      return this.simpleEntityExtraction(text, metadata);
    }
  }

  /**
   * Simple entity extraction without AI
   */
  simpleEntityExtraction(text, metadata) {
    const entities = [];
    const relationships = [];
    
    // Extract potential entities (capitalized words, patterns)
    const entityPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, // Proper nouns
      /\b\d+\.?\s*[Mm]adde\b/g, // Law articles
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\b\d{4}\/\d+\b/g, // Law numbers
    ];

    const foundEntities = new Set();
    
    entityPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => foundEntities.add(match));
    });

    foundEntities.forEach(entity => {
      entities.push({
        name: entity,
        type: this.guessEntityType(entity),
        description: ''
      });
    });

    return {
      entities,
      relationships,
      facts: [],
      metadata: {
        ...metadata,
        extractedAt: new Date().toISOString(),
        textHash: this.generateHash(text),
        method: 'simple'
      }
    };
  }

  /**
   * Guess entity type from name
   */
  guessEntityType(name) {
    if (/\b\d+\.?\s*[Mm]adde\b/.test(name) || /\b\d{4}\/\d+\b/.test(name)) {
      return 'law';
    } else if (/\b[A-Z]{2,}\b/.test(name)) {
      return 'organization';
    } else if (/\b(Kanun|Yönetmelik|Tebliğ|Özelge)\b/i.test(name)) {
      return 'regulation';
    } else {
      return 'concept';
    }
  }

  /**
   * Store extracted graph in database
   */
  async storeGraphData(graphData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Store entities
      for (const entity of graphData.entities) {
        const entityId = this.generateHash(entity.name);
        
        await client.query(`
          INSERT INTO lightrag_entities (id, name, type, description, metadata)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE
          SET description = EXCLUDED.description,
              metadata = EXCLUDED.metadata
        `, [entityId, entity.name, entity.type, entity.description, JSON.stringify(entity)]);
      }

      // Store relationships
      for (const rel of graphData.relationships) {
        const sourceId = this.generateHash(rel.source);
        const targetId = this.generateHash(rel.target);
        const relId = this.generateHash(`${rel.source}-${rel.type}-${rel.target}`);
        
        await client.query(`
          INSERT INTO lightrag_relationships (id, source_id, target_id, type, description, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE
          SET description = EXCLUDED.description,
              metadata = EXCLUDED.metadata
        `, [relId, sourceId, targetId, rel.type, rel.description, JSON.stringify(rel)]);
      }

      // Store facts
      for (const fact of graphData.facts) {
        const factId = this.generateHash(fact.fact);
        
        await client.query(`
          INSERT INTO lightrag_facts (id, fact, related_entities, metadata)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO NOTHING
        `, [factId, fact.fact, JSON.stringify(fact.relatedEntities), JSON.stringify(fact)]);
      }

      await client.query('COMMIT');
      
      // Update Redis cache
      await this.updateGraphCache(graphData);
      
      return { success: true, processed: graphData };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to store graph data:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update Redis cache with graph data
   */
  async updateGraphCache(graphData) {
    const cacheKey = 'lightrag:graph:latest';
    await this.redis.setex(cacheKey, 3600, JSON.stringify(graphData));
    
    // Update entity index
    for (const entity of graphData.entities) {
      const entityKey = `lightrag:entity:${this.generateHash(entity.name)}`;
      await this.redis.setex(entityKey, 3600, JSON.stringify(entity));
    }
  }

  /**
   * Query graph for related information
   */
  async queryGraph(query, limit = 10) {
    // First, try to find relevant entities
    const searchQuery = `
      SELECT 
        e.id,
        e.name,
        e.type,
        e.description,
        e.metadata,
        ts_rank(to_tsvector('turkish', e.name || ' ' || COALESCE(e.description, '')), 
                plainto_tsquery('turkish', $1)) as rank
      FROM lightrag_entities e
      WHERE to_tsvector('turkish', e.name || ' ' || COALESCE(e.description, '')) @@ 
            plainto_tsquery('turkish', $1)
      ORDER BY rank DESC
      LIMIT $2
    `;
    
    const entityResults = await this.pool.query(searchQuery, [query, limit]);
    
    if (entityResults.rows.length === 0) {
      return { entities: [], relationships: [], facts: [] };
    }

    // Get relationships for found entities
    const entityIds = entityResults.rows.map(e => e.id);
    
    const relQuery = `
      SELECT 
        r.*,
        se.name as source_name,
        te.name as target_name
      FROM lightrag_relationships r
      JOIN lightrag_entities se ON r.source_id = se.id
      JOIN lightrag_entities te ON r.target_id = te.id
      WHERE r.source_id = ANY($1) OR r.target_id = ANY($1)
      LIMIT $2
    `;
    
    const relResults = await this.pool.query(relQuery, [entityIds, limit * 2]);
    
    // Get related facts
    const factQuery = `
      SELECT * FROM lightrag_facts
      WHERE related_entities::jsonb ?| $1
      LIMIT $2
    `;
    
    const entityNames = entityResults.rows.map(e => e.name);
    const factResults = await this.pool.query(factQuery, [entityNames, limit]);
    
    return {
      entities: entityResults.rows,
      relationships: relResults.rows,
      facts: factResults.rows
    };
  }

  /**
   * Build knowledge graph visualization data
   */
  async getGraphVisualization(centerEntity = null, depth = 2) {
    const nodes = new Map();
    const edges = [];
    const visited = new Set();

    async function expandNode(entityId, currentDepth) {
      if (currentDepth > depth || visited.has(entityId)) return;
      visited.add(entityId);

      // Get entity
      const entityQuery = await this.pool.query(
        'SELECT * FROM lightrag_entities WHERE id = $1',
        [entityId]
      );
      
      if (entityQuery.rows.length === 0) return;
      
      const entity = entityQuery.rows[0];
      nodes.set(entity.id, {
        id: entity.id,
        label: entity.name,
        type: entity.type,
        level: currentDepth
      });

      // Get relationships
      const relQuery = await this.pool.query(`
        SELECT * FROM lightrag_relationships
        WHERE source_id = $1 OR target_id = $1
      `, [entityId]);

      for (const rel of relQuery.rows) {
        edges.push({
          source: rel.source_id,
          target: rel.target_id,
          label: rel.type,
          id: rel.id
        });

        // Recursively expand
        const nextId = rel.source_id === entityId ? rel.target_id : rel.source_id;
        await expandNode(nextId, currentDepth + 1);
      }
    }

    if (centerEntity) {
      const centerQuery = await this.pool.query(
        'SELECT id FROM lightrag_entities WHERE name = $1',
        [centerEntity]
      );
      
      if (centerQuery.rows.length > 0) {
        await expandNode(centerQuery.rows[0].id, 0);
      }
    } else {
      // Get top entities
      const topQuery = await this.pool.query(`
        SELECT e.*, COUNT(r.id) as connection_count
        FROM lightrag_entities e
        LEFT JOIN lightrag_relationships r ON e.id = r.source_id OR e.id = r.target_id
        GROUP BY e.id
        ORDER BY connection_count DESC
        LIMIT 10
      `);

      for (const entity of topQuery.rows) {
        await expandNode(entity.id, 0);
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges: edges
    };
  }

  /**
   * Generate hash for consistent IDs
   */
  generateHash(text) {
    return createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  /**
   * Get statistics
   */
  async getStats() {
    const stats = await this.pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM lightrag_entities) as entity_count,
        (SELECT COUNT(*) FROM lightrag_relationships) as relationship_count,
        (SELECT COUNT(*) FROM lightrag_facts) as fact_count,
        (SELECT COUNT(DISTINCT type) FROM lightrag_entities) as entity_types
    `);

    return stats.rows[0];
  }
}

module.exports = LightRAGService;