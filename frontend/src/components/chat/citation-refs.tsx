'use client';

import React from 'react';

export interface CitationRefOptions {
  /** DOM id of the citation card for a given reference number (default: `source-ref-${num}`) */
  getAnchorId?: (num: string) => string;
  /** Tooltip for the reference (e.g. buildCitationTooltip of the matching source) */
  getTooltip?: (num: string) => string;
  /** Skin classes for the superscript pill */
  className?: string;
}

const DEFAULT_REF_CLASS =
  'inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-0.5 mx-[1px] text-[10px] font-semibold rounded ' +
  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 cursor-pointer ' +
  'hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors align-top';

/**
 * Shared inline [n] citation-reference processing for chat answers.
 * Makes [1], [2]… clickable (scroll + highlight the matching citation card) and wraps each
 * marker in <bdi dir="ltr"> so the number doesn't mirror inside RTL (Arabic) text.
 */
export function processCitationRefs(
  children: React.ReactNode,
  options: CitationRefOptions = {}
): React.ReactNode {
  const {
    getAnchorId = (num: string) => `source-ref-${num}`,
    getTooltip,
    className = DEFAULT_REF_CLASS,
  } = options;

  return React.Children.map(children, (child) => {
    if (typeof child !== 'string') return child;

    // Split text on citation patterns like [1], [2], [1][3]
    const parts = child.split(/(\[\d+\])/g);
    if (parts.length === 1) return child;

    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (!match) return part;
      const num = match[1];
      return (
        <bdi key={i} dir="ltr">
          <sup
            className={className}
            title={getTooltip?.(num)}
            onClick={() => {
              const el = document.getElementById(getAnchorId(num));
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                // Brief highlight animation
                el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-1');
                setTimeout(() => el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-1'), 2000);
              }
            }}
          >
            {num}
          </sup>
        </bdi>
      );
    });
  });
}
