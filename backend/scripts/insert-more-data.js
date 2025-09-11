const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../..', '.env') });

// Get connection from environment
const connectionString = process.env.DATABASE_URL || 
  process.env.ASEMB_DATABASE_URL || 
  'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb';

const pool = new Pool({ connectionString });

async function insertMoreData() {
  console.log('📝 Inserting more test data into ASEMB tables...');
  
  try {
    // More data for ozelgeler (20+ records)
    const ozelgelerData = [
      ['2024/004', '2024-01-05', 'Stopaj Tevkifatı', 'Ücret ödemelerinde stopaj tevkifatı', 'Ücret ödemelerinde gelir vergisi tevkifatı yapılması zorunludur. Tevkifat oranları gelir vergisi tarifesine göre belirlenir.', '193 sayılı GVK'],
      ['2024/005', '2024-01-08', 'KDV İndirimi', 'İndirim hakkının kullanımı', 'Mükellefler, faaliyetleri ile ilgili olarak satın aldıkları mal ve hizmetlere ait KDV yi indirim konusu yapabilirler.', '3065 sayılı KDV Kanunu'],
      ['2024/006', '2024-01-12', 'Gider Pusulası', 'Gider pusulası düzenleme şartları', 'Vergiden muaf esnaftan yapılan alışlarda gider pusulası düzenlenir. Pusulada alıcı ve satıcı bilgileri yer almalıdır.', '213 sayılı VUK'],
      ['2024/007', '2024-01-18', 'Amortisman', 'Kıst amortisman uygulaması', 'Yıl içinde iktisap edilen sabit kıymetler için kıst amortisman uygulanır. Ay kesirleri tam ay sayılır.', 'VUK Mükerrer Madde 320'],
      ['2024/008', '2024-01-22', 'Reeskont İşlemleri', 'Alacak ve borç reeskontu', 'Bilanço esasına göre defter tutan mükellefler, senede bağlı alacak ve borçlarını reeskonta tabi tutabilirler.', 'VUK Madde 281-285'],
      ['2024/009', '2024-01-25', 'Enflasyon Düzeltmesi', 'Enflasyon düzeltmesi şartları', 'Enflasyon düzeltmesi, belirlenen şartların gerçekleşmesi halinde mali tablolara uygulanır.', 'VUK Mükerrer Madde 298'],
      ['2024/010', '2024-01-28', 'Zarar Mahsubu', 'Geçmiş yıl zararlarının mahsubu', 'Kurumlar vergisi mükelleflerinin geçmiş yıl zararları 5 yıl süreyle mahsup edilebilir.', 'KVK Madde 9'],
      ['2024/011', '2024-02-03', 'İstisna Uygulaması', 'İştirak kazançları istisnası', 'Kurumların iştirak ettikleri kurumlardan elde ettikleri kar payları kurumlar vergisinden istisnadır.', 'KVK Madde 5/1-a'],
      ['2024/012', '2024-02-07', 'Vergi Güvenlik Önlemleri', 'Sahte belge düzenleme', 'Sahte belge düzenleyenler ve kullananlar hakkında özel usulsüzlük cezası uygulanır.', 'VUK Madde 353'],
      ['2024/013', '2024-02-10', 'Örtülü Sermaye', 'Örtülü sermaye uygulaması', 'Ortaklardan alınan borçların öz sermayenin 3 katını aşması durumunda örtülü sermaye söz konusu olur.', 'KVK Madde 12'],
      ['2024/014', '2024-02-14', 'Bağış ve Yardımlar', 'Gider olarak kabul edilen bağışlar', 'Kamu yararına çalışan derneklere yapılan bağışlar beyan edilen gelirin %5 i oranında gider yazılabilir.', 'GVK Madde 89'],
      ['2024/015', '2024-02-18', 'Vergi Cezaları', 'Pişmanlık ve ıslah', 'Pişmanlıkla beyan durumunda vergi ziyaı cezası uygulanmaz, pişmanlık zammı hesaplanır.', 'VUK Madde 371'],
      ['2024/016', '2024-02-22', 'Taksitlendirme', 'Vergi borcu taksitlendirmesi', 'Vergi borçları belirli şartlarda 36 aya kadar taksitlendirilebilir.', '6183 sayılı AATUHK'],
      ['2024/017', '2024-02-26', 'Muhtasar Beyanname', 'Muhtasar beyanname verme zorunluluğu', 'İşverenler ve vergi tevkifatı yapanlar muhtasar beyanname vermek zorundadır.', 'GVK Madde 98'],
      ['2024/018', '2024-03-01', 'Dövizli İşlemler', 'Döviz kuru değerlemesi', 'Dövizli işlemler TCMB döviz alış kuru üzerinden değerlenir.', 'VUK Madde 280'],
      ['2024/019', '2024-03-05', 'Kira Stopajı', 'Gayrimenkul kira ödemelerinde stopaj', 'İşyeri kiralarında %20 stopaj uygulanır. Konut kiralarında stopaj yoktur.', 'GVK Madde 94'],
      ['2024/020', '2024-03-10', 'Değer Artış Kazancı', 'Gayrimenkul satış kazancı', 'Gayrimenkul satışlarında 5 yıl elde tutma süresi sonunda değer artış kazancı vergiden istisnadır.', 'GVK Mükerrer Madde 80']
    ];
    
    for (const data of ozelgelerData) {
      await pool.query(
        `INSERT INTO ozelgeler (belge_no, tarih, konu, ozet, madde_metni, ilgili_kanun) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        data
      );
    }
    console.log(`✅ Added ${ozelgelerData.length} more records to ozelgeler`);
    
    // More data for makaleler (15+ records)
    const makalelerData = [
      ['Blockchain ve Vergi Denetimi', 'Prof. Dr. Fatma Öztürk', '2024-01-05', 'Muhasebe ve Finansman', 'Blockchain teknolojisi vergi denetiminde şeffaflık ve izlenebilirlik sağlar. Dijital defter uygulamaları vergi kaçağını önlemede etkilidir.', 'Blockchain tabanlı vergi denetim sistemleri', 'blockchain, vergi denetimi, dijital defter'],
      ['E-Dönüşüm Süreçleri', 'Dr. Ali Vural', '2024-01-10', 'Vergi Raporu', 'E-fatura, e-arşiv, e-defter uygulamaları kapsamlı şekilde incelenmiştir. Dijitalleşme vergi uyumunu artırmaktadır.', 'E-dönüşüm uygulamalarının analizi', 'e-fatura, e-arşiv, e-defter'],
      ['ÖTV Uygulamaları', 'Doç. Dr. Selim Kara', '2024-01-15', 'Vergi Sorunları', 'Özel tüketim vergisi uygulamaları ve güncel değişiklikler ele alınmıştır. Lüks tüketim mallarında ÖTV oranları analiz edilmiştir.', 'ÖTV sisteminin değerlendirilmesi', 'ÖTV, özel tüketim vergisi, vergi oranları'],
      ['Vergi Planlaması Stratejileri', 'Prof. Dr. Zeynep Ak', '2024-01-20', 'Mali Pusula', 'Yasal vergi planlaması ile vergi yükü optimize edilebilir. Vergi teşvikleri ve istisnalar etkin kullanılmalıdır.', 'Kurumsal vergi planlaması rehberi', 'vergi planlaması, vergi optimizasyonu, teşvikler'],
      ['Uluslararası Vergilendirme', 'Dr. Kemal Yıldırım', '2024-01-25', 'Dünya Gazetesi', 'Çifte vergilendirmeyi önleme anlaşmaları ve BEPS uygulamaları incelenmiştir. Global minimum vergi oranı tartışılmıştır.', 'Uluslararası vergi düzenlemeleri', 'BEPS, çifte vergilendirme, global vergi'],
      ['Vergi Uyuşmazlıkları', 'Av. Deniz Çelik', '2024-02-01', 'Hukuk ve Ekonomi', 'Vergi davalarında ispat yükü ve delil değerlendirmesi kritik öneme sahiptir. İdari çözüm yolları etkin kullanılmalıdır.', 'Vergi uyuşmazlıklarının çözümü', 'vergi davası, uzlaşma, ispat'],
      ['Dijital Hizmet Vergisi', 'Prof. Dr. Can Başar', '2024-02-05', 'E-Yaklaşım', 'Dijital hizmet vergisi global teknoloji şirketlerini hedeflemektedir. Türkiye uygulaması AB modeli ile karşılaştırılmıştır.', 'Dijital ekonominin vergilendirilmesi', 'dijital hizmet vergisi, teknoloji şirketleri'],
      ['Vergi İncelemeleri', 'Dr. Seda Koç', '2024-02-10', 'Denetim Dünyası', 'Risk analizi tabanlı vergi incelemeleri yaygınlaşmaktadır. VDK inceleme standartları güncellenmiştir.', 'Modern vergi inceleme teknikleri', 'vergi incelemesi, risk analizi, VDK'],
      ['Yeşil Vergilendirme', 'Doç. Dr. Murat Yeşil', '2024-02-15', 'Çevre ve Ekonomi', 'Karbon vergisi ve çevre vergileri iklim değişikliği ile mücadelede önemlidir. AB yeşil mutabakat vergi boyutu analiz edilmiştir.', 'Çevresel vergilerin ekonomik etkileri', 'karbon vergisi, yeşil mutabakat, çevre vergisi'],
      ['Vergi Afları', 'Prof. Dr. Elif Tan', '2024-02-20', 'Maliye Dergisi', 'Vergi aflarının mali ve ekonomik etkileri araştırılmıştır. Af beklentisi vergi uyumunu olumsuz etkilemektedir.', 'Vergi aflarının analizi', 'vergi affı, matrah artırımı, varlık barışı'],
      ['Kripto Varlık Vergilendirmesi', 'Dr. Okan Demir', '2024-02-25', 'Fintech Times', 'Kripto varlıkların vergilendirilmesinde global yaklaşımlar incelenmiştir. Türkiye düzenlemesi AB ve ABD ile karşılaştırılmıştır.', 'Kripto varlıklar ve vergi', 'kripto para, bitcoin, dijital varlık vergisi'],
      ['Serbest Bölge Teşvikleri', 'Doç. Dr. Aylin Kaya', '2024-03-01', 'Dış Ticaret', 'Serbest bölgelerde vergi avantajları ihracatı teşvik etmektedir. Yeni teşvik paketi detaylı analiz edilmiştir.', 'Serbest bölge vergi teşvikleri', 'serbest bölge, ihracat teşviki, gümrük'],
      ['Vergi Güvenlik Müesseseleri', 'Prof. Dr. Hakan Ay', '2024-03-05', 'Vergi Dünyası', 'Ba-Bs bildirimleri, e-yoklama gibi müesseseler kayıt dışılığı önlemektedir. Dijital kontrol mekanizmaları güçlendirilmiştir.', 'Vergi güvenlik önlemleri', 'Ba-Bs, e-yoklama, kayıt dışı ekonomi'],
      ['Finansal Raporlama ve Vergi', 'Dr. Burcu Aslan', '2024-03-10', 'Muhasebe Standartları', 'TFRS-BOBİ FRS ile vergi mevzuatı arasındaki farklar incelenmiştir. Ertelenmiş vergi hesaplamaları örneklendirilmiştir.', 'Muhasebe standartları ve vergi uyumu', 'TFRS, BOBİ FRS, ertelenmiş vergi'],
      ['Vergi Harcamaları', 'Prof. Dr. Cenk Özkan', '2024-03-15', 'Bütçe Dünyası', 'Vergi harcamaları bütçe şeffaflığı açısından önemlidir. Teşvik ve istisnalar vergi harcaması olarak raporlanmalıdır.', 'Vergi harcamalarının analizi', 'vergi harcaması, teşvik, istisna']
    ];
    
    for (const data of makalelerData) {
      await pool.query(
        `INSERT INTO makaleler (baslik, yazar, yayim_tarihi, dergi, icerik, ozet, anahtar_kelimeler) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        data
      );
    }
    console.log(`✅ Added ${makalelerData.length} more records to makaleler`);
    
    // More data for sorucevap (20+ records)
    const sorucevapData = [
      ['E-arşiv fatura kimler için zorunlu?', 'E-arşiv fatura, internet üzerinden satış yapan ve belirlenen hadleri aşan mükellefler için zorunludur.', 'E-Dönüşüm', 'e-arşiv, zorunluluk', 180],
      ['KDV beyannamesinin verilme zamanı nedir?', 'KDV beyannamesi, vergilendirme dönemini takip eden ayın 26. günü akşamına kadar verilir.', 'KDV', 'beyanname, süre', 220],
      ['Basit usul şartları nelerdir?', 'Basit usulde vergilendirme için kazanç ve hasılat hadlerini aşmamak gerekir. 2024 hadleri güncellendi.', 'Gelir Vergisi', 'basit usul, had', 150],
      ['İşyeri kira ödemelerinde stopaj oranı nedir?', 'İşyeri kira ödemelerinde %20 stopaj uygulanır. Stopaj, kirayı ödeyenler tarafından kesilir.', 'Stopaj', 'kira, tevkifat', 300],
      ['Amortisman oranları nasıl belirlenir?', 'Amortisman oranları Maliye Bakanlığı tarafından belirlenir. Binalar %2, taşıtlar %20 oranında amortismana tabidir.', 'Amortisman', 'oran, sabit kıymet', 180],
      ['Defter tasdik süreleri nelerdir?', 'Defterler, kullanılacağı yıldan önce yıl sonuna kadar tasdik ettirilmelidir. Yeni kurulan işletmelerde 1 ay süre vardır.', 'Defter-Beyan', 'tasdik, noter', 250],
      ['Vergi levhası asma zorunluluğu var mı?', 'Evet, işyerlerinde vergi levhası asılması zorunludur. Asmayanlara özel usulsüzlük cezası uygulanır.', 'Mükellef Yükümlülükleri', 'levha, ceza', 140],
      ['Geçici vergi oranı nedir?', 'Geçici vergi oranı %25 dir (2024 için). Kurumlar vergisi mükelleflerinden üçer aylık dönemler halinde alınır.', 'Kurumlar Vergisi', 'geçici vergi, oran', 320],
      ['Zayi belgesi ne zaman düzenlenir?', 'Fatura ve benzeri belgeler kaybolduğunda zayi belgesi düzenlenir. Gazete ilanı ve noter onayı gerekir.', 'Belgeler', 'zayi, kayıp', 110],
      ['ÖTV iadesi kimler alabilir?', 'Engelliler araç alımında ÖTV iadesi alabilir. İhracatçılar akaryakıt ÖTV iadesinden yararlanabilir.', 'ÖTV', 'iade, engelli', 190],
      ['Vergi kimlik numarası nasıl alınır?', 'Vergi kimlik numarası vergi dairesinden alınır. Kurumlar için ayrıca ticaret sicil kaydı gerekir.', 'Mükellefiyet', 'VKN, tesis', 270],
      ['Fatura düzenleme süresi nedir?', 'Malın teslimi veya hizmetin ifası tarihinden itibaren 7 gün içinde fatura düzenlenmelidir.', 'Fatura', 'süre, düzenleme', 380],
      ['Vergi borcu yapılandırması şartları nelerdir?', 'Vergi borçları, yasayla belirlenen dönemlerde yapılandırılabilir. Taksit sayısı ve faiz oranları yasada belirlenir.', 'Tahsilat', 'yapılandırma, taksit', 420],
      ['İndirimli KDV uygulaması nedir?', 'Teşvikli yatırımlarda indirimli KDV uygulanır. Yatırım teşvik belgesi gereklidir.', 'KDV', 'indirimli, teşvik', 160],
      ['Vergi incelemesi ne kadar sürer?', 'Tam inceleme en fazla 1 yıl, sınırlı inceleme 6 ay sürer. Süre uzatımı mümkündür.', 'Denetim', 'inceleme, süre', 200],
      ['Kıdem tazminatı vergisi var mı?', 'Kıdem tazminatının yasal sınırı aşmayan kısmı gelir vergisinden istisnadır.', 'Gelir Vergisi', 'kıdem, istisna', 340],
      ['Bağ-Kur borcu vergi borcuna engel mi?', 'SGK borçları vergi borcu yoktur yazısı alınmasına engel olabilir. İhale ve teşviklerde sorun yaratır.', 'Sosyal Güvenlik', 'SGK, borç', 280],
      ['Yurtdışı hizmet alımında KDV var mı?', 'Yurtdışından alınan hizmetlerde sorumlu sıfatıyla KDV hesaplanır (reverse charge).', 'KDV', 'yurtdışı, sorumlu', 230],
      ['Vergi cezalarında indirim var mı?', 'Vergi cezalarında ihbarnamenin tebliğinden itibaren 30 gün içinde ödeme yapılırsa 1/2 indirim uygulanır.', 'Cezalar', 'indirim, ödeme', 360],
      ['E-defter saklama süresi nedir?', 'E-defterler en az 5 yıl saklanmalıdır. İbraz yükümlülüğü 5 yıl devam eder.', 'E-Dönüşüm', 'e-defter, saklama', 170]
    ];
    
    for (const data of sorucevapData) {
      await pool.query(
        `INSERT INTO sorucevap (soru, cevap, kategori, etiketler, goruntuleme_sayisi) 
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        data
      );
    }
    console.log(`✅ Added ${sorucevapData.length} more records to sorucevap`);
    
    // More data for danistay_kararlari (15+ records)
    const danistayData = [
      ['2023/4567', '2024/890', '2024-01-10', '4. Daire', 'Mücbir sebep halinde süre uzatımı', 'Mücbir sebep hallerinde vergi ödevlerinin yerine getirilme süreleri kendiliğinden uzar. İdare tarafından mücbir sebep ilan edilmesi gerekir.', 'VUK Madde 15'],
      ['2023/5678', '2024/901', '2024-01-15', '7. Daire', 'Örtülü kazanç dağıtımı', 'Transfer fiyatlandırması yoluyla örtülü kazanç dağıtımı yapılması halinde, dağıtılan kazanç kar payı sayılır.', 'KVK Madde 13'],
      ['2023/6789', '2024/012', '2024-01-25', '3. Daire', 'Vergi ziyaı cezası', 'Vergi ziyaına sebebiyet verilmesi halinde, ziyaa uğratılan verginin bir katı tutarında ceza kesilir.', 'VUK Madde 344'],
      ['2023/7890', '2024/123', '2024-02-01', '9. Daire', 'İhtirazi kayıtla beyan', 'İhtirazi kayıtla verilen beyannameler üzerine tahakkuk eden vergiler tahsil edilir, ancak dava açma hakkı saklıdır.', 'VUK Madde 378'],
      ['2023/8901', '2024/234', '2024-02-05', '4. Daire', 'Sahte belge kullanımı', 'Sahte belge kullanımında, belgenin sahteliğini bilmemek mazeret sayılmaz. Makul dikkat ve özen gösterilmelidir.', 'VUK Madde 353'],
      ['2023/9012', '2024/345', '2024-02-12', '7. Daire', 'Finansman gideri kısıtlaması', 'Finansman giderlerinin FAVÖK un %30 unu aşan kısmı gider olarak kabul edilmez.', 'KVK Madde 11/1-i'],
      ['2023/1123', '2024/456', '2024-02-18', '3. Daire', 'Uzlaşma hakkı', 'Uzlaşma talebi, ihbarnamenin tebliğinden itibaren 30 gün içinde yapılmalıdır. Uzlaşılan vergi ve cezalar kesindir.', 'VUK Ek Madde 1'],
      ['2023/2234', '2024/567', '2024-02-22', '9. Daire', 'Tebligat usulü', 'Elektronik tebligat zorunluluğu getirilen mükellefler için fiziki tebligat geçersizdir.', 'VUK Madde 107/A'],
      ['2023/3345', '2024/678', '2024-02-28', '4. Daire', 'Matrah farkı', 'Re sen takdir komisyonunca belirlenen matrah ile beyan edilen matrah arasındaki fark üzerinden vergi tarh edilir.', 'VUK Madde 30'],
      ['2023/4456', '2024/789', '2024-03-03', '7. Daire', 'Gümrük vergisi istisnası', 'Dahilde işleme rejimi kapsamında ithal edilen malların ihracı halinde gümrük vergisi istisnası uygulanır.', 'Gümrük Kanunu'],
      ['2023/5567', '2024/890', '2024-03-08', '3. Daire', 'Vergi alacağının zamanaşımı', 'Vergi alacağı, tahakkukun kesinleştiği yılı takip eden takvim yılından itibaren 5 yıl içinde zamanaşımına uğrar.', 'AATUHK Madde 102'],
      ['2023/6678', '2024/901', '2024-03-12', '9. Daire', 'Dava açma süresi', 'Vergi davası açma süresi, dava konusu işlemin tebliğinden itibaren 30 gündür.', 'İYUK Madde 7'],
      ['2023/7789', '2024/012', '2024-03-15', '4. Daire', 'Haksız iade', 'Haksız alınan KDV iadesi, gecikme faiziyle birlikte geri alınır. Ayrıca vergi ziyaı cezası uygulanır.', 'KDV Kanunu'],
      ['2023/8890', '2024/123', '2024-03-18', '7. Daire', 'Vergi güvenlik önlemi', 'Limited şirket ortaklarının şirketten doğan kamu borçlarından sermaye hisseleri oranında sorumluluğu vardır.', 'AATUHK Mükerrer Madde 35'],
      ['2023/9901', '2024/234', '2024-03-22', '3. Daire', 'İnceleme elemanının yetkisi', 'Vergi inceleme elemanları, görev yazısında belirtilen konularla sınırlı inceleme yapmak zorundadır.', 'VUK Madde 138']
    ];
    
    for (const data of danistayData) {
      await pool.query(
        `INSERT INTO danistay_kararlari (esas_no, karar_no, karar_tarihi, daire, karar_ozeti, karar_metni, ilgili_mevzuat) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        data
      );
    }
    console.log(`✅ Added ${danistayData.length} more records to danistay_kararlari`);
    
    // Final count check
    console.log('\n📊 Updated record counts:');
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistay_kararlari'];
    let totalCount = 0;
    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      const count = parseInt(result.rows[0].count);
      totalCount += count;
      console.log(`   ${table}: ${count} records`);
    }
    console.log(`   TOTAL: ${totalCount} records`);
    
    console.log('\n✅ Data insertion completed!');
    console.log('\n📝 Ready for embedding:');
    console.log('   1. Go to http://localhost:3000/dashboard/embeddings-manager');
    console.log('   2. Tables now have substantial data for testing');
    console.log('   3. Start migration to generate OpenAI embeddings');
    
  } catch (error) {
    console.error('❌ Error inserting data:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
  } finally {
    await pool.end();
  }
}

insertMoreData();