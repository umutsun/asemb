const { Pool } = require('pg');

// ASEMB database - where unified_embeddings table is stored
const asembPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'
});

async function checkData() {
  try {
    console.log('Checking unified_embeddings table structure and data...');

    // Check distinct source_table values
    const result = await asembPool.query('SELECT DISTINCT source_table, COUNT(*) as count FROM unified_embeddings GROUP BY source_table');
    console.log('Source tables in unified_embeddings:');
    result.rows.forEach(row => {
      console.log(`  ${row.source_table}: ${row.count} records`);
    });

    // Check total count
    const totalResult = await asembPool.query('SELECT COUNT(*) as total FROM unified_embeddings');
    console.log(`Total embeddings: ${totalResult.rows[0].total}`);

    // Check some sample records
    const sampleResult = await asembPool.query('SELECT source_table, source_type, source_id, title FROM unified_embeddings LIMIT 5');
    console.log('Sample records:');
    sampleResult.rows.forEach(row => {
      console.log(`  ${row.source_table} | ${row.source_type} | ${row.source_id} | ${row.title}`);
    });

    await asembPool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkData();