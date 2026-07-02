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
 *
 * Language-specific repairs (Turkish OCR spacing) are opt-in via the `lang` option and only
 * run when the content language is Turkish, so English/Arabic answers are never corrupted.
 */

export interface PrepareMarkdownOptions {
  /** Language of the content (e.g. 'tr', 'ar', 'en'). Turkish-specific repairs only run for 'tr'. */
  lang?: string;
}

const isTurkish = (lang?: string): boolean => (lang || '').toLowerCase().startsWith('tr');

/**
 * Fix Turkish OCR/PDF spacing: "çal ı şanlara" → "çalışanlara".
 * OCR engines often break words around Turkish special chars (ı ş ğ ç ü ö İ Ş Ğ Ç Ü Ö).
 * Only call this for Turkish content — it can merge legitimate words in other languages.
 */
export function fixTurkishOCRSpacing(text: string): string {
  if (!text) return '';
  const trChars = 'ıİşŞğĞçÇüÜöÖ';
  const letters = `a-zA-Z${trChars}`;
  // letter + space + Turkish special char(s) + letter → merge
  // e.g. "çal ı şanlara" → "çalışanlara", "f ıkras" → "fıkras"
  let result = text;
  // Pass 1: "x ı", "x ş", etc. — letter, space, single Turkish char, followed by letter
  result = result.replace(
    new RegExp(`([${letters}]) ([${trChars}])(?=[${letters}])`, 'g'),
    '$1$2'
  );
  // Pass 2: "ş x", "ğ x", etc. — Turkish char, space, letter
  result = result.replace(
    new RegExp(`([${trChars}]) ([${letters}])`, 'g'),
    (match, p1, p2) => {
      // Only merge if at least one side is lowercase (avoids joining two capitalised words)
      if (p1 === p1.toLowerCase() || p2 === p2.toLowerCase()) {
        return p1 + p2;
      }
      return match;
    }
  );
  // Pass 3: remaining isolated single Turkish chars: "say ılı" → "sayılı"
  result = result.replace(
    new RegExp(`([${letters}]) ([${trChars}][${letters}])`, 'g'),
    '$1$2'
  );
  return result;
}

/**
 * Clean a citation/source title coming from OCR'd or database content.
 * Generic repairs (timestamps, dot runs, spaced-out capitals, "No:" spacing) always run;
 * the Turkish OCR word-spacing fix only runs when `opts.lang` is Turkish.
 */
export function cleanCitationTitle(title: string, opts?: PrepareMarkdownOptions): string {
  if (!title) return '';

  let result = title
    // Remove time portion from dates (00:00:00, 12:30:45, etc.)
    .replace(/\s+\d{2}:\d{2}:\d{2}$/g, '')
    .replace(/\s+\d{2}:\d{2}:\d{2}\s/g, ' ')
    // Remove long sequences of dots/periods (likely placeholder text)
    .replace(/\.{4,}/g, '')
    // Fix single-letter OCR spacing: "C O U N C I L" -> "COUNCIL" (3+ consecutive single letters)
    .replace(/\b([A-ZÀ-ɏ]) ([A-ZÀ-ɏ]) ([A-ZÀ-ɏ](?:\s[A-ZÀ-ɏ])*)\b/g,
      (m) => m.replace(/ /g, ''))
    // Fix abbreviations: "T.C.D" -> "T.C. D"
    .replace(/(\.[A-Z])\.([A-Z])/g, '$1. $2')
    // Fix "No:2018" -> "No: 2018"
    .replace(/No:(\d)/g, 'No: $1')
    // Fix "2018/280Word" -> "2018/280 Word"
    .replace(/(\d{4}\/\d+)([A-ZÀ-ɏ])/g, '$1 $2');

  if (isTurkish(opts?.lang)) {
    result = fixTurkishOCRSpacing(result);
  }

  // Clean multiple spaces
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Heuristic RTL detection for legacy messages that don't carry a `language` field:
 * true when more than 30% of the letters are Arabic-script characters.
 */
export function detectRtl(text: string): boolean {
  if (!text) return false;
  const arabicChars = text.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g)?.length ?? 0;
  if (arabicChars === 0) return false;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return letters > 0 && arabicChars / letters > 0.3;
}

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

/**
 * Convenience: clean then preprocess, ready for ReactMarkdown.
 * Zero-arg behavior is unchanged; passing `{ lang: 'tr' }` additionally repairs
 * Turkish OCR word spacing (never applied to other languages).
 */
export function prepareMarkdown(content: string, opts?: PrepareMarkdownOptions): string {
  let result = preprocessMarkdown(cleanLLMResponse(content || ''));
  if (isTurkish(opts?.lang)) {
    result = fixTurkishOCRSpacing(result);
  }
  return result;
}
