import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function initDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@91.99.229.96:5432/postgres',
  });

  try {
    console.log('🔄 Initializing database tables...');
    
    // Read SQL file
    const sqlFile = path.join(__dirname, 'init-chat-tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute SQL
    await pool.query(sql);
    
    console.log('✅ Database tables created successfully!');
    
    // Check tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('conversations', 'messages')
    `);
    
    console.log('📊 Created tables:', result.rows);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initDatabase();
}

export default initDatabase;