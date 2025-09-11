const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

async function debugMakalelerMigration() {
  try {
    console.log('Debugging makaleler table migration...\n');
    
    // Check primary key
    const pkResult = await sourcePool.query(`
      SELECT 
        kcu.column_name,
        c.data_type
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name 
      JOIN information_schema.columns c
        ON c.column_name = kcu.column_name
        AND c.table_name = kcu.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY' 
        AND tc.table_name = 'makaleler'
    `);
    
    console.log('Primary key info:');
    if (pkResult.rows.length > 0) {
      console.log(`  Column: ${pkResult.rows[0].column_name}`);
      console.log(`  Type: ${pkResult.rows[0].data_type}`);
    } else {
      console.log('  No primary key found!');
    }
    
    // Get sample records
    console.log('\nSample records:');
    const sampleResult = await sourcePool.query(`
      SELECT id, "Baslik", 
             CASE 
               WHEN "Icerik" IS NULL THEN 'NULL'
               WHEN LENGTH("Icerik") = 0 THEN 'EMPTY'
               ELSE SUBSTRING("Icerik", 1, 50) || '...'
             END as content_preview,
             CASE 
               WHEN embedding IS NULL THEN 'NULL'
               ELSE 'EXISTS'
             END as embedding_status
      FROM makaleler
      LIMIT 5
    `);
    
    sampleResult.rows.forEach(row => {
      console.log(`  ID: ${row.id}, Title: ${row.baslik}`);
      console.log(`    Content: ${row.content_preview}`);
      console.log(`    Embedding: ${row.embedding_status}`);
    });
    
    // Count records with/without content
    const contentStats = await sourcePool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN "Icerik" IS NOT NULL AND LENGTH("Icerik") > 0 THEN 1 END) as with_content,
        COUNT(CASE WHEN "Icerik" IS NULL OR LENGTH("Icerik") = 0 THEN 1 END) as without_content,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
      FROM makaleler
    `);
    
    console.log('\nStatistics:');
    const stats = contentStats.rows[0];
    console.log(`  Total records: ${stats.total}`);
    console.log(`  With content: ${stats.with_content}`);
    console.log(`  Without content: ${stats.without_content}`);
    console.log(`  With embeddings: ${stats.with_embedding}`);
    
    // Try to manually update one record to test
    console.log('\nTrying to update one record with test embedding...');
    try {
      const testEmbedding = new Array(1536).fill(0.1);
      await sourcePool.query(`
        UPDATE makaleler 
        SET embedding = $1 
        WHERE id = (SELECT id FROM makaleler WHERE "Icerik" IS NOT NULL LIMIT 1)
      `, [`[${testEmbedding.join(',')}]`]);
      console.log('✅ Test update successful');
      
      // Check if it persisted
      const checkResult = await sourcePool.query(`
        SELECT COUNT(*) as count FROM makaleler WHERE embedding IS NOT NULL
      `);
      console.log(`  Records with embeddings after test: ${checkResult.rows[0].count}`);
    } catch (err) {
      console.log('❌ Test update failed:', err.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugMakalelerMigration();