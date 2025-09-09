#!/usr/bin/env node

require('dotenv').config();
const { Client } = require('pg');
const OpenAI = require('openai');
const cliProgress = require('cli-progress');

// Configuration
const CONFIG = {
  danistaykararlari: {
    textField: 'metin',
    titleField: 'karar_no',
    metadataFields: ['karar_no', 'karar_tarihi', 'daire', 'konu'],
    chunkSize: 2000
  },
  sorucevap: {
    textFields: ['soru', 'cevap'],
    titleField: 'soru',
    metadataFields: ['kategori', 'tarih'],
    chunkSize: 1000
  },
  makaleler: {
    textField: 'icerik',
    titleField: 'baslik',
    metadataFields: ['baslik', 'yazar', 'yayin_tarihi', 'dergi'],
    chunkSize: 3000
  },
  ozelgeler: {
    textField: 'metin',
    titleField: 'ozelge_no',
    metadataFields: ['ozelge_no', 'tarih', 'konu', 'kurum'],
    chunkSize: 2000
  }
};

// Database connections
const sourceDB = new Client({
  connectionString: process.env.SOURCE_DB || 'postgresql://postgres:password@localhost:5432/rag_chatbot'
});

const targetDB = new Client({
  connectionString: process.env.TARGET_DB || 'postgresql://postgres:password@localhost:5432/asemb'
});

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Progress bar
const progressBar = new cliProgress.SingleBar({
  format: 'Migration Progress |{bar}| {percentage}% | {value}/{total} Records | ETA: {eta}s',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

// Chunk text for better embeddings
function chunkText(text, maxChunkSize = 1000, overlap = 200) {
  const chunks = [];
  if (text.length <= maxChunkSize) {
    return [text];
  }
  
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChunkSize, text.length);
    chunks.push(text.substring(start, end));
    start += maxChunkSize - overlap;
  }
  
  return chunks;
}

// Generate embedding with retry logic
async function generateEmbedding(text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000) // OpenAI limit
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error(`Embedding attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Migrate a single table
async function migrateTable(tableName) {
  const config = CONFIG[tableName];
  if (!config) {
    console.error(`No configuration found for table: ${tableName}`);
    return;
  }

  console.log(`\n📊 Starting migration for table: ${tableName}`);
  
  try {
    // Get total count
    const countResult = await sourceDB.query(`SELECT COUNT(*) FROM ${tableName}`);
    const totalRecords = parseInt(countResult.rows[0].count);
    console.log(`📝 Found ${totalRecords} records to migrate`);
    
    if (totalRecords === 0) {
      console.log('⚠️  No records found in source table');
      return;
    }

    // Start progress bar
    progressBar.start(totalRecords, 0);
    
    // Process in batches
    const batchSize = 10;
    let offset = 0;
    let migrated = 0;
    
    while (offset < totalRecords) {
      const query = `SELECT * FROM ${tableName} LIMIT ${batchSize} OFFSET ${offset}`;
      const result = await sourceDB.query(query);
      
      for (const row of result.rows) {
        try {
          // Prepare text content
          let content = '';
          if (config.textFields) {
            // Multiple text fields (sorucevap)
            content = config.textFields
              .map(field => row[field] || '')
              .filter(text => text)
              .join(' | ');
          } else {
            // Single text field
            content = row[config.textField] || '';
          }
          
          if (!content) {
            console.log(`\n⚠️  Skipping record ${row.id}: No text content`);
            migrated++;
            progressBar.update(migrated);
            continue;
          }
          
          // Prepare metadata
          const metadata = {};
          config.metadataFields.forEach(field => {
            if (row[field] !== null && row[field] !== undefined) {
              metadata[field] = row[field];
            }
          });
          
          // Chunk text if needed
          const chunks = chunkText(content, config.chunkSize || 1000);
          
          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const chunk = chunks[chunkIndex];
            
            // Generate embedding
            const embedding = await generateEmbedding(chunk);
            
            // Prepare title
            const title = row[config.titleField] || `${tableName}_${row.id}`;
            const chunkTitle = chunks.length > 1 ? `${title} (Part ${chunkIndex + 1}/${chunks.length})` : title;
            
            // Insert into target database
            const insertQuery = `
              INSERT INTO rag_data.documents 
              (source_table, source_id, title, content, metadata, embedding, indexed_at)
              VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `;
            
            await targetDB.query(insertQuery, [
              tableName,
              row.id,
              chunkTitle,
              chunk,
              JSON.stringify({...metadata, chunk_index: chunkIndex, total_chunks: chunks.length}),
              `[${embedding.join(',')}]`
            ]);
          }
          
          migrated++;
          progressBar.update(migrated);
          
        } catch (error) {
          console.error(`\n❌ Error processing record ${row.id}:`, error.message);
        }
      }
      
      offset += batchSize;
    }
    
    progressBar.stop();
    console.log(`✅ Successfully migrated ${migrated} records from ${tableName}`);
    
  } catch (error) {
    progressBar.stop();
    console.error(`❌ Migration failed for ${tableName}:`, error);
    throw error;
  }
}

// Main migration function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const tableIndex = args.indexOf('--table');
  const tableName = tableIndex !== -1 ? args[tableIndex + 1] : null;
  
  try {
    console.log('🚀 RAG Data Migration Tool');
    console.log('==========================\n');
    
    // Connect to databases
    console.log('📡 Connecting to databases...');
    await sourceDB.connect();
    console.log('✅ Connected to source database (rag_chatbot)');
    
    await targetDB.connect();
    console.log('✅ Connected to target database (asemb)');
    
    // Ensure schema and table exist
    console.log('\n📦 Setting up target schema...');
    await targetDB.query('CREATE SCHEMA IF NOT EXISTS rag_data');
    await targetDB.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    await targetDB.query(`
      CREATE TABLE IF NOT EXISTS rag_data.documents (
        id SERIAL PRIMARY KEY,
        source_table VARCHAR(50),
        source_id INTEGER,
        title TEXT,
        content TEXT,
        metadata JSONB,
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT NOW(),
        indexed_at TIMESTAMP
      )
    `);
    
    // Create indexes
    await targetDB.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_embedding 
      ON rag_data.documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
    
    await targetDB.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_metadata 
      ON rag_data.documents USING gin (metadata)
    `);
    
    console.log('✅ Target schema ready');
    
    // Migrate tables
    if (tableName) {
      // Migrate specific table
      await migrateTable(tableName);
    } else {
      // Migrate all tables
      const tables = ['danistaykararlari', 'sorucevap', 'makaleler', 'ozelgeler'];
      for (const table of tables) {
        await migrateTable(table);
      }
    }
    
    // Show summary
    console.log('\n📊 Migration Summary');
    console.log('===================');
    const summary = await targetDB.query(`
      SELECT source_table, COUNT(*) as count 
      FROM rag_data.documents 
      GROUP BY source_table 
      ORDER BY source_table
    `);
    
    console.table(summary.rows);
    
    const total = await targetDB.query('SELECT COUNT(*) as total FROM rag_data.documents');
    console.log(`\n🎉 Total documents migrated: ${total.rows[0].total}`);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sourceDB.end();
    await targetDB.end();
    console.log('\n👋 Migration complete!');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { migrateTable, generateEmbedding };
