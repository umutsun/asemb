// verify_fallback.js
const { rest } = require('msw');
const { setupServer } = require('msw/node');
const { EmbeddingService, EmbeddingProvider } = require('./shared/embedding');

// --- Mocking Setup ---

// 1. Mock the transformers library
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn().mockResolvedValue(
    (text, options) => {
      console.log(`[Mock] Transformers pipeline called.`);
      const mockEmbedding = new Array(384).fill(text.length / 100);
      return { data: mockEmbedding };
    }
  ),
}));

// 2. Mock OpenAI API to always fail
const server = setupServer(
  rest.post('https://api.openai.com/v1/embeddings', (req, res, ctx) => {
    console.log('[Mock] OpenAI API called, returning 500 error.');
    return res(ctx.status(500), ctx.json({ error: 'Internal Server Error' }));
  })
);

// --- Verification Logic ---

async function main() {
  console.log('--- Starting Fallback Verification Script ---');
  
  server.listen();

  const textToEmbed = 'This is a test sentence.';
  const config = {
    provider: EmbeddingProvider.OPENAI,
    model: 'text-embedding-ada-002',
    apiKey: 'sk-fake-key',
  };

  // Use a fresh instance for the test
  EmbeddingService.instance = null; 
  const embeddingService = EmbeddingService.getInstance(config);

  try {
    console.log('Calling generateEmbedding, expecting it to fail over...');
    const response = await embeddingService.generateEmbedding(textToEmbed, config);

    // --- Assertions ---
    let success = true;
    if (!response || !response.embedding) {
      console.error('❌ FAILURE: Response or embedding is null.');
      success = false;
    }
    if (response.embedding.length !== 384) {
      console.error(`❌ FAILURE: Embedding dimension is ${response.embedding.length}, expected 384.`);
      success = false;
    }
    if (response.model !== 'Xenova/all-MiniLM-L6-v2') {
      console.error(`❌ FAILURE: Model is '${response.model}', expected 'Xenova/all-MiniLM-L6-v2'.`);
      success = false;
    }
    const expectedValue = textToEmbed.length / 100;
    if (response.embedding[0] !== expectedValue) {
        console.error(`❌ FAILURE: Embedding value is ${response.embedding[0]}, expected ${expectedValue}.`);
        success = false;
    }

    if (success) {
      console.log('✅ SUCCESS: Fallback mechanism works as expected!');
    } else {
      console.log('--- Verification Failed ---');
    }

  } catch (error) {
    console.error('❌ CRITICAL FAILURE: The script threw an unexpected error.', error);
  } finally {
    server.close();
    console.log('--- Verification Script Finished ---');
  }
}

main();
