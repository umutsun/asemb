#!/usr/bin/env node

/**
 * RAG Chatbot to ASEMB Migration Script
 * Migrates data from rag_chatbot database to asemb with embeddings
 * Author: Claude Code
 */

require('dotenv').config();
const { Client } = require('pg');
const OpenAI = require('openai');
const cliProgress = require('cli-progress');
const chalk = require('chalk');

// Configuration for each table
const TABLE_CONFIGS = {
  danistaykararlari: {
    displayName: 'Danıştay Kararları',
    textField: 'metin',
    titleField: 'karar_no',
    metadataFields: ['karar_no', 'karar_tarihi', 'daire', 'konu'],
    chunkSize: 2000,
    chunkOverlap: 200
  },
  sorucevap: {
    displayName: 'Soru-Cevap',
    textFields: ['soru', 'cevap'], // Multiple fields
    titleField: 'soru',
    metadataFields: ['kategori', 'tarih'],
    chunkSize: 1000,
    chunkOverlap: 100,
    combineFields: true // Combine soru and cevap
  },
  makaleler: {
    displayName: 'Makaleler',
    textField: 'icerik',
    titleField: 'baslik',
    metadataFields: ['baslik', 'yazar', 'yayin_tarihi', 'dergi'],
    chunkSize: 3000,
    chunkOverlap: 300
  },
  ozelgeler: {
    displayName: 'Özelgeler',
    textField: 'metin',
    titleField: 'ozelge_no',
    metadataFields: ['ozelge_no', 'tarih', 'konu', 'kurum'],
    chunkSize: 2000,
    chunkOverlap: 200
  }
};

class RAGMigration {
  constructor() {
    this.sourceDB = new Client({
      connectionString: process.env.SOURCE_DB || 'postgresql://postgres:password@localhost:5432/rag_chatbot'
    });
    
    this.targetDB = new Client({
      connectionString: process.env.TARGET_DB || 'postgresql://postgres:password@localhost:5432/asemb'
    });
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.progressBar = new cliProgress.SingleBar({
      format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} | {table} | ETA: {eta}s',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    
    this.stats = {
      total: 0,
      migrated: 0,
      failed: 0,
      chunks: 0,
      tokensUsed: 0
    };
  }

  // Connect to databases
  async connect() {
    console.log(chalk.blue('📡 Connecting to databases...'));
    
    try {
      await this.sourceDB.connect();
      console.log(chalk.green('✅ Connected to source database (rag_chatbot)'));
      
      await this.targetDB.connect();
      console.log(chalk.green('✅ Connected to target database (asemb)'));
      
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Database connection failed:'), error.message);
      return false;
    }
  }

  // Setup target database schema
  async setupTargetSchema() {
    console.log(chalk.blue('\n📦 Setting up target schema...'));
    
    try {
      // Create extension
      await this.targetDB.query('CREATE EXTENSION IF NOT EXISTS vector');
      
      // Create schema
      await this.targetDB.query('CREATE SCHEMA IF NOT EXISTS rag_data');
      
      // Create table
      await this.targetDB.query(`
        CREATE TABLE IF NOT EXISTS rag_data.documents (
          id SERIAL PRIMARY KEY,
          source_table VARCHAR(50),
          source_id INTEGER,
          title TEXT,
          content TEXT,
          metadata JSONB,
          embedding vector(1536),
          chunk_index INTEGER DEFAULT 0,
          total_chunks INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT NOW(),
          indexed_at TIMESTAMP
        )
      `);
      
      // Create indexes
      await this.targetDB.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_embedding 
        ON rag_data.documents USING ivfflat (embedding vector_cosine_ops) 
        WITH (lists = 100)
      `);
      
      await this.targetDB.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_metadata 
        ON rag_data.documents USING gin (metadata)
      `);
      
      await this.targetDB.query(`
        CREATE INDEX IF NOT EXISTS idx_rag_source 
        ON rag_data.documents (source_table, source_id)
      `);
      
      console.log(chalk.green('✅ Target schema ready'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Schema setup failed:'), error.message);
      return false;
    }
  }

  // Check source tables
  async checkSourceTables() {
    console.log(chalk.blue('\n🔍 Checking source tables...'));
    
    const results = {};
    for (const [table, config] of Object.entries(TABLE_CONFIGS)) {
      try {
        const result = await this.sourceDB.query(`SELECT COUNT(*) FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        results[table] = count;
        console.log(chalk.gray(`  ${config.displayName}: ${count} records`));
      } catch (error) {
        console.log(chalk.yellow(`  ${config.displayName}: Table not found`));
        results[table] = 0;
      }
    }
    
    return results;
  }

  // Chunk text for better embeddings
  chunkText(text, chunkSize = 1000, overlap = 100) {
    if (!text || text.length <= chunkSize) {
      return [text || ''];
    }
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start += chunkSize - overlap;
    }
    
    return chunks;
  }

  // Generate embedding with retry
  async generateEmbedding(text, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        // Truncate to OpenAI limit
        const truncatedText = text.substring(0, 8000);
        
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: truncatedText
        });
        
        this.stats.tokensUsed += truncatedText.length / 4; // Approximate tokens
        return response.data[0].embedding;
        
      } catch (error) {
        console.log(chalk.yellow(`\n⚠️  Embedding attempt ${i + 1} failed: ${error.message}`));
        
        if (i === retries - 1) throw error;
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
  }

  // Migrate a single table
  async migrateTable(tableName) {
    const config = TABLE_CONFIGS[tableName];
    if (!config) {
      console.error(chalk.red(`❌ No configuration for table: ${tableName}`));
      return false;
    }
    
    console.log(chalk.blue(`\n📊 Migrating ${config.displayName}...`));
    
    try {
      // Get total count
      const countResult = await this.sourceDB.query(`SELECT COUNT(*) FROM ${tableName}`);
      const totalRecords = parseInt(countResult.rows[0].count);
      
      if (totalRecords === 0) {
        console.log(chalk.yellow('⚠️  No records to migrate'));
        return true;
      }
      
      console.log(chalk.gray(`  Total records: ${totalRecords}`));
      
      // Start progress bar
      this.progressBar.start(totalRecords, 0, { table: config.displayName });
      
      // Process in batches
      const batchSize = 5; // Small batch to avoid memory issues
      let offset = 0;
      let migrated = 0;
      
      while (offset < totalRecords) {
        const query = `SELECT * FROM ${tableName} ORDER BY id LIMIT ${batchSize} OFFSET ${offset}`;
        const result = await this.sourceDB.query(query);
        
        for (const row of result.rows) {
          try {
            // Prepare text content
            let content = '';
            
            if (config.textFields) {
              // Multiple fields (e.g., sorucevap)
              content = config.textFields
                .map(field => row[field] || '')
                .filter(text => text)
                .join('\n\n--- --- ---\n\n');
            } else {
              // Single field
              content = row[config.textField] || '';
            }
            
            if (!content) {
              migrated++;
              this.progressBar.update(migrated);
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
            const chunks = this.chunkText(content, config.chunkSize, config.chunkOverlap);
            
            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
              const chunk = chunks[chunkIndex];
              
              // Generate embedding
              const embedding = await this.generateEmbedding(chunk);
              
              // Prepare title
              const title = row[config.titleField] || `${tableName}_${row.id}`;
              const chunkTitle = chunks.length > 1 
                ? `${title} (Part ${chunkIndex + 1}/${chunks.length})`
                : title;
              
              // Insert into target
              const insertQuery = `
                INSERT INTO rag_data.documents 
                (source_table, source_id, title, content, metadata, embedding, chunk_index, total_chunks, indexed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              `;
              
              await this.targetDB.query(insertQuery, [
                tableName,
                row.id,
                chunkTitle,
                chunk,
                JSON.stringify(metadata),
                `[${embedding.join(',')}]`,
                chunkIndex,
                chunks.length
              ]);
              
              this.stats.chunks++;
            }
            
            migrated++;
            this.stats.migrated++;
            this.progressBar.update(migrated);
            
          } catch (error) {
            this.stats.failed++;
            console.error(chalk.red(`\n❌ Failed record ${row.id}:`), error.message);
          }
        }
        
        offset += batchSize;
      }
      
      this.progressBar.stop();
      console.log(chalk.green(`✅ Migrated ${migrated} records (${this.stats.chunks} chunks)`));
      return true;
      
    } catch (error) {
      this.progressBar.stop();
      console.error(chalk.red(`❌ Migration failed:`), error);
      return false;
    }
  }

  // Verify migration
  async verifyMigration() {
    console.log(chalk.blue('\n🔍 Verifying migration...'));
    
    const result = await this.targetDB.query(`
      SELECT 
        source_table,
        COUNT(DISTINCT source_id) as unique_records,
        COUNT(*) as total_chunks,
        MAX(chunk_index) + 1 as max_chunks_per_record
      FROM rag_data.documents
      GROUP BY source_table
      ORDER BY source_table
    `);
    
    console.log(chalk.green('\n📊 Migration Results:'));
    console.table(result.rows);
    
    const totalResult = await this.targetDB.query('SELECT COUNT(*) FROM rag_data.documents');
    console.log(chalk.green(`\n✅ Total documents in database: ${totalResult.rows[0].count}`));
    
    // Test vector search
    console.log(chalk.blue('\n🔍 Testing vector search...'));
    const testResult = await this.targetDB.query(`
      SELECT title, substring(content, 1, 100) as content_preview
      FROM rag_data.documents
      ORDER BY embedding <-> (
        SELECT embedding FROM rag_data.documents LIMIT 1
      )
      LIMIT 3
    `);
    
    console.log(chalk.green('✅ Vector search working. Sample results:'));
    testResult.rows.forEach(row => {
      console.log(chalk.gray(`  - ${row.title}: ${row.content_preview}...`));
    });
  }

  // Main execution
  async run(tableName = null) {
    console.log(chalk.cyan.bold('\n🚀 RAG Chatbot to ASEMB Migration Tool'));
    console.log(chalk.cyan('=' .repeat(50)));
    
    // Connect to databases
    if (!await this.connect()) {
      process.exit(1);
    }
    
    // Setup target schema
    if (!await this.setupTargetSchema()) {
      process.exit(1);
    }
    
    // Check source tables
    const tableCounts = await this.checkSourceTables();
    
    // Calculate total
    this.stats.total = Object.values(tableCounts).reduce((a, b) => a + b, 0);
    console.log(chalk.blue(`\n📊 Total records to migrate: ${this.stats.total}`));
    
    // Migrate tables
    const startTime = Date.now();
    
    if (tableName) {
      // Migrate specific table
      if (!TABLE_CONFIGS[tableName]) {
        console.error(chalk.red(`❌ Unknown table: ${tableName}`));
        process.exit(1);
      }
      await this.migrateTable(tableName);
    } else {
      // Migrate all tables
      for (const table of Object.keys(TABLE_CONFIGS)) {
        if (tableCounts[table] > 0) {
          await this.migrateTable(table);
        }
      }
    }
    
    // Calculate time and tokens
    const duration = Math.round((Date.now() - startTime) / 1000);
    const estimatedCost = (this.stats.tokensUsed / 1000) * 0.0001; // Ada-002 pricing
    
    // Show summary
    console.log(chalk.cyan('\n' + '=' .repeat(50)));
    console.log(chalk.cyan.bold('📈 Migration Summary'));
    console.log(chalk.cyan('=' .repeat(50)));
    
    console.log(chalk.white(`
  Total Records:     ${this.stats.total}
  Migrated:         ${this.stats.migrated} ${chalk.green('✅')}
  Failed:           ${this.stats.failed} ${this.stats.failed > 0 ? chalk.red('❌') : ''}
  Total Chunks:     ${this.stats.chunks}
  Tokens Used:      ~${Math.round(this.stats.tokensUsed)}
  Estimated Cost:   ~$${estimatedCost.toFixed(2)}
  Duration:         ${duration} seconds
    `));
    
    // Verify if requested
    const args = process.argv.slice(2);
    if (args.includes('--verify')) {
      await this.verifyMigration();
    }
    
    // Cleanup
    await this.sourceDB.end();
    await this.targetDB.end();
    
    console.log(chalk.green.bold('\n🎉 Migration Complete!'));
    
    // Update Redis with completion status
    console.log(chalk.blue('\n📡 Updating Redis status...'));
    const redis = require('redis').createClient();
    await redis.connect();
    await redis.set('asb:rag:migration:status', JSON.stringify({
      status: 'completed',
      timestamp: new Date().toISOString(),
      stats: this.stats,
      duration: duration,
      estimatedCost: estimatedCost
    }));
    await redis.disconnect();
    console.log(chalk.green('✅ Redis updated'));
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const tableIndex = args.indexOf('--table');
  const tableName = tableIndex !== -1 ? args[tableIndex + 1] : null;
  
  // Check mode
  if (args.includes('--check')) {
    // Just check tables
    const migration = new RAGMigration();
    migration.connect().then(() => {
      migration.checkSourceTables().then(() => {
        migration.sourceDB.end();
        migration.targetDB.end();
      });
    });
  } else if (args.includes('--help')) {
    // Show help
    console.log(chalk.cyan(`
RAG Chatbot to ASEMB Migration Tool

Usage:
  node migrate-rag-embeddings.js [options]

Options:
  --table <name>    Migrate specific table only
  --check          Check source tables without migrating
  --verify         Verify migration after completion
  --help           Show this help message

Tables:
  danistaykararlari  Danıştay kararları
  sorucevap         Soru-cevap çiftleri
  makaleler         Makaleler
  ozelgeler         Özelgeler

Examples:
  node migrate-rag-embeddings.js                    # Migrate all tables
  node migrate-rag-embeddings.js --table makaleler  # Migrate specific table
  node migrate-rag-embeddings.js --check           # Check tables only
  node migrate-rag-embeddings.js --verify          # Migrate and verify
    `));
  } else {
    // Run migration
    const migration = new RAGMigration();
    migration.run(tableName).catch(console.error);
  }
}

module.exports = RAGMigration;
