# ASB Dinamik Scraper - Özellik Özeti

## 🚀 Yeni Özellikler

### 1. **Playwright Entegrasyonu**
- ✅ JavaScript render desteği
- ✅ Dinamik içerik yükleme bekleme
- ✅ Chromium tarayıcı kullanımı
- ✅ Auto-detect modu (gib.gov.tr gibi siteler için)

### 2. **Akıllı Chunking & Embedding**
```javascript
// Örnek kullanım
asb webscrape https://www.gib.gov.tr --store-embeddings --chunk-size 1000

// Sonuç
{
  content_chunks: ["chunk1...", "chunk2...", ...],
  embeddings: [[0.123, -0.456, ...], [...], ...],
  chunk_count: 15,
  scraping_mode: "dynamic"
}
```

### 3. **Veritabanı Yapısı**
```sql
scraped_data (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  content_chunks TEXT[],              -- Chunked içerik
  embeddings vector(1536)[],          -- Her chunk için embedding
  chunk_count INTEGER,                -- Toplam chunk sayısı
  scraping_mode VARCHAR(20),          -- static/dynamic
  metadata JSONB,                     -- Ek bilgiler
  scraped_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### 4. **Scraping Modları**

#### Static Mode (Varsayılan)
- Axios ile hızlı HTML çekme
- JavaScript gerektirmeyen siteler için
- Düşük kaynak kullanımı

#### Dynamic Mode
- Playwright ile tam render
- JavaScript ağırlıklı siteler için
- Sayfa yükleme bekleme desteği

#### Auto Mode
- Site tipine göre otomatik seçim
- Bilinen dinamik siteler listesi
- Performans optimizasyonu

### 5. **Embedding Pipeline**
```
URL → Scrape → Clean → Chunk → Embed → Store
     ↓         ↓        ↓       ↓       ↓
  Playwright  HTML   1000char OpenAI  pgvector
```

## 📊 Kullanım Örnekleri

### Basit Scraping
```bash
asb webscrape https://example.com
```

### Embedding ile Scraping
```bash
asb webscrape https://example.com --store-embeddings
```

### Dinamik Site Scraping
```bash
asb webscrape https://gib.gov.tr --mode dynamic --store-embeddings
```

### Chunk Boyutu Özelleştirme
```bash
asb webscrape https://example.com --chunk-size 2000 --store-embeddings
```

## 🔧 Teknik Detaylar

### Playwright Konfigürasyonu
- Headless Chromium
- 30 saniye timeout
- Viewport: 1920x1080
- User-Agent: Modern Chrome

### Embedding Detayları
- Model: text-embedding-ada-002
- Boyut: 1536 dimension
- Batch processing desteği
- Rate limiting koruması

### Performans
- Static mode: ~1-2 saniye/sayfa
- Dynamic mode: ~5-10 saniye/sayfa
- Embedding: ~0.5 saniye/chunk
- Paralel chunk processing

## 🎯 Gelecek İyileştirmeler

1. **Proxy Desteği**
   - Rotating proxy
   - Rate limit bypass

2. **İleri Seviye Scraping**
   - Form doldurma
   - Login desteği
   - Cookie yönetimi

3. **Veri İşleme**
   - Tablo çıkarma
   - PDF parsing
   - Image OCR

4. **Monitoring**
   - Scraping istatistikleri
   - Hata takibi
   - Performance metrics

## 💡 Kullanım İpuçları

1. **Dinamik Siteler İçin**
   - `--mode dynamic` kullanın
   - Bekleme süresini artırın
   - JavaScript konsol loglarını kontrol edin

2. **Büyük Siteler İçin**
   - Chunk size'ı artırın (2000-3000)
   - Rate limiting dikkat edin
   - Batch halinde işleyin

3. **Embedding Optimizasyonu**
   - Gereksiz içerikleri temizleyin
   - Anlamlı chunk'lar oluşturun
   - Metadata'yı zenginleştirin

## 🐛 Bilinen Sorunlar ve Çözümler

1. **Playwright İndirme**
   - İlk kullanımda Chromium indirilir
   - ~150MB indirme gerekir
   - Bir kere indirilir

2. **Rate Limiting**
   - OpenAI API limitleri
   - Retry mekanizması aktif
   - Batch processing önerilir

3. **Memory Kullanımı**
   - Büyük siteler için yüksek RAM
   - Chunk processing ile optimize
   - Stream processing planlanıyor
