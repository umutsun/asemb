'use client';

/**
 * Client-side fetch + cache for citation presentation settings.
 *
 * Reads the same settings endpoints the ChatInterfaces already bootstrap from:
 *   - /api/v2/settings?category=rag  -> ragSettings.citationPriorityFields / fieldLabels / sourceTypeLabels
 *   - /api/v2/chatbot/settings       -> enableFollowUps (chatbot.enableFollowUps)
 *
 * All values are tenant data and may be absent — consumers get generic fallbacks.
 * The fetch happens once per page load (module-level cache) and is invalidated by the
 * app-wide 'settingsUpdated' event.
 */

import { useEffect, useState } from 'react';
import type { FieldLabelMap, SourceTypeLabelMap } from '@/lib/source-presentation';

export interface CitationSettings {
  /** Ordered metadata fields to render as chips (ragSettings.citationPriorityFields) */
  priorityFields?: string[];
  /** Chip labels per field (ragSettings.fieldLabels) */
  fieldLabels?: FieldLabelMap;
  /** Source-table -> type badge presentation (ragSettings.sourceTypeLabels) */
  sourceTypeLabels?: SourceTypeLabelMap;
  /** chatbot.enableFollowUps — missing means enabled */
  enableFollowUps: boolean;
  /** True once the settings request finished (successfully or not) */
  loaded: boolean;
}

export const DEFAULT_CITATION_SETTINGS: CitationSettings = {
  enableFollowUps: true,
  loaded: false,
};

/** Settings values may arrive as JSON strings or already-parsed objects. */
function parseJsonSetting<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    if (!value.trim()) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

let cached: CitationSettings | null = null;
let pending: Promise<CitationSettings> | null = null;

export async function fetchCitationSettings(): Promise<CitationSettings> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const result: CitationSettings = { ...DEFAULT_CITATION_SETTINGS, loaded: true };
    try {
      const [ragRes, chatbotRes] = await Promise.all([
        fetch('/api/v2/settings?category=rag'),
        fetch('/api/v2/chatbot/settings'),
      ]);

      if (ragRes.ok) {
        const ragData = await ragRes.json();
        const rag = ragData?.ragSettings || {};
        result.priorityFields = parseJsonSetting<string[]>(rag.citationPriorityFields);
        result.fieldLabels = parseJsonSetting<FieldLabelMap>(rag.fieldLabels);
        result.sourceTypeLabels = parseJsonSetting<SourceTypeLabelMap>(rag.sourceTypeLabels);
      }

      if (chatbotRes.ok) {
        const chatbotData = await chatbotRes.json();
        if (chatbotData && chatbotData.enableFollowUps !== undefined) {
          result.enableFollowUps =
            chatbotData.enableFollowUps !== false && chatbotData.enableFollowUps !== 'false';
        }
      }
    } catch (error) {
      console.error('[citation-settings] Failed to fetch settings:', error);
    }
    cached = result;
    pending = null;
    return result;
  })();

  return pending;
}

// Refetch on the next consumer after settings change in the admin panel.
if (typeof window !== 'undefined') {
  window.addEventListener('settingsUpdated', () => {
    cached = null;
  });
}

/** React hook: returns cached citation settings (defaults until the fetch resolves). */
export function useCitationSettings(): CitationSettings {
  const [settings, setSettings] = useState<CitationSettings>(cached || DEFAULT_CITATION_SETTINGS);

  useEffect(() => {
    let active = true;
    fetchCitationSettings().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return settings;
}
