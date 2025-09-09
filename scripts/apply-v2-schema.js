const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const applySchema = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    console.log('Applying graph schema migration...');
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_create_graph_schema.sql'), 'utf8');
    await client.query(sql);
    console.log('✅ Successfully applied graph schema migration (001_create_graph_schema.sql).');
  } catch (err) {
    console.error('❌ Error applying schema:', err);
  } finally {
    client.release();
    await pool.end();
  }
};

applySchema();
