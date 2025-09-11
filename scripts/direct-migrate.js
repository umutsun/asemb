const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

async function directMigrate() {
  try {
    console.log('Direct migration of embeddings...\n');
    
    // Single connection string for cross-database query
    const db = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    // Enable dblink
    await db.query('CREATE EXTENSION IF NOT EXISTS dblink');
    
    // Build connection string for dblink
    const ragConnStr = `host=91.99.229.96 port=5432 dbname=rag_chatbot user=postgres password=Semsiye!22`;
    
    // Migrate Özelgeler
    console.log('Migrating Özelgeler...');
    const ozelgelerResult = await db.query(`
      INSERT INTO unified_embeddings (
        source_type, source_name, source_table, source_id,
        title, content, embedding, metadata, model_used, tokens_used
      )
      SELECT 
        'database',
        'rag_chatbot',
        'Özelgeler',
        id::text,
        'Özelgeler - ' || COALESCE("Baslik", 'ID: ' || id),
        SUBSTRING("Icerik", 1, 5000),
        embedding,
        jsonb_build_object('original_table', 'ozelgeler'),
        'text-embedding-ada-002',
        3000
      FROM dblink($1,
        'SELECT id, "Baslik", "Icerik", embedding FROM ozelgeler WHERE embedding IS NOT NULL LIMIT 1001'
      ) AS t(id integer, "Baslik" text, "Icerik" text, embedding vector(1536))
      ON CONFLICT (source_type, source_name, source_table, source_id) 
      DO UPDATE SET updated_at = NOW()
      RETURNING id
    `, [ragConnStr]);
    console.log(`  Migrated ${ozelgelerResult.rowCount} records`);
    
    // Migrate Danıştay Kararları
    console.log('Migrating Danıştay Kararları...');
    const danistayResult = await db.query(`
      INSERT INTO unified_embeddings (
        source_type, source_name, source_table, source_id,
        title, content, embedding, metadata, model_used, tokens_used
      )
      SELECT 
        'database',
        'rag_chatbot',
        'Danıştay Kararları',
        id::text,
        'Danıştay - ' || COALESCE("EsasNo", 'ID: ' || id),
        SUBSTRING("Icerik", 1, 5000),
        embedding,
        jsonb_build_object('original_table', 'danistaykararlari'),
        'text-embedding-ada-002',
        2800
      FROM dblink($1,
        'SELECT id, "EsasNo", "Icerik", embedding FROM danistaykararlari WHERE embedding IS NOT NULL LIMIT 1001'
      ) AS t(id integer, "EsasNo" text, "Icerik" text, embedding vector(1536))
      ON CONFLICT (source_type, source_name, source_table, source_id) 
      DO UPDATE SET updated_at = NOW()
      RETURNING id
    `, [ragConnStr]);
    console.log(`  Migrated ${danistayResult.rowCount} records`);
    
    // Migrate Chat History
    console.log('Migrating Chat History...');
    const chatResult = await db.query(`
      INSERT INTO unified_embeddings (
        source_type, source_name, source_table, source_id,
        title, content, embedding, metadata, model_used, tokens_used
      )
      SELECT 
        'database',
        'rag_chatbot',
        'Sohbet Geçmişi',
        id::text,
        'Sohbet - ID: ' || id,
        SUBSTRING(message, 1, 5000),
        embedding,
        jsonb_build_object('original_table', 'chat_history'),
        'text-embedding-ada-002',
        500
      FROM dblink($1,
        'SELECT id, message, embedding FROM chat_history WHERE embedding IS NOT NULL'
      ) AS t(id integer, message text, embedding vector(1536))
      ON CONFLICT (source_type, source_name, source_table, source_id) 
      DO UPDATE SET updated_at = NOW()
      RETURNING id
    `, [ragConnStr]);
    console.log(`  Migrated ${chatResult.rowCount} records`);
    
    // Verify migration
    const totalResult = await db.query(`
      SELECT 
        source_table,
        COUNT(*) as count,
        SUM(tokens_used) as total_tokens,
        ROUND(AVG(tokens_used)) as avg_tokens
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY source_table
    `);
    
    console.log('\n✅ Migration Complete!\n');
    console.log('Summary:');
    let grandTotal = 0;
    totalResult.rows.forEach(row => {
      console.log(`  ${row.source_table}: ${row.count} records (avg ${row.avg_tokens} tokens/record)`);
      grandTotal += parseInt(row.count);
    });
    console.log(`  Total: ${grandTotal} embeddings`);
    
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

directMigrate();