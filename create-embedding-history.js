const { Pool } = require('pg');

const asembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'asemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function createEmbeddingHistoryTable() {
  const client = await asembPool.connect();
  try {
    console.log('Creating embedding_history table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS embedding_history (
          id SERIAL PRIMARY KEY,
          operation_id TEXT NOT NULL,
          source_table VARCHAR(100) NOT NULL,
          source_type VARCHAR(50) NOT NULL,
          records_processed INTEGER DEFAULT 0,
          records_success INTEGER DEFAULT 0,
          records_failed INTEGER DEFAULT 0,
          embedding_model VARCHAR(100) NOT NULL,
          batch_size INTEGER DEFAULT 50,
          worker_count INTEGER DEFAULT 1,
          status VARCHAR(20) DEFAULT 'pending',
          started_at TIMESTAMP WITH TIME ZONE,
          completed_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_history_operation_id ON embedding_history(operation_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_history_source_table ON embedding_history(source_table)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_history_status ON embedding_history(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_history_created_at ON embedding_history(created_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_history_started_at ON embedding_history(started_at)
    `);

    // Create views
    await client.query(`
      CREATE OR REPLACE VIEW embedding_statistics AS
      SELECT
          eh.source_table,
          eh.embedding_model,
          SUM(eh.records_processed) as total_records,
          SUM(eh.records_success) as total_success,
          SUM(eh.records_failed) as total_failed,
          COUNT(*) as operation_count,
          AVG(eh.records_processed) as avg_records_per_operation,
          MIN(eh.started_at) as first_operation,
          MAX(eh.completed_at) as last_operation
      FROM embedding_history eh
      WHERE eh.status = 'completed'
      GROUP BY eh.source_table, eh.embedding_model
      ORDER BY total_records DESC
    `);

    await client.query(`
      CREATE OR REPLACE VIEW daily_embedding_stats AS
      SELECT
          DATE(created_at) as date,
          source_table,
          embedding_model,
          SUM(records_processed) as records_processed,
          SUM(records_success) as records_success,
          SUM(records_failed) as records_failed,
          COUNT(*) as operation_count
      FROM embedding_history
      WHERE status = 'completed'
      GROUP BY DATE(created_at), source_table, embedding_model
      ORDER BY date DESC, source_table, embedding_model
    `);

    console.log('✅ embedding_history table created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    client.release();
    await asembPool.end();
  }
}

createEmbeddingHistoryTable();