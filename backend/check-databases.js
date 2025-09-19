const { Pool } = require('pg');

// Database configuration
const dbConfig = {
  host: '91.99.229.96',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
};

async function checkDatabases() {
  console.log('🔍 Checking available databases and tables...\n');

  const pool = new Pool(dbConfig);

  try {
    // Check all databases
    console.log('📊 Available databases:');
    const dbResult = await pool.query(`
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false
      AND datname NOT IN ('postgres', 'template0', 'template1')
      ORDER BY datname
    `);

    dbResult.rows.forEach(row => {
      console.log(`  - ${row.datname}`);
    });
    console.log('');

    // Try connecting to each database to check tables
    for (const db of dbResult.rows) {
      console.log(`📊 Database: ${db.datname}`);

      const testPool = new Pool({
        ...dbConfig,
        database: db.datname
      });

      try {
        await testPool.query('SELECT 1');

        // Check tables
        const tableResult = await testPool.query(`
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
          ORDER BY tablename
        `);

        if (tableResult.rows.length > 0) {
          console.log('  Tables:');
          for (const table of tableResult.rows) {
            console.log(`    - ${table.tablename}`);

            // Check if it's one of our target tables and get count
            if (['ozelgler', 'makaleler', 'sorucevap', 'danistaykararlari', 'chat_history', 'unified_embeddings', 'embedding_history'].includes(table.tablename)) {
              try {
                const countResult = await testPool.query(`SELECT COUNT(*) as count FROM "${table.tablename}"`);
                console.log(`      Count: ${countResult.rows[0].count}`);
              } catch (countError) {
                console.log(`      Count: Error - ${countError.message}`);
              }
            }
          }
        } else {
          console.log('  No tables found');
        }

        console.log('');
      } catch (error) {
        console.log(`  Error connecting: ${error.message}\n`);
      } finally {
        await testPool.end();
      }
    }

  } catch (error) {
    console.error('Error checking databases:', error);
  } finally {
    await pool.end();
    console.log('✅ Database connection closed');
  }
}

// Run the check
checkDatabases().catch(console.error);