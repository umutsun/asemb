import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@91.99.229.96:5432/postgres'
});

async function fixTables() {
  try {
    console.log('Fixing database tables...');

    // Fix scraped_data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scraped_data (
        id SERIAL PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        content TEXT,
        description TEXT,
        keywords TEXT,
        metadata JSONB,
        content_chunks TEXT[],
        embeddings vector(1536)[],
        chunk_count INTEGER DEFAULT 0,
        content_length INTEGER DEFAULT 0,
        token_count INTEGER DEFAULT 0,
        scraping_mode TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns if they don't exist
    const addColumnQueries = [
      `ALTER TABLE scraped_data ADD COLUMN IF NOT EXISTS content_length INTEGER DEFAULT 0`,
      `ALTER TABLE scraped_data ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0`,
      `ALTER TABLE scraped_data ADD COLUMN IF NOT EXISTS token_count INTEGER DEFAULT 0`,
      `ALTER TABLE scraped_data ADD COLUMN IF NOT EXISTS scraping_mode TEXT`
    ];

    for (const query of addColumnQueries) {
      try {
        await pool.query(query);
        console.log('Added column:', query.split('EXISTS')[1]?.split(' ')[1]);
      } catch (err) {
        // Column might already exist
      }
    }

    // Create embeddings progress table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS embedding_progress (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        document_type TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scraped_data_url ON scraped_data(url);
      CREATE INDEX IF NOT EXISTS idx_scraped_data_created ON scraped_data(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_embedding_progress_status ON embedding_progress(status);
    `);

    console.log('Database tables fixed successfully!');
  } catch (error) {
    console.error('Error fixing tables:', error);
  } finally {
    await pool.end();
  }
}

fixTables();