import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

export class {{NodeName}} implements INodeType {
  description: INodeTypeDescription = {
    displayName: '{{Display Name}}',
    name: '{{nodeName}}',
    icon: 'file:{{nodeName}}.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: '{{Description}}',
    defaults: {
      name: '{{Display Name}}',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: '{{credentialName}}',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: '{{Resource Name}}',
            value: '{{resourceValue}}',
          },
        ],
        default: '{{resourceValue}}',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            resource: ['{{resourceValue}}'],
          },
        },
        options: [
          {
            name: 'Create',
            value: 'create',
            description: 'Create a new {{resource}}',
            action: 'Create a {{resource}}',
          },
          {
            name: 'Get',
            value: 'get',
            description: 'Get a {{resource}}',
            action: 'Get a {{resource}}',
          },
          {
            name: 'Update',
            value: 'update',
            description: 'Update a {{resource}}',
            action: 'Update a {{resource}}',
          },
          {
            name: 'Delete',
            value: 'delete',
            description: 'Delete a {{resource}}',
            action: 'Delete a {{resource}}',
          },
        ],
        default: 'create',
      },
      // Additional fields based on operation
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        displayOptions: {
          show: {
            resource: ['{{resourceValue}}'],
            operation: ['create', 'update'],
          },
        },
        options: [
          {
            displayName: 'Field Name',
            name: 'fieldName',
            type: 'string',
            default: '',
            description: 'Description of the field',
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0);
    const operation = this.getNodeParameter('operation', 0);

    for (let i = 0; i < items.length; i++) {
      try {
        if (resource === '{{resourceValue}}') {
          if (operation === 'create') {
            // Implement create logic
            const additionalFields = this.getNodeParameter('additionalFields', i);
            
            // API call or processing logic here
            const result = await this.createResource(additionalFields);
            
            returnData.push({
              json: result,
              pairedItem: { item: i },
            });
          }
          
          if (operation === 'get') {
            // Implement get logic
            const id = this.getNodeParameter('id', i) as string;
            
            const result = await this.getResource(id);
            
            returnData.push({
              json: result,
              pairedItem: { item: i },
            });
          }
          
          if (operation === 'update') {
            // Implement update logic
            const id = this.getNodeParameter('id', i) as string;
            const additionalFields = this.getNodeParameter('additionalFields', i);
            
            const result = await this.updateResource(id, additionalFields);
            
            returnData.push({
              json: result,
              pairedItem: { item: i },
            });
          }
          
          if (operation === 'delete') {
            // Implement delete logic
            const id = this.getNodeParameter('id', i) as string;
            
            const result = await this.deleteResource(id);
            
            returnData.push({
              json: { success: true, id },
              pairedItem: { item: i },
            });
          }
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error.message,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
      }
    }

    return [returnData];
  }

  // Helper methods
  private async createResource(data: any): Promise<any> {
    // Implement API call or processing
    return { id: 'new-id', ...data };
  }

  private async getResource(id: string): Promise<any> {
    // Implement API call or processing
    return { id, data: 'resource-data' };
  }

  private async updateResource(id: string, data: any): Promise<any> {
    // Implement API call or processing
    return { id, ...data, updated: true };
  }

  private async deleteResource(id: string): Promise<any> {
    // Implement API call or processing
    return { deleted: true };
  }
}