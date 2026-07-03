'use client';

import React from 'react';

// ────────────────────────────────────────────────────────────────────────────
// Structured answer payload + deterministic renderer (domain-agnostic).
//
// The backend (settings-gated) returns this object instead of free Markdown; the
// model can no longer emit merged headings, inline lists, stray '#', or malformed
// '[1}' citations, because the structure is fixed and citations are explicit
// per-block source indices. The schema is generic (summary / sections / steps /
// bullets) so it fits any assistant domain — the per-instance wording lives in
// settings (chat.structuredOutput.instruction.*), never in code.
//
// This shared body renderer is used by every chat template (counsel / atlas /
// majlis). Each template supplies its own citation chip renderer and prose class,
// so the output inherits that template's styling. It emits the SAME semantic DOM
// (h2 / p / ol / ul / li / cite) the Markdown path produced, so all existing
// per-template CSS applies unchanged.
// ────────────────────────────────────────────────────────────────────────────

export interface StructuredAnswerBlock {
  text: string;
  citations: number[]; // 1-based indices into the message `sources` array
}
export interface StructuredAnswerSection {
  heading: string;
  paragraphs: StructuredAnswerBlock[];
  steps: StructuredAnswerBlock[];
  bullets: StructuredAnswerBlock[];
}
export interface StructuredAnswer {
  language?: string;
  summary: string;
  summaryCitations: number[];
  sections: StructuredAnswerSection[];
}

/** Runtime guard for an untrusted payload (message.structured from the API / DB). */
export function isStructuredAnswer(value: unknown): value is StructuredAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === 'string'
    && Array.isArray(v.sections)
    && Array.isArray(v.summaryCitations);
}

type RenderCite = (sourceNumber: string, key: string) => React.ReactNode;
type RenderInline = (text: string, keyPrefix: string) => React.ReactNode;

interface StructuredAnswerBodyProps {
  answer: StructuredAnswer;
  /** Template's citation chip renderer — reuses that template's scroll/flash + display map. */
  renderCite: RenderCite;
  /** Template's inline text renderer (e.g. keyword highlighting). Defaults to identity. */
  renderInline?: RenderInline;
  /** Template prose wrapper class (e.g. 'atlas-prose') so existing CSS styles the elements. */
  className?: string;
}

const identityInline: RenderInline = (text) => text;

/**
 * Render a single block's text: split on `**bold**` spans (the ONLY inline markup
 * allowed in structured text fields) and apply the template's inline renderer to the
 * rest. No other Markdown is honoured — block structure comes from the schema.
 */
function renderBlockText(text: string, renderInline: RenderInline, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (!part) return null;
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return <strong key={`${keyPrefix}-b${i}`}>{renderInline(bold[1], `${keyPrefix}-bi${i}`)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-t${i}`}>{renderInline(part, `${keyPrefix}-ti${i}`)}</React.Fragment>;
  });
}

/** Text + trailing citation chips for one block (paragraph / step / bullet). */
function BlockInline({ block, renderCite, renderInline, keyPrefix }: {
  block: StructuredAnswerBlock;
  renderCite: RenderCite;
  renderInline: RenderInline;
  keyPrefix: string;
}): React.ReactElement {
  return (
    <>
      {renderBlockText(block.text, renderInline, keyPrefix)}
      {(block.citations || []).map((n, i) => renderCite(String(n), `${keyPrefix}-c${i}`))}
    </>
  );
}

export function StructuredAnswerBody({
  answer,
  renderCite,
  renderInline = identityInline,
  className,
}: StructuredAnswerBodyProps): React.ReactElement {
  return (
    <div className={className}>
      {answer.summary ? (
        <p>
          <BlockInline
            block={{ text: answer.summary, citations: answer.summaryCitations || [] }}
            renderCite={renderCite}
            renderInline={renderInline}
            keyPrefix="sum"
          />
        </p>
      ) : null}

      {(answer.sections || []).map((section, si) => (
        <React.Fragment key={`sec${si}`}>
          {section.heading ? <h2>{renderInline(section.heading, `h${si}`)}</h2> : null}

          {(section.paragraphs || []).map((p, pi) => (
            <p key={`p${si}-${pi}`}>
              <BlockInline block={p} renderCite={renderCite} renderInline={renderInline} keyPrefix={`p${si}-${pi}`} />
            </p>
          ))}

          {section.steps && section.steps.length > 0 ? (
            <ol>
              {section.steps.map((st, i) => (
                <li key={`st${si}-${i}`}>
                  <div className="min-w-0">
                    <BlockInline block={st} renderCite={renderCite} renderInline={renderInline} keyPrefix={`st${si}-${i}`} />
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          {section.bullets && section.bullets.length > 0 ? (
            <ul>
              {section.bullets.map((b, i) => (
                <li key={`bu${si}-${i}`}>
                  <div className="min-w-0">
                    <BlockInline block={b} renderCite={renderCite} renderInline={renderInline} keyPrefix={`bu${si}-${i}`} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}
