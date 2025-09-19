import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// .env dosyasını yükle
dotenv.config();

export interface ZAIRequestOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  stream?: boolean;
}

export interface ZAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class ZAIClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(apiKey?: string, baseUrl?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.ZAI_API_KEY || '';
    this.baseUrl = baseUrl || 'https://zai.ai/api/v1';
    this.defaultModel = defaultModel || 'gpt-4-turbo';
    
    if (!this.apiKey) {
      throw new Error('Z.AI API anahtarı gereklidir. Lütfen ZAI_API_KEY ortam değişkenini ayarlayın veya constructor\'a geçirin.');
    }
  }

  async generateText(options: ZAIRequestOptions): Promise<ZAIResponse> {
    const {
      prompt,
      maxTokens = 150,
      temperature = 0.7,
      model = this.defaultModel,
      stream = false
    } = options;

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature,
      stream
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Z.AI API Hatası: ${response.status} - ${errorData}`);
      }

      const data = await response.json() as ZAIResponse;
      return data;
    } catch (error) {
      throw new Error(`Z.AI API isteği başarısız: ${(error as Error).message}`);
    }
  }

  async generateTextSimple(prompt: string, maxTokens?: number): Promise<string> {
    try {
      const response = await this.generateText({
        prompt,
        maxTokens
      });
      
      return response.choices[0]?.message?.content || 'Yanıt alınamadı.';
    } catch (error) {
      return `Hata: ${(error as Error).message}`;
    }
  }

  async *generateTextStream(options: ZAIRequestOptions): AsyncGenerator<string> {
    const payload = {
      ...options,
      stream: true
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: [
            {
              role: 'user',
              content: options.prompt
            }
          ],
          max_tokens: options.maxTokens || 150,
          temperature: options.temperature || 0.7,
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Z.AI API Hatası: ${response.status} - ${errorData}`);
      }

      const reader = (response.body as any)?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Stream okunamadı');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch (e) {
              // JSON parse hatalarını yoksay
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Z.AI API stream hatası: ${(error as Error).message}`);
    }
  }
}

// CLI için yardımcı fonksiyonlar
export async function runZAIInteractive() {
  const client = new ZAIClient();
  
  console.log('🤖 Z.AI CLI - Çıkmak için "exit" yazın\n');
  
  while (true) {
    const prompt = await new Promise<string>((resolve) => {
      process.stdout.write('Siz: ');
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });

    if (prompt.toLowerCase() === 'exit') {
      console.log('👋 Görüşürüz!');
      break;
    }

    if (!prompt) {
      continue;
    }

    try {
      process.stdout.write('Z.AI: ');
      
      for await (const chunk of client.generateTextStream({
        prompt,
        maxTokens: 500,
        temperature: 0.7
      })) {
        process.stdout.write(chunk);
      }
      
      console.log('\n');
    } catch (error) {
      console.error(`Hata: ${(error as Error).message}\n`);
    }
  }
}

// Doğrudan kullanım için
if (require.main === module) {
  runZAIInteractive().catch(console.error);
}