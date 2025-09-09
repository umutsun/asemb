const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.TARGET_DB
});

async function testExistingEmbeddings() {
  try {
    console.log('🚀 Testing Existing ASEMB Embeddings...\n');
    
    // 1. Veritabanı durumu
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
        COUNT(DISTINCT source_table) as unique_sources,
        pg_size_pretty(pg_total_relation_size('rag_data.documents')) as table_size
      FROM rag_data.documents
    `;
    
    const stats = await pool.query(statsQuery);
    console.log('📊 Database Statistics:');
    console.log(`   Total Records: ${stats.rows[0].total_records}`);
    console.log(`   With Embeddings: ${stats.rows[0].with_embeddings}`);
    console.log(`   Unique Sources: ${stats.rows[0].unique_sources}`);
    console.log(`   Table Size: ${stats.rows[0].table_size}\n`);
    
    // 2. Source table dağılımı
    const sourcesQuery = `
      SELECT 
        source_table,
        COUNT(*) as count
      FROM rag_data.documents
      GROUP BY source_table
      ORDER BY count DESC
    `;
    
    const sources = await pool.query(sourcesQuery);
    console.log('📁 Records by Source:');
    sources.rows.forEach(row => {
      console.log(`   ${row.source_table || 'unknown'}: ${row.count} records`);
    });
    
    // 3. Örnek kayıtlar
    console.log('\n📄 Sample Records:\n');
    const sampleQuery = `
      SELECT 
        id,
        title,
        SUBSTRING(content, 1, 200) as content_preview,
        source_table,
        created_at
      FROM rag_data.documents
      WHERE embedding IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 5
    `;
    
    const samples = await pool.query(sampleQuery);
    samples.rows.forEach((row, i) => {
      console.log(`${i + 1}. ID: ${row.id}`);
      console.log(`   Title: ${row.title || 'No title'}`);
      console.log(`   Content: ${row.content_preview}...`);
      console.log(`   Source: ${row.source_table || 'unknown'}`);
      console.log(`   Created: ${row.created_at}`);
      console.log('');
    });
    
    // 4. İçerik arama testi (text search)
    console.log('🔍 Text Search Test:\n');
    const searchTerms = ['vergi', 'mükellefi', 'KDV', 'beyanname'];
    
    for (const term of searchTerms) {
      const textSearchQuery = `
        SELECT COUNT(*) as count
        FROM rag_data.documents
        WHERE content ILIKE $1
      `;
      
      const result = await pool.query(textSearchQuery, [`%${term}%`]);
      console.log(`   "${term}": ${result.rows[0].count} matches`);
    }
    
    // 5. n8n workflow endpoint'lerini test et
    console.log('\n🔌 Testing API Endpoints:\n');
    
    // Backend API durumu
    try {
      const axios = require('axios');
      const apiResponse = await axios.get('http://localhost:3003/api/health');
      console.log('✅ Backend API is running');
    } catch (e) {
      console.log('❌ Backend API is not responding');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Çalıştır
testExistingEmbeddings();
