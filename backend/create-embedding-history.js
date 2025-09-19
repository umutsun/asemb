const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function createEmbeddingHistoryTable() {
  try {
    console.log('Creating embedding_history table...');

    // Read the SQL script
    const sqlPath = path.join(__dirname, '..', 'scripts', 'create-embedding-history-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    await pool.query(sql);

    console.log('✅ embedding_history table created successfully');

    // Verify the table was created
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'embedding_history'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Table verification successful');
    } else {
      console.log('❌ Table verification failed');
    }

  } catch (error) {
    console.error('Error creating embedding_history table:', error);
  } finally {
    await pool.end();
  }
}

// Run the function
createEmbeddingHistoryTable();