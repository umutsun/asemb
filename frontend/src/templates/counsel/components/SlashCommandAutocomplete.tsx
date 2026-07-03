'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { SlashCommand, SlashCommandSubmenuItem } from '../types';

interface SlashCommandAutocompleteProps {
  isOpen: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand, submenuItem?: SlashCommandSubmenuItem) => void;
  onClose: () => void;
}

/**
 * SlashCommandAutocomplete
 * Quiet popover above the input: plain rows, mono trigger, hover surface change.
 */
export const SlashCommandAutocomplete: React.FC<SlashCommandAutocompleteProps> = ({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
}) => {
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [submenuIndex, setSubmenuIndex] = useState(0);

  if (!isOpen || commands.length === 0) return null;

  const handleCommandClick = (cmd: SlashCommand) => {
    if (cmd.hasSubmenu && cmd.submenuItems) {
      setExpandedCommand(expandedCommand === cmd.id ? null : cmd.id);
      setSubmenuIndex(0);
    } else {
      onSelect(cmd);
    }
  };

  const handleSubmenuClick = (cmd: SlashCommand, item: SlashCommandSubmenuItem) => {
    onSelect(cmd, item);
    setExpandedCommand(null);
  };

  return (
    <div className="counsel-panel counsel-msg-in">
      <div className="counsel-panel-list">
        {commands.map((cmd, idx) => (
          <div key={cmd.id}>
            <div
              onClick={() => handleCommandClick(cmd)}
              className={`counsel-panel-row ${idx === selectedIndex ? 'selected' : ''}`}
            >
              <span className="counsel-slash-trigger">{cmd.trigger}</span>
              <span className="text-sm text-[var(--counsel-ink)]">{cmd.label}</span>
              {cmd.hasSubmenu && (
                <ChevronRight
                  className={`ms-auto h-4 w-4 text-[var(--counsel-muted)] transition-transform ${
                    expandedCommand === cmd.id ? 'rotate-90' : ''
                  }`}
                />
              )}
            </div>

            {/* Submenu */}
            {cmd.hasSubmenu && expandedCommand === cmd.id && cmd.submenuItems && (
              <div>
                {cmd.submenuItems.map((item, subIdx) => (
                  <div
                    key={item.id}
                    onClick={() => handleSubmenuClick(cmd, item)}
                    className={`counsel-panel-row counsel-slash-submenu-row text-sm ${
                      subIdx === submenuIndex ? 'selected' : ''
                    }`}
                  >
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SlashCommandAutocomplete;
