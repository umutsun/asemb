import { preprocessMarkdown, prepareMarkdown } from './chat-markdown';

/**
 * Real malformed answers from bookie_lsemb: the model emits genuine ATX headings but glues the
 * following body sentence onto the heading line, writes numbered items inline, mixes single/double
 * newlines between items, and appends a stray " #" section marker. These fixtures assert the
 * shared preprocessor repairs all of that so every chat template renders them correctly.
 */
const FIXTURE_A =
  '**Lead sentence.** #\n\n' +
  '## Definition of a Qualifying Free Zone Person A **Qualifying Free Zone Person** is defined as meeting these conditions: 1. Maintains adequate substance in the State. 2. Derives Qualifying Income of the relevant kind. 3. Has not elected to be subject to Corporate Tax [3]. #\n\n' +
  '## Income from Immovable Property Income derived from immovable property located in a Free Zone is subject to tax. This includes: 1. Transactions with a Non-Free Zone Person regarding commercial property. 2. Transactions with any Person regarding immovable property that is not commercial property [1]. #';

const FIXTURE_B =
  '**Excise Tax is levied at differing rates.** #\n\n' +
  '## Goods Subject to Excise Tax Excise Tax is levied on the following categories of goods: 1. Tobacco and tobacco products\n\n2. Liquids used in electronic smoking devices\n3. Electronic smoking devices\n4. Carbonated drinks\n5. Energy drinks\n6. Sweetened drinks #\n\n' +
  '## Rates of Excise Tax According to **Cabinet Decision No. 52 of 2019**, the rates are as follows: 1. **50%** on carbonated drinks\n\n2. **100%** on tobacco products\n3. **100%** on energy drinks and electronic smoking devices [1], [2][3]. #';

const FIXTURE_C =
  "**Lead.** ### Gratuity Calculation for Full-time Workers According to **Article 51**, the gratuity entitlement is as follows: 1. For the first five years of service, 21 days' wage per year. 2. For each additional year, 30 days' wage per year [1].";

// Heading + bold-labelled numbered items, split across blocks by the model (items 1-4 glued to the
// heading, item 5 alone, items 6-9 glued). The heading must not eat item 1, the "**Bold label**"
// spans must stay intact (never cut at an "a/an/the" article), and all 9 form one ordered list.
const FIXTURE_D =
  '**To register a business, several steps must be followed.** #\n\n' +
  '## Steps to Register a New Business 1. **Identify a Business Activity** It is essential to determine the specific activity. 2. **Select the Legal Form** Choose an appropriate legal structure. 3. **Apply for a Trade License** Submit an application to operate. 4. **Register the Trade Name** The trade name must comply with the rules [2]\n\n' +
  '5. **Obtain Initial Approval** Acquire initial approval indicating no objections [2]\n\n' +
  '6. **Draft Required Documents** Prepare a Memorandum of Association. 7. **Select a Business Location** Choose a suitable location. 8. **Get Additional Approvals** Depending on the business. 9. **Collect the Business License** After completing the steps [3].';

/** Split into lines and return only the ATX heading lines. */
function headingLines(md: string): string[] {
  return md.split('\n').filter((l) => /^#{1,6}\s+/.test(l));
}

/**
 * Assert the numbered items in `md` form ONE contiguous ordered list: each item starts a line,
 * the numbers are strictly 1..N, and a blank line precedes the first item. This mirrors what
 * remark-gfm needs to emit a single <ol>.
 */
function assertSingleOrderedList(md: string, expectedCount: number): void {
  const lines = md.split('\n');
  const itemLineIdx: number[] = [];
  lines.forEach((l, i) => {
    if (/^\d{1,2}\.\s+\S/.test(l)) itemLineIdx.push(i);
  });
  expect(itemLineIdx.length).toBe(expectedCount);
  // Numbers are 1..N in order.
  itemLineIdx.forEach((idx, n) => {
    expect(lines[idx].startsWith(`${n + 1}. `)).toBe(true);
  });
  // Items are on consecutive lines (a single contiguous block, no non-list line between them).
  for (let k = 1; k < itemLineIdx.length; k++) {
    expect(itemLineIdx[k] - itemLineIdx[k - 1]).toBe(1);
  }
  // A blank line precedes the first item.
  const first = itemLineIdx[0];
  expect(first).toBeGreaterThan(0);
  expect(lines[first - 1]).toBe('');
}

describe('preprocessMarkdown — malformed LLM heading/list repair', () => {
  describe.each([
    ['A', FIXTURE_A],
    ['B', FIXTURE_B],
    ['C', FIXTURE_C],
  ])('fixture %s', (_name, fixture) => {
    const out = preprocessMarkdown(fixture);

    it('no heading line still contains a glued-on body sentence', () => {
      for (const h of headingLines(out)) {
        const title = h.replace(/^#{1,6}\s+/, '');
        // A heading title must not run into a full sentence: no finite verb after the title,
        // and no ": " list intro left on the heading line.
        expect(/\b(is|are|was|were|derived|levied|includes|shall|according)\b/i.test(title)).toBe(false);
        expect(title).not.toMatch(/:\s/);
        // And it stays short (a heading, not a paragraph).
        expect((title.match(/\S+/g) || []).length).toBeLessThanOrEqual(9);
      }
    });

    it('no stray " #" section marker remains', () => {
      // A lone "#" after text/citation (not a real line-start heading marker) must be gone.
      expect(/[^\n#][ \t]+#{1,6}[ \t]*(?:\n|$)/.test(out)).toBe(false);
    });
  });

  it('A: both bodies are separated from their headings and lists are single ordered lists', () => {
    const out = preprocessMarkdown(FIXTURE_A);
    expect(out).toContain('## Definition of a Qualifying Free Zone Person\n\nA ');
    expect(out).toContain('## Income from Immovable Property\n\nIncome derived from ');
    // First list has 3 items, second has 2 — assert each block independently by section.
    const [sec1, sec2] = out.split('## Income from Immovable Property');
    assertSingleOrderedList(sec1, 3);
    assertSingleOrderedList(sec2, 2);
  });

  it('B: the 6 goods render as one ordered list 1..6, rates as one list 1..3', () => {
    const out = preprocessMarkdown(FIXTURE_B);
    expect(out).toContain('## Goods Subject to Excise Tax\n\nExcise Tax is levied ');
    expect(out).toContain('## Rates of Excise Tax\n\nAccording to ');
    const [goods, rates] = out.split('## Rates of Excise Tax');
    assertSingleOrderedList(goods, 6);
    assertSingleOrderedList(rates, 3);
  });

  it('C: inline heading is broken out and body/list separated', () => {
    const out = preprocessMarkdown(FIXTURE_C);
    expect(out).toContain('### Gratuity Calculation for Full-time Workers\n\nAccording to ');
    assertSingleOrderedList(out, 2);
  });

  it('broadens inline numbered-list splitting to the 2-item ": 1. … 2. …" case', () => {
    const input = 'The requirements are as follows: 1. Register for tax. 2. File annual returns.';
    const out = preprocessMarkdown(input);
    assertSingleOrderedList(out, 2);
  });

  it('D: heading + bold-labelled items 1-9 (glued across blocks) → clean h2 + one ordered list', () => {
    const out = preprocessMarkdown(FIXTURE_D);
    // Heading holds only its short title — no list text absorbed.
    expect(out).toContain('## Steps to Register a New Business\n\n1. ');
    expect(headingLines(out)).toEqual(['## Steps to Register a New Business']);
    // Bold label of item 1 is intact (never cut at the "a Business Activity" article).
    expect(out).toContain('1. **Identify a Business Activity** It is essential');
    // All nine steps form one contiguous ordered list.
    assertSingleOrderedList(out.split('## Steps to Register a New Business')[1], 9);
  });
});

describe('preprocessMarkdown — regression guards (no over-splitting)', () => {
  it('leaves a genuinely short heading untouched', () => {
    const input = '## Corporate Tax Rate\n\nThe rate is 9% on taxable income above the threshold.';
    const out = preprocessMarkdown(input);
    expect(headingLines(out)).toEqual(['## Corporate Tax Rate']);
  });

  it('does not split a one-word heading', () => {
    const input = '## Overview\n\nThis section is an overview of the regime.';
    const out = preprocessMarkdown(input);
    expect(headingLines(out)).toEqual(['## Overview']);
  });

  it('does not treat a decimal or version number as a list marker', () => {
    const input = 'The ratio increased to 3.5 in 2019 and 4.2 in 2020 across the region.';
    const out = preprocessMarkdown(input);
    // No spurious ordered-list line was introduced.
    expect(/^\d{1,2}\.\s/m.test(out)).toBe(false);
  });

  it('does not strip a real line-start ATX heading', () => {
    const input = '# Title\n\nSome body text here.';
    const out = preprocessMarkdown(input);
    expect(out).toContain('# Title');
  });

  it('prepareMarkdown wires the same repairs end to end', () => {
    const out = prepareMarkdown(FIXTURE_B);
    expect(out).toContain('## Goods Subject to Excise Tax\n\n');
    expect(/[^\n#][ \t]+#{1,6}[ \t]*(?:\n|$)/.test(out)).toBe(false);
  });
});
