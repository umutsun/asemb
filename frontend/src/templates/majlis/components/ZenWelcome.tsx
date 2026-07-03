'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ZenWelcomeProps } from '../types';

/**
 * Majlis Welcome Component
 * Empty-state: vertically centered serif headline, one muted sentence, and up
 * to four example questions (from the existing suggestions source) rendered as
 * stacked serif rows with a leading brass arrow, like the follow-up list.
 */
export const ZenWelcome: React.FC<ZenWelcomeProps> = ({
  chatbotSettings,
  suggestions = [],
  onSuggestionClick,
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="majlis-msg-in flex min-h-[55vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="majlis-welcome-title">
        {chatbotSettings.greeting || t('chat.greeting', 'Welcome')}
      </h1>
      <p className="mt-2 text-[15px] text-[var(--majlis-muted)]">
        {chatbotSettings.welcomeMessage || t('chat.welcomeMessage', 'How can I help you?')}
      </p>

      {suggestions.length > 0 && (
        <div className="mt-6 w-full max-w-2xl text-start">
          {/* dir on the container keys the arrow direction (majlis.css) */}
          <div className="majlis-fups" dir={i18n.dir()}>
            {suggestions.slice(0, 4).map((question, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onSuggestionClick?.(question)}
                className="majlis-fup"
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
