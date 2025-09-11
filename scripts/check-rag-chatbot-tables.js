const { Pool } = require('pg');

// rag_chatbot veritabanına bağlan
const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'rag_chatbot',
  user: 'postgres',
  password: 'Semsiye!22'
});

async function checkTables() {
  try {
    // Tüm tabloları getir
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('\n=== RAG_CHATBOT Veritabanı Tabloları ===\n');
    console.log('Toplam tablo sayısı:', tablesResult.rows.length);
    console.log('');
    
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      
      try {
        // Kayıt sayısını al
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM public."${tableName}"`);
        const count = parseInt(countResult.rows[0].count);
        
        // Text kolonları kontrol et
        const columnsResult = await pool.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND table_schema = 'public'
          AND data_type IN ('text', 'character varying', 'varchar')
          LIMIT 5
        `, [tableName]);
        
        // Embedding kolonu kontrolü
        const embeddingCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = $1 
          AND table_schema = 'public'
          AND column_name = 'embedding'
        `, [tableName]);
        
        const hasEmbedding = embeddingCheck.rows.length > 0;
        
        // Eğer kayıt varsa göster
        if (count > 0) {
          console.log(`📊 ${tableName}:`);
          console.log(`   - Kayıt sayısı: ${count}`);
          console.log(`   - Embedding kolonu: ${hasEmbedding ? '✅ VAR' : '❌ YOK'}`);
          
          if (columnsResult.rows.length > 0) {
            console.log(`   - Text kolonları: ${columnsResult.rows.map(c => c.column_name).join(', ')}`);
          }
          
          // Embedded kayıt sayısı
          if (hasEmbedding) {
            const embeddedResult = await pool.query(
              `SELECT COUNT(*) as count FROM public."${tableName}" WHERE embedding IS NOT NULL`
            );
            console.log(`   - Embed edilmiş: ${embeddedResult.rows[0].count} kayıt`);
          }
          
          console.log('');
        }
      } catch (err) {
        console.error(`Hata ${tableName}:`, err.message);
      }
    }
    
  } catch (error) {
    console.error('Bağlantı hatası:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();