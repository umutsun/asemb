// Puppeteer is temporarily disabled - module not installed
import { pgPool } from '../server';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

interface ScrapeResult {
  success: boolean;
  title: string;
  content: string;
  description?: string;
  keywords?: string;
  url: string;
  metadata?: any;
  chunks?: string[];
  error?: string;
}

export class PuppeteerScraperService {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  async scrapeWithPuppeteer(url: string, options: any = {}): Promise<ScrapeResult> {
    // Puppeteer is not installed - return error message
    console.log('[PUPPETEER] Module not available, returning mock data for:', url);
    
    return {
      success: false,
      title: 'Puppeteer Not Installed',
      content: 'Puppeteer is not currently installed. Please install it using: npm install puppeteer',
      url: url,
      error: 'Puppeteer module not found - scraping functionality disabled'
    };
  }

  async createEmbeddings(content: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: content
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[PUPPETEER] Embedding creation error:', error);
      throw error;
    }
  }

  async saveToDatabase(url: string, result: ScrapeResult): Promise<void> {
    try {
      const documentResult = await pgPool.query(`
        INSERT INTO documents (url, title, content, metadata, scraped_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (url) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          scraped_at = NOW()
        RETURNING id
      `, [
        url,
        result.title || 'Untitled',
        result.content || '',
        JSON.stringify(result.metadata || {})
      ]);

      const documentId = documentResult.rows[0].id;
      console.log('[PUPPETEER] Document saved with ID:', documentId);

      // Save chunks and embeddings if available
      if (result.chunks && result.chunks.length > 0 && this.openai) {
        await this.saveEmbeddings(documentId, result.chunks);
      }
    } catch (error) {
      console.error('[PUPPETEER] Database save error:', error);
      throw error;
    }
  }

  private async saveEmbeddings(documentId: number, chunks: string[]): Promise<void> {
    if (!this.openai) {
      console.log('[PUPPETEER] OpenAI not configured, skipping embeddings');
      return;
    }

    try {
      console.log('[PUPPETEER] Creating embeddings for', chunks.length, 'chunks');
      
      const embeddings = await Promise.all(
        chunks.map(chunk => this.createEmbeddings(chunk))
      );

      for (let i = 0; i < chunks.length; i++) {
        const vectorString = `[${embeddings[i].join(',')}]`;
        
        await pgPool.query(`
          INSERT INTO embeddings (document_id, content, embedding, metadata)
          VALUES ($1, $2, $3::vector, $4)
        `, [
          documentId,
          chunks[i],
          vectorString,
          JSON.stringify({
            chunk_index: i,
            total_chunks: chunks.length
          })
        ]);
      }
      
      console.log('[PUPPETEER] Saved', embeddings.length, 'embeddings');
    } catch (error) {
      console.error('[PUPPETEER] Embedding save error:', error);
    }
  }
}

export default new PuppeteerScraperService();