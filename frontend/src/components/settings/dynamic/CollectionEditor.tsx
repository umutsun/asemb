'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import type { ValueMap, SetValue } from './types';

const TONES = ['professional', 'friendly', 'casual', 'technical', 'empathetic', 'concise', 'educational'];
const KEY = 'prompts.list';

interface Prompt {
  id: string;
  name: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  conversationTone?: string;
  isActive?: boolean;
}

// Editor for the prompts.list JSON array (system prompts / personas). Writes the whole
// array back into the shell dirty map under 'prompts.list'; global Save persists it.
export function PromptsEditor({ values, set }: { values: ValueMap; set: SetValue }) {
  const raw = values[KEY];
  const list: Prompt[] = Array.isArray(raw) ? raw : [];
  const [openId, setOpenId] = useState<string | null>(null);

  const update = (next: Prompt[]) => set(KEY, next);
  const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p-${list.length + 1}`;

  const addPrompt = () => {
    const np: Prompt = {
      id: newId(),
      name: 'New prompt',
      systemPrompt: '',
      temperature: 0.3,
      maxTokens: 2000,
      conversationTone: 'professional',
      isActive: list.length === 0,
    };
    update([...list, np]);
    setOpenId(np.id);
  };
  const patch = (id: string, p: Partial<Prompt>) =>
    update(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const del = (id: string) => update(list.filter((x) => x.id !== id));
  const setActive = (id: string) => update(list.map((x) => ({ ...x, isActive: x.id === id })));

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Prompts · {list.length}
        </span>
        <Button size="sm" variant="outline" onClick={addPrompt}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <div className="divide-y divide-border">
        {list.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No prompts yet.</div>
        ) : (
          list.map((p) => (
            <div key={p.id}>
              <div className="flex items-center gap-2 px-3.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform',
                      openId === p.id && 'rotate-90',
                    )}
                  />
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {p.name || '(unnamed)'}
                  </span>
                  {p.isActive ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      active
                    </span>
                  ) : null}
                </button>
                {!p.isActive ? (
                  <Button size="sm" variant="ghost" onClick={() => setActive(p.id)}>
                    Set active
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => del(p.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              {openId === p.id ? (
                <div className="space-y-3 bg-muted/20 px-3.5 py-3">
                  <div>
                    <label className="mb-1 block text-[11.5px] text-muted-foreground">Name</label>
                    <Input value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] text-muted-foreground">System prompt</label>
                    <Textarea
                      className="min-h-[120px] text-[12px]"
                      value={p.systemPrompt}
                      onChange={(e) => patch(p.id, { systemPrompt: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <label className="mb-1 block text-[11.5px] text-muted-foreground">Tone</label>
                      <Select
                        value={p.conversationTone || 'professional'}
                        onValueChange={(v) => patch(p.id, { conversationTone: v })}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TONES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] text-muted-foreground">Temperature</label>
                      <Input
                        type="number"
                        className="w-[100px]"
                        step={0.05}
                        min={0}
                        max={2}
                        value={p.temperature ?? 0.3}
                        onChange={(e) => patch(p.id, { temperature: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11.5px] text-muted-foreground">Max tokens</label>
                      <Input
                        type="number"
                        className="w-[110px]"
                        value={p.maxTokens ?? 2000}
                        onChange={(e) => patch(p.id, { maxTokens: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
