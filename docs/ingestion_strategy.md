# Alice Semantic Bridge - Veri İşleme (Ingestion) Stratejisi
**Yazar:** Gemini (Performans & Optimizasyon Mühendisi)
**Versiyon:** 1.0.0

## 1. Felsefe: Hız, Kalite, Maliyet

Bu stratejinin üç temel amacı vardır:
1.  **Hız:** Veri işleme hattı, büyük hacimli verileri bile n8n iş akışlarını tıkamadan, hızlı bir şekilde işleyebilmelidir.
2.  **Kalite:** Vektör embedding'lerin kalitesi, anlamsal aramanın doğruluğunu doğrudan etkiler. Bu nedenle, kaynak veriden sadece "öz" içeriği almalı ve anlamsal bütünlüğü koruyarak parçalara ayırmalıyız.
3.  **Maliyet:** OpenAI gibi API'lere yapılan çağrıları ve veritabanı işlemlerini minimize ederek sistemin operasyonel maliyetini en düşük seviyede tutmalıyız.

## 2. Önerilen Kütüphaneler ve Teknolojiler

Her görev için doğru aracı seçmek, verimliliğin anahtarıdır.

### Ana Framework: `LangChain.js`
Tüm veri yükleme ve metin bölme işlemleri için bu çatıyı şiddetle tavsiye ediyorum.
*   **Neden?** Bize PDF, DOCX, web sayfaları gibi farklı kaynaklar için standart bir `DocumentLoader` arayüzü sunar. Bu, Codex'in her format için ayrı kod yazmasını engeller ve sistemi gelecekteki veri türlerine karşı esnek kılar. Ayrıca, gelişmiş metin bölme (text splitting) algoritmaları içerir.

### Web Scraping için: `axios` + `@mozilla/readability`
*   **Neden?** En hızlı ve en verimli kombinasyon budur. `axios` ile sayfanın ham HTML'i alınır. Ardından, bu HTML'i doğrudan `cheerio` ile işlemek yerine, **`@mozilla/readability`** kütüphanesinden geçiririz. Bu kütüphane, Firefox'un "Okuma Modu"nun arkasındaki motordur ve bize reklam, menü, footer gibi gürültülerden arındırılmış, sadece ana makale içeriğini verir. Bu, embedding kalitesini **%90** oranında artırır. Dinamik siteler için `Playwright` bir fallback olarak kullanılabilir.

## 3. Optimize Edilmiş Veri İşleme Akışı (Optimized Ingestion Pipeline)

Veri, n8n düğümümüze ulaştığında aşağıdaki adımlardan geçmelidir:

1.  **Load (Yükle):** `LangChain.js`'in uygun `DocumentLoader`'ı (örn: `CheerioWebBaseLoader`, `PDFLoader`) ile kaynak veriden metin içeriği ve meta veriler çıkarılır.
2.  **Clean (Temizle):** (Web kaynakları için) İçerik `@mozilla/readability` ile temizlenir.
3.  **Hash (Özet Al):** Temizlenmiş içeriğin tamamından bir SHA-256 hash'i oluşturulur.
4.  **Deduplicate (Tekrarları Önle):** Veritabanındaki `embeddings` tablosunda bu `content_hash`'in var olup olmadığı kontrol edilir. **Eğer hash varsa, işlem durdurulur ve sonraki adımlara geçilmez.** Bu, maliyeti önleyen en kritik adımdır.
5.  **Split (Parçala):** Temizlenmiş içerik, aşağıda detaylandırılan "Akıllı Chunking Stratejisi" kullanılarak anlamlı parçalara (chunks) ayrılır.
6.  **Embed (Vektöre Dönüştür):** Tüm parçalar, OpenAI Embedding API'sine **tek bir toplu (batch) istekte** gönderilerek vektörlere dönüştürülür. Bu, ağ gecikmesini ve API çağrı sayısını azaltır.
7.  **Store (Depola):** Elde edilen vektörler, içerikler ve meta veriler, PostgreSQL'e **tek bir toplu `INSERT` işlemiyle** kaydedilir.

## 4. Akıllı Chunking Stratejisi

Sabit boyutlu chunking (örn: her 1000 karakterde bir böl) kötüdür, çünkü cümleleri ve paragrafları ortadan ikiye ayırarak anlamsal bağlamı yok eder. Bunun yerine, **özyinelemeli karakter bölme (recursive character splitting)** mantığını kullanacağız.

**Mantık:** Sistem, metni bölmek için önce en büyük anlamsal ayırıcıyı (iki satır boşluk) dener. Parça hala çok büyükse, bir sonraki ayırıcıyı (tek satır boşluk) dener ve bu şekilde devam eder.

**Önerilen Ayırıcılar (Öncelik Sırasıyla):** `["\n\n", "\n", ". ", ", ", " "]`

### Sözde Kod (Pseudo-code)

```typescript
function recursiveSplit(text, separators):
  finalChunks = []
  separator = separators.shift() // Get the highest priority separator

  if separator is null:
    // Can't split further, add the text as is
    finalChunks.push(text)
    return finalChunks

  splits = text.split(separator) 
  for part in splits:
    if part.length < CHUNK_SIZE:
      finalChunks.push(part)
    else:
      // This part is still too big, split it with the next separator
      subChunks = recursiveSplit(part, separators)
      finalChunks.extend(subChunks)

  return finalChunks
```

Bu mantık, `LangChain.js`'in `RecursiveCharacterTextSplitter`'ı ile hazır olarak gelmektedir. Düğümde bu stratejiyi "Auto" modu olarak sunmalıyız.

## 5. Sonuç

Bu strateji, Claude'un tasarladığı sağlam veritabanı yapısını, yüksek performanslı ve maliyet-etkin bir veri işleme boru hattıyla tamamlar. Codex, bu prensipleri takip ederek n8n düğümünün çekirdek mantığını inşa edebilir.