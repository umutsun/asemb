/**
 * Monitoring Dashboard Component
 * Real-time metrics and system health visualization
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Database,
  Server,
  Cpu,
  HardDrive,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  WifiOff,
  Wifi,
  RefreshCw,
  BarChart3,
  Gauge
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getApiClient } from '../../lib/api-client';
import { useWebSocketStore, useMetricsUpdates, useSystemStatus } from '../../lib/websocket';
import type { MetricsData, SystemStatus } from '../../lib/api-client';

interface PerformanceMetric {
  time: string;
  queries: number;
  avgResponseTime: number;
  cacheHitRate: number;
}

export const MonitoringDashboard: React.FC = () => {
  // State
  const [metrics, setMetrics] = useState<MetricsData>({
    documents: 0,
    entities: 0,
    relationships: 0,
    queries: 0,
    avgResponseTime: 0,
    cacheHitRate: 0,
    activeWorkflows: 0,
  });
  
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    postgres: 'disconnected',
    redis: 'disconnected',
    lightrag: 'inactive',
    openai: 'inactive',
  });

  const [performanceHistory, setPerformanceHistory] = useState<PerformanceMetric[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const apiClient = getApiClient();
  const { connected: wsConnected } = useWebSocketStore();

  // Fetch initial data
  const fetchMetrics = async () => {
    setIsRefreshing(true);
    try {
      const [metricsData, statusData, performanceData, workflowData] = await Promise.all([
        apiClient.getMetrics(),
        apiClient.getSystemStatus(),
        apiClient.getQueryPerformance('24h'),
        apiClient.getWorkflowStatus(),
      ]);

      setMetrics(metricsData);
      setSystemStatus(statusData);
      setWorkflowStatus(workflowData);
      
      // Process performance data for chart
      if (performanceData?.history) {
        setPerformanceHistory(performanceData.history);
      }
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch monitoring data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchMetrics();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchMetrics();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Subscribe to real-time updates
  useMetricsUpdates((data) => {
    setMetrics(prev => ({ ...prev, ...data }));
    setLastUpdate(new Date());
  });

  useSystemStatus((data) => {
    setSystemStatus(prev => ({
      ...prev,
      [data.service]: data.status,
    }));
  });

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active':
        return 'text-green-500';
      case 'disconnected':
      case 'inactive':
        return 'text-red-500';
      case 'error':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'disconnected':
      case 'inactive':
        return <WifiOff className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Format uptime
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Chart colors
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Monitoring</h2>
        <div className="flex items-center space-x-4">
          {/* WebSocket Status */}
          <div className="flex items-center space-x-2">
            {wsConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">Live Updates</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">Offline</span>
              </>
            )}
          </div>

          {/* Auto Refresh Toggle */}
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${autoRefresh ? 'bg-blue-500' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoRefresh ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm">Auto-refresh</span>
          </label>

          {/* Manual Refresh */}
          <button
            onClick={fetchMetrics}
            disabled={isRefreshing}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Last Update */}
          <div className="text-sm text-gray-500">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* System Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* PostgreSQL Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-500" />
              <h3 className="font-medium">PostgreSQL</h3>
            </div>
            <div className={`flex items-center space-x-1 ${getStatusColor(systemStatus.postgres)}`}>
              {getStatusIcon(systemStatus.postgres)}
              <span className="text-sm capitalize">{systemStatus.postgres}</span>
            </div>
          </div>
          <div className="text-2xl font-bold">{metrics.documents}</div>
          <div className="text-sm text-gray-500">Documents</div>
        </div>

        {/* Redis Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-red-500" />
              <h3 className="font-medium">Redis</h3>
            </div>
            <div className={`flex items-center space-x-1 ${getStatusColor(systemStatus.redis)}`}>
              {getStatusIcon(systemStatus.redis)}
              <span className="text-sm capitalize">{systemStatus.redis}</span>
            </div>
          </div>
          <div className="text-2xl font-bold">{(metrics.cacheHitRate * 100).toFixed(1)}%</div>
          <div className="text-sm text-gray-500">Cache Hit Rate</div>
        </div>

        {/* LightRAG Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-purple-500" />
              <h3 className="font-medium">LightRAG</h3>
            </div>
            <div className={`flex items-center space-x-1 ${getStatusColor(systemStatus.lightrag)}`}>
              {getStatusIcon(systemStatus.lightrag)}
              <span className="text-sm capitalize">{systemStatus.lightrag}</span>
            </div>
          </div>
          <div className="text-2xl font-bold">{metrics.entities}</div>
          <div className="text-sm text-gray-500">Entities</div>
        </div>

        {/* OpenAI Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-green-500" />
              <h3 className="font-medium">OpenAI</h3>
            </div>
            <div className={`flex items-center space-x-1 ${getStatusColor(systemStatus.openai)}`}>
              {getStatusIcon(systemStatus.openai)}
              <span className="text-sm capitalize">{systemStatus.openai}</span>
            </div>
          </div>
          <div className="text-2xl font-bold">{metrics.queries}</div>
          <div className="text-sm text-gray-500">Queries Today</div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Query Performance Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Query Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="avgResponseTime" 
                stroke="#3B82F6" 
                name="Avg Response (ms)"
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="queries" 
                stroke="#10B981" 
                name="Queries"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cache Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Cache Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={performanceHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="cacheHitRate" 
                stroke="#F59E0B" 
                fill="#FEF3C7"
                name="Cache Hit Rate"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Workflow Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">n8n Workflow Status</h3>
        {workflowStatus.length > 0 ? (
          <div className="space-y-2">
            {workflowStatus.map((workflow, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${workflow.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="font-medium">{workflow.name}</span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span>ID: {workflow.id}</span>
                  <span>Executions: {workflow.executions || 0}</span>
                  <span className={workflow.active ? 'text-green-600' : 'text-gray-400'}>
                    {workflow.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No workflows configured</p>
        )}
      </div>

      {/* System Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <Gauge className="w-8 h-8 text-blue-500" />
            <span className="text-2xl font-bold">{metrics.avgResponseTime?.toFixed(0) || 0}ms</span>
          </div>
          <div className="text-sm text-gray-500 mt-2">Avg Response Time</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <BarChart3 className="w-8 h-8 text-green-500" />
            <span className="text-2xl font-bold">{metrics.relationships}</span>
          </div>
          <div className="text-sm text-gray-500 mt-2">Relationships</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <Activity className="w-8 h-8 text-purple-500" />
            <span className="text-2xl font-bold">{metrics.activeWorkflows || 0}</span>
          </div>
          <div className="text-sm text-gray-500 mt-2">Active Workflows</div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <HardDrive className="w-8 h-8 text-orange-500" />
            <span className="text-2xl font-bold">
              {((metrics.documents || 0) * 0.5 / 1024).toFixed(1)}GB
            </span>
          </div>
          <div className="text-sm text-gray-500 mt-2">Storage Used</div>
        </div>
      </div>
    </div>
  );
};