import { Router, Request, Response } from 'express';
import { semanticSearch } from '../services/semantic-search.service';

const router = Router();

/**
 * Semantic search endpoint
 */
router.post('/api/v2/search/semantic', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await semanticSearch.semanticSearch(query, limit);
    
    res.json({
      query,
      results,
      count: results.length,
      type: 'semantic'
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Hybrid search endpoint (keyword + semantic)
 */
router.post('/api/v2/search/hybrid', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await semanticSearch.hybridSearch(query, limit);
    
    res.json({
      query,
      results,
      count: results.length,
      type: 'hybrid'
    });
  } catch (error) {
    console.error('Hybrid search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Find similar documents
 */
router.get('/api/v2/search/similar/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const { limit = 5 } = req.query;
    
    const results = await semanticSearch.findSimilarDocuments(
      documentId, 
      parseInt(limit as string)
    );
    
    res.json({
      documentId,
      similar: results,
      count: results.length
    });
  } catch (error) {
    console.error('Similar documents error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Search by source table
 */
router.post('/api/v2/search/source', async (req: Request, res: Response) => {
  try {
    const { sourceTable, query, limit = 10 } = req.body;
    
    if (!sourceTable || !query) {
      return res.status(400).json({ error: 'Source table and query are required' });
    }

    const results = await semanticSearch.searchBySource(sourceTable, query, limit);
    
    res.json({
      sourceTable,
      query,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Search by source error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Get search statistics
 */
router.get('/api/v2/search/stats', async (req: Request, res: Response) => {
  try {
    const stats = await semanticSearch.getStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Get sample documents for testing
 */
router.get('/api/v2/search/samples', async (req: Request, res: Response) => {
  try {
    const { limit = 5 } = req.query;
    const samples = await semanticSearch.getSampleDocuments(parseInt(limit as string));
    
    res.json({
      samples,
      count: samples.length
    });
  } catch (error) {
    console.error('Get samples error:', error);
    res.status(500).json({ error: 'Failed to get samples' });
  }
});

export default router;
