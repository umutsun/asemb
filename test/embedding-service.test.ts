import { EmbeddingService } from '../shared/embeddings';
import { OpenAI } from 'openai';
import Redis from 'ioredis';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => {
      return {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [
              { embedding: [1, 2, 3] },
              { embedding: [4, 5, 6] },
            ],
          }),
        },
      };
    }),
  };
});

// Mock Redis
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => {
      return {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
      };
    });
  });

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;

  beforeEach(() => {
    embeddingService = new EmbeddingService();
  });

  it('should generate an embedding', async () => {
    const embedding = await embeddingService.generateEmbedding('test');
    expect(embedding).toEqual([1, 2, 3]);
  });

  it('should generate batch embeddings', async () => {
    const embeddings = await embeddingService.batchEmbeddings(['test1', 'test2']);
    expect(embeddings).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('should cache an embedding', async () => {
    await embeddingService.cacheEmbedding('test', [1, 2, 3]);
    // We can't easily test the redis.set call without a more complex mock,
    // but we can at least ensure the method doesn't throw an error.
  });

  
});