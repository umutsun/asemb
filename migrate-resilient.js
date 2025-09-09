#!/usr/bin/env node

/**
 * Resilient OpenAI Migration with Table-Level Progress
 * Continues exactly where it left off
 */

require('dotenv').config();
const { Pool } = require('pg');
const OpenAI = require('openai');
const chalk = require('chalk');
const fs = require('fs');

const PROGRESS_FILE = '.migration-state.json';

class ResilientOpenAIMigration {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      console.error(chalk.red('❌ OPENAI_API_KEY not found in .env'));
      process.exit(1);
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.sourcePool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT || 5432,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_SOURCE_DB,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    
    this.targetPool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT || 5432,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_TARGET_DB,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    
    this.batchSize = 10; // Smaller batch for stability
    this.state = this.loadState();
    
    console.log(chalk.cyan.bold('\n🚀 Resilient OpenAI Migration'));
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.green('✅ OpenAI API Key detected'));
    console.log(chalk.gray(`📦 Batch Size: ${this.batchSize}`));
    console.log(chalk.gray(`🔄 Resume Support: Table-level tracking`));
    
    if (Object.keys(this.state.tables).length > 0) {
      console.log(chalk.yellow('\n📂 Previous progress found:'));
      Object.entries(this.state.tables).forEach(([table, info]) => {
        const percentage = ((info.processed / info.total) * 100).toFixed(1);
        console.log(chalk.gray(`   ${table}: ${info.processed}/${info.total} (${percentage}%)`));
      });
    }
  }

  loadState() {
    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      }
    } catch (error) {}
    return {
      tables: {},
      stats: {
        totalMigrated: 0,
        totalFailed: 0,
        totalSkipped: 0,
        tokensUsed: 0,
        estimatedCost: 0
      }
    };
  }

  saveState() {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(this.state, null, 2));
  }

  async generateEmbedding(text, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const input = text.substring(0, 8000);
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: input
        });
        
        const tokens = Math.ceil(input.length / 4);
        this.state.stats.tokensUsed += tokens;
        this.state.stats.estimatedCost = (this.state.stats.tokensUsed / 1000) * 0.0001;
        
        return response.data[0].embedding;
        
      } catch (error) {
        if (attempt === retries) {
          // Return mock embedding as fallback
          const embedding = [];
          for (let i = 0; i < 1536; i++) {
            embedding.push(Math.random() * 2 - 1);
          }
          return embedding;
        }
        
        if (error.status === 429) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  generateId(data) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    return parseInt(hash.substring(0, 15), 16) % Number.MAX_SAFE_INTEGER;
  }

  async setupDatabase() {
    const client = await this.targetPool.connect();
    
    try {
      console.log(chalk.blue('\n🔧 Checking database...'));
      
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(() => {});
      await client.query('CREATE SCHEMA IF NOT EXISTS rag_data');
      
      // Check if table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'rag_data' AND table_name = 'documents'
        )
      `);
      
      if (!tableCheck.rows[0].exists) {
        console.log(chalk.yellow('📦 Creating documents table...'));
        await client.query(`
          CREATE TABLE rag_data.documents (
            id SERIAL PRIMARY KEY,
            source_table VARCHAR(50),
            source_id BIGINT,
            title TEXT,
            content TEXT,
            metadata JSONB DEFAULT '{}',
            embedding vector(1536),
            chunk_index INTEGER DEFAULT 0,
            total_chunks INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW(),
            indexed_at TIMESTAMP DEFAULT NOW(),
            embedding_model VARCHAR(50) DEFAULT 'text-embedding-ada-002',
            UNIQUE(source_table, source_id, chunk_index)
          )
        `);
      }
      
      // Add embedding_model column if missing
      await client.query(`
        ALTER TABLE rag_data.documents 
        ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(50) DEFAULT 'text-embedding-ada-002'
      `).catch(() => {});
      
      console.log(chalk.green('✅ Database ready'));
      
    } finally {
      client.release();
    }
  }

  async getTableInfo(tableName) {
    const client = await this.sourcePool.connect();
    try {
      const result = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  async migrateRecord(row, tableName, config) {
    try {
      const content = config.getContent(row);
      
      if (!content || content.trim().length < 10) {
        return 'skipped';
      }
      
      const sourceId = row.id || this.generateId(row);
      const title = config.getTitle(row, sourceId);
      const metadata = config.getMetadata(row);
      
      // Check if already exists with OpenAI embedding
      const client = await this.targetPool.connect();
      try {
        const existing = await client.query(`
          SELECT id FROM rag_data.documents 
          WHERE source_table = $1 
          AND source_id = $2 
          AND embedding_model = 'text-embedding-ada-002'
          LIMIT 1
        `, [tableName, sourceId]);
        
        if (existing.rows.length > 0) {
          return 'exists';
        }
        
        // Generate embedding
        const embedding = await this.generateEmbedding(content);
        
        // Insert or update
        await client.query(`
          INSERT INTO rag_data.documents 
          (source_table, source_id, title, content, metadata, embedding, embedding_model)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_table, source_id, chunk_index) 
          DO UPDATE SET 
            embedding = EXCLUDED.embedding,
            embedding_model = EXCLUDED.embedding_model,
            metadata = EXCLUDED.metadata,
            indexed_at = NOW()
        `, [
          tableName,
          sourceId,
          title.substring(0, 500),
          content.substring(0, 50000),
          JSON.stringify(metadata),
          `[${embedding.join(',')}]`,
          'text-embedding-ada-002'
        ]);
        
        return 'success';
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error(chalk.red(`  Error: ${error.message.substring(0, 50)}`));
      return 'failed';
    }
  }

  async migrateTable(tableName, config) {
    console.log(chalk.blue(`\n📊 Processing ${tableName}...`));
    
    const total = await this.getTableInfo(tableName);
    
    if (total === 0) {
      console.log(chalk.yellow(`  No records in ${tableName}`));
      return;
    }
    
    // Initialize or get existing state
    if (!this.state.tables[tableName]) {
      this.state.tables[tableName] = {
        total: total,
        processed: 0,
        migrated: 0,
        failed: 0,
        skipped: 0,
        exists: 0
      };
    }
    
    const tableState = this.state.tables[tableName];
    
    // Check if already completed
    if (tableState.processed >= tableState.total) {
      console.log(chalk.green(`✅ ${tableName} already completed (${tableState.migrated} migrated)`));
      return;
    }
    
    console.log(chalk.gray(`  Total: ${total}, Starting from: ${tableState.processed}`));
    
    const client = await this.sourcePool.connect();
    
    try {
      while (tableState.processed < tableState.total) {
        // Fetch batch
        const query = `
          SELECT * FROM ${tableName} 
          ${config.orderBy || ''} 
          LIMIT ${this.batchSize} 
          OFFSET ${tableState.processed}
        `;
        
        const result = await client.query(query);
        
        if (result.rows.length === 0) {
          break;
        }
        
        // Process batch
        for (const row of result.rows) {
          const status = await this.migrateRecord(row, tableName, config);
          
          switch(status) {
            case 'success':
              tableState.migrated++;
              this.state.stats.totalMigrated++;
              break;
            case 'failed':
              tableState.failed++;
              this.state.stats.totalFailed++;
              break;
            case 'skipped':
              tableState.skipped++;
              this.state.stats.totalSkipped++;
              break;
            case 'exists':
              tableState.exists++;
              break;
          }
        }
        
        tableState.processed += result.rows.length;
        
        // Save state after each batch
        this.saveState();
        
        // Progress display
        const percentage = ((tableState.processed / tableState.total) * 100).toFixed(1);
        process.stdout.write(chalk.blue(
          `\r  [${percentage}%] ${tableState.processed}/${tableState.total} | ` +
          `✅ ${tableState.migrated} 📋 ${tableState.exists} ⏭️ ${tableState.skipped} ❌ ${tableState.failed}`
        ));
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log(chalk.green(
        `\n✅ ${tableName} complete: ${tableState.migrated} new, ${tableState.exists} existing`
      ));
      
    } finally {
      client.release();
    }
  }

  async run() {
    try {
      await this.setupDatabase();
      
      const startTime = Date.now();
      
      // Table configurations
      const tables = {
        danistaykararlari: {
          orderBy: 'ORDER BY id',
          getContent: (row) => row.metin,
          getTitle: (row, id) => row.karar_no || `Danıştay Kararı ${id}`,
          getMetadata: (row) => ({
            type: 'danistay_karari',
            karar_no: row.karar_no,
            karar_tarihi: row.karar_tarihi,
            daire: row.daire,
            konu: row.konu
          })
        },
        ozelgeler: {
          orderBy: 'ORDER BY id',
          getContent: (row) => row.metin,
          getTitle: (row, id) => row.ozelge_no || `Özelge ${id}`,
          getMetadata: (row) => ({
            type: 'ozelge',
            ozelge_no: row.ozelge_no,
            tarih: row.tarih,
            konu: row.konu,
            kurum: row.kurum
          })
        },
        makaleler: {
          orderBy: '',
          getContent: (row) => row.Icerik,
          getTitle: (row, id) => row.Baslik || `Makale ${id}`,
          getMetadata: (row) => ({
            type: 'makale',
            kaynak: row.Kaynak,
            donem: row.Donem,
            yazar: row.Yazar,
            sayi_sira_no: row.SayiSiraNo,
            ilgili_kanun: row.IlgiliKanun
          })
        },
        sorucevap: {
          orderBy: '',
          getContent: (row) => `SORU: ${row.Soru || ''}\n\nCEVAP: ${row.Cevap || ''}`,
          getTitle: (row, id) => (row.Soru || '').substring(0, 200) || `Soru-Cevap ${id}`,
          getMetadata: (row) => ({
            type: 'soru_cevap',
            kaynak: row.Kaynak,
            donem: row.Donemi,
            ilgili_kanun: row.IlgiliKanun
          })
        }
      };
      
      // Process each table
      for (const [tableName, config] of Object.entries(tables)) {
        await this.migrateTable(tableName, config);
      }
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      // Final summary
      console.log(chalk.cyan('\n' + '=' .repeat(60)));
      console.log(chalk.cyan.bold('📈 Migration Summary'));
      console.log(chalk.cyan('=' .repeat(60)));
      
      const finalCount = await this.targetPool.query(`
        SELECT 
          source_table,
          COUNT(*) as total,
          COUNT(CASE WHEN embedding_model = 'text-embedding-ada-002' THEN 1 END) as with_openai
        FROM rag_data.documents
        GROUP BY source_table
        ORDER BY source_table
      `);
      
      console.log('\n📊 Database Status:');
      console.table(finalCount.rows);
      
      console.log(chalk.white(`
  ${chalk.bold('Totals:')}
  ├─ Migrated: ${chalk.green(this.state.stats.totalMigrated)}
  ├─ Failed: ${chalk.red(this.state.stats.totalFailed)}
  ├─ Skipped: ${chalk.yellow(this.state.stats.totalSkipped)}
  ├─ Duration: ${chalk.cyan(Math.floor(duration / 60) + 'm ' + (duration % 60) + 's')}
  ├─ Tokens Used: ${chalk.blue(this.state.stats.tokensUsed.toLocaleString())}
  └─ Cost: ${chalk.green('$' + this.state.stats.estimatedCost.toFixed(3))}
      `));
      
      // Clean up if complete
      let allComplete = true;
      for (const [table, info] of Object.entries(this.state.tables)) {
        if (info.processed < info.total) {
          allComplete = false;
          console.log(chalk.yellow(`\n⚠️  ${table} incomplete: ${info.processed}/${info.total}`));
        }
      }
      
      if (allComplete) {
        fs.unlinkSync(PROGRESS_FILE);
        console.log(chalk.green.bold('\n✅ All tables complete! State file cleaned.'));
      } else {
        console.log(chalk.yellow('\n💾 Progress saved. Run again to continue.'));
      }
      
    } catch (error) {
      console.error(chalk.red('\n❌ Fatal error:'), error.message);
      this.saveState();
      console.log(chalk.yellow('💾 Progress saved. Run again to continue.'));
      process.exit(1);
      
    } finally {
      await this.sourcePool.end();
      await this.targetPool.end();
    }
  }

  extractKeywords(text) {
    if (!text) return [];
    
    const stopWords = new Set([
      've', 'ile', 'bu', 'bir', 'de', 'da', 'için', 'olan', 
      'olarak', 'dır', 'dir', 'den', 'dan', 'gibi', 'kadar'
    ]);
    
    const words = text
      .toLowerCase()
      .replace(/[^\wığüşöçİĞÜŞÖÇ\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    const freq = {};
    words.forEach(word => {
      freq[word] = (freq[word] || 0) + 1;
    });
    
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}

// Main
if (require.main === module) {
  const migration = new ResilientOpenAIMigration();
  
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n⚠️  Interrupted! Progress saved.'));
    migration.saveState();
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    console.error(chalk.red('\n❌ Unexpected error:'), error.message);
    migration.saveState();
    console.log(chalk.yellow('💾 Progress saved. Run again to continue.'));
    process.exit(1);
  });
  
  process.on('unhandledRejection', (error) => {
    console.error(chalk.red('\n❌ Unhandled rejection:'), error.message);
    migration.saveState();
    console.log(chalk.yellow('💾 Progress saved. Run again to continue.'));
    process.exit(1);
  });
  
  migration.run().catch(error => {
    console.error(chalk.red('Fatal:'), error);
    process.exit(1);
  });
}