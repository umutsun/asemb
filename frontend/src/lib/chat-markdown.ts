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

// Finite verbs / clause markers that reliably signal an ATX heading's Title-Case phrase has
// ended and body prose has begun (e.g. "Excise Tax **is** levied …"). Used only to locate the
// title/body seam inside a heading line — never to rewrite the words themselves.
const PIVOT_VERB =
  '(?:is|are|was|were|has|have|had|includes?|consists?|comprises?|covers?|applies|means?|refers?|requires?|provides?|states?|specifies|defines?|derived|levied|imposed|calculated|determined|governed|regulated|entitled|granted|shall|may|must|will|can|should)';
// Sentence connectors that begin body prose after a heading title ("Rates of Excise Tax
// **According to** Cabinet Decision …").
const CONNECTOR =
  '(?:According\\s+to|Pursuant\\s+to|In\\s+accordance|As\\s+per|Under\\s+the|Based\\s+on)';
// Small function words allowed to sit inside a Title-Case heading phrase without ending it.
const HEADING_SMALL_WORD = new Set([
  'of', 'the', 'a', 'an', 'to', 'for', 'and', 'or', 'in', 'on', 'with', 'by', 'from', 'as', 'at', 'per',
]);

/**
 * Locate the character offset in a heading's text (`rest`, everything after the `#`s) where the
 * short Title-Case title ends and a body sentence begins — or -1 when the whole line is a
 * legitimate heading with no glued-on body. Pure/deterministic; no external state.
 *
 * Two signals, leftmost wins:
 *  (1) a sentence connector ("According to …") that begins the body;
 *  (2) a finite verb (PIVOT_VERB): the body's subject is found either at a repeated Title-Case
 *      token before the verb (the LLM restated the topic to start the body — e.g.
 *      "Goods Subject to Excise Tax **Excise** Tax is levied …") or, absent a repeat, at a
 *      bounded capitalized subject just before the verb.
 * A split is only accepted when it leaves a real title (>= 2 words) and a real body (>= 3 words),
 * so genuinely short headings ("Rates of Excise Tax", "Overview") are never split.
 */
function headingBodyBoundary(rest: string): number {
  const words = [...rest.matchAll(/\S+/g)];
  const candidates: number[] = [];

  const connM = new RegExp('\\s(' + CONNECTOR + ')\\b').exec(rest);
  if (connM) candidates.push(connM.index + 1);

  const verbRe = new RegExp('^' + PIVOT_VERB + '$', 'i');
  let vi = -1;
  for (let k = 1; k < words.length; k++) {
    if (verbRe.test(words[k][0])) { vi = k; break; }
  }

  if (vi >= 1) {
    const norm = (t: string): string => t.replace(/[^A-Za-z0-9%]/g, '').toLowerCase();
    let seam = -1;
    const seen = new Map<string, number>();
    for (let k = 0; k < vi; k++) {
      const key = norm(words[k][0]);
      if (!key || HEADING_SMALL_WORD.has(words[k][0].toLowerCase())) continue;
      if (seen.has(key)) { seam = k; break; }
      seen.set(key, k);
    }
    if (seam >= 2) {
      // The repeated token starts the body subject, but an article that begins the body
      // sentence ("A", "The", "An") may sit just before it — pull it into the body too.
      let bs = seam;
      while (bs - 1 >= 2 && /^(a|an|the)$/i.test(words[bs - 1][0])) bs--;
      candidates.push(words[bs].index);
    } else {
      // No restated topic: back up a bounded capitalized subject before the verb, keeping
      // >= 2 title words.
      let s = vi;
      let backed = 0;
      while (s - 1 >= 2 && backed < 5) {
        const raw = words[s - 1][0];
        if (/^[*_"'([]*[A-Z0-9]/.test(raw) || HEADING_SMALL_WORD.has(raw.toLowerCase())) { s--; backed++; }
        else break;
      }
      if (s >= 2 && s < words.length && s < vi) candidates.push(words[s].index);
    }
  }

  if (candidates.length === 0) return -1;
  const b = Math.min(...candidates);
  const titleWords = (rest.slice(0, b).match(/\S+/g) || []).length;
  const bodyWords = (rest.slice(b).match(/\S+/g) || []).length;
  if (titleWords < 2 || bodyWords < 3) return -1;
  return b;
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

  // ═══ STEP 0d: Strip stray end-of-section "#" artifacts ═══
  // LLMs sometimes append a lone "#" as a section terminator after text or a citation
  // ("taxation. #", "products #", "[3]. #"). A "#" preceded by a space and non-"#" text is
  // never a valid ATX heading (those start the line), so remove it. Runs BEFORE the
  // heading-body split so the boundary detector sees clean lines.
  result = result.replace(/([^\n#])[ \t]+#{1,6}[ \t]*(?=\n|$)/g, '$1');

  // ═══ STEP 0e: Move an inline ATX heading onto its own line ═══
  // "**Lead.** ### Gratuity Calculation …" — a heading glued mid-line onto preceding text.
  // Break it out so STEP 2b can split its title from its body. Guard requires a real marker
  // (space + 1-6 "#" + space + capital/quote/bold-open) so "C# code" / "#1" never match.
  result = result.replace(/([^\n#])[ \t]+(#{1,6})[ \t]+(?=[A-Z*_"'])/g, '$1\n\n$2 ');

  // ═══ STEP 1: Fix broken bold headers (language-agnostic) ═══
  // "**2.\nHeader:**" → "**2. Header:**"
  result = result.replace(/\*\*(\d)\.\s*\n\s*/g, '**$1. ');

  // Ensure bold numbered section headers get their own line
  result = result.replace(/([^\n])\s*(\*\*[1-9]\.\s+[^*]+:\*\*)/g, '$1\n\n$2');

  // ═══ STEP 2: Fix inline bold sub-headers ═══
  result = result.replace(/([^\n])(\s)(\*\*[^*]{2,50}:\*\*)/g, '$1\n\n$3');

  // Fix "N. -" list format → "N. " (remove redundant dash)
  result = result.replace(/(\d{1,2})\.\s+-\s+/g, '$1. ');

  // ═══ STEP 2b: Split a body sentence glued onto an ATX heading (the biggest fix) ═══
  // "## Income from Immovable Property Income derived from …" renders the whole sentence as a
  // giant heading. Keep only the short Title-Case title on the heading line and move the body
  // to a new paragraph: "## Income from Immovable Property\n\nIncome derived from …". Runs
  // before STEP 2c/3 so the list splitters see clean lines; genuinely short headings are left
  // untouched (see headingBodyBoundary).
  result = result.replace(/^(#{1,6})[ \t]+(.+)$/gm, (line, hashes: string, rest0: string) => {
    const rest = rest0.trim();
    const boundary = headingBodyBoundary(rest);
    if (boundary <= 0) return line;
    // If the computed body would start AT or AFTER the first inline numbered-list marker, the
    // "body" is really a list item — splitting here can cut inside a "**Bold label**" (the
    // a/an/the article heuristic). Let STEP 2c split the list off the heading instead. Only split
    // when the prose boundary is strictly BEFORE the list (heading + prose + list, e.g. fixture A).
    const listMarker = rest.search(/\s\d{1,2}\.\s/);
    if (listMarker >= 0 && boundary >= listMarker) return line;
    const title = rest.slice(0, boundary).trim();
    const body = rest.slice(boundary).trim();
    if (!title || !body) return line;
    return `${hashes} ${title}\n\n${body}`;
  });

  // ═══ STEP 2c: Break a numbered list item that is embedded inside an ATX heading ═══
  // "## Marriage Procedure 1. First item 2. Second" — the ## heading absorbs the first list
  // item. Pull the first numbered item (and everything after) out of the heading line so
  // ReactMarkdown can render them as separate blocks.
  result = result.replace(/^(#{1,6}\s+[^\n]+?)\s+(\d{1,2})\.\s+/gm, '$1\n\n$2. ');

  // ═══ STEP 3: Fix inline numbered lists ═══
  // Fire when TWO or more numbered items run inline after a sentence end or a ":"/heading-body
  // intro — e.g. "This includes: 1. Transactions … 2. Transactions …" (a common 2-item case that
  // the old >= 3 guard let slip through). The (?<!\d) look-behind keeps decimals/citations
  // ("2018.", "[3].") from being mistaken for list markers.
  const inlineListPattern = /(?:[.!?:;]\s+|:\s+)\d{1,2}\.\s+\S[\s\S]*?\s\d{1,2}\.\s+\S/;
  if (inlineListPattern.test(result)) {
    result = result.replace(/(?<!\d)([.!?:;,])[ \t]+(\d{1,2})\.\s+/g, (match, punct, num) => {
      const numInt = parseInt(num, 10);
      if (numInt >= 1 && numInt <= 30) {
        return `${punct}\n\n${num}. `;
      }
      return match;
    });
  }

  // ═══ STEP 3b: Normalise numbered-list-item newlines ═══
  // The model mixes single and double newlines between "N." items (example B: items 1-2 split by
  // a blank line, 2-6 by single newlines). remark-gfm needs a blank line BEFORE the first item
  // and the items on consecutive lines to parse ONE contiguous <ol>. Collapse blank lines
  // between consecutive items to a single newline, then ensure a blank line precedes the first.
  let prevList: string;
  do {
    prevList = result;
    result = result.replace(/^(\d{1,2}\.[ \t]+.*)\n\n+(?=\d{1,2}\.[ \t])/gm, '$1\n');
  } while (result !== prevList);
  result = result.replace(/^([^\n].*\S)\n(\d{1,2}\.[ \t]+)/gm, (m, before: string, item: string) => {
    if (/^\d{1,2}\.[ \t]/.test(before)) return m; // previous line is itself a list item
    return `${before}\n\n${item}`;
  });

  // ═══ STEP 4: Fix single newlines between paragraphs (language-agnostic) ═══
  // (?<!\d) — a period right after a digit is a list marker ("4.") or a number
  // ("2018."), not a sentence end; breaking there orphans the list number at
  // the end of the previous paragraph.
  result = result
    .replace(/(?<!\d)([.!?])(\s*\[\d+\])?\n(?!\n)([A-ZÀ-ɏ])/g, '$1$2\n\n$3');

  // ═══ STEP 5: Handle warning emoji and dividers ═══
  result = result.replace(/([^\n])(⚠️)/g, '$1\n\n$2');
  result = result.replace(/([^\n])(---)/g, '$1\n\n$2');

  // ═══ STEP 6: Paragraph breaking for wall-of-text (no structure) ═══
  const paragraphCount = (result.match(/\n\n/g) || []).length;
  const sentenceCount = (result.match(/[.!?](?:\s*\[\d+\])*\s/g) || []).length;
  const hasBoldHeaders = (result.match(/\*\*[^*]+:\*\*/g) || []).length >= 2;

  if (!hasBoldHeaders && sentenceCount >= 4 && paragraphCount < 2) {
    let sentenceCounter = 0;
    // (?<!\d): never treat a list marker ("4.") or bare number as a sentence
    // end — the every-3rd-sentence break would land AFTER the number and strand
    // it at the end of the previous paragraph.
    result = result.replace(/(?<!\d)([.!?])(\s*\[\d+\]*)(\s+)([A-ZÀ-ɏ])/g,
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

  // ═══ STEP 7b: Remove trailing ATX close markers / stray # at line end ═══
  // LLMs sometimes emit "sentence. ##" or "bold text ## " at end of a line.
  // A trailing # preceded by a space is never valid CommonMark — strip it.
  result = result.replace(/[ \t]+#{1,6}[ \t]*$/gm, '');

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
