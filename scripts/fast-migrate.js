const { Pool } = require('pg');

const sourcePool = new Pool({ 
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot' 
});

const targetPool = new Pool({ 
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb' 
});

async function fastMigrate() {
  try {
    console.log('🚀 Fast migration starting...\n');
    
    // Copy ozelgeler embeddings
    console.log('Migrating ozelgeler...');
    await targetPool.query(`
      INSERT INTO unified_embeddings (
        source_type, source_name, source_table, source_id, title, content, embedding, metadata
      )
      SELECT 
        'database',
        'rag_chatbot',
        'ozelgeler',
        id::text,
        'Özelge #' || id,
        SUBSTRING("Icerik", 1, 5000),
        embedding,
        '{"migrated_at": "2025-01-11"}'::jsonb
      FROM dblink('postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot',
                  'SELECT id, "Icerik", embedding FROM ozelgeler WHERE embedding IS NOT NULL')
      AS t(id integer, "Icerik" text, embedding vector(1536))
      ON CONFLICT (source_type, source_name, source_table, source_id) DO NOTHING
    `);
    console.log('✅ ozelgeler migrated');
    
    // Copy danistaykararlari embeddings
    console.log('Migrating danistaykararlari...');
    await targetPool.query(`
      INSERT INTO unified_embeddings (
        source_type, source_name, source_table, source_id, title, content, embedding, metadata
      )
      SELECT 
        'database',
        'rag_chatbot',
        'danistaykararlari',
        id::text,
        'Danıştay Kararı #' || id,
        SUBSTRING("Icerik", 1, 5000),
        embedding,
        '{"migrated_at": "2025-01-11"}'::jsonb
      FROM dblink('postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot',
                  'SELECT id, "Icerik", embedding FROM danistaykararlari WHERE embedding IS NOT NULL')
      AS t(id integer, "Icerik" text, embedding vector(1536))
      ON CONFLICT (source_type, source_name, source_table, source_id) DO NOTHING
    `);
    console.log('✅ danistaykararlari migrated');
    
    // Get stats
    const stats = await targetPool.query(`
      SELECT source_table, COUNT(*) as count 
      FROM unified_embeddings 
      GROUP BY source_table
    `);
    
    console.log('\n📊 Migration complete:');
    stats.rows.forEach(row => {
      console.log(`   ${row.source_table}: ${row.count} records`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Trying direct SQL copy instead...');
    
    // If dblink fails, try simpler approach
    try {
      // First enable dblink if not enabled
      await targetPool.query(`CREATE EXTENSION IF NOT EXISTS dblink`);
      console.log('dblink extension enabled');
    } catch (e) {
      console.log('dblink already exists or cannot be created');
    }
    
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

fastMigrate();