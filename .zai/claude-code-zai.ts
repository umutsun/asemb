import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

// .env dosyasını yükle
dotenv.config();

export interface CodeGenerationRequest {
  prompt: string;
  language?: string;
  framework?: string;
  context?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface CodeGenerationResponse {
  code: string;
  explanation: string;
  language: string;
  framework?: string;
  suggestions?: string[];
}

export class ClaudeCodeZAI {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(apiKey?: string, baseUrl?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.ZAI_API_KEY || '';
    this.baseUrl = baseUrl || 'https://zai.ai/api/v1';
    this.defaultModel = defaultModel || 'glm-4.5';
    
    if (!this.apiKey) {
      throw new Error('Z.AI API anahtarı gereklidir. Lütfen ZAI_API_KEY ortam değişkenini ayarlayın.');
    }
  }

  async generateCode(options: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    const {
      prompt,
      language = 'javascript',
      framework,
      context = '',
      maxTokens = 1000,
      temperature = 0.3,
      model = this.defaultModel
    } = options;

    const systemPrompt = this.createSystemPrompt(language, framework, context);
    
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature,
      stream: false
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

      const responseData = await response.json() as any;
      const content = responseData.choices[0]?.message?.content || '';
      
      return this.parseCodeResponse(content, language, framework);
    } catch (error) {
      throw new Error(`Kod oluşturma başarısız: ${(error as Error).message}`);
    }
  }

  private createSystemPrompt(language: string, framework?: string, context = ''): string {
    let prompt = `Sen Claude Code CLI'sin, bir kod yazma asistanısın. `;
    prompt += `Kullanıcının isteklerini ${language} dilinde kod üreterek yanıtlıyorsun.\n\n`;
    
    if (framework) {
      prompt += `Kullanılan framework: ${framework}\n`;
    }
    
    if (context) {
      prompt += `Bağlam:\n${context}\n\n`;
    }
    
    prompt += `Kurallar:\n`;
    prompt += `1. Temiz, okunabilir ve iyi yapılandırılmış kod üret\n`;
    prompt += `2. Gerekli yorumları ekle\n`;
    prompt += `3. Hata yönetimi için uygun yapılar kullan\n`;
    prompt += `4. En iyi pratikleri takip et\n`;
    prompt += `5. Kodun ne yaptığını açıklayan kısa bir açıklama ekle\n`;
    prompt += `6. Varsa öneriler veya iyileştirmeler listele\n\n`;
    
    prompt += `Yanıt formatı:\n`;
    prompt += `\`\`\`${language}\n[kod buraya]\n\`\`\`\n\n`;
    prompt += `**Açıklama:**\n[kodun açıklaması]\n\n`;
    prompt += `**Öneriler:**\n- [öneri 1]\n- [öneri 2]\n`;
    
    return prompt;
  }

  private parseCodeResponse(content: string, language: string, framework?: string): CodeGenerationResponse {
    // Kod bloğunu çıkar
    const codeBlockMatch = content.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
    const code = codeBlockMatch ? codeBlockMatch[1].trim() : '';
    
    // Açıklamayı çıkar
    const explanationMatch = content.match(/\*\*Açıklama:\*\*\n([\s\S]*?)(?=\n\*\*Öneriler:|\n\n|$)/);
    const explanation = explanationMatch ? explanationMatch[1].trim() : '';
    
    // Önerileri çıkar
    const suggestionsMatch = content.match(/\*\*Öneriler:\*\*\n([\s\S]*?)(?=\n\n|$)/);
    let suggestions: string[] = [];
    
    if (suggestionsMatch) {
      suggestions = suggestionsMatch[1]
        .split('\n')
        .map(line => line.replace(/^[-*]\s*/, '').trim())
        .filter(line => line.length > 0);
    }
    
    return {
      code,
      explanation,
      language,
      framework,
      suggestions
    };
  }

  async *generateCodeStream(options: CodeGenerationRequest): AsyncGenerator<CodeGenerationResponse> {
    const {
      prompt,
      language = 'javascript',
      framework,
      context = '',
      maxTokens = 1000,
      temperature = 0.3,
      model = this.defaultModel
    } = options;

    const systemPrompt = this.createSystemPrompt(language, framework, context);
    
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: maxTokens,
      temperature,
      stream: true
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

      const reader = (response.body as any)?.getReader?.();
      const decoder = new TextDecoder();
      let fullContent = '';

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
              // Tam yanıt geldiğinde parse et ve gönder
              const result = this.parseCodeResponse(fullContent, language, framework);
              yield result;
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              if (content) {
                fullContent += content;
              }
            } catch (e) {
              // JSON parse hatalarını yoksay
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Kod oluşturma stream hatası: ${(error as Error).message}`);
    }
  }

  async saveCodeToFile(code: string, filename: string, directory = './generated-code'): Promise<string> {
    // Dizin oluştur
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    const filepath = path.join(directory, filename);
    fs.writeFileSync(filepath, code, 'utf8');
    
    return filepath;
  }

  async generateAndSave(options: CodeGenerationRequest, filename: string): Promise<{ filepath: string; response: CodeGenerationResponse }> {
    const response = await this.generateCode(options);
    const filepath = await this.saveCodeToFile(response.code, filename);
    
    return { filepath, response };
  }
}

// CLI için yardımcı fonksiyonlar
export async function runClaudeCodeZAI() {
  const client = new ClaudeCodeZAI();
  
  console.log('🤖 Claude Code Z.AI - GLM-4.5 Kod Yazma Asistanı');
  console.log('📝 Çıkmak için "exit" yazın\n');
  
  while (true) {
    const prompt = await new Promise<string>((resolve) => {
      process.stdout.write('Claude Code> ');
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
      console.log('🔄 Kod oluşturuluyor...\n');
      
      const response = await client.generateCode({
        prompt,
        language: 'typescript',
        maxTokens: 1500,
        temperature: 0.3
      });
      
      console.log('💻 Oluşturulan Kod:');
      console.log('```typescript');
      console.log(response.code);
      console.log('```\n');
      
      console.log('📖 Açıklama:');
      console.log(response.explanation);
      
      if (response.suggestions && response.suggestions.length > 0) {
        console.log('\n💡 Öneriler:');
        response.suggestions.forEach((suggestion, index) => {
          console.log(`${index + 1}. ${suggestion}`);
        });
      }
      
      console.log('\n' + '='.repeat(50));
      
    } catch (error) {
      console.error(`❌ Hata: ${(error as Error).message}\n`);
    }
  }
}

// Doğrudan kullanım için
if (require.main === module) {
  runClaudeCodeZAI().catch(console.error);
}