const neo4j = require('neo4j-driver');

class LightRAGService {
  constructor(config) {
    this.driver = neo4j.driver(
      config.uri || 'bolt://localhost:7687',
      neo4j.auth.basic(config.user || 'neo4j', config.password || 'password')
    );
  }

  async extract(text) {
    // Entity extraction logic
    const entities = await this.extractEntities(text);
    const relationships = await this.extractRelationships(text, entities);
    const facts = await this.extractFacts(text);
    
    return { entities, relationships, facts };
  }

  async extractEntities(text) {
    // Basit entity extraction (production'da NLP kullanılmalı)
    const entities = [];
    
    // Patterns for Turkish tax entities
    const patterns = {
      TAX_TYPE: /\b(KDV|ÖTV|MTV|Gelir Vergisi|Kurumlar Vergisi)\b/gi,
      ORGANIZATION: /\b(GİB|Gelir İdaresi|Maliye Bakanlığı|Vergi Dairesi)\b/gi,
      LAW: /\b(\d{4}\s*sayılı\s*\w+\s*Kanun|\w+\s*Kanunu)\b/gi,
      REGULATION: /\b(Tebliğ|Yönetmelik|Genelge|Özelge)\b/gi
    };
    
    let entityId = 1;
    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        entities.push({
          id: entityId++,
          name: match[0].trim(),
          type: type,
          position: match.index
        });
      }
    }
    
    return entities;
  }

  async extractRelationships(text, entities) {
    const relationships = [];
    
    // Basit ilişki tespiti
    for (let i = 0; i < entities.length - 1; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];
        
        // Aynı cümlede geçiyorlarsa ilişki var sayalım
        const distance = Math.abs(e1.position - e2.position);
        if (distance < 200) {
          relationships.push({
            source: e1.id,
            target: e2.id,
            type: 'RELATED_TO',
            weight: 1 - (distance / 200)
          });
        }
      }
    }
    
    return relationships;
  }

  async extractFacts(text) {
    const facts = [];
    
    // Basit fact extraction patterns
    const factPatterns = [
      /\b(\w+)\s*oranı\s*%?\s*(\d+)/gi,
      /\b(\w+)\s*için\s*gerekli\s*belgeler\s*[:]\s*([^.]+)/gi,
      /\b(\w+)\s*süresi\s*(\d+\s*gün|ay|yıl)/gi
    ];
    
    for (const pattern of factPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        facts.push({
          fact: match[0].trim(),
          subject: match[1],
          value: match[2],
          confidence: 0.8
        });
      }
    }
    
    return facts;
  }

  async store(extraction) {
    const session = this.driver.session();
    
    try {
      // Store entities
      for (const entity of extraction.entities) {
        await session.run(
          'MERGE (e:Entity {name: $name}) SET e.type = $type RETURN e',
          { name: entity.name, type: entity.type }
        );
      }
      
      // Store relationships
      for (const rel of extraction.relationships) {
        const sourceEntity = extraction.entities.find(e => e.id === rel.source);
        const targetEntity = extraction.entities.find(e => e.id === rel.target);
        
        await session.run(
          `MATCH (a:Entity {name: $sourceName})
           MATCH (b:Entity {name: $targetName})
           MERGE (a)-[r:${rel.type}]->(b)
           SET r.weight = $weight
           RETURN r`,
          {
            sourceName: sourceEntity.name,
            targetName: targetEntity.name,
            weight: rel.weight
          }
        );
      }
      
      // Store facts
      for (const fact of extraction.facts) {
        await session.run(
          'CREATE (f:Fact {text: $text, subject: $subject, value: $value, confidence: $confidence})',
          fact
        );
      }
      
      return { success: true };
    } finally {
      await session.close();
    }
  }

  async query(cypher, params = {}) {
    const session = this.driver.session();
    
    try {
      const result = await session.run(cypher, params);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async getStats() {
    const stats = await this.query(`
      MATCH (e:Entity)
      WITH count(e) as entity_count
      MATCH ()-[r]->()
      WITH entity_count, count(r) as relationship_count
      MATCH (f:Fact)
      WITH entity_count, relationship_count, count(f) as fact_count
      MATCH (e:Entity)
      RETURN entity_count, relationship_count, fact_count, count(DISTINCT e.type) as entity_types
    `);
    
    return stats[0] || {
      entity_count: 0,
      relationship_count: 0,
      fact_count: 0,
      entity_types: 0
    };
  }

  async close() {
    await this.driver.close();
  }
}

module.exports = LightRAGService;
