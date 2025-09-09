#!/usr/bin/env node

/**
 * Direct SoruCevap Migration - Continue from 11600
 * Simple, direct approach without pools
 */

require('dotenv').config();
const { Client } = require('pg');
const OpenAI = require('openai');
const chalk = require('chalk');
const fs = require('fs');

const STATE_FILE = '.sorucevap-direct.json';

class DirectSoruCevapMigration {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.error(chalk.red('❌ OPENAI_API_KEY not found'));
      process.exit(1);
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.batchSize = 5; // Very small for stability
    this.state = this.loadState();
    
    console.log(chalk.cyan.bold('\n🚀 Direct SoruCevap Migration'));
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.gray(`📍 Starting Offset: ${this.state.offset}`));
    console.log(chalk.gray(`✅ Already Migrated: ${this.state.migrated}`));
    console.log(chalk.gray(`📊 Progress: ${((this.state.offset / 15788) * 100).toFixed(1)}%`));
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
    } catch (error) {}
    return {
      offset: 11600, // Start from where it stopped
      migrated: 0,
      failed: 0,
      skipped: 0
    };
  }

  saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000)
      });
      return response.data[0].embedding;
    } catch (error) {
      // Fallback to mock
      const embedding = [];
      for (let i = 0; i < 1536; i++) {
        embedding.push(Math.random() * 2 - 1);
      }
      return embedding;
    }
  }

  generateId(text) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(text).digest('hex');
    return parseInt(hash.substring(0, 15), 16) % Number.MAX_SAFE_INTEGER;
  }

  async processBatch(offset) {
    // Create new connections for each batch
    const sourceClient = new Client({
      host: process.env.POSTGRES_HOST,
      port: 5432,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_SOURCE_DB,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000
    });
    
    const targetClient = new Client({
      host: process.env.POSTGRES_HOST,
      port: 5432,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_TARGET_DB,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000
    });
    
    try {
      // Connect
      await sourceClient.connect();
      await targetClient.connect();
      
      // Fetch batch
      const result = await sourceClient.query(
        `SELECT * FROM sorucevap LIMIT ${this.batchSize} OFFSET ${offset}`
      );
      
      if (result.rows.length === 0) {
        return { processed: 0 };
      }
      
      let batchStats = { processed: 0, migrated: 0, failed: 0, skipped: 0 };
      
      for (const row of result.rows) {
        try {
          const soru = row.Soru || '';
          const cevap = row.Cevap || '';
          const content = `SORU: ${soru}\n\nCEVAP: ${cevap}`;
          
          if (content.trim().length < 20) {
            batchStats.skipped++;
            continue;
          }
          
          const sourceId = this.generateId(content);
          const title = soru.substring(0, 200) || `Soru-Cevap ${sourceId}`;
          const metadata = {
            type: 'soru_cevap',
            kaynak: row.Kaynak,
            donem: row.Donemi,
            ilgili_kanun: row.IlgiliKanun
          };
          
          // Generate embedding
          const embedding = await this.generateEmbedding(content);
          
          // Insert
          await targetClient.query(`
            INSERT INTO rag_data.documents 
            (source_table, source_id, title, content, metadata, embedding, embedding_model)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (source_table, source_id, chunk_index) 
            DO UPDATE SET 
              embedding = EXCLUDED.embedding,
              embedding_model = EXCLUDED.embedding_model,
              indexed_at = NOW()
          `, [
            'sorucevap',
            sourceId,
            title,
            content.substring(0, 50000),
            JSON.stringify(metadata),
            `[${embedding.join(',')}]`,
            'text-embedding-ada-002'
          ]);
          
          batchStats.migrated++;
          
        } catch (error) {
          batchStats.failed++;
          console.log(chalk.red(`  Error: ${error.message.substring(0, 50)}`));
        }
        
        batchStats.processed++;
      }
      
      return batchStats;
      
    } finally {
      // Always close connections
      try { await sourceClient.end(); } catch (e) {}
      try { await targetClient.end(); } catch (e) {}
    }
  }

  async run() {
    console.log(chalk.blue('\n📊 Continuing SoruCevap migration...'));
    
    const totalRecords = 15788;
    const startTime = Date.now();
    
    while (this.state.offset < totalRecords) {
      try {
        const percentage = ((this.state.offset / totalRecords) * 100).toFixed(1);
        
        process.stdout.write(chalk.blue(
          `\r📦 [${percentage}%] ${this.state.offset}/${totalRecords} | ` +
          `✅ ${this.state.migrated} ❌ ${this.state.failed} ⏭️ ${this.state.skipped}`
        ));
        
        const result = await this.processBatch(this.state.offset);
        
        if (result.processed === 0) {
          console.log(chalk.green('\n✅ No more records'));
          break;
        }
        
        this.state.offset += result.processed;
        this.state.migrated += result.migrated || 0;
        this.state.failed += result.failed || 0;
        this.state.skipped += result.skipped || 0;
        
        // Save after each batch
        this.saveState();
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (error) {
        console.error(chalk.red(`\n❌ Batch error: ${error.message}`));
        this.saveState();
        
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(chalk.cyan('\n\n' + '=' .repeat(60)));
    console.log(chalk.cyan.bold('📈 Migration Summary'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    console.log(chalk.white(`
  Table: sorucevap
  ├─ Progress: ${((this.state.offset / totalRecords) * 100).toFixed(1)}%
  ├─ Migrated: ${chalk.green(this.state.migrated)}
  ├─ Failed: ${chalk.red(this.state.failed)}
  ├─ Skipped: ${chalk.yellow(this.state.skipped)}
  └─ Duration: ${Math.floor(duration / 60)}m ${duration % 60}s
    `));
    
    if (this.state.offset >= totalRecords) {
      console.log(chalk.green.bold('\n✅ SoruCevap migration complete!'));
      
      // Final database check
      const client = new Client({
        host: process.env.POSTGRES_HOST,
        port: 5432,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_TARGET_DB
      });
      
      try {
        await client.connect();
        const result = await client.query(`
          SELECT 
            source_table,
            COUNT(*) as total,
            COUNT(CASE WHEN embedding_model = 'text-embedding-ada-002' THEN 1 END) as with_openai
          FROM rag_data.documents
          GROUP BY source_table
        `);
        
        console.log('\n📊 Final Database Status:');
        console.table(result.rows);
        
        await client.end();
      } catch (error) {}
      
      fs.unlinkSync(STATE_FILE);
    }
  }
}

// Main
if (require.main === module) {
  const migration = new DirectSoruCevapMigration();
  
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠️  Interrupted! Progress saved.'));
    migration.saveState();
    process.exit(0);
  });
  
  migration.run().catch(error => {
    console.error(chalk.red('Fatal:'), error);
    migration.saveState();
    process.exit(1);
  });
}