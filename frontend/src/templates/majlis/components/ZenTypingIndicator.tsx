'use client';

import React from 'react';

/**
 * Majlis Typing Indicator Component
 * Displays animated dots while assistant is thinking
 */
export const ZenTypingIndicator: React.FC = () => {
  return (
    <div className="majlis-typing">
      <div className="majlis-typing-dot" />
      <div className="majlis-typing-dot" />
      <div className="majlis-typing-dot" />
    </div>
  );
};

export default ZenTypingIndicator;
