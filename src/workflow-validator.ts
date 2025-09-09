import { INodeType, INodeTypeDescription, INodeExecutionData, IWorkflowBase } from 'n8n-workflow';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: WorkflowMetadata;
}

export interface ValidationError {
  nodeId: string;
  nodeName: string;
  type: 'connection' | 'parameter' | 'credential' | 'node_type';
  message: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  nodeId: string;
  nodeName: string;
  type: string;
  message: string;
}

export interface WorkflowMetadata {
  nodeCount: number;
  connectionCount: number;
  estimatedExecutionTime: number;
  requiredCredentials: string[];
  usedNodeTypes: string[];
}

export class WorkflowValidator {
  private availableNodeTypes: Map<string, INodeTypeDescription>;
  private requiredCredentials: Set<string>;

  constructor() {
    this.availableNodeTypes = new Map();
    this.requiredCredentials = new Set();
    this.initializeNodeTypes();
  }

  private initializeNodeTypes(): void {
    const asbNodeTypes = [
      'aliceSemanticBridge',
      'aliceSemanticBridgeEnhanced',
      'asembSearch',
      'asembWorkflow',
      'dashboard',
      'documentProcessor',
      'pgHybridQuery',
      'pgvectorQuery',
      'pgvectorUpsert',
      'redisPublish',
      'sitemapFetch',
      'textChunk',
      'webScrape',
      'webScrapeEnhanced'
    ];

    asbNodeTypes.forEach(nodeType => {
      this.availableNodeTypes.set(nodeType, {} as INodeTypeDescription);
    });

    const n8nBuiltinTypes = [
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.httpRequest',
      'n8n-nodes-base.set',
      'n8n-nodes-base.if',
      'n8n-nodes-base.merge',
      'n8n-nodes-base.code',
      'n8n-nodes-base.redis',
      'n8n-nodes-base.scheduleTrigger',
      'n8n-nodes-base.rssFeedRead',
      'n8n-nodes-base.splitInBatches',
      'n8n-nodes-base.errorTrigger',
      'n8n-nodes-base.respondToWebhook'
    ];

    n8nBuiltinTypes.forEach(nodeType => {
      this.availableNodeTypes.set(nodeType, {} as INodeTypeDescription);
    });
  }

  public async validateWorkflow(workflow: IWorkflowBase): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const metadata: WorkflowMetadata = {
      nodeCount: 0,
      connectionCount: 0,
      estimatedExecutionTime: 0,
      requiredCredentials: [],
      usedNodeTypes: []
    };

    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push({
        nodeId: 'workflow',
        nodeName: 'Workflow',
        type: 'node_type',
        message: 'Workflow has no nodes',
        severity: 'critical'
      });
      return { valid: false, errors, warnings, metadata };
    }

    metadata.nodeCount = workflow.nodes.length;
    const usedNodeTypes = new Set<string>();
    const nodeIds = new Set<string>();

    for (const node of workflow.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'node_type',
          message: `Duplicate node ID: ${node.id}`,
          severity: 'critical'
        });
      }
      nodeIds.add(node.id);

      if (!this.availableNodeTypes.has(node.type)) {
        warnings.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'node_type',
          message: `Unknown node type: ${node.type}. Make sure it's installed.`
        });
      }

      usedNodeTypes.add(node.type);

      if (!node.parameters) {
        warnings.push({
          nodeId: node.id,
          nodeName: node.name,
          type: 'parameter',
          message: 'Node has no parameters configured'
        });
      }

      if (node.credentials) {
        Object.keys(node.credentials).forEach(credType => {
          this.requiredCredentials.add(credType);
        });
      }

      if (node.type.includes('trigger') || node.type.includes('webhook')) {
        metadata.estimatedExecutionTime += 1;
      } else if (node.type.includes('embedding') || node.type.includes('semantic')) {
        metadata.estimatedExecutionTime += 5;
      } else {
        metadata.estimatedExecutionTime += 2;
      }
    }

    metadata.usedNodeTypes = Array.from(usedNodeTypes);
    metadata.requiredCredentials = Array.from(this.requiredCredentials);

    if (!workflow.connections || Object.keys(workflow.connections).length === 0) {
      errors.push({
        nodeId: 'workflow',
        nodeName: 'Workflow',
        type: 'connection',
        message: 'Workflow has no connections between nodes',
        severity: 'error'
      });
    } else {
      const connectedNodes = new Set<string>();
      Object.keys(workflow.connections).forEach(sourceName => {
        connectedNodes.add(sourceName);
        const nodeConnections = workflow.connections[sourceName];
        if (nodeConnections.main) {
          nodeConnections.main.forEach(outputs => {
            outputs.forEach(connection => {
              connectedNodes.add(connection.node);
              metadata.connectionCount++;
            });
          });
        }
      });

      workflow.nodes.forEach(node => {
        if (!connectedNodes.has(node.name) && !node.type.includes('trigger')) {
          warnings.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'connection',
            message: 'Node is not connected to any other node'
          });
        }
      });
    }

    const hasTrigger = workflow.nodes.some(node => 
      node.type.includes('trigger') || node.type.includes('webhook')
    );

    if (!hasTrigger) {
      errors.push({
        nodeId: 'workflow',
        nodeName: 'Workflow',
        type: 'node_type',
        message: 'Workflow has no trigger node',
        severity: 'error'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata
    };
  }

  public validateNodeConnection(
    sourceNode: any,
    targetNode: any,
    outputIndex: number = 0,
    inputIndex: number = 0
  ): boolean {
    if (!sourceNode || !targetNode) {
      return false;
    }

    const incompatibleConnections = [
      { source: 'webhook', target: 'errorTrigger' },
      { source: 'scheduleTrigger', target: 'webhook' }
    ];

    for (const incompatible of incompatibleConnections) {
      if (sourceNode.type.includes(incompatible.source) && 
          targetNode.type.includes(incompatible.target)) {
        return false;
      }
    }

    return true;
  }

  public validateParameters(node: any): ValidationError[] {
    const errors: ValidationError[] = [];

    const requiredParams: { [nodeType: string]: string[] } = {
      'pgvectorQuery': ['operation'],
      'pgvectorUpsert': ['documents', 'collection'],
      'webScrape': ['url'],
      'webScrapeEnhanced': ['url'],
      'textChunk': ['text', 'chunkSize'],
      'redisPublish': ['channel', 'message'],
      'aliceSemanticBridgeEnhanced': ['operation'],
      'asembSearch': ['searchQuery'],
      'dashboard': ['operation']
    };

    const nodeTypeKey = Object.keys(requiredParams).find(key => 
      node.type.includes(key)
    );

    if (nodeTypeKey && requiredParams[nodeTypeKey]) {
      const required = requiredParams[nodeTypeKey];
      const params = node.parameters || {};

      required.forEach(param => {
        if (!params[param]) {
          errors.push({
            nodeId: node.id,
            nodeName: node.name,
            type: 'parameter',
            message: `Required parameter '${param}' is missing`,
            severity: 'error'
          });
        }
      });
    }

    return errors;
  }

  public validateCredentials(workflow: IWorkflowBase): string[] {
    const missingCredentials: string[] = [];
    const credentialTypes = new Map<string, string>([
      ['aliceSemanticBridge', 'aliceSemanticBridgeApi'],
      ['aliceSemanticBridgeEnhanced', 'aliceSemanticBridgeApi'],
      ['pgvectorQuery', 'pgvectorApi'],
      ['pgvectorUpsert', 'pgvectorApi'],
      ['pgHybridQuery', 'pgvectorApi'],
      ['redisPublish', 'redisApi'],
      ['dashboard', 'dashboardApi']
    ]);

    workflow.nodes.forEach(node => {
      const credType = Array.from(credentialTypes.entries()).find(([nodeType]) => 
        node.type.includes(nodeType)
      );

      if (credType && (!node.credentials || !node.credentials[credType[1]])) {
        missingCredentials.push(`${node.name} requires ${credType[1]} credentials`);
      }
    });

    return missingCredentials;
  }

  public generateValidationReport(result: ValidationResult): string {
    let report = '# Workflow Validation Report\n\n';
    
    report += `## Summary\n`;
    report += `- Status: ${result.valid ? '✅ Valid' : '❌ Invalid'}\n`;
    report += `- Nodes: ${result.metadata.nodeCount}\n`;
    report += `- Connections: ${result.metadata.connectionCount}\n`;
    report += `- Estimated Execution Time: ${result.metadata.estimatedExecutionTime}s\n\n`;

    if (result.errors.length > 0) {
      report += `## Errors (${result.errors.length})\n`;
      result.errors.forEach(error => {
        report += `- **${error.severity.toUpperCase()}** [${error.nodeName}]: ${error.message}\n`;
      });
      report += '\n';
    }

    if (result.warnings.length > 0) {
      report += `## Warnings (${result.warnings.length})\n`;
      result.warnings.forEach(warning => {
        report += `- [${warning.nodeName}]: ${warning.message}\n`;
      });
      report += '\n';
    }

    if (result.metadata.requiredCredentials.length > 0) {
      report += `## Required Credentials\n`;
      result.metadata.requiredCredentials.forEach(cred => {
        report += `- ${cred}\n`;
      });
      report += '\n';
    }

    if (result.metadata.usedNodeTypes.length > 0) {
      report += `## Used Node Types\n`;
      result.metadata.usedNodeTypes.forEach(nodeType => {
        report += `- ${nodeType}\n`;
      });
    }

    return report;
  }
}

export default WorkflowValidator;