const { Pool } = require('pg');
require('dotenv').config();

// Source database (rag_chatbot)
const sourcePool = new Pool({
  host: process.env.CUSTOMER_DB_HOST,
  port: process.env.CUSTOMER_DB_PORT,
  database: 'rag_chatbot',
  user: process.env.CUSTOMER_DB_USER,
  password: process.env.CUSTOMER_DB_PASSWORD,
  ssl: process.env.CUSTOMER_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function checkSourceDatabase() {
  const client = await sourcePool.connect();
  
  try {
    console.log('🔌 Connected to source database: rag_chatbot');
    
    // Check if source tables exist
    const tablesQuery = `
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `;
    
    const tables = await client.query(tablesQuery);
    console.log('\n📋 Available tables:');
    tables.rows.forEach(t => {
      console.log(`   - ${t.table_schema}.${t.table_name}`);
    });
    
    // Check documents in rag_data schema
    try {
      const docCount = await client.query('SELECT COUNT(*) FROM rag_data.documents');
      console.log(`\n📄 Documents in rag_data.documents: ${docCount.rows[0].count}`);
      
      const embeddingCount = await client.query('SELECT COUNT(*) FROM rag_data.documents WHERE embedding IS NOT NULL');
      console.log(`📍 Documents with embeddings: ${embeddingCount.rows[0].count}`);
      
      // Get sample documents
      const sampleDocs = await client.query(`
        SELECT id, title, source, 
               CASE WHEN embedding IS NOT NULL THEN 'Yes' ELSE 'No' END as has_embedding,
               created_at
        FROM rag_data.documents 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      if (sampleDocs.rows.length > 0) {
        console.log('\n📑 Latest documents:');
        sampleDocs.rows.forEach(doc => {
          console.log(`   ID: ${doc.id} | Title: ${doc.title || 'N/A'} | Source: ${doc.source || 'N/A'} | Embedding: ${doc.has_embedding}`);
        });
      }
    } catch (err) {
      console.log('\n⚠️ rag_data.documents table not found or error:', err.message);
    }
    
    // Check other potential tables
    const checkTables = [
      'public.documents',
      'public.embeddings',
      'public.migrations',
      'public.scraped_data'
    ];
    
    for (const tableName of checkTables) {
      try {
        const [schema, table] = tableName.split('.');
        const count = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
        console.log(`\n📊 ${tableName}: ${count.rows[0].count} records`);
      } catch (err) {
        // Table doesn't exist, skip
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking source database:', error.message);
    throw error;
  } finally {
    client.release();
    await sourcePool.end();
  }
}

// Run if called directly
if (require.main === module) {
  checkSourceDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { checkSourceDatabase };