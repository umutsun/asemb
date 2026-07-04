'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getSettingsSchema, getSettingsValues, saveSettingsFlat, getLlmMetadata } from '@/lib/api/settings';
import { EMBEDS } from './embeds';
import { ProviderCards } from './ProviderCards';
import { PromptsEditor } from './CollectionEditor';
import { FieldRow, Group, AdvancedExpander } from './controls';
import type { SettingsSchema, SchemaSection, SchemaGroup, ValueMap, Preset } from './types';

// Every dotted key the shell needs to load — visible fields, range partners, and
// preset target keys (which may not appear as their own field).
function collectKeys(schema: SettingsSchema): string[] {
  const keys = new Set<string>();
  schema.sections.forEach((s) =>
    s.groups.forEach((g) =>
      g.fields.forEach((f) => {
        keys.add(f.key);
        if (f.rangeMaxKey) keys.add(f.rangeMaxKey);
      }),
    ),
  );
  Object.values(schema.presets || {}).forEach((p) =>
    Object.keys(p.values).forEach((k) => keys.add(k)),
  );
  return [...keys];
}

// Registry defaults for every field, so keys with no live DB row still show their
// default (switch on, port 587, …) instead of empty. Loaded values override these.
function collectDefaults(schema: SettingsSchema): ValueMap {
  const out: ValueMap = {};
  schema.sections.forEach((s) =>
    s.groups.forEach((g) =>
      g.fields.forEach((f) => {
        if (f.default !== undefined) out[f.key] = f.default;
      }),
    ),
  );
  return out;
}

function valuesMatch(a: any, b: any): boolean {
  if (typeof b === 'number') return Math.abs(Number(a) - b) < 1e-9;
  if (typeof b === 'boolean') return Boolean(a) === b;
  return String(a) === String(b);
}

function PresetCards({
  presets,
  values,
  apply,
}: {
  presets: Record<string, Preset>;
  values: ValueMap;
  apply: (vals: Record<string, any>) => void;
}) {
  const keys = Object.keys(presets);
  const selected = keys.find((k) =>
    Object.entries(presets[k].values).every(([kk, vv]) => valuesMatch(values[kk], vv)),
  );
  return (
    <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {keys.map((k) => {
        const p = presets[k];
        const sel = k === selected;
        return (
          <button
            key={k}
            type="button"
            onClick={() => apply(p.values)}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
              sel ? 'border-primary bg-primary/10' : 'border-border hover:border-primary',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold text-foreground">{p.label}</span>
              <span
                className={cn(
                  'grid h-4 w-4 place-items-center rounded-full border',
                  sel ? 'border-primary bg-primary' : 'border-muted-foreground',
                )}
              >
                {sel ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
              </span>
            </div>
            <span className="text-[11.5px] leading-snug text-muted-foreground">{p.blurb}</span>
            {sel ? (
              <span className="mt-0.5 self-start rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                Active
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// Build select options from llm-metadata (e.g. every provider's chat models as "provider/model").
function buildMetaOptions(metadata: any, kind: 'chatModels' | 'embeddingModels') {
  const out: { value: string; label: string }[] = [];
  for (const p of metadata?.providers ?? []) {
    for (const m of p[kind] ?? []) {
      out.push({ value: `${p.id}/${m.id}`, label: `${p.name} · ${m.name}` });
    }
  }
  return out;
}

function SectionGroup({
  group,
  schema,
  values,
  set,
  applyPreset,
  metadata,
}: {
  group: SchemaGroup;
  schema: SettingsSchema;
  values: ValueMap;
  set: (k: string, v: any) => void;
  applyPreset: (vals: Record<string, any>) => void;
  metadata: any;
}) {
  if (group.preset === 'answerSafety') {
    return <PresetCards presets={schema.presets} values={values} apply={applyPreset} />;
  }
  if (group.providerCards) {
    return <ProviderCards metadata={metadata} values={values} set={set} />;
  }
  if (group.collection === 'prompts') {
    return <PromptsEditor values={values} set={set} />;
  }
  if (group.component) {
    const Embed = EMBEDS[group.component];
    return Embed ? <Embed /> : <div className="p-4 text-sm text-muted-foreground">Unknown panel: {group.component}</div>;
  }
  // Resolve metadata-driven select options (optionsFrom) into concrete options.
  const enrich = (f: any) =>
    f.optionsFrom && metadata ? { ...f, options: buildMetaOptions(metadata, f.optionsFrom) } : f;
  const normal = group.fields.filter((f) => !f.advanced).map(enrich);
  const advanced = group.fields.filter((f) => f.advanced).map(enrich);
  return (
    <>
      {normal.length > 0 ? (
        <Group title={group.title || undefined}>
          {normal.map((f) => (
            <FieldRow key={f.key} field={f} values={values} set={set} />
          ))}
        </Group>
      ) : null}
      {advanced.length > 0 ? (
        <AdvancedExpander count={advanced.length}>
          <Group title={group.title || 'Advanced'}>
            {advanced.map((f) => (
              <FieldRow key={f.key} field={f} values={values} set={set} />
            ))}
          </Group>
        </AdvancedExpander>
      ) : null}
    </>
  );
}

export default function SettingsShell() {
  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [values, setValues] = useState<ValueMap>({});
  const [dirty, setDirty] = useState<ValueMap>({});
  const [active, setActive] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const sc: SettingsSchema = await getSettingsSchema();
        if (cancelled) return;
        setSchema(sc);
        setActive(sc.sections[0]?.id || '');
        const [vals, md] = await Promise.all([
          getSettingsValues(collectKeys(sc)),
          getLlmMetadata().catch(() => null),
        ]);
        if (!cancelled) {
          setValues({ ...collectDefaults(sc), ...vals });
          setMetadata(md);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eff = useMemo(() => ({ ...values, ...dirty }), [values, dirty]);
  const isDirty = Object.keys(dirty).length > 0;
  const set = (k: string, v: any) => {
    setSaved(false);
    setDirty((d) => ({ ...d, [k]: v }));
  };
  const applyPreset = (vals: Record<string, any>) => {
    setSaved(false);
    setDirty((d) => ({ ...d, ...vals }));
  };

  const save = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveSettingsFlat(dirty);
      setValues((v) => ({ ...v, ...dirty }));
      setDirty({});
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const navGroups = useMemo(() => {
    const m = new Map<string, SchemaSection[]>();
    schema?.sections.forEach((s) => {
      const a = m.get(s.navGroup) || [];
      a.push(s);
      m.set(s.navGroup, a);
    });
    return [...m.entries()];
  }, [schema]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>;
  }
  if (!schema) {
    return <div className="p-6 text-sm text-destructive">{error || 'Failed to load settings.'}</div>;
  }

  const activeSection = schema.sections.find((s) => s.id === active) || schema.sections[0];

  return (
    <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[212px_1fr]">
      {/* NAV */}
      <nav className="flex flex-col gap-0.5 border-b border-border bg-muted/30 p-3 md:max-h-[85vh] md:overflow-y-auto md:border-b-0 md:border-r">
        {navGroups.map(([grp, secs]) => (
          <React.Fragment key={grp}>
            <div className="px-2.5 pb-1.5 pt-2.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
              {grp}
            </div>
            {secs.map((s) => {
              const on = active === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                    on
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current', on ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{s.title}</span>
                  {s.count > 0 ? (
                    <span className={cn('ml-auto text-[11px] tabular-nums', on ? 'text-primary' : 'text-muted-foreground')}>
                      {s.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </React.Fragment>
        ))}
        <div className="mt-auto pt-3">
          <Button className="w-full" size="sm" disabled={!isDirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <div className="mt-1.5 text-center text-[10.5px] text-muted-foreground">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : isDirty ? (
              'Unsaved changes'
            ) : saved ? (
              'Saved'
            ) : (
              'No changes'
            )}
          </div>
        </div>
      </nav>

      {/* PANE */}
      <div className="min-w-0 p-6">
        {activeSection ? (
          <>
            <div className="mb-4">
              <h2 className="text-[16px] font-semibold tracking-tight text-foreground">{activeSection.title}</h2>
              <p className="mt-0.5 max-w-[70ch] text-[12.5px] text-muted-foreground">{activeSection.blurb}</p>
            </div>
            {activeSection.groups.map((g) => (
              <SectionGroup
                key={g.id}
                group={g}
                schema={schema}
                values={eff}
                set={set}
                applyPreset={applyPreset}
                metadata={metadata}
              />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}
