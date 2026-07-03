import { cleanExcerpt } from './source-presentation';

/**
 * cleanExcerpt turns a raw retrieval chunk fragment into a more readable citation
 * excerpt WITHOUT fabricating content. The fixtures below are the kind of mid-word /
 * mid-sentence starts the chunker produces (chunk boundaries cut inside a word or a
 * sentence), which used to render as "clude a copy of his passport…".
 */
describe('cleanExcerpt', () => {
  it('drops a leading mid-word fragment and starts at the first capitalized word', () => {
    const raw = 'clude a copy of his passport, a valid residence visa. The applicant must submit these documents.';
    const result = cleanExcerpt(raw);
    expect(result.startsWith('The applicant must submit')).toBe(true);
    // The mangled leading fragment is gone.
    expect(result).not.toContain('clude a copy');
  });

  it('capitalizes the first letter when the whole text is lowercase (no capital start)', () => {
    const raw = 'natural or legal persons who conduct business are subject to registration';
    const result = cleanExcerpt(raw);
    expect(result).toBe('Natural or legal persons who conduct business are subject to registration');
  });

  it('leaves an already-clean, capitalized excerpt untouched (aside from whitespace)', () => {
    const raw = 'Federal Decree-Law No. 47 of 2022 governs corporate taxation in the State.';
    expect(cleanExcerpt(raw)).toBe(raw);
  });

  it('collapses internal newlines and repeated whitespace to single spaces', () => {
    const raw = 'The Authority\n\n  may   issue\ta clarification.';
    expect(cleanExcerpt(raw)).toBe('The Authority may issue a clarification.');
  });

  it('trims leading and trailing whitespace', () => {
    const raw = '   The registrant shall keep records for five years.   ';
    expect(cleanExcerpt(raw)).toBe('The registrant shall keep records for five years.');
  });

  it('does not append its own ellipsis (the CSS clamp shows truncation)', () => {
    const raw = 'The Authority may request additional documents from the applicant';
    expect(cleanExcerpt(raw).endsWith('…')).toBe(false);
  });

  it('preserves a trailing ellipsis the source already had', () => {
    const raw = 'The Authority may request additional documents…';
    expect(cleanExcerpt(raw)).toBe('The Authority may request additional documents…');
  });

  it('returns the trimmed original when dropping the fragment would leave too little text', () => {
    // Lowercase start but the only capitalized word is a short trailing token, so the
    // candidate would be shorter than the safety floor — fall back to capitalizing.
    const raw = 'ompany.';
    const result = cleanExcerpt(raw);
    // Not blanked out; still contains the original body.
    expect(result.length).toBeGreaterThan(0);
    expect(result.toLowerCase()).toContain('ompany');
  });

  it('leaves non-Latin (Arabic) scripts collapsed but otherwise unchanged', () => {
    const raw = '  يجب على المكلف تقديم المستندات   المطلوبة  ';
    expect(cleanExcerpt(raw)).toBe('يجب على المكلف تقديم المستندات المطلوبة');
  });

  it('returns empty string for empty / whitespace-only input', () => {
    expect(cleanExcerpt('')).toBe('');
    expect(cleanExcerpt('   \n  ')).toBe('');
  });
});
