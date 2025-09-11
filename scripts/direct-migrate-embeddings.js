const { Pool } = require('pg');

const sourcePool = new Pool({ 
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot' 
});

const targetPool = new Pool({ 
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb' 
});

async function migrate() {
  try {
    console.log('🚀 Starting direct migration...\n');
    
    // Process ozelgeler table
    console.log('Processing: ozelgeler');
    const ozelgelerResult = await sourcePool.query(`
      SELECT 
        id::text as source_id,
        "Icerik" as content,
        embedding
      FROM "ozelgeler" 
      WHERE embedding IS NOT NULL
    `);
    
    console.log(`  Found ${ozelgelerResult.rows.length} embeddings`);
    
    for (let i = 0; i < ozelgelerResult.rows.length; i++) {
      const row = ozelgelerResult.rows[i];
      await targetPool.query(`
        INSERT INTO unified_embeddings (
          source_type, source_name, source_table, source_id,
          title, content, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_type, source_name, source_table, source_id) 
        DO NOTHING
      `, [
        'database',
        'rag_chatbot',
        'ozelgeler',
        row.source_id,
        `Özelge #${row.source_id}`,
        row.content ? row.content.substring(0, 5000) : '',
        row.embedding,
        JSON.stringify({ migrated_at: new Date() })
      ]);
      
      if ((i + 1) % 100 === 0) {
        console.log(`  Migrated ${i + 1}/${ozelgelerResult.rows.length}`);
      }
    }
    console.log(`✅ ozelgeler: ${ozelgelerResult.rows.length} migrated\n`);
    
    // Process danistaykararlari table
    console.log('Processing: danistaykararlari');
    const danistayResult = await sourcePool.query(`
      SELECT 
        id::text as source_id,
        "Icerik" as content,
        embedding
      FROM "danistaykararlari" 
      WHERE embedding IS NOT NULL
    `);
    
    console.log(`  Found ${danistayResult.rows.length} embeddings`);
    
    for (let i = 0; i < danistayResult.rows.length; i++) {
      const row = danistayResult.rows[i];
      await targetPool.query(`
        INSERT INTO unified_embeddings (
          source_type, source_name, source_table, source_id,
          title, content, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_type, source_name, source_table, source_id) 
        DO NOTHING
      `, [
        'database',
        'rag_chatbot',
        'danistaykararlari',
        row.source_id,
        `Danıştay Kararı #${row.source_id}`,
        row.content ? row.content.substring(0, 5000) : '',
        row.embedding,
        JSON.stringify({ migrated_at: new Date() })
      ]);
      
      if ((i + 1) % 100 === 0) {
        console.log(`  Migrated ${i + 1}/${danistayResult.rows.length}`);
      }
    }
    console.log(`✅ danistaykararlari: ${danistayResult.rows.length} migrated\n`);
    
    // Process makaleler table (only 1 embedding)
    console.log('Processing: makaleler');
    const makalelerResult = await sourcePool.query(`
      SELECT 
        "SayiSiraNo"::text as source_id,
        "Baslik" as title,
        "Icerik" as content,
        embedding
      FROM "makaleler" 
      WHERE embedding IS NOT NULL
    `);
    
    console.log(`  Found ${makalelerResult.rows.length} embeddings`);
    
    for (const row of makalelerResult.rows) {
      await targetPool.query(`
        INSERT INTO unified_embeddings (
          source_type, source_name, source_table, source_id,
          title, content, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (source_type, source_name, source_table, source_id) 
        DO NOTHING
      `, [
        'database',
        'rag_chatbot',
        'makaleler',
        row.source_id,
        row.title || `Makale #${row.source_id}`,
        row.content ? row.content.substring(0, 5000) : '',
        row.embedding,
        JSON.stringify({ migrated_at: new Date() })
      ]);
    }
    console.log(`✅ makaleler: ${makalelerResult.rows.length} migrated\n`);
    
    // Final stats
    const stats = await targetPool.query(`
      SELECT 
        source_table, 
        COUNT(*) as count 
      FROM unified_embeddings 
      WHERE source_name = 'rag_chatbot'
      GROUP BY source_table
      ORDER BY count DESC
    `);
    
    console.log('=' .repeat(50));
    console.log('📊 MIGRATION COMPLETE:');
    stats.rows.forEach(row => {
      console.log(`   ${row.source_table}: ${row.count} records`);
    });
    console.log('=' .repeat(50));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

migrate();