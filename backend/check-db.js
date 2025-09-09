const {Pool} = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function checkDB() {
  try {
    // Check rag_data schema documents
    const docsResult = await pool.query('SELECT COUNT(*) FROM rag_data.documents');
    console.log('Documents in rag_data.documents:', docsResult.rows[0].count);
    
    const sampleDocs = await pool.query('SELECT id, title, source_table FROM rag_data.documents LIMIT 5');
    console.log('\nSample documents:');
    sampleDocs.rows.forEach(doc => {
      console.log(`- [${doc.source_table}] ${doc.title}`);
    });
    
    // Check if conversations table exists
    const convResult = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'conversations'");
    console.log('\nConversations table exists:', convResult.rows[0].count > 0);
    
  } catch (error) {
    console.log('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDB();