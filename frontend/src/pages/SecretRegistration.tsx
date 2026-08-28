import React, { useState, useEffect } from 'react';
import { 
  KeyRound, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, 
  Trash2, RefreshCw, Copy, Check, Lock, ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';

export default function SecretRegistration() {
  const [secrets, setSecrets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Registration Modal State
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [rawSecret, setRawSecret] = useState('');
  const [secretType, setSecretType] = useState('api_key');
  const [actionOnMatch, setActionOnMatch] = useState('block');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<any>(null);

  // Revoke Dialog State
  const [revokingSecret, setRevokingSecret] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadSecrets();
  }, []);

  const loadSecrets = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSecrets();
      setSecrets(data);
    } catch (e) {
      console.error('Failed to load secrets:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawSecret.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await api.registerSecret(rawSecret.trim(), secretType, actionOnMatch);
      setRegistrationSuccess(res);
      setRawSecret('');
      loadSecrets();
    } catch (e) {
      console.error('Registration failed:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokingSecret) return;
    try {
      await api.revokeSecret(revokingSecret.secret_id);
      setRevokingSecret(null);
      loadSecrets();
    } catch (e) {
      console.error('Revocation failed:', e);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full w-full overflow-y-auto space-y-6 pr-2 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <KeyRound className="w-4.5 h-4.5 text-amber-400" />
            </div>
            Enterprise Secret Vault & HMAC Registry
          </h1>
          <p className="text-zinc-400 text-xs mt-1 font-medium max-w-2xl">
            Register enterprise API keys and credentials for zero-knowledge HMAC-SHA256 fingerprint matching.
          </p>
        </div>
        <button 
          type="button"
          onClick={() => { setIsRegisterOpen(true); setRegistrationSuccess(null); }} 
          className="faang-btn-primary h-9 px-4 gap-2 text-xs flex items-center justify-center shadow-lg font-bold cursor-pointer"
        >
          <KeyRound className="w-4 h-4" />
          <span>Register New Secret</span>
        </button>
      </div>

      {/* Security Guarantee Alert */}
      <div className="faang-card p-4.5 flex items-center gap-3.5 border-amber-500/30 bg-amber-500/[0.04]">
        <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div className="text-xs text-zinc-300 leading-relaxed font-medium">
          <strong className="text-amber-400 font-bold">Zero Plaintext Persistence Guarantee:</strong> Raw secret values are processed in volatile memory to compute an immutable HMAC-SHA256 fingerprint and discarded immediately. Plaintext secrets are never written to disk, databases, or logs.
        </div>
      </div>

      {/* Registered Secrets Table */}
      <div className="faang-card overflow-hidden">
        <div className="p-4.5 flex flex-row items-center justify-between border-b border-white/[0.07]">
          <div>
            <h3 className="text-sm font-bold text-white">Active HMAC Fingerprints ({secrets.length})</h3>
            <p className="text-xs text-zinc-400 mt-0.5 font-medium">All registered credentials currently protected by perimeter firewall.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadSecrets} className="faang-btn-ghost h-8 px-3 gap-1.5 text-xs text-zinc-300 hover:text-white">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#15161B] backdrop-blur-md border-b border-white/[0.08]">
              <TableRow className="border-white/[0.08] hover:bg-transparent">
                <TableHead className="text-xs font-bold text-zinc-300">Secret ID</TableHead>
                <TableHead className="text-xs font-bold text-zinc-300">Type</TableHead>
                <TableHead className="text-xs font-bold text-zinc-300">Firewall Action</TableHead>
                <TableHead className="text-xs font-bold text-zinc-300">Status</TableHead>
                <TableHead className="text-xs font-bold text-zinc-300">Registered</TableHead>
                <TableHead className="text-xs font-bold text-zinc-300">Last Matched</TableHead>
                <TableHead className="text-xs font-bold text-zinc-300 text-right pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-zinc-400 text-xs font-medium">
                    {isLoading ? 'Loading registered secrets...' : 'No secrets registered yet. Click "Register New Secret" to protect enterprise credentials.'}
                  </TableCell>
                </TableRow>
              ) : (
                secrets.map((sec) => (
                  <TableRow key={sec.secret_id} className="hover:bg-white/[0.03] transition-colors border-white/[0.06]">
                    <TableCell className="font-mono text-xs font-bold text-zinc-300">
                      <div className="flex items-center gap-1.5">
                        {sec.secret_id}
                        <button 
                          onClick={() => handleCopyId(sec.secret_id)} 
                          className="text-zinc-500 hover:text-amber-400 transition-colors"
                          title="Copy Secret ID"
                        >
                          {copiedId === sec.secret_id ? <Check className="w-3.5 h-3.5 text-amber-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="faang-chip chip-azure text-[10px] capitalize">
                        {sec.secret_type.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span 
                        className={`faang-chip uppercase text-[10px] font-bold ${
                          sec.action_on_match === 'block' 
                            ? 'chip-crimson' 
                            : 'chip-neutral'
                        }`}
                      >
                        {sec.action_on_match}
                      </span>
                    </TableCell>
                    <TableCell>
                      {sec.status === 'active' ? (
                        <span className="faang-chip chip-emerald text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" /> ACTIVE
                        </span>
                      ) : (
                        <span className="faang-chip chip-neutral text-[10px]">
                          <XCircle className="w-3 h-3" /> REVOKED
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {new Date(sec.date_registered).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {sec.date_last_matched ? new Date(sec.date_last_matched).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      {sec.status === 'active' && (
                        <button 
                          type="button"
                          onClick={() => setRevokingSecret(sec)}
                          className="faang-btn-crimson text-xs h-7 px-3 font-bold cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Registration Modal */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[500px] bg-[#15161B] border-white/[0.1] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <KeyRound className="w-5 h-5 text-amber-400" />
              Register Enterprise Secret
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Submit an enterprise secret token to compute a zero-knowledge HMAC fingerprint. The plaintext value is immediately discarded.
            </DialogDescription>
          </DialogHeader>

          {registrationSuccess ? (
            <div className="space-y-4 py-3">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-400">Secret Registered Successfully</h4>
                  <p className="text-xs text-zinc-300 mt-1">
                    The HMAC-SHA256 fingerprint has been generated and activated across perimeter firewalls.
                  </p>
                  <div className="mt-3 font-mono text-xs bg-black/50 p-2.5 rounded-lg border border-white/[0.08] text-white">
                    ID: {registrationSuccess.secret_id}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <button type="button" className="faang-btn-primary h-8 px-4 text-xs font-bold" onClick={() => setIsRegisterOpen(false)}>Done</button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="rawSecret" className="text-zinc-300 font-bold text-xs">Raw Secret Value (Single-Use)</Label>
                <Input 
                  id="rawSecret"
                  type="password"
                  value={rawSecret}
                  onChange={(e) => setRawSecret(e.target.value)}
                  placeholder="e.g. sk-proj-1234567890abcdef..."
                  required
                  autoFocus
                  className="bg-black/40 border-white/[0.1] text-white h-9"
                />
                <p className="text-[11px] text-zinc-400">
                  * Explicitly guaranteed: Raw secret is never saved, cached, or displayed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="secretTypeSelect" className="text-zinc-300 font-bold text-xs">Secret Type</Label>
                  <Select value={secretType} onValueChange={setSecretType}>
                    <SelectTrigger id="secretTypeSelect" aria-label="Select secret type" className="bg-black/40 border-white/[0.1] text-white h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#15161B] border-white/[0.1] text-white">
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="database_credential">Database Credential</SelectItem>
                      <SelectItem value="private_key">Private Key</SelectItem>
                      <SelectItem value="oauth_token">OAuth / Bearer Token</SelectItem>
                      <SelectItem value="other">Other Secret</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="actionSelect" className="text-zinc-300 font-bold text-xs">Action on Match</Label>
                  <Select value={actionOnMatch} onValueChange={setActionOnMatch}>
                    <SelectTrigger id="actionSelect" aria-label="Select action on match" className="bg-black/40 border-white/[0.1] text-white h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#15161B] border-white/[0.1] text-white">
                      <SelectItem value="block">Block Immediately</SelectItem>
                      <SelectItem value="block_escalate">Block & Escalate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-2 gap-2">
                <Button type="button" variant="outline" className="faang-btn-ghost text-xs h-9 text-zinc-300" onClick={() => setIsRegisterOpen(false)}>Cancel</Button>
                <button type="submit" disabled={isSubmitting || !rawSecret.trim()} className="faang-btn-primary text-xs h-9 px-4 font-bold cursor-pointer disabled:opacity-50">
                  {isSubmitting ? 'Computing Fingerprint...' : 'Register Fingerprint'}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revocation Confirmation Dialog */}
      <Dialog open={!!revokingSecret} onOpenChange={() => setRevokingSecret(null)}>
        <DialogContent className="sm:max-w-[440px] bg-[#15161B] border-white/[0.1] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              Revoke Secret Fingerprint?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Revoking this fingerprint means future occurrences of this secret will no longer be automatically blocked by the firewall. Confirm this credential has been rotated in your systems.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="text-xs font-mono bg-black/50 p-2.5 rounded-xl border border-white/[0.08] text-zinc-200">
              Secret ID: {revokingSecret?.secret_id} ({revokingSecret?.secret_type})
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="faang-btn-ghost text-xs h-9 text-zinc-300" onClick={() => setRevokingSecret(null)}>Cancel</Button>
            <button type="button" className="faang-btn-crimson text-xs h-9 px-4 font-bold cursor-pointer" onClick={handleRevoke}>Confirm Revocation</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
