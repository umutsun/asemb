import { WebScrape } from '../../nodes/WebScrape.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

describe('WebScrape node', () => {
  beforeAll(() => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => '<html><body><div class="c">Hello <b>World</b></div></body></html>',
    }));
  });

  it('extracts text content from selector', async () => {
    const node = new WebScrape();
    const thisArg = makeExecuteStub({
      params: { url: 'https://example.com', selector: '.c', stripHtml: true },
      items: [{ json: {} }],
    });
    const res = await node.execute.call(thisArg);
    expect(res[0][0].json).toEqual({ url: 'https://example.com', selector: '.c', content: 'Hello World' });
  });
});

