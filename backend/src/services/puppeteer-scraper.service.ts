import puppeteer from 'puppeteer';
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
    let browser;
    
    try {
      console.log('[PUPPETEER] Launching browser for:', url);
      
      // Launch browser with stealth options
      browser = await puppeteer.launch({
        headless: 'new', // Back to headless for performance
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--window-size=1920,1080'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });

      const page = await browser.newPage();

      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set extra headers to appear more human-like
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
      });

      // Override navigator properties to hide automation
      await page.evaluateOnNewDocument(() => {
        // Override navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });

        // Override navigator.plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });

        // Override navigator.languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['tr-TR', 'tr', 'en-US', 'en']
        });

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: 'denied' } as PermissionStatus) :
            originalQuery(parameters)
        );

        // Chrome specific
        (window as any).chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
      });

      // Set cookies if needed for GIB
      if (url.includes('gib.gov.tr')) {
        await page.setCookie({
          name: 'cookieConsent',
          value: 'true',
          domain: '.gib.gov.tr'
        });
      }

      console.log('[PUPPETEER] Navigating to page...');
      
      // Navigate with extended timeout
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      console.log('[PUPPETEER] Response status:', response?.status());

      console.log('[PUPPETEER] Page loaded, waiting for content...');

      // Wait for potential dynamic content
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // For Next.js apps, wait for React to hydrate
      await page.evaluate(() => {
        return new Promise((resolve) => {
          if (document.readyState === 'complete') {
            setTimeout(resolve, 2000);
          } else {
            window.addEventListener('load', () => setTimeout(resolve, 2000));
          }
        });
      });

      // Wait for any dynamic content to load
      console.log('[PUPPETEER] Waiting for dynamic content to render...');
      try {
        // For Next.js sites, wait for main content area
        await page.waitForFunction(
          () => {
            // Check if the page has actual text content (not just template)
            const body = document.body;
            const textContent = body?.innerText || body?.textContent || '';
            // Wait until we have substantial content (more than just navigation/header text)
            return textContent.length > 500;
          },
          { timeout: 15000 }
        );
        console.log('[PUPPETEER] Content detected');
      } catch (err) {
        console.log('[PUPPETEER] Timeout waiting for content, continuing anyway...');
      }
      
      // Additional wait to ensure all dynamic content is loaded
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check for iframes that might contain content
      const frames = page.frames();
      if (frames.length > 1) {
        console.log(`[PUPPETEER] Found ${frames.length} frames, checking for content...`);
        for (const frame of frames) {
          if (frame !== page.mainFrame()) {
            try {
              const frameUrl = frame.url();
              if (frameUrl && frameUrl !== 'about:blank') {
                console.log('[PUPPETEER] Frame URL:', frameUrl);
                
                // Try to extract content from iframe
                const frameContent = await frame.evaluate(() => {
                  return document.body?.innerText || document.body?.textContent || '';
                });
                
                if (frameContent && frameContent.trim().length > 100) {
                  console.log('[PUPPETEER] Found significant content in iframe:', frameContent.length);
                  // You might want to merge this with main content
                }
              }
            } catch (err) {
              console.log('[PUPPETEER] Could not access frame:', err);
            }
          }
        }
      }

      // Take a screenshot and save HTML for debugging
      await page.screenshot({ path: 'scraper-debug.png', fullPage: true });
      console.log('[PUPPETEER] Screenshot saved as scraper-debug.png');
      
      // Save HTML for debugging
      const debugHtml = await page.content();
      const fs = require('fs');
      fs.writeFileSync('scraper-debug.html', debugHtml);
      console.log('[PUPPETEER] HTML saved to scraper-debug.html');

      // Scroll to load lazy content
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      console.log('[PUPPETEER] Extracting content...');

      // Get page title
      const title = await page.title();

      // Extract all text content with advanced strategies
      const content = await page.evaluate(() => {
        // Function to check if element is visible
        const isVisible = (elem: Element) => {
          const style = window.getComputedStyle(elem);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 elem.clientHeight > 0;
        };

        // Function to clean text
        const cleanText = (text: string) => {
          return text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        };

        // Remove unnecessary elements
        const removeSelectors = [
          'script', 'style', 'noscript', 'iframe',
          '.cookie-banner', '.popup', '.modal',
          '[aria-hidden="true"]', '[hidden]'
        ];
        
        removeSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        });

        // Strategy 1: Smart content detection
        const contentIndicators = [
          'main', 'article', '[role="main"]', '[role="article"]',
          '#main', '#content', '#main-content',
          '.main', '.content', '.main-content',
          '.article', '.article-content', '.page-content',
          '.entry-content', '.post-content', '.text-content',
          'div[class*="content"]', 'div[id*="content"]',
          'div[class*="article"]', 'div[class*="text"]',
          'section[class*="content"]', 'section[id*="content"]'
        ];

        let bestContent = '';
        let bestScore = 0;

        for (const selector of contentIndicators) {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            if (!isVisible(element)) return;
            
            const text = element.textContent || '';
            const cleanedText = cleanText(text);
            
            // Score based on text length and paragraph count
            const paragraphs = element.querySelectorAll('p').length;
            const headers = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
            const score = cleanedText.length + (paragraphs * 100) + (headers * 50);
            
            if (score > bestScore && cleanedText.length > 100) {
              bestScore = score;
              bestContent = cleanedText;
            }
          });
        }

        if (bestContent) {
          console.log('Found content with score:', bestScore);
          return bestContent;
        }

        // Strategy 2: Advanced text extraction using TreeWalker
        const textNodes: string[] = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              const parent = node.parentElement;
              if (!parent || !isVisible(parent)) {
                return NodeFilter.FILTER_REJECT;
              }
              
              const tagName = parent.tagName?.toLowerCase();
              if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
                return NodeFilter.FILTER_REJECT;
              }
              
              const text = node.textContent?.trim() || '';
              if (text.length < 10) {
                return NodeFilter.FILTER_REJECT;
              }
              
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent?.trim() || '';
          if (text && !textNodes.includes(text)) {
            textNodes.push(text);
          }
        }

        if (textNodes.length > 0) {
          const combinedText = textNodes.join(' ');
          if (combinedText.length > 100) {
            console.log('Extracted text using TreeWalker:', combinedText.length);
            return cleanText(combinedText);
          }
        }

        // Strategy 3: Table and list extraction
        const structuredContent: string[] = [];
        
        // Extract tables
        document.querySelectorAll('table').forEach(table => {
          if (!isVisible(table)) return;
          const rows = Array.from(table.querySelectorAll('tr'));
          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            const rowText = cells.map(cell => cell.textContent?.trim() || '').join(' | ');
            if (rowText.length > 5) {
              structuredContent.push(rowText);
            }
          });
        });
        
        // Extract lists
        document.querySelectorAll('ul, ol').forEach(list => {
          if (!isVisible(list)) return;
          const items = Array.from(list.querySelectorAll('li'));
          items.forEach(item => {
            const text = item.textContent?.trim();
            if (text && text.length > 5) {
              structuredContent.push('• ' + text);
            }
          });
        });
        
        // Extract paragraphs and headers
        document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach(elem => {
          if (!isVisible(elem)) return;
          const text = elem.textContent?.trim();
          if (text && text.length > 10) {
            structuredContent.push(text);
          }
        });
        
        if (structuredContent.length > 0) {
          const combined = structuredContent.join('\n\n');
          console.log('Extracted structured content:', combined.length);
          return cleanText(combined);
        }

        // Final fallback
        const bodyText = document.body.innerText || document.body.textContent || '';
        console.log('Using fallback body text:', bodyText.length);
        return cleanText(bodyText);
      });

      // Get metadata
      const metadata = await page.evaluate(() => {
        const getMeta = (name: string) => {
          const element = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return element?.getAttribute('content') || '';
        };

        return {
          description: getMeta('description') || getMeta('og:description'),
          keywords: getMeta('keywords'),
          author: getMeta('author'),
          ogTitle: getMeta('og:title'),
          ogImage: getMeta('og:image')
        };
      });

      // Log raw content for debugging
      console.log('[PUPPETEER] Raw content length:', content.length);
      if (content.length < 500) {
        console.log('[PUPPETEER] Raw content:', content.substring(0, 500));
      }
      
      // Check if we got actual content
      const cleanContent = content.replace(/\s+/g, ' ').trim();
      
      if (cleanContent.length < 50) {
        // Try to get raw HTML as last resort
        const html = await page.content();
        console.log('[PUPPETEER] Content too short, using raw HTML');
        console.log('[PUPPETEER] HTML length:', html.length);
        
        // Parse HTML to extract text
        const textContent = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (textContent.length > cleanContent.length) {
          return {
            success: true,
            title: title || 'Untitled',
            content: textContent.substring(0, 50000),
            description: metadata.description,
            keywords: metadata.keywords,
            url,
            metadata: {
              ...metadata,
              scrapeMethod: 'puppeteer-html-fallback',
              contentLength: textContent.length
            }
          };
        }
      }

      console.log(`[PUPPETEER] Extracted ${cleanContent.length} characters`);

      // Create chunks if content exists
      let chunks: string[] = [];
      if (cleanContent.length > 0) {
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1500,
          chunkOverlap: 200
        });
        chunks = await splitter.splitText(cleanContent);
      }

      return {
        success: true,
        title: title || 'Untitled',
        content: cleanContent.substring(0, 50000),
        description: metadata.description,
        keywords: metadata.keywords,
        url,
        metadata: {
          ...metadata,
          scrapeMethod: 'puppeteer',
          contentLength: cleanContent.length,
          chunksCount: chunks.length
        },
        chunks
      };

    } catch (error: any) {
      console.error('[PUPPETEER] Scraping error:', error);
      return {
        success: false,
        title: 'Error',
        content: '',
        url,
        error: error.message
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async generateEmbeddings(chunks: string[]): Promise<number[][]> {
    if (!this.openai) {
      return chunks.map(chunk => this.generateLocalEmbedding(chunk));
    }

    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      try {
        const response = await this.openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: chunk
        });
        embeddings.push(response.data[0].embedding);
      } catch {
        embeddings.push(this.generateLocalEmbedding(chunk));
      }
    }
    
    return embeddings;
  }

  private generateLocalEmbedding(text: string): number[] {
    const embedding = new Array(1536).fill(0);
    for (let i = 0; i < Math.min(text.length, 2000); i++) {
      const charCode = text.charCodeAt(i);
      const index = (charCode * (i + 1)) % embedding.length;
      embedding[index] += Math.sin(charCode * 0.01 + i * 0.001);
    }
    
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / magnitude;
      }
    }
    
    return embedding;
  }

  async saveToDatabase(result: ScrapeResult): Promise<number | null> {
    if (!result.success || !result.content) return null;

    try {
      const queryResult = await pgPool.query(`
        INSERT INTO scraped_data (
          url, title, content, description, keywords,
          metadata, content_chunks, chunk_count, content_length,
          scraping_mode
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (url) 
        DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          description = EXCLUDED.description,
          keywords = EXCLUDED.keywords,
          metadata = EXCLUDED.metadata,
          content_chunks = EXCLUDED.content_chunks,
          chunk_count = EXCLUDED.chunk_count,
          content_length = EXCLUDED.content_length,
          scraping_mode = EXCLUDED.scraping_mode,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [
        result.url,
        result.title,
        result.content.substring(0, 100000),
        result.description,
        result.keywords,
        JSON.stringify(result.metadata),
        result.chunks,
        result.chunks?.length || 0,
        result.content.length,
        'puppeteer'
      ]);
      
      console.log('[PUPPETEER] Saved to database with ID:', queryResult.rows[0].id);
      return queryResult.rows[0].id;
    } catch (error) {
      console.error('[PUPPETEER] Database save error:', error);
      return null;
    }
  }

  async saveEmbeddings(documentId: number, chunks: string[], embeddings: number[][]): Promise<void> {
    if (!documentId || !chunks || !embeddings) return;
    
    try {
      // Create table if not exists
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS document_embeddings (
          id SERIAL PRIMARY KEY,
          document_id INTEGER,
          chunk_text TEXT,
          embedding vector(1536),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Save each embedding
      for (let i = 0; i < embeddings.length && i < chunks.length; i++) {
        const vectorString = `[${embeddings[i].join(',')}]`;
        await pgPool.query(`
          INSERT INTO document_embeddings (
            document_id, 
            chunk_text, 
            embedding,
            metadata
          )
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