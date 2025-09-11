const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const ragPool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

const asembPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkMigrationHistory() {
  try {
    console.log('Checking migration history in both databases...\n');
    
    // Check rag_chatbot
    console.log('=== RAG_CHATBOT DATABASE ===');
    const ragHistory = await ragPool.query(`
      SELECT 
        migration_id::text as id,
        table_name,
        total_records,
        processed_records,
        successful_records,
        tokens_used,
        estimated_cost,
        status,
        model_used,
        started_at,
        completed_at,
        duration_seconds
      FROM migration_history
      ORDER BY started_at DESC
      LIMIT 5
    `);
    
    if (ragHistory.rows.length > 0) {
      ragHistory.rows.forEach(row => {
        console.log(`\nMigration ID: ${row.id.substring(0, 8)}...`);
        console.log(`  Table: ${row.table_name}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Records: ${row.processed_records}/${row.total_records}`);
        console.log(`  Tokens: ${row.tokens_used || 'N/A'}`);
        console.log(`  Cost: $${row.estimated_cost || 'N/A'}`);
        console.log(`  Duration: ${row.duration_seconds || 'N/A'} seconds`);
        console.log(`  Model: ${row.model_used || 'N/A'}`);
      });
    } else {
      console.log('No migration history found');
    }
    
    // Check asemb
    console.log('\n=== ASEMB DATABASE ===');
    const asembHistory = await asembPool.query(`
      SELECT 
        migration_id::text as id,
        table_name,
        total_records,
        processed_records,
        successful_records,
        tokens_used,
        estimated_cost,
        status,
        model_used,
        started_at,
        completed_at,
        duration_seconds
      FROM migration_history
      ORDER BY started_at DESC
      LIMIT 5
    `);
    
    if (asembHistory.rows.length > 0) {
      asembHistory.rows.forEach(row => {
        console.log(`\nMigration ID: ${row.id.substring(0, 8)}...`);
        console.log(`  Table: ${row.table_name}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Records: ${row.processed_records}/${row.total_records}`);
        console.log(`  Tokens: ${row.tokens_used || 'N/A'}`);
        console.log(`  Cost: $${row.estimated_cost || 'N/A'}`);
        console.log(`  Duration: ${row.duration_seconds || 'N/A'} seconds`);
        console.log(`  Model: ${row.model_used || 'N/A'}`);
      });
    } else {
      console.log('No migration history found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkMigrationHistory();