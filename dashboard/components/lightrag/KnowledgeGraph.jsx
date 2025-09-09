import React, { useState, useEffect, useRef } from 'react';
import { Network } from 'vis-network/standalone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const KnowledgeGraph = () => {
  const containerRef = useRef(null);
  const [network, setNetwork] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    fetchGraphData();
  }, []);

  useEffect(() => {
    if (containerRef.current && graphData.nodes.length > 0) {
      renderNetwork();
    }
  }, [graphData]);

  const fetchGraphData = async () => {
    try {
      const response = await fetch('/api/lightrag/graph');
      const data = await response.json();

      // Transform data for vis-network
      const nodes = data.nodes.map(node => ({
        id: node.id || node.name,
        label: node.name,
        group: node.type,
        title: `${node.type}: ${node.name}`,
        color: getNodeColor(node.type)
      }));

      const edges = data.edges.map((edge, index) => ({
        id: index,
        from: edge.source,
        to: edge.target,
        label: edge.type,
        arrows: 'to',
        color: { color: '#848484' }
      }));

      setGraphData({ nodes, edges });
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
    }
  };

  const getNodeColor = (type) => {
    const colors = {
      'Person': '#FF6B6B',
      'Organization': '#4ECDC4',
      'Location': '#45B7D1',
      'Document': '#96CEB4',
      'Concept': '#FFEAA7',
      'Date': '#DDA0DD',
      'Legal': '#FFB347'
    };
    return colors[type] || '#95A5A6';
  };

  const renderNetwork = () => {
    const options = {
      nodes: {
        shape: 'dot',
        size: 20,
        font: {
          size: 12,
          color: '#000000'
        },
        borderWidth: 2
      },
      edges: {
        width: 1,
        font: {
          size: 10,
          align: 'middle'
        },
        smooth: {
          type: 'curvedCW',
          roundness: 0.2
        }
      },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.3,
          springLength: 95,
          springConstant: 0.04
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true
      }
    };

    const net = new Network(containerRef.current, graphData, options);

    // Event handlers
    net.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = graphData.nodes.find(n => n.id === nodeId);
        setSelectedNode(node);
        highlightConnectedNodes(net, nodeId);
      }
    });

    net.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        fetchNodeDetails(nodeId);
      }
    });

    setNetwork(net);
  };

  const highlightConnectedNodes = (net, nodeId) => {
    const connectedNodes = net.getConnectedNodes(nodeId);
    const allNodes = graphData.nodes.map(node => {
      return {
        ...node,
        color: connectedNodes.includes(node.id) || node.id === nodeId
          ? node.color
          : { background: '#E0E0E0', border: '#E0E0E0' }
      };
    });

    net.body.data.nodes.update(allNodes);
  };

  const fetchNodeDetails = async (nodeId) => {
    try {
      const response = await fetch(`/api/lightrag/entity/${nodeId}`);
      const details = await response.json();
      // Handle entity details (show in modal or sidebar)
      console.log('Entity details:', details);
    } catch (error) {
      console.error('Failed to fetch entity details:', error);
    }
  };

  const handleSearch = () => {
    if (!network) return;

    const matchingNodes = graphData.nodes.filter(node => 
      node.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (matchingNodes.length > 0) {
      network.selectNodes(matchingNodes.map(n => n.id));
      network.focus(matchingNodes[0].id, {
        scale: 1.5,
        animation: true
      });
    }
  };

  const handleFilter = (type) => {
    setFilterType(type);

    if (type === 'all') {
      network.body.data.nodes.update(graphData.nodes);
    } else {
      const filteredNodes = graphData.nodes.map(node => ({
        ...node,
        hidden: node.group !== type
      }));
      network.body.data.nodes.update(filteredNodes);
    }
  };

  const handleZoom = (direction) => {
    if (!network) return;

    const scale = network.getScale();
    if (direction === 'in') {
      network.moveTo({ scale: scale * 1.2 });
    } else {
      network.moveTo({ scale: scale * 0.8 });
    }
  };

  const handleFit = () => {
    if (network) {
      network.fit({ animation: true });
    }
  };

  const entityTypes = ['Person', 'Organization', 'Location', 'Document', 'Concept', 'Legal'];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Graph Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Controls */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search entities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant={filterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleFilter('all')}
              >
                All
              </Button>
              {entityTypes.map(type => (
                <Button
                  key={type}
                  variant={filterType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleFilter(type)}
                >
                  {type}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => handleZoom('in')} size="icon" variant="outline">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button onClick={() => handleZoom('out')} size="icon" variant="outline">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button onClick={handleFit} size="icon" variant="outline">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Graph Container */}
          <div
            ref={containerRef}
            className="w-full h-[600px] border rounded-lg bg-gray-50"
          />

          {/* Selected Node Info */}
          {selectedNode && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold mb-2">Selected Entity</h3>
              <div className="flex items-center gap-2">
                <Badge>{selectedNode.group}</Badge>
                <span className="font-medium">{selectedNode.label}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Double-click to view details
              </p>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-sm font-medium">Legend:</span>
            {entityTypes.map(type => (
              <div key={type} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getNodeColor(type) }}
                />
                <span className="text-sm">{type}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeGraph;