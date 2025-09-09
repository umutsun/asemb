# 🌟 LightRAG Integration Guide for ASB

## 📊 LightRAG Nedir?

LightRAG, dökümanlar arasındaki ilişkileri graf yapısında saklayan gelişmiş bir RAG sistemidir:
- **Entity Extraction**: Dökümanlardan varlık çıkarma
- **Relationship Mapping**: Varlıklar arası ilişkileri belirleme  
- **Graph Storage**: Neo4j veya benzeri graf veritabanı
- **Multi-hop Reasoning**: Karmaşık sorular için çok adımlı akıl yürütme

## 🏗️ Mevcut Sistemle Entegrasyon

### 1. Hybrid Yaklaşım

```
┌─────────────────────────────────────────┐
│          ASB RAG System                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │   pgvector   │    │   LightRAG   │  │
│  │   (Dense)    │    │   (Graph)    │  │
│  └──────────────┘    └──────────────┘  │
│         ↓                    ↓          │
│  ┌─────────────────────────────────┐   │
│  │      Hybrid Retriever           │   │
│  └─────────────────────────────────┘   │
│                  ↓                      │
│  ┌─────────────────────────────────┐   │
│  │        LLM (GPT-3.5/4)          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 2. Node.js'de LightRAG Benzeri Implementasyon

Gemini'nin belirttiği gibi Python paketi kurulamadığı için, Node.js'de benzer bir sistem kurabiliriz:

#### A. Entity Extraction Service

```typescript
// backend/src/services/entity-extraction.service.ts
import { OpenAI } from 'openai';
import { Pool } from 'pg';

export class EntityExtractionService {
  private openai: OpenAI;
  private pool: Pool;

  async extractEntities(text: string) {
    const prompt = `
    Aşağıdaki metinden önemli varlıkları (kişi, kurum, yer, tarih, kanun, kavram) ve aralarındaki ilişkileri çıkar.
    
    Metin: ${text}
    
    JSON formatında döndür:
    {
      "entities": [
        {"id": "1", "type": "person|org|location|date|law|concept", "name": "..."}
      ],
      "relationships": [
        {"source": "1", "target": "2", "type": "ilişki_türü"}
      ]
    }
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async saveToGraph(entities: any[], relationships: any[]) {
    // PostgreSQL'de graph benzeri yapı
    for (const entity of entities) {
      await this.pool.query(`
        INSERT INTO entities (id, type, name, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET metadata = EXCLUDED.metadata
      `, [entity.id, entity.type, entity.name, JSON.stringify(entity)]);
    }

    for (const rel of relationships) {
      await this.pool.query(`
        INSERT INTO relationships (source_id, target_id, type, metadata)
        VALUES ($1, $2, $3, $4)
      `, [rel.source, rel.target, rel.type, JSON.stringify(rel)]);
    }
  }
}
```

#### B. Graph Database Schema

```sql
-- PostgreSQL'de graph benzeri yapı
CREATE TABLE IF NOT EXISTS entities (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50),
  name TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationships (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(255) REFERENCES entities(id),
  target_id VARCHAR(255) REFERENCES entities(id),
  type VARCHAR(100),
  metadata JSONB,
  weight FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entity_documents (
  entity_id VARCHAR(255) REFERENCES entities(id),
  document_id BIGINT,
  relevance_score FLOAT,
  PRIMARY KEY (entity_id, document_id)
);

-- Indexes for graph traversal
CREATE INDEX idx_relationships_source ON relationships(source_id);
CREATE INDEX idx_relationships_target ON relationships(target_id);
CREATE INDEX idx_entities_type ON entities(type);
```

#### C. Graph Query Service

```typescript
// backend/src/services/graph-query.service.ts
export class GraphQueryService {
  async findRelatedEntities(entityName: string, depth: number = 2) {
    const query = `
      WITH RECURSIVE graph_traversal AS (
        -- Starting entity
        SELECT 
          e.id, e.name, e.type, 0 as depth,
          ARRAY[e.id] as path
        FROM entities e
        WHERE e.name ILIKE $1
        
        UNION ALL
        
        -- Traverse relationships
        SELECT 
          e2.id, e2.name, e2.type, gt.depth + 1,
          gt.path || e2.id
        FROM graph_traversal gt
        JOIN relationships r ON (gt.id = r.source_id OR gt.id = r.target_id)
        JOIN entities e2 ON (
          (r.source_id = gt.id AND r.target_id = e2.id) OR
          (r.target_id = gt.id AND r.source_id = e2.id)
        )
        WHERE gt.depth < $2
          AND NOT (e2.id = ANY(gt.path))
      )
      SELECT DISTINCT * FROM graph_traversal
      ORDER BY depth, name;
    `;

    return await this.pool.query(query, [`%${entityName}%`, depth]);
  }

  async getEntityContext(entityId: string) {
    // Get all documents mentioning this entity
    const docsQuery = `
      SELECT 
        d.id, d.title, d.text, ed.relevance_score
      FROM entity_documents ed
      JOIN rag_data.documents d ON d.id = ed.document_id
      WHERE ed.entity_id = $1
      ORDER BY ed.relevance_score DESC
      LIMIT 5
    `;

    // Get all related entities
    const relQuery = `
      SELECT 
        e1.name as source_name,
        r.type as relationship,
        e2.name as target_name
      FROM relationships r
      JOIN entities e1 ON r.source_id = e1.id
      JOIN entities e2 ON r.target_id = e2.id
      WHERE r.source_id = $1 OR r.target_id = $1
    `;

    const [docs, rels] = await Promise.all([
      this.pool.query(docsQuery, [entityId]),
      this.pool.query(relQuery, [entityId])
    ]);

    return {
      documents: docs.rows,
      relationships: rels.rows
    };
  }
}
```

### 3. Frontend'de Graph Visualization

```typescript
// frontend/src/components/graph/knowledge-graph.tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface GraphNode {
  id: string;
  name: string;
  type: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

export function KnowledgeGraph({ nodes, links }: { nodes: GraphNode[], links: GraphLink[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;

    const width = 800;
    const height = 600;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Clear previous
    svg.selectAll('*').remove();

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Add links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Add nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', 10)
      .attr('fill', d => {
        switch(d.type) {
          case 'person': return '#ff7f0e';
          case 'org': return '#2ca02c';
          case 'law': return '#d62728';
          default: return '#1f77b4';
        }
      })
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add labels
    const label = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text(d => d.name)
      .attr('font-size', 12)
      .attr('dx', 15)
      .attr('dy', 4);

    // Update positions
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      label
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }, [nodes, links]);

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-900">
      <h3 className="text-lg font-semibold mb-4">Bilgi Grafiği</h3>
      <svg ref={svgRef}></svg>
    </div>
  );
}
```

### 4. Hybrid RAG Query

```typescript
// backend/src/services/hybrid-rag.service.ts
export class HybridRAGService {
  async query(question: string) {
    // 1. Extract entities from question
    const questionEntities = await entityExtractor.extractEntities(question);
    
    // 2. Vector search (existing)
    const vectorResults = await semanticSearch.hybridSearch(question, 5);
    
    // 3. Graph search
    const graphResults = [];
    for (const entity of questionEntities.entities) {
      const related = await graphQuery.findRelatedEntities(entity.name, 2);
      const context = await graphQuery.getEntityContext(entity.id);
      graphResults.push({ entity, related: related.rows, context });
    }
    
    // 4. Combine results
    const combinedContext = {
      vectorSearch: vectorResults,
      graphContext: graphResults,
      question: question
    };
    
    // 5. Generate response with enhanced context
    const response = await this.generateResponse(combinedContext);
    
    return {
      answer: response,
      sources: vectorResults,
      entities: graphResults,
      graphData: this.prepareGraphVisualization(graphResults)
    };
  }
}
```

### 5. API Endpoints

```typescript
// Graph API endpoints
router.post('/api/v2/graph/extract', async (req, res) => {
  const { documentId } = req.body;
  // Extract entities from document
});

router.get('/api/v2/graph/entity/:name', async (req, res) => {
  const { name } = req.params;
  // Get entity and its relationships
});

router.post('/api/v2/graph/query', async (req, res) => {
  const { question } = req.body;
  // Hybrid RAG query with graph
});
```

## 🚀 Implementasyon Adımları

1. **Database Schema**: Graph tabloları oluştur
2. **Entity Extraction**: Mevcut dökümanlardan entity çıkar
3. **Graph Service**: Query ve traversal servisleri
4. **API Integration**: Graph endpoints ekle
5. **Frontend**: D3.js ile graph visualization
6. **Hybrid Query**: Vector + Graph search birleştir

## 🎯 Kullanım Senaryoları

1. **İlişki Sorgulama**: "X kanunu ile Y yönetmeliği arasındaki ilişki nedir?"
2. **Entity Bazlı Arama**: "Maliye Bakanlığı'nın verdiği özelgeler"
3. **Multi-hop Reasoning**: "KDV iadesi alan şirketlerin uyması gereken kurallar"
4. **Temporal Queries**: "2024 yılında çıkan vergi kanunları"

Bu yaklaşımla, Python LightRAG'ın sağladığı yetenekleri Node.js ekosisteminde implemente edebiliriz.
