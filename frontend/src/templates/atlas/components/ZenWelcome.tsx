'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ZenWelcomeProps } from '../types';

/**
 * Atlas Welcome Component
 * Empty-state: vertically centered sans headline, one muted sentence, and up
 * to four example questions (from the existing suggestions source) rendered
 * as bordered pill buttons, same treatment as the follow-up suggestions.
 */
export const ZenWelcome: React.FC<ZenWelcomeProps> = ({
  chatbotSettings,
  suggestions = [],
  onSuggestionClick,
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="atlas-msg-in flex min-h-[55vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="atlas-welcome-title">
        {chatbotSettings.greeting || t('chat.greeting', 'Welcome')}
      </h1>
      <p className="mt-2 text-[15px] text-[var(--atlas-muted)]">
        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'How can I help you?')}
      </p>

      {suggestions.length > 0 && (
        <div className="mt-6 w-full max-w-[700px] text-start">
          {/* dir on the container keeps the pill row direction-aware */}
          <div className="atlas-fups justify-center" dir={i18n.dir()}>
            {suggestions.slice(0, 4).map((question, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSuggestionClick?.(question)}
                className="atlas-fup"
              >
                <span className="min-w-0">{question}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ZenWelcome;
