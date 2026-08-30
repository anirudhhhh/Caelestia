import React, { useState, useEffect } from 'react';
import { 
  KeyRound, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, 
  Trash2, RefreshCw, Copy, Check, Lock, ExternalLink, ShieldCheck, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import SegmentedProgress from '@/components/ui/SegmentedProgress';

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
    <div className="h-full w-full overflow-y-auto space-y-5 sm:space-y-6 pr-1 pb-12 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328] flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            Zero-Knowledge Secret Vault
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Register enterprise API tokens for volatile HMAC-SHA256 fingerprint matching
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadSecrets} 
            disabled={isLoading} 
            className="bento-btn-secondary h-9 px-3.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Vault</span>
          </Button>
          <Button 
            onClick={() => { setIsRegisterOpen(true); setRegistrationSuccess(null); }} 
            className="bento-btn-primary h-9 px-4 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1 text-[#FFC83B]" />
            <span>Register Secret</span>
          </Button>
        </div>
      </div>

      {/* Hero Bento Alert Banner (Warm Bento Style) */}
      <div id="secrets-register" className="bento-card-warm p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-xs">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#212328]">Zero Plaintext Persistence Architecture</h3>
            <span className="text-[11px] text-zinc-600 font-bold">HMAC-SHA256 Cryptographic Guarantees</span>
          </div>
        </div>
        <p className="text-xs text-zinc-700 leading-relaxed font-medium">
          Raw secret strings are processed strictly inside volatile memory to calculate 64-character SHA256 fingerprints and destroyed immediately. Plaintext credentials are never written to disk, PostgreSQL databases, or application log files.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <span className="stat-pill text-[10px]">64-CHAR HASH</span>
          <span className="stat-pill-light text-[10px]">VOLATILE RAM ONLY</span>
        </div>
      </div>

      {/* Active Fingerprints Bento Card (Reference Habit List Style) */}
      <div id="secrets-active-list" className="bento-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
              Active Fingerprint Registry
            </h3>
            <p className="text-xs text-zinc-500 font-medium">Perimeter credential tokens currently active in real-time firewall</p>
          </div>
          <span className="stat-pill text-[10px]">{secrets.length} REGISTERED</span>
        </div>

        <div className="space-y-3">
          {secrets.length > 0 ? (
            secrets.map((sec) => (
              <div
                key={sec.secret_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-black/5 transition-all gap-3"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-xs shrink-0">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-black text-[#212328]">
                        {sec.secret_id}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white text-[10px] font-bold text-zinc-600 border border-black/5 uppercase">
                        {sec.secret_type}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                        sec.action_on_match === 'block' ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                      )}>
                        {sec.action_on_match}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                        {sec.status || 'ACTIVE'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-zinc-500 mt-1 truncate max-w-xs sm:max-w-md">
                      Hash: {sec.fingerprint || "hmac_sha256_verified"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleCopyId(sec.secret_id)}
                    className="bento-btn-secondary h-8 px-3 text-xs"
                  >
                    {copiedId === sec.secret_id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedId === sec.secret_id ? "Copied" : "Copy ID"}</span>
                  </button>
                  <button
                    onClick={() => setRevokingSecret(sec)}
                    className="h-8 w-8 rounded-full bg-white hover:bg-rose-50 border border-black/5 text-rose-600 flex items-center justify-center transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-zinc-500 font-medium">
              No secrets registered yet. Click &quot;Register Secret&quot; to protect enterprise tokens.
            </div>
          )}
        </div>
      </div>

      {/* Registration Dialog */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-lg p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#212328]">
              Register Enterprise Credential
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Secret value is hashed once in memory and instantly erased.
            </DialogDescription>
          </DialogHeader>

          {registrationSuccess ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Secret Fingerprint Generated Successfully
              </div>
              <div className="font-mono text-[11px] bg-white p-2.5 rounded-xl border border-emerald-200 break-all">
                {registrationSuccess.secret_id}
              </div>
              <p className="text-[11px] text-emerald-700">The secret is now protected by the live gateway firewall.</p>
              <Button 
                onClick={() => { setIsRegisterOpen(false); setRegistrationSuccess(null); }}
                className="bento-btn-primary w-full text-xs mt-2"
              >
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5 py-2">
              <div>
                <label className="text-xs font-bold text-zinc-700 block mb-1">Secret / Token Plaintext</label>
                <Input
                  type="password"
                  value={rawSecret}
                  onChange={(e) => setRawSecret(e.target.value)}
                  placeholder="sk-proj-..., AKIAIOSFODNN7EXAMPLE, or API Key"
                  className="rounded-xl bg-[#FAF8F5] font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-zinc-700 block mb-1">Secret Type</label>
                  <Select value={secretType} onValueChange={setSecretType}>
                    <SelectTrigger className="rounded-xl bg-[#FAF8F5] h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-black/10 rounded-2xl">
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="oauth_token">OAuth Token</SelectItem>
                      <SelectItem value="jwt_secret">JWT Secret</SelectItem>
                      <SelectItem value="db_password">DB Password</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-700 block mb-1">Action on Match</label>
                  <Select value={actionOnMatch} onValueChange={setActionOnMatch}>
                    <SelectTrigger className="rounded-xl bg-[#FAF8F5] h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-black/10 rounded-2xl">
                      <SelectItem value="block">Block Request</SelectItem>
                      <SelectItem value="flag">Flag Warning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-black/5">
                <Button variant="ghost" type="button" onClick={() => setIsRegisterOpen(false)} className="rounded-full text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !rawSecret.trim()} className="bento-btn-primary text-xs">
                  Generate HMAC Fingerprint
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog open={!!revokingSecret} onOpenChange={() => setRevokingSecret(null)}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-md p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-rose-600">
              Revoke Secret Fingerprint
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Are you sure you want to remove this credential fingerprint? Incoming requests containing this token will no longer be intercepted.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3 border-t border-black/5 flex justify-between">
            <Button variant="ghost" onClick={() => setRevokingSecret(null)} className="rounded-full text-xs">
              Cancel
            </Button>
            <Button onClick={handleRevoke} className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm">
              Revoke Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
