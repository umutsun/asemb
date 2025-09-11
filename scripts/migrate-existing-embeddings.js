const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrateExistingEmbeddings() {
  try {
    console.log('Migrating existing embeddings from rag_chatbot to asemb...\n');
    
    const tables = ['ozelgeler', 'danistaykararlari', 'chat_history', 'makaleler', 'sorucevap'];
    let totalMigrated = 0;
    
    for (const table of tables) {
      console.log(`\nProcessing table: ${table}`);
      
      // Count existing embeddings
      const countResult = await sourcePool.query(`
        SELECT COUNT(*) as count 
        FROM ${table} 
        WHERE embedding IS NOT NULL
      `).catch(err => {
        console.log(`  Table ${table} not found or no embedding column`);
        return { rows: [{ count: 0 }] };
      });
      
      const embeddingCount = parseInt(countResult.rows[0].count);
      console.log(`  Found ${embeddingCount} embeddings`);
      
      if (embeddingCount === 0) continue;
      
      // Get content column name based on table
      const contentColumns = {
        'ozelgeler': '"Icerik"',
        'makaleler': '"Icerik"',
        'sorucevap': 'CONCAT("Soru", \' - \', "Cevap")',
        'danistaykararlari': '"Icerik"',
        'chat_history': 'message'
      };
      
      const contentColumn = contentColumns[table] || 'content';
      
      // Fetch embeddings in batches
      const batchSize = 100;
      let offset = 0;
      
      while (offset < embeddingCount) {
        const result = await sourcePool.query(`
          SELECT 
            id,
            ${contentColumn} as content,
            embedding
          FROM ${table}
          WHERE embedding IS NOT NULL
          LIMIT $1 OFFSET $2
        `, [batchSize, offset]);
        
        console.log(`  Processing batch: ${offset + 1} to ${Math.min(offset + batchSize, embeddingCount)}`);
        
        // Insert into unified_embeddings
        for (const row of result.rows) {
          try {
            await targetPool.query(`
              INSERT INTO unified_embeddings (
                source_type, 
                source_name, 
                source_table, 
                source_id,
                title,
                content, 
                embedding,
                metadata,
                model_used,
                created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
              ON CONFLICT (source_type, source_name, source_table, source_id) 
              DO UPDATE SET 
                embedding = EXCLUDED.embedding,
                content = EXCLUDED.content,
                updated_at = NOW()
            `, [
              'database',
              'rag_chatbot',
              table,
              row.id.toString(),
              `${table} - ID: ${row.id}`,
              row.content ? row.content.substring(0, 5000) : '',
              row.embedding,
              JSON.stringify({ 
                migrated_from: 'rag_chatbot',
                original_table: table,
                migration_date: new Date()
              }),
              'text-embedding-ada-002'
            ]);
            
            totalMigrated++;
          } catch (err) {
            console.error(`    Error migrating record ${row.id}:`, err.message);
          }
        }
        
        offset += batchSize;
      }
      
      console.log(`  ✅ Migrated ${embeddingCount} embeddings from ${table}`);
    }
    
    console.log(`\n✅ Migration complete! Total embeddings migrated: ${totalMigrated}`);
    
    // Verify migration
    const verifyResult = await targetPool.query(`
      SELECT 
        source_table,
        COUNT(*) as count
      FROM unified_embeddings
      WHERE source_name = 'rag_chatbot'
      GROUP BY source_table
      ORDER BY source_table
    `);
    
    console.log('\nVerification - Embeddings in unified_embeddings:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.source_table}: ${row.count} records`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

migrateExistingEmbeddings();