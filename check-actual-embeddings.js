const { Pool } = require('pg');
require('dotenv').config();

// Database connections
const sourcePool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'
});

const targetPool = new Pool({
  host: process.env.ASEMB_DB_HOST || 'localhost',
  port: parseInt(process.env.ASEMB_DB_PORT || '5432'),
  database: process.env.ASEMB_DB_NAME || 'asemb',
  user: process.env.ASEMB_DB_USER || 'postgres',
  password: process.env.ASEMB_DB_PASSWORD || 'postgres'
});

async function checkActualEmbeddings() {
  try {
    console.log('🔍 Checking actual embedding counts...\n');

    // Tablo bilgileri
    const tables = [
      { name: 'ozelgeler', display: 'Özelgeler', column: '"Icerik"' },
      { name: 'makaleler', display: 'Makaleler', column: '"Icerik"' },
      { name: 'sorucevap', display: 'Soru-Cevap', column: 'CONCAT("Soru", \' \', "Cevap")' },
      { name: 'danistaykararlari', display: 'Danıştay Kararları', column: '"Icerik"' },
      { name: 'chat_history', display: 'Sohbet Geçmişi', column: 'message' }
    ];

    let totalInRagChatbot = 0;
    let totalEmbedded = 0;

    console.log('Tablo bazında detaylı kontrol:');
    console.log('='.repeat(80));

    for (const table of tables) {
      console.log(`\n📋 Tablo: ${table.display}`);
      console.log('-'.repeat(40));

      // 1. rag_chatbot'daki toplam kayıt sayısı
      const sourceQuery = `
        SELECT COUNT(*) as total
        FROM public."${table.name}"
        WHERE ${table.column.includes('CONCAT') ? 'TRUE' : `${table.column} IS NOT NULL`}
      `;
      const sourceResult = await sourcePool.query(sourceQuery);
      const sourceCount = parseInt(sourceResult.rows[0].total);
      totalInRagChatbot += sourceCount;

      // 2. unified_embeddings'teki bu tablodan gelen kayıt sayısı
      const embeddedQuery = `
        SELECT COUNT(*) as embedded
        FROM unified_embeddings
        WHERE source_table = $1 AND source_type = 'database'
      `;
      const embeddedResult = await targetPool.query(embeddedQuery, [table.display]);
      const embeddedCount = parseInt(embeddedResult.rows[0].embedded) || 0;
      totalEmbedded += embeddedCount;

      // 3. Embed edilmemiş kayıt sayısı
      const remaining = sourceCount - embeddedCount;
      const percentage = sourceCount > 0 ? Math.round((embeddedCount / sourceCount) * 100) : 0;

      console.log(`   Toplam kayıt: ${sourceCount.toLocaleString('tr-TR')}`);
      console.log(`   Embed edilmiş: ${embeddedCount.toLocaleString('tr-TR')}`);
      console.log(`   Kalan: ${remaining.toLocaleString('tr-TR')}`);
      console.log(`   Yüzde: ${percentage}%`);

      // 4. En son embed edilen kayıtları göster (son 5)
      if (embeddedCount > 0) {
        const recentQuery = `
          SELECT source_id, created_at
          FROM unified_embeddings
          WHERE source_table = $1 AND source_type = 'database'
          ORDER BY created_at DESC
          LIMIT 5
        `;
        const recentResult = await targetPool.query(recentQuery, [table.display]);
        console.log(`   Son embed edilenler:`);
        recentResult.rows.forEach(row => {
          console.log(`     ID: ${row.source_id}, Tarih: ${row.created_at}`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📊 GENEL DURUM:');
    console.log('-'.repeat(40));
    console.log(`Rag_Chatbot Toplam: ${totalInRagChatbot.toLocaleString('tr-TR')}`);
    console.log(`Toplam Embed: ${totalEmbedded.toLocaleString('tr-TR')}`);
    console.log(`Toplam Kalan: ${(totalInRagChatbot - totalEmbedded).toLocaleString('tr-TR')}`);
    console.log(`Genel Yüzde: ${totalInRagChatbot > 0 ? Math.round((totalEmbedded / totalInRagChatbot) * 100) : 0}%`);

    // 5. unified_embeddings tablosundaki toplam kayıt ve duplicate kontrolü
    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 Unified Embeddings Detay:');
    console.log('-'.repeat(40));

    const totalEmbeddingsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT CONCAT(source_type, '|', source_name, '|', source_table, '|', source_id)) as unique_records,
        COUNT(*) - COUNT(DISTINCT CONCAT(source_type, '|', source_name, '|', source_table, '|', source_id)) as duplicates
      FROM unified_embeddings
      WHERE source_type = 'database'
    `;
    const totalEmbeddingsResult = await targetPool.query(totalEmbeddingsQuery);
    const { total, unique_records, duplicates } = totalEmbeddingsResult.rows[0];

    console.log(`Toplam kayıt: ${parseInt(total).toLocaleString('tr-TR')}`);
    console.log(`Unique kayıt: ${parseInt(unique_records).toLocaleString('tr-TR')}`);
    console.log(`Duplicate: ${parseInt(duplicates).toLocaleString('tr-TR')}`);

    // 6. Model bazında dağılım
    console.log('\n📈 Model Dağılımı:');
    console.log('-'.repeat(40));
    const modelQuery = `
      SELECT model_used, COUNT(*) as count
      FROM unified_embeddings
      WHERE source_type = 'database'
      GROUP BY model_used
      ORDER BY count DESC
    `;
    const modelResult = await targetPool.query(modelQuery);
    modelResult.rows.forEach(row => {
      console.log(`${row.model_used || 'Bilinmeyen'}: ${parseInt(row.count).toLocaleString('tr-TR')}`);
    });

    // Sonuçları JSON olarak da yazdıralım
    const result = {
      timestamp: new Date().toISOString(),
      summary: {
        totalInRagChatbot,
        totalEmbedded,
        totalRemaining: totalInRagChatbot - totalEmbedded,
        overallPercentage: totalInRagChatbot > 0 ? Math.round((totalEmbedded / totalInRagChatbot) * 100) : 0
      },
      tables: tables.map(table => ({
        name: table.name,
        displayName: table.display,
        totalInRagChatbot: 0, // doldurulacak
        embedded: 0, // doldurulacak
        remaining: 0, // doldurulacak
        percentage: 0 // doldurulacak
      })),
      duplicates: {
        total: parseInt(total),
        unique: parseInt(unique_records),
        duplicateCount: parseInt(duplicates)
      }
    };

    // Tablo sonuçlarını doldur
    for (let i = 0; i < result.tables.length; i++) {
      const table = tables[i];
      const sourceResult = await sourcePool.query(sourceQuery.replace('$1', ''), [table.name]);
      const embeddedResult = await targetPool.query(embeddedQuery, [table.display]);

      const sourceCount = parseInt(sourceResult.rows[0].total);
      const embeddedCount = parseInt(embeddedResult.rows[0].embedded) || 0;

      result.tables[i] = {
        name: table.name,
        displayName: table.display,
        totalInRagChatbot: sourceCount,
        embedded: embeddedCount,
        remaining: sourceCount - embeddedCount,
        percentage: sourceCount > 0 ? Math.round((embeddedCount / sourceCount) * 100) : 0
      };
    }

    // Sonuçları dosyaya yaz
    const fs = require('fs');
    fs.writeFileSync('embedding-status.json', JSON.stringify(result, null, 2));
    console.log('\n✅ Detaylı sonuçlar embedding-status.json dosyasına yazıldı.');

    process.exit(0);
  } catch (error) {
    console.error('Hata:', error);
    process.exit(1);
  }
}

checkActualEmbeddings();