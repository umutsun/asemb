const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function checkSchemas() {
  try {
    // Get all schemas
    const schemasResult = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    
    console.log('\n=== ASEMB Veritabanı Şemaları ===\n');
    console.log('Şemalar:', schemasResult.rows.map(r => r.schema_name).join(', '));
    
    // Check each schema for tables
    for (const schema of schemasResult.rows) {
      const schemaName = schema.schema_name;
      
      const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `, [schemaName]);
      
      console.log(`\n📁 ${schemaName} şeması:`);
      
      if (tablesResult.rows.length === 0) {
        console.log('   - Tablo yok');
      } else {
        for (const table of tablesResult.rows) {
          const tableName = table.table_name;
          
          // Get row count
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${schemaName}."${tableName}"`);
          const count = countResult.rows[0].count;
          
          // Check for embedding column
          const embeddingCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = $1 
            AND table_name = $2 
            AND column_name = 'embedding'
          `, [schemaName, tableName]);
          
          const hasEmbedding = embeddingCheck.rows.length > 0;
          
          console.log(`   📊 ${tableName}: ${count} kayıt ${hasEmbedding ? '(✅ embedding var)' : '(❌ embedding yok)'}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSchemas();