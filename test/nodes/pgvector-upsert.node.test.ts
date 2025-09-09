import { PgvectorUpsert } from '../../nodes/PgvectorUpsert.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

jest.mock('pg', () => {
  const query = jest.fn(async () => ({ rows: [{ id: 'X', text: 'hello', metadata: { a: 1 } }] }));
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
  embedText: jest.fn(async () => [0.1, 0.2, 0.3]),
  vectorToSqlArray: (v: number[]) => `[${v.join(',')}]`,
}));

describe('PgvectorUpsert node', () => {
  it('builds INSERT ... ON CONFLICT with vector cast', async () => {
    const node = new PgvectorUpsert();
    const thisArg = makeExecuteStub({
      params: {
        table: 'documents',
        idColumn: 'id',
        textColumn: 'text',
        embeddingColumn: 'embedding',
        textField: 'content',
        idField: '',
        extraColumnsJson: '{"metadata":"metadata"}',
      },
      items: [{ json: { content: 'hello', metadata: { a: 1 } } }],
      credentials: {
        postgresWithVectorApi: { host: 'localhost', port: 5432, database: 'db', user: 'u', password: 'p' },
        openAIApi: { apiKey: 'test', model: 'text-embedding-3-small' },
      },
    });

    const out = await node.execute.call(thisArg);

    // Verify output shape and that mocked pg was called with ::vector literal
    expect(out[0][0].json).toMatchObject({ text: 'hello' });

    const { Client } = jest.requireMock('pg');
    const instance = new (Client as any)();
    const queryMock = instance.query as jest.Mock;
    const lastCall = queryMock.mock.calls[queryMock.mock.calls.length - 1];
    const sql: string = lastCall[0];
    const params: any[] = lastCall[1];
    expect(sql).toMatch(/INSERT INTO "documents"/);
    expect(sql).toMatch(/::vector/);
    // params exclude embedding literal; should include id, text, metadata
    expect(params.length).toBe(4);
    expect(params[1]).toBe('hello');
  });
});
