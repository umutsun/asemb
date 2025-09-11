const { Pool } = require('pg');

// ASEMB database connection
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function setupTables() {
  console.log('🚀 Setting up ASEMB database tables...');
  
  try {
    // 1. Enable pgvector extension
    console.log('📦 Enabling pgvector extension...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // 2. Create main documents table
    console.log('📋 Creating documents table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.documents (
        id SERIAL PRIMARY KEY,
        source_table VARCHAR(255) NOT NULL,
        source_id VARCHAR(255),
        title TEXT,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
        tokens_used INTEGER DEFAULT 0
      )
    `);
    
    // 3. Create Turkish law tables
    console.log('📚 Creating Turkish law tables...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.ozelgeler (
        id SERIAL PRIMARY KEY,
        belge_no VARCHAR(255),
        tarih DATE,
        konu TEXT,
        ozet TEXT,
        madde_metni TEXT,
        ilgili_kanun VARCHAR(500),
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.makaleler (
        id SERIAL PRIMARY KEY,
        baslik TEXT,
        yazar VARCHAR(500),
        yayim_tarihi DATE,
        dergi VARCHAR(500),
        icerik TEXT,
        ozet TEXT,
        anahtar_kelimeler TEXT,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.sorucevap (
        id SERIAL PRIMARY KEY,
        soru TEXT,
        cevap TEXT,
        kategori VARCHAR(255),
        etiketler TEXT,
        goruntuleme_sayisi INTEGER DEFAULT 0,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.danistay_kararlari (
        id SERIAL PRIMARY KEY,
        esas_no VARCHAR(255),
        karar_no VARCHAR(255),
        karar_tarihi DATE,
        daire VARCHAR(100),
        karar_ozeti TEXT,
        karar_metni TEXT,
        ilgili_mevzuat TEXT,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 4. Create scraped content table
    console.log('🌐 Creating scraped content table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.scraped_content (
        id SERIAL PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        content TEXT,
        html_content TEXT,
        metadata JSONB DEFAULT '{}',
        embedding vector(1536),
        scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 5. Create chat history table
    console.log('💬 Creating chat history table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.chat_history (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255),
        user_message TEXT,
        assistant_message TEXT,
        context_used TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 6. Create embedding queue table
    console.log('📊 Creating embedding queue table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.embedding_queue (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(255) NOT NULL,
        record_id INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        UNIQUE(table_name, record_id)
      )
    `);
    
    // 7. Create embedding stats table
    console.log('📈 Creating embedding stats table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.embedding_stats (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(255) NOT NULL,
        total_records INTEGER DEFAULT 0,
        embedded_records INTEGER DEFAULT 0,
        pending_records INTEGER DEFAULT 0,
        failed_records INTEGER DEFAULT 0,
        total_tokens_used INTEGER DEFAULT 0,
        estimated_cost DECIMAL(10, 6) DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(table_name)
      )
    `);
    
    // 8. Create indexes for better performance
    console.log('🔍 Creating indexes...');
    
    // Document indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_table, source_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)');
    
    // Embedding indexes (using ivfflat)
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_ozelgeler_embedding ON ozelgeler USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_makaleler_embedding ON makaleler USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_sorucevap_embedding ON sorucevap USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_danistay_embedding ON danistay_kararlari USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_scraped_embedding ON scraped_content USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)');
    } catch (err) {
      console.log('⚠️ Vector indexes will be created after data is inserted');
    }
    
    // Other indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_embedding_queue_status ON embedding_queue(status, created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id, created_at DESC)');
    
    // 9. Initialize embedding stats
    console.log('📊 Initializing embedding stats...');
    const tables = ['documents', 'ozelgeler', 'makaleler', 'sorucevap', 'danistay_kararlari', 'scraped_content'];
    
    for (const table of tables) {
      await pool.query(`
        INSERT INTO embedding_stats (table_name, total_records, embedded_records)
        VALUES ($1, 0, 0)
        ON CONFLICT (table_name) DO NOTHING
      `, [table]);
    }
    
    // 10. Check created tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN (
          'documents', 'ozelgeler', 'makaleler', 'sorucevap', 
          'danistay_kararlari', 'scraped_content', 'chat_history',
          'embedding_queue', 'embedding_stats'
        )
      ORDER BY table_name
    `);
    
    console.log('\n✅ Successfully created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    console.log('\n🎉 ASEMB database is ready!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: node scripts/copy-data-to-asemb.js');
    console.log('   2. Run: node scripts/generate-embeddings.js');
    console.log('   3. Update backend to use ASEMB for all operations');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
  } finally {
    await pool.end();
  }
}

setupTables();