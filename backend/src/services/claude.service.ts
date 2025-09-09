import Anthropic from '@anthropic-ai/sdk';

export class ClaudeService {
  private client: Anthropic | null = null;
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY || null;
    if (this.apiKey) {
      this.initialize();
    }
  }

  private initialize() {
    if (!this.apiKey) return;
    
    try {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
      console.log('✅ Claude API initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Claude API:', error);
    }
  }

  public isAvailable(): boolean {
    return this.client !== null;
  }

  public async generateResponse(
    query: string,
    context: string,
    history: any[] = []
  ): Promise<{ content: string }> {
    if (!this.client) {
      throw new Error('Claude API not initialized');
    }

    try {
      const systemPrompt = `Sen Türkiye vergi ve mali mevzuat konusunda deneyimli, güler yüzlü bir danışmansın.
      
GÖREV:
- Kullanıcının sorularına sade, anlaşılır ve pratik cevaplar ver
- Teknik terimleri kullanırken mutlaka açıklama ekle
- Örneklerle konuyu somutlaştır
- Kısa ve öz cevaplar ver, gereksiz detaylara girme
- Varsa pratik öneriler sun

KAYNAK KULLANIMI:
- Eğer bağlamda bilgi varsa, önce onu kullan
- Kaynak gösterirken sadece [Kaynak 1] gibi basit referanslar kullan
- Bağlamda bilgi yoksa, genel bilgini kullan ama "Veritabanında bu konuda spesifik bilgi bulamadım ancak..." diyerek başla

ÜSLUP:
- Samimi ve profesyonel ol
- Karmaşık konuları basitleştir
- Madde işaretleri veya numaralandırma kullan
- Önemli noktaları vurgula

YANITINDA BULUNMASI GEREKENLER:
1. Konunun özeti (1-2 cümle)
2. Pratik bilgiler (maddeler halinde)
3. Varsa dikkat edilmesi gerekenler
4. Kısa bir kapanış

Bağlam:
${context || 'Henüz veritabanında bu konuyla ilgili spesifik bilgi bulunmuyor.'}`;

      const messages: Anthropic.MessageParam[] = [];
      
      // Add history
      history.forEach(h => {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.content
        });
      });
      
      // Add current query
      messages.push({
        role: 'user',
        content: query
      });

      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307', // Fast and cost-effective
        max_tokens: 1000,
        temperature: 0.3,
        system: systemPrompt,
        messages: messages
      });

      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');

      return {
        content: textContent || 'Yanıt oluşturulamadı.'
      };
    } catch (error: any) {
      console.error('Claude API error:', error);
      throw error;
    }
  }
}

export default new ClaudeService();