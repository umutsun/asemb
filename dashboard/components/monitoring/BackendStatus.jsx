import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const BackendStatus = () => {
  const [status, setStatus] = useState({
    database: { status: 'checking', progress: 0 },
    redis: { status: 'checking', progress: 0 },
    api: { status: 'checking', progress: 0 },
    overall: 65
  });

  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';

    // Fetch initial status
    fetchBackendStatus(API_BASE);

    // Setup polling
    const interval = setInterval(() => fetchBackendStatus(API_BASE), 5000);

    // Optional: Try WS if available (non-fatal)
    let ws;
    try {
      const wsUrl = WS_BASE.replace(/^http/, 'ws') + '/events';
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'backend_status') {
            setStatus(data.payload);
          }
        } catch (_) {}
      };
    } catch (_) {
      // Ignore WS errors; polling continues
    }

    return () => {
      clearInterval(interval);
      if (ws && ws.readyState === 1) ws.close();
    };
  }, []);

  const fetchBackendStatus = async (API_BASE) => {
    try {
      const res = await fetch(`${API_BASE}/api/backend/status`);
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch backend status:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'healthy': return <CheckCircle className="text-green-500" />;
      case 'warning': return <AlertCircle className="text-yellow-500" />;
      case 'error': return <XCircle className="text-red-500" />;
      default: return <AlertCircle className="text-gray-400" />;
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      error: 'bg-red-100 text-red-800',
      checking: 'bg-gray-100 text-gray-800'
    };
    return <Badge className={colors[status] || colors.checking}>{status}</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Backend Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Database Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              {getStatusIcon(status.database.status)}
              <div>
                <p className="font-semibold">PostgreSQL + pgvector</p>
                <p className="text-sm text-gray-600">Database & Vector Store</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {getStatusBadge(status.database.status)}
              <Progress value={status.database.progress || 100} className="w-24" />
            </div>
          </div>

          {/* Redis Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              {getStatusIcon(status.redis.status)}
              <div>
                <p className="font-semibold">Redis</p>
                <p className="text-sm text-gray-600">Cache & PubSub</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {getStatusBadge(status.redis.status)}
              <Progress value={status.redis.progress || 100} className="w-24" />
            </div>
          </div>

          {/* API Status */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              {getStatusIcon(status.api.status)}
              <div>
                <p className="font-semibold">API Server</p>
                <p className="text-sm text-gray-600">REST & WebSocket</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {getStatusBadge(status.api.status)}
              <Progress value={status.api.progress || 70} className="w-24" />
            </div>
          </div>

          {/* Overall Progress */}
          <div className="pt-4 border-t">
            <div className="flex justify-between mb-2">
              <span className="font-semibold">Overall Backend Progress</span>
              <span className="text-sm font-medium">{status.overall}%</span>
            </div>
            <Progress value={status.overall} className="h-3" />
            <p className="text-xs text-gray-600 mt-2">
              Security: 60% | Admin API: 40% | RAG: 20% | Monitoring: 40%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BackendStatus;
