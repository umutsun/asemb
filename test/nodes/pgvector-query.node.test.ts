import { PgvectorQuery } from '../../nodes/PgvectorQuery.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

jest.mock('pg', () => {
  const query = jest.fn(async () => ({ rows: [{ id: '1', text: 'foo' }] }));
  const connect = jest.fn(async () => undefined);
  const release = jest.fn();
  const end = jest.fn(async () => undefined);
  
  const Client = function(this: any) {
    this.query = query;
    this.connect = connect;
    this.end = end;
  } as any;
  
  const Pool = function(this: any) {
    this.connect = jest.fn(async () => ({
      query,
      release
    }));
    this.end = end;
    this.on = jest.fn();
  } as any;
  
  return { Client, Pool };
});

jest.mock('../../shared/embedding', () => ({
  embedText: jest.fn(async () => [0.5, 0.5]),
  vectorToSqlArray: (v: number[]) => `[${v.join(',')}]`,
}));

describe('PgvectorQuery node', () => {
  it('executes similarity search with configured operator', async () => {
    const node = new PgvectorQuery();
    const thisArg = makeExecuteStub({
      params: {
        table: 'documents',
        embeddingColumn: 'embedding',
        queryText: 'hello',
        returnColumnsCsv: '*',
        topK: 5,
        distanceOp: '<->',
      },
      items: [{ json: {} }],
      credentials: {
        postgresWithVectorApi: { host: 'localhost', port: 5432, database: 'db', user: 'u', password: 'p' },
        openAIApi: { apiKey: 'test', model: 'text-embedding-3-small' },
      },
    });
    const out = await node.execute.call(thisArg);
    expect(out[0][0].json).toMatchObject({ id: '1', text: 'foo' });

    const { Client } = jest.requireMock('pg');
    const instance = new (Client as any)();
    const queryMock = instance.query as jest.Mock;
    const lastCall = queryMock.mock.calls[queryMock.mock.calls.length - 1];
    const sql: string = lastCall[0];
    const params: any[] = lastCall[1];
    expect(sql).toMatch(/ORDER BY "embedding" <-> \[0.5,0.5\]::vector LIMIT \$1/);
    expect(params).toEqual([5]);
  });
});
