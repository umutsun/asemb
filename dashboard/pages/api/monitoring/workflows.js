// Mock Workflow Status API endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Mock workflow data
    const workflows = [
      {
        id: 'wf-001',
        name: 'Document Ingestion Pipeline',
        active: true,
        executions: 127,
        lastRun: new Date(Date.now() - 3600000).toISOString(),
        status: 'success'
      },
      {
        id: 'wf-002',
        name: 'Query Processing Workflow',
        active: true,
        executions: 89,
        lastRun: new Date(Date.now() - 1800000).toISOString(),
        status: 'success'
      },
      {
        id: 'wf-003',
        name: 'Knowledge Graph Update',
        active: false,
        executions: 45,
        lastRun: new Date(Date.now() - 7200000).toISOString(),
        status: 'inactive'
      }
    ];

    return res.status(200).json({ workflows });
  }

  res.status(405).json({ error: 'Method not allowed' });
}