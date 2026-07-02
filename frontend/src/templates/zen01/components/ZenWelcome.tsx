'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ZenWelcomeProps } from '../types';

/**
 * Zen01 Welcome Component
 * Empty-state: vertically centered title, one muted sentence, and up to four
 * example questions (from the existing suggestions source) as ghost buttons.
 */
export const ZenWelcome: React.FC<ZenWelcomeProps> = ({
  chatbotSettings,
  suggestions = [],
  onSuggestionClick,
}) => {
  const { t } = useTranslation();

  return (
    <div className="zen01-msg-in flex min-h-[55vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-[var(--zen-ink)]">
        {chatbotSettings.greeting || t('chat.greeting', 'Welcome')}
      </h1>
      <p className="mt-2 text-[15px] text-[var(--zen-muted)]">
        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'How can I help you?')}
      </p>

      {suggestions.length > 0 && (
        <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2">
          {suggestions.slice(0, 4).map((question, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onSuggestionClick?.(question)}
              className="rounded-full border border-[var(--zen-hairline)] bg-transparent px-4 py-1.5 text-start text-sm text-[var(--zen-muted)] transition-colors hover:border-[var(--zen-accent)] hover:text-[var(--zen-accent)]"
            >
              {question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ZenWelcome;
