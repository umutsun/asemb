#!/usr/bin/env node

/**
 * Apply pgvector optimizations to the database
 */

const { Pool } = require('pg');
require('dotenv').config();

class PgVectorOptimizationScript {
	constructor() {
		this.pool = new Pool({
			host: process.env.POSTGRES_HOST || 'localhost',
			port: parseInt(process.env.POSTGRES_PORT || '5432'),
			database: process.env.POSTGRES_DB || 'asemb',
			user: process.env.POSTGRES_USER || 'postgres',
			password: process.env.POSTGRES_PASSWORD || 'password',
		});
	}

	async run() {
		console.log('🚀 Starting pgvector Optimization Process\n');
		console.log('=' .repeat(60));

		try {
			// Check current state
			await this.analyzeCurrentState();
			
			// Apply optimizations
			await this.createOptimizedIndexes();
			await this.optimizeQueryPerformance();
			await this.setupMaintenanceRoutines();
			
			// Verify improvements
			await this.verifyOptimizations();
			
			console.log('\n✅ All optimizations applied successfully!');
			
		} catch (error) {
			console.error('❌ Optimization failed:', error);
			process.exit(1);
		} finally {
			await this.pool.end();
		}
	}

	async analyzeCurrentState() {
		console.log('\n📊 Analyzing Current Database State...');
		console.log('-'.repeat(40));

		const client = await this.pool.connect();
		try {
			// Check table size
			const sizeResult = await client.query(`
				SELECT 
					COUNT(*) as row_count,
					pg_size_pretty(pg_total_relation_size('embeddings')) as total_size,
					pg_size_pretty(pg_relation_size('embeddings')) as table_size,
					pg_size_pretty(pg_indexes_size('embeddings')) as index_size
				FROM embeddings
			`);
			
			console.log('Table Statistics:');
			console.log(`  Rows: ${sizeResult.rows[0].row_count}`);
			console.log(`  Total Size: ${sizeResult.rows[0].total_size}`);
			console.log(`  Table Size: ${sizeResult.rows[0].table_size}`);
			console.log(`  Index Size: ${sizeResult.rows[0].index_size}`);

			// Check existing indexes
			const indexResult = await client.query(`
				SELECT 
					indexname,
					indexdef
				FROM pg_indexes
				WHERE tablename = 'embeddings'
			`);

			console.log('\nExisting Indexes:');
			indexResult.rows.forEach(row => {
				console.log(`  - ${row.indexname}`);
			});

			// Check vector dimension
			const dimResult = await client.query(`
				SELECT 
					MAX(array_length(string_to_array(embedding::text, ','), 1)) as dimension
				FROM embeddings
				LIMIT 1
			`);
			
			if (dimResult.rows.length > 0) {
				console.log(`\nVector Dimension: ${dimResult.rows[0].dimension}`);
			}

		} finally {
			client.release();
		}
	}

	async createOptimizedIndexes() {
		console.log('\n🔧 Creating Optimized Indexes...');
		console.log('-'.repeat(40));

		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');

			// Get table size for optimal configuration
			const countResult = await client.query('SELECT COUNT(*) FROM embeddings');
			const rowCount = parseInt(countResult.rows[0].count);
			
			// Calculate optimal lists for IVFFlat
			const lists = Math.min(Math.max(Math.sqrt(rowCount), 100), 5000);
			
			console.log(`Configuring IVFFlat with ${lists} lists for ${rowCount} rows...`);

			// Drop old indexes
			console.log('Dropping old indexes...');
			await client.query(`
				DROP INDEX IF EXISTS embeddings_vector_idx;
				DROP INDEX IF EXISTS embeddings_metadata_idx;
				DROP INDEX IF EXISTS embeddings_source_idx;
				DROP INDEX IF EXISTS embeddings_content_fts_idx;
				DROP INDEX IF EXISTS embeddings_composite_idx;
			`);

			// Create optimized vector index
			console.log('Creating IVFFlat vector index...');
			await client.query(`
				CREATE INDEX embeddings_vector_idx 
				ON embeddings 
				USING ivfflat (embedding vector_cosine_ops)
				WITH (lists = ${lists})
			`);

			// Create supporting indexes
			console.log('Creating supporting indexes...');
			
			// Metadata GIN index
			await client.query(`
				CREATE INDEX embeddings_metadata_idx 
				ON embeddings USING GIN (metadata)
			`);
			
			// Source ID index
			await client.query(`
				CREATE INDEX embeddings_source_idx 
				ON embeddings (source_id, chunk_index)
			`);
			
			// Full-text search index
			await client.query(`
				CREATE INDEX embeddings_content_fts_idx 
				ON embeddings USING GIN (to_tsvector('english', content))
			`);
			
			// Composite index for common queries
			await client.query(`
				CREATE INDEX embeddings_composite_idx 
				ON embeddings (source_id, chunk_index) 
				INCLUDE (content, metadata)
				WHERE metadata IS NOT NULL
			`);

			// Update statistics
			console.log('Updating table statistics...');
			await client.query('ANALYZE embeddings');

			await client.query('COMMIT');
			console.log('✅ Indexes created successfully');

		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async optimizeQueryPerformance() {
		console.log('\n⚡ Optimizing Query Performance...');
		console.log('-'.repeat(40));

		const client = await this.pool.connect();
		try {
			// Set optimal configuration parameters
			console.log('Setting optimal configuration...');
			
			// These are session-level settings for testing
			await client.query(`
				SET work_mem = '256MB';
				SET maintenance_work_mem = '512MB';
				SET effective_cache_size = '4GB';
				SET random_page_cost = 1.1;
			`);

			// Create prepared statements for common queries
			console.log('Creating prepared statements...');
			
			// Vector search
			await client.query(`
				PREPARE vector_search (vector, float, int) AS
				SELECT 
					source_id,
					content,
					1 - (embedding <=> $1) as similarity,
					metadata
				FROM embeddings
				WHERE 1 - (embedding <=> $1) > $2
				ORDER BY embedding <=> $1
				LIMIT $3
			`);

			// Hybrid search
			await client.query(`
				PREPARE hybrid_search (vector, float, int, text) AS
				WITH vector_results AS (
					SELECT 
						source_id,
						content,
						1 - (embedding <=> $1) as vector_score,
						metadata
					FROM embeddings
					WHERE 1 - (embedding <=> $1) > $2
					LIMIT $3 * 2
				),
				text_results AS (
					SELECT 
						source_id,
						content,
						ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $4)) as text_score,
						metadata
					FROM embeddings
					WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $4)
					LIMIT $3 * 2
				)
				SELECT 
					COALESCE(v.source_id, t.source_id) as source_id,
					COALESCE(v.content, t.content) as content,
					COALESCE(v.metadata, t.metadata) as metadata,
					COALESCE(v.vector_score, 0) * 0.7 + COALESCE(t.text_score, 0) * 0.3 as combined_score
				FROM vector_results v
				FULL OUTER JOIN text_results t USING (source_id)
				ORDER BY combined_score DESC
				LIMIT $3
			`);

			console.log('✅ Query optimizations applied');

		} finally {
			client.release();
		}
	}

	async setupMaintenanceRoutines() {
		console.log('\n🔧 Setting Up Maintenance Routines...');
		console.log('-'.repeat(40));

		const client = await this.pool.connect();
		try {
			// Run VACUUM ANALYZE
			console.log('Running VACUUM ANALYZE...');
			await client.query('VACUUM ANALYZE embeddings');

			// Create maintenance function
			console.log('Creating maintenance function...');
			await client.query(`
				CREATE OR REPLACE FUNCTION maintain_embeddings_table()
				RETURNS void AS $$
				BEGIN
					-- Update statistics
					ANALYZE embeddings;
					
					-- Log maintenance
					RAISE NOTICE 'Embeddings table maintenance completed at %', NOW();
				END;
				$$ LANGUAGE plpgsql;
			`);

			// Create monitoring function
			console.log('Creating monitoring function...');
			await client.query(`
				CREATE OR REPLACE FUNCTION get_embeddings_stats()
				RETURNS TABLE(
					total_rows bigint,
					table_size text,
					index_size text,
					total_size text,
					avg_similarity float,
					cache_hit_ratio float
				) AS $$
				BEGIN
					RETURN QUERY
					SELECT 
						COUNT(*)::bigint as total_rows,
						pg_size_pretty(pg_relation_size('embeddings')) as table_size,
						pg_size_pretty(pg_indexes_size('embeddings')) as index_size,
						pg_size_pretty(pg_total_relation_size('embeddings')) as total_size,
						0.0::float as avg_similarity,
						ROUND(
							(sum(blks_hit)::float / NULLIF(sum(blks_hit) + sum(blks_read), 0) * 100)::numeric, 
							2
						)::float as cache_hit_ratio
					FROM embeddings, pg_statio_user_tables
					WHERE schemaname = 'public' AND tablename = 'embeddings'
					GROUP BY embeddings.tableoid;
				END;
				$$ LANGUAGE plpgsql;
			`);

			console.log('✅ Maintenance routines created');

		} finally {
			client.release();
		}
	}

	async verifyOptimizations() {
		console.log('\n✔️ Verifying Optimizations...');
		console.log('-'.repeat(40));

		const client = await this.pool.connect();
		try {
			// Test vector search performance
			console.log('Testing vector search performance...');
			
			// Create a test vector (normally this would be a real embedding)
			const testVector = Array(1536).fill(0.1);
			const vectorString = `[${testVector.join(',')}]`;

			// Test query with EXPLAIN ANALYZE
			const explainResult = await client.query(`
				EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
				SELECT 
					source_id,
					content,
					1 - (embedding <=> $1::vector) as similarity
				FROM embeddings
				WHERE 1 - (embedding <=> $1::vector) > 0.7
				ORDER BY embedding <=> $1::vector
				LIMIT 10
			`, [vectorString]);

			const plan = explainResult.rows[0]['QUERY PLAN'][0];
			const executionTime = plan['Execution Time'] || plan['Planning Time'];
			
			console.log(`  Execution Time: ${executionTime}ms`);
			console.log(`  Using Index: ${JSON.stringify(plan).includes('Index Scan') ? 'Yes' : 'No'}`);

			// Get table statistics
			const statsResult = await client.query('SELECT * FROM get_embeddings_stats()');
			const stats = statsResult.rows[0];
			
			console.log('\nTable Statistics:');
			console.log(`  Total Rows: ${stats.total_rows}`);
			console.log(`  Table Size: ${stats.table_size}`);
			console.log(`  Index Size: ${stats.index_size}`);
			console.log(`  Total Size: ${stats.total_size}`);
			console.log(`  Cache Hit Ratio: ${stats.cache_hit_ratio}%`);

			// Check index usage
			const indexUsageResult = await client.query(`
				SELECT 
					indexrelname,
					idx_scan,
					idx_tup_read,
					idx_tup_fetch
				FROM pg_stat_user_indexes
				WHERE tablename = 'embeddings'
				ORDER BY idx_scan DESC
			`);

			console.log('\nIndex Usage:');
			indexUsageResult.rows.forEach(row => {
				console.log(`  ${row.indexrelname}: ${row.idx_scan} scans`);
			});

		} finally {
			client.release();
		}
	}
}

// Run the script
async function main() {
	const optimizer = new PgVectorOptimizationScript();
	await optimizer.run();
}

if (require.main === module) {
	main().catch(console.error);
}