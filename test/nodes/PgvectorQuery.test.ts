
import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { PgvectorQuery } from '../../nodes/PgvectorQuery.node';
import { Pool } from 'pg';

// Mock the 'pg' library
jest.mock('pg', () => {
  const mPool = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('PgvectorQuery', () => {
  it('should execute the query and return the results', async () => {
    const executeFunctions: IExecuteFunctions = {
      getCredentials: jest.fn().mockResolvedValue({
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
      }),
      getNodeParameter: jest.fn((name: string, index: number) => {
        if (name === 'table') return 'test_table';
        if (name === 'embeddingColumn') return 'embedding';
        if (name === 'queryText') return 'test query';
        if (name === 'returnColumnsCsv') return '*';
        if (name === 'topK') return 5;
        if (name === 'distanceOp') return '<->';
        return null;
      }),
      getInputData: jest.fn().mockReturnValue([
        {
          json: {},
        },
      ]),
      continueOnFail: jest.fn().mockReturnValue(false),
      getNode: jest.fn().mockReturnValue({
        getCredentials: (type: string) => {
            return {
                host: 'localhost',
                port: 5432,
                database: 'test',
                user: 'test',
                password: 'test',
            }
        },
        getNodeParameter: (name: string, index: number) => {
            if (name === 'table') return 'test_table';
            if (name === 'embeddingColumn') return 'embedding';
            if (name === 'queryText') return 'test query';
            if (name === 'returnColumnsCsv') return '*';
            if (name === 'topK') return 5;
            if (name === 'distanceOp') return '<->';
            return null;
        },
        getInputData: () => {
            return [
                {
                    json: {},
                },
            ]
        },
        continueOnFail: () => false,
        getName: () => 'PgvectorQuery',
        getType: () => 'pgvectorQuery',
        getExecutionId: () => 'test-execution'
      }),
    } as any;

    // Mock the database query result
    const mockQueryResult = {
      rows: [
        { id: 1, content: 'result 1' },
        { id: 2, content: 'result 2' },
      ],
    };
    const mPool = new Pool();
    (mPool.connect as jest.Mock).mockResolvedValue({
      query: jest.fn().mockResolvedValue(mockQueryResult),
      release: jest.fn(),
    });

    const pgvectorQuery = new PgvectorQuery();
    const result = await pgvectorQuery.execute.call(executeFunctions);

    expect(result).toBeDefined();
    expect(result[0][0].json).toEqual({ id: 1, content: 'result 1' });
  });
});
