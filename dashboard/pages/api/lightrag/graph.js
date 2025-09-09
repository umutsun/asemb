export default function handler(req, res) {
  // Mock graph data
  const mockNodes = [
    { name: 'KDV', label: 'KDV', type: 'TAX_TYPE' },
    { name: 'Vergi Dairesi', label: 'Vergi Dairesi', type: 'ORGANIZATION' },
    { name: 'Danıştay', label: 'Danıştay', type: 'COURT' },
    { name: 'Maliye Bakanlığı', label: 'Maliye Bakanlığı', type: 'ORGANIZATION' },
    { name: 'ÖTV', label: 'ÖTV', type: 'TAX_TYPE' },
    { name: '2024/1234', label: '2024/1234', type: 'CASE_NUMBER' }
  ];

  const mockEdges = [
    { source: 'Vergi Dairesi', target: 'KDV', type: 'REGULATES' },
    { source: 'Danıştay', target: '2024/1234', type: 'HAS_CASE' },
    { source: 'Maliye Bakanlığı', target: 'ÖTV', type: 'REGULATES' }
  ];

  res.status(200).json({
    success: true,
    graph: {
      nodes: mockNodes,
      edges: mockEdges
    }
  });
}