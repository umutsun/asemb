# LightRAG Integration Guide for ASB Project

## 🎯 LightRAG Nedir?

LightRAG, metinlerden bilgi çıkarıp Knowledge Graph (Bilgi Grafiği) oluşturan güçlü bir sistemdir. ASB projesi için şu faydaları sağlar:

1. **Entity Extraction**: Metinden varlıkları (kişi, kurum, kavram) çıkarma
2. **Relationship Mapping**: Varlıklar arası ilişkileri tespit etme
3. **Fact Storage**: Yapılandırılmış bilgi saklama
4. **Graph Queries**: Kompleks sorguları graf üzerinden yapma

## 🏗️ ASB'de LightRAG Mimarisi

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Web Scraper    │────▶│    LightRAG     │────▶│    Neo4j DB     │
│  (Playwright)   │     │  (Extraction)   │     │  (Graph Store)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Text Chunks    │     │ Entities & Rels │     │  Query Engine   │
│  + Embeddings   │     │   + Facts       │     │  (Cypher/RAG)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 📦 Kurulum ve Yapılandırma

### 1. Neo4j Kurulumu
```bash
# Docker ile Neo4j kurulumu
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  -v $HOME/neo4j/data:/data \
  neo4j:latest
```

### 2. LightRAG Konfigürasyonu
```javascript
// config/lightrag.config.js
module.exports = {
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password'
  },
  extraction: {
    model: 'gpt-4', // veya 'gpt-3.5-turbo'
    temperature: 0.1,
    maxTokens: 2000
  },
  entityTypes: [
    'PERSON',
    'ORGANIZATION',
    'LOCATION',
    'CONCEPT',
    'LAW',
    'REGULATION',
    'TAX_TYPE',
    'LEGAL_ENTITY'
  ],
  relationshipTypes: [
    'REGULATES',
    'APPLIES_TO',
    'REFERENCES',
    'REQUIRES',
    'EXEMPTS',
    'DEFINES',
    'MANAGES',
    'LOCATED_IN'
  ]
};
```

## 🔧 Kullanım Senaryoları

### 1. Vergi Mevzuatı Analizi
```javascript
// Örnek: GİB sitesinden çekilen içeriği işleme
const content = await scraper.scrape('https://www.gib.gov.tr/kdv-kanunu');
const result = await lightrag.extract(content);

// Sonuç:
{
  entities: [
    { id: 1, name: "KDV", type: "TAX_TYPE" },
    { id: 2, name: "Gelir İdaresi Başkanlığı", type: "ORGANIZATION" },
    { id: 3, name: "Mükellef", type: "LEGAL_ENTITY" }
  ],
  relationships: [
    { source: 2, target: 1, type: "MANAGES" },
    { source: 1, target: 3, type: "APPLIES_TO" }
  ],
  facts: [
    "KDV oranı %18'dir",
    "İndirimli KDV oranı %8 ve %1'dir",
    "KDV beyannamesi ayda bir verilir"
  ]
}
```

### 2. Hybrid Search (Graf + Vektör)
```javascript
// Kullanıcı sorusu
const query = "KDV iadesi için hangi belgeler gerekli?";

// 1. Vektör araması (pgvector)
const semanticResults = await pgvector.search(query);

// 2. Graf araması (Neo4j)
const graphResults = await lightrag.query(`
  MATCH (doc:DOCUMENT)-[:MENTIONS]->(kdv:TAX_TYPE {name: 'KDV'})
  WHERE doc.content CONTAINS 'iade'
  RETURN doc, kdv
`);

// 3. Sonuçları birleştir ve sırala
const combinedResults = mergeResults(semanticResults, graphResults);
```

### 3. Entity Timeline (Zaman Çizelgesi)
```javascript
// Bir kavramın zaman içindeki değişimi
const timeline = await lightrag.getTimeline('KDV oranları');

// Sonuç:
[
  { date: '1985-01-01', fact: 'KDV oranı %10 olarak belirlendi' },
  { date: '2001-05-15', fact: 'KDV oranı %18\'e yükseltildi' },
  { date: '2007-03-01', fact: 'İndirimli oranlar %8 ve %1 eklendi' }
]
```

## 📊 Dashboard Entegrasyonu

### LightRAG Tab Özellikleri:
1. **Entity Explorer**: Varlıkları görselleştirme
2. **Relationship Graph**: İlişki ağını görüntüleme
3. **Fact Search**: Bilgi arama ve filtreleme
4. **Extract Tool**: Metinden bilgi çıkarma aracı

### Kullanım:
```javascript
// Dashboard'da LightRAG sekmesine tıklayın
// Veya programatik olarak:
window.lightRAG = new LightRAGDashboard('lightrag-container');
```

## 🚀 Gelişmiş Özellikler

### 1. Batch Processing
```javascript
// Toplu belge işleme
const documents = await db.query('SELECT * FROM scraped_data WHERE processed = false');

for (const doc of documents) {
  const result = await lightrag.extract(doc.content);
  await lightrag.store(result);
  await db.update('UPDATE scraped_data SET processed = true WHERE id = ?', [doc.id]);
}
```

### 2. Real-time Updates
```javascript
// WebSocket ile canlı güncelleme
io.on('new_document', async (doc) => {
  const extraction = await lightrag.extract(doc.content);
  io.emit('graph_update', extraction);
});
```

### 3. Custom Entity Types
```javascript
// Özel varlık tipleri tanımlama
lightrag.defineEntityType('VERGI_DAIRESI', {
  patterns: ['vergi dairesi', 'VD', 'malmüdürlüğü'],
  properties: ['kod', 'il', 'ilce', 'adres']
});
```

## 🔍 Sorgulama Örnekleri

### Cypher Queries
```cypher
// 1. Bir kurumun düzenlediği tüm kanunlar
MATCH (org:ORGANIZATION {name: 'Maliye Bakanlığı'})-[:REGULATES]->(law:LAW)
RETURN law.name, law.date

// 2. Bir vergi türüyle ilgili tüm belgeler
MATCH (tax:TAX_TYPE {name: 'KDV'})<-[:MENTIONS]-(doc:DOCUMENT)
RETURN doc.title, doc.url

// 3. İlişki zinciri analizi
MATCH path = (start:ENTITY)-[*..3]-(end:ENTITY)
WHERE start.name = 'Mükellef' AND end.name = 'Vergi İadesi'
RETURN path
```

## 📈 Performans İpuçları

1. **Index Kullanımı**:
```cypher
CREATE INDEX ON :ENTITY(name);
CREATE INDEX ON :DOCUMENT(url);
CREATE INDEX ON :FACT(date);
```

2. **Batch Import**:
```javascript
// Neo4j batch import for performance
const batch = neo4j.batch();
entities.forEach(e => batch.create(e));
await batch.commit();
```

3. **Cache Strategy**:
```javascript
// Redis ile graf sorgu cache
const cacheKey = `graph:${query}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await neo4j.query(query);
await redis.setex(cacheKey, 3600, JSON.stringify(result));
```

## 🎯 Kullanım Adımları

1. **Veri Toplama**:
   ```bash
   asb webscrape https://www.gib.gov.tr --store-embeddings
   ```

2. **Entity Extraction**:
   ```bash
   asb lightrag extract --source scraped_data --batch-size 10
   ```

3. **Graf Oluşturma**:
   ```bash
   asb lightrag build-graph --visualize
   ```

4. **Sorgulama**:
   ```bash
   asb lightrag query "KDV iadesi prosedürü"
   ```

## 🔗 Entegrasyon Noktaları

1. **Scraper → LightRAG**: Otomatik entity extraction
2. **LightRAG → pgvector**: Entity embeddings
3. **Dashboard → LightRAG**: Görselleştirme
4. **API → LightRAG**: Query endpoint'leri

## 📝 Örnek Workflow

```javascript
// 1. Web scraping
const content = await asb.webscrape('https://www.gib.gov.tr/ozelgeler');

// 2. Extract entities
const extraction = await lightrag.extract(content);

// 3. Store in Neo4j
await lightrag.store(extraction);

// 4. Generate embeddings for entities
for (const entity of extraction.entities) {
  const embedding = await openai.embed(entity.name + ' ' + entity.context);
  await pgvector.upsert({
    content: entity.name,
    embedding: embedding,
    metadata: { type: 'entity', source: 'lightrag' }
  });
}

// 5. Query hybrid search
const results = await asb.hybridSearch(query, {
  useVector: true,
  useGraph: true,
  limit: 10
});
```

## 🚧 Dikkat Edilmesi Gerekenler

1. **Neo4j Bellek Yönetimi**: Büyük graflar için heap size ayarı
2. **Rate Limiting**: OpenAI API çağrıları için
3. **Duplicate Detection**: Aynı entity'leri tekrar oluşturmama
4. **Relationship Validation**: İlişki tutarlılığı kontrolü

Bu yapıyla LightRAG, ASB projesinde güçlü bir bilgi grafiği katmanı oluşturur ve semantic search yeteneklerini artırır.
