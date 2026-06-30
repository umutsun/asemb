'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ShieldCheck, Scale, BookOpen, SlidersHorizontal } from 'lucide-react';
import { AdvancedRagSettingsPanel } from './AdvancedRagSettingsPanel';

/**
 * Anti-hallucination "mode" presets for the RAG settings tab.
 *
 * A single radio maps to a bundle of REAL `ragSettings.*` keys that the backend
 * reads (CLAUDE.md Hard Rule #2 — no stub controls). Values are tuned to this
 * system's actual scales: cosine similarity here scores low, so the strict preset
 * keeps `similarityThreshold` modest and relies on the Evidence Gate +
 * confidence thresholds for safety (a high 0.7/0.8 similarity would zero out
 * retrieval on this corpus).
 *
 * The `balanced` preset mirrors the backend defaults. The selected mode is
 * persisted as `ragSettings.antiHallucinationMode` (UI state for restoring the
 * selection; the backend ignores it).
 *
 * NOTE: language defaults (response_language / autoDefaultLanguage / ftsLanguage)
 * are deliberately NOT touched here — they are already set for the UAE demo and
 * are a separate concern from answer safety.
 */

export type AntiHallucinationMode = 'strict' | 'balanced' | 'comprehensive' | 'custom';

export const ANTI_HALLUCINATION_PRESETS: Record<
  Exclude<AntiHallucinationMode, 'custom'>,
  Record<string, any>
> = {
  strict: {
    strictMode: true,
    strictModeLevel: 'strict',
    strictModeTemperature: 0.2,
    similarityThreshold: 0.05,
    lowConfidenceThreshold: 0.6,
    highConfidenceThreshold: 0.8,
    evidenceGateEnabled: true,
    evidenceGateMinScore: 0.65,
    evidenceGateMinChunks: 3,
  },
  // Mirrors the backend defaults in rag-chat.service.ts.
  balanced: {
    strictMode: true,
    strictModeLevel: 'medium',
    strictModeTemperature: 0.4,
    similarityThreshold: 0.01,
    lowConfidenceThreshold: 0.5,
    highConfidenceThreshold: 0.7,
    evidenceGateEnabled: true,
    evidenceGateMinScore: 0.55,
    evidenceGateMinChunks: 2,
  },
  comprehensive: {
    strictMode: false,
    strictModeLevel: 'relaxed',
    strictModeTemperature: 0.6,
    similarityThreshold: 0.001,
    lowConfidenceThreshold: 0.3,
    highConfidenceThreshold: 0.6,
    evidenceGateEnabled: false,
    evidenceGateMinScore: 0.45,
    evidenceGateMinChunks: 1,
  },
};

const MODE_META: Array<{
  mode: AntiHallucinationMode;
  icon: React.ReactNode;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
}> = [
  {
    mode: 'strict',
    icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
    titleKey: 'settings.rag.antiHallucination.modeStrict',
    titleDefault: 'Strict — maximum safety',
    descKey: 'settings.rag.antiHallucination.modeStrictDesc',
    descDefault: 'Cite-or-refuse. Declines when evidence is weak. Best for legal accuracy.',
  },
  {
    mode: 'balanced',
    icon: <Scale className="h-4 w-4 text-blue-600" />,
    titleKey: 'settings.rag.antiHallucination.modeBalanced',
    titleDefault: 'Balanced (recommended)',
    descKey: 'settings.rag.antiHallucination.modeBalancedDesc',
    descDefault: 'Grounded answers with sensible refusal. The default.',
  },
  {
    mode: 'comprehensive',
    icon: <BookOpen className="h-4 w-4 text-amber-600" />,
    titleKey: 'settings.rag.antiHallucination.modeComprehensive',
    titleDefault: 'Comprehensive — maximum recall',
    descKey: 'settings.rag.antiHallucination.modeComprehensiveDesc',
    descDefault: 'Answers more often with lighter grounding. May be less precise.',
  },
  {
    mode: 'custom',
    icon: <SlidersHorizontal className="h-4 w-4 text-purple-600" />,
    titleKey: 'settings.rag.antiHallucination.modeCustom',
    titleDefault: 'Custom',
    descKey: 'settings.rag.antiHallucination.modeCustomDesc',
    descDefault: 'Tune every control yourself.',
  },
];

const norm = (v: any) => (typeof v === 'boolean' ? String(v) : String(v));

/** Derive which preset the current settings match (falls back to 'custom'). */
function derivePreset(s: Record<string, any>): AntiHallucinationMode {
  for (const mode of ['strict', 'balanced', 'comprehensive'] as const) {
    const patch = ANTI_HALLUCINATION_PRESETS[mode];
    const matches = Object.entries(patch).every(([k, v]) => {
      const cur = s?.[k];
      // treat strictMode default (unset => true) as true
      if (k === 'strictMode' && cur === undefined) return v === true;
      if (k === 'evidenceGateEnabled' && cur === undefined) return v === true;
      return norm(cur) === norm(v);
    });
    if (matches) return mode;
  }
  return 'custom';
}

export interface RagAntiHallucinationPresetsProps {
  /** Current ragSettings (tempRAGConfig.ragSettings). */
  settings: Record<string, any> | undefined;
  /** Atomic bulk merge into ragSettings (settings.tsx applyRAGSettings). */
  onApplyPreset: (patch: Record<string, any>) => void;
}

const pct = (n: number) => `${Math.round(Number(n) * 100)}%`;

export const RagAntiHallucinationPresets: React.FC<RagAntiHallucinationPresetsProps> = ({
  settings,
  onApplyPreset,
}) => {
  const { t } = useTranslation();
  const s = settings || {};

  const mode: AntiHallucinationMode =
    (s.antiHallucinationMode as AntiHallucinationMode) || derivePreset(s);

  const selectMode = (next: AntiHallucinationMode) => {
    if (next === 'custom') {
      onApplyPreset({ antiHallucinationMode: 'custom' });
      return;
    }
    onApplyPreset({ ...ANTI_HALLUCINATION_PRESETS[next], antiHallucinationMode: next });
  };

  // Any edit from the advanced panel flips the mode to custom, atomically.
  const handleAdvancedChange = (key: string, value: any) => {
    onApplyPreset({ [key]: value, antiHallucinationMode: 'custom' });
  };

  // Effective values for the read-only summary (fall back to backend defaults).
  const eff = {
    strictMode: (s.strictMode ?? true) !== false && s.strictMode !== 'false',
    evidenceGateEnabled: (s.evidenceGateEnabled ?? true) !== false && s.evidenceGateEnabled !== 'false',
    evidenceGateMinChunks: Number(s.evidenceGateMinChunks ?? 2),
    lowConfidenceThreshold: Number(s.lowConfidenceThreshold ?? 0.5),
  };

  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          {t('settings.rag.antiHallucination.title', { defaultValue: 'Answer safety (anti-hallucination)' })}
        </CardTitle>
        <CardDescription>
          {t('settings.rag.antiHallucination.subtitle', {
            defaultValue: 'Pick how strictly the assistant must ground answers in your sources.',
          })}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <RadioGroup value={mode} onValueChange={(v) => selectMode(v as AntiHallucinationMode)} className="gap-2">
          {MODE_META.map((m) => {
            const active = mode === m.mode;
            return (
              <label
                key={m.mode}
                htmlFor={`ah-${m.mode}`}
                className={[
                  'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  active
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                ].join(' ')}
              >
                <RadioGroupItem value={m.mode} id={`ah-${m.mode}`} className="mt-1" />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {m.icon}
                    <span className="text-sm font-medium">{t(m.titleKey, { defaultValue: m.titleDefault })}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(m.descKey, { defaultValue: m.descDefault })}
                  </p>
                </div>
              </label>
            );
          })}
        </RadioGroup>

        {/* Read-only summary for non-custom presets */}
        {mode !== 'custom' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Label className="text-xs text-gray-500 dark:text-gray-400">
              {t('settings.rag.antiHallucination.thisModeDoes', { defaultValue: 'This mode:' })}
            </Label>
            <Badge variant={eff.strictMode ? 'default' : 'secondary'}>
              {eff.strictMode
                ? t('settings.rag.antiHallucination.citeRequired', { defaultValue: 'Citations required' })
                : t('settings.rag.antiHallucination.citeOptional', { defaultValue: 'Citations optional' })}
            </Badge>
            <Badge variant={eff.evidenceGateEnabled ? 'default' : 'secondary'}>
              {eff.evidenceGateEnabled
                ? t('settings.rag.antiHallucination.gateOnBadge', {
                    defaultValue: 'Refuses below {{n}} sources',
                    n: eff.evidenceGateMinChunks,
                  })
                : t('settings.rag.antiHallucination.gateOffBadge', { defaultValue: 'No evidence gate' })}
            </Badge>
            <Badge variant="secondary">
              {t('settings.rag.antiHallucination.minConfBadge', {
                defaultValue: 'Min confidence {{p}}',
                p: pct(eff.lowConfidenceThreshold),
              })}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => selectMode('custom')}
            >
              <SlidersHorizontal className="h-3 w-3 me-1" />
              {t('settings.rag.antiHallucination.customize', { defaultValue: 'Customize' })}
            </Button>
          </div>
        )}

        {/* Advanced editable controls — only in custom mode */}
        {mode === 'custom' && (
          <AdvancedRagSettingsPanel settings={s} onChange={handleAdvancedChange} />
        )}
      </CardContent>
    </Card>
  );
};

export default RagAntiHallucinationPresets;
