import { SitemapFetch } from '../../nodes/SitemapFetch.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

describe('SitemapFetch node', () => {
  beforeAll(() => {
    // @ts-ignore
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/a</loc></url>
          <url><loc>https://example.com/b</loc></url>
          <url><loc>https://example.com/c</loc></url>
        </urlset>`
    }));
  });

  it('parses <loc> tags and outputs urls', async () => {
    const node = new SitemapFetch();
    const thisArg = makeExecuteStub({
      params: { sitemapUrl: 'https://example.com/sitemap.xml', maxUrls: 2 },
      items: [{ json: {} }],
    });
    const out = await node.execute.call(thisArg);
    expect(out[0].map((i) => i.json)).toEqual([
      { url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
    ]);
  });
});

