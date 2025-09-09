const { Pool } = require('pg');

// RAG_CHATBOT veritabanına bağlan
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot'
});

async function checkEmbeddings() {
  try {
    console.log('🔍 RAG_CHATBOT Embedding Kontrolü...\n');
    
    // Her tablo için embedding kolonunu kontrol et
    const tables = ['danistaykararlari', 'makaleler', 'ozelgeler', 'sorucevap'];
    
    for (const table of tables) {
      console.log(`\n📊 ${table.toUpperCase()} Tablosu:`);
      
      // Kolon listesi
      const colQuery = `
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = '${table}'
        AND (data_type LIKE '%vector%' OR udt_name = 'vector' OR column_name LIKE '%embed%')
      `;
      
      const cols = await pool.query(colQuery);
      
      if (cols.rows.length > 0) {
        console.log('✅ Vector/Embedding kolonları bulundu:');
        for (const col of cols.rows) {
          console.log(`  - ${col.column_name} (${col.data_type})`);
          
          // Bu kolonda kaç dolu kayıt var?
          const countQuery = `SELECT COUNT(*) as count FROM public.${table} WHERE ${col.column_name} IS NOT NULL`;
          try {
            const result = await pool.query(countQuery);
            console.log(`    └─> ${result.rows[0].count} dolu kayıt`);
          } catch (e) {
            console.log(`    └─> Sayım hatası`);
          }
        }
      } else {
        console.log('❌ Vector/Embedding kolonu bulunamadı');
        
        // Tüm kolonları göster
        const allColsQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' 
          AND table_name = '${table}'
          ORDER BY ordinal_position
        `;
        const allCols = await pool.query(allColsQuery);
        console.log('  Mevcut kolonlar:');
        for (const col of allCols.rows) {
          console.log(`  - ${col.column_name} (${col.data_type})`);
        }
      }
    }
    
    // document_vectors tablosunu da kontrol et
    console.log('\n\n📊 DOCUMENT_VECTORS Tablosu:');
    const docVecQuery = `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'document_vectors'
      ORDER BY ordinal_position
    `;
    const docVecCols = await pool.query(docVecQuery);
    
    if (docVecCols.rows.length > 0) {
      console.log('Kolonlar:');
      for (const col of docVecCols.rows) {
        console.log(`  - ${col.column_name} (${col.data_type})`);
      }
      
      // İçeriği kontrol et
      const sampleQuery = `SELECT * FROM public.document_vectors LIMIT 1`;
      const sample = await pool.query(sampleQuery);
      if (sample.rows.length > 0) {
        console.log('\nÖrnek kayıt:');
        console.log(JSON.stringify(sample.rows[0], null, 2));
      }
    }
    
  } catch (error) {
    console.error('Hata:', error.message);
  } finally {
    await pool.end();
  }
}

checkEmbeddings();
