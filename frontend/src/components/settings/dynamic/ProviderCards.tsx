'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Check, X, Loader2, ShieldCheck } from 'lucide-react';
import { getSettingsValues, saveSettingsFlat } from '@/lib/api/settings';
import type { ValueMap, SetValue } from './types';

const MASK = '••••••••';

type Status = { validated: boolean; date?: string };

// Metadata-driven provider cards: API key (secret), Test Connection (via the existing
// POST /api/v2/api-validation/test/:provider), a PERSISTENT validation badge (loaded from
// the stored apiStatus.* and refreshed on a successful test), and model/pricing info.
export function ProviderCards({
  metadata,
  values,
  set,
}: {
  metadata: any;
  values: ValueMap;
  set: SetValue;
}) {
  const providers: any[] = metadata?.providers ?? [];
  const [status, setStatus] = useState<Record<string, Status>>({});

  useEffect(() => {
    if (!providers.length) return;
    let cancelled = false;
    const keys = providers.flatMap((p) => [`apiStatus.${p.id}.status`, `apiStatus.${p.id}.verifiedDate`]);
    getSettingsValues(keys)
      .then((v) => {
        if (cancelled) return;
        const s: Record<string, Status> = {};
        for (const p of providers) {
          const st = v[`apiStatus.${p.id}.status`];
          const dt = v[`apiStatus.${p.id}.verifiedDate`];
          s[p.id] = { validated: st === 'active' || st === 'success' || !!dt, date: dt || undefined };
        }
        setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providers.length]);

  const markValidated = (id: string, date: string) =>
    setStatus((s) => ({ ...s, [id]: { validated: true, date } }));

  if (!providers.length) {
    return <div className="p-4 text-sm text-muted-foreground">Loading providers…</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {providers.map((p) => (
        <ProviderCard
          key={p.id}
          p={p}
          values={values}
          set={set}
          status={status[p.id]}
          onValidated={markValidated}
        />
      ))}
    </div>
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function ProviderCard({
  p,
  values,
  set,
  status,
  onValidated,
}: {
  p: any;
  values: ValueMap;
  set: SetValue;
  status?: Status;
  onValidated: (id: string, date: string) => void;
}) {
  const keyKey = `${p.id}.apiKey`;
  const raw = values[keyKey];
  const saved = raw === MASK;
  const v = saved ? '' : raw ?? '';
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const validated = status?.validated;

  const test = async () => {
    const key = String(values[keyKey] ?? '');
    if (!key || key === MASK) {
      setResult({ ok: false, msg: 'Enter a key to test' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const model = p.defaultChatModel || p.defaultEmbeddingModel || '';
      const res = await fetch(`/api/v2/api-validation/test/${p.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, model }),
      });
      const d = await res.json();
      if (d.success) {
        setResult({ ok: true, msg: `OK · ${d.responseTime || 0}ms` });
        // Persist the validated key + status so the ✓ badge sticks (matches old UX).
        const date = new Date().toISOString();
        try {
          await saveSettingsFlat({
            [keyKey]: key,
            [`apiStatus.${p.id}.status`]: 'active',
            [`apiStatus.${p.id}.verifiedDate`]: date,
          });
        } catch {
          /* non-fatal — the live result still shows */
        }
        onValidated(p.id, date);
      } else {
        setResult({ ok: false, msg: d.error || 'Failed' });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || 'Error' });
    } finally {
      setTesting(false);
    }
  };

  const caps = (p.type || []).join(' · ');
  const modelCount = (p.chatModels?.length || 0) + (p.embeddingModels?.length || 0);

  return (
    <div className={cn('rounded-lg border bg-card p-3', validated ? 'border-green-500/40' : 'border-border')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-foreground">{p.name}</span>
            {validated ? <ShieldCheck className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" /> : null}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {caps} · {modelCount} models
          </div>
        </div>
        {validated ? (
          <span className="whitespace-nowrap rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-600 dark:text-green-400">
            valid{status?.date ? ` · ${fmtDate(status.date)}` : ''}
          </span>
        ) : saved ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            saved
          </span>
        ) : null}
      </div>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={String(v)}
          placeholder={saved ? 'saved · enter to replace' : 'API key'}
          onChange={(e) => set(keyKey, e.target.value)}
          className="pr-9 text-[12px]"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
        </Button>
        {result ? (
          <span
            className={cn(
              'flex items-center gap-1 text-[11.5px]',
              result.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive',
            )}
          >
            {result.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {result.msg}
          </span>
        ) : null}
      </div>
      {p.defaultChatModel || p.defaultEmbeddingModel ? (
        <div className="mt-1.5 text-[10.5px] text-muted-foreground">
          default: {p.defaultChatModel || p.defaultEmbeddingModel}
        </div>
      ) : null}
    </div>
  );
}
