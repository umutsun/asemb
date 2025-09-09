const express = require('express');
const router = express.Router();
const LightRAGService = require('../lightrag-service');

const lightRAG = new LightRAGService();

/**
 * Extract entities and relationships from text
 */
router.post('/api/lightrag/extract', async (req, res) => {
  try {
    const { text, metadata = {} } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Extract entities and relationships
    const extracted = await lightRAG.extractEntitiesAndRelationships(text, metadata);
    
    // Store in database
    await lightRAG.storeGraphData(extracted);
    
    res.json({
      success: true,
      data: extracted
    });
  } catch (error) {
    console.error('Extract error:', error);
    res.status(500).json({ 
      error: 'Failed to extract entities',
      details: error.message 
    });
  }
});

/**
 * Query knowledge graph
 */
router.post('/api/lightrag/query', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const results = await lightRAG.queryGraph(query, limit);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ 
      error: 'Failed to query graph',
      details: error.message 
    });
  }
});

/**
 * Get graph visualization data
 */
router.get('/api/lightrag/graph', async (req, res) => {
  try {
    const { entity, depth = 2 } = req.query;
    
    const graphData = await lightRAG.getGraphVisualization(
      entity, 
      parseInt(depth)
    );
    
    res.json({
      success: true,
      data: graphData
    });
  } catch (error) {
    console.error('Graph error:', error);
    res.status(500).json({ 
      error: 'Failed to get graph',
      details: error.message 
    });
  }
});

/**
 * Get statistics
 */
router.get('/api/lightrag/stats', async (req, res) => {
  try {
    const stats = await lightRAG.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get stats',
      details: error.message 
    });
  }
});

/**
 * Process documents in bulk
 */
router.post('/api/lightrag/process-bulk', async (req, res) => {
  try {
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents array is required' });
    }
    
    const results = [];
    
    for (const doc of documents) {
      try {
        const extracted = await lightRAG.extractEntitiesAndRelationships(
          doc.content, 
          doc.metadata || {}
        );
        await lightRAG.storeGraphData(extracted);
        results.push({
          id: doc.id || doc.title,
          success: true,
          entities: extracted.entities.length,
          relationships: extracted.relationships.length
        });
      } catch (error) {
        results.push({
          id: doc.id || doc.title,
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      processed: results.length,
      results: results
    });
  } catch (error) {
    console.error('Bulk process error:', error);
    res.status(500).json({ 
      error: 'Failed to process documents',
      details: error.message 
    });
  }
});

module.exports = router;