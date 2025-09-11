const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const ragPool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

async function checkMigrationHistory() {
  try {
    // Check if migration_history exists in rag_chatbot
    const tableCheck = await ragPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'migration_history'
      )
    `);
    
    console.log('Migration history table exists in rag_chatbot:', tableCheck.rows[0].exists);
    
    if (tableCheck.rows[0].exists) {
      // Get column info
      const columns = await ragPool.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = 'migration_history'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      console.log('\nColumns:');
      columns.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type} (${col.udt_name})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkMigrationHistory();