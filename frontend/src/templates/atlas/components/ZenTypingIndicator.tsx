'use client';

import React from 'react';

/**
 * Atlas Typing Indicator Component
 * Displays animated dots while assistant is thinking
 */
export const ZenTypingIndicator: React.FC = () => {
  return (
    <div className="atlas-typing">
      <div className="atlas-typing-dot" />
      <div className="atlas-typing-dot" />
      <div className="atlas-typing-dot" />
    </div>
  );
};

export default ZenTypingIndicator;
