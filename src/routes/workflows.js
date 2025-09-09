const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { validateWorkflow } = require('../middleware/validation');
const redis = require('../config/redis');
const axios = require('axios');

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

class WorkflowController {
  async getWorkflows(req, res) {
    try {
      const { active, limit = 100, cursor } = req.query;
      
      const response = await axios.get(`${N8N_URL}/api/v1/workflows`, {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY
        },
        params: {
          active,
          limit,
          cursor
        }
      });
      
      const workflows = response.data.data.map(wf => ({
        id: wf.id,
        name: wf.name,
        active: wf.active,
        createdAt: wf.createdAt,
        updatedAt: wf.updatedAt,
        tags: wf.tags,
        nodeCount: wf.nodes?.length || 0
      }));
      
      res.json({
        workflows,
        nextCursor: response.data.nextCursor
      });
    } catch (error) {
      console.error('Get workflows error:', error);
      res.status(500).json({
        error: 'Failed to get workflows',
        message: error.message
      });
    }
  }
  
  async executeWorkflow(req, res) {
    try {
      const { workflowId, data = {} } = req.body;
      
      if (!workflowId) {
        return res.status(400).json({
          error: 'Workflow ID required'
        });
      }
      
      const webhookUrl = `${N8N_URL}/webhook/${workflowId}`;
      
      const response = await axios.post(webhookUrl, data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      await redis.incr('metrics:workflow_executions');
      
      await redis.publish('asb:workflow:status', JSON.stringify({
        type: 'execution_started',
        workflowId,
        timestamp: new Date().toISOString()
      }));
      
      res.json({
        success: true,
        executionId: response.data.executionId,
        result: response.data
      });
    } catch (error) {
      console.error('Execute workflow error:', error);
      res.status(500).json({
        error: 'Failed to execute workflow',
        message: error.message
      });
    }
  }
  
  async getWorkflowStatus(req, res) {
    try {
      const { id } = req.params;
      
      const response = await axios.get(`${N8N_URL}/api/v1/executions`, {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY
        },
        params: {
          workflowId: id,
          limit: 1
        }
      });
      
      const execution = response.data.data[0];
      
      if (!execution) {
        return res.status(404).json({
          error: 'No executions found for this workflow'
        });
      }
      
      res.json({
        workflowId: id,
        lastExecution: {
          id: execution.id,
          status: execution.finished ? 'completed' : execution.stoppedAt ? 'stopped' : 'running',
          startedAt: execution.startedAt,
          stoppedAt: execution.stoppedAt,
          mode: execution.mode,
          retryOf: execution.retryOf,
          retrySuccessId: execution.retrySuccessId
        }
      });
    } catch (error) {
      console.error('Get workflow status error:', error);
      res.status(500).json({
        error: 'Failed to get workflow status',
        message: error.message
      });
    }
  }
  
  async deployWorkflow(req, res) {
    try {
      const { workflow } = req.body;
      
      if (!workflow || !workflow.name || !workflow.nodes) {
        return res.status(400).json({
          error: 'Invalid workflow configuration'
        });
      }
      
      const asbWorkflow = {
        name: `ASB-${workflow.name}`,
        nodes: workflow.nodes,
        connections: workflow.connections || {},
        settings: {
          executionOrder: 'v1',
          saveExecutionProgress: true,
          saveDataSuccessExecution: 'all',
          saveDataErrorExecution: 'all',
          ...workflow.settings
        },
        active: workflow.active || false
      };
      
      const response = await axios.post(
        `${N8N_URL}/api/v1/workflows`,
        asbWorkflow,
        {
          headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      
      await redis.hset(
        'asb:workflows',
        response.data.id,
        JSON.stringify({
          id: response.data.id,
          name: response.data.name,
          deployedAt: new Date().toISOString(),
          deployedBy: req.user.email
        })
      );
      
      await redis.publish('asb:workflow:status', JSON.stringify({
        type: 'workflow_deployed',
        workflowId: response.data.id,
        name: response.data.name,
        timestamp: new Date().toISOString()
      }));
      
      res.status(201).json({
        success: true,
        workflowId: response.data.id,
        message: 'Workflow deployed successfully'
      });
    } catch (error) {
      console.error('Deploy workflow error:', error);
      res.status(500).json({
        error: 'Failed to deploy workflow',
        message: error.message
      });
    }
  }
  
  async deleteWorkflow(req, res) {
    try {
      const { id } = req.params;
      
      await axios.delete(`${N8N_URL}/api/v1/workflows/${id}`, {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY
        }
      });
      
      await redis.hdel('asb:workflows', id);
      
      await redis.publish('asb:workflow:status', JSON.stringify({
        type: 'workflow_deleted',
        workflowId: id,
        timestamp: new Date().toISOString()
      }));
      
      res.json({
        success: true,
        message: 'Workflow deleted successfully'
      });
    } catch (error) {
      console.error('Delete workflow error:', error);
      res.status(500).json({
        error: 'Failed to delete workflow',
        message: error.message
      });
    }
  }
  
  async getAsbWorkflows(req, res) {
    try {
      const asbWorkflows = await redis.hgetall('asb:workflows');
      
      const workflows = Object.entries(asbWorkflows).map(([id, data]) => ({
        id,
        ...JSON.parse(data)
      }));
      
      res.json({
        workflows,
        count: workflows.length
      });
    } catch (error) {
      console.error('Get ASB workflows error:', error);
      res.status(500).json({
        error: 'Failed to get ASB workflows',
        message: error.message
      });
    }
  }
}

const controller = new WorkflowController();

router.use(authMiddleware);

router.get('/', controller.getWorkflows);
router.get('/asb', controller.getAsbWorkflows);
router.post('/execute', controller.executeWorkflow);
router.get('/:id/status', controller.getWorkflowStatus);
router.post('/deploy', validateWorkflow, controller.deployWorkflow);
router.delete('/:id', controller.deleteWorkflow);

module.exports = router;