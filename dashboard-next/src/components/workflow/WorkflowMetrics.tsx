import React, { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle, XCircle, TrendingUp, AlertTriangle } from 'lucide-react';

interface WorkflowMetric {
  total: number;
  active: number;
  running: number;
  completed: number;
  failed: number;
  avgExecutionTime: number;
}

interface ExecutionHistory {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'completed' | 'failed' | 'running';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  error?: string;
}

export const WorkflowMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<WorkflowMetric>({
    total: 0,
    active: 0,
    running: 0,
    completed: 0,
    failed: 0,
    avgExecutionTime: 0
  });

  const [history, setHistory] = useState<ExecutionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
    fetchExecutionHistory();
    
    const interval = setInterval(() => {
      fetchMetrics();
      fetchExecutionHistory();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/workflows/metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutionHistory = async () => {
    try {
      const response = await fetch('/api/workflows/executions');
      if (response.ok) {
        const data = await response.json();
        setHistory(data.executions || []);
      }
    } catch (error) {
      console.error('Failed to fetch execution history:', error);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString();
  };

  return (
    <div className="workflow-metrics p-6">
      <h2 className="text-2xl font-bold mb-6">Workflow Metrics</h2>

      {loading ? (
        <div className="text-center py-8">Loading metrics...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
            <MetricCard
              title="Total Workflows"
              value={metrics.total}
              icon={<Activity className="text-blue-600" />}
              color="blue"
            />
            <MetricCard
              title="Active"
              value={metrics.active}
              icon={<CheckCircle className="text-green-600" />}
              color="green"
            />
            <MetricCard
              title="Running"
              value={metrics.running}
              icon={<Clock className="text-yellow-600" />}
              color="yellow"
            />
            <MetricCard
              title="Completed"
              value={metrics.completed}
              icon={<CheckCircle className="text-emerald-600" />}
              color="emerald"
            />
            <MetricCard
              title="Failed"
              value={metrics.failed}
              icon={<XCircle className="text-red-600" />}
              color="red"
            />
            <MetricCard
              title="Avg Time"
              value={formatDuration(metrics.avgExecutionTime)}
              icon={<TrendingUp className="text-purple-600" />}
              color="purple"
            />
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Execution History</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Workflow</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Started</th>
                    <th className="text-left py-2 px-3">Duration</th>
                    <th className="text-left py-2 px-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(execution => (
                    <tr key={execution.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <div>
                          <div className="font-medium">{execution.workflowName}</div>
                          <div className="text-xs text-gray-500">{execution.id}</div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={execution.status} />
                      </td>
                      <td className="py-2 px-3 text-sm">
                        {formatTime(execution.startedAt)}
                      </td>
                      <td className="py-2 px-3 text-sm">
                        {execution.duration ? formatDuration(execution.duration) : '-'}
                      </td>
                      <td className="py-2 px-3">
                        {execution.error && (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle size={14} />
                            <span className="text-xs truncate max-w-xs" title={execution.error}>
                              {execution.error}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {history.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No execution history available
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <PerformanceChart />
            <SuccessRateChart />
          </div>
        </>
      )}
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{title}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold text-${color}-600`}>
        {value}
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusConfig = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle size={14} /> },
    failed: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle size={14} /> },
    running: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: <Clock size={14} /> }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.running;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.icon}
      {status}
    </span>
  );
};

const PerformanceChart: React.FC = () => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h4 className="text-lg font-semibold mb-4">Execution Performance</h4>
      <div className="h-64 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Activity size={48} className="mx-auto mb-2" />
          <p>Performance chart will be displayed here</p>
        </div>
      </div>
    </div>
  );
};

const SuccessRateChart: React.FC = () => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h4 className="text-lg font-semibold mb-4">Success Rate</h4>
      <div className="h-64 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <TrendingUp size={48} className="mx-auto mb-2" />
          <p>Success rate chart will be displayed here</p>
        </div>
      </div>
    </div>
  );
};

export default WorkflowMetrics;