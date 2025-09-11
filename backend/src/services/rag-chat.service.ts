import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { semanticSearch } from './semantic-search.service';
import claudeService from './claude.service';
import pool from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: any[];
}

interface ChatOptions {
  temperature?: number;
  model?: string;
  systemPrompt?: string;
  ragWeight?: number;
  useLocalDb?: boolean;
  language?: string;
  responseStyle?: string;
}

export class RAGChatService {
  private pool = pool;
  private openai: OpenAI | null = null;
  private useOpenAI: boolean = false;
  private aiProvider: string;
  private fallbackEnabled: boolean;

  constructor() {
    
    // Get AI provider settings
    this.aiProvider = process.env.AI_PROVIDER || 'fallback';
    this.fallbackEnabled = process.env.AI_FALLBACK_ENABLED === 'true';
    
    // Initialize OpenAI only if API key is available
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-proj-YOUR_OPENAI_API_KEY_HERE') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.useOpenAI = true;
      console.log('✅ OpenAI Chat API initialized');
    } else {
      console.log('⚠️  OpenAI API key not configured');
    }
    
    console.log(`🤖 AI Provider: ${this.aiProvider}, Fallback: ${this.fallbackEnabled}`);
  }

  /**
   * Process a chat message with RAG
   */
  async processMessage(
    message: string, 
    conversationId?: string,
    userId: string = 'demo-user',
    options: ChatOptions = {}
  ) {
    try {
      // 1. Create or get conversation
      const convId = conversationId || uuidv4();
      await this.ensureConversation(convId, userId, message);

      // 2. Search for relevant documents from rag_data using pgvector
      console.log('Searching rag_data.documents with pgvector...');
      // Get only highly relevant sources
      const allResults = await semanticSearch.hybridSearch(message, 20); // Reduced from 50 to 20
      
      // Filter sources with relevance above 60% for better quality
      let searchResults = allResults.filter(result => {
        const score = result.score || (result.similarity_score * 100) || 0;
        return score >= 60; // Increased from 40% to 60%
      });
      
      console.log(`Filtered ${searchResults.length} sources from ${allResults.length} (>60% relevance)`);
      
      // If no high-quality results, take top 5 best matches
      if (searchResults.length === 0 && allResults.length > 0) {
        console.log('No sources above 60%, taking top 5 best matches');
        searchResults = allResults.slice(0, 5); // Reduced from 10 to 5
      }
      
      // Kaynakları score'a göre sırala (yüksek score önce)
      searchResults.sort((a, b) => {
        const scoreA = a.score || (a.similarity_score * 100) || 0;
        const scoreB = b.score || (b.similarity_score * 100) || 0;
        return scoreB - scoreA;
      });
      
      // 3. Prepare context from search results
      const context = this.prepareEnhancedContext(searchResults);
      
      // 4. Get conversation history
      const history = await this.getConversationHistory(convId, 5);
      
      // 5. Generate response with temperature from options
      const temperature = options.temperature !== undefined ? options.temperature : 0.1;
      console.log(`Using temperature: ${temperature}`);
      const response = await this.generateResponse(message, context, history, temperature, options, searchResults);
      
      // 6. Save messages to database
      await this.saveMessage(convId, 'user', message);
      await this.saveMessage(convId, 'assistant', response.content, searchResults);
      
      // 7. Format sources for frontend
      const formattedSources = this.formatSources(searchResults);
      
      return {
        response: response.content,
        sources: formattedSources,
        conversationId: convId
      };
    } catch (error) {
      console.error('RAG chat error:', error);
      throw error;
    }
  }

  /**
   * Prepare enhanced context with better categorization
   */
  private prepareEnhancedContext(searchResults: any[]): string {
    if (!searchResults.length) {
      console.log('No search results to prepare context from');
      return '';
    }

    // Kaynakları score'a göre sırala (yüksek score önce) - context için de
    const sortedResults = [...searchResults].sort((a, b) => {
      const scoreA = a.score || (a.similarity_score * 100) || 0;
      const scoreB = b.score || (b.similarity_score * 100) || 0;
      return scoreB - scoreA;
    });

    let context = 'Veritabanında bulunan ilgili bilgiler (en ilgiliden başlayarak):\n\n';
    
    sortedResults.forEach((result, idx) => {
      const sourceNum = idx + 1;
      const title = result.title || 'Belge';
      const excerpt = this.truncateExcerpt(result.excerpt || result.content || '', 500); // Daha fazla içerik
      
      // Add metadata info if available
      let metaInfo = '';
      if (result.metadata) {
        if (result.metadata.tarih) metaInfo += ` (Tarih: ${result.metadata.tarih})`;
        if (result.metadata.sayiNo) metaInfo += ` (Sayı: ${result.metadata.sayiNo})`;
        if (result.metadata.kararNo) metaInfo += ` (Karar No: ${result.metadata.kararNo})`;
      }
      
      // Excerpt boşsa content'ten al
      const contentToShow = excerpt || (result.content ? this.truncateExcerpt(result.content, 500) : 'İçerik mevcut değil');
      
      context += `${title}${metaInfo}:\n${contentToShow}\n\n`;
    });
    
    console.log(`Context prepared with ${searchResults.length} sources, total length: ${context.length}`);
    return context;
  }

  /**
   * Categorize source based on content
   */
  private categorizeSource(result: any): string {
    // Önce source_table'dan kategori belirle
    const sourceTable = result.source_table?.toUpperCase();
    
    if (sourceTable === 'OZELGELER') {
      return 'Özelge';
    } else if (sourceTable === 'DANISTAYKARARLARI') {
      return 'Danıştay Kararı';
    } else if (sourceTable === 'MAKALELER') {
      return 'Makale';
    } else if (sourceTable === 'DOKUMAN') {
      return 'Doküman';
    } else if (sourceTable === 'MEVZUAT') {
      return 'Mevzuat';
    }
    
    // Eğer source_table yoksa içerikten tahmin et
    const title = result.title?.toLowerCase() || '';
    const content = result.excerpt?.toLowerCase() || '';
    const combined = title + ' ' + content;

    if (combined.includes('kanun') || combined.includes('yönetmelik') || combined.includes('tebliğ')) {
      return 'Mevzuat';
    } else if (combined.includes('özelge') || combined.includes('mukteza')) {
      return 'Özelge';
    } else if (combined.includes('sirküler') || combined.includes('duyuru')) {
      return 'Sirküler';
    } else if (combined.includes('karar') || combined.includes('mahkeme') || combined.includes('danıştay')) {
      return 'Yargı Kararı';
    } else if (combined.includes('makale') || combined.includes('yazı') || combined.includes('analiz')) {
      return 'Makale';
    } else {
      return 'Kaynak';
    }
  }

  /**
   * Truncate excerpt intelligently
   */
  private truncateExcerpt(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    
    // Cümle sonunda kes
    const truncated = text.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > maxLength * 0.8) {
      return truncated.substring(0, lastPeriod + 1);
    }
    
    return truncated + '...';
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(text: string): string {
    if (!text) return '';
    // Remove HTML tags
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp;
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'") // Replace &#39;
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .trim();
  }

  /**
   * Format sources for better UI display
   */
  private formatSources(searchResults: any[]): any[] {
    return searchResults.map((r, idx) => {
      const category = this.categorizeSource(r);
      // Score already calculated in search results
      const score = r.score || (r.similarity_score ? Math.round(r.similarity_score * 100) : 50);
      console.log(`Source ${idx}: score=${r.score}, similarity_score=${r.similarity_score}, calculated=${score}`);

      // Build proper citation
      let citation = `[Kaynak ${idx + 1}]`;
      if (r.metadata) {
        if (r.source_table === 'OZELGELER' && r.metadata.sayiNo) {
          citation = `Özelge - ${r.metadata.sayiNo}`;
        } else if (r.source_table === 'DANISTAYKARARLARI' && r.metadata.kararNo) {
          citation = `Danıştay ${r.metadata.daire || ''} - Karar: ${r.metadata.kararNo}`;
        } else if (r.source_table === 'MAKALELER' && r.metadata.yazar) {
          citation = `${r.metadata.yazar} - ${r.metadata.donem || ''}`;
        }
      }

      // Clean HTML from title and excerpt
      const cleanTitle = this.stripHtml(r.title?.replace(/ \(Part \d+\/\d+\)/g, '') || citation);
      const cleanExcerpt = this.stripHtml(r.excerpt || r.content || '');
      
      return {
        id: r.id,
        title: cleanTitle,
        excerpt: this.truncateExcerpt(cleanExcerpt, 250),
        category: category,
        sourceTable: r.source_table || 'documents',
        citation: citation,
        score: score,
        relevance: score,  // Send numeric value for frontend
        relevanceText: score > 80 ? 'Yüksek' : score > 60 ? 'Orta' : 'Düşük',
        databaseInfo: {
          table: r.source_table || 'documents',
          id: r.id,
          hasMetadata: !!r.metadata
        },
        index: idx + 1,
        metadata: r.metadata || {},
        // Add additional metrics
        priority: idx + 1,  // Priority based on order
        hasContent: !!(r.content || r.excerpt),
        contentLength: (r.content || r.excerpt || '').length
      };
    });
  }

  /**
   * Generate response using selected AI provider
   */
  private async generateResponse(
    query: string, 
    context: string, 
    history: ChatMessage[],
    temperature: number = 0.1,
    options: ChatOptions = {},
    searchResults?: any[]
  ) {
    let response = null;
    let lastError = null;

    // Try primary provider
    try {
      switch (this.aiProvider) {
        case 'claude':
          if (claudeService.isAvailable()) {
            response = await claudeService.generateResponse(query, context, history);
          } else {
            throw new Error('Claude API not available');
          }
          break;
          
        case 'openai':
          if (this.useOpenAI && this.openai) {
            response = await this.generateOpenAIResponse(query, context, history, temperature, searchResults);
          } else {
            throw new Error('OpenAI API not available');
          }
          break;
          
        case 'fallback':
        default:
          response = this.generateDemoResponse(query, context);
          break;
      }
    } catch (error: any) {
      console.error(`${this.aiProvider} API error:`, error);
      lastError = error;
    }

    // Try fallback if enabled and primary failed
    if (!response && this.fallbackEnabled) {
      console.log('🔄 Trying fallback providers...');
      
      // Try OpenAI if not already tried
      if (this.aiProvider !== 'openai' && this.useOpenAI && this.openai) {
        try {
          response = await this.generateOpenAIResponse(query, context, history, temperature, searchResults);
          console.log('✅ OpenAI fallback successful');
        } catch (error) {
          console.error('OpenAI fallback error:', error);
        }
      }
      
      // Try Claude if not already tried
      if (!response && this.aiProvider !== 'claude' && claudeService.isAvailable()) {
        try {
          response = await claudeService.generateResponse(query, context, history);
          console.log('✅ Claude fallback successful');
        } catch (error) {
          console.error('Claude fallback error:', error);
        }
      }
      
      // Final fallback to demo response
      if (!response) {
        console.log('📝 Using demo response as final fallback');
        response = this.generateDemoResponse(query, context);
      }
    }

    if (!response) {
      throw lastError || new Error('All AI providers failed');
    }

    return response;
  }

  /**
   * Generate response using OpenAI
   */
  private async generateOpenAIResponse(
    query: string,
    context: string,
    history: ChatMessage[],
    temperature: number = 0.1,
    searchResults?: any[]
  ) {
    if (!this.openai) throw new Error('OpenAI not initialized');

    // Check if we have sources but no good context
    const hasSourcesButNoContext = searchResults && searchResults.length > 0 && (!context || context.length < 100);
    
    // If we have sources but limited context, enrich the prompt with source summaries
    let sourcesSummary = '';
    if (hasSourcesButNoContext && searchResults) {
      sourcesSummary = '\n\nKAYNAK ÖZETLERİ (ilgi düzeyine göre):\n';
      const topSources = searchResults.slice(0, 7);
      topSources.forEach((source, idx) => {
        const score = source.score || Math.round((source.similarity_score || 0.5) * 100);
        const title = source.title || 'Kaynak';
        const excerpt = source.excerpt || source.content || '';
        const truncatedExcerpt = excerpt.length > 100 ? excerpt.substring(0, 100) + '...' : excerpt;
        sourcesSummary += `${idx + 1}. %${score} - ${title}: ${truncatedExcerpt}\n`;
      });
    }
    
    let systemPrompt = `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.
    
GÖREV:
- Aşağıdaki bağlamda verilen bilgilere dayanarak ANLAMLI ve AKICI bir metin oluştur
- Cevabını 2-3 paragraf halinde organize et:
  • İlk paragraf: Konunun genel çerçevesi ve temel bilgiler
  • İkinci paragraf: Detaylar, örnekler ve uygulamalar
  • Üçüncü paragraf (gerekirse): Önemli noktalar, istisnalar veya dikkat edilmesi gerekenler
  
- DİL ve ÜSLUP:
  • Profesyonel ama anlaşılır bir dil kullan
  • Teknik terimleri açıklayarak kullan
  • Madde madde sıralama yerine akıcı paragraflar oluştur
  • "Buna göre", "Bu kapsamda", "Öte yandan" gibi bağlaçlarla metni akıcı hale getir
  • KAYNAK BELİRTME: Metin içinde kaynak numarası belirtme (Kaynak 1, Kaynak 2 gibi yazma)
  
- KAYNAK YETERSİZLİĞİ DURUMU:
  • Eğer bağlam yetersizse ama kaynaklar varsa: "Bu konuda veritabanımda sınırlı bilgi bulunuyor. Aşağıdaki kaynaklarda ilgili bilgiler yer alıyor:"
  • Ardından en yüksek ilgi düzeyine sahip ilk 7 kaynağın kısa özetini ver (%ilgi düzeyi ile birlikte)
  • Eğer hiç kaynak yoksa: "Bu konuda veritabanımda bilgi bulunmuyor"
  
- Tahmin yapma, sadece verilen bağlamdaki bilgileri kullan
      
Bağlam (en ilgiliden başlayarak sıralı):
${context && context.length > 50 ? context : 'Veritabanında bu konuyla ilgili spesifik bilgi bulunamadı.'}${sourcesSummary}`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: query }
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: temperature,
      max_tokens: 800
    });

    return {
      content: completion.choices[0].message.content || 'Yanıt oluşturulamadı.'
    };
  }

  /**
   * Generate demo response without OpenAI
   */
  private generateDemoResponse(query: string, context: string): { content: string } {
    const lowerQuery = query.toLowerCase();
    
    // If context exists, use it to generate a response
    if (context && context.length > 50) {
      const contextLines = context.split('\n').filter(line => line.trim());
      const firstSource = contextLines.find(line => line.includes('[Kaynak')) || '';
      const relevantInfo = contextLines.slice(0, 2).join('\n');
      
      return {
        content: `${query} hakkında:\n\n${relevantInfo}\n\n💡 Not: Daha detaylı bilgi için aşağıdaki kaynaklara bakabilirsiniz.`
      };
    }
    
    // Common responses
    const responses: { [key: string]: string } = {
      'merhaba': 'Merhaba! 👋 Size nasıl yardımcı olabilirim?\n\nVergi, muhasebe ve mali mevzuat konularında sorularınızı yanıtlayabilirim.',
      'özelge': '📋 **Özelge Nedir?**\n\nÖzelge, vergi mükelleflerinin belirli bir konu hakkında Gelir İdaresi Başkanlığı\'ndan aldıkları resmi görüştür.\n\n✅ Sadece başvuru sahibini bağlar\n✅ Vergi güvenliği sağlar\n✅ İşlem öncesi alınmalıdır',
      'kdv': '💰 **KDV Oranları:**\n\n• %1 - Temel gıda maddeleri\n• %8 - Bazı gıda ve hizmetler\n• %18 - Genel oran\n\nDetaylı liste için Maliye Bakanlığı sitesini ziyaret edebilirsiniz.',
      'test': '✅ Sistem başarıyla çalışıyor!\n\nMesajınız alındı ve işlendi. Size nasıl yardımcı olabilirim?'
    };

    // Find matching response
    for (const [key, value] of Object.entries(responses)) {
      if (lowerQuery.includes(key)) {
        return { content: value };
      }
    }

    // Default response
    return {
      content: `"${query}" konusuyla ilgili veritabanımda henüz detaylı bilgi bulunmuyor.\n\nBu konuda size daha iyi yardımcı olabilmem için daha spesifik bir soru sorabilirsiniz.`
    };
  }

  /**
   * Ensure conversation exists with better title
   */
  private async ensureConversation(conversationId: string, userId: string, firstMessage: string) {
    // Generate a better title from first message
    const title = firstMessage.length > 50 
      ? firstMessage.substring(0, 47) + '...'
      : firstMessage;

    const query = `
      INSERT INTO conversations (id, user_id, title, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `;

    await this.pool.query(query, [
      conversationId,
      userId,
      title
    ]);
  }

  /**
   * Save message to database
   */
  private async saveMessage(
    conversationId: string,
    role: string,
    content: string,
    sources?: any[]
  ) {
    const query = `
      INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;

    await this.pool.query(query, [
      uuidv4(),
      conversationId,
      role,
      content,
      sources ? JSON.stringify(sources) : null
    ]);
  }

  /**
   * Get conversation history
   */
  private async getConversationHistory(
    conversationId: string,
    limit: number = 10
  ): Promise<ChatMessage[]> {
    const query = `
      SELECT role, content
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [conversationId, limit]);
    return result.rows.reverse();
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string) {
    const query = `
      SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id, c.title, c.created_at, c.updated_at
      ORDER BY c.updated_at DESC
    `;

    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get full conversation with messages
   */
  async getConversation(conversationId: string) {
    const conversationQuery = `
      SELECT * FROM conversations WHERE id = $1
    `;
    
    const messagesQuery = `
      SELECT * FROM messages 
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `;

    const [convResult, msgResult] = await Promise.all([
      this.pool.query(conversationQuery, [conversationId]),
      this.pool.query(messagesQuery, [conversationId])
    ]);

    if (!convResult.rows.length) {
      throw new Error('Conversation not found');
    }

    return {
      ...convResult.rows[0],
      messages: msgResult.rows
    };
  }

  /**
   * Get popular questions based on recent searches and database content
   */
  async getPopularQuestions(): Promise<string[]> {
    try {
      // Get most searched questions from recent messages
      const recentSearchesQuery = `
        SELECT content, COUNT(*) as count
        FROM messages
        WHERE role = 'user'
          AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY content
        ORDER BY count DESC
        LIMIT 20
      `;

      const recentResult = await this.pool.query(recentSearchesQuery);
      const recentQuestions = recentResult.rows.map(r => r.content);

      // Pre-defined popular questions based on database content
      const popularQuestions = [
        'KDV iadesi nasıl alınır?',
        'E-fatura zorunluluğu kimleri kapsar?',
        'Gelir vergisi dilimleri 2024',
        'KDV tevkifatı oranları nedir?',
        'Geçici vergi nasıl hesaplanır?',
        'Stopaj oranları hangi ödemelerde uygulanır?',
        'Vergi dairesi işlemleri nasıl yapılır?',
        'Ar-Ge indirimi şartları nelerdir?',
        'KDV beyannamesi ne zaman verilir?',
        'Mücbir sebep halleri nelerdir?',
        'Transfer fiyatlandırması nedir?',
        'Vergi cezaları ve indirim oranları',
        'E-defter uygulaması zorunlu mu?',
        'İhracatta KDV istisnası nasıl uygulanır?',
        'Kurumlar vergisi istisnaları nelerdir?',
        'Damga vergisi oranları nedir?',
        'Motorlu taşıtlar vergisi hesaplama',
        'Özelge başvurusu nasıl yapılır?',
        'Vergi incelemesi süreçleri',
        'Dijital hizmet vergisi kimleri kapsar?'
      ];

      // Combine recent searches with popular questions, remove duplicates
      const allQuestions = [...new Set([...recentQuestions, ...popularQuestions])];
      
      // Randomly select 4 questions
      const shuffled = allQuestions.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 4);
    } catch (error) {
      console.error('Error getting popular questions:', error);
      // Return default questions if error
      return [
        'KDV iadesi nasıl alınır?',
        'E-fatura zorunluluğu kimleri kapsar?',
        'Gelir vergisi dilimleri 2024',
        'Geçici vergi nasıl hesaplanır?'
      ];
    }
  }
}

// Export singleton instance
export const ragChat = new RAGChatService();