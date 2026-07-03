'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, Trash2, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '../hooks/useConversationHistory';

interface ZenHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  isLoading: boolean;
  currentConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

/**
 * Group conversations by date (Today, Yesterday, This Week, Earlier)
 */
function groupConversationsByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);

  const groups: Record<string, Conversation[]> = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Earlier': []
  };

  conversations.forEach(conv => {
    const convDate = new Date(conv.updated_at || conv.created_at);
    const convDay = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate());

    if (convDay >= today) {
      groups['Today'].push(conv);
    } else if (convDay >= yesterday) {
      groups['Yesterday'].push(conv);
    } else if (convDay >= thisWeek) {
      groups['This Week'].push(conv);
    } else {
      groups['Earlier'].push(conv);
    }
  });

  return Object.entries(groups).filter(([_, convs]) => convs.length > 0);
}

/**
 * Format time for display
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const convDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (convDay >= today) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
}

/**
 * ZenHistoryPanel - quiet popover above the input (surface bg, hairline border)
 */
export const ZenHistoryPanel: React.FC<ZenHistoryPanelProps> = ({
  isOpen,
  onClose,
  conversations,
  isLoading,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter conversations by search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv =>
      conv.title?.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  // Focus search on open
  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
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
      if (e.key === 'Escape') {
        if (confirmDeleteId) {
          setConfirmDeleteId(null);
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, confirmDeleteId]);

  // Reset confirm state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      // Second click - confirm delete
      onDeleteConversation(id);
      setConfirmDeleteId(null);
    } else {
      // First click - show confirm
      setConfirmDeleteId(id);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="counsel-panel counsel-msg-in">
      {/* Search */}
      <div className="counsel-panel-search">
        <Search className="h-4 w-4 opacity-50" />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* Conversations List */}
      <ScrollArea className="counsel-panel-list">
        {isLoading ? (
          <div className="py-1">
            <div className="counsel-panel-skeleton" />
            <div className="counsel-panel-skeleton" />
            <div className="counsel-panel-skeleton" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="counsel-panel-empty">
            {searchQuery ? 'No results found' : 'No conversations yet'}
          </div>
        ) : (
          groupedConversations.map(([group, convs]) => (
            <div key={group}>
              <div className="counsel-panel-label">{group}</div>
              {convs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onClose();
                  }}
                  className={`counsel-panel-row ${
                    conv.id === currentConversationId ? 'active' : ''
                  }`}
                >
                  <span className="counsel-history-item-title">
                    {conv.title || 'Untitled conversation'}
                  </span>
                  <span className="counsel-history-item-time">
                    {formatTime(conv.updated_at || conv.created_at)}
                  </span>
                  {confirmDeleteId === conv.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, conv.id)}
                        className="counsel-history-confirm-yes"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelDelete}
                        className="counsel-history-confirm-no"
                        aria-label="Cancel delete"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, conv.id)}
                      className="counsel-history-item-delete"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
};

export default ZenHistoryPanel;
