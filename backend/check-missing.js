const { Pool } = require('pg');

const ragPool = new Pool({ 
  host: '91.99.229.96', 
  port: 5432, 
  database: 'rag_chatbot', 
  user: 'postgres', 
  password: 'Semsiye!22' 
});

const asembPool = new Pool({ 
  host: '91.99.229.96', 
  port: 5432, 
  database: 'asemb', 
  user: 'postgres', 
  password: 'Semsiye!22' 
});

(async () => {
  try {
    // Get all sorucevap IDs
    const ragResult = await ragPool.query('SELECT id FROM sorucevap ORDER BY id');
    
    // Get embedded IDs from unified_embeddings
    const asembResult = await asembPool.query(`
      SELECT DISTINCT(metadata->>'source_id')::int as id 
      FROM unified_embeddings 
      WHERE source_table = 'Soru-Cevap' 
      AND metadata->>'source_id' IS NOT NULL
    `);
    
    const ragIds = new Set(ragResult.rows.map(r => r.id));
    const asembIds = new Set(asembResult.rows.map(r => r.id));
    const missingIds = [...ragIds].filter(id => !asembIds.has(id));
    
    console.log('Total records in sorucevap:', ragIds.size);
    console.log('Embedded records:', asembIds.size);
    console.log('Missing records:', missingIds.length);
    console.log('First 10 missing IDs:', missingIds.slice(0, 10));
    console.log('Last 10 missing IDs:', missingIds.slice(-10));
    
    // Check if missing records have content
    if (missingIds.length > 0) {
      const sampleResult = await ragPool.query(
        'SELECT id, "Soru", "Cevap" FROM sorucevap WHERE id = ANY($1) LIMIT 5',
        [missingIds.slice(0, 5)]
      );
      console.log('\nSample missing records:');
      sampleResult.rows.forEach(row => {
        console.log(`ID ${row.id}: ${row.Soru ? 'Has Soru' : 'No Soru'}, ${row.Cevap ? 'Has Cevap' : 'No Cevap'}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await ragPool.end();
    await asembPool.end();
  }
})();