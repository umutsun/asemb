const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

async function checkPrimaryKeys() {
  try {
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistaykararlari', 'chat_history'];
    
    for (const table of tables) {
      console.log(`\nChecking table: ${table}`);
      
      // Get primary key info
      const pkQuery = `
        SELECT 
          kcu.column_name,
          c.data_type,
          c.udt_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.columns c
          ON c.column_name = kcu.column_name
          AND c.table_name = kcu.table_name
          AND c.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' 
          AND tc.table_name = $1
          AND tc.table_schema = 'public'
      `;
      
      const result = await sourcePool.query(pkQuery, [table]);
      
      if (result.rows.length > 0) {
        console.log(`  Primary key: ${result.rows[0].column_name}`);
        console.log(`  Data type: ${result.rows[0].data_type}`);
        console.log(`  UDT name: ${result.rows[0].udt_name}`);
      } else {
        console.log('  No primary key found');
        
        // Check for id columns
        const idQuery = `
          SELECT column_name, data_type, udt_name
          FROM information_schema.columns
          WHERE table_name = $1
            AND table_schema = 'public'
            AND column_name ILIKE '%id%'
        `;
        
        const idResult = await sourcePool.query(idQuery, [table]);
        if (idResult.rows.length > 0) {
          console.log('  ID columns found:');
          idResult.rows.forEach(row => {
            console.log(`    - ${row.column_name}: ${row.data_type} (${row.udt_name})`);
          });
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPrimaryKeys();