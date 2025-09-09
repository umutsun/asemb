import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
	IDataObject,
} from 'n8n-workflow';

import { Pool } from 'pg';
import { getPool, deleteBySourceId, getStatistics, cleanupOrphaned } from '../shared/db';
import { EmbeddingService } from '../shared/embedding-service';
import { performHybridSearch } from '../shared/hybrid-search';
import { chunkText } from '../shared/chunk';
import { IAliceSemanticBridgeOperation, IProcessParameters, ISearchParameters, IManageParameters } from './interfaces/IAliceSemanticBridge';

export class AliceSemanticBridge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Alice Semantic Bridge',
		name: 'aliceSemanticBridge',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Main orchestrator for semantic search operations',
		defaults: {
			name: 'Alice Semantic Bridge',
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
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Process',
						value: 'process',
						description: 'Process and store content as vectors',
						action: 'Process content into vectors',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search stored content',
						action: 'Search vector database',
					},
					{
						name: 'Manage',
						value: 'manage',
						description: 'Manage stored data',
						action: 'Manage vector data',
					},
				],
				default: 'process',
				noDataExpression: true,
			},

			// Process Operation Parameters
			{
				displayName: 'Content Field',
				name: 'contentField',
				type: 'string',
				default: 'content',
				required: true,
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'The field containing the content to process',
			},
			{
				displayName: 'Source ID',
				name: 'sourceId',
				type: 'string',
				default: '={{$json["sourceId"]}}',
				required: true,
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'Unique identifier for the content source',
			},
			{
				displayName: 'Chunk Size',
				name: 'chunkSize',
				type: 'number',
				default: 512,
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'Maximum size of text chunks in tokens',
			},
			{
				displayName: 'Chunk Overlap',
				name: 'chunkOverlap',
				type: 'number',
				default: 64,
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'Number of overlapping tokens between chunks',
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'Additional metadata to store with vectors',
			},
			{
				displayName: 'Batch Size',
				name: 'batchSize',
				type: 'number',
				default: 100,
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'Number of items to process in parallel',
			},

			// Search Operation Parameters
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				description: 'The search query',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 10,
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				description: 'Maximum number of results to return',
			},
			{
				displayName: 'Search Mode',
				name: 'searchMode',
				type: 'options',
				options: [
					{
						name: 'Hybrid',
						value: 'hybrid',
						description: 'Combined vector and keyword search',
					},
					{
						name: 'Vector Only',
						value: 'vector',
						description: 'Semantic vector search only',
					},
					{
						name: 'Keyword Only',
						value: 'keyword',
						description: 'Traditional keyword search only',
					},
				],
				default: 'hybrid',
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Source Filter',
				name: 'sourceFilter',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				description: 'Filter results by source ID (optional)',
			},
			{
				displayName: 'Metadata Filter',
				name: 'metadataFilter',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				description: 'Filter results by metadata (JSON)',
			},
			{
				displayName: 'Similarity Threshold',
				name: 'similarityThreshold',
				type: 'number',
				default: 0.7,
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				description: 'Minimum similarity score (0-1)',
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberStepSize: 0.1,
				},
			},

			// Manage Operation Parameters
			{
				displayName: 'Manage Action',
				name: 'manageAction',
				type: 'options',
				options: [
					{
						name: 'Get Statistics',
						value: 'statistics',
						description: 'Get database statistics',
					},
					{
						name: 'Delete by Source',
						value: 'deleteSource',
						description: 'Delete all data for a source',
					},
					{
						name: 'Cleanup Orphaned',
						value: 'cleanup',
						description: 'Clean up orphaned data',
					},
					{
						name: 'Optimize Indexes',
						value: 'optimize',
						description: 'Optimize database indexes',
					},
				],
				default: 'statistics',
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
			},
			{
				displayName: 'Source ID',
				name: 'deleteSourceId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['manage'],
						manageAction: ['deleteSource'],
					},
				},
				description: 'Source ID to delete',
			},
			{
				displayName: 'Cascade Delete',
				name: 'cascadeDelete',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['manage'],
						manageAction: ['deleteSource'],
					},
				},
				description: 'Also delete related cache entries',
			},
			{
				displayName: 'Dry Run',
				name: 'dryRun',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['manage'],
						manageAction: ['cleanup'],
					},
				},
				description: 'Simulate cleanup without making changes',
			},
			{
				displayName: 'Workspace Filter',
				name: 'workspace',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['manage'],
						manageAction: ['statistics'],
					},
				},
				description: 'Filter statistics by workspace',
			},

			// Advanced Options
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Continue On Error',
						name: 'continueOnError',
						type: 'boolean',
						default: false,
						description: 'Continue processing if an item fails',
					},
					{
						displayName: 'Return Embeddings',
						name: 'returnEmbeddings',
						type: 'boolean',
						default: false,
						description: 'Include raw embeddings in results',
					},
					{
						displayName: 'Cache Results',
						name: 'cacheResults',
						type: 'boolean',
						default: true,
						description: 'Cache search results for faster repeated queries',
					},
					{
						displayName: 'Cache TTL',
						name: 'cacheTTL',
						type: 'number',
						default: 3600,
						description: 'Cache time-to-live in seconds',
					},
					{
						displayName: 'Progress Reporting',
						name: 'progressReporting',
						type: 'boolean',
						default: false,
						description: 'Enable progress reporting for batch operations',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as IAliceSemanticBridgeOperation;
		const options = this.getNodeParameter('options', 0, {}) as IDataObject;
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const pgCreds = await this.getCredentials('postgresDb') as any;
		const openAiCreds = await this.getCredentials('openAiApi') as any;
		
		// Initialize services
		const pool = getPool(this.getNode(), pgCreds);
		const embeddingService = new EmbeddingService(openAiCreds.apiKey);

		// Track progress if enabled
		let processedCount = 0;
		const totalCount = items.length;
		const reportProgress = options.progressReporting as boolean;

		try {
			switch (operation) {
				case 'process': {
					// Process content into vectors
					const results = await this.processContent(
						items,
						pool,
						embeddingService,
						options,
						(progress) => {
							if (reportProgress) {
								processedCount++;
								this.sendMessageToUI(`Processing: ${processedCount}/${totalCount}`);
							}
						}
					);
					returnData.push(...results);
					break;
				}

				case 'search': {
					// Search vector database
					const results = await this.searchContent(
						items,
						pool,
						embeddingService,
						options
					);
					returnData.push(...results);
					break;
				}

				case 'manage': {
					// Manage vector data
					const results = await this.manageData(
						items,
						pool,
						options
					);
					returnData.push(...results);
					break;
				}

				default:
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation: ${operation}`,
						{ itemIndex: 0 }
					);
			}

			return [returnData];
		} catch (error) {
			if (options.continueOnError) {
				returnData.push({
					json: {
						error: (error as Error).message,
						operation,
					},
					pairedItem: { item: 0 },
				});
				return [returnData];
			}
			throw error;
		}
	}

	private async processContent(
		items: INodeExecutionData[],
		pool: Pool,
		embeddingService: EmbeddingService,
		options: IDataObject,
		onProgress?: (progress: number) => void
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];
		const batchSize = this.getNodeParameter('batchSize', 0, 100) as number;
		const chunkSize = this.getNodeParameter('chunkSize', 0, 512) as number;
		const chunkOverlap = this.getNodeParameter('chunkOverlap', 0, 64) as number;

		// Process items in batches
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, Math.min(i + batchSize, items.length));
			const batchPromises = batch.map(async (item, index) => {
				const itemIndex = i + index;
				try {
					const contentField = this.getNodeParameter('contentField', itemIndex) as string;
					const sourceId = this.getNodeParameter('sourceId', itemIndex) as string;
					const metadata = this.getNodeParameter('metadata', itemIndex, {}) as IDataObject;
					
					const content = item.json[contentField] as string;
					if (!content) {
						throw new Error(`Content field "${contentField}" not found in item`);
					}

					// Chunk the text
					const chunks = chunkText(content, chunkSize, chunkOverlap);
					
					// Generate embeddings for each chunk
					const embeddings = await Promise.all(
						chunks.map(chunk => embeddingService.generateEmbedding(chunk))
					);

					// Store in database
					const client = await pool.connect();
					try {
						await client.query('BEGIN');
						
						for (let j = 0; j < chunks.length; j++) {
							await client.query(
								`INSERT INTO embeddings (source_id, content, embedding, metadata, chunk_index, total_chunks)
								 VALUES ($1, $2, $3, $4, $5, $6)`,
								[sourceId, chunks[j], JSON.stringify(embeddings[j]), metadata, j, chunks.length]
							);
						}
						
						await client.query('COMMIT');
					} catch (error) {
						await client.query('ROLLBACK');
						throw error;
					} finally {
						client.release();
					}

					if (onProgress) {
						onProgress((itemIndex + 1) / items.length);
					}

					return {
						json: {
							success: true,
							sourceId,
							chunksCreated: chunks.length,
							contentLength: content.length,
						},
						pairedItem: { item: itemIndex },
					};
				} catch (error) {
					if (options.continueOnError) {
						return {
							json: {
								error: (error as Error).message,
								itemIndex,
							},
							pairedItem: { item: itemIndex },
						};
					}
					throw error;
				}
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);
		}

		return results;
	}

	private async searchContent(
		items: INodeExecutionData[],
		pool: Pool,
		embeddingService: EmbeddingService,
		options: IDataObject
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const query = this.getNodeParameter('query', i) as string;
				const limit = this.getNodeParameter('limit', i, 10) as number;
				const searchMode = this.getNodeParameter('searchMode', i, 'hybrid') as string;
				const sourceFilter = this.getNodeParameter('sourceFilter', i, '') as string;
				const metadataFilter = this.getNodeParameter('metadataFilter', i, {}) as IDataObject;
				const similarityThreshold = this.getNodeParameter('similarityThreshold', i, 0.7) as number;

				let searchResults: any[] = [];

				if (searchMode === 'hybrid' || searchMode === 'vector') {
					// Generate query embedding
					const queryEmbedding = await embeddingService.generateEmbedding(query);

					if (searchMode === 'hybrid') {
						// Use hybrid search from shared module
						searchResults = await performHybridSearch(
							pool,
							query,
							queryEmbedding,
							limit,
							similarityThreshold,
							sourceFilter || undefined,
							metadataFilter
						);
					} else {
						// Vector-only search
						const client = await pool.connect();
						try {
							let sql = `
								SELECT id, source_id, content, 
									   1 - (embedding <=> $1::vector) as similarity,
									   metadata
								FROM embeddings
								WHERE 1 - (embedding <=> $1::vector) > $2
							`;
							const params: any[] = [JSON.stringify(queryEmbedding), similarityThreshold];
							let paramCount = 2;

							if (sourceFilter) {
								paramCount++;
								sql += ` AND source_id = $${paramCount}`;
								params.push(sourceFilter);
							}

							sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramCount + 1}`;
							params.push(limit);

							const result = await client.query(sql, params);
							searchResults = result.rows;
						} finally {
							client.release();
						}
					}
				} else if (searchMode === 'keyword') {
					// Keyword-only search
					const client = await pool.connect();
					try {
						let sql = `
							SELECT id, source_id, content, metadata,
								   ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
							FROM embeddings
							WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
						`;
						const params: any[] = [query];
						let paramCount = 1;

						if (sourceFilter) {
							paramCount++;
							sql += ` AND source_id = $${paramCount}`;
							params.push(sourceFilter);
						}

						sql += ` ORDER BY rank DESC LIMIT $${paramCount + 1}`;
						params.push(limit);

						const result = await client.query(sql, params);
						searchResults = result.rows;
					} finally {
						client.release();
					}
				}

				results.push({
					json: {
						query,
						mode: searchMode,
						results: searchResults,
						resultCount: searchResults.length,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (options.continueOnError) {
					results.push({
						json: {
							error: (error as Error).message,
							itemIndex: i,
						},
						pairedItem: { item: i },
					});
				} else {
					throw error;
				}
			}
		}

		return results;
	}

	private async manageData(
		items: INodeExecutionData[],
		pool: Pool,
		options: IDataObject
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const manageAction = this.getNodeParameter('manageAction', i) as string;
				let result: any = {};

				switch (manageAction) {
					case 'statistics': {
						const workspace = this.getNodeParameter('workspace', i, '') as string;
						result = await getStatistics(pool, workspace || undefined);
						break;
					}

					case 'deleteSource': {
						const sourceId = this.getNodeParameter('deleteSourceId', i) as string;
						const cascade = this.getNodeParameter('cascadeDelete', i, true) as boolean;
						result = await deleteBySourceId(pool, sourceId, { cascade });
						break;
					}

					case 'cleanup': {
						const dryRun = this.getNodeParameter('dryRun', i, true) as boolean;
						result = await cleanupOrphaned(pool, { dryRun, batchSize: 100 });
						break;
					}

					case 'optimize': {
						const client = await pool.connect();
						try {
							await client.query('VACUUM ANALYZE embeddings');
							await client.query('REINDEX TABLE embeddings');
							result = { optimized: true, message: 'Indexes optimized successfully' };
						} finally {
							client.release();
						}
						break;
					}

					default:
						throw new Error(`Unknown manage action: ${manageAction}`);
				}

				results.push({
					json: {
						action: manageAction,
						...result,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (options.continueOnError) {
					results.push({
						json: {
							error: (error as Error).message,
							itemIndex: i,
						},
						pairedItem: { item: i },
					});
				} else {
					throw error;
				}
			}
		}

		return results;
	}
}