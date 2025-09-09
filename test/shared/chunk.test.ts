import { chunkText } from '../../shared/chunk';

describe('chunkText', () => {
  const lorem = 'a'.repeat(2500);

  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns single chunk when under maxChars', () => {
    const res = chunkText('hello world', { maxChars: 100 });
    expect(res).toEqual(['hello world']);
  });

  it('splits into chunks with default overlap', () => {
    const res = chunkText(lorem, { maxChars: 1000 });
    // With 2500 chars, chunks are [0..999], [900..1899], [1800..2499]
    expect(res.length).toBe(3);
    expect(res[0].length).toBe(1000);
    expect(res[1].startsWith('a'.repeat(100))).toBeTruthy(); // overlap present
  });

  it('honors custom overlap and clamps correctly', () => {
    const res = chunkText(lorem, { maxChars: 500, overlap: 600 });
    // overlap should clamp to maxChars-1 => 499
    expect(res[1].length).toBe(500);
    // Next start index should be 500-499 = 1, so lots of overlap
    expect(res[1][0]).toBe('a');
  });
});
