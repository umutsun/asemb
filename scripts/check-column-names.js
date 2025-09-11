const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot'
});

async function checkColumns() {
  try {
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistaykararlari'];
    
    for (const tableName of tables) {
      console.log(`\n📊 ${tableName.toUpperCase()} tablosu kolonları:`);
      
      const columnsResult = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);
      
      for (const col of columnsResult.rows) {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkColumns();