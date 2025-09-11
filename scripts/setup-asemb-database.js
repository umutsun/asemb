const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ASEMB database connection
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function setupDatabase() {
  console.log('🚀 Setting up ASEMB database for embeddings...');
  
  try {
    // Read SQL script
    const sqlScript = fs.readFileSync(
      path.join(__dirname, 'create-asemb-embedding-tables.sql'),
      'utf8'
    );
    
    // Execute SQL script
    await pool.query(sqlScript);
    
    console.log('✅ Database tables created successfully');
    
    // Check if pgvector extension is enabled
    const extResult = await pool.query(`
      SELECT * FROM pg_extension WHERE extname = 'vector'
    `);
    
    if (extResult.rows.length > 0) {
      console.log('✅ pgvector extension is enabled');
    } else {
      console.log('⚠️ pgvector extension needs to be enabled');
    }
    
    // List created tables
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
    
    console.log('\n📋 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Initialize embedding stats for each table
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistay_kararlari', 'scraped_content'];
    
    for (const table of tables) {
      await pool.query(`
        INSERT INTO embedding_stats (table_name, total_records, embedded_records)
        VALUES ($1, 0, 0)
        ON CONFLICT (table_name) DO NOTHING
      `, [table]);
    }
    
    console.log('\n✅ Embedding stats initialized');
    
    // Check if source tables exist in postgres database
    const sourcePool = new Pool({
      connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres'
    });
    
    const sourceTablesResult = await sourcePool.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM public."OZELGELER") as ozelgeler_count,
             (SELECT COUNT(*) FROM public."MAKALELER") as makaleler_count,
             (SELECT COUNT(*) FROM public."SORUCEVAP") as sorucevap_count,
             (SELECT COUNT(*) FROM public."DANISTAYKARARLARI") as danistay_count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('OZELGELER', 'MAKALELER', 'SORUCEVAP', 'DANISTAYKARARLARI')
      LIMIT 1
    `);
    
    if (sourceTablesResult.rows.length > 0) {
      const counts = sourceTablesResult.rows[0];
      console.log('\n📊 Source tables in postgres database:');
      console.log(`   - OZELGELER: ${counts.ozelgeler_count} records`);
      console.log(`   - MAKALELER: ${counts.makaleler_count} records`);
      console.log(`   - SORUCEVAP: ${counts.sorucevap_count} records`);
      console.log(`   - DANISTAYKARARLARI: ${counts.danistay_count} records`);
    }
    
    await sourcePool.end();
    
    console.log('\n✅ ASEMB database is ready for embeddings!');
    console.log('\n📝 Next steps:');
    console.log('   1. Copy data from postgres database to ASEMB');
    console.log('   2. Generate embeddings for all records');
    console.log('   3. Start using unified embedding search');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    if (error.detail) {
      console.error('   Details:', error.detail);
    }
  } finally {
    await pool.end();
  }
}

setupDatabase();