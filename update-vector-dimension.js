const { Pool } = require('pg');

// Asemb veritabanına bağlan
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function updateVectorDimension() {
  try {
    console.log('🔧 Vector boyutu güncelleniyor...\n');

    // Mevcut embedding kolonunu 768 boyuta çevir
    await pool.query(`
      ALTER TABLE unified_embeddings
      ALTER COLUMN embedding TYPE vector(768)
    `);

    console.log('✅ Vector boyutu 1536 -> 768 güncellendi');

    // Kontrol et
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'unified_embeddings'
      AND column_name = 'embedding'
    `);

    console.log('\n📊 Güncel kolon bilgisi:');
    console.log(result.rows[0]);

  } catch (error) {
    console.error('❌ Hata:', error.message);
  } finally {
    await pool.end();
  }
}

updateVectorDimension();