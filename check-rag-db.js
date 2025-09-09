const { Pool } = require('pg');

// RAG_CHATBOT veritabanına bağlan
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot'
});

async function checkDatabase() {
  try {
    console.log('🔍 RAG_CHATBOT veritabanını kontrol ediyorum...\n');
    
    // 1. Basit tablo listesi
    const tablesQuery = `
      SELECT 
        schemaname,
        tablename
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename
    `;
    
    const tables = await pool.query(tablesQuery);
    console.log('📊 Mevcut Tablolar:');
    for (const row of tables.rows) {
      console.log(`- ${row.schemaname}.${row.tablename}`);
      
      // Her tablo için sayı al
      try {
        const countQuery = `SELECT COUNT(*) as count FROM ${row.schemaname}.${row.tablename}`;
        const countResult = await pool.query(countQuery);
        console.log(`  └─> ${countResult.rows[0].count} kayıt`);
      } catch (e) {
        console.log(`  └─> Sayım hatası: ${e.message}`);
      }
    }
    
    // 2. documents tablosunu özel kontrol
    console.log('\n🔍 Documents tablosunu arıyorum...');
    const docsQuery = `
      SELECT 
        schemaname,
        tablename
      FROM pg_tables
      WHERE tablename LIKE '%document%'
      OR tablename LIKE '%doc%'
      OR tablename LIKE '%embed%'
    `;
    
    const docs = await pool.query(docsQuery);
    console.log('\n📄 Document/Embed içeren tablolar:');
    for (const doc of docs.rows) {
      console.log(`- ${doc.schemaname}.${doc.tablename}`);
    }
    
    // 3. DANISTAYKARARLARI tablosunu kontrol et (26bin kayıt burada olabilir)
    try {
      const dkQuery = 'SELECT COUNT(*) as count FROM public."DANISTAYKARARLARI"';
      const dkResult = await pool.query(dkQuery);
      console.log(`\n⚖️ DANISTAYKARARLARI tablosu: ${dkResult.rows[0].count} kayıt`);
    } catch (e) {
      console.log('\n❌ DANISTAYKARARLARI tablosu okunamadı');
    }
    
  } catch (error) {
    console.error('Hata:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
