// Setup ASEMB database and tables
const { Client } = require('pg');

async function setupDatabase() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres'
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create asemb database if not exists
    const dbCheck = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'asemb'"
    );

    if (dbCheck.rows.length === 0) {
      console.log('📦 Creating asemb database...');
      await client.query('CREATE DATABASE asemb');
      console.log('✅ Database created');
    } else {
      console.log('✅ asemb database already exists');
    }

    await client.end();

    // Connect to asemb database
    const asembClient = new Client({
      connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
    });

    await asembClient.connect();
    console.log('✅ Connected to asemb database');

    // Create vector extension
    console.log('📦 Setting up vector extension...');
    await asembClient.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create schema
    console.log('📦 Creating rag_data schema...');
    await asembClient.query('CREATE SCHEMA IF NOT EXISTS rag_data');

    // Create documents table
    console.log('📦 Creating documents table...');
    await asembClient.query(`
      CREATE TABLE IF NOT EXISTS rag_data.documents (
        id SERIAL PRIMARY KEY,
        source_table VARCHAR(50),
        source_id INTEGER,
        title TEXT,
        content TEXT,
        metadata JSONB,
        embedding vector(1536),
        chunk_index INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        indexed_at TIMESTAMP
      )
    `);

    // Create indexes
    console.log('📦 Creating indexes...');
    await asembClient.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_embedding 
      ON rag_data.documents USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100)
    `);

    await asembClient.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_metadata 
      ON rag_data.documents USING gin (metadata)
    `);

    await asembClient.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_source 
      ON rag_data.documents (source_table, source_id)
    `);

    // Check if documents exist
    const docCount = await asembClient.query(
      'SELECT COUNT(*) FROM rag_data.documents'
    );

    console.log(`\n📊 Current status:`);
    console.log(`  Documents in database: ${docCount.rows[0].count}`);

    await asembClient.end();
    console.log('\n✅ Database setup complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

setupDatabase();
