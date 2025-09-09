export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    mode: 'mock',
    features: ['entity_extraction', 'knowledge_graph', 'semantic_search'],
    timestamp: new Date().toISOString()
  });
}