'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CitationChipData } from '@/lib/source-presentation';

interface CitationChipProps {
  chip: CitationChipData;
  /** Skin classes — each template passes its own pill styling; a neutral default applies otherwise. */
  className?: string;
  showLabel?: boolean;
}

/**
 * Small metadata pill on a citation card (e.g. "Article: 5", "Year: 2022").
 * Dumb by design: label resolution order is tenant fieldLabels (chip.label) ->
 * i18n fallback (chip.labelKey) -> value-only.
 */
export function CitationChip({ chip, className, showLabel = true }: CitationChipProps) {
  const { t } = useTranslation();
  const label = chip.label ?? t(chip.labelKey, { defaultValue: '' });
  // Quiet default: thin border, muted text, no background tint.
  const skin = className || 'rounded border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400';

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap ${skin}`}
      title={label ? `${label}: ${chip.value}` : chip.value}
    >
      {showLabel && label ? <span className="opacity-70">{label}</span> : null}
      <bdi dir="auto" className="font-medium">{chip.value}</bdi>
    </span>
  );
}

export default CitationChip;
