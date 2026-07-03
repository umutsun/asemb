'use client';

import React from 'react';
import { Languages } from 'lucide-react';

interface TranslationBadgeProps {
  targetLanguage: string;
  isShowingTranslation: boolean;
  onToggle: () => void;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'EN',
  tr: 'TR',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  ar: 'AR',
};

/**
 * TranslationBadge
 * Quiet ghost text toggle showing translation state (no pill/border, matching
 * the copy/TTS ghost buttons); accent when the translation is being shown.
 * Colors come from container-scoped tokens.
 */
export const TranslationBadge: React.FC<TranslationBadgeProps> = ({
  targetLanguage,
  isShowingTranslation,
  onToggle,
}) => {
  const langCode = LANGUAGE_NAMES[targetLanguage] || targetLanguage.toUpperCase();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide transition-colors hover:bg-[var(--counsel-hover)] ${
        isShowingTranslation
          ? 'text-[var(--counsel-accent)]'
          : 'text-[var(--counsel-muted)] hover:text-[var(--counsel-ink)]'
      }`}
      title={isShowingTranslation ? 'Show original' : 'Show translation'}
    >
      <Languages className="h-3 w-3" />
      <span>{isShowingTranslation ? langCode : 'Original'}</span>
    </button>
  );
};

export default TranslationBadge;
