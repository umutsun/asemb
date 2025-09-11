const { Pool } = require('pg');
require('dotenv').config({ path: '../backend/.env' });

const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

async function addPrimaryKeys() {
  try {
    console.log('Adding primary keys to tables without them...\n');
    
    // Check makaleler table structure
    const makalelerColumns = await sourcePool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'makaleler' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('Makaleler columns:');
    makalelerColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    // Check if id column exists
    const hasId = makalelerColumns.rows.some(col => col.column_name.toLowerCase() === 'id');
    
    if (!hasId) {
      console.log('\nAdding id column to makaleler...');
      await sourcePool.query(`
        ALTER TABLE makaleler 
        ADD COLUMN id SERIAL PRIMARY KEY
      `);
      console.log('✅ Added id column with primary key to makaleler');
    } else {
      console.log('\nAdding primary key constraint to existing id column...');
      await sourcePool.query(`
        ALTER TABLE makaleler 
        ADD PRIMARY KEY (id)
      `).catch(err => {
        if (err.code === '42P07') {
          console.log('Primary key already exists on makaleler');
        } else {
          throw err;
        }
      });
    }
    
    // Check sorucevap table
    const sorucevapColumns = await sourcePool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sorucevap' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('\nSorucevap columns:');
    sorucevapColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    const hasSorucevapId = sorucevapColumns.rows.some(col => col.column_name.toLowerCase() === 'id');
    
    if (!hasSorucevapId) {
      console.log('\nAdding id column to sorucevap...');
      await sourcePool.query(`
        ALTER TABLE sorucevap 
        ADD COLUMN id SERIAL PRIMARY KEY
      `);
      console.log('✅ Added id column with primary key to sorucevap');
    } else {
      console.log('\nAdding primary key constraint to existing id column...');
      await sourcePool.query(`
        ALTER TABLE sorucevap 
        ADD PRIMARY KEY (id)
      `).catch(err => {
        if (err.code === '42P07') {
          console.log('Primary key already exists on sorucevap');
        } else {
          throw err;
        }
      });
    }
    
    console.log('\n✅ Primary key setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addPrimaryKeys();