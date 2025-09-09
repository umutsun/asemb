#!/usr/bin/env node

/**
 * Batch Entity Extraction Script
 * Processes documents and extracts entities for knowledge graph
 */

require('dotenv').config();
const cliProgress = require('cli-progress');

// Mock entity extraction for legal documents
class EntityExtractor {
  constructor() {
    this.entityPatterns = {
      courts: /Danıştay|Yargıtay|Vergi Mahkemesi|İdare Mahkemesi/gi,
      caseNumbers: /\b\d{4}\/\d+\b|\bE\.\s*\d{4}\/\d+\b|\bK\.\s*\d{4}\/\d+\b/g,
      organizations: /Maliye Bakanlığı|Vergi Dairesi|Gümrük Müdürlüğü|Hazine|GİB/gi,
      taxTypes: /KDV|ÖTV|Gelir Vergisi|Kurumlar Vergisi|MTV|Damga Vergisi/gi,
      dates: /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\b|\b\d{4}\b/g,
      lawArticles: /\b\d+\.\s*madde|\bMadde\s+\d+|\bKanun\s+No\s*:\s*\d+/gi,
      amounts: /\b\d+([.,]\d+)*\s*(TL|TRY|Lira|bin|milyon|milyar)\b/gi
    };
    
    this.stats = {
      courts: new Set(),
      caseNumbers: new Set(),
      organizations: new Set(),
      taxTypes: new Set(),
      dates: new Set(),
      lawArticles: new Set(),
      amounts: new Set(),
      totalEntities: 0,
      totalRelationships: 0
    };
    
    this.progressBar = new cliProgress.SingleBar({
      format: '████████████ | {percentage}% | {value}/{total} | ETA: {eta}s',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true
    });
  }

  extractEntities(text, metadata = {}) {
    const entities = [];
    const relationships = [];
    
    // Extract courts
    const courts = text.match(this.entityPatterns.courts) || [];
    courts.forEach(court => {
      this.stats.courts.add(court);
      entities.push({
        name: court,
        type: 'COURT',
        source: metadata.source || 'document'
      });
    });
    
    // Extract case numbers
    const caseNumbers = text.match(this.entityPatterns.caseNumbers) || [];
    caseNumbers.forEach(caseNo => {
      this.stats.caseNumbers.add(caseNo);
      entities.push({
        name: caseNo,
        type: 'CASE_NUMBER',
        source: metadata.source || 'document'
      });
      
      // Create relationship with court if found
      if (courts.length > 0) {
        relationships.push({
          from: courts[0],
          to: caseNo,
          type: 'HAS_CASE'
        });
      }
    });
    
    // Extract organizations
    const orgs = text.match(this.entityPatterns.organizations) || [];
    orgs.forEach(org => {
      this.stats.organizations.add(org);
      entities.push({
        name: org,
        type: 'ORGANIZATION',
        source: metadata.source || 'document'
      });
    });
    
    // Extract tax types
    const taxTypes = text.match(this.entityPatterns.taxTypes) || [];
    taxTypes.forEach(tax => {
      this.stats.taxTypes.add(tax);
      entities.push({
        name: tax,
        type: 'TAX_TYPE',
        source: metadata.source || 'document'
      });
      
      // Create relationships
      orgs.forEach(org => {
        relationships.push({
          from: org,
          to: tax,
          type: 'REGULATES'
        });
      });
    });
    
    // Extract dates
    const dates = text.match(this.entityPatterns.dates) || [];
    dates.forEach(date => {
      this.stats.dates.add(date);
      entities.push({
        name: date,
        type: 'DATE',
        source: metadata.source || 'document'
      });
    });
    
    // Extract law articles
    const articles = text.match(this.entityPatterns.lawArticles) || [];
    articles.forEach(article => {
      this.stats.lawArticles.add(article);
      entities.push({
        name: article,
        type: 'LAW_ARTICLE',
        source: metadata.source || 'document'
      });
    });
    
    // Extract amounts
    const amounts = text.match(this.entityPatterns.amounts) || [];
    amounts.forEach(amount => {
      this.stats.amounts.add(amount);
      entities.push({
        name: amount,
        type: 'AMOUNT',
        source: metadata.source || 'document'
      });
    });
    
    this.stats.totalEntities += entities.length;
    this.stats.totalRelationships += relationships.length;
    
    return { entities, relationships };
  }

  async processDocuments(documents) {
    console.log('📊 Starting Entity Extraction...');
    console.log(`Total documents: ${documents.length}\n`);
    
    this.progressBar.start(documents.length, 0);
    
    const results = [];
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const extracted = this.extractEntities(
        doc.content || doc.text || '', 
        { source: doc.title || doc.id }
      );
      
      results.push({
        documentId: doc.id || i,
        ...extracted
      });
      
      this.progressBar.update(i + 1);
      
      // Simulate processing time
      await this.delay(10);
    }
    
    this.progressBar.stop();
    return results;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printStats() {
    console.log('\n📊 Entity Statistics:');
    console.log(`- Courts: ${this.stats.courts.size} unique`);
    console.log(`- Case Numbers: ${this.stats.caseNumbers.size} unique`);
    console.log(`- Organizations: ${this.stats.organizations.size} unique`);
    console.log(`- Tax Types: ${this.stats.taxTypes.size} unique`);
    console.log(`- Dates: ${this.stats.dates.size} unique`);
    console.log(`- Law Articles: ${this.stats.lawArticles.size} unique`);
    console.log(`- Amounts: ${this.stats.amounts.size} unique`);
    console.log(`\nTotal Entities: ${this.stats.totalEntities}`);
    console.log(`Total Relationships: ${this.stats.totalRelationships}`);
  }
}

// Mock document generator for testing
function generateMockDocuments(count = 220) {
  const documents = [];
  const templates = [
    {
      title: 'Danıştay Kararı',
      content: 'Danıştay 4. Daire E. 2024/1234 sayılı kararında KDV iadesi talebinin Vergi Dairesi tarafından reddedilmesine ilişkin işlemin iptaline karar vermiştir. 500.000 TL tutarındaki KDV iadesi 213 sayılı Vergi Usul Kanunu Madde 120 uyarınca değerlendirilmiştir.'
    },
    {
      title: 'Maliye Bakanlığı Özelgesi',
      content: 'Maliye Bakanlığı 15.03.2024 tarihli özelgesinde ÖTV ve KDV uygulamasına ilişkin açıklamalar yapmıştır. Gümrük Müdürlüğü işlemlerinde Kurumlar Vergisi Kanunu Madde 5 uygulanacaktır. 1.000.000 TL üzerindeki işlemler için özel prosedür geçerlidir.'
    },
    {
      title: 'Vergi Mahkemesi Kararı',
      content: 'İstanbul 3. Vergi Mahkemesi E. 2023/567 K. 2024/123 sayılı kararında Gelir Vergisi kesintisi ve Damga Vergisi uygulamasını değerlendirmiştir. Hazine ve Maliye Bakanlığı görüşü doğrultusunda 750.000 TL ceza iptal edilmiştir.'
    },
    {
      title: 'GİB Duyurusu',
      content: 'Gelir İdaresi Başkanlığı (GİB) 01.01.2024 tarihinden itibaren MTV ödemelerinde yeni düzenleme getirmiştir. Vergi Dairesi başvuruları elektronik ortamda kabul edilecektir. KDV iade talepleri için 30 günlük süre tanınmıştır.'
    }
  ];
  
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    documents.push({
      id: i + 1,
      title: `${template.title} - ${i + 1}`,
      content: template.content,
      metadata: {
        type: template.title.split(' ')[0],
        year: 2020 + (i % 5)
      }
    });
  }
  
  return documents;
}

// Main execution
async function main() {
  console.log('✅ Connected to database (mock mode)\n');
  
  const extractor = new EntityExtractor();
  const documents = generateMockDocuments(220);
  
  try {
    const results = await extractor.processDocuments(documents);
    console.log(`✅ Processed ${results.length} documents`);
    
    extractor.printStats();
    
    // Save results (in production, this would go to database)
    const fs = require('fs');
    fs.writeFileSync(
      'extracted-entities.json',
      JSON.stringify(results, null, 2)
    );
    
    console.log('\n🎉 Knowledge Graph Ready!');
    console.log('📁 Results saved to extracted-entities.json');
    
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}