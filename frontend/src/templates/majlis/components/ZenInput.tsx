'use client';

import React, { useRef, useState, useMemo, useEffect, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, X, FileText, Mic, Square, Loader2, Command } from 'lucide-react';
import { useVoiceRecording } from '@/lib/hooks/use-voice-recording';
import type { ZenInputProps, SlashCommand, SlashCommandSubmenuItem } from '../types';
import { SlashCommandAutocomplete } from './SlashCommandAutocomplete';
import { SLASH_COMMANDS } from '../config/slashCommands';

// Ghost icon button skin shared by the input's secondary actions (muted, hover brass)
const GHOST_BTN =
  'rounded-sm p-2 text-[var(--majlis-muted)] transition-colors hover:text-[var(--majlis-accent)] disabled:opacity-40';

/**
 * Majlis Input Component
 * Sticky bottom composer on a solid hairline-topped bar: panel-surface input
 * box with sharp 2px corners and a serif autosize textarea, ghost secondary
 * icons (hover brass), and a separate outlined-brass uppercase send button
 * that fills brass on hover.
 */
export const ZenInput: React.FC<ZenInputProps> = ({
  value,
  onChange,
  onSend,
  placeholder,
  isLoading,
  textareaRef,
  pdfSettings,
  pdfFile,
  onPdfSelect,
  voiceSettings,
  onSlashCommand,
  historyPanel,
  suggestPanel,
  recentConversations,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slash command autocomplete state
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashSearchText, setSlashSearchText] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Autosize the borderless textarea (grow with content, capped)
  useEffect(() => {
    const el = textareaRef?.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, textareaRef]);

  // Build commands with dynamic submenu for /suggest
  const commandsWithDynamicSubmenu = useMemo(() => {
    return SLASH_COMMANDS.map(cmd => {
      if (cmd.hasDynamicSubmenu && cmd.id === 'suggest' && recentConversations) {
        return {
          ...cmd,
          submenuItems: recentConversations.slice(0, 12).map(conv => ({
            id: conv.id,
            label: conv.title,
            conversationId: conv.id
          }))
        };
      }
      return cmd;
    });
  }, [recentConversations]);

  // Get filtered commands based on search
  const filteredCommands = useMemo(() => {
    if (!slashSearchText) return commandsWithDynamicSubmenu;
    const search = slashSearchText.toLowerCase();
    return commandsWithDynamicSubmenu.filter(cmd =>
      cmd.trigger.toLowerCase().includes('/' + search) ||
      cmd.trigger.toLowerCase().slice(1).startsWith(search) ||
      cmd.label.toLowerCase().includes(search)
    );
  }, [slashSearchText, commandsWithDynamicSubmenu]);

  // Voice recording hook
  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    maxDurationSeconds: voiceSettings?.maxRecordingSeconds || 60,
    onTranscription: (text) => {
      if (text) {
        onChange(value ? `${value} ${text}` : text);
      }
    },
    onError: (error) => {
      console.error('[ZenInput] Voice recording error:', error);
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle slash command autocomplete navigation
    if (showSlashAutocomplete && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommandSelect(filteredCommands[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashAutocomplete(false);
        onChange('');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        handleCommandSelect(filteredCommands[selectedCommandIndex]);
        return;
      }
    }

    // Normal enter handling
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle input change with slash command detection
  const handleInputChange = (newValue: string) => {
    onChange(newValue);

    // Check if input starts with "/" for slash commands
    if (newValue.startsWith('/')) {
      setShowSlashAutocomplete(true);
      setSlashSearchText(newValue.slice(1)); // Text after "/"
      setSelectedCommandIndex(0);
    } else {
      setShowSlashAutocomplete(false);
      setSlashSearchText('');
    }
  };

  // Handle command selection (with optional submenu item)
  const handleCommandSelect = (command: SlashCommand, submenuItem?: SlashCommandSubmenuItem) => {
    setShowSlashAutocomplete(false);
    setSlashSearchText('');
    onChange(''); // Clear input

    if (onSlashCommand) {
      // If submenu item selected, create a modified command with targetLanguage
      if (submenuItem) {
        const modifiedCommand: SlashCommand = {
          ...command,
          targetLanguage: submenuItem.targetLanguage,
          id: `${command.id}-${submenuItem.id}`
        };
        onSlashCommand(modifiedCommand);
      } else {
        onSlashCommand(command);
      }
    }
  };

  // Open slash command menu via button
  const handleSlashButtonClick = () => {
    setShowSlashAutocomplete(true);
    setSlashSearchText('');
    setSelectedCommandIndex(0);
    onChange('/');
    textareaRef?.current?.focus();
  };

  const handleSend = () => {
    if (value.trim() || pdfFile) {
      onSend(pdfFile || undefined);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onPdfSelect) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are supported');
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (pdfSettings && fileSizeMB > pdfSettings.maxSizeMB) {
      alert(`File size cannot exceed ${pdfSettings.maxSizeMB} MB`);
      return;
    }

    onPdfSelect(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaperclipClick = () => {
    if (pdfSettings?.enabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemovePdf = () => {
    if (onPdfSelect) {
      onPdfSelect(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    /* Fixed bottom bar: solid ink footer with a soft hairline top rule
       (no gradient/glass — mock .f-composer) */
    <div className="majlis-composer-bar fixed bottom-0 left-0 right-0 z-50">
      {/* Same max-width + padding as the message column so both align exactly */}
      <div className="mx-auto w-full max-w-2xl px-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Attach PDF"
        />

        {/* PDF preview chip */}
        {pdfFile && (
          <div className="mb-2">
            <div className="inline-flex items-center gap-2 rounded-sm border border-[var(--majlis-hairline)] bg-[var(--majlis-surface)] px-3 py-1.5 text-[var(--majlis-ink)]">
              <FileText className="h-4 w-4 text-[var(--majlis-muted)]" />
              <span className="max-w-[200px] truncate text-sm">
                {pdfFile.name}
              </span>
              <span className="text-xs text-[var(--majlis-muted)]">
                ({formatFileSize(pdfFile.size)})
              </span>
              <button
                type="button"
                onClick={handleRemovePdf}
                className="rounded p-0.5 text-[var(--majlis-muted)] transition-colors hover:text-[var(--majlis-ink)]"
                title="Remove PDF"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Composer row: bordered panel input box + separate outlined-brass send
            button (mock .composer); the popover panels anchor to this row */}
        <div className="relative flex items-end gap-3.5">
          {/* History Panel - renders above input */}
          {historyPanel}

          {/* Suggest Panel - renders above input */}
          {suggestPanel}

          {/* Slash Command Autocomplete */}
          <SlashCommandAutocomplete
            isOpen={showSlashAutocomplete}
            commands={filteredCommands}
            selectedIndex={selectedCommandIndex}
            onSelect={handleCommandSelect}
            onClose={() => setShowSlashAutocomplete(false)}
          />

          {/* Input box: panel surface, hairline border, sharp 2px corners (majlis.css) */}
          <div className="majlis-composer flex min-w-0 flex-1 items-end gap-1">

            {/* Paperclip button - only visible when PDF upload is enabled */}
            {pdfSettings?.enabled && (
              <button
                type="button"
                onClick={handlePaperclipClick}
                disabled={isLoading || !!pdfFile || isRecording}
                className={`${GHOST_BTN} ${pdfFile ? 'text-[var(--majlis-accent)]' : ''}`}
                title={pdfFile ? 'PDF attached' : 'Attach PDF'}
              >
                <Paperclip className="h-4 w-4" />
              </button>
            )}

            {/* Slash command button */}
            <button
              type="button"
              onClick={handleSlashButtonClick}
              disabled={isLoading || isRecording}
              className={`${GHOST_BTN} ${showSlashAutocomplete ? 'text-[var(--majlis-accent)]' : ''}`}
              title="Commands"
            >
              <Command className="h-4 w-4" />
            </button>

            {/* Mic button - only visible when voice input is enabled */}
            {voiceSettings?.enableVoiceInput && (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading || isTranscribing}
                className={`${GHOST_BTN} ${
                  isRecording
                    ? 'animate-pulse text-[var(--majlis-danger)]'
                    : isTranscribing
                      ? 'text-[var(--majlis-accent)]'
                      : ''
                }`}
                title={
                  isRecording
                    ? `Stop recording (${recordingDuration}s)`
                    : isTranscribing
                      ? 'Transcribing...'
                      : 'Send a voice message'
                }
              >
                {isRecording ? (
                  <Square className="h-4 w-4" />
                ) : isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? `Recording... (${recordingDuration}s)`
                  : isTranscribing
                    ? 'Transcribing...'
                    : pdfFile
                      ? 'Type your question about this PDF...'
                      : (placeholder || 'Ask anything...')
              }
              rows={1}
              disabled={isRecording || isTranscribing}
              className="max-h-40 flex-1 resize-none border-none bg-transparent px-2 py-1.5 leading-relaxed text-[var(--majlis-ink)] placeholder:text-[var(--majlis-muted)] focus:outline-none focus:ring-0 disabled:opacity-50"
            />
          </div>

          {/* Outlined-brass send button: localized uppercase label, sharp 2px
              corners; hover fills brass with on-accent ink (majlis.css) */}
          <button
            type="button"
            onClick={handleSend}
            disabled={(!value.trim() && !pdfFile) || isLoading || isRecording}
            className="majlis-send flex items-center justify-center"
            aria-label={t('chatInput.send')}
          >
            {isLoading ? (
              /* Spinner inherits the button's current color (brass at rest,
                 on-accent on hover) so it stays legible per mode */
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              t('chatInput.send')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZenInput;
