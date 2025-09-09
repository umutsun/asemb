import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { PgHybridQuery } from '../nodes/PgHybridQuery.node';
import { Client } from 'pg';

// Mock the embedText function
jest.mock('../shared/embedding', () => ({
  embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  vectorToSqlArray: jest.fn().mockReturnValue('[0.1,0.2,0.3]'),
}));

// Mock the pg Client
const mockQuery = jest.fn();
jest.mock('pg', () => {
  return {
    Client: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      query: mockQuery,
      end: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('PgHybridQuery', () => {
  let executeFunctions: IExecuteFunctions;

  beforeEach(() => {
    jest.clearAllMocks();
    executeFunctions = {
      getNodeParameter: jest.fn(),
      getCredentials: jest.fn().mockResolvedValue({
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpassword',
      }),
      getNode: jest.fn().mockReturnValue({
        getNode: jest.fn(),
        getWorkflow: jest.fn(),
        id: 'test-node',
        name: 'Test Node',
        type: 'pgHybridQuery',
        typeVersion: 1,
        getExecuteTime: jest.fn(),
        toJSON: jest.fn(),
      }),
    } as unknown as IExecuteFunctions;
  });

  it('should generate and execute a valid hybrid query', async () => {
    // Arrange
    (executeFunctions.getNodeParameter as jest.Mock).mockImplementation((name: string) => {
      const params: { [key: string]: any } = {
        table: 'documents',
        tsvColumn: 'tsv',
        embeddingColumn: 'embedding',
        language: 'english',
        queryText: 'search query',
        returnColumnsCsv: 'id, content',
        topK: 10,
        distanceOp: '<=>',
        bm25Weight: 0.4,
        vecWeight: 0.6,
      };
      return params[name];
    });

    const mockRows = [{ id: 1, content: 'result content', score: 0.9 }];
    mockQuery.mockResolvedValue({ rows: mockRows });

    const node = new PgHybridQuery();

    // Act
    const result = await node.execute.call(executeFunctions);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json).toEqual(mockRows[0]);

    expect(Client).toHaveBeenCalledWith({
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
      password: 'testpassword',
      ssl: undefined,
    });

    const expectedSql = `SELECT id, content,
        ts_rank_cd("tsv", plainto_tsquery($1, $2)) AS bm25,
        (1.0 / (1.0 + ("embedding" <=> $3::vector))) AS vecsim,
        (ts_rank_cd("tsv", plainto_tsquery($1, $2)) * $4
          + (1.0 / (1.0 + ("embedding" <=> $3::vector))) * $5) AS score
        FROM "documents"
        WHERE "tsv" @@ plainto_tsquery($1, $2)
        ORDER BY score DESC
        LIMIT $6`;

    // Normalize whitespace for comparison
    const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
    expect(normalize(mockQuery.mock.calls[0][0])).toBe(normalize(expectedSql));

    expect(mockQuery.mock.calls[0][1]).toEqual([
      'english',
      'search query',
      '[0.1,0.2,0.3]',
      0.4,
      0.6,
      10,
    ]);
  });

  it('should throw NodeOperationError on database error', async () => {
    // Arrange
    (executeFunctions.getNodeParameter as jest.Mock).mockReturnValue('some_value');
    const errorMessage = 'database connection failed';
    mockQuery.mockRejectedValue(new Error(errorMessage));

    const node = new PgHybridQuery();

    // Act & Assert
    await expect(node.execute.call(executeFunctions)).rejects.toThrow(NodeOperationError);
    await expect(node.execute.call(executeFunctions)).rejects.toThrow(errorMessage);
  });
});
