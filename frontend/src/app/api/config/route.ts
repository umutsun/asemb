import { NextRequest, NextResponse } from 'next/server';

const defaultConfig = {
  app: {
    name: 'Alice Semantic Bridge',
    description: 'AI-Powered Knowledge Management System',
    version: '1.0.0',
    locale: 'tr'
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'alice_semantic_bridge',
    user: 'postgres',
    password: 'postgres',
    ssl: false,
    maxConnections: 20,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
  },
  openai: {
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
    model: 'gpt-4-turbo-preview',
    embeddingModel: 'text-embedding-3-small',
    maxTokens: 4096,
    temperature: 0.7,
  },
  anthropic: {
    apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
    model: 'claude-3-opus-20240229',
    maxTokens: 4096,
  },
  deepseek: {
    apiKey: process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY || '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-coder',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama2',
    embeddingModel: 'nomic-embed-text',
  },
  huggingface: {
    apiKey: process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY || '',
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    endpoint: 'https://api-inference.huggingface.co/models/',
  },
  n8n: {
    url: 'http://localhost:5678',
    apiKey: '',
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
    systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver.',
    activeChatModel: 'openai/gpt-4-turbo-preview',
    activeEmbeddingModel: 'openai/text-embedding-3-small',
    responseStyle: 'professional',
    language: 'tr',
  }
};

let currentConfig = { ...defaultConfig };

export async function GET() {
  return NextResponse.json(currentConfig);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    currentConfig = { ...currentConfig, ...body };
    
    return NextResponse.json({ 
      success: true, 
      message: 'Configuration updated successfully',
      config: currentConfig 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update configuration' },
      { status: 500 }
    );
  }
}