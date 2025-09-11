const { Pool } = require('pg');
const OpenAI = require('openai');
require('dotenv').config();

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Database connection - ASEMB'ye bağlan!
const pool = new Pool({
  connectionString: process.env.TARGET_DB // asemb veritabanı
});

async function testSearch(query) {
  try {
    console.log(`\n🔍 Searching for: "${query}"`);
    
    // 1. Query için embedding oluştur
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: query
    });
    
    const queryEmbedding = response.data[0].embedding;
    console.log('✅ Query embedding created');
    
    // 2. Semantic search yap
    const searchQuery = `
      SELECT 
        title,
        content,
        source_table,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM rag_data.documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `;
    
    const result = await pool.query(searchQuery, [`[${queryEmbedding.join(',')}]`]);
    
    console.log(`\n📊 Found ${result.rows.length} results:\n`);
    
    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. [Similarity: ${(row.similarity * 100).toFixed(2)}%]`);
      console.log(`   Title: ${row.title || 'No title'}`);
      console.log(`   Content: ${(row.content || '').substring(0, 200)}...`);
      console.log(`   Source: ${row.source_table || 'Unknown'}`);
      console.log('');
    });
    
    return result.rows;
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === '42P01') {
      console.error('❌ Table does not exist!');
    } else if (error.code === '42883') {
      console.error('❌ pgvector extension not installed or operator not found!');
    }
    throw error;
  }
}

// Test queries
async function runTests() {
  console.log('🚀 Testing ASEMB Embeddings...\n');
  
  try {
    // Önce tablo bilgilerini kontrol et
    const infoQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
      FROM rag_data.documents
    `;
    
    const info = await pool.query(infoQuery);
    console.log(`📊 Database Status:`);
    console.log(`   Total records: ${info.rows[0].total}`);
    console.log(`   With embeddings: ${info.rows[0].with_embeddings}\n`);
    
    // pgvector extension kontrolü
    const extQuery = "SELECT * FROM pg_extension WHERE extname = 'vector'";
    const ext = await pool.query(extQuery);
    if (ext.rows.length === 0) {
      console.error('❌ pgvector extension is not installed!');
      return;
    }
    console.log('✅ pgvector extension is installed\n');
    
    // Test queries
    const queries = [
      'vergi mükellefi kimdir',
      'KDV oranı nedir',
      'gelir vergisi nasıl hesaplanır',
      'vergi beyannamesi ne zaman verilir'
    ];
    
    for (const q of queries) {
      await testSearch(q);
      console.log('-'.repeat(80));
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

runTests();
