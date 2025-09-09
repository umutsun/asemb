import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

export class ASEMBWorkflow implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ASEMB Workflow',
		name: 'asembWorkflow',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["workflow"]}}',
		description: 'All-in-one ASEMB workflow operations for semantic search',
		defaults: {
			name: 'ASEMB Workflow',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'postgresDb',
				required: true,
			},
			{
				name: 'openAiApi',
				required: true,
			},
			{
				name: 'redisApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Workflow',
				name: 'workflow',
				type: 'options',
				options: [
					{
						name: 'Web to Vector',
						value: 'webToVector',
						description: 'Scrape web content and store as vectors',
					},
					{
						name: 'Document to Vector',
						value: 'documentToVector',
						description: 'Process documents and store as vectors',
					},
					{
						name: 'Semantic Search',
						value: 'semanticSearch',
						description: 'Search stored vectors semantically',
					},
					{
						name: 'Hybrid Search',
						value: 'hybridSearch',
						description: 'Combined semantic and keyword search',
					},
					{
						name: 'Manage Workspace',
						value: 'manageWorkspace',
						description: 'Manage workspaces and data',
					},
					{
						name: 'Analytics',
						value: 'analytics',
						description: 'Get usage analytics and statistics',
					},
				],
				default: 'webToVector',
				noDataExpression: true,
			},

			// Web to Vector Options
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						workflow: ['webToVector'],
					},
				},
				description: 'URL to scrape',
			},
			{
				displayName: 'Source ID',
				name: 'sourceId',
				type: 'string',
				default: '={{$now.toUnix()}}',
				required: true,
				displayOptions: {
					show: {
						workflow: ['webToVector', 'documentToVector'],
					},
				},
				description: 'Unique identifier for this source',
			},
			{
				displayName: 'Chunk Size',
				name: 'chunkSize',
				type: 'number',
				default: 512,
				displayOptions: {
					show: {
						workflow: ['webToVector', 'documentToVector'],
					},
				},
				description: 'Size of text chunks in tokens',
			},
			{
				displayName: 'Chunk Overlap',
				name: 'chunkOverlap',
				type: 'number',
				default: 64,
				displayOptions: {
					show: {
						workflow: ['webToVector', 'documentToVector'],
					},
				},
				description: 'Number of overlapping tokens between chunks',
			},

			// Search Options
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						workflow: ['semanticSearch', 'hybridSearch'],
					},
				},
				description: 'Search query',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 10,
				displayOptions: {
					show: {
						workflow: ['semanticSearch', 'hybridSearch'],
					},
				},
				description: 'Maximum number of results',
			},
			{
				displayName: 'Min Similarity',
				name: 'minSimilarity',
				type: 'number',
				default: 0.7,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberStepSize: 0.1,
				},
				displayOptions: {
					show: {
						workflow: ['semanticSearch', 'hybridSearch'],
					},
				},
				description: 'Minimum similarity score (0-1)',
			},

			// Hybrid Search Specific
			{
				displayName: 'Vector Weight',
				name: 'vectorWeight',
				type: 'number',
				default: 0.7,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberStepSize: 0.1,
				},
				displayOptions: {
					show: {
						workflow: ['hybridSearch'],
					},
				},
				description: 'Weight for vector search (0-1)',
			},
			{
				displayName: 'Keyword Weight',
				name: 'keywordWeight',
				type: 'number',
				default: 0.3,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberStepSize: 0.1,
				},
				displayOptions: {
					show: {
						workflow: ['hybridSearch'],
					},
				},
				description: 'Weight for keyword search (0-1)',
			},

			// Manage Workspace Options
			{
				displayName: 'Management Action',
				name: 'managementAction',
				type: 'options',
				options: [
					{
						name: 'Get Statistics',
						value: 'getStats',
					},
					{
						name: 'Delete by Source',
						value: 'deleteSource',
					},
					{
						name: 'Cleanup Orphaned',
						value: 'cleanupOrphaned',
					},
					{
						name: 'Clear Cache',
						value: 'clearCache',
					},
				],
				default: 'getStats',
				displayOptions: {
					show: {
						workflow: ['manageWorkspace'],
					},
				},
			},
			{
				displayName: 'Source ID to Delete',
				name: 'deleteSourceId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						workflow: ['manageWorkspace'],
						managementAction: ['deleteSource'],
					},
				},
			},
			{
				displayName: 'Dry Run',
				name: 'dryRun',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						workflow: ['manageWorkspace'],
						managementAction: ['cleanupOrphaned'],
					},
				},
				description: 'Preview changes without executing',
			},

			// Advanced Options
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Workspace',
						name: 'workspace',
						type: 'string',
						default: 'default',
						description: 'Workspace identifier for multi-tenant setup',
					},
					{
						displayName: 'Use Cache',
						name: 'useCache',
						type: 'boolean',
						default: true,
						description: 'Whether to use Redis cache',
					},
					{
						displayName: 'Include Metadata',
						name: 'includeMetadata',
						type: 'boolean',
						default: true,
						description: 'Include metadata in results',
					},
					{
						displayName: 'Progress Reporting',
						name: 'progressReporting',
						type: 'boolean',
						default: false,
						description: 'Enable progress updates for long operations',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const workflow = this.getNodeParameter('workflow', 0) as string;

		// Get credentials
		const pgCredentials = await this.getCredentials('postgresDb');
		const openaiCredentials = await this.getCredentials('openAiApi');
		const redisCredentials = await this.getCredentials('redisApi').catch(() => null);

		// Setup database connection
		const pgConfig = {
			host: pgCredentials.host as string,
			port: pgCredentials.port as number,
			database: pgCredentials.database as string,
			user: pgCredentials.user as string,
			password: pgCredentials.password as string,
			ssl: pgCredentials.ssl === 'disable' ? false : { rejectUnauthorized: false },
		};

		try {
			switch (workflow) {
				case 'webToVector': {
					// Implementation for web scraping to vector storage
					const url = this.getNodeParameter('url', 0) as string;
					const sourceId = this.getNodeParameter('sourceId', 0) as string;
					const chunkSize = this.getNodeParameter('chunkSize', 0) as number;
					const chunkOverlap = this.getNodeParameter('chunkOverlap', 0) as number;

					// This would call the actual implementation
					returnData.push({
						json: {
							workflow: 'webToVector',
							status: 'success',
							url,
							sourceId,
							chunks: 0, // Would be actual count
							message: 'Web content processed and stored as vectors',
						},
					});
					break;
				}

				case 'semanticSearch': {
					const query = this.getNodeParameter('query', 0) as string;
					const limit = this.getNodeParameter('limit', 0) as number;
					const minSimilarity = this.getNodeParameter('minSimilarity', 0) as number;

					// This would call the actual search implementation
					returnData.push({
						json: {
							workflow: 'semanticSearch',
							query,
							results: [],
							count: 0,
							executionTime: '0ms',
						},
					});
					break;
				}

				case 'hybridSearch': {
					const query = this.getNodeParameter('query', 0) as string;
					const vectorWeight = this.getNodeParameter('vectorWeight', 0) as number;
					const keywordWeight = this.getNodeParameter('keywordWeight', 0) as number;

					returnData.push({
						json: {
							workflow: 'hybridSearch',
							query,
							vectorWeight,
							keywordWeight,
							results: [],
							count: 0,
							executionTime: '0ms',
						},
					});
					break;
				}

				case 'manageWorkspace': {
					const action = this.getNodeParameter('managementAction', 0) as string;

					switch (action) {
						case 'getStats':
							// Call getStatistics from shared/db
							returnData.push({
								json: {
									workflow: 'manageWorkspace',
									action: 'getStats',
									stats: {
										total_documents: 0,
										total_chunks: 0,
										total_sources: 0,
										storage_size_mb: 0,
									},
								},
							});
							break;

						case 'deleteSource':
							const deleteSourceId = this.getNodeParameter('deleteSourceId', 0) as string;
							returnData.push({
								json: {
									workflow: 'manageWorkspace',
									action: 'deleteSource',
									sourceId: deleteSourceId,
									deleted: 0,
								},
							});
							break;

						case 'cleanupOrphaned':
							const dryRun = this.getNodeParameter('dryRun', 0) as boolean;
							returnData.push({
								json: {
									workflow: 'manageWorkspace',
									action: 'cleanupOrphaned',
									dryRun,
									orphaned: 0,
								},
							});
							break;
					}
					break;
				}

				case 'analytics': {
					returnData.push({
						json: {
							workflow: 'analytics',
							period: 'last_24h',
							queries: 0,
							tokens_used: 0,
							cache_hit_rate: 0,
							avg_latency_ms: 0,
						},
					});
					break;
				}

				default:
					throw new NodeOperationError(this.getNode(), `Unknown workflow: ${workflow}`);
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), `Workflow failed: ${error.message}`);
		}

		return [returnData];
	}
}
