const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Get connection from environment
const connectionString = process.env.DATABASE_URL || 
  process.env.ASEMB_DATABASE_URL || 
  'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb';

const pool = new Pool({ connectionString });

async function insertTestData() {
  console.log('📝 Inserting test data into ASEMB tables...');
  
  try {
    // Test data for ozelgeler
    await pool.query(`
      INSERT INTO ozelgeler (belge_no, tarih, konu, ozet, madde_metni, ilgili_kanun) VALUES
      ('2024/001', '2024-01-15', 'KDV İstisnası', 'İhracat işlemlerinde KDV istisnası uygulaması', 'İhracat teslimleri KDV''den istisnadır. Bu istisna, mal ihracatı yanında hizmet ihracatını da kapsar.', '3065 sayılı KDV Kanunu'),
      ('2024/002', '2024-02-01', 'Damga Vergisi', 'Sözleşmelerde damga vergisi uygulaması', 'Ticari sözleşmeler damga vergisine tabidir. Vergi oranı binde 9.48 olarak uygulanır.', '488 sayılı Damga Vergisi Kanunu'),
      ('2024/003', '2024-02-15', 'Kurumlar Vergisi', 'Ar-Ge indirimi uygulaması', 'Ar-Ge faaliyetleri kapsamında yapılan harcamaların %100''ü kurumlar vergisi matrahından indirilebilir.', '5520 sayılı Kurumlar Vergisi Kanunu')
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Inserted test data into ozelgeler');
    
    // Test data for makaleler
    await pool.query(`
      INSERT INTO makaleler (baslik, yazar, yayim_tarihi, dergi, icerik, ozet, anahtar_kelimeler) VALUES
      ('Dijital Ekonomide Vergilendirme', 'Prof. Dr. Ahmet Yılmaz', '2024-01-01', 'Vergi Dünyası', 'Dijital ekonominin gelişmesiyle birlikte vergilendirme sistemleri de değişim göstermektedir. E-ticaret, dijital hizmetler ve kripto varlıklar yeni vergilendirme alanları oluşturmaktadır.', 'Dijital ekonominin vergilendirilmesi üzerine kapsamlı bir analiz', 'dijital ekonomi, e-ticaret, vergilendirme'),
      ('Transfer Fiyatlandırması Yöntemleri', 'Doç. Dr. Ayşe Kaya', '2024-01-15', 'Mali Çözüm', 'Transfer fiyatlandırması, ilişkili kişiler arasındaki işlemlerde emsallere uygunluk ilkesinin uygulanmasını içerir. OECD rehberleri doğrultusunda beş temel yöntem bulunmaktadır.', 'Transfer fiyatlandırması yöntemlerinin karşılaştırmalı analizi', 'transfer fiyatlandırması, OECD, emsallere uygunluk'),
      ('KDV İade Süreçleri', 'Dr. Mehmet Demir', '2024-02-01', 'Yaklaşım', 'KDV iade süreçleri, mükellefler için önemli bir nakit akışı yönetimi unsurudur. İade türleri ve belge düzeni detaylı olarak incelenmiştir.', 'KDV iade süreçlerinin pratik uygulaması', 'KDV, iade, vergi uygulaması')
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Inserted test data into makaleler');
    
    // Test data for sorucevap
    await pool.query(`
      INSERT INTO sorucevap (soru, cevap, kategori, etiketler, goruntuleme_sayisi) VALUES
      ('E-fatura zorunluluğu kimleri kapsar?', 'E-fatura uygulaması, belirlenen ciro hadlerini aşan mükellefler ile kamu kurumları için zorunludur. 2024 yılı için had 3 milyon TL olarak belirlenmiştir.', 'E-Dönüşüm', 'e-fatura, zorunluluk, had', 150),
      ('Geçici vergi dönemleri nelerdir?', 'Geçici vergi, üçer aylık dönemler halinde beyan edilir. Dönemler: Ocak-Mart, Nisan-Haziran, Temmuz-Eylül, Ekim-Aralık şeklindedir.', 'Kurumlar Vergisi', 'geçici vergi, beyan, dönem', 230),
      ('KDV oranları nelerdir?', 'Genel KDV oranı %20''dir. Temel gıda maddeleri %1, gıda ve bazı hizmetler %10 oranında vergilendirilir.', 'KDV', 'kdv oranı, vergi oranları', 450),
      ('Damga vergisi istisnası var mıdır?', 'Evet, belirli işlemler damga vergisinden istisnadır. Örneğin, ihracat işlemleri, diplomatik muafiyetler ve sosyal güvenlik işlemleri.', 'Damga Vergisi', 'istisna, muafiyet', 120)
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Inserted test data into sorucevap');
    
    // Test data for danistay_kararlari
    await pool.query(`
      INSERT INTO danistay_kararlari (esas_no, karar_no, karar_tarihi, daire, karar_ozeti, karar_metni, ilgili_mevzuat) VALUES
      ('2023/1234', '2024/567', '2024-01-20', '4. Daire', 'İhracat istisnasının kapsamı', 'İhracat istisnası, malın yurt dışına fiilen çıkması şartına bağlıdır. Transit ticaret de bu kapsamda değerlendirilir.', 'KDV Kanunu Madde 11'),
      ('2023/2345', '2024/678', '2024-02-10', '3. Daire', 'Transfer fiyatlandırması düzeltmesi', 'İlişkili kişilerle yapılan işlemlerde emsallere uygunluk ilkesine aykırılık tespit edilmesi halinde, vergi matrahı re''sen takdir yoluyla belirlenir.', 'KVK Madde 13'),
      ('2023/3456', '2024/789', '2024-02-25', '7. Daire', 'Gider kabul edilmeyen ödemeler', 'Kanunen kabul edilmeyen giderler, vergi matrahının tespitinde dikkate alınmaz. Bu giderler üzerinden yapılan KDV indirimi de kabul edilmez.', 'GVK Madde 41')
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Inserted test data into danistay_kararlari');
    
    // Check counts
    console.log('\n📊 Final record counts:');
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistay_kararlari'];
    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   ${table}: ${result.rows[0].count} records`);
    }
    
    console.log('\n✅ Test data insertion completed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Go to http://localhost:3000/dashboard/embeddings-manager');
    console.log('   2. Select tables to embed');
    console.log('   3. Click "Start Migration" to generate embeddings');
    
  } catch (error) {
    console.error('❌ Error inserting test data:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
  } finally {
    await pool.end();
  }
}

insertTestData();