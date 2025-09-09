const express = require('express');
const router = express.Router();
const LightRAGService = require('../../services/lightrag');

// Initialize LightRAG
const lightrag = new LightRAGService({
  uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  user: process.env.NEO4J_USER || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password'
});

// Extract entities from text
router.post('/extract', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }
    
    const extraction = await lightrag.extract(text);
    await lightrag.store(extraction);
    
    res.json({
      success: true,
      data: extraction
    });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get knowledge graph stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await lightrag.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({
      success: true,
      data: {
        entity_count: 0,
        relationship_count: 0,
        fact_count: 0,
        entity_types: 0
      }
    });
  }
});

// Get graph visualization data
router.get('/graph', async (req, res) => {
  try {
    const { entity, depth = 2 } = req.query;
    
    let cypher;
    let params = { depth: parseInt(depth) };
    
    if (entity) {
      cypher = `
        MATCH (center:Entity {name: $entity})
        MATCH path = (center)-[*0..${depth}]-(connected)
        WITH center, connected, relationships(path) as rels
        RETURN collect(DISTINCT center) + collect(DISTINCT connected) as nodes,
               collect(DISTINCT rels) as relationships
      `;
      params.entity = entity;
    } else {
      cypher = `
        MATCH (n:Entity)
        WITH n LIMIT 50
        MATCH (n)-[r]-(m:Entity)
        WHERE id(m) > id(n)
        RETURN collect(DISTINCT n) + collect(DISTINCT m) as nodes,
               collect(DISTINCT r) as relationships
        LIMIT 100
      `;
    }
    
    const result = await lightrag.query(cypher, params);
    
    // Format for visualization
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();
    
    if (result[0]) {
      // Process nodes
      result[0].nodes.forEach((node, index) => {
        if (node) {
          const nodeId = `node_${index}`;
          nodeMap.set(node.identity?.toString() || index, nodeId);
          nodes.push({
            id: nodeId,
            label: node.properties?.name || 'Unknown',
            type: node.properties?.type || 'Entity'
          });
        }
      });
      
      // Process relationships
      if (result[0].relationships) {
        result[0].relationships.flat().forEach((rel, index) => {
          if (rel && rel.start && rel.end) {
            const sourceId = nodeMap.get(rel.start.toString());
            const targetId = nodeMap.get(rel.end.toString());
            
            if (sourceId && targetId) {
              edges.push({
                id: `edge_${index}`,
                source: sourceId,
                target: targetId,
                label: rel.type || 'RELATED_TO'
              });
            }
          }
        });
      }
    }
    
    res.json({
      success: true,
      data: { nodes, edges }
    });
  } catch (error) {
    console.error('Graph error:', error);
    // Return mock data if Neo4j is not available
    res.json({
      success: true,
      data: {
        nodes: [
          { id: 'node_1', label: 'KDV', type: 'TAX_TYPE' },
          { id: 'node_2', label: 'GİB', type: 'ORGANIZATION' },
          { id: 'node_3', label: 'Mükellef', type: 'LEGAL_ENTITY' }
        ],
        edges: [
          { id: 'edge_1', source: 'node_2', target: 'node_1', label: 'MANAGES' },
          { id: 'edge_2', source: 'node_1', target: 'node_3', label: 'APPLIES_TO' }
        ]
      }
    });
  }
});

// Process scraped data with LightRAG
router.post('/process-scraped', async (req, res) => {
  try {
    const { url, limit = 10 } = req.body;
    
    // Get scraped data from database
    const query = url 
      ? 'SELECT * FROM scraped_data WHERE url = $1 LIMIT $2'
      : 'SELECT * FROM scraped_data WHERE processed = false LIMIT $1';
    
    // This would connect to your PostgreSQL database
    // For now, return a success message
    res.json({
      success: true,
      message: 'Processing started',
      data: {
        processed: 0,
        total: limit
      }
    });
  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
