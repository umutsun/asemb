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

const LEVEL_CLASSES: Record<QualityLevel, string> = {
  veryGood: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  good: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800/70 dark:text-gray-400',
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

  return (
    <span
      className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium ${LEVEL_CLASSES[level]} ${className}`}
      title={t('chatMessage.quality.label')}
    >
      {t(`chatMessage.quality.${level}`)}
    </span>
  );
}

export default QualityBadge;
