'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus } from 'lucide-react';

interface FollowUpChipsProps {
  questions?: string[];
  /** Fills the chat input — each ChatInterface wires its own input state here. */
  onQuestionClick?: (question: string) => void;
  /** Direction of the answer these follow-ups belong to (RTL for Arabic answers). */
  dir?: 'rtl' | 'ltr';
  className?: string;
  /** Skin classes for each chip so templates can theme them. */
  chipClassName?: string;
}

const DEFAULT_CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-slate-300 dark:border-slate-600 ' +
  'bg-slate-100/60 dark:bg-slate-800/60 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 ' +
  'hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors text-start';

/**
 * Backend-generated follow-up questions rendered as clickable chips under the
 * citations block. Clicking a chip fills the chat input (via onQuestionClick, or the
 * app-wide 'addToInput' event as a fallback — every ChatInterface listens for it).
 */
export function FollowUpChips({
  questions,
  onQuestionClick,
  dir = 'ltr',
  className = '',
  chipClassName,
}: FollowUpChipsProps) {
  const { t } = useTranslation();

  if (!questions || questions.length === 0) return null;

  const handleClick = (question: string) => {
    if (onQuestionClick) {
      onQuestionClick(question);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('addToInput', { detail: question }));
    }
  };

  return (
    <div dir={dir} className={`mt-3 ${className}`}>
      <span className="block text-[11px] font-medium opacity-60 mb-1.5">
        {t('followUps.title')}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {questions.map((question, index) => (
          <button
            key={index}
            type="button"
            onClick={() => handleClick(question)}
            className={chipClassName || DEFAULT_CHIP_CLASS}
          >
            <MessageSquarePlus className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            <span>{question}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FollowUpChips;
