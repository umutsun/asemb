import dotenv from 'dotenv';

dotenv.config();

interface APIKeyConfig {
  provider: string;
  keys: string[];
  currentIndex: number;
  lastUsed: Date;
  rateLimitReset?: Date;
}

class APIKeyManager {
  private configs: Map<string, APIKeyConfig> = new Map();

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys() {
    // Initialize OpenAI keys
    const openaiKeys = this.collectKeys('OPENAI_API_KEY');
    if (openaiKeys.length > 0) {
      this.configs.set('openai', {
        provider: 'openai',
        keys: openaiKeys,
        currentIndex: 0,
        lastUsed: new Date(),
      });
    }

    // Initialize Claude keys
    const claudeKeys = this.collectKeys('CLAUDE_API_KEY');
    if (claudeKeys.length > 0) {
      this.configs.set('claude', {
        provider: 'claude',
        keys: claudeKeys,
        currentIndex: 0,
        lastUsed: new Date(),
      });
    }

    // Initialize Gemini keys
    const geminiKeys = this.collectKeys('GEMINI_API_KEY');
    if (geminiKeys.length > 0) {
      this.configs.set('gemini', {
        provider: 'gemini',
        keys: geminiKeys,
        currentIndex: 0,
        lastUsed: new Date(),
      });
    }

    // Initialize Groq keys
    const groqKeys = this.collectKeys('GROQ_API_KEY');
    if (groqKeys.length > 0) {
      this.configs.set('groq', {
        provider: 'groq',
        keys: groqKeys,
        currentIndex: 0,
        lastUsed: new Date(),
      });
    }
  }

  private collectKeys(prefix: string): string[] {
    const keys: string[] = [];
    
    // Add the main key
    const mainKey = process.env[prefix];
    if (mainKey && mainKey !== 'your-key-here' && !mainKey.includes('your-')) {
      keys.push(mainKey);
    }

    // Add numbered keys (up to 10)
    for (let i = 2; i <= 10; i++) {
      const key = process.env[`${prefix}_${i}`];
      if (key && key !== 'your-key-here' && !key.includes('your-')) {
        keys.push(key);
      }
    }

    return keys;
  }

  public getKey(provider: string): string | null {
    const config = this.configs.get(provider);
    if (!config || config.keys.length === 0) {
      return null;
    }

    // Check if rate limit reset time has passed
    if (config.rateLimitReset && new Date() > config.rateLimitReset) {
      config.rateLimitReset = undefined;
      config.currentIndex = 0; // Reset to first key
    }

    // Get current key
    const key = config.keys[config.currentIndex];
    config.lastUsed = new Date();
    
    return key;
  }

  public rotateKey(provider: string): string | null {
    const config = this.configs.get(provider);
    if (!config || config.keys.length === 0) {
      return null;
    }

    // Move to next key
    config.currentIndex = (config.currentIndex + 1) % config.keys.length;
    config.lastUsed = new Date();

    return config.keys[config.currentIndex];
  }

  public markRateLimited(provider: string, resetTime?: Date) {
    const config = this.configs.get(provider);
    if (!config) return;

    // Set rate limit reset time (default 1 hour from now)
    config.rateLimitReset = resetTime || new Date(Date.now() + 60 * 60 * 1000);
    
    // Try to rotate to next key
    this.rotateKey(provider);
  }

  public getAvailableProviders(): string[] {
    return Array.from(this.configs.keys()).filter(provider => {
      const config = this.configs.get(provider);
      return config && config.keys.length > 0 && !config.rateLimitReset;
    });
  }

  public getAllKeys(provider: string): string[] {
    const config = this.configs.get(provider);
    return config ? [...config.keys] : [];
  }

  public getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [provider, config] of this.configs.entries()) {
      status[provider] = {
        available: config.keys.length,
        currentIndex: config.currentIndex,
        lastUsed: config.lastUsed.toISOString(),
        rateLimited: !!config.rateLimitReset,
        rateLimitReset: config.rateLimitReset?.toISOString(),
      };
    }

    return status;
  }
}

// Singleton instance
const apiKeyManager = new APIKeyManager();

export default apiKeyManager;