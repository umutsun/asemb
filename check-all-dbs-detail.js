const { Pool } = require('pg');

// Tüm veritabanlarını kontrol et
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
      // unified_embeddings var mı?
      const tableCheck = await pool.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_name = 'unified_embeddings'
      `);

      if (tableCheck.rows.length > 0) {
        console.log(`✅ unified_embeddings found in schema: ${tableCheck.rows[0].table_schema}`);

        // Kayıt sayısı
        const count = await pool.query('SELECT COUNT(*) as count FROM unified_embeddings');
        console.log(`📊 Total records: ${count.rows[0].count}`);

        if (count.rows[0].count > 0) {
          // Son kayıt
          const latest = await pool.query(`
            SELECT id, source_table, model_used, created_at
            FROM unified_embeddings
            ORDER BY created_at DESC
            LIMIT 1
          `);
          console.log(`📝 Latest record: ID ${latest.rows[0].id}, Model: ${latest.rows[0].model_used}`);
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