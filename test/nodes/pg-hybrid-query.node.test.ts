import { PgHybridQuery } from '../../nodes/PgHybridQuery.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

jest.mock('pg', () => {
  const query = jest.fn(async () => ({ rows: [{ id: '1', score: 1.23 }] }));
  const connect = jest.fn(async () => undefined);
  const end = jest.fn(async () => undefined);
  const Client = function(this: any) {
    this.query = query;
    this.connect = connect;
    this.end = end;
  } as any;
  return { Client };
});

jest.mock('../../shared/embedding', () => ({
  embedText: jest.fn(async () => [0.4, 0.6]),
  vectorToSqlArray: (v: number[]) => `[${v.join(',')}]`,
}));

describe('PgHybridQuery node', () => {
  it('builds hybrid score with bm25 and vecsim', async () => {
    const node = new PgHybridQuery();
    const thisArg = makeExecuteStub({
      params: {
        table: 'documents', tsvColumn: 'tsv', embeddingColumn: 'embedding',
        language: 'english', queryText: 'test', returnColumnsCsv: '*',
        topK: 10, distanceOp: '<->', bm25Weight: 0.3, vecWeight: 0.7,
      },
      items: [{ json: {} }],
      credentials: {
        postgresWithVectorApi: { host: 'localhost', port: 5432, database: 'db', user: 'u', password: 'p' },
        openAIApi: { apiKey: 'k', model: 'text-embedding-3-small' },
      },
    });
    const out = await node.execute.call(thisArg);
    expect(out[0][0].json).toMatchObject({ id: '1' });

    const { Client } = jest.requireMock('pg');
    const inst = new (Client as any)();
    const lastCall = (inst.query as jest.Mock).mock.calls.pop();
    const sql: string = lastCall[0];
    const params: any[] = lastCall[1];
    expect(sql).toMatch(/ts_rank_cd\("tsv", plainto_tsquery\(\$1, \$2\)\) AS bm25/);
    expect(params[2]).toBe('[0.4,0.6]');
    expect(sql).toMatch(/ORDER BY score DESC\s+LIMIT \$6/);
  });
});

