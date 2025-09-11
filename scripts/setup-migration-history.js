const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Both databases
const databases = [
  {
    name: 'rag_chatbot',
    connection: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot'
  },
  {
    name: 'asemb',
    connection: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
  }
];

async function setupMigrationHistory() {
  for (const db of databases) {
    const pool = new Pool({ connectionString: db.connection });
    
    try {
      console.log(`\n📊 Setting up migration history in ${db.name} database...`);
      
      // Read SQL file
      const sqlPath = path.join(__dirname, 'create-migration-history-table.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      // Execute SQL
      await pool.query(sql);
      
      console.log(`✅ Migration history tables created in ${db.name}`);
      
      // Check existing tables
      const checkQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('migration_history', 'document_processing_history', 'scraper_history_detailed')
      `;
      
      const result = await pool.query(checkQuery);
      console.log(`   Tables created:`, result.rows.map(r => r.table_name).join(', '));
      
    } catch (error) {
      console.error(`❌ Error in ${db.name}:`, error.message);
    } finally {
      await pool.end();
    }
  }
}

setupMigrationHistory();