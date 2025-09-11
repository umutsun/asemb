const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

// Source database (rag_chatbot)
const sourcePool = new Pool({
  host: process.env.CUSTOMER_DB_HOST,
  port: process.env.CUSTOMER_DB_PORT,
  database: 'rag_chatbot',
  user: process.env.CUSTOMER_DB_USER,
  password: process.env.CUSTOMER_DB_PASSWORD,
  ssl: process.env.CUSTOMER_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Target database (asemb)
const targetPool = new Pool({
  host: process.env.ASEMB_DB_HOST,
  port: process.env.ASEMB_DB_PORT,
  database: process.env.ASEMB_DB_NAME,
  user: process.env.ASEMB_DB_USER,
  password: process.env.ASEMB_DB_PASSWORD,
  ssl: process.env.ASEMB_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrateData() {
  const sourceClient = await sourcePool.connect();
  const targetClient = await targetPool.connect();
  
  try {
    console.log('🔄 Starting migration from rag_chatbot to asemb...\n');
    
    // Start transaction
    await targetClient.query('BEGIN');
    
    // 1. Migrate sorucevap table
    console.log('📋 Migrating sorucevap table...');
    const sorucevap = await sourceClient.query(`
      SELECT id, soru, cevap, kaynak, kategori, created_at 
      FROM public.sorucevap
      ORDER BY id
    `);
    
    console.log(`   Found ${sorucevap.rows.length} records in sorucevap`);
    
    let migratedCount = 0;
    for (const row of sorucevap.rows) {
      // Create a combined content field
      const content = `Soru: ${row.soru}\n\nCevap: ${row.cevap}`;
      const title = row.soru ? row.soru.substring(0, 255) : 'Soru-Cevap';
      
      // Check if already exists (by content hash)
      const contentHash = crypto.createHash('md5').update(content).digest('hex');
      const existing = await targetClient.query(
        `SELECT id FROM rag_data.documents WHERE metadata->>'content_hash' = $1`,
        [contentHash]
      );
      
      if (existing.rows.length === 0) {
        await targetClient.query(`
          INSERT INTO rag_data.documents (title, content, source, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          title,
          content,
          row.kaynak || 'sorucevap',
          JSON.stringify({
            original_id: row.id,
            kategori: row.kategori,
            table_source: 'sorucevap',
            content_hash: contentHash
          }),
          row.created_at || new Date()
        ]);
        migratedCount++;
      }
    }
    console.log(`   ✅ Migrated ${migratedCount} new records from sorucevap\n`);
    
    // 2. Migrate makaleler table
    console.log('📋 Migrating makaleler table...');
    const makaleler = await sourceClient.query(`
      SELECT id, baslik, icerik, yazar, kaynak, created_at 
      FROM public.makaleler
      ORDER BY id
    `);
    
    console.log(`   Found ${makaleler.rows.length} records in makaleler`);
    
    let makalelerCount = 0;
    for (const row of makaleler.rows) {
      const content = row.icerik || '';
      const title = row.baslik || 'Makale';
      
      const contentHash = crypto.createHash('md5').update(content).digest('hex');
      const existing = await targetClient.query(
        `SELECT id FROM rag_data.documents WHERE metadata->>'content_hash' = $1`,
        [contentHash]
      );
      
      if (existing.rows.length === 0 && content.length > 0) {
        await targetClient.query(`
          INSERT INTO rag_data.documents (title, content, source, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          title.substring(0, 255),
          content,
          row.kaynak || 'makaleler',
          JSON.stringify({
            original_id: row.id,
            yazar: row.yazar,
            table_source: 'makaleler',
            content_hash: contentHash
          }),
          row.created_at || new Date()
        ]);
        makalelerCount++;
      }
    }
    console.log(`   ✅ Migrated ${makalelerCount} new records from makaleler\n`);
    
    // 3. Migrate ozelgeler table
    console.log('📋 Migrating ozelgeler table...');
    const ozelgeler = await sourceClient.query(`
      SELECT id, baslik, icerik, tarih, sayino, created_at 
      FROM public.ozelgeler
      ORDER BY id
    `);
    
    console.log(`   Found ${ozelgeler.rows.length} records in ozelgeler`);
    
    let ozelgelerCount = 0;
    for (const row of ozelgeler.rows) {
      const content = row.icerik || '';
      const title = row.baslik || `Özelge ${row.sayino || ''}`;
      
      const contentHash = crypto.createHash('md5').update(content).digest('hex');
      const existing = await targetClient.query(
        `SELECT id FROM rag_data.documents WHERE metadata->>'content_hash' = $1`,
        [contentHash]
      );
      
      if (existing.rows.length === 0 && content.length > 0) {
        await targetClient.query(`
          INSERT INTO rag_data.documents (title, content, source, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          title.substring(0, 255),
          content,
          'ozelgeler',
          JSON.stringify({
            original_id: row.id,
            tarih: row.tarih,
            sayino: row.sayino,
            table_source: 'ozelgeler',
            content_hash: contentHash
          }),
          row.created_at || new Date()
        ]);
        ozelgelerCount++;
      }
    }
    console.log(`   ✅ Migrated ${ozelgelerCount} new records from ozelgeler\n`);
    
    // Commit transaction
    await targetClient.query('COMMIT');
    
    // Get final statistics
    const totalDocs = await targetClient.query('SELECT COUNT(*) FROM rag_data.documents');
    const docsWithEmbeddings = await targetClient.query('SELECT COUNT(*) FROM rag_data.documents WHERE embedding IS NOT NULL');
    
    console.log('📊 Migration Complete!');
    console.log(`   Total documents in ASEMB: ${totalDocs.rows[0].count}`);
    console.log(`   Documents with embeddings: ${docsWithEmbeddings.rows[0].count}`);
    console.log(`   Documents needing embeddings: ${totalDocs.rows[0].count - docsWithEmbeddings.rows[0].count}`);
    
  } catch (error) {
    await targetClient.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    sourceClient.release();
    targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

// Run if called directly
if (require.main === module) {
  migrateData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrateData };