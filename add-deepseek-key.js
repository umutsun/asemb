const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function addDeepSeekKey() {
  const client = await pool.connect();

  try {
    // First, check if ai_settings exists
    const checkResult = await client.query(`
      SELECT value FROM settings WHERE key = 'ai_settings'
    `);

    let aiSettings;
    if (checkResult.rows.length > 0) {
      aiSettings = checkResult.rows[0].value;
      console.log('Current AI settings:', JSON.stringify(aiSettings, null, 2));
    } else {
      aiSettings = {};
    }

    // Add or update DeepSeek API key
    aiSettings.deepseekApiKey = process.env.DEEPSEEK_API_KEY || 'your-deepseek-api-key-here';

    // Save back to database
    await client.query(`
      INSERT INTO settings (key, value, category, description)
      VALUES ('ai_settings', $1, 'ai', 'AI service settings')
      ON CONFLICT (key)
      DO UPDATE SET
        value = $1,
        updated_at = CURRENT_TIMESTAMP
    `, [aiSettings]);

    console.log('✅ DeepSeek API key added/updated successfully');
    console.log('Updated AI settings:', JSON.stringify(aiSettings, null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ask for DeepSeek API key
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('Enter your DeepSeek API key: ', (apiKey) => {
  if (apiKey) {
    process.env.DEEPSEEK_API_KEY = apiKey;
    addDeepSeekKey();
  } else {
    console.log('No API key provided');
  }
  readline.close();
});