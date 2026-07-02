/**
 * Shared chat-answer markdown preparation.
 *
 * LLM answers occasionally arrive with malformed markdown — broken bold headers split
 * across newlines, inline numbered lists, "N. -" list noise, and mangled bold list
 * markers like "**1--   **Title**" that render as literal asterisks. These helpers repair
 * the common cases and normalise paragraph breaks BEFORE the content is handed to
 * ReactMarkdown, so every chat theme (zen01, modern, …) renders consistently.
 *
 * Language-agnostic on purpose: language-specific section labels are stripped server-side
 * in rag-chat.service.ts `fixMarkdownAndCitations()`. Keep this the single source of truth —
 * themes import from here instead of rolling their own.
 */

/** Strip footnote/bibliography tails and collapse excess blank lines. */
export function cleanLLMResponse(content: string): string {
  if (!content) return '';

  return content
    // Remove footnote/bibliography sections (common LLM pattern in any language)
    .replace(/##\s*(?:Dipnotlar|Footnotes|References)[\s\S]*$/gi, '')
    .replace(/\*\*(?:Dipnotlar|Footnotes|References):?\*\*[\s\S]*$/gi, '')
    // Remove standalone bibliography-style reference lists at end: [1] Title\n[2] Title...
    .replace(/\n\s*\[\d+\]\s+[^\n]+(?:\n\s*\[\d+\]\s+[^\n]+)*\s*$/gi, '')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Repair malformed markdown and ensure proper paragraph breaks. */
export function preprocessMarkdown(content: string): string {
  let result = content;

  // ═══ STEP 0: Repair mangled bold list markers ═══
  // "**1--   **Title**" (bold-wrapped number + dashes) → "1. Title"; "**1- Title" → "1. Title".
  // These render as literal asterisks otherwise (the parser sees unbalanced **).
  result = result.replace(/\*\*\s*(\d{1,2})\s*-{1,3}\s*\*\*\s*/g, '$1. ');
  result = result.replace(/\*\*\s*(\d{1,2})\s*-{1,3}\s+/g, '$1. ');

  // ═══ STEP 0b: Reunite a bold closer stranded on its own line ═══
  // LLMs sometimes emit the closing ** of a bold span on the next line:
  //   "**Answer: … 24 months.\n**"  → the lone ** renders as a literal "**" (the exact artifact
  // seen in the modern theme). When a ** sits alone on a line (nothing after it but the line end),
  // attach it to the previous line so the span closes inline. Precise on purpose: it only fires for
  // a truly lone **, so it never mis-closes a legitimate inline "**bold**".
  result = result.replace(/([^\s*])[ \t]*\n+[ \t]*\*\*[ \t]*(?=\n|$)/g, '$1**');

  // ═══ STEP 0c: Reattach a list number stranded on its own line ═══
  // "1.\n\nAn arbitration agreement..." (number alone, its content on the next line) →
  // "1. An arbitration agreement...", so ReactMarkdown renders a real list item instead of a
  // stray "1." trailing the previous paragraph + a separate paragraph.
  result = result.replace(/(^|\n)[ \t]*(\d{1,2})\.[ \t]*\n+[ \t]*(?=\S)/g, '$1$2. ');

  // ═══ STEP 1: Fix broken bold headers (language-agnostic) ═══
  // "**2.\nHeader:**" → "**2. Header:**"
  result = result.replace(/\*\*(\d)\.\s*\n\s*/g, '**$1. ');

  // Ensure bold numbered section headers get their own line
  result = result.replace(/([^\n])\s*(\*\*[1-9]\.\s+[^*]+:\*\*)/g, '$1\n\n$2');

  // ═══ STEP 2: Fix inline bold sub-headers ═══
  result = result.replace(/([^\n])(\s)(\*\*[^*]{2,50}:\*\*)/g, '$1\n\n$3');

  // Fix "N. -" list format → "N. " (remove redundant dash)
  result = result.replace(/(\d{1,2})\.\s+-\s+/g, '$1. ');

  // ═══ STEP 3: Fix inline numbered lists ═══
  const inlineListPattern = /(?:[.!?:;]\s*)\d{1,2}\.\s+\S[\s\S]*?(?:\s)\d{1,2}\.\s+\S[\s\S]*?(?:\s)\d{1,2}\.\s+\S/;
  if (inlineListPattern.test(result)) {
    result = result.replace(/([.!?:;,])\s+(\d{1,2})\.\s+/g, (match, punct, num) => {
      const numInt = parseInt(num, 10);
      if (numInt >= 1 && numInt <= 30) {
        return `${punct}\n\n${num}. `;
      }
      return match;
    });
  }

  // ═══ STEP 4: Fix single newlines between paragraphs (language-agnostic) ═══
  result = result
    .replace(/([.!?])(\s*\[\d+\])?\n(?!\n)([A-ZÀ-ɏ])/g, '$1$2\n\n$3');

  // ═══ STEP 5: Handle warning emoji and dividers ═══
  result = result.replace(/([^\n])(⚠️)/g, '$1\n\n$2');
  result = result.replace(/([^\n])(---)/g, '$1\n\n$2');

  // ═══ STEP 6: Paragraph breaking for wall-of-text (no structure) ═══
  const paragraphCount = (result.match(/\n\n/g) || []).length;
  const sentenceCount = (result.match(/[.!?](?:\s*\[\d+\])*\s/g) || []).length;
  const hasBoldHeaders = (result.match(/\*\*[^*]+:\*\*/g) || []).length >= 2;

  if (!hasBoldHeaders && sentenceCount >= 4 && paragraphCount < 2) {
    let sentenceCounter = 0;
    result = result.replace(/([.!?])(\s*\[\d+\]*)(\s+)([A-ZÀ-ɏ])/g,
      (_match, punct, citations, _space, nextChar) => {
        sentenceCounter++;
        if (sentenceCounter % 3 === 0) {
          return `${punct}${citations || ''}\n\n${nextChar}`;
        }
        return `${punct}${citations || ''} ${nextChar}`;
      }
    );
  }

  // ═══ STEP 7: Clean up ═══
  result = result.replace(/\n{3,}/g, '\n\n');

  // ═══ STEP 8: Balance an orphaned trailing bold marker (odd count of **) ═══
  // Prevents a stray "**" (e.g. left by a mangled marker) from disabling bold rendering.
  if (((result.match(/\*\*/g) || []).length % 2) === 1) {
    result = result.replace(/\*\*([^*]*)$/, '$1');
  }

  return result;
}

/** Convenience: clean then preprocess, ready for ReactMarkdown. */
export function prepareMarkdown(content: string): string {
  return preprocessMarkdown(cleanLLMResponse(content || ''));
}
