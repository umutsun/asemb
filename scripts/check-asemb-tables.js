const { Pool } = require('pg');

// ASEMB database connection
const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function checkTables() {
  console.log('🔍 Checking ASEMB database tables...\n');
  
  try {
    // Check if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('📋 Existing tables in ASEMB:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Check documents table structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'documents'
      ORDER BY ordinal_position
    `);
    
    if (columnsResult.rows.length > 0) {
      console.log('\n📄 Documents table structure:');
      columnsResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
    }
    
    // Check if pgvector extension is enabled
    const extResult = await pool.query(`
      SELECT * FROM pg_extension WHERE extname = 'vector'
    `);
    
    console.log('\n📦 Extensions:');
    if (extResult.rows.length > 0) {
      console.log('   ✅ pgvector is enabled');
    } else {
      console.log('   ❌ pgvector is NOT enabled');
    }
    
    // Check indexes
    const indexesResult = await pool.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('documents', 'ozelgeler', 'makaleler', 'sorucevap', 'danistay_kararlari')
      ORDER BY tablename, indexname
    `);
    
    console.log('\n🔍 Indexes:');
    let currentTable = '';
    indexesResult.rows.forEach(row => {
      if (currentTable !== row.tablename) {
        currentTable = row.tablename;
        console.log(`   ${row.tablename}:`);
      }
      console.log(`      - ${row.indexname}`);
    });
    
    // Count records in each table
    console.log('\n📊 Record counts:');
    const tables = ['documents', 'ozelgeler', 'makaleler', 'sorucevap', 'danistay_kararlari', 'scraped_content', 'embedding_stats'];
    
    for (const table of tables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   - ${table}: ${countResult.rows[0].count} records`);
      } catch (err) {
        // Table might not exist
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();