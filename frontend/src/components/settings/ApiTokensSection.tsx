import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      toast({ variant: 'destructive', title: 'Name required', description: 'Give the token a descriptive name.' });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          API Tokens
        </CardTitle>
        <CardDescription>
          Long-lived bearer keys for external services to call the chat API. The plaintext token is shown only once on creation — copy it then.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="api-token-name">New token name</Label>
            <Input
              id="api-token-name"
              placeholder="e.g. luwi.dev widget"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={creating}
            />
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="w-4 h-4 mr-1" />
            {creating ? 'Generating…' : 'Generate'}
          </Button>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Existing tokens</div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : tokens.length === 0 ? (
            <div className="text-sm text-muted-foreground">No tokens yet.</div>
          ) : (
            <div className="border rounded-md divide-y">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {t.name}{' '}
                      {t.revoked_at && (
                        <span className="text-xs text-destructive ml-2">(revoked)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      created {timeAgo(t.created_at)} · last used {timeAgo(t.last_used_at)} · scopes: {t.scopes.join(', ')}
                    </div>
                  </div>
                  {!t.revoked_at && (
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(t.id)}>
                      <Trash2 className="w-4 h-4 mr-1" />
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!createdToken} onOpenChange={(open) => !open && setCreatedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new API token</DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertDescription>
              This is the only time the plaintext token is shown. Copy and store it somewhere safe — we only keep its hash.
            </AlertDescription>
          </Alert>
          {createdToken && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Name: {createdToken.name}</div>
              <div className="flex items-center gap-2">
                <Input readOnly value={createdToken.token} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button onClick={copyPlaintext}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Use it as: <code className="font-mono">Authorization: Bearer {createdToken.token.slice(0, 16)}…</code>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ApiTokensSection;
