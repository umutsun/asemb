const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

async function checkEmbeddingsCount() {
  try {
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistaykararlari', 'chat_history'];
    
    console.log('Checking embedding counts in rag_chatbot database:\n');
    
    for (const table of tables) {
      try {
        // Total count
        const totalResult = await sourcePool.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        const total = totalResult.rows[0].count;
        
        // Embedded count
        const embeddedResult = await sourcePool.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE embedding IS NOT NULL`
        );
        const embedded = embeddedResult.rows[0].count;
        
        // Not embedded count
        const notEmbeddedResult = await sourcePool.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE embedding IS NULL`
        );
        const notEmbedded = notEmbeddedResult.rows[0].count;
        
        // Check if embedding column is actually populated with data
        const sampleResult = await sourcePool.query(
          `SELECT embedding FROM ${table} WHERE embedding IS NOT NULL LIMIT 1`
        );
        
        let hasValidEmbedding = false;
        if (sampleResult.rows.length > 0) {
          const embedding = sampleResult.rows[0].embedding;
          hasValidEmbedding = embedding && embedding.length > 0;
        }
        
        console.log(`Table: ${table}`);
        console.log(`  Total records: ${total}`);
        console.log(`  With embeddings: ${embedded}`);
        console.log(`  Without embeddings: ${notEmbedded}`);
        console.log(`  Has valid embedding data: ${hasValidEmbedding}`);
        console.log('');
      } catch (err) {
        console.log(`Table: ${table} - Error: ${err.message}\n`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkEmbeddingsCount();