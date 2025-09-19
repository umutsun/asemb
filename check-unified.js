const { Pool } = require('pg');

// ASEMB veritabanına bağlan
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function checkUnifiedEmbeddings() {
  try {
    console.log('🔍 ASEMB - unified_embeddings Tablosu Kontrolü...\n');

    // Tablo var mı?
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'unified_embeddings'
    `);

    if (tableCheck.rows.length === 0) {
      console.log('❌ unified_embeddings tablosu bulunamadı!');
      return;
    }

    console.log('✅ unified_embeddings tablosu bulundu');

    // Toplam kayıt sayısı
    const countResult = await pool.query('SELECT COUNT(*) as count FROM unified_embeddings');
    const totalCount = countResult.rows[0].count;
    console.log(`\n📊 Toplam embedding sayısı: ${totalCount}`);

    if (totalCount > 0) {
      // Son 5 kayıt
      const latest = await pool.query(`
        SELECT
          source_table,
          source_name,
          source_id,
          created_at,
          model_used,
          tokens_used
        FROM unified_embeddings
        ORDER BY created_at DESC
        LIMIT 5
      `);

      console.log('\n📝 Son 5 embedding:');
      latest.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.source_name} (ID: ${row.source_id})`);
        console.log(`   Model: ${row.model_used} | Tokens: ${row.tokens_used}`);
        console.log(`   Tarih: ${row.created_at}\n`);
      });

      // Tabloya göre dağılım
      const byTable = await pool.query(`
        SELECT
          source_table,
          COUNT(*) as count,
          SUM(tokens_used) as total_tokens
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY count DESC
      `);

      console.log('📈 Tabloya göre dağılım:');
      byTable.rows.forEach(row => {
        console.log(`- ${row.source_table}: ${row.count} kayıt (${row.total_tokens} token)`);
      });
    }

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    await pool.end();
  }
}

checkUnifiedEmbeddings();