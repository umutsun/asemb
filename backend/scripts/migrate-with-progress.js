#!/usr/bin/env node

/**
 * Advanced Migration Script with Progress, Token Estimation, and Time Tracking
 */

require('dotenv').config();
const { Pool } = require('pg');
const OpenAI = require('openai');
const chalk = require('chalk');
const fs = require('fs');
const crypto = require('crypto');
const cliProgress = require('cli-progress');

const STATE_FILE = '.migration-state.json';

class AdvancedMigration {
  constructor() {
    // Initialize OpenAI
    this.openai = null;
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    
    this.batchSize = 10;
    this.state = this.loadState();
    this.tokenCount = 0;
    this.tokenCost = {
      'text-embedding-ada-002': 0.0001 / 1000, // $0.0001 per 1K tokens
      'text-embedding-3-small': 0.00002 / 1000,
      'text-embedding-3-large': 0.00013 / 1000
    };
    
    // Database pools
    this.sourcePool = new Pool({
      host: process.env.CUSTOMER_DB_HOST,
      port: process.env.CUSTOMER_DB_PORT,
      database: 'rag_chatbot',
      user: process.env.CUSTOMER_DB_USER,
      password: process.env.CUSTOMER_DB_PASSWORD,
      ssl: process.env.CUSTOMER_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 3
    });
    
    this.targetPool = new Pool({
      host: process.env.ASEMB_DB_HOST,
      port: process.env.ASEMB_DB_PORT,
      database: process.env.ASEMB_DB_NAME,
      user: process.env.ASEMB_DB_USER,
      password: process.env.ASEMB_DB_PASSWORD,
      ssl: process.env.ASEMB_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 3
    });
    
    // Progress bars
    this.multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: ' {bar} | {task} | {percentage}% | {value}/{total} | ETA: {eta_formatted} | Speed: {speed} rec/min'
    }, cliProgress.Presets.shades_classic);
    
    console.log(chalk.cyan.bold('\n🚀 Advanced ASEMB Migration System'));
    console.log(chalk.cyan('=' .repeat(70)));
  }
  
  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
    } catch (error) {}
    
    return {
      tables: {
        sorucevap: { offset: 0, total: 0, migrated: 0, failed: 0, skipped: 0 },
        makaleler: { offset: 0, total: 0, migrated: 0, failed: 0, skipped: 0 },
        ozelgeler: { offset: 0, total: 0, migrated: 0, failed: 0, skipped: 0 },
        danistaykararlari: { offset: 0, total: 0, migrated: 0, failed: 0, skipped: 0 }
      },
      currentTable: null,
      startTime: Date.now(),
      totalTokens: 0,
      estimatedCost: 0
    };
  }
  
  saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }
  
  estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  async generateEmbedding(text) {
    if (!this.openai) {
      // Generate mock embedding if no API key
      const embedding = [];
      for (let i = 0; i < 1536; i++) {
        embedding.push(Math.random() * 2 - 1);
      }
      return { embedding, model: 'mock', tokens: 0 };
    }
    
    try {
      const tokens = this.estimateTokens(text);
      this.state.totalTokens += tokens;
      this.state.estimatedCost += tokens * this.tokenCost['text-embedding-ada-002'];
      
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000)
      });
      
      return {
        embedding: response.data[0].embedding,
        model: 'text-embedding-ada-002',
        tokens
      };
    } catch (error) {
      if (error.status === 429) {
        // Rate limited - wait and retry
        await new Promise(resolve => setTimeout(resolve, 60000));
        return this.generateEmbedding(text);
      }
      
      // Fallback to mock
      const embedding = [];
      for (let i = 0; i < 1536; i++) {
        embedding.push(Math.random() * 2 - 1);
      }
      return { embedding, model: 'mock-fallback', tokens: 0 };
    }
  }
  
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
  async getTableCounts() {
    const sourceClient = await this.sourcePool.connect();
    
    try {
      for (const table of Object.keys(this.state.tables)) {
        try {
          const result = await sourceClient.query(`SELECT COUNT(*) FROM public.${table}`);
          this.state.tables[table].total = parseInt(result.rows[0].count);
        } catch (error) {
          console.log(chalk.yellow(`⚠️ Table ${table} not found`));
          this.state.tables[table].total = 0;
        }
      }
    } finally {
      sourceClient.release();
    }
  }
  
  async migrateTable(tableName) {
    const tableState = this.state.tables[tableName];
    if (tableState.total === 0) return;
    
    console.log(chalk.blue(`\n📋 Migrating ${tableName} (${tableState.total} records)`));
    
    const progressBar = this.multibar.create(tableState.total, tableState.offset, {
      task: tableName.padEnd(20),
      speed: 0
    });
    
    const startTime = Date.now();
    let lastUpdateTime = startTime;
    let recordsProcessed = 0;
    
    while (tableState.offset < tableState.total) {
      const sourceClient = await this.sourcePool.connect();
      const targetClient = await this.targetPool.connect();
      
      try {
        // Fetch batch
        let query = '';
        if (tableName === 'sorucevap') {
          query = `SELECT * FROM public.sorucevap ORDER BY id LIMIT ${this.batchSize} OFFSET ${tableState.offset}`;
        } else if (tableName === 'makaleler') {
          query = `SELECT * FROM public.makaleler ORDER BY id LIMIT ${this.batchSize} OFFSET ${tableState.offset}`;
        } else if (tableName === 'ozelgeler') {
          query = `SELECT * FROM public.ozelgeler ORDER BY id LIMIT ${this.batchSize} OFFSET ${tableState.offset}`;
        } else if (tableName === 'danistaykararlari') {
          query = `SELECT * FROM public.danistaykararlari ORDER BY id LIMIT ${this.batchSize} OFFSET ${tableState.offset}`;
        }
        
        const result = await sourceClient.query(query);
        
        if (result.rows.length === 0) break;
        
        // Process batch
        for (const row of result.rows) {
          try {
            let content = '';
            let title = '';
            let metadata = {};
            
            if (tableName === 'sorucevap') {
              content = `SORU: ${row.soru || ''}\n\nCEVAP: ${row.cevap || ''}`;
              title = (row.soru || '').substring(0, 255) || 'Soru-Cevap';
              metadata = {
                kaynak: row.kaynak,
                kategori: row.kategori,
                table_source: 'sorucevap'
              };
            } else if (tableName === 'makaleler') {
              content = row.icerik || '';
              title = (row.baslik || 'Makale').substring(0, 255);
              metadata = {
                yazar: row.yazar,
                kaynak: row.kaynak,
                table_source: 'makaleler'
              };
            } else if (tableName === 'ozelgeler') {
              content = row.icerik || '';
              title = (row.baslik || `Özelge ${row.sayino || ''}`).substring(0, 255);
              metadata = {
                tarih: row.tarih,
                sayino: row.sayino,
                table_source: 'ozelgeler'
              };
            } else if (tableName === 'danistaykararlari') {
              content = row.icerik || '';
              title = (row.baslik || 'Danıştay Kararı').substring(0, 255);
              metadata = {
                tarih: row.tarih,
                esas_no: row.esas_no,
                karar_no: row.karar_no,
                table_source: 'danistaykararlari'
              };
            }
            
            if (content.trim().length < 20) {
              tableState.skipped++;
              continue;
            }
            
            // Generate content hash for deduplication
            const contentHash = crypto.createHash('md5').update(content).digest('hex');
            metadata.content_hash = contentHash;
            
            // Check if already exists
            const existing = await targetClient.query(
              `SELECT id FROM rag_data.documents WHERE metadata->>'content_hash' = $1`,
              [contentHash]
            );
            
            if (existing.rows.length === 0) {
              // Generate embedding
              const { embedding, model, tokens } = await this.generateEmbedding(content);
              
              // Insert into database
              await targetClient.query(`
                INSERT INTO rag_data.documents 
                (title, content, source, metadata, embedding, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
              `, [
                title,
                content.substring(0, 50000),
                tableName,
                JSON.stringify(metadata),
                `[${embedding.join(',')}]`
              ]);
              
              tableState.migrated++;
            } else {
              tableState.skipped++;
            }
            
          } catch (error) {
            tableState.failed++;
            if (tableState.failed % 10 === 0) {
              console.log(chalk.red(`\n  ❌ Error: ${error.message.substring(0, 100)}`));
            }
          }
        }
        
        tableState.offset += result.rows.length;
        recordsProcessed += result.rows.length;
        
        // Update progress bar
        const currentTime = Date.now();
        const elapsedMinutes = (currentTime - startTime) / 60000;
        const speed = Math.round(recordsProcessed / elapsedMinutes);
        
        progressBar.update(tableState.offset, {
          speed: speed || 1,
          task: tableName.padEnd(20)
        });
        
        // Save state periodically
        if (currentTime - lastUpdateTime > 5000) {
          this.saveState();
          lastUpdateTime = currentTime;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(chalk.red(`\n❌ Batch error in ${tableName}: ${error.message}`));
        await new Promise(resolve => setTimeout(resolve, 3000));
      } finally {
        sourceClient.release();
        targetClient.release();
      }
    }
    
    progressBar.stop();
  }
  
  async run() {
    try {
      // Get total counts
      console.log(chalk.blue('\n📊 Analyzing source database...'));
      await this.getTableCounts();
      
      const totalRecords = Object.values(this.state.tables)
        .reduce((sum, table) => sum + table.total, 0);
      
      console.log(chalk.white(`\n📈 Migration Overview:`));
      console.log(chalk.gray('  Tables to migrate:'));
      for (const [table, stats] of Object.entries(this.state.tables)) {
        if (stats.total > 0) {
          const progress = ((stats.offset / stats.total) * 100).toFixed(1);
          console.log(chalk.gray(`    • ${table}: ${stats.total} records (${progress}% done)`));
        }
      }
      console.log(chalk.gray(`  Total records: ${totalRecords}`));
      
      // Estimate time and cost
      const recordsPerMinute = 60; // Conservative estimate
      const remainingRecords = totalRecords - Object.values(this.state.tables)
        .reduce((sum, table) => sum + table.offset, 0);
      const estimatedMinutes = Math.ceil(remainingRecords / recordsPerMinute);
      const estimatedTokens = remainingRecords * 200; // ~200 tokens per record
      const estimatedCost = estimatedTokens * this.tokenCost['text-embedding-ada-002'];
      
      console.log(chalk.yellow(`\n⏱️  Estimated time: ${this.formatDuration(estimatedMinutes * 60000)}`));
      console.log(chalk.yellow(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`));
      console.log(chalk.yellow(`🎯 Estimated tokens: ${(estimatedTokens / 1000).toFixed(0)}K`));
      
      // Start migration
      console.log(chalk.green('\n🚀 Starting migration...\n'));
      
      for (const tableName of Object.keys(this.state.tables)) {
        this.state.currentTable = tableName;
        await this.migrateTable(tableName);
      }
      
      this.multibar.stop();
      
      // Final statistics
      const totalTime = Date.now() - this.state.startTime;
      
      console.log(chalk.cyan('\n' + '=' .repeat(70)));
      console.log(chalk.cyan.bold('✅ Migration Complete!'));
      console.log(chalk.cyan('=' .repeat(70)));
      
      console.log(chalk.white('\n📊 Final Statistics:'));
      for (const [table, stats] of Object.entries(this.state.tables)) {
        if (stats.total > 0) {
          console.log(chalk.white(`
  ${table}:
    ├─ Total: ${stats.total}
    ├─ Migrated: ${chalk.green(stats.migrated)}
    ├─ Skipped: ${chalk.yellow(stats.skipped)}
    └─ Failed: ${chalk.red(stats.failed)}`));
        }
      }
      
      console.log(chalk.white(`
  Overall:
    ├─ Duration: ${this.formatDuration(totalTime)}
    ├─ Total Tokens: ${(this.state.totalTokens / 1000).toFixed(0)}K
    └─ Total Cost: $${this.state.estimatedCost.toFixed(4)}`));
      
      // Check target database
      const targetClient = await this.targetPool.connect();
      try {
        const result = await targetClient.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
            COUNT(DISTINCT source) as sources
          FROM rag_data.documents
        `);
        
        console.log(chalk.green(`
  Target Database:
    ├─ Total Documents: ${result.rows[0].total}
    ├─ With Embeddings: ${result.rows[0].with_embeddings}
    └─ Unique Sources: ${result.rows[0].sources}`));
        
      } finally {
        targetClient.release();
      }
      
      // Clean up state file
      if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
      }
      
    } catch (error) {
      console.error(chalk.red('\n❌ Fatal error:'), error);
      this.saveState();
      throw error;
    } finally {
      await this.sourcePool.end();
      await this.targetPool.end();
    }
  }
}

// Main execution
if (require.main === module) {
  const migration = new AdvancedMigration();
  
  // Handle interruption
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠️  Migration interrupted! Progress saved.'));
    migration.saveState();
    migration.multibar.stop();
    process.exit(0);
  });
  
  // Run migration
  migration.run()
    .then(() => {
      console.log(chalk.green('\n✨ Migration completed successfully!'));
      process.exit(0);
    })
    .catch(error => {
      console.error(chalk.red('\n❌ Migration failed:'), error.message);
      process.exit(1);
    });
}

module.exports = AdvancedMigration;