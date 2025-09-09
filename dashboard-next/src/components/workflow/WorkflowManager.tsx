import React, { useState, useEffect } from 'react';
import { Play, Pause, Stop, Upload, Download, Plus, Trash2, Check, X, AlertCircle } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'running' | 'error';
  lastRun?: string;
  nodeCount?: number;
  tags?: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: any[];
  warnings: any[];
  metadata: {
    nodeCount: number;
    connectionCount: number;
    estimatedExecutionTime: number;
    requiredCredentials: string[];
  };
}

export const WorkflowManager: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/workflows/list');
      const data = await response.json();
      setWorkflows(data.workflows);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const executeWorkflow = async (workflowId: string) => {
    try {
      const response = await fetch('/api/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId })
      });
      const data = await response.json();
      
      if (data.success) {
        setExecutionStatus({
          ...executionStatus,
          [workflowId]: { status: 'running', executionId: data.executionId }
        });
        
        // Poll for status
        pollExecutionStatus(data.executionId, workflowId);
      }
    } catch (error) {
      console.error('Failed to execute workflow:', error);
    }
  };

  const pollExecutionStatus = async (executionId: string, workflowId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/workflows/status/${executionId}`);
        const data = await response.json();
        
        setExecutionStatus(prev => ({
          ...prev,
          [workflowId]: data
        }));
        
        if (data.status === 'completed' || data.status === 'error') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Failed to get execution status:', error);
        clearInterval(interval);
      }
    }, 2000);
  };

  const validateWorkflow = async (workflowId: string) => {
    try {
      const workflowResponse = await fetch(`/api/workflows/${workflowId}`);
      const workflow = await workflowResponse.json();
      
      const response = await fetch('/api/workflows/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow })
      });
      const data = await response.json();
      setValidationResult(data);
    } catch (error) {
      console.error('Failed to validate workflow:', error);
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    
    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchWorkflows();
        setSelectedWorkflow(null);
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
  };

  const exportWorkflow = async (workflowId: string) => {
    try {
      const response = await fetch(`/api/workflows/export/${workflowId}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workflow-${workflowId}.json`;
      a.click();
    } catch (error) {
      console.error('Failed to export workflow:', error);
    }
  };

  return (
    <div className="workflow-manager p-6">
      <div className="header flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Workflow Management</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <Plus size={20} />
          Create Workflow
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="workflows-list lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h3 className="text-lg font-semibold mb-4">Active Workflows</h3>
            
            {loading ? (
              <div className="text-center py-8">Loading workflows...</div>
            ) : (
              <div className="space-y-3">
                {workflows.map(workflow => (
                  <div
                    key={workflow.id}
                    className={`border rounded-lg p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedWorkflow?.id === workflow.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedWorkflow(workflow)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold">{workflow.name}</h4>
                        {workflow.description && (
                          <p className="text-sm text-gray-600 mt-1">{workflow.description}</p>
                        )}
                        <div className="flex gap-2 mt-2">
                          {workflow.tags?.map(tag => (
                            <span key={tag} className="text-xs bg-gray-200 px-2 py-1 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {executionStatus[workflow.id]?.status === 'running' ? (
                          <div className="text-blue-600 animate-pulse">
                            <Play size={16} />
                          </div>
                        ) : executionStatus[workflow.id]?.status === 'completed' ? (
                          <div className="text-green-600">
                            <Check size={16} />
                          </div>
                        ) : executionStatus[workflow.id]?.status === 'error' ? (
                          <div className="text-red-600">
                            <X size={16} />
                          </div>
                        ) : null}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            executeWorkflow(workflow.id);
                          }}
                          className="text-green-600 hover:text-green-700"
                          title="Execute Workflow"
                        >
                          <Play size={20} />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            validateWorkflow(workflow.id);
                          }}
                          className="text-blue-600 hover:text-blue-700"
                          title="Validate Workflow"
                        >
                          <AlertCircle size={20} />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            exportWorkflow(workflow.id);
                          }}
                          className="text-gray-600 hover:text-gray-700"
                          title="Export Workflow"
                        >
                          <Download size={20} />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWorkflow(workflow.id);
                          }}
                          className="text-red-600 hover:text-red-700"
                          title="Delete Workflow"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="workflow-details">
          {validationResult && (
            <div className="bg-white rounded-lg shadow-md p-4 mb-4">
              <h3 className="text-lg font-semibold mb-3">Validation Result</h3>
              
              <div className={`mb-3 p-3 rounded ${validationResult.valid ? 'bg-green-100' : 'bg-red-100'}`}>
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <>
                      <Check className="text-green-600" size={20} />
                      <span className="text-green-800 font-semibold">Valid Workflow</span>
                    </>
                  ) : (
                    <>
                      <X className="text-red-600" size={20} />
                      <span className="text-red-800 font-semibold">Invalid Workflow</span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">Nodes:</span> {validationResult.metadata.nodeCount}
                </div>
                <div>
                  <span className="font-semibold">Connections:</span> {validationResult.metadata.connectionCount}
                </div>
                <div>
                  <span className="font-semibold">Est. Execution Time:</span> {validationResult.metadata.estimatedExecutionTime}s
                </div>
              </div>

              {validationResult.errors.length > 0 && (
                <div className="mt-3">
                  <h4 className="font-semibold text-red-600 mb-2">Errors ({validationResult.errors.length})</h4>
                  <ul className="text-sm space-y-1">
                    {validationResult.errors.map((error, idx) => (
                      <li key={idx} className="text-red-600">
                        • [{error.nodeName}] {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.warnings.length > 0 && (
                <div className="mt-3">
                  <h4 className="font-semibold text-yellow-600 mb-2">Warnings ({validationResult.warnings.length})</h4>
                  <ul className="text-sm space-y-1">
                    {validationResult.warnings.map((warning, idx) => (
                      <li key={idx} className="text-yellow-600">
                        • [{warning.nodeName}] {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.metadata.requiredCredentials.length > 0 && (
                <div className="mt-3">
                  <h4 className="font-semibold mb-2">Required Credentials</h4>
                  <div className="flex flex-wrap gap-2">
                    {validationResult.metadata.requiredCredentials.map(cred => (
                      <span key={cred} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {cred}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedWorkflow && (
            <div className="bg-white rounded-lg shadow-md p-4">
              <h3 className="text-lg font-semibold mb-3">Workflow Details</h3>
              <div className="space-y-3">
                <div>
                  <span className="font-semibold">ID:</span>
                  <p className="text-sm text-gray-600">{selectedWorkflow.id}</p>
                </div>
                <div>
                  <span className="font-semibold">Name:</span>
                  <p className="text-sm text-gray-600">{selectedWorkflow.name}</p>
                </div>
                {selectedWorkflow.description && (
                  <div>
                    <span className="font-semibold">Description:</span>
                    <p className="text-sm text-gray-600">{selectedWorkflow.description}</p>
                  </div>
                )}
                {executionStatus[selectedWorkflow.id] && (
                  <div>
                    <span className="font-semibold">Execution Status:</span>
                    <p className="text-sm text-gray-600">
                      {executionStatus[selectedWorkflow.id].status}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchWorkflows();
          }}
        />
      )}
    </div>
  );
};

const CreateWorkflowModal: React.FC<{
  onClose: () => void;
  onCreated: () => void;
}> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('');
  const [creating, setCreating] = useState(false);

  const templates = [
    { value: 'web-scraping-to-pgvector', label: 'Web Scraping to PgVector' },
    { value: 'rss-feed-processor', label: 'RSS Feed Processor' },
    { value: 'api-data-sync', label: 'API Data Sync' },
    { value: 'search-aggregation', label: 'Search Result Aggregation' }
  ];

  const handleCreate = async () => {
    if (!name) return;

    setCreating(true);
    try {
      const response = await fetch('/api/workflows/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          template: template || undefined
        })
      });

      if (response.ok) {
        onCreated();
      }
    } catch (error) {
      console.error('Failed to create workflow:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-4">Create New Workflow</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Enter workflow name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              rows={3}
              placeholder="Enter workflow description (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Start from scratch</option>
              {templates.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name || creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowManager;