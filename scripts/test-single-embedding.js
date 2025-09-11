const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config({ path: '../backend/.env' });

const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testSingleEmbedding() {
  try {
    console.log('Testing single embedding migration...\n');
    
    // Get one record from makaleler
    const record = await sourcePool.query(`
      SELECT id, "Icerik" as content
      FROM makaleler
      WHERE "Icerik" IS NOT NULL
      AND id = 2
      LIMIT 1
    `);
    
    if (record.rows.length === 0) {
      console.log('No record found');
      process.exit(1);
    }
    
    const row = record.rows[0];
    console.log(`Found record ID: ${row.id}`);
    console.log(`Content length: ${row.content.length} chars`);
    
    // Get OpenAI API key from settings
    const settingResult = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'openai_api_key'"
    );
    
    const apiKey = settingResult.rows[0]?.setting_value || process.env.OPENAI_API_KEY;
    console.log(`Using API key: ${apiKey.substring(0, 20)}...`);
    
    // Create embedding
    const openai = new OpenAI({ apiKey });
    console.log('\nGenerating embedding...');
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: row.content.substring(0, 8000)
    });
    
    const embedding = response.data[0].embedding;
    console.log(`Embedding generated! Length: ${embedding.length}`);
    console.log(`Tokens used: ${response.usage?.total_tokens || 'unknown'}`);
    
    // Save to target database (asemb)
    console.log('\nSaving to asemb database...');
    
    // Save to makaleler_embeddings
    await targetPool.query(
      `INSERT INTO makaleler_embeddings (id, source_id, content, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE 
       SET embedding = $4, 
           content = $3,
           updated_at = NOW()`,
      [
        row.id,
        row.id,
        row.content.substring(0, 5000),
        `[${embedding.join(',')}]`,
        JSON.stringify({ 
          table: 'makaleler',
          migrated_at: new Date(),
          tokens_used: response.usage?.total_tokens || 0
        })
      ]
    );
    console.log('✅ Saved to makaleler_embeddings');
    
    // Save to unified_embeddings
    await targetPool.query(
      `INSERT INTO unified_embeddings (
        source_type, source_name, source_table, source_id,
        content, embedding, metadata, tokens_used, model_used
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (source_type, source_name, source_table, source_id) 
      DO UPDATE SET 
        embedding = $6,
        content = $5,
        tokens_used = $8,
        updated_at = NOW()`,
      [
        'database',
        'rag_chatbot',
        'makaleler',
        row.id.toString(),
        row.content.substring(0, 5000),
        `[${embedding.join(',')}]`,
        JSON.stringify({ migrated_at: new Date() }),
        response.usage?.total_tokens || 0,
        'text-embedding-ada-002'
      ]
    );
    console.log('✅ Saved to unified_embeddings');
    
    // Update source database to mark as processed
    await sourcePool.query(
      `UPDATE makaleler SET embedding = $1 WHERE id = $2`,
      [`[${embedding.join(',')}]`, row.id]
    );
    console.log('✅ Updated source database');
    
    // Verify
    const verify = await targetPool.query(
      `SELECT COUNT(*) FROM makaleler_embeddings WHERE id = $1`,
      [row.id]
    );
    console.log(`\nVerification: ${verify.rows[0].count} record in makaleler_embeddings`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testSingleEmbedding();