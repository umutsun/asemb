
import { SemanticSearchService } from '../../src/services/semantic-search.service';
import pool from '../../src/config/database';
import { OpenAI } from 'openai';

// Mock the database pool
jest.mock('../../src/config/database', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

// Mock OpenAI
jest.mock('openai');

const mockedPool = pool as jest.Mocked<typeof pool>;
const mockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Since the constructor of SemanticSearchService creates a new OpenAI instance,
    // we need to mock the implementation for all instances of the class.
    mockedOpenAI.mockImplementation(() => {
      return {
        embeddings: {
          create: jest.fn(),
        },
      } as any;
    });
    service = new SemanticSearchService();
  });

  describe('generateEmbedding', () => {
    it('should generate mock embedding if OpenAI is not used', async () => {
      (service as any).useOpenAI = false;
      const embedding = await service.generateEmbedding('test');
      expect(embedding).toHaveLength(1536);
      const openaiInstance = (service as any).openai;
      expect(openaiInstance.embeddings.create).not.toHaveBeenCalled();
    });

    it('should generate embedding using OpenAI if available', async () => {
      (service as any).useOpenAI = true;
      const mockEmbedding = new Array(1536).fill(0.1);
      const openaiInstance = (service as any).openai;
      (openaiInstance.embeddings.create as jest.Mock).mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      const embedding = await service.generateEmbedding('test');
      
      expect(embedding).toEqual(mockEmbedding);
      expect(openaiInstance.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: 'test',
      });
    });

    it('should fallback to mock embedding if OpenAI fails', async () => {
      (service as any).useOpenAI = true;
      const openaiInstance = (service as any).openai;
      (openaiInstance.embeddings.create as jest.Mock).mockRejectedValue(new Error('API Error'));

      const embedding = await service.generateEmbedding('test');
      expect(embedding).toHaveLength(1536);
      expect(embedding.some(v => v !== 0)).toBe(true);
    });
  });

  describe('keywordSearch', () => {
    it('should perform a keyword search and return formatted results', async () => {
      const mockRows = [
        { id: '1', title: 'SORUCEVAP - Test', source_table: 'sorucevap', source_id: '1', excerpt: 'Answer', priority: 1 },
      ];
      (mockedPool.query as jest.Mock).mockResolvedValue({ rows: mockRows });

      const results = await service.keywordSearch('test');
      
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(90);
      expect(mockedPool.query).toHaveBeenCalledWith(expect.any(String), ['%test%', 10]);
    });

    it('should return an empty array on database error', async () => {
      (mockedPool.query as jest.Mock).mockRejectedValue(new Error('DB Error'));
      const results = await service.keywordSearch('test');
      expect(results).toEqual([]);
    });
  });

  describe('semanticSearch', () => {
    it('should fallback to keyword search if no embeddings exist', async () => {
      (mockedPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ count: '0' }] });
      
      const keywordResults = [{ id: '1', title: 'Keyword Result', score: 90 }];
      const keywordSearchSpy = jest.spyOn(service, 'keywordSearch').mockResolvedValue(keywordResults as any);

      const results = await service.semanticSearch('test');

      expect(results).toEqual(keywordResults);
      expect(keywordSearchSpy).toHaveBeenCalledWith('test', 10);
    });

    it('should perform semantic search if embeddings exist', async () => {
      (mockedPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ count: '10' }] });
      
      const mockEmbedding = new Array(1536).fill(0.1);
      jest.spyOn(service, 'generateEmbedding').mockResolvedValue(mockEmbedding);

      const searchResults = [
        { id: '1', title: 'Semantic Result', excerpt: 'Content', source_table: 'TEST', source_id: '1', metadata: {}, similarity_score: '0.9', keyword_boost: '0.1' }
      ];
      (mockedPool.query as jest.Mock).mockResolvedValueOnce({ rows: searchResults });

      const results = await service.semanticSearch('test');

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(100);
      expect(results[0].relevanceScore).toBe(0.9);
      expect(mockedPool.query).toHaveBeenCalledWith(expect.stringContaining('<=>'), [JSON.stringify(mockEmbedding), 10, '%test%']);
    });
  });

  describe('hybridSearch', () => {
    it('should return semantic search results if they exist', async () => {
        const semanticResults = [
            { id: '1', title: 'Semantic Result', score: 95, relevanceScore: 0.95 }
        ];
        const semanticSearchSpy = jest.spyOn(service, 'semanticSearch').mockResolvedValue(semanticResults as any);

        const results = await service.hybridSearch('test');

        expect(results).toHaveLength(1);
        expect(results[0].semantic_score).toBe(0.95);
        expect(semanticSearchSpy).toHaveBeenCalledWith('test', 10);
    });

    it('should fallback to keyword search if semantic search returns no results', async () => {
        jest.spyOn(service, 'semanticSearch').mockResolvedValue([]);
        const keywordResults = [{ id: '1', title: 'Keyword Result', score: 90 }];
        const keywordSearchSpy = jest.spyOn(service, 'keywordSearch').mockResolvedValue(keywordResults as any);

        const results = await service.hybridSearch('test');

        expect(results).toHaveLength(1);
        expect(results[0].keyword_score).toBe(1);
        expect(keywordSearchSpy).toHaveBeenCalledWith('test', 10);
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats from the database', async () => {
      const statsRows = [
        { source_table: 'SORUCEVAP', count: '100' },
        { source_table: 'OZELGELER', count: '50' },
      ];
      const embeddingsRow = [{ count: '75' }];

      (mockedPool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: statsRows })
        .mockResolvedValueOnce({ rows: embeddingsRow });

      const stats = await service.getStats();

      expect(stats.total).toBe(150);
      expect(stats.totalWithEmbeddings).toBe(75);
      expect(stats.bySource).toHaveLength(2);
      expect(stats.bySource[0].count).toBe('100');
    });

     it('should return zeroed stats on database error', async () => {
      (mockedPool.query as jest.Mock).mockRejectedValue(new Error('DB Error'));
      const stats = await service.getStats();
      expect(stats.total).toBe(0);
      expect(stats.totalWithEmbeddings).toBe(0);
      expect(stats.bySource).toEqual([]);
    });
  });
});
