// LightRAG Dashboard Component
class LightRAGDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.apiBase = '/api/lightrag';
    this.graphData = { nodes: [], edges: [] };
    this.cy = null; // Cytoscape instance
    this.init();
  }

  async init() {
    this.render();
    await this.loadStats();
    await this.loadGraph();
  }

  render() {
    this.container.innerHTML = `
      <div class="lightrag-dashboard">
        <div class="lightrag-header">
          <h2>Knowledge Graph (LightRAG)</h2>
          <div class="lightrag-stats" id="lightrag-stats">
            <span class="stat-item">Loading...</span>
          </div>
        </div>
        
        <div class="lightrag-controls">
          <div class="search-box">
            <input type="text" id="lightrag-search" placeholder="Search entities or relationships..." />
            <button onclick="lightRAG.search()">Search</button>
          </div>
          
          <div class="control-buttons">
            <button onclick="lightRAG.showExtractModal()">Extract from Text</button>
            <button onclick="lightRAG.refreshGraph()">Refresh Graph</button>
            <select id="graph-depth" onchange="lightRAG.changeDepth()">
              <option value="1">Depth 1</option>
              <option value="2" selected>Depth 2</option>
              <option value="3">Depth 3</option>
            </select>
          </div>
        </div>
        
        <div class="lightrag-content">
          <div id="lightrag-graph" class="graph-container"></div>
          <div id="lightrag-details" class="details-panel">
            <h3>Entity Details</h3>
            <div id="entity-info">Select an entity to see details</div>
          </div>
        </div>
        
        <!-- Extract Modal -->
        <div id="extract-modal" class="modal" style="display: none;">
          <div class="modal-content">
            <h3>Extract Entities from Text</h3>
            <textarea id="extract-text" placeholder="Paste text here..." rows="10"></textarea>
            <div class="modal-buttons">
              <button onclick="lightRAG.extractEntities()">Extract</button>
              <button onclick="lightRAG.closeModal()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
      
      <style>
        .lightrag-dashboard {
          padding: 20px;
          background: #f5f5f5;
          min-height: 600px;
        }
        
        .lightrag-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .lightrag-stats {
          display: flex;
          gap: 20px;
        }
        
        .stat-item {
          background: white;
          padding: 10px 20px;
          border-radius: 5px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .lightrag-controls {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        
        .search-box {
          display: flex;
          gap: 10px;
        }
        
        .search-box input {
          padding: 8px 15px;
          border: 1px solid #ddd;
          border-radius: 4px;
          width: 300px;
        }
        
        .control-buttons {
          display: flex;
          gap: 10px;
        }
        
        button {
          padding: 8px 15px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        button:hover {
          background: #45a049;
        }
        
        .lightrag-content {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 20px;
          height: 600px;
        }
        
        .graph-container {
          background: white;
          border: 1px solid #ddd;
          border-radius: 5px;
          position: relative;
        }
        
        .details-panel {
          background: white;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 20px;
          overflow-y: auto;
        }
        
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .modal-content {
          background: white;
          padding: 30px;
          border-radius: 10px;
          width: 500px;
          max-width: 90%;
        }
        
        .modal-content textarea {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin: 20px 0;
        }
        
        .modal-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        
        .entity-type-person { background-color: #ff9999; }
        .entity-type-organization { background-color: #99ccff; }
        .entity-type-concept { background-color: #99ff99; }
        .entity-type-law { background-color: #ffcc99; }
        .entity-type-regulation { background-color: #ff99ff; }
      </style>
    `;
  }

  async loadStats() {
    try {
      const response = await fetch(this.apiBase + '/stats');
      const result = await response.json();
      
      if (result.success) {
        const stats = result.data;
        document.getElementById('lightrag-stats').innerHTML = `
          <span class="stat-item">
            <strong>${stats.entity_count}</strong> Entities
          </span>
          <span class="stat-item">
            <strong>${stats.relationship_count}</strong> Relationships
          </span>
          <span class="stat-item">
            <strong>${stats.fact_count}</strong> Facts
          </span>
          <span class="stat-item">
            <strong>${stats.entity_types}</strong> Types
          </span>
        `;
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async loadGraph(centerEntity = null) {
    try {
      const depth = document.getElementById('graph-depth')?.value || 2;
      const url = this.apiBase + '/graph' + 
        (centerEntity ? `?entity=${encodeURIComponent(centerEntity)}&depth=${depth}` : `?depth=${depth}`);
        
      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        this.graphData = result.data;
        this.renderGraph();
      }
    } catch (error) {
      console.error('Failed to load graph:', error);
    }
  }

  renderGraph() {
    // Load Cytoscape.js if not already loaded
    if (!window.cytoscape) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.26.0/cytoscape.min.js';
      script.onload = () => this.initCytoscape();
      document.head.appendChild(script);
    } else {
      this.initCytoscape();
    }
  }

  initCytoscape() {
    const container = document.getElementById('lightrag-graph');
    
    // Prepare elements for Cytoscape
    const elements = [
      ...this.graphData.nodes.map(node => ({
        data: { 
          id: node.id, 
          label: node.label,
          type: node.type
        },
        classes: `entity-type-${node.type}`
      })),
      ...this.graphData.edges.map(edge => ({
        data: { 
          id: edge.id,
          source: edge.source, 
          target: edge.target,
          label: edge.label 
        }
      }))
    ];

    this.cy = cytoscape({
      container: container,
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'width': '60px',
            'height': '60px',
            'border-width': 2,
            'border-color': '#333'
          }
        },
        {
          selector: 'edge',
          style: {
            'label': 'data(label)',
            'font-size': '10px',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'width': 2,
            'line-color': '#999',
            'target-arrow-color': '#999'
          }
        }
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        animate: true,
        randomize: false
      }
    });

    // Node click handler
    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      this.showNodeDetails(node.data());
    });
  }

  showNodeDetails(nodeData) {
    document.getElementById('entity-info').innerHTML = `
      <h4>${nodeData.label}</h4>
      <p><strong>Type:</strong> ${nodeData.type}</p>
      <p><strong>ID:</strong> ${nodeData.id}</p>
      <hr>
      <button onclick="lightRAG.loadGraph('${nodeData.label}')">Center Graph</button>
    `;
  }

  async search() {
    const query = document.getElementById('lightrag-search').value;
    if (!query) return;

    try {
      const response = await fetch(this.apiBase + '/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 20 })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update graph with search results
        this.graphData = {
          nodes: result.data.entities.map(e => ({
            id: e.id,
            label: e.name,
            type: e.type
          })),
          edges: result.data.relationships.map(r => ({
            id: r.id,
            source: r.source_id,
            target: r.target_id,
            label: r.type
          }))
        };
        this.renderGraph();
        
        // Show facts if any
        if (result.data.facts.length > 0) {
          const factsHtml = result.data.facts.map(f => 
            `<li>${f.fact}</li>`
          ).join('');
          
          document.getElementById('entity-info').innerHTML = `
            <h4>Related Facts</h4>
            <ul>${factsHtml}</ul>
          `;
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  }

  showExtractModal() {
    document.getElementById('extract-modal').style.display = 'flex';
  }

  closeModal() {
    document.getElementById('extract-modal').style.display = 'none';
  }

  async extractEntities() {
    const text = document.getElementById('extract-text').value;
    if (!text) return;

    try {
      const response = await fetch(this.apiBase + '/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`Extracted ${result.data.entities.length} entities and ${result.data.relationships.length} relationships!`);
        this.closeModal();
        await this.loadStats();
        await this.loadGraph();
      } else {
        alert('Extraction failed: ' + result.error);
      }
    } catch (error) {
      console.error('Extract failed:', error);
      alert('Extraction failed!');
    }
  }

  async refreshGraph() {
    await this.loadStats();
    await this.loadGraph();
  }

  changeDepth() {
    this.loadGraph();
  }
}

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
  window.lightRAG = null;
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lightrag-container')) {
      window.lightRAG = new LightRAGDashboard('lightrag-container');
    }
  });
}