const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://chatbot_user:Gunes.240322@91.99.229.96:5432/rag_chatbot'
});

async function checkTables() {
  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('\n=== RAG_CHATBOT Veritabanı Tabloları ===\n');
    
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      
      // Get row count
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const count = countResult.rows[0].count;
      
      // Get columns
      const columnsResult = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);
      
      // Check if embedding column exists
      const hasEmbedding = columnsResult.rows.some(col => col.column_name === 'embedding');
      
      console.log(`📊 ${tableName}:`);
      console.log(`   - Kayıt sayısı: ${count}`);
      console.log(`   - Embedding kolonu: ${hasEmbedding ? '✅ VAR' : '❌ YOK'}`);
      
      // Show text columns
      const textColumns = columnsResult.rows.filter(col => 
        ['text', 'varchar', 'character varying'].includes(col.data_type)
      );
      
      if (textColumns.length > 0) {
        console.log(`   - Text kolonları: ${textColumns.map(c => c.column_name).join(', ')}`);
      }
      
      // Get sample data
      if (count > 0) {
        const sampleResult = await pool.query(`SELECT * FROM ${tableName} LIMIT 1`);
        const sample = sampleResult.rows[0];
        const keys = Object.keys(sample);
        console.log(`   - Örnek kolonlar: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkTables();