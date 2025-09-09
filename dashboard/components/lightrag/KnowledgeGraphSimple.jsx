import React, { useState, useEffect } from 'react';

const KnowledgeGraphSimple = () => {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchGraphData();
  }, []);

  const fetchGraphData = async () => {
    try {
      const response = await fetch('/api/lightrag/graph');
      if (response.ok) {
        const data = await response.json();
        setGraphData(data.graph || { nodes: [], edges: [] });
      } else {
        setError('Failed to fetch graph data');
      }
    } catch (err) {
      setError('API connection error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-lg">Loading Knowledge Graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Knowledge Graph Visualization</h2>
      
      <div className="mb-4 p-4 bg-blue-50 rounded">
        <p className="text-sm text-gray-600">
          Graph contains {graphData.nodes?.length || 0} nodes and {graphData.edges?.length || 0} relationships
        </p>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50 min-h-[400px]">
        <div className="text-center text-gray-500">
          <p>Graph visualization placeholder</p>
          <p className="text-sm mt-2">Install vis-network for interactive graph</p>
        </div>
        
        {/* Simple node list */}
        {graphData.nodes && graphData.nodes.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Entities:</h3>
            <div className="flex flex-wrap gap-2">
              {graphData.nodes.slice(0, 20).map((node, idx) => (
                <span key={idx} className="px-2 py-1 bg-white rounded border text-sm">
                  {node.name || node.label || `Node ${idx}`}
                </span>
              ))}
              {graphData.nodes.length > 20 && (
                <span className="px-2 py-1 text-gray-500 text-sm">
                  +{graphData.nodes.length - 20} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeGraphSimple;