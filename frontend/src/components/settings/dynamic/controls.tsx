'use client';

import React, { useState } from 'react';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SchemaField, SetValue, ValueMap } from './types';

// ---- small shared pieces ----------------------------------------------------

function fmt(n: number, step?: number): string {
  if (!Number.isFinite(n)) return '';
  const decimals = step && step < 1 ? Math.min(3, String(step).split('.')[1]?.length ?? 2) : 0;
  return n.toFixed(decimals);
}

function ValueChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="min-w-[46px] rounded-md bg-primary/10 px-2 py-0.5 text-center text-[12px] font-semibold tabular-nums text-primary">
      {children}
    </span>
  );
}

export function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {help ? <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{help}</div> : null}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 overflow-hidden rounded-lg border border-border">
      {title ? (
        <div className="border-b border-border bg-muted/40 px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      ) : null}
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'px-3 py-1.5 text-[12px] transition-colors',
            i > 0 && 'border-l border-border',
            value === o.value
              ? 'bg-primary/10 font-semibold text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- per-field controls -----------------------------------------------------

function SwitchRow({ field, values, set }: FieldProps) {
  const v = Boolean(values[field.key]);
  return (
    <Row label={field.label} help={field.help}>
      <Switch checked={v} onCheckedChange={(c) => set(field.key, c)} />
    </Row>
  );
}

function SliderRow({ field, values, set }: FieldProps) {
  const raw = values[field.key];
  const v = typeof raw === 'number' ? raw : Number(raw) || field.min || 0;
  const min = field.min ?? 0;
  const max = field.max ?? 1;
  const step = field.step ?? (max - min <= 2 ? 0.01 : 1);
  return (
    <Row label={field.label} help={field.help}>
      <Slider
        className="w-[180px]"
        value={[v]}
        min={min}
        max={max}
        step={step}
        onValueChange={([nv]) => set(field.key, nv)}
      />
      <ValueChip>
        {fmt(v, step)}
        {field.unit ? ` ${field.unit}` : ''}
      </ValueChip>
    </Row>
  );
}

function RangeRow({ field, values, set }: FieldProps) {
  const maxKey = field.rangeMaxKey!;
  const lo = Number(values[field.key] ?? field.min ?? 0);
  const hi = Number(values[maxKey] ?? field.max ?? 0);
  const min = field.min ?? 0;
  const max = field.max ?? 50;
  const step = field.step ?? 1;
  return (
    <Row label={field.label} help={field.help}>
      <ValueChip>{fmt(lo, step)}</ValueChip>
      <Slider
        className="w-[150px]"
        value={[lo, hi]}
        min={min}
        max={max}
        step={step}
        onValueChange={([nlo, nhi]) => {
          set(field.key, nlo);
          set(maxKey, nhi);
        }}
      />
      <ValueChip>{fmt(hi, step)}</ValueChip>
    </Row>
  );
}

function SegmentedRow({ field, values, set }: FieldProps) {
  const v = String(values[field.key] ?? '');
  return (
    <Row label={field.label} help={field.help}>
      <Segmented value={v} options={field.options ?? []} onChange={(nv) => set(field.key, nv)} />
    </Row>
  );
}

function SelectRow({ field, values, set }: FieldProps) {
  const v = String(values[field.key] ?? '');
  const opts = field.options ?? [];
  // Keep an arbitrary stored value selectable even if it's not in the option list.
  const allOpts = v && !opts.some((o) => o.value === v) ? [{ value: v, label: v }, ...opts] : opts;
  return (
    <Row label={field.label} help={field.help}>
      <Select value={v} onValueChange={(nv) => set(field.key, nv)}>
        <SelectTrigger className="min-w-[180px] max-w-[260px]">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {allOpts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}

function TextRow({ field, values, set }: FieldProps) {
  const v = values[field.key] ?? '';
  return (
    <Row label={field.label} help={field.help}>
      <Input
        className="w-[220px]"
        type={field.type === 'number' ? 'number' : 'text'}
        value={v === null || v === undefined ? '' : String(v)}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(e) =>
          set(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
    </Row>
  );
}

export const SECRET_MASK = '••••••••';

function SecretRow({ field, values, set }: FieldProps) {
  const [show, setShow] = useState(false);
  const raw = values[field.key];
  const saved = raw === SECRET_MASK; // a stored secret; untouched → not dirty → preserved
  const v = saved ? '' : raw ?? '';
  return (
    <Row label={field.label} help={field.help}>
      <div className="flex items-center gap-2">
        {saved ? (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">saved</span>
        ) : null}
        <div className="relative">
          <Input
            className="w-[220px] pr-9"
            type={show ? 'text' : 'password'}
            value={String(v)}
            placeholder={saved ? 'saved · enter to replace' : 'enter key'}
            onChange={(e) => set(field.key, e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </Row>
  );
}

function TextareaRow({ field, values, set }: FieldProps) {
  const isJson = field.control === 'json' || field.type === 'json';
  const raw = values[field.key];
  const initial = isJson && raw && typeof raw === 'object' ? JSON.stringify(raw, null, 2) : String(raw ?? '');
  const [text, setText] = useState(initial);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="px-3.5 py-3">
      <div className="mb-1 text-[13px] font-medium text-foreground">{field.label}</div>
      {field.help ? <div className="mb-2 text-[11.5px] text-muted-foreground">{field.help}</div> : null}
      <Textarea
        className="min-h-[110px] font-mono text-[12px]"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (isJson) {
            try {
              set(field.key, t.trim() ? JSON.parse(t) : null);
              setErr(null);
            } catch {
              setErr('Invalid JSON');
            }
          } else {
            set(field.key, t);
          }
        }}
      />
      {err ? <div className="mt-1 text-[11.5px] text-destructive">{err}</div> : null}
    </div>
  );
}

function SourceBars({ field, values, set }: FieldProps) {
  const obj: Record<string, number> =
    values[field.key] && typeof values[field.key] === 'object' ? values[field.key] : {};
  const entries = Object.entries(obj);
  const cap = Math.max(2, ...entries.map(([, w]) => Number(w) || 0));
  return (
    <>
      {entries.length === 0 ? (
        <Row label={field.label} help="No entries yet." >{null}</Row>
      ) : (
        entries.map(([name, w]) => {
          const weight = Number(w) || 0;
          return (
            <div key={name} className="flex items-center gap-3.5 px-3.5 py-3">
              <div className="w-40 flex-shrink-0 truncate text-[13px] font-medium text-foreground">{name}</div>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (weight / cap) * 100)}%` }}
                />
              </div>
              <Slider
                className="w-[120px]"
                value={[weight]}
                min={0}
                max={Math.ceil(cap)}
                step={0.5}
                onValueChange={([nv]) => set(field.key, { ...obj, [name]: nv })}
              />
              <ValueChip>{fmt(weight, 0.5)}</ValueChip>
            </div>
          );
        })
      )}
    </>
  );
}

// ---- dispatcher -------------------------------------------------------------

export interface FieldProps {
  field: SchemaField;
  values: ValueMap;
  set: SetValue;
}

export function FieldRow(props: FieldProps) {
  switch (props.field.control) {
    case 'switch':
      return <SwitchRow {...props} />;
    case 'slider':
      return <SliderRow {...props} />;
    case 'range':
      return <RangeRow {...props} />;
    case 'segmented':
      return <SegmentedRow {...props} />;
    case 'select':
      return <SelectRow {...props} />;
    case 'secret':
      return <SecretRow {...props} />;
    case 'textarea':
    case 'json':
      return <TextareaRow {...props} />;
    case 'sourceBars':
      return <SourceBars {...props} />;
    case 'text':
    default:
      return <TextRow {...props} />;
  }
}

// ---- advanced expander ------------------------------------------------------

export function AdvancedExpander({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
        Advanced
        <span className="ml-auto text-[10.5px] text-muted-foreground">{count} controls</span>
      </button>
      {open ? <div className="mt-2.5">{children}</div> : null}
    </div>
  );
}
