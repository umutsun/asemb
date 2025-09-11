// ASB Migration API - api/migration-api.js
const express = require('express');
const { Client } = require('pg');
const Redis = require('ioredis');
const OpenAI = require('openai');
const router = express.Router();

// Database configuration
const pgConfig = {
  host: process.env.PG_HOST || '91.99.229.96',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'postgres',
  user: process.env.PG_USER || 'makaleler',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD
};

// Redis configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  db: process.env.REDIS_DB || 2
});

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper function to chunk text
function chunkText(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
  }
  
  return chunks;
}

// Generate embeddings
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding error:', error);
    // Return null if API fails - we can retry later
    return null;
  }
}

// Check connection status
router.get('/status', async (req, res) => {
  try {
    const redisStatus = await redis.ping() === 'PONG';
    
    const pg = new Client(pgConfig);
    await pg.connect();
    const pgStatus = await pg.query('SELECT 1').then(() => true).catch(() => false);
    await pg.end();
    
    res.json({
      connections: {
        redis: redisStatus,
        postgres: pgStatus
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get database statistics
router.get('/database/stats', async (req, res) => {
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    
    // Check if tables exist and get counts
    const stats = {};
    const tables = ['embeddings', 'chunks', 'sources', 'queries'];
    
    for (const table of tables) {
      try {
        const result = await pg.query(`SELECT COUNT(*) as count FROM ${table}`);
        stats[table] = result.rows[0].count;
      } catch (e) {
        stats[table] = 0; // Table doesn't exist
      }
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await pg.end();
  }
});

// Analyze table
router.post('/analyze', async (req, res) => {
  const { table } = req.body;
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    
    // Get total count
    const countResult = await pg.query(
      `SELECT COUNT(*) as count FROM "${table}"`
    );
    
    // Check if sources table exists
    let readyCount = countResult.rows[0].count;
    try {
      const readyResult = await pg.query(`
        SELECT COUNT(*) as ready 
        FROM "${table}" t
        WHERE NOT EXISTS (
          SELECT 1 FROM sources s 
          WHERE s.original_id = t.id::text 
          AND s.table_name = $1
        )
      `, [table]);
      readyCount = readyResult.rows[0].ready;
    } catch (e) {
      // sources table doesn't exist yet
    }
    
    res.json({
      count: countResult.rows[0].count,
      ready: readyCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await pg.end();
  }
});

// Preview table data
router.get('/preview', async (req, res) => {
  const { table, limit = 5 } = req.query;
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    const preview = await pg.query(
      `SELECT * FROM "${table}" LIMIT $1`,
      [parseInt(limit)]
    );
    
    res.json(preview.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await pg.end();
  }
});

// Migration with streaming
router.post('/migrate', async (req, res) => {
  const { 
    table: sourceTable, 
    batchSize = 10, 
    chunkSize = 1000,
    embed = true 
  } = req.body;
  
  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    
    // Ensure tables exist
    await pg.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id SERIAL PRIMARY KEY,
        original_id TEXT,
        table_name TEXT,
        title TEXT,
        content TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(original_id, table_name)
      )
    `);
    
    await pg.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id SERIAL PRIMARY KEY,
        source_id INTEGER REFERENCES sources(id),
        chunk_index INTEGER,
        content TEXT,
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(source_id, chunk_index)
      )
    `);
    
    await pg.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id SERIAL PRIMARY KEY,
        source_id INTEGER,
        chunk_id TEXT,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Get total count
    const totalResult = await pg.query(
      `SELECT COUNT(*) as total FROM "${sourceTable}"`
    );
    const total = parseInt(totalResult.rows[0].total);
    
    let processed = 0;
    let offset = 0;
    
    // Process in batches
    while (offset < total) {
      const batch = await pg.query(
        `SELECT * FROM "${sourceTable}" ORDER BY id LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );
      
      for (const row of batch.rows) {
        try {
          // Prepare content based on table type
          let content = '';
          let title = '';
          
          if (sourceTable === 'MAKALELER') {
            title = row.Baslik || `Article #${row.id}`;
            content = `${row.Baslik || ''}\n${row.text || ''}`;
          } else if (sourceTable === 'DANISTAYKARARLARI') {
            title = row.Baslik || `Decision #${row.id}`;
            content = `${row.Karar || ''}\n${row.Ozet || ''}`;
          } else if (sourceTable === 'OZELGELER') {
            title = row.Konu || `Letter #${row.id}`;
            content = `${row.Konu || ''}\n${row.Icerik || ''}`;
          } else if (sourceTable === 'SORUCEVAP' || sourceTable === 'sorucevap') {
            title = row.Soru || `Q&A #${row.id}`;
            content = `Soru: ${row.Soru || ''}\nCevap: ${row.Cevap || ''}`;
          }
          
          if (!content.trim()) {
            console.log(`Skipping empty record ${row.id}`);
            continue;
          }
          
          // Create or update source record
          const sourceResult = await pg.query(`
            INSERT INTO sources (
              original_id, 
              table_name, 
              title, 
              content, 
              metadata
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (original_id, table_name) 
            DO UPDATE SET 
              title = EXCLUDED.title,
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              updated_at = NOW()
            RETURNING id
          `, [
            row.id.toString(),
            sourceTable,
            title,
            content,
            JSON.stringify(row)
          ]);
          
          const sourceId = sourceResult.rows[0].id;
          
          // Create chunks
          const chunks = chunkText(content, chunkSize);
          
          for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            
            // Generate embedding if enabled
            let embedding = null;
            if (embed) {
              embedding = await generateEmbedding(chunkText);
              
              // Retry once if failed
              if (!embedding) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                embedding = await generateEmbedding(chunkText);
              }
            }
            
            // Store chunk
            if (embedding) {
              await pg.query(`
                INSERT INTO chunks (
                  source_id,
                  chunk_index,
                  content,
                  embedding
                ) VALUES ($1, $2, $3, $4)
                ON CONFLICT (source_id, chunk_index) 
                DO UPDATE SET 
                  content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding,
                  updated_at = NOW()
              `, [
                sourceId,
                i,
                chunkText,
                `[${embedding.join(',')}]`
              ]);
              
              // Also store in embeddings table
              await pg.query(`
                INSERT INTO embeddings (
                  source_id,
                  chunk_id,
                  embedding,
                  metadata
                ) VALUES ($1, $2, $3, $4)
              `, [
                sourceId,
                `${sourceId}-${i}`,
                `[${embedding.join(',')}]`,
                JSON.stringify({
                  table: sourceTable,
                  chunk_index: i,
                  total_chunks: chunks.length,
                  title: title
                })
              ]);
            } else {
              // Store chunk without embedding
              await pg.query(`
                INSERT INTO chunks (
                  source_id,
                  chunk_index,
                  content
                ) VALUES ($1, $2, $3)
                ON CONFLICT (source_id, chunk_index) 
                DO UPDATE SET 
                  content = EXCLUDED.content,
                  updated_at = NOW()
              `, [
                sourceId,
                i,
                chunkText
              ]);
            }
          }
          
          // Update Redis cache
          await redis.hset(
            `asb:migration:${sourceTable}`,
            row.id,
            JSON.stringify({
              processed: true,
              source_id: sourceId,
              chunks: chunks.length,
              timestamp: new Date().toISOString()
            })
          );
          
          processed++;
          
          // Send progress update
          const percentage = Math.round((processed / total) * 100);
          res.write(`data: ${JSON.stringify({
            processed,
            total,
            percentage,
            current: {
              id: row.id,
              title: title
            }
          })}\n\n`);
          
        } catch (error) {
          console.error(`Error processing row ${row.id}:`, error);
          res.write(`data: ${JSON.stringify({
            error: true,
            message: `Failed to process record ${row.id}: ${error.message}`
          })}\n\n`);
        }
      }
      
      offset += batchSize;
    }
    
    res.write(`data: ${JSON.stringify({
      complete: true,
      processed,
      total
    })}\n\n`);
    
    res.end();
  } catch (error) {
    console.error('Migration error:', error);
    res.write(`data: ${JSON.stringify({
      error: true,
      message: error.message
    })}\n\n`);
    res.end();
  } finally {
    await pg.end();
  }
});

module.exports = router;