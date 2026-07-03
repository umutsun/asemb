'use client';

import React from 'react';

/**
 * Counsel Typing Indicator Component
 * Displays animated dots while assistant is thinking
 */
export const ZenTypingIndicator: React.FC = () => {
  return (
    <div className="counsel-typing">
      <div className="counsel-typing-dot" />
      <div className="counsel-typing-dot" />
      <div className="counsel-typing-dot" />
    </div>
  );
};

export default ZenTypingIndicator;
