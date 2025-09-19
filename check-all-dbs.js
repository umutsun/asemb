const { Pool } = require('pg');

// Check all databases
const databases = [
  { name: 'PostgreSQL (default)', connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres' },
  { name: 'ASEMB', connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb' },
  { name: 'RAG Chatbot', connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot' }
];

async function checkAllDatabases() {
  for (const db of databases) {
    console.log(`\n🔍 Checking ${db.name}...`);

    const pool = new Pool({
      connectionString: db.connectionString
    });

    try {
      // Check if unified_embeddings exists
      const tableCheck = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'unified_embeddings'
      `);

      if (tableCheck.rows.length > 0) {
        const count = await pool.query('SELECT COUNT(*) as count FROM unified_embeddings');
        console.log(`✅ unified_embeddings found with ${count.rows[0].count} records`);

        // Show sample
        const sample = await pool.query(`
          SELECT source_table, source_id, created_at
          FROM unified_embeddings
          ORDER BY created_at DESC
          LIMIT 3
        `);

        if (sample.rows.length > 0) {
          console.log('Latest records:');
          sample.rows.forEach(row => {
            console.log(`  - ${row.source_table} ID ${row.source_id} at ${row.created_at}`);
          });
        }
      } else {
        console.log('❌ unified_embeddings not found');
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    } finally {
      await pool.end();
    }
  }
}

checkAllDatabases();