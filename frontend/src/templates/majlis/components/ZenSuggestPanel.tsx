'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ZenSuggestPanelProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: string[];
  isLoading: boolean;
  onSelectSuggestion: (question: string) => void;
}

/**
 * ZenSuggestPanel - Shows suggestion questions with search
 * Quiet popover above the input: surface bg, hairline border, plain rows.
 */
export const ZenSuggestPanel: React.FC<ZenSuggestPanelProps> = ({
  isOpen,
  onClose,
  suggestions,
  isLoading,
  onSelectSuggestion,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter suggestions by search
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return suggestions;
    const query = searchQuery.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(query));
  }, [suggestions, searchQuery]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset search when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="majlis-panel majlis-msg-in">
      {/* Search Box */}
      <div className="majlis-panel-search">
        <Search className="h-4 w-4 opacity-50" />
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('chat.searchSuggestions', 'Search suggestions...')}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="opacity-50 hover:opacity-100"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Suggestions List */}
      <div className="majlis-panel-list">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--majlis-muted)]" />
            <span className="mt-2 text-xs text-[var(--majlis-muted)]">{t('chat.loadingSuggestions', 'Loading suggestions...')}</span>
          </div>
        ) : filteredSuggestions.length === 0 ? (
          <div className="majlis-panel-empty">
            {searchQuery ? t('chat.noResults', 'No results') : t('chat.noSuggestions', 'No suggestions yet')}
          </div>
        ) : (
          filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                onSelectSuggestion(suggestion);
                onClose();
              }}
              className="majlis-panel-row"
            >
              <span className="min-w-0 flex-1 truncate">
                {suggestion}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ZenSuggestPanel;
