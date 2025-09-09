'use client';

import { useState, useEffect } from 'react';
import { Activity, Database, Server, Cpu, HardDrive, Wifi } from 'lucide-react';

interface SystemMetrics {
  redis: { status: string; connections: number; memory: string };
  postgres: { status: string; connections: number; size: string };
  api: { status: string; uptime: number; requests: number };
  nodes: { total: number; active: number };
}

export default function SystemStatus() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/status');
        const data = await response.json();
        setMetrics(data);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
            <div className="h-8 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Redis Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold text-gray-800 dark:text-white">Redis</h3>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full ${
            metrics?.redis.status === 'connected' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}>
            {metrics?.redis.status || 'offline'}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Connections</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.redis.connections || 0}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Memory</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.redis.memory || '0 MB'}
            </span>
          </div>
        </div>
      </div>

      {/* PostgreSQL Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-gray-800 dark:text-white">PostgreSQL</h3>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full ${
            metrics?.postgres.status === 'connected' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}>
            {metrics?.postgres.status || 'offline'}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Connections</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.postgres.connections || 0}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">DB Size</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.postgres.size || '0 GB'}
            </span>
          </div>
        </div>
      </div>

      {/* API Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-gray-800 dark:text-white">API Server</h3>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full ${
            metrics?.api.status === 'running' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}>
            {metrics?.api.status || 'offline'}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Uptime</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.api.uptime ? `${Math.floor(metrics.api.uptime / 3600)}h` : '0h'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Requests</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.api.requests || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Nodes Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold text-gray-800 dark:text-white">Nodes</h3>
          </div>
          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            active
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Total</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.nodes.total || 15}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Active</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {metrics?.nodes.active || 15}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}