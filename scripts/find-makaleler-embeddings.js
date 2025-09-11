const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const ragPool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

const asembPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function findMakalelerEmbeddings() {
  try {
    console.log('Searching for makaleler embeddings...\n');
    
    // Check rag_chatbot database
    console.log('=== RAG_CHATBOT DATABASE ===');
    const ragCount = await ragPool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as without_embedding
      FROM makaleler
    `);
    console.log('Makaleler table:');
    console.log(`  Total: ${ragCount.rows[0].total}`);
    console.log(`  With embeddings: ${ragCount.rows[0].with_embedding}`);
    console.log(`  Without embeddings: ${ragCount.rows[0].without_embedding}`);
    
    // Check a few specific records
    const ragSamples = await ragPool.query(`
      SELECT id, 
             CASE WHEN embedding IS NULL THEN 'NULL' ELSE 'EXISTS' END as embedding_status,
             CASE WHEN embedding IS NOT NULL THEN LENGTH(embedding::text) ELSE 0 END as embedding_length
      FROM makaleler
      ORDER BY id
      LIMIT 10
    `);
    console.log('\n  First 10 records:');
    ragSamples.rows.forEach(row => {
      console.log(`    ID ${row.id}: ${row.embedding_status} (length: ${row.embedding_length})`);
    });
    
    // Check asemb database - all possible tables
    console.log('\n=== ASEMB DATABASE ===');
    
    // Check if makaleler_embeddings table exists
    const tableCheck = await asembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'makaleler_embeddings'
      )
    `);
    
    if (tableCheck.rows[0].exists) {
      const asembCount = await asembPool.query(`
        SELECT COUNT(*) as count FROM makaleler_embeddings
      `);
      console.log(`makaleler_embeddings table: ${asembCount.rows[0].count} records`);
      
      // Sample records
      const asembSamples = await asembPool.query(`
        SELECT id, source_id, 
               CASE WHEN embedding IS NULL THEN 'NULL' ELSE 'EXISTS' END as embedding_status,
               created_at
        FROM makaleler_embeddings
        LIMIT 5
      `);
      if (asembSamples.rows.length > 0) {
        console.log('  Sample records:');
        asembSamples.rows.forEach(row => {
          console.log(`    ID ${row.id}: ${row.embedding_status} (created: ${row.created_at})`);
        });
      }
    } else {
      console.log('makaleler_embeddings table does not exist');
    }
    
    // Check unified_embeddings table
    const unifiedCheck = await asembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'unified_embeddings'
      )
    `);
    
    if (unifiedCheck.rows[0].exists) {
      const unifiedCount = await asembPool.query(`
        SELECT 
          source_type,
          source_name,
          source_table,
          COUNT(*) as count
        FROM unified_embeddings
        WHERE source_table = 'makaleler' OR source_name LIKE '%makaleler%'
        GROUP BY source_type, source_name, source_table
      `);
      
      if (unifiedCount.rows.length > 0) {
        console.log('\nunified_embeddings table (makaleler data):');
        unifiedCount.rows.forEach(row => {
          console.log(`  ${row.source_type}/${row.source_name}/${row.source_table}: ${row.count} records`);
        });
      } else {
        console.log('\nunified_embeddings table: No makaleler data found');
      }
    } else {
      console.log('unified_embeddings table does not exist');
    }
    
    // Check MAKALELER table (uppercase)
    const uppercaseCheck = await asembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'MAKALELER'
      )
    `);
    
    if (uppercaseCheck.rows[0].exists) {
      const uppercaseCount = await asembPool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
        FROM "MAKALELER"
      `);
      console.log(`\nMAKALELER table (uppercase): ${uppercaseCount.rows[0].with_embedding}/${uppercaseCount.rows[0].total} with embeddings`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findMakalelerEmbeddings();