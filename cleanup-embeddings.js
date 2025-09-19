const { Pool } = require('pg');

// ASEMB veritabanına bağlan
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function cleanupEmbeddings() {
  try {
    console.log('🧹 Temizlik işlemi başlatılıyor...\n');

    // unified_embeddings tablosunu temizle
    const deleteResult = await pool.query('DELETE FROM unified_embeddings');
    console.log(`✅ ${deleteResult.rowCount} embedding silindi`);

    // Sıfırlama için kontrol
    const countResult = await pool.query('SELECT COUNT(*) as count FROM unified_embeddings');
    console.log(`📊 Kalan kayıt sayısı: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    await pool.end();
  }
}

cleanupEmbeddings();