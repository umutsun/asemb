const { Pool } = require('pg');

const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'asemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function createTable() {
  try {
    console.log('Creating unified_embeddings table...');

    // Read the SQL file
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, 'scripts', 'create-unified-embeddings-table.sql'), 'utf8');

    // Execute the SQL
    await pool.query(sql);

    console.log('✅ unified_embeddings table created successfully!');

    // Verify the table was created
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'unified_embeddings'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Table verification successful');
    } else {
      console.log('❌ Table verification failed');
    }

  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    await pool.end();
  }
}

createTable();