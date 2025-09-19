const { Pool } = require('pg');
const Redis = require('ioredis');

// Database configuration from config.json (working configuration)
const customerDbConfig = {
  host: '91.99.229.96',
  port: 5432,
  database: 'postgres',  // Using postgres database instead of rag_chatbot
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
};

// ASEMB database configuration (for unified_embeddings) - try using postgres database
const asembDbConfig = {
  host: '91.99.229.96',
  port: 5432,
  database: 'postgres',  // This might be where unified_embeddings is stored
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
};

// Redis configuration
const redisConfig = {
  host: 'localhost',
  port: 6379,
  db: 2
};

async function checkEmbeddingCounts() {
  console.log('🔍 Checking embedding counts in databases and Redis...\n');

  // Initialize database connections
  const customerPool = new Pool(customerDbConfig);
  const asembPool = new Pool(asembDbConfig);
  const redis = new Redis(redisConfig);

  try {
    // Check Redis keys
    console.log('📊 Redis Keys:');
    try {
      const migrationProgress = await redis.get('migration:progress');
      const embeddingProgress = await redis.get('embedding:progress');

      console.log(`  migration:progress: ${migrationProgress ? JSON.stringify(JSON.parse(migrationProgress)) : 'Not found'}`);
      console.log(`  embedding:progress: ${embeddingProgress ? JSON.stringify(JSON.parse(embeddingProgress)) : 'Not found'}`);
    } catch (redisError) {
      console.log(`  Redis error: ${redisError.message}`);
    }
    console.log('');

    // Check ASEMB database (unified_embeddings)
    console.log('📊 ASEMB Database (asemb) - unified_embeddings table:');
    try {
      const result = await asembPool.query(`
        SELECT source_table, COUNT(*) as count
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY count DESC
      `);

      if (result.rows.length > 0) {
        let total = 0;
        result.rows.forEach(row => {
          console.log(`  ${row.source_table}: ${row.count} embeddings`);
          total += parseInt(row.count);
        });
        console.log(`  Total: ${total} embeddings`);
      } else {
        console.log('  No embeddings found in unified_embeddings table');
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    console.log('');

    // Check if embedding_history table exists in ASEMB
    console.log('📊 ASEMB Database - embedding_history table:');
    try {
      const historyResult = await asembPool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'embedding_history'
        )
      `);

      if (historyResult.rows[0].exists) {
        const countResult = await asembPool.query('SELECT COUNT(*) as count FROM embedding_history');
        console.log(`  embedding_history exists with ${countResult.rows[0].count} records`);

        const sourceCounts = await asembPool.query(`
          SELECT source_table, COUNT(*) as count
          FROM embedding_history
          GROUP BY source_table
        `);

        if (sourceCounts.rows.length > 0) {
          console.log('  Source breakdown:');
          sourceCounts.rows.forEach(row => {
            console.log(`    ${row.source_table}: ${row.count} records`);
          });
        }
      } else {
        console.log('  embedding_history table does not exist');
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
    console.log('');

    // Check rag_chatbot database individual tables
    console.log('📊 rag_chatbot Database - Individual table counts:');

    const tables = [
      { name: 'ozelgler', contentColumn: '"Icerik"' },
      { name: 'makaleler', contentColumn: '"Icerik"' },
      { name: 'sorucevap', contentColumn: null, whereClause: '"Soru" IS NOT NULL AND "Cevap" IS NOT NULL' },
      { name: 'danistaykararlari', contentColumn: '"Icerik"' },
      { name: 'chat_history', contentColumn: 'message' }
    ];

    for (const table of tables) {
      try {
        // Check if table exists
        const existsResult = await customerPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${table.name}'
          )
        `);

        if (existsResult.rows[0].exists) {
          let query = `SELECT COUNT(*) as total FROM ${table.name}`;
          if (table.whereClause) {
            query += ` WHERE ${table.whereClause}`;
          } else if (table.contentColumn) {
            query += ` WHERE ${table.contentColumn} IS NOT NULL`;
          }

          const result = await customerPool.query(query);
          console.log(`  ${table.name}: ${result.rows[0].total} records`);
        } else {
          console.log(`  ${table.name}: Table does not exist`);
        }
      } catch (error) {
        console.log(`  ${table.name}: Error - ${error.message}`);
      }
    }
    console.log('');

    // Check how many records from each table are embedded in unified_embeddings
    console.log('📊 Embedding Progress Analysis:');

    for (const table of tables) {
      try {
        // Check if table exists
        const existsResult = await customerPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = '${table.name}'
          )
        `);

        if (existsResult.rows[0].exists) {
          // Get total records
          let totalQuery = `SELECT COUNT(*) as total FROM ${table.name}`;
          if (table.whereClause) {
            totalQuery += ` WHERE ${table.whereClause}`;
          } else if (table.contentColumn) {
            totalQuery += ` WHERE ${table.contentColumn} IS NOT NULL`;
          }

          const totalResult = await customerPool.query(totalQuery);
          const total = parseInt(totalResult.rows[0].total);

          // Get embedded records
          const embeddedResult = await asembPool.query(`
            SELECT COUNT(*) as embedded
            FROM unified_embeddings
            WHERE source_table = '${table.name}'
          `);
          const embedded = parseInt(embeddedResult.rows[0].embedded);

          const percentage = total > 0 ? Math.round((embedded / total) * 100) : 0;
          console.log(`  ${table.name}: ${embedded}/${total} embedded (${percentage}%)`);
        }
      } catch (error) {
        console.log(`  ${table.name}: Error - ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Error checking embedding counts:', error);
  } finally {
    // Close connections
    await customerPool.end();
    await asembPool.end();
    await redis.quit();
    console.log('\n✅ Database connections closed');
  }
}

// Run the check
checkEmbeddingCounts().catch(console.error);