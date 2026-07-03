'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ResponseSchema,
  ResponseSection,
  getActiveSchema
} from '@/types/chatbot-features';

/**
 * Clean citation/source title from database formatting issues
 * Fixes: "T.C.D A N I Ş T A Y" -> "T.C. DANIŞTAY"
 * Fixes: "DAİREEsas No:" -> "DAİRE Esas No:"
 */
function cleanCitationTitle(title: string): string {
  if (!title) return '';

  return title
    // Fix spaced letters like "D A N I Ş T A Y" -> "DANIŞTAY"
    .replace(/([A-ZÇĞİÖŞÜ])\s+(?=[A-ZÇĞİÖŞÜ]\s*[A-ZÇĞİÖŞÜ])/g, '$1')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5$6$7$8')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5$6$7')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5$6')
    .replace(/([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])\s+([A-ZÇĞİÖŞÜ])/g, '$1$2$3$4$5')
    // Fix "T.C.D" -> "T.C. D" (add space after T.C.)
    .replace(/T\.C\.D/g, 'T.C. D')
    // Fix merged words: "DAİREEsas" -> "DAİRE Esas"
    .replace(/DAİRE([A-Z])/g, 'DAİRE $1')
    .replace(/DAIRE([A-Z])/g, 'DAİRE $1')
    // Fix "Esas No:2018" -> "Esas No: 2018"
    .replace(/No:(\d)/g, 'No: $1')
    // Fix "2018/280Karar" -> "2018/280 Karar"
    .replace(/(\d{4}\/\d+)([A-ZÇĞİÖŞÜ])/g, '$1 $2')
    // Fix "TEMYİZ EDEN" spacing
    .replace(/(\d+)TEMYİZ/g, '$1 TEMYİZ')
    .replace(/(\d+)TEMYIZ/g, '$1 TEMYİZ')
    // Fix "(DAVALI):" spacing
    .replace(/\(DAVALI\):/g, '(DAVALI): ')
    .replace(/\(DAVACI\):/g, '(DAVACI): ')
    // Fix "Tarih:" spacing
    .replace(/DAİRETarih:/g, 'DAİRE Tarih:')
    .replace(/DAIRETarih:/g, 'DAİRE Tarih:')
    // Clean multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface ParsedContent {
  [sectionId: string]: string;
}

interface SchemaRendererProps {
  content: string;
  schemaId?: string;
  schema?: ResponseSchema;
  keywords?: string[];
  dayanaklar?: string[];
  className?: string;
  messageId?: string;  // For citation scroll targeting
  // Optional ORIGINAL-source-index -> ordinal display number map (built by the
  // message component after source dedup). When provided, inline [n] cites show
  // the renumbered ordinal; without it they show the original numbers.
  citationDisplayMap?: Map<number, number>;
}

/**
 * Parse backend-formatted response content into sections
 * Uses schema's backendLabel to dynamically parse sections
 *
 * Backend format (dynamic based on schema):
 *   SECTION_LABEL:
 *   content
 */
function parseContentBySections(content: string, schema: ResponseSchema): ParsedContent {
  const parsed: ParsedContent = {};

  // Get sections with backendLabels, sorted by order
  const sectionsWithLabels = schema.sections
    .filter(s => s.backendLabel)
    .sort((a, b) => a.order - b.order);

  if (sectionsWithLabels.length === 0) {
    // No schema labels defined, return content as-is for first text section
    const textSection = schema.sections.find(s => s.style === 'text');
    if (textSection) {
      parsed[textSection.id] = cleanLLMSectionHeaders(content);
    }
    return parsed;
  }

  // Build list of all backend labels for lookahead pattern
  const allLabels = sectionsWithLabels
    .map(s => escapeRegex(s.backendLabel!.replace(':', '')))
    .join('|');

  // Check if content has any of the schema's backend labels
  const hasSchemaFormat = sectionsWithLabels.some(s =>
    new RegExp(`\\n?${escapeRegex(s.backendLabel!)}`, 'm').test(content)
  );

  if (hasSchemaFormat) {
    // Parse each section dynamically using schema's backendLabels
    for (let i = 0; i < sectionsWithLabels.length; i++) {
      const section = sectionsWithLabels[i];
      const label = escapeRegex(section.backendLabel!.replace(':', ''));

      // Build lookahead for next sections
      const nextLabels = sectionsWithLabels
        .slice(i + 1)
        .map(s => escapeRegex(s.backendLabel!.replace(':', '')))
        .join('|');

      // Create pattern: LABEL:\s*\n?(content)(?=\nNEXT_LABEL:|$)
      const lookahead = nextLabels ? `(?=\\n(?:${nextLabels}):)` : '$';
      const pattern = new RegExp(`${label}:\\s*\\n?([\\s\\S]*?)${lookahead}`);

      const match = content.match(pattern);
      if (match?.[1]?.trim()) {
        let sectionContent = match[1].trim();
        // Clean LLM headers from assessment/text sections
        if (section.style === 'text') {
          sectionContent = cleanLLMSectionHeaders(sectionContent);
        }
        parsed[section.id] = sectionContent;
      }
    }
  } else {
    // Check for legacy formats (numbered or markdown headers)
    const hasLegacyFormat = /\d\)\s*(?:SORUNUN\s*KONUSU|KONU|DEĞERLENDİRME)/i.test(content) ||
                           /##\s*(?:Konu|Değerlendirme)/i.test(content);

    if (hasLegacyFormat) {
      // Try legacy numbered format
      const legacyKonu = content.match(/1\)\s*(?:SORUNUN\s*)?KONU[SU]?[:\s]*([\s\S]*?)(?=2\)|3\)|4\)|##|$)/i);
      const legacyDegerlendirme = content.match(/4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*([\s\S]*?)(?=5\)|SON\s*BÖLÜM|DİPNOTLAR|$)/i);

      if (legacyKonu?.[1]) parsed['konu'] = legacyKonu[1].trim();
      if (legacyDegerlendirme?.[1]) {
        parsed['degerlendirme'] = cleanLLMSectionHeaders(legacyDegerlendirme[1].trim());
      }

      // Try markdown format if no degerlendirme found
      if (!parsed['degerlendirme']) {
        const mdDegerlendirme = content.match(/##\s*Değerlendirme\s*\n([\s\S]*?)(?=##|$)/i);
        if (mdDegerlendirme?.[1]) {
          parsed['degerlendirme'] = cleanLLMSectionHeaders(mdDegerlendirme[1].trim());
        }
      }
    }

    // Final fallback: use entire content as main text section (usually degerlendirme)
    if (Object.keys(parsed).length === 0) {
      const mainTextSection = schema.sections.find(s => s.style === 'text' && s.required);
      const sectionId = mainTextSection?.id || 'degerlendirme';
      parsed[sectionId] = cleanLLMSectionHeaders(cleanSectionHeaders(content));
    }
  }

  return parsed;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Clean LLM-generated section headers that may have leaked through
 * Removes numbered headers (1) SORUNUN KONUSU), markdown headers (## Konu), etc.
 */
function cleanLLMSectionHeaders(content: string): string {
  return content
    // Remove numbered section headers from LLM
    .replace(/1\)\s*SORUNUN\s*KONUSU[:\s]*/gi, '')
    .replace(/2\)\s*ANAHTAR\s*KELİMELER[:\s]*[^\n]*\n?/gi, '')
    .replace(/3\)\s*(?:İLGİLİ\s*)?YASAL\s*DÜZENLEMELER[^\n]*[\s\S]*?(?=4\)|$)/gi, '')
    .replace(/4\)\s*(?:VERGİLEX\s*)?DEĞERLENDİRME[Sİ]?[:\s]*/gi, '')
    .replace(/5\)\s*DİPNOTLAR[\s\S]*$/gi, '')
    // Remove markdown section headers
    .replace(/##\s*Konu\s*\n/gi, '')
    .replace(/##\s*Değerlendirme\s*\n/gi, '')
    .replace(/##\s*Anahtar\s*(?:Terim|Kelime)[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi, '')
    .replace(/##\s*Dayanaklar[^\n]*[\s\S]*?(?=##|\n\n\n|$)/gi, '')
    .replace(/##\s*Dipnotlar[\s\S]*$/gi, '')
    // Remove SON BÖLÜM: DİPNOTLAR
    .replace(/SON\s*BÖLÜM[:\s]*DİPNOTLAR[\s\S]*$/gi, '')
    // Remove **CEVAP** **ALINTI** style headers
    .replace(/\*\*CEVAP\*\*\s*\n?/gi, '')
    .replace(/\*\*ALINTI\*\*[\s\S]*?(?=\*\*[A-ZÇĞİÖŞÜ]|\n\n\n|$)/gi, '')
    // Clean multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Clean remaining section headers from content
 */
function cleanSectionHeaders(content: string): string {
  return content
    .replace(/\d\)\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+[:\s]*/g, '')
    .replace(/##\s*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+\n/g, '')
    .replace(/\*\*[A-ZÇĞİÖŞÜa-zçğıöşü\s]+:?\*\*[:\s]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Schema-based Response Renderer
 * Renders LLM response according to configured schema sections
 */
export const SchemaRenderer: React.FC<SchemaRendererProps> = ({
  content,
  schemaId,
  schema: customSchema,
  keywords = [],
  dayanaklar = [],
  className = '',
  messageId,
  citationDisplayMap
}) => {
  // Get schema - prefer custom, then by ID, then default
  const schema = customSchema || getActiveSchema(schemaId);

  // Parse content into sections
  const parsedContent = React.useMemo(() =>
    parseContentBySections(content, schema),
    [content, schema]
  );

  // Get visible sections in order
  const visibleSections = schema.sections
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className={`schema-response ${className}`}>
      {visibleSections.map(section => {
        // Get content based on source and section type
        let sectionContent: string | string[] | null = null;

        // First check parsed content (backend includes these in the response)
        if (parsedContent[section.id]) {
          const parsed = parsedContent[section.id];
          // Convert string to array for tags/citation styles
          if (section.style === 'tags' && typeof parsed === 'string') {
            sectionContent = parsed.split(',').map(s => s.trim()).filter(Boolean);
          } else if (section.style === 'citation' && typeof parsed === 'string') {
            sectionContent = parsed.split('\n').map(s => s.trim()).filter(Boolean);
          } else {
            sectionContent = parsed;
          }
        }
        // Fallback to props if not in parsed content
        else if (section.source === 'backend') {
          if (section.id === 'anahtar_terimler' && keywords.length > 0) {
            sectionContent = keywords;
          } else if (section.id === 'dayanaklar' && dayanaklar.length > 0) {
            sectionContent = dayanaklar;
          }
        }

        // Skip empty sections (unless required)
        if (!sectionContent && !section.required) {
          return null;
        }
        // Skip empty arrays
        if (Array.isArray(sectionContent) && sectionContent.length === 0) {
          return null;
        }

        return (
          <SectionRenderer
            key={section.id}
            section={section}
            content={sectionContent}
            messageId={messageId}
            citationDisplayMap={citationDisplayMap}
          />
        );
      })}

      {/* Fallback: If no sections rendered, show raw content
          (counsel-prose keys colors to the container's own theme class) */}
      {visibleSections.length === 0 && (
        <div className="counsel-prose max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

/**
 * Individual Section Renderer
 */
interface SectionRendererProps {
  section: ResponseSection;
  content: string | string[] | null;
  messageId?: string;
  citationDisplayMap?: Map<number, number>;
}

const SectionRenderer: React.FC<SectionRendererProps> = ({ section, content, messageId, citationDisplayMap }) => {
  if (!content) return null;

  switch (section.style) {
    case 'heading':
      return (
        <div className="mb-4">
          <h3 className="mb-1 text-sm font-semibold text-[var(--counsel-ink)]">
            {section.label}
          </h3>
          <p className="text-base font-medium text-[var(--counsel-ink)]">
            {typeof content === 'string' ? content : content.join(' ')}
          </p>
        </div>
      );

    case 'tags':
      const tags = Array.isArray(content) ? content : content.split(',').map(s => s.trim());
      return (
        <div className="mb-4">
          {/* Hide label for keywords - show tags directly as quiet chips */}
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded border border-[var(--counsel-hairline)] px-2.5 py-0.5 text-xs text-[var(--counsel-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      );

    case 'citation':
      const rawCitations = Array.isArray(content) ? content : content.split('\n').filter(Boolean);
      // Filter out generic/meaningless citations
      const GENERIC_TERMS = ['belge', 'kaynak', 'document', 'source', 'dosya', 'file', 'döküman', 'doküman'];
      const citations = rawCitations.filter(cite => {
        const cleaned = cite.trim().toLowerCase();
        // Skip if citation is just a generic term or too short to be meaningful (min 10 chars for legal refs)
        if (cleaned.length < 10) return false;
        if (GENERIC_TERMS.some(term => cleaned === term || cleaned.includes(term) && cleaned.length < 15)) return false;
        return true;
      });
      // Don't render section if no meaningful citations
      if (citations.length === 0) return null;
      return (
        <div className="mb-4">
          <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--counsel-muted)]">
            {section.label}
          </h4>
          {/* Quiet citation list - hairline start border */}
          <div className="space-y-2 border-s-2 border-[var(--counsel-hairline)] ps-3 text-xs">
            {citations.map((cite, idx) => (
              <div key={idx} className="flex items-start gap-2 py-1">
                <span className="min-w-[24px] flex-shrink-0 font-mono text-[var(--counsel-muted)]">
                  [{idx + 1}]
                </span>
                <span className="italic leading-relaxed text-[var(--counsel-muted)]">
                  {cleanCitationTitle(cite)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'list':
      const items = Array.isArray(content) ? content : content.split('\n').filter(Boolean);
      return (
        <div className="mb-4">
          <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--counsel-muted)]">
            {section.label}
          </h4>
          <ul className="list-disc list-outside ms-4 space-y-1 text-sm text-[var(--counsel-ink)]">
            {items.map((item, idx) => (
              <li key={idx}>{item.replace(/^[-•*]\s*/, '')}</li>
            ))}
          </ul>
        </div>
      );

    case 'text':
    default:
      // Preprocess content for better paragraph breaks
      const preprocessedContent = preprocessMarkdownContent(
        typeof content === 'string' ? content : content.join('\n\n')
      );

      // Shared inline-children processing for markdown renderers: converts [n]
      // citation markers ([1], [Kaynak 1], [Source 1]) into clickable
      // superscripts. Used by both the `p` and `li` renderers — tight list
      // items get bare string children (no wrapping <p>), so they need the
      // same treatment. Local on purpose: the ZenMessage helper closes over
      // that component's message state and cannot be shared.
      const processInlineChildren = (child: React.ReactNode): React.ReactNode => {
        if (typeof child === 'string') {
          // Citation regex: [1], [Kaynak 1], [Source 1]
          const citationRegex = /(\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])/gi;
          const parts = child.split(citationRegex);
          return parts.map((part, idx) => {
            const simpleMatch = part.match(/^\[(\d+)\]$/);
            const kaynakMatch = part.match(/^\[Kaynak\s*(\d+)\]$/i);
            const sourceMatch = part.match(/^\[Source\s*(\d+)\]$/i);
            const citationNum = simpleMatch?.[1] || kaynakMatch?.[1] || sourceMatch?.[1];

            if (citationNum) {
              // Display the deduped group's ordinal number when a map is
              // provided; the scroll target stays keyed by the ORIGINAL
              // number (hidden alias anchors land it on the right row).
              const displayNum = citationDisplayMap?.get(parseInt(citationNum, 10) - 1) ?? citationNum;
              const scrollToSource = (e: React.SyntheticEvent) => {
                e.preventDefault();
                e.stopPropagation();
                // Find source by ID: citation-{messageId}-{citationNum}
                // If no messageId, fallback to class-based selector
                let sourceEl: HTMLElement | null = null;
                if (messageId) {
                  sourceEl = document.getElementById(`citation-${messageId}-${citationNum}`);
                }
                if (!sourceEl) {
                  // Fallback: find by class and index
                  const sourceItems = document.querySelectorAll('.counsel-source-item');
                  sourceEl = sourceItems[parseInt(citationNum) - 1] as HTMLElement;
                }
                if (sourceEl) {
                  // Flash the whole source row with a brief accent-tinted background
                  const row = (sourceEl.closest('.counsel-source-item') as HTMLElement) || sourceEl;
                  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  row.classList.remove('counsel-cite-flash');
                  void row.offsetWidth; // restart the CSS animation
                  row.classList.add('counsel-cite-flash');
                  setTimeout(() => { row.classList.remove('counsel-cite-flash'); }, 1700);
                }
              };
              return (
                // <bdi dir="ltr"> keeps the [n] marker from mirroring inside
                // RTL text (same as the markdown render path); button
                // semantics make it keyboard-reachable and operable.
                <bdi key={`cite-${idx}`} dir="ltr">
                  <sup
                    className="counsel-cite cursor-pointer no-underline hover:underline underline-offset-2"
                    role="button"
                    tabIndex={0}
                    onClick={scrollToSource}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        scrollToSource(e);
                      }
                    }}
                  >
                    [{displayNum}]
                  </sup>
                </bdi>
              );
            }
            return part;
          });
        }
        if (Array.isArray(child)) {
          return child.map((c, i) => <React.Fragment key={i}>{processInlineChildren(c)}</React.Fragment>);
        }
        // Handle React elements
        if (React.isValidElement(child) && child.props?.children) {
          return React.cloneElement(child, { ...child.props }, processInlineChildren(child.props.children));
        }
        return child;
      };

      return (
        <div className="mb-4">
          {/* Hide section label - show content directly. Colors come from the
              container-scoped tokens (counsel-prose), not global dark: variants. */}
          <div className="counsel-prose max-w-none
                          [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2
                          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
                          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
                          [&_ul]:my-2 [&_ul]:ms-4 [&_ul]:list-disc
                          [&_ol]:my-2 [&_ol]:ms-4 [&_ol]:list-decimal
                          [&_li]:my-1 [&_li]:ps-1
                          [&_strong]:font-semibold [&_strong]:text-[var(--counsel-ink)]
                          [&_blockquote]:border-s-2 [&_blockquote]:border-[var(--counsel-hairline)] [&_blockquote]:ps-4 [&_blockquote]:italic [&_blockquote]:text-[var(--counsel-muted)]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom paragraph renderer with citation support
                p: ({ children }) => (
                  <p className="my-3 leading-relaxed">
                    {processInlineChildren(children)}
                  </p>
                ),
                // List items run the same citation processing as paragraphs:
                // tight lists give <li> bare string children (no wrapping <p>).
                li: ({ children }) => (
                  <li>{processInlineChildren(children)}</li>
                )
              }}
            >
              {preprocessedContent}
            </ReactMarkdown>
          </div>
        </div>
      );
  }
};

/**
 * Preprocess markdown content for better paragraph breaks
 */
function preprocessMarkdownContent(content: string): string {
  let result = content;

  // Count paragraphs and sentences
  const paragraphCount = (result.match(/\n\n/g) || []).length;
  const sentenceCount = (result.match(/[.!?](?:\s*\[\d+\])*\s/g) || []).length;

  // If few paragraphs relative to sentences, add paragraph breaks
  if (sentenceCount >= 2 && paragraphCount < Math.ceil(sentenceCount / 3)) {
    let counter = 0;
    result = result.replace(/([.!?])(\s*(?:\[\d+\]|\[Kaynak\s*\d+\]|\[Source\s*\d+\])*)(\s+)([A-ZÇĞİÖŞÜ])/g,
      (match, punct, citations, space, nextChar) => {
        counter++;
        if (counter % 2 === 0) {
          return `${punct}${citations || ''}\n\n${nextChar}`;
        }
        return `${punct}${citations || ''} ${nextChar}`;
      }
    );
  }

  // Clean excessive newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

export default SchemaRenderer;
