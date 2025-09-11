const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const pool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

async function setupChatbotSettings() {
  try {
    // Create chatbot_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatbot_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created chatbot_settings table');

    // Insert OpenAI API key
    await pool.query(`
      INSERT INTO chatbot_settings (setting_key, setting_value, description)
      VALUES ('openai_api_key', $1, 'OpenAI API key for embeddings generation')
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1
    `, [process.env.OPENAI_API_KEY]);
    console.log('✅ Set OpenAI API key');

    // Create migration_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id SERIAL PRIMARY KEY,
        migration_id VARCHAR(255) UNIQUE NOT NULL,
        source_table VARCHAR(255) NOT NULL,
        target_table VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        records_migrated INTEGER DEFAULT 0,
        total_records INTEGER DEFAULT 0,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created migration_history table');

    console.log('✅ Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setupChatbotSettings();