const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const WorkflowValidator = require('../dist/workflow-validator').default;

const validator = new WorkflowValidator();
const WORKFLOWS_DIR = path.join(__dirname, '../workflows');
const TEMPLATES_DIR = path.join(WORKFLOWS_DIR, 'templates');
const ACTIVE_DIR = path.join(WORKFLOWS_DIR, 'active');

async function ensureDirectories() {
  await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.mkdir(ACTIVE_DIR, { recursive: true });
}

/**
 * @route POST /api/workflows/create
 * @desc Create a new workflow from template or scratch
 * @body {
 *   name: string,
 *   template?: string,
 *   workflow?: object,
 *   description?: string,
 *   tags?: string[]
 * }
 */
router.post('/create', async (req, res) => {
  try {
    await ensureDirectories();
    const { name, template, workflow, description, tags } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Workflow name is required' });
    }

    let workflowData;

    if (template) {
      const templatePath = path.join(TEMPLATES_DIR, `${template}.json`);
      const templateContent = await fs.readFile(templatePath, 'utf8');
      workflowData = JSON.parse(templateContent);
      workflowData.name = name;
    } else if (workflow) {
      workflowData = workflow;
      workflowData.name = name;
    } else {
      workflowData = {
        name,
        nodes: [],
        connections: {},
        active: false,
        settings: {
          executionOrder: 'v1',
          saveDataSuccessExecution: 'all',
          saveExecutionProgress: true,
          saveManualExecutions: true
        },
        tags: tags || [],
        versionId: '1.0.0'
      };
    }

    workflowData.id = workflowData.id || uuidv4();
    workflowData.createdAt = new Date().toISOString();
    workflowData.updatedAt = new Date().toISOString();
    if (description) workflowData.description = description;

    const workflowPath = path.join(ACTIVE_DIR, `${workflowData.id}.json`);
    await fs.writeFile(workflowPath, JSON.stringify(workflowData, null, 2));

    res.status(201).json({
      success: true,
      workflow: {
        id: workflowData.id,
        name: workflowData.name,
        description: workflowData.description,
        createdAt: workflowData.createdAt
      }
    });
  } catch (error) {
    console.error('Create workflow error:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

/**
 * @route POST /api/workflows/validate
 * @desc Validate a workflow configuration
 * @body {
 *   workflow: object
 * }
 */
router.post('/validate', async (req, res) => {
  try {
    const { workflow } = req.body;

    if (!workflow) {
      return res.status(400).json({ error: 'Workflow data is required' });
    }

    const validationResult = await validator.validateWorkflow(workflow);
    const report = validator.generateValidationReport(validationResult);

    res.json({
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      metadata: validationResult.metadata,
      report
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Failed to validate workflow' });
  }
});

/**
 * @route POST /api/workflows/execute
 * @desc Execute a workflow (trigger via n8n API)
 * @body {
 *   workflowId: string,
 *   data?: object
 * }
 */
router.post('/execute', async (req, res) => {
  try {
    const { workflowId, data } = req.body;

    if (!workflowId) {
      return res.status(400).json({ error: 'Workflow ID is required' });
    }

    const workflowPath = path.join(ACTIVE_DIR, `${workflowId}.json`);
    const workflowExists = await fs.access(workflowPath).then(() => true).catch(() => false);

    if (!workflowExists) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflowContent = await fs.readFile(workflowPath, 'utf8');
    const workflow = JSON.parse(workflowContent);

    const validationResult = await validator.validateWorkflow(workflow);
    if (!validationResult.valid) {
      return res.status(400).json({
        error: 'Workflow validation failed',
        errors: validationResult.errors
      });
    }

    const executionId = uuidv4();
    const execution = {
      id: executionId,
      workflowId,
      status: 'queued',
      startedAt: new Date().toISOString(),
      data: data || {}
    };

    const executionPath = path.join(WORKFLOWS_DIR, 'executions', `${executionId}.json`);
    await fs.mkdir(path.join(WORKFLOWS_DIR, 'executions'), { recursive: true });
    await fs.writeFile(executionPath, JSON.stringify(execution, null, 2));

    res.json({
      success: true,
      executionId,
      status: 'queued',
      message: 'Workflow execution queued'
    });
  } catch (error) {
    console.error('Execution error:', error);
    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

/**
 * @route GET /api/workflows/status/:id
 * @desc Get workflow execution status
 */
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const executionPath = path.join(WORKFLOWS_DIR, 'executions', `${id}.json`);
    
    const executionExists = await fs.access(executionPath).then(() => true).catch(() => false);
    if (!executionExists) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const executionContent = await fs.readFile(executionPath, 'utf8');
    const execution = JSON.parse(executionContent);

    res.json({
      id: execution.id,
      workflowId: execution.workflowId,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      error: execution.error,
      result: execution.result
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get execution status' });
  }
});

/**
 * @route GET /api/workflows/list
 * @desc List all workflows
 */
router.get('/list', async (req, res) => {
  try {
    await ensureDirectories();
    const { type = 'active' } = req.query;
    
    const dir = type === 'templates' ? TEMPLATES_DIR : ACTIVE_DIR;
    const files = await fs.readdir(dir);
    const workflows = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const workflow = JSON.parse(content);
        workflows.push({
          id: workflow.id || path.basename(file, '.json'),
          name: workflow.name,
          description: workflow.description,
          tags: workflow.tags || [],
          active: workflow.active || false,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt
        });
      }
    }

    res.json({
      workflows,
      total: workflows.length,
      type
    });
  } catch (error) {
    console.error('List workflows error:', error);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

/**
 * @route GET /api/workflows/:id
 * @desc Get workflow by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflowPath = path.join(ACTIVE_DIR, `${id}.json`);
    
    const workflowExists = await fs.access(workflowPath).then(() => true).catch(() => false);
    if (!workflowExists) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflowContent = await fs.readFile(workflowPath, 'utf8');
    const workflow = JSON.parse(workflowContent);

    res.json(workflow);
  } catch (error) {
    console.error('Get workflow error:', error);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

/**
 * @route PUT /api/workflows/:id
 * @desc Update workflow
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const workflowPath = path.join(ACTIVE_DIR, `${id}.json`);
    const workflowExists = await fs.access(workflowPath).then(() => true).catch(() => false);
    
    if (!workflowExists) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflowContent = await fs.readFile(workflowPath, 'utf8');
    const workflow = JSON.parse(workflowContent);

    const updatedWorkflow = {
      ...workflow,
      ...updates,
      id: workflow.id,
      createdAt: workflow.createdAt,
      updatedAt: new Date().toISOString()
    };

    if (updates.nodes || updates.connections) {
      const validationResult = await validator.validateWorkflow(updatedWorkflow);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Workflow validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings
        });
      }
    }

    await fs.writeFile(workflowPath, JSON.stringify(updatedWorkflow, null, 2));

    res.json({
      success: true,
      workflow: {
        id: updatedWorkflow.id,
        name: updatedWorkflow.name,
        updatedAt: updatedWorkflow.updatedAt
      }
    });
  } catch (error) {
    console.error('Update workflow error:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

/**
 * @route DELETE /api/workflows/:id
 * @desc Delete workflow
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflowPath = path.join(ACTIVE_DIR, `${id}.json`);
    
    const workflowExists = await fs.access(workflowPath).then(() => true).catch(() => false);
    if (!workflowExists) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await fs.unlink(workflowPath);

    res.json({
      success: true,
      message: 'Workflow deleted successfully'
    });
  } catch (error) {
    console.error('Delete workflow error:', error);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

/**
 * @route POST /api/workflows/import
 * @desc Import workflow from JSON
 */
router.post('/import', async (req, res) => {
  try {
    const { workflow } = req.body;

    if (!workflow) {
      return res.status(400).json({ error: 'Workflow data is required' });
    }

    const validationResult = await validator.validateWorkflow(workflow);
    if (!validationResult.valid) {
      return res.status(400).json({
        error: 'Workflow validation failed',
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }

    workflow.id = workflow.id || uuidv4();
    workflow.importedAt = new Date().toISOString();

    const workflowPath = path.join(ACTIVE_DIR, `${workflow.id}.json`);
    await fs.writeFile(workflowPath, JSON.stringify(workflow, null, 2));

    res.json({
      success: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        importedAt: workflow.importedAt
      }
    });
  } catch (error) {
    console.error('Import workflow error:', error);
    res.status(500).json({ error: 'Failed to import workflow' });
  }
});

/**
 * @route GET /api/workflows/export/:id
 * @desc Export workflow as JSON
 */
router.get('/export/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflowPath = path.join(ACTIVE_DIR, `${id}.json`);
    
    const workflowExists = await fs.access(workflowPath).then(() => true).catch(() => false);
    if (!workflowExists) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflowContent = await fs.readFile(workflowPath, 'utf8');
    const workflow = JSON.parse(workflowContent);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${workflow.name || id}.json"`);
    res.send(workflowContent);
  } catch (error) {
    console.error('Export workflow error:', error);
    res.status(500).json({ error: 'Failed to export workflow' });
  }
});

module.exports = router;