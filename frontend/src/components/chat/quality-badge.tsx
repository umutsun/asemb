'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Evidence } from '@/types/chat';

export type QualityLevel = 'veryGood' | 'good' | 'medium' | 'low';

/**
 * Answer-quality level derived from the backend evidence gate when available:
 *   gatePassed && bestScore >= minScore + 0.2 -> veryGood
 *   gatePassed                                -> good
 *   sources present but gate failed           -> medium
 *   otherwise                                 -> low
 * Legacy messages without evidence fall back to the old source-count heuristic.
 */
export function getQualityLevel(evidence: Evidence | undefined, sourceCount: number): QualityLevel {
  if (evidence) {
    if (evidence.gatePassed && evidence.bestScore >= evidence.minScore + 0.2) return 'veryGood';
    if (evidence.gatePassed) return 'good';
    if (sourceCount > 0) return 'medium';
    return 'low';
  }
  if (sourceCount >= 5) return 'veryGood';
  if (sourceCount >= 3) return 'good';
  if (sourceCount >= 1) return 'medium';
  return 'low';
}

// Quiet styling: neutral pill, level conveyed by text color only (no tinted background).
const LEVEL_CLASSES: Record<QualityLevel, string> = {
  veryGood: 'text-emerald-600 dark:text-emerald-400',
  good: 'text-sky-600 dark:text-sky-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-gray-500 dark:text-gray-400',
};

interface QualityBadgeProps {
  evidence?: Evidence;
  sourceCount: number;
  className?: string;
}

/** Discreet answer-quality pill for assistant message footers. */
export function QualityBadge({ evidence, sourceCount, className = '' }: QualityBadgeProps) {
  const { t } = useTranslation();
  const level = getQualityLevel(evidence, sourceCount);

  // A bare "Very good" pill reads as noise — say WHAT is rated ("Sources: Very
  // good"), with the full explanation in the tooltip.
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium border border-gray-200 dark:border-gray-700 bg-transparent ${LEVEL_CLASSES[level]} ${className}`}
      title={t('chatMessage.quality.label')}
    >
      <span className="text-gray-500 dark:text-gray-400">{t('chatMessage.quality.label')}:</span>
      {t(`chatMessage.quality.${level}`)}
    </span>
  );
}

export default QualityBadge;
