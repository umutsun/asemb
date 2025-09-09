const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

async function createLightRAGTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
  });

  try {
    console.log('Creating LightRAG tables...');
    
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    
    console.log('✅ LightRAG tables created successfully!');
    
    // Check tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'lightrag_%'
    `);
    
    console.log('Created tables:', result.rows.map(r => r.table_name));
  } catch (error) {
    console.error('❌ Failed to create tables:', error);
  } finally {
    await pool.end();
  }
}

createLightRAGTables();