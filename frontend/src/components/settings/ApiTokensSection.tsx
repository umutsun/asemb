import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Copy, Plus, Trash2, KeyRound } from 'lucide-react';

interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface CreatedToken extends ApiTokenRow {
  token: string;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return iso;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export const ApiTokensSection: React.FC = () => {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/admin/tokens', { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTokens(Array.isArray(data?.tokens) ? data.tokens : []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to load tokens', description: String(err?.message ?? err) });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ variant: 'destructive', title: 'Name required', description: 'Give the token a short label.' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/v2/admin/tokens', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, scopes: ['chat'] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: CreatedToken = await res.json();
      setCreatedToken(data);
      setNewName('');
      await refresh();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to create token', description: String(err?.message ?? err) });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Revoke this token? External clients using it will stop working immediately.')) return;
    try {
      const res = await fetch(`/api/v2/admin/tokens/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Token revoked' });
      await refresh();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to revoke token', description: String(err?.message ?? err) });
    }
  };

  const copyPlaintext = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Select and copy the token manually.' });
    }
  };

  const activeTokens = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
        <Label className="text-xs font-medium">Chatbot Bearer Tokens</Label>
        <span className="text-[11px] text-muted-foreground">
          ({activeTokens.length} active)
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        For external services calling <code className="font-mono">/api/v2/chat</code>.
        Plaintext shown once — copy on creation.
      </p>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Name (e.g. luwi.dev widget)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          disabled={creating}
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0"
          onClick={handleCreate}
          disabled={creating}
          title="Generate API token"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-[11px] text-muted-foreground">Loading…</div>
      ) : activeTokens.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">No active tokens.</div>
      ) : (
        <ul className="text-xs border rounded-md divide-y bg-background/50">
          {activeTokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  last used {timeAgo(t.last_used_at)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleRevoke(t.id)}
                title="Revoke"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!createdToken} onOpenChange={(open) => !open && setCreatedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new API token</DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertDescription>
              Shown only once. Copy and store it now — we only keep its hash.
            </AlertDescription>
          </Alert>
          {createdToken && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Name: {createdToken.name}</div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdToken.token}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button onClick={copyPlaintext}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiTokensSection;
