/**
 * pgvector Query Optimizer
 * Implements advanced optimization techniques for vector similarity search
 */

import { Pool, PoolClient } from 'pg';
import { PerformanceMetrics } from '../monitoring/metrics';

export interface VectorSearchOptions {
	limit?: number;
	threshold?: number;
	useIndex?: boolean;
	preFilter?: Record<string, any>;
	rerank?: boolean;
	hybridSearch?: boolean;
}

export interface IndexConfig {
	type: 'ivfflat' | 'hnsw';
	lists?: number; // for ivfflat
	m?: number; // for hnsw
	efConstruction?: number; // for hnsw
	efSearch?: number; // for hnsw search
}

export class PgVectorOptimizer {
	private pool: Pool;
	private metrics: PerformanceMetrics;
	private preparedStatements: Map<string, string>;

	constructor(pool: Pool) {
		this.pool = pool;
		this.metrics = new PerformanceMetrics();
		this.preparedStatements = new Map();
		this.initializePreparedStatements();
	}

	/**
	 * Initialize commonly used prepared statements
	 */
	private initializePreparedStatements() {
		// Basic similarity search
		this.preparedStatements.set('vector_search_basic', `
			SELECT 
				source_id,
				content,
				1 - (embedding <=> $1::vector) as similarity,
				metadata,
				chunk_index,
				total_chunks
			FROM embeddings
			WHERE 1 - (embedding <=> $1::vector) > $2
			ORDER BY embedding <=> $1::vector
			LIMIT $3
		`);

		// Search with metadata filtering
		this.preparedStatements.set('vector_search_filtered', `
			SELECT 
				source_id,
				content,
				1 - (embedding <=> $1::vector) as similarity,
				metadata,
				chunk_index,
				total_chunks
			FROM embeddings
			WHERE 
				1 - (embedding <=> $1::vector) > $2
				AND ($4::jsonb IS NULL OR metadata @> $4::jsonb)
			ORDER BY embedding <=> $1::vector
			LIMIT $3
		`);

		// Hybrid search combining vector and keyword
		this.preparedStatements.set('hybrid_search', `
			WITH vector_results AS (
				SELECT 
					source_id,
					content,
					1 - (embedding <=> $1::vector) as vector_score,
					metadata,
					chunk_index,
					total_chunks
				FROM embeddings
				WHERE 1 - (embedding <=> $1::vector) > $2
				ORDER BY embedding <=> $1::vector
				LIMIT $3 * 2
			),
			keyword_results AS (
				SELECT 
					source_id,
					content,
					ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $4)) as text_score,
					metadata,
					chunk_index,
					total_chunks
				FROM embeddings
				WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $4)
				LIMIT $3 * 2
			),
			combined AS (
				SELECT 
					COALESCE(v.source_id, k.source_id) as source_id,
					COALESCE(v.content, k.content) as content,
					COALESCE(v.metadata, k.metadata) as metadata,
					COALESCE(v.chunk_index, k.chunk_index) as chunk_index,
					COALESCE(v.total_chunks, k.total_chunks) as total_chunks,
					COALESCE(v.vector_score, 0) * 0.7 + COALESCE(k.text_score, 0) * 0.3 as combined_score
				FROM vector_results v
				FULL OUTER JOIN keyword_results k 
					ON v.source_id = k.source_id AND v.chunk_index = k.chunk_index
			)
			SELECT * FROM combined
			ORDER BY combined_score DESC
			LIMIT $3
		`);

		// Approximate nearest neighbor with index
		this.preparedStatements.set('ann_search', `
			SELECT 
				source_id,
				content,
				1 - (embedding <=> $1::vector) as similarity,
				metadata
			FROM embeddings
			ORDER BY embedding <=> $1::vector
			LIMIT $2
		`);

		// Batch similarity computation
		this.preparedStatements.set('batch_similarity', `
			SELECT 
				e1.source_id as source1,
				e2.source_id as source2,
				1 - (e1.embedding <=> e2.embedding) as similarity
			FROM embeddings e1
			CROSS JOIN embeddings e2
			WHERE 
				e1.source_id = ANY($1::varchar[])
				AND e2.source_id = ANY($2::varchar[])
				AND e1.source_id != e2.source_id
				AND 1 - (e1.embedding <=> e2.embedding) > $3
		`);
	}

	/**
	 * Optimized vector search with multiple strategies
	 */
	async search(
		queryEmbedding: number[],
		options: VectorSearchOptions = {}
	): Promise<any[]> {
		const {
			limit = 10,
			threshold = 0.7,
			useIndex = true,
			preFilter,
			rerank = false,
			hybridSearch = false
		} = options;

		this.metrics.startTimer('vector_search');
		let client: PoolClient | undefined;

		try {
			client = await this.pool.connect();

			// Choose search strategy
			let query: string;
			let params: any[];

			if (hybridSearch) {
				// Use hybrid search combining vector and text
				query = this.preparedStatements.get('hybrid_search')!;
				params = [
					JSON.stringify(queryEmbedding),
					threshold,
					limit,
					options.hybridSearch // keyword for text search
				];
			} else if (preFilter) {
				// Use filtered search
				query = this.preparedStatements.get('vector_search_filtered')!;
				params = [
					JSON.stringify(queryEmbedding),
					threshold,
					limit,
					JSON.stringify(preFilter)
				];
			} else if (useIndex) {
				// Use approximate nearest neighbor with index
				query = this.preparedStatements.get('ann_search')!;
				params = [JSON.stringify(queryEmbedding), limit * 2]; // Get more for reranking
			} else {
				// Basic similarity search
				query = this.preparedStatements.get('vector_search_basic')!;
				params = [JSON.stringify(queryEmbedding), threshold, limit];
			}

			const result = await client.query(query, params);
			let results = result.rows;

			// Rerank if requested
			if (rerank && results.length > limit) {
				results = await this.rerankResults(results, queryEmbedding, limit);
			}

			const searchTime = this.metrics.endTimer('vector_search');
			this.metrics.recordMetric('search_results', results.length);
			this.metrics.recordMetric('search_time_ms', searchTime);

			return results;

		} finally {
			if (client) {
				client.release();
			}
		}
	}

	/**
	 * Create optimized indexes for vector search
	 */
	async createOptimizedIndexes(config: IndexConfig = { type: 'ivfflat' }): Promise<void> {
		const client = await this.pool.connect();

		try {
			await client.query('BEGIN');

			// Drop existing indexes
			await client.query(`
				DROP INDEX IF EXISTS embeddings_vector_idx;
				DROP INDEX IF EXISTS embeddings_metadata_idx;
				DROP INDEX IF EXISTS embeddings_source_idx;
				DROP INDEX IF EXISTS embeddings_content_fts_idx;
			`);

			// Create vector index based on configuration
			if (config.type === 'ivfflat') {
				const lists = config.lists || this.calculateOptimalLists(await this.getTableSize());
				
				await client.query(`
					CREATE INDEX embeddings_vector_idx 
					ON embeddings 
					USING ivfflat (embedding vector_cosine_ops)
					WITH (lists = ${lists})
				`);
				
				console.log(`Created IVFFlat index with ${lists} lists`);
			} else if (config.type === 'hnsw') {
				const m = config.m || 16;
				const efConstruction = config.efConstruction || 200;
				
				await client.query(`
					CREATE INDEX embeddings_vector_idx 
					ON embeddings 
					USING hnsw (embedding vector_cosine_ops)
					WITH (m = ${m}, ef_construction = ${efConstruction})
				`);
				
				console.log(`Created HNSW index with m=${m}, ef_construction=${efConstruction}`);
			}

			// Create supporting indexes
			await client.query(`
				-- Metadata GIN index for JSONB queries
				CREATE INDEX embeddings_metadata_idx 
				ON embeddings USING GIN (metadata);
				
				-- Source ID index for lookups
				CREATE INDEX embeddings_source_idx 
				ON embeddings (source_id, chunk_index);
				
				-- Full-text search index
				CREATE INDEX embeddings_content_fts_idx 
				ON embeddings USING GIN (to_tsvector('english', content));
				
				-- Composite index for filtered searches
				CREATE INDEX embeddings_composite_idx 
				ON embeddings (source_id, chunk_index) 
				INCLUDE (content, metadata);
			`);

			// Update table statistics
			await client.query('ANALYZE embeddings');

			await client.query('COMMIT');
			console.log('✅ All indexes created successfully');

		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	/**
	 * Calculate optimal number of lists for IVFFlat index
	 */
	private calculateOptimalLists(tableSize: number): number {
		// Formula: lists = max(tableSize / 1000, sqrt(tableSize))
		const sqrtSize = Math.sqrt(tableSize);
		const divSize = tableSize / 1000;
		return Math.min(Math.max(sqrtSize, divSize, 100), 5000);
	}

	/**
	 * Get table size for optimization calculations
	 */
	private async getTableSize(): Promise<number> {
		const result = await this.pool.query('SELECT COUNT(*) FROM embeddings');
		return parseInt(result.rows[0].count);
	}

	/**
	 * Rerank results using more sophisticated scoring
	 */
	private async rerankResults(
		results: any[],
		queryEmbedding: number[],
		limit: number
	): Promise<any[]> {
		// Calculate additional features for reranking
		const rerankedResults = results.map(result => {
			// Diversity score (penalize similar chunks from same source)
			const diversityScore = this.calculateDiversityScore(result, results);
			
			// Recency score (prefer newer content)
			const recencyScore = this.calculateRecencyScore(result);
			
			// Length normalization
			const lengthScore = this.calculateLengthScore(result.content);
			
			// Combined score
			result.finalScore = 
				result.similarity * 0.6 +
				diversityScore * 0.2 +
				recencyScore * 0.1 +
				lengthScore * 0.1;
			
			return result;
		});

		// Sort by final score and return top results
		return rerankedResults
			.sort((a, b) => b.finalScore - a.finalScore)
			.slice(0, limit);
	}

	private calculateDiversityScore(result: any, allResults: any[]): number {
		const sameSource = allResults.filter(r => 
			r.source_id === result.source_id && 
			Math.abs(r.chunk_index - result.chunk_index) <= 1
		);
		return 1 / (1 + sameSource.length);
	}

	private calculateRecencyScore(result: any): number {
		if (!result.metadata?.created_at) return 0.5;
		const age = Date.now() - new Date(result.metadata.created_at).getTime();
		const ageInDays = age / (1000 * 60 * 60 * 24);
		return Math.exp(-ageInDays / 365); // Exponential decay over a year
	}

	private calculateLengthScore(content: string): number {
		const length = content.length;
		const optimalLength = 500;
		return Math.exp(-Math.abs(length - optimalLength) / 1000);
	}

	/**
	 * Optimize query performance with query planning
	 */
	async analyzeQueryPerformance(query: string, params: any[]): Promise<any> {
		const client = await this.pool.connect();

		try {
			// Get query execution plan
			const explainResult = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`, params);
			
			// Parse execution plan
			const plan = explainResult.rows.map(row => row['QUERY PLAN']).join('\n');
			
			// Extract key metrics
			const metrics = {
				totalTime: this.extractMetric(plan, 'Execution Time'),
				planningTime: this.extractMetric(plan, 'Planning Time'),
				bufferHits: this.extractMetric(plan, 'Shared Hit Blocks'),
				bufferReads: this.extractMetric(plan, 'Shared Read Blocks'),
				indexUsed: plan.includes('Index Scan'),
				seqScan: plan.includes('Seq Scan'),
				recommendations: []
			};

			// Generate recommendations
			if (metrics.seqScan) {
				metrics.recommendations.push('Consider adding an index to avoid sequential scan');
			}
			if (metrics.bufferReads > metrics.bufferHits) {
				metrics.recommendations.push('Low cache hit rate - consider increasing shared_buffers');
			}
			if (metrics.totalTime > 1000) {
				metrics.recommendations.push('Query is slow - consider optimizing or adding indexes');
			}

			return metrics;

		} finally {
			client.release();
		}
	}

	private extractMetric(plan: string, metric: string): number {
		const regex = new RegExp(`${metric}:\\s*([\\d.]+)`);
		const match = plan.match(regex);
		return match ? parseFloat(match[1]) : 0;
	}

	/**
	 * Vacuum and analyze tables for optimal performance
	 */
	async optimizeTableMaintenance(): Promise<void> {
		const client = await this.pool.connect();

		try {
			console.log('Starting table maintenance...');
			
			// Vacuum to reclaim space
			await client.query('VACUUM (ANALYZE, VERBOSE) embeddings');
			
			// Reindex for optimal performance
			await client.query('REINDEX TABLE embeddings');
			
			// Update statistics
			await client.query('ANALYZE embeddings');
			
			// Check bloat
			const bloatResult = await client.query(`
				SELECT 
					pg_size_pretty(pg_total_relation_size('embeddings')) as total_size,
					pg_size_pretty(pg_relation_size('embeddings')) as table_size,
					pg_size_pretty(pg_indexes_size('embeddings')) as indexes_size,
					(pg_total_relation_size('embeddings') - pg_relation_size('embeddings')) * 100.0 / 
					NULLIF(pg_total_relation_size('embeddings'), 0) as bloat_ratio
				FROM pg_class
				WHERE relname = 'embeddings'
			`);
			
			console.log('Table maintenance completed:');
			console.log(bloatResult.rows[0]);

		} finally {
			client.release();
		}
	}

	/**
	 * Get performance statistics
	 */
	getPerformanceStats(): any {
		return this.metrics.getStats();
	}
}

/**
 * Query builder for complex vector searches
 */
export class VectorQueryBuilder {
	private query: string = '';
	private params: any[] = [];
	private paramCounter = 1;

	select(fields: string[]): this {
		this.query = `SELECT ${fields.join(', ')} FROM embeddings`;
		return this;
	}

	whereVectorSimilarity(embedding: number[], threshold: number): this {
		this.params.push(JSON.stringify(embedding), threshold);
		this.query += ` WHERE 1 - (embedding <=> $${this.paramCounter}::vector) > $${this.paramCounter + 1}`;
		this.paramCounter += 2;
		return this;
	}

	andMetadata(metadata: Record<string, any>): this {
		this.params.push(JSON.stringify(metadata));
		this.query += ` AND metadata @> $${this.paramCounter}::jsonb`;
		this.paramCounter++;
		return this;
	}

	orderBySimilarity(embedding: number[]): this {
		if (!this.params.includes(JSON.stringify(embedding))) {
			this.params.push(JSON.stringify(embedding));
			this.query += ` ORDER BY embedding <=> $${this.paramCounter}::vector`;
			this.paramCounter++;
		} else {
			this.query += ` ORDER BY embedding <=> $1::vector`;
		}
		return this;
	}

	limit(n: number): this {
		this.params.push(n);
		this.query += ` LIMIT $${this.paramCounter}`;
		this.paramCounter++;
		return this;
	}

	build(): { query: string; params: any[] } {
		return { query: this.query, params: this.params };
	}
}