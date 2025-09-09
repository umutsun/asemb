import { TextChunk } from '../../nodes/TextChunk.node';
import { makeExecuteStub } from '../helpers/n8nStubs';

describe('TextChunk node', () => {
  it('emits items for each chunk', async () => {
    const node = new TextChunk();
    const thisArg = makeExecuteStub({
      params: { textField: 'content', maxChars: 5, overlap: 2, outputField: 'chunk' },
      items: [{ json: { content: 'abcdefg' } }],
    });
    const out = await node.execute.call(thisArg);
    const rows = out[0].map((i: any) => i.json);
    expect(rows).toEqual([
      { content: 'abcdefg', chunk: 'abcde' },
      { content: 'abcdefg', chunk: 'defg' },
    ]);
  });
});

