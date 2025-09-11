const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Get connection from environment
const connectionString = process.env.ASEMB_DATABASE_URL || 
  process.env.DATABASE_URL || 
  'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb';

const pool = new Pool({ connectionString });

async function updateDocumentsTable() {
  console.log('🔄 Updating documents table for embedding support...');
  
  try {
    // Add missing columns to existing documents table
    const alterQueries = [
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_table VARCHAR(255)`,
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_id VARCHAR(255)`,
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002'`,
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0`
    ];
    
    for (const query of alterQueries) {
      try {
        await pool.query(query);
        console.log(`✅ ${query.split(' ')[5]} column added/verified`);
      } catch (err) {
        if (err.code === '42701') { // Column already exists
          console.log(`✓ Column already exists: ${query.split(' ')[5]}`);
        } else {
          throw err;
        }
      }
    }
    
    // Create vector index if not exists
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_embedding 
        ON documents USING ivfflat (embedding vector_cosine_ops) 
        WITH (lists = 100)
      `);
      console.log('✅ Vector index created/verified');
    } catch (err) {
      console.log('⚠️ Vector index will be created after data insertion');
    }
    
    // Create other indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_table, source_id)');
    console.log('✅ Source index created/verified');
    
    // Check updated structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'documents'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📄 Updated documents table structure:');
    columnsResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n✅ Documents table is ready for embeddings!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

updateDocumentsTable();