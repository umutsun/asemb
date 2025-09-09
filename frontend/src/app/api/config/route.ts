import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
  app: {
    name: 'Alice Semantic Bridge',
    description: 'AI-Powered Knowledge Management System',
    version: '1.0.0',
    locale: 'tr'
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'alice_semantic_bridge',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    maxConnections: 20,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4-turbo-preview',
    embeddingModel: 'text-embedding-3-small',
    maxTokens: 4096,
    temperature: 0.7,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-3-opus-20240229',
    maxTokens: 4096,
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-coder',
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: 'llama2',
    embeddingModel: 'nomic-embed-text',
  },
  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY || '',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    endpoint: 'https://api-inference.huggingface.co/models/',
  },
  n8n: {
    url: process.env.N8N_URL || 'http://localhost:5678',
    apiKey: process.env.N8N_API_KEY || '',
  },
  scraper: {
    timeout: 30000,
    maxConcurrency: 3,
    userAgent: 'ASB Web Scraper',
  },
  embeddings: {
    chunkSize: 1000,
    chunkOverlap: 200,
    batchSize: 10,
    provider: 'openai',
  },
  dataSource: {
    useLocalDb: true,
    localDbPercentage: 100,
    externalApiPercentage: 0,
    hybridMode: false,
    prioritySource: 'local',
  },
  llmSettings: {
    temperature: 0.1,
    topP: 0.9,
    maxTokens: 2048,
    presencePenalty: 0,
    frequencyPenalty: 0,
    ragWeight: 95,
    llmKnowledgeWeight: 5,
    streamResponse: true,
    systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
    activeChatModel: 'openai/gpt-4-turbo-preview',
    activeEmbeddingModel: 'openai/text-embedding-3-small',
    responseStyle: 'professional',
    language: 'tr',
  },
};

// Get configuration
export async function GET() {
  try {
    // Try to read config file
    try {
      const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
      const config = JSON.parse(configData);
      return NextResponse.json(config);
    } catch (error) {
      // If file doesn't exist, return default config
      return NextResponse.json(DEFAULT_CONFIG);
    }
  } catch (error) {
    console.error('Error reading config:', error);
    return NextResponse.json(
      { error: 'Failed to read configuration' },
      { status: 500 }
    );
  }
}

// Update configuration
export async function PUT(request: NextRequest) {
  try {
    const newConfig = await request.json();
    
    // Merge with default config to ensure all fields exist
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...newConfig,
      app: {
        ...DEFAULT_CONFIG.app,
        ...(newConfig.app || {})
      },
      database: {
        ...DEFAULT_CONFIG.database,
        ...(newConfig.database || {})
      },
      redis: {
        ...DEFAULT_CONFIG.redis,
        ...(newConfig.redis || {})
      },
      openai: {
        ...DEFAULT_CONFIG.openai,
        ...(newConfig.openai || {})
      },
      anthropic: {
        ...DEFAULT_CONFIG.anthropic,
        ...(newConfig.anthropic || {})
      },
      deepseek: {
        ...DEFAULT_CONFIG.deepseek,
        ...(newConfig.deepseek || {})
      },
      ollama: {
        ...DEFAULT_CONFIG.ollama,
        ...(newConfig.ollama || {})
      },
      huggingface: {
        ...DEFAULT_CONFIG.huggingface,
        ...(newConfig.huggingface || {})
      },
      n8n: {
        ...DEFAULT_CONFIG.n8n,
        ...(newConfig.n8n || {})
      },
      scraper: {
        ...DEFAULT_CONFIG.scraper,
        ...(newConfig.scraper || {})
      },
      embeddings: {
        ...DEFAULT_CONFIG.embeddings,
        ...(newConfig.embeddings || {})
      },
      dataSource: {
        ...DEFAULT_CONFIG.dataSource,
        ...(newConfig.dataSource || {})
      },
      llmSettings: {
        ...DEFAULT_CONFIG.llmSettings,
        ...(newConfig.llmSettings || {})
      },
    };
    
    // Save to file
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(mergedConfig, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      message: 'Configuration saved successfully',
      config: mergedConfig 
    });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 }
    );
  }
}

// Test connection endpoints
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const service = url.pathname.split('/').pop();
    
    // This would be used for /api/config/test/[service] routes
    // For now, return success for testing
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Connection test failed' },
      { status: 500 }
    );
  }
}