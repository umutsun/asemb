const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Get connections from environment
const asembConnection = process.env.ASEMB_DATABASE_URL || 
  process.env.DATABASE_URL || 
  'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb';

const postgresConnection = process.env.POSTGRES_DATABASE_URL || 
  'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres';

const asembPool = new Pool({ connectionString: asembConnection });
const postgresPool = new Pool({ connectionString: postgresConnection });

async function migrateToASEMB() {
  console.log('🚀 Starting migration to ASEMB database...');
  console.log('📍 Source: postgres database');
  console.log('📍 Target: ASEMB database\n');
  
  const migrations = [
    {
      source: 'OZELGELER',
      target: 'ozelgeler',
      mapping: {
        belge_no: 'BELGENO',
        tarih: 'TARIH',
        konu: 'KONU',
        ozet: 'OZET',
        madde_metni: 'MADDEMETNI',
        ilgili_kanun: 'ILGILIKANUN'
      }
    },
    {
      source: 'MAKALELER',
      target: 'makaleler',
      mapping: {
        baslik: 'BASLIK',
        yazar: 'YAZAR',
        yayim_tarihi: 'YAYIMTARIHI',
        dergi: 'DERGI',
        icerik: 'ICERIK',
        ozet: 'OZET',
        anahtar_kelimeler: 'ANAHTARKELIMELER'
      }
    },
    {
      source: 'SORUCEVAP',
      target: 'sorucevap',
      mapping: {
        soru: 'SORU',
        cevap: 'CEVAP',
        kategori: 'KATEGORI',
        etiketler: 'ETIKETLER',
        goruntuleme_sayisi: 'GORUNTULEMESAYISI'
      }
    },
    {
      source: 'DANISTAYKARARLARI',
      target: 'danistay_kararlari',
      mapping: {
        esas_no: 'ESASNO',
        karar_no: 'KARARNO',
        karar_tarihi: 'KARARTARIHI',
        daire: 'DAIRE',
        karar_ozeti: 'KARAROZETI',
        karar_metni: 'KARARMETNI',
        ilgili_mevzuat: 'ILGILIMEVZUAT'
      }
    }
  ];
  
  try {
    for (const migration of migrations) {
      console.log(`\n📋 Migrating ${migration.source} -> ${migration.target}`);
      
      // Count source records
      const countResult = await postgresPool.query(
        `SELECT COUNT(*) as count FROM public."${migration.source}"`
      );
      const totalRecords = parseInt(countResult.rows[0].count);
      console.log(`   Found ${totalRecords} records to migrate`);
      
      if (totalRecords === 0) {
        console.log(`   ⚠️ No records to migrate`);
        continue;
      }
      
      // Clear target table
      await asembPool.query(`TRUNCATE TABLE ${migration.target} RESTART IDENTITY CASCADE`);
      console.log(`   ✓ Cleared target table`);
      
      // Fetch and migrate in batches
      const batchSize = 100;
      let offset = 0;
      let migrated = 0;
      
      while (offset < totalRecords) {
        const sourceData = await postgresPool.query(
          `SELECT * FROM public."${migration.source}" LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );
        
        for (const row of sourceData.rows) {
          const columns = Object.keys(migration.mapping);
          const values = columns.map(col => row[migration.mapping[col]]);
          const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          
          await asembPool.query(
            `INSERT INTO ${migration.target} (${columns.join(', ')}) 
             VALUES (${placeholders})`,
            values
          );
          
          migrated++;
        }
        
        offset += batchSize;
        process.stdout.write(`\r   ✓ Migrated ${migrated}/${totalRecords} records`);
      }
      
      console.log(''); // New line after progress
      
      // Update embedding stats
      await asembPool.query(`
        INSERT INTO embedding_stats (table_name, total_records, embedded_records)
        VALUES ($1, $2, 0)
        ON CONFLICT (table_name) 
        DO UPDATE SET total_records = $2, last_updated = CURRENT_TIMESTAMP
      `, [migration.target, totalRecords]);
      
      console.log(`   ✓ Updated embedding stats`);
    }
    
    // Check final counts
    console.log('\n📊 Migration Summary:');
    for (const migration of migrations) {
      const result = await asembPool.query(
        `SELECT COUNT(*) as count FROM ${migration.target}`
      );
      console.log(`   ${migration.target}: ${result.rows[0].count} records`);
    }
    
    console.log('\n✅ Migration to ASEMB completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: node scripts/generate-asemb-embeddings.js');
    console.log('   2. Update backend to use ASEMB for all operations');
    
  } catch (error) {
    console.error('\n❌ Migration error:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
  } finally {
    await asembPool.end();
    await postgresPool.end();
  }
}

migrateToASEMB();