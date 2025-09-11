import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';

const router = Router();

// Source database (rag_chatbot) - where we read data from
const sourcePool = new Pool({
  connectionString: process.env.RAG_CHATBOT_DATABASE_URL
});

// Target database (asemb) - where we write embeddings to
const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Use targetPool for default queries (settings, migration history)
const pgPool = targetPool;

// Get OpenAI API key from database settings
async function getOpenAIClient() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'openai_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || process.env.OPENAI_API_KEY || '';
    return new OpenAI({ apiKey });
  } catch (error) {
    console.error('Error fetching OpenAI API key:', error);
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
}

// Progress tracking
let migrationProgress: any = {
  status: 'idle',
  current: 0,
  total: 0,
  percentage: 0,
  currentTable: null,
  error: null,
  tokensUsed: 0,
  estimatedCost: 0,
  startTime: null,
  estimatedTimeRemaining: null,
  processedTables: [],
  currentBatch: 0,
  totalBatches: 0
};

// Get migration history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    
    let query = `
      SELECT 
        migration_id,
        source_type,
        source_name,
        database_name,
        table_name,
        total_records,
        processed_records,
        successful_records,
        failed_records,
        status,
        batch_size,
        model_used,
        tokens_used,
        estimated_cost,
        error_message,
        started_at,
        completed_at,
        duration_seconds,
        ROUND((processed_records::NUMERIC / NULLIF(total_records, 0)) * 100, 2) as progress_percentage
      FROM migration_history
    `;
    
    const params: any[] = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY started_at DESC';
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    
    const result = await pgPool.query(query, params);
    
    // Get total count
    const countQuery = status 
      ? 'SELECT COUNT(*) FROM migration_history WHERE status = $1'
      : 'SELECT COUNT(*) FROM migration_history';
    const countResult = await pgPool.query(countQuery, status ? [status] : []);
    
    res.json({
      history: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch migration history' });
  }
});

// Get activity logs
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;
    
    const query = `
      SELECT * FROM (
        -- Migration activities
        SELECT 
          'migration' as activity_type,
          migration_id as id,
          CONCAT('Migration ', status, ': ', source_name) as description,
          status,
          started_at as timestamp,
          JSON_BUILD_OBJECT(
            'table', table_name,
            'records', total_records,
            'processed', processed_records,
            'cost', estimated_cost
          ) as metadata
        FROM migration_history
        
        UNION ALL
        
        -- Document processing activities
        SELECT 
          'document' as activity_type,
          migration_id as id,
          CONCAT('Document processed: ', document_name) as description,
          status,
          created_at as timestamp,
          JSON_BUILD_OBJECT(
            'type', document_type,
            'size', file_size_bytes,
            'chunks', chunks_created
          ) as metadata
        FROM document_processing_history
        WHERE migration_id IS NOT NULL
        
        UNION ALL
        
        -- Scraper activities
        SELECT 
          'scraper' as activity_type,
          migration_id as id,
          CONCAT('Scraped: ', domain) as description,
          status,
          scraped_at as timestamp,
          JSON_BUILD_OBJECT(
            'url', url,
            'status_code', status_code,
            'links', links_found,
            'response_time', response_time_ms
          ) as metadata
        FROM scraper_history_detailed
        WHERE migration_id IS NOT NULL
      ) activities
      ORDER BY timestamp DESC
      LIMIT $1
    `;
    
    const result = await pgPool.query(query, [limit]);
    
    res.json({
      activities: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Activity fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Get migration statistics
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    // Overall statistics
    const overallQuery = `
      SELECT 
        COUNT(*) as total_migrations,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COALESCE(SUM(processed_records), 0) as total_records_processed,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(SUM(estimated_cost), 0) as total_cost,
        COALESCE(AVG(duration_seconds), 0) as avg_duration
      FROM migration_history
    `;
    
    const overallResult = await pgPool.query(overallQuery);
    
    // Daily statistics (last 30 days)
    const dailyQuery = `
      SELECT 
        DATE(started_at) as date,
        COUNT(*) as migrations,
        SUM(processed_records) as records,
        SUM(tokens_used) as tokens,
        SUM(estimated_cost) as cost
      FROM migration_history
      WHERE started_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(started_at)
      ORDER BY date DESC
    `;
    
    const dailyResult = await pgPool.query(dailyQuery);
    
    // By source type
    const sourceQuery = `
      SELECT 
        source_type,
        COUNT(*) as count,
        SUM(processed_records) as records,
        AVG(duration_seconds) as avg_duration
      FROM migration_history
      GROUP BY source_type
    `;
    
    const sourceResult = await pgPool.query(sourceQuery);
    
    res.json({
      overall: overallResult.rows[0],
      daily: dailyResult.rows,
      bySource: sourceResult.rows
    });
  } catch (error) {
    console.error('Statistics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get comprehensive embedding statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get statistics from unified_embeddings table
    const totalResult = await targetPool.query(`
      SELECT 
        COUNT(*) as total_embeddings,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(AVG(tokens_used), 0) as avg_tokens
      FROM unified_embeddings
    `).catch(err => {
      console.error('Error querying unified_embeddings:', err);
      return { rows: [{ total_embeddings: 0, total_tokens: 0, avg_tokens: 0 }] };
    });
    
    const totalEmbeddings = parseInt(totalResult.rows[0].total_embeddings) || 0;
    const totalTokens = parseInt(totalResult.rows[0].total_tokens) || 0;
    const avgTokens = Math.round(totalResult.rows[0].avg_tokens) || 0;
    
    // Get statistics by source table
    const bySourceResult = await targetPool.query(`
      SELECT 
        source_table,
        COUNT(*) as count,
        COALESCE(SUM(tokens_used), 0) as tokens_used,
        COALESCE(ROUND(AVG(tokens_used)), 0) as avg_tokens
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY count DESC
    `).catch(err => {
      console.error('Error querying by source:', err);
      return { rows: [] };
    });
    
    // Get model usage statistics
    const modelUsageResult = await targetPool.query(`
      SELECT 
        model_used as model,
        COUNT(*) as count,
        COALESCE(SUM(tokens_used), 0) as total_tokens
      FROM unified_embeddings
      GROUP BY model_used
      ORDER BY count DESC
    `).catch(err => {
      console.error('Error querying model usage:', err);
      return { rows: [] };
    });
    
    // Get recent activity (last 24 hours)
    const recentActivityResult = await targetPool.query(`
      SELECT 
        source_table,
        'create' as operation,
        COUNT(*) as count,
        TO_CHAR(MAX(created_at), 'HH24:MI') as time
      FROM unified_embeddings
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source_table
      ORDER BY MAX(created_at) DESC
      LIMIT 5
    `).catch(err => {
      console.error('Error querying recent activity:', err);
      return { rows: [] };
    });
    
    // Calculate cost estimate ($0.0001 per 1K tokens)
    const costEstimate = (totalTokens / 1000) * 0.0001;
    
    // Also get the old format for backward compatibility
    const tables = [];
    let totalRecords = 0;
    let embeddedRecords = totalEmbeddings;
    
    // Get statistics from source tables in rag_chatbot
    const targetTables = [
      'ozelgeler',
      'makaleler', 
      'sorucevap',
      'danistaykararlari',
      'chat_history'
    ];
    
    for (const tableName of targetTables) {
      try {
        // Get count from source (rag_chatbot) - handle connection errors
        let sourceCount = 0;
        if (sourcePool) {
          try {
            const countResult = await sourcePool.query(
              `SELECT COUNT(*) as count FROM "${tableName}"`
            );
            sourceCount = parseInt(countResult.rows[0].count) || 0;
          } catch (err) {
            console.error(`Error querying source table ${tableName}:`, err.message);
          }
        }
        
        // Get embedded count from unified_embeddings
        const embeddedResult = await targetPool.query(
          `SELECT COUNT(*) as count FROM unified_embeddings 
           WHERE source_table = $1 AND source_name = 'rag_chatbot'`,
          [tableName]
        );
        const embedded = parseInt(embeddedResult.rows[0].count) || 0;
        
        if (sourceCount > 0 || embedded > 0) {
          tables.push({
            name: tableName,
            database: 'rag_chatbot',
            schema: 'public',
            count: sourceCount,
            embedded: embedded,
            pending: Math.max(0, sourceCount - embedded)
          });
          
          totalRecords += sourceCount;
        }
      } catch (err) {
        console.error(`Error processing table ${tableName}:`, err);
      }
    }
    
    res.json({
      // New detailed stats format
      totalEmbeddings,
      totalTokens,
      avgTokens,
      costEstimate,
      bySource: bySourceResult.rows.map(row => ({
        source_table: row.source_table,
        count: parseInt(row.count),
        tokens_used: parseInt(row.tokens_used) || 0,
        avg_tokens: parseInt(row.avg_tokens) || 0
      })),
      modelUsage: modelUsageResult.rows.map(row => ({
        model: row.model || 'text-embedding-ada-002',
        count: parseInt(row.count),
        total_tokens: parseInt(row.total_tokens) || 0
      })),
      recentActivity: recentActivityResult.rows.map(row => ({
        source_table: row.source_table,
        operation: row.operation,
        count: parseInt(row.count),
        time: row.time
      })),
      // Old format for backward compatibility
      database: 'asemb',
      totalRecords,
      embeddedRecords,
      pendingRecords: Math.max(0, totalRecords - embeddedRecords),
      tables: tables
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      details: error.message 
    });
  }
});

// Start migration process
router.post('/migrate', async (req: Request, res: Response) => {
  try {
    const { 
      sourceType = 'database',  // database, excel, pdf, csv, api
      sourceName = 'rag_chatbot',  // specific source identifier
      tables, 
      batchSize = 10,
      filePath = null,  // for file-based sources
      options = {}  // additional source-specific options
    } = req.body;
    
    // Validate based on source type
    if (sourceType === 'database') {
      if (!tables || !Array.isArray(tables) || tables.length === 0) {
        return res.status(400).json({ error: 'Tables array is required for database source' });
      }
    } else if (['excel', 'pdf', 'csv'].includes(sourceType)) {
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required for file-based sources' });
      }
    } else if (sourceType === 'api') {
      if (!options.endpoint) {
        return res.status(400).json({ error: 'API endpoint is required' });
      }
    }
    
    // Check if migration is already running
    if (migrationProgress.status === 'processing') {
      return res.status(400).json({ 
        error: 'Migration already in progress',
        progress: migrationProgress 
      });
    }
    
    // Create migration history entry
    const migrationId = await createMigrationHistory(tables, batchSize);
    
    // Reset progress for new migration
    migrationProgress = {
      status: 'processing',
      current: 0,
      total: 0,
      percentage: 0,
      currentTable: tables[0],
      error: null,
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      processedTables: [],
      currentBatch: 0,
      totalBatches: 0,
      migrationId: migrationId
    };
    
    // Start migration in background
    processMigration(tables, batchSize, migrationId).catch(err => {
      migrationProgress.status = 'error';
      migrationProgress.error = err.message;
      updateMigrationHistory(migrationId, 'failed', err.message);
    });
    
    res.json({ message: 'Migration started', progress: migrationProgress });
  } catch (error) {
    console.error('Migration start error:', error);
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Get migration progress
router.get('/progress', async (req: Request, res: Response) => {
  res.json(migrationProgress);
});

// Stop/pause migration
router.post('/stop', async (req: Request, res: Response) => {
  try {
    if (migrationProgress.status === 'processing') {
      migrationProgress.status = 'paused';
      res.json({ message: 'Migration paused', progress: migrationProgress });
    } else {
      res.json({ message: 'No migration in progress', progress: migrationProgress });
    }
  } catch (error) {
    console.error('Stop migration error:', error);
    res.status(500).json({ error: 'Failed to stop migration' });
  }
});

// Generate embedding for text
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Get OpenAI client with API key from database
    const openai = await getOpenAIClient();
    
    // Generate embedding using OpenAI
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    
    res.json({
      embedding: embedding,
      dimension: embedding.length,
      model: 'text-embedding-ada-002',
      tokens: response.usage?.total_tokens
    });
  } catch (error) {
    console.error('Embedding generation error:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// Get available tables from database
router.get('/tables', async (req: Request, res: Response) => {
  try {
    const tablesWithMeta = [];
    
    // Get target tables from settings
    let targetTables = [
      { name: 'ozelgeler', displayName: 'Özelgeler' },
      { name: 'makaleler', displayName: 'Makaleler' },
      { name: 'sorucevap', displayName: 'Soru-Cevap' },
      { name: 'danistaykararlari', displayName: 'Danıştay Kararları' },
      { name: 'chat_history', displayName: 'Sohbet Geçmişi' }
    ];
    
    try {
      const settingsResult = await targetPool.query(
        "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'migration_target_tables'"
      );
      if (settingsResult.rows[0]?.setting_value) {
        const tableNames = JSON.parse(settingsResult.rows[0].setting_value);
        // Map to display names
        targetTables = tableNames.map((name: string) => ({
          name,
          displayName: name.charAt(0).toUpperCase() + name.slice(1)
        }));
      }
    } catch (err) {
      console.log('Using default target tables');
    }
    
    for (const table of targetTables) {
      const tableName = table.name;
      const displayName = table.displayName;
      
      try {
        // Check if table exists in SOURCE database
        const tableCheck = await sourcePool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [tableName]
        );
        
        if (!tableCheck.rows[0].exists) continue;
        
        // Get count from SOURCE database
        const countResult = await sourcePool.query(
          `SELECT COUNT(*) as count FROM public."${tableName}"`
        );
        const count = parseInt(countResult.rows[0].count);
        
        // Skip empty tables
        if (count === 0) continue;
        
        // Get embedded count from SOURCE database
        let embeddedCount = 0;
        try {
          const embeddingResult = await sourcePool.query(
            `SELECT COUNT(*) as count FROM public."${tableName}" WHERE embedding IS NOT NULL`
          );
          embeddedCount = parseInt(embeddingResult.rows[0].count);
        } catch (err) {
          // Embedding column might not exist yet
        }
        
        // Get text columns count from SOURCE database
        const columnsResult = await sourcePool.query(
          `SELECT COUNT(*) as count 
           FROM information_schema.columns 
           WHERE table_name = $1 
           AND table_schema = 'public'
           AND data_type IN ('text', 'character varying', 'varchar')`,
          [tableName]
        );
        
        tablesWithMeta.push({
          name: tableName,
          displayName: displayName,
          database: 'rag_chatbot',
          schema: 'public',
          totalRecords: count,
          embeddedRecords: embeddedCount,
          textColumns: parseInt(columnsResult.rows[0].count)
        });
      } catch (err) {
        console.error(`Error getting stats for ${tableName}:`, err);
      }
    }
    
    res.json({ tables: tablesWithMeta });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Helper function to create migration history
async function createMigrationHistory(tables: string[], batchSize: number): Promise<string> {
  try {
    // Count total records from SOURCE database
    let totalRecords = 0;
    for (const table of tables) {
      const countResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}" WHERE embedding IS NULL`
      );
      totalRecords += parseInt(countResult.rows[0].count);
    }
    
    // Let PostgreSQL generate the UUID
    const result = await pgPool.query(`
      INSERT INTO migration_history (
        source_type, source_name, database_name, table_name, 
        total_records, batch_size, status, model_used, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING migration_id::text
    `, [
      'database',
      tables.join(', '),
      'rag_chatbot',
      tables.join(', '),
      totalRecords,
      batchSize,
      'processing',
      'text-embedding-ada-002',
      JSON.stringify({ tables, startTime: new Date() })
    ]);
    
    return result.rows[0].migration_id;
  } catch (error) {
    console.error('Error creating migration history:', error);
    return 'unknown';
  }
}

// Helper function to update migration history
async function updateMigrationHistory(
  migrationId: string, 
  status: string, 
  errorMessage?: string
) {
  try {
    const updateQuery = `
      UPDATE migration_history 
      SET status = $1::VARCHAR, 
          error_message = $2::TEXT,
          completed_at = CASE WHEN $1::VARCHAR IN ('completed', 'failed') THEN NOW() ELSE NULL END,
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
          updated_at = NOW()
      WHERE migration_id = $3::UUID
    `;
    
    await pgPool.query(updateQuery, [status, errorMessage || null, migrationId]);
  } catch (error) {
    console.error('Error updating migration history:', error);
  }
}

// Background migration process
async function processMigration(tables: string[], batchSize: number, migrationId: string) {
  try {
    // Calculate total records to process from SOURCE database
    let totalToProcess = 0;
    for (const table of tables) {
      // Ensure embedding column exists in SOURCE database
      await ensureEmbeddingColumn(table);
      
      // Count records WITHOUT embeddings in SOURCE database
      const countResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}" WHERE embedding IS NULL`
      );
      totalToProcess += parseInt(countResult.rows[0].count);
    }
    
    migrationProgress.total = totalToProcess;
    
    // Process each table
    for (const table of tables) {
      if (migrationProgress.status === 'paused') {
        console.log('Migration paused by user');
        return;
      }
      
      migrationProgress.currentTable = table;
      
      // Get the main content column for each table from settings
      let contentColumns: { [key: string]: string } = {
        'ozelgeler': '"Icerik"',
        'makaleler': '"Icerik"',
        'sorucevap': 'CONCAT("Soru", \' \', "Cevap")',
        'danistaykararlari': '"Icerik"',
        'chat_history': 'message'
      };
      
      try {
        const columnsResult = await targetPool.query(
          "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'migration_content_columns'"
        );
        if (columnsResult.rows[0]?.setting_value) {
          contentColumns = JSON.parse(columnsResult.rows[0].setting_value);
        }
      } catch (err) {
        console.log('Using default content columns');
      }
      
      const contentColumn = contentColumns[table] || 'content';
      const primaryKey = await getPrimaryKey(table);
      
      // Process records in batches
      let offset = 0;
      let hasMore = true;
      
      while (hasMore && migrationProgress.status !== 'paused') {
        // Get batch of records without embeddings from SOURCE database
        // Use ROW_NUMBER() as fallback if no primary key
        const batchQuery = primaryKey !== 'ROW_NUMBER' ? `
          SELECT ${primaryKey}, ${contentColumn} as text_content
          FROM public."${table}"
          WHERE embedding IS NULL
            AND ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
          LIMIT $1 OFFSET $2
        ` : `
          SELECT ROW_NUMBER() OVER (ORDER BY 1) as row_num, ${contentColumn} as text_content
          FROM public."${table}"
          WHERE embedding IS NULL
            AND ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
          LIMIT $1 OFFSET $2
        `;
        
        const batchResult = await sourcePool.query(batchQuery, [batchSize, offset]);
        
        if (batchResult.rows.length === 0) {
          hasMore = false;
          break;
        }
        
        // Generate embeddings for batch
        for (const row of batchResult.rows) {
          if (migrationProgress.status === 'paused') {
            return;
          }
          
          try {
            const text = row.text_content;
            if (!text || text.trim() === '') continue;
            
            // Get OpenAI client
            const openai = await getOpenAIClient();
            
            // Generate embedding
            const response = await openai.embeddings.create({
              model: 'text-embedding-ada-002',
              input: text.substring(0, 8000), // Limit text length
            });
            
            const embedding = response.data[0].embedding;
            
            // Track token usage
            if (response.usage) {
              migrationProgress.tokensUsed += response.usage.total_tokens;
              // Estimate cost: $0.0001 per 1K tokens for ada-002
              migrationProgress.estimatedCost = (migrationProgress.tokensUsed / 1000) * 0.0001;
            }
            
            // Save embedding to unified_embeddings table in TARGET database (asemb)
            if (primaryKey !== 'ROW_NUMBER') {
              try {
                // Get display name for the table
                const displayNames: { [key: string]: string } = {
                  'ozelgeler': 'Özelgeler',
                  'makaleler': 'Makaleler',
                  'sorucevap': 'Soru-Cevap',
                  'danistaykararlari': 'Danıştay Kararları',
                  'chat_history': 'Sohbet Geçmişi'
                };
                
                // Insert into unified_embeddings table
                await targetPool.query(
                  `INSERT INTO unified_embeddings (
                    source_type, source_name, source_table, source_id,
                    title, content, embedding, metadata, tokens_used, model_used
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                  ON CONFLICT (source_type, source_name, source_table, source_id) 
                  DO UPDATE SET 
                    embedding = $7, 
                    content = $6,
                    tokens_used = $9,
                    updated_at = NOW()`,
                  [
                    'database',
                    'rag_chatbot',
                    displayNames[table] || table,
                    row[primaryKey].toString(),
                    `${displayNames[table] || table} - ID: ${row[primaryKey]}`,
                    text.substring(0, 5000),
                    `[${embedding.join(',')}]`,
                    JSON.stringify({ 
                      original_table: table,
                      migrated_at: new Date()
                    }),
                    response.usage?.total_tokens || 0,
                    'text-embedding-ada-002'
                  ]
                );
                
                // Also update SOURCE database to mark as processed
                await sourcePool.query(
                  `UPDATE public."${table}" SET embedding = $1 WHERE ${primaryKey} = $2`,
                  [`[${embedding.join(',')}]`, row[primaryKey]]
                );
              } catch (err) {
                console.error(`Error saving embedding for ${table} record ${row[primaryKey]}:`, err);
              }
            } else {
              console.log(`Warning: Table ${table} has no primary key, skipping embedding update`);
            }
            
            migrationProgress.current++;
            migrationProgress.percentage = Math.round(
              (migrationProgress.current / migrationProgress.total) * 100
            );
            
            // Calculate estimated time remaining
            const elapsed = Date.now() - migrationProgress.startTime;
            const rate = migrationProgress.current / elapsed;
            const remaining = migrationProgress.total - migrationProgress.current;
            migrationProgress.estimatedTimeRemaining = Math.round(remaining / rate);
            
            // Update migration history periodically (every 10 records)
            if (migrationProgress.current % 10 === 0) {
              await pgPool.query(`
                UPDATE migration_history 
                SET processed_records = $1,
                    successful_records = $1,
                    tokens_used = $2,
                    estimated_cost = $3,
                    updated_at = NOW()
                WHERE migration_id = $4
              `, [
                migrationProgress.current,
                migrationProgress.tokensUsed,
                migrationProgress.estimatedCost,
                migrationId
              ]);
            }
            
            // Rate limiting to avoid API limits
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err) {
            console.error(`Error processing record:`, err);
          }
        }
        
        offset += batchSize;
      }
      
      if (migrationProgress.status !== 'paused') {
        migrationProgress.processedTables.push(table);
      }
    }
    
    if (migrationProgress.status !== 'paused') {
      migrationProgress.status = 'completed';
      // Update final migration history
      await pgPool.query(`
        UPDATE migration_history 
        SET status = 'completed',
            processed_records = $1,
            successful_records = $1,
            tokens_used = $2,
            estimated_cost = $3,
            completed_at = NOW(),
            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
            updated_at = NOW()
        WHERE migration_id = $4::UUID
      `, [
        migrationProgress.current,
        migrationProgress.tokensUsed,
        migrationProgress.estimatedCost,
        migrationId
      ]);
    }
  } catch (error) {
    console.error('Migration error:', error);
    migrationProgress.status = 'error';
    migrationProgress.error = error instanceof Error ? error.message : 'Unknown error';
    updateMigrationHistory(migrationId, 'failed', migrationProgress.error);
  }
}

// Ensure table has embedding column
async function ensureEmbeddingColumn(tableName: string) {
  try {
    // Check if column exists in SOURCE database
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
        AND column_name = 'embedding'
        AND table_schema = 'public'
    `;
    
    const result = await sourcePool.query(checkQuery, [tableName]);
    
    if (result.rows.length === 0) {
      // Add embedding column with vector type to SOURCE database
      await sourcePool.query(`
        ALTER TABLE public."${tableName}" 
        ADD COLUMN IF NOT EXISTS embedding vector(1536)
      `);
      console.log(`Added embedding column to table ${tableName}`);
    }
  } catch (error) {
    console.error(`Error ensuring embedding column for ${tableName}:`, error);
    throw error;
  }
}

// Get primary key column for a table
async function getPrimaryKey(tableName: string): Promise<string> {
  try {
    const query = `
      SELECT column_name
      FROM information_schema.key_column_usage
      WHERE table_name = $1
        AND constraint_name = (
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_name = $1
            AND constraint_type = 'PRIMARY KEY'
        )
    `;
    
    const result = await sourcePool.query(query, [tableName]);
    
    if (result.rows.length > 0) {
      // Return with proper quoting for case-sensitive columns
      const colName = result.rows[0].column_name;
      return colName === colName.toLowerCase() ? colName : `"${colName}"`;
    }
    
    // Try common variations
    const checkColumns = ['id', 'Id', 'ID', '"Id"', '"ID"'];
    for (const col of checkColumns) {
      try {
        const testQuery = `SELECT ${col} FROM public."${tableName}" LIMIT 1`;
        await sourcePool.query(testQuery);
        return col;
      } catch (err) {
        // Column doesn't exist, try next
      }
    }
    
    // Final fallback - no primary key found
    console.log(`No primary key found for table ${tableName}, will use ROW_NUMBER`);
    return 'ROW_NUMBER';
  } catch (error) {
    console.error(`Error getting primary key for ${tableName}:`, error);
    return 'ROW_NUMBER';
  }
}

export default router;