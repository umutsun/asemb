import React, { useEffect, useState } from 'react';

export default function HealthPage() {
  const [health, setHealth] = useState({ status: 'checking', services: {} });
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const data = await res.json();
      setHealth(data);
    } catch (e) {
      setHealth({ status: 'error', services: {} });
      console.error('Health fetch failed:', e);
    }
  };

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 10000);
    return () => clearInterval(t);
  }, []);

  const Badge = ({ ok }) => (
    <span className={`px-2 py-1 rounded text-sm ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {ok ? 'connected' : 'disconnected'}
    </span>
  );

  const svc = health.services || {};

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold">System Health</h1>
        <div className="text-sm text-gray-500">Status: {health.status}</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded p-4">
            <div className="font-semibold mb-1">API</div>
            <Badge ok={svc.api === 'running' || svc.api === 'healthy'} />
          </div>
          <div className="border rounded p-4">
            <div className="font-semibold mb-1">Database</div>
            <Badge ok={svc.database === 'connected' || svc.database === 'healthy'} />
          </div>
          <div className="border rounded p-4">
            <div className="font-semibold mb-1">Redis</div>
            <Badge ok={svc.redis === 'connected' || svc.redis === 'healthy'} />
          </div>
        </div>

        <div className="text-xs text-gray-400">Last update: {new Date().toLocaleTimeString()}</div>
      </div>
    </div>
  );
}

