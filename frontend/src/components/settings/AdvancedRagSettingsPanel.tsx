'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Gauge, Filter } from 'lucide-react';

/**
 * Advanced anti-hallucination controls.
 *
 * Every control here maps 1:1 to a `ragSettings.*` key that the backend RAG
 * pipeline actually reads (rag-chat.service.ts / semantic_search_service.py) —
 * no stub controls (CLAUDE.md Hard Rule #2). The defaults below MIRROR the
 * backend fallbacks; they are display fallbacks only, the source of truth is the
 * `settings` table.
 *
 * Sanitizer / per-sentence claim validation (Temporal/Date/Percentage/Article)
 * is intentionally NOT here: it lives in per-schema llmConfig.sanitizerConfig and
 * is not yet settings-driven. It is wired in WS-A5 (see docs/NEXT_SESSION_HANDOFF.md).
 */

// Display fallbacks — mirror the backend defaults in rag-chat.service.ts.
const D = {
  strictModeLevel: 'medium' as 'strict' | 'medium' | 'relaxed',
  strictModeTemperature: 0.4,
  similarityThreshold: 0.01,
  lowConfidenceThreshold: 0.5,
  highConfidenceThreshold: 0.7,
  evidenceGateEnabled: true,
  evidenceGateMinScore: 0.55,
  evidenceGateMinChunks: 2,
};

export interface AdvancedRagSettingsPanelProps {
  /** The current ragSettings object (tempRAGConfig.ragSettings). */
  settings: Record<string, any> | undefined;
  /** Single-key updater (settings.tsx updateRAGSetting). */
  onChange: (key: string, value: any) => void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const AdvancedRagSettingsPanel: React.FC<AdvancedRagSettingsPanelProps> = ({ settings, onChange }) => {
  const { t } = useTranslation();
  const s = settings || {};

  const strictModeLevel = (s.strictModeLevel ?? D.strictModeLevel) as 'strict' | 'medium' | 'relaxed';
  const strictModeTemperature = Number(s.strictModeTemperature ?? D.strictModeTemperature);
  const similarityThreshold = Number(s.similarityThreshold ?? D.similarityThreshold);
  const lowConfidenceThreshold = Number(s.lowConfidenceThreshold ?? D.lowConfidenceThreshold);
  const highConfidenceThreshold = Number(s.highConfidenceThreshold ?? D.highConfidenceThreshold);
  const evidenceGateEnabled = (s.evidenceGateEnabled ?? D.evidenceGateEnabled) !== false && s.evidenceGateEnabled !== 'false';
  const evidenceGateMinScore = Number(s.evidenceGateMinScore ?? D.evidenceGateMinScore);
  const evidenceGateMinChunks = Number(s.evidenceGateMinChunks ?? D.evidenceGateMinChunks);

  return (
    <div className="space-y-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 mt-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t('settings.rag.antiHallucination.advancedHint', {
          defaultValue: 'Fine-tune the controls below. Editing any of these switches the mode to Custom.',
        })}
      </p>

      {/* ── Grounding / refusal (Evidence Gate) ───────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <h4 className="text-sm font-semibold">
            {t('settings.rag.antiHallucination.groundingTitle', { defaultValue: 'Grounding & refusal' })}
          </h4>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pe-4">
            <Label>{t('settings.rag.antiHallucination.evidenceGate', { defaultValue: 'Refuse when evidence is weak' })}</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('settings.rag.antiHallucination.evidenceGateHelp', {
                defaultValue: 'Decline to answer unless enough high-quality sources support the question. The strongest anti-hallucination control.',
              })}
            </p>
          </div>
          <Switch
            checked={evidenceGateEnabled}
            onCheckedChange={(v) => onChange('evidenceGateEnabled', v)}
          />
        </div>

        <div className={evidenceGateEnabled ? '' : 'opacity-50 pointer-events-none'}>
          <div className="flex items-center justify-between">
            <Label>{t('settings.rag.antiHallucination.evidenceMinScore', { defaultValue: 'Minimum source quality' })}</Label>
            <Badge variant="secondary">{pct(evidenceGateMinScore)}</Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.rag.antiHallucination.higherStricter', { defaultValue: 'Higher = stricter' })}
          </p>
          <Slider
            className="mt-2"
            value={[evidenceGateMinScore]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={([v]) => onChange('evidenceGateMinScore', v)}
          />

          <div className="flex items-center justify-between mt-4">
            <Label>{t('settings.rag.antiHallucination.evidenceMinChunks', { defaultValue: 'Minimum supporting sources' })}</Label>
            <Badge variant="secondary">{evidenceGateMinChunks}</Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.rag.antiHallucination.evidenceMinChunksHelp', {
              defaultValue: 'How many quality sources are required before the assistant will answer.',
            })}
          </p>
          <Slider
            className="mt-2"
            value={[evidenceGateMinChunks]}
            min={1}
            max={10}
            step={1}
            onValueChange={([v]) => onChange('evidenceGateMinChunks', Math.round(v))}
          />
        </div>
      </section>

      {/* ── Confidence ────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-blue-600" />
          <h4 className="text-sm font-semibold">
            {t('settings.rag.antiHallucination.confidenceTitle', { defaultValue: 'Confidence' })}
          </h4>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>{t('settings.rag.antiHallucination.lowConfidence', { defaultValue: 'Only answer when confident' })}</Label>
            <Badge variant="secondary">{pct(lowConfidenceThreshold)}</Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.rag.antiHallucination.lowConfidenceHelp', {
              defaultValue: 'Below this confidence the answer is flagged or suppressed. Higher = stricter.',
            })}
          </p>
          <Slider
            className="mt-2"
            value={[lowConfidenceThreshold]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={([v]) => onChange('lowConfidenceThreshold', v)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>{t('settings.rag.antiHallucination.highConfidence', { defaultValue: 'High-confidence threshold' })}</Label>
            <Badge variant="secondary">{pct(highConfidenceThreshold)}</Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.rag.antiHallucination.highConfidenceHelp', {
              defaultValue: 'At/above this confidence the answer is presented without hedging.',
            })}
          </p>
          <Slider
            className="mt-2"
            value={[highConfidenceThreshold]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={([v]) => onChange('highConfidenceThreshold', v)}
          />
        </div>
      </section>

      {/* ── Retrieval & answer style ──────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-purple-600" />
          <h4 className="text-sm font-semibold">
            {t('settings.rag.antiHallucination.retrievalTitle', { defaultValue: 'Retrieval & answer style' })}
          </h4>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>{t('settings.rag.antiHallucination.similarity', { defaultValue: 'Similarity threshold' })}</Label>
            <Badge variant="secondary">{similarityThreshold.toFixed(3)}</Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.rag.antiHallucination.similarityHelp', {
              defaultValue: 'Minimum cosine similarity for a chunk to be considered. Higher = stricter recall (keep low; this corpus scores low).',
            })}
          </p>
          <Slider
            className="mt-2"
            value={[similarityThreshold]}
            min={0.001}
            max={0.5}
            step={0.005}
            onValueChange={([v]) => onChange('similarityThreshold', v)}
          />
        </div>

        <div>
          <Label>{t('settings.rag.antiHallucination.strictLevel', { defaultValue: 'Strictness level' })}</Label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
            {t('settings.rag.antiHallucination.strictLevelHelp', {
              defaultValue: 'How rigidly the answer must stick to the cited sources.',
            })}
          </p>
          <Select value={strictModeLevel} onValueChange={(v) => onChange('strictModeLevel', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strict">{t('settings.rag.antiHallucination.levelStrict', { defaultValue: 'Strict — quote sources, no interpretation' })}</SelectItem>
              <SelectItem value="medium">{t('settings.rag.antiHallucination.levelMedium', { defaultValue: 'Medium — grounded, light synthesis' })}</SelectItem>
              <SelectItem value="relaxed">{t('settings.rag.antiHallucination.levelRelaxed', { defaultValue: 'Relaxed — synthesize across sources' })}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>{t('settings.rag.antiHallucination.determinism', { defaultValue: 'Answer determinism (temperature)' })}</Label>
            <Badge variant="secondary">{strictModeTemperature.toFixed(2)}</Badge>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('settings.rag.antiHallucination.determinismHelp', {
              defaultValue: 'Lower = more deterministic and repeatable answers in strict mode.',
            })}
          </p>
          <Slider
            className="mt-2"
            value={[strictModeTemperature]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={([v]) => onChange('strictModeTemperature', v)}
          />
        </div>
      </section>
    </div>
  );
};

export default AdvancedRagSettingsPanel;
