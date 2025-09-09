import { Request } from 'node-fetch';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Override database connection for tests
process.env.DATABASE_URL = 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb';
process.env.TEST_TABLE_NAME = 'embeddings';
process.env.NODE_ENV = 'test';
process.env.REDIS_DB = '2';

// Global Jest setup for tests
// - Mocks global.fetch to avoid real network calls for embeddings

// Only set a default fetch if not already mocked by a specific test
(global as any).fetch = jest.fn(async (input: Request | URL, init?: RequestInit) => {
  const url = String(input);
  // Mock OpenAI embeddings endpoint used by shared/embedding.ts
  if (url.includes('/v1/embeddings')) {
    const body = typeof init?.body === 'string' ? JSON.parse(init!.body as string) : (init?.body as any);
    const inputs = Array.isArray(body?.input) ? body.input : [body?.input ?? 'test'];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: inputs.map(() => ({ embedding: [0.01, 0.02, 0.03] })),
        usage: { total_tokens: inputs.length * 10 },
      }),
      text: async () => JSON.stringify({ ok: true }),
    } as any;
  }
  // Default OK response
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
    text: async () => 'ok',
  } as any;
});

// Log test database connection
console.log('Test Environment Setup:');
console.log(`- Database: ${process.env.DATABASE_URL}`);
console.log(`- Table: ${process.env.TEST_TABLE_NAME || 'embeddings'}`);
console.log(`- Redis DB: ${process.env.REDIS_DB}`);
