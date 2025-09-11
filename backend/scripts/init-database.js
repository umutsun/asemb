const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.ASEMB_DB_HOST,
  port: process.env.ASEMB_DB_PORT,
  database: process.env.ASEMB_DB_NAME,
  user: process.env.ASEMB_DB_USER,
  password: process.env.ASEMB_DB_PASSWORD,
  ssl: process.env.ASEMB_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔌 Connected to database:', process.env.ASEMB_DB_NAME);
    
    // Create pgvector extension
    console.log('📦 Creating pgvector extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Create schema
    console.log('📂 Creating rag_data schema...');
    await client.query('CREATE SCHEMA IF NOT EXISTS rag_data');
    
    // Create documents table with vector support
    console.log('📄 Creating documents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_data.documents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT NOT NULL,
        url VARCHAR(500),
        source VARCHAR(100),
        metadata JSONB DEFAULT '{}',
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index for vector similarity search
    console.log('🔍 Creating vector index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_embedding 
      ON rag_data.documents 
      USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100)
    `);
    
    // Create text search index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_content_gin 
      ON rag_data.documents 
      USING gin(to_tsvector('english', content))
    `);
    
    // Create conversations table
    console.log('💬 Creating conversations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_data.conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100),
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create embeddings cache table
    console.log('💾 Creating embeddings cache table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_data.embeddings_cache (
        id SERIAL PRIMARY KEY,
        text_hash VARCHAR(64) UNIQUE NOT NULL,
        text TEXT NOT NULL,
        embedding vector(1536),
        model VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Get table stats
    const documentCount = await client.query('SELECT COUNT(*) FROM rag_data.documents');
    const embeddedCount = await client.query('SELECT COUNT(*) FROM rag_data.documents WHERE embedding IS NOT NULL');
    
    console.log('\n✅ Database initialized successfully!');
    console.log('📊 Statistics:');
    console.log(`   - Total documents: ${documentCount.rows[0].count}`);
    console.log(`   - Documents with embeddings: ${embeddedCount.rows[0].count}`);
    
    // Check pgvector version
    const vectorVersion = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    if (vectorVersion.rows.length > 0) {
      console.log(`   - pgvector version: ${vectorVersion.rows[0].extversion}`);
    }
    
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initDatabase };