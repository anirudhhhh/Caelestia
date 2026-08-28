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
    <div className="h-[calc(100vh-8.5rem)] flex flex-col gap-5 min-h-0 overflow-y-auto pr-1 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            Enterprise Secret Registration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Register enterprise API keys and credentials for zero-knowledge HMAC-SHA256 fingerprint matching.
          </p>
        </div>
        <Button onClick={() => { setIsRegisterOpen(true); setRegistrationSuccess(null); }} className="gap-2 shadow-sm">
          <KeyRound className="w-4 h-4" />
          Register New Secret
        </Button>
      </div>

      {/* Security Guarantee Alert */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center gap-3 text-sm">
          <Lock className="w-5 h-5 text-primary shrink-0" />
          <div>
            <span className="font-semibold text-foreground">Zero Plaintext Persistence Guarantee:</span> Raw secret values are processed in volatile memory to compute an immutable HMAC-SHA256 fingerprint and discarded immediately. Plaintext secrets are never written to disk, databases, or logs.
          </div>
        </CardContent>
      </Card>

      {/* Registered Secrets Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg">Active Fingerprints</CardTitle>
            <CardDescription>All registered credentials currently protected by perimeter firewall.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadSecrets} className="gap-1 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Secret ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Firewall Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Last Matched</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {isLoading ? 'Loading registered secrets...' : 'No secrets registered yet. Click "Register New Secret" to protect enterprise credentials.'}
                  </TableCell>
                </TableRow>
              ) : (
                secrets.map((sec) => (
                  <TableRow key={sec.secret_id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      <div className="flex items-center gap-1.5">
                        {sec.secret_id}
                        <button 
                          onClick={() => handleCopyId(sec.secret_id)} 
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Copy Secret ID"
                        >
                          {copiedId === sec.secret_id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs font-medium">
                        {sec.secret_type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sec.action_on_match === 'block' ? 'destructive' : 'secondary'} className="uppercase text-[10px] font-bold tracking-wider">
                        {sec.action_on_match}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sec.status === 'active' ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-muted-foreground text-xs gap-1">
                          <XCircle className="w-3 h-3" /> Revoked
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(sec.date_registered).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sec.date_last_matched ? new Date(sec.date_last_matched).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      {sec.status === 'active' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setRevokingSecret(sec)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-8"
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Registration Modal */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Register Enterprise Secret
            </DialogTitle>
            <DialogDescription>
              Submit an enterprise secret token to compute a zero-knowledge HMAC fingerprint. The plaintext value is immediately discarded.
            </DialogDescription>
          </DialogHeader>

          {registrationSuccess ? (
            <div className="space-y-4 py-3">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Secret Registered Successfully</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    The HMAC-SHA256 fingerprint has been generated and activated across perimeter firewalls.
                  </p>
                  <div className="mt-3 font-mono text-xs bg-background p-2 rounded border border-border">
                    ID: {registrationSuccess.secret_id}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setIsRegisterOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="rawSecret">Raw Secret Value (Single-Use)</Label>
                <Input 
                  id="rawSecret"
                  type="password"
                  value={rawSecret}
                  onChange={(e) => setRawSecret(e.target.value)}
                  placeholder="e.g. sk-proj-1234567890abcdef..."
                  required
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  * Explicitly guaranteed: Raw secret is never saved, cached, or displayed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Secret Type</Label>
                  <Select value={secretType} onValueChange={setSecretType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="database_credential">Database Credential</SelectItem>
                      <SelectItem value="private_key">Private Key</SelectItem>
                      <SelectItem value="oauth_token">OAuth / Bearer Token</SelectItem>
                      <SelectItem value="other">Other Secret</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Action on Match</Label>
                  <Select value={actionOnMatch} onValueChange={setActionOnMatch}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Block Immediately</SelectItem>
                      <SelectItem value="block_escalate">Block & Escalate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsRegisterOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting || !rawSecret.trim()}>
                  {isSubmitting ? 'Computing Fingerprint...' : 'Register Fingerprint'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revocation Confirmation Dialog */}
      <Dialog open={!!revokingSecret} onOpenChange={() => setRevokingSecret(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Revoke Secret Fingerprint?
            </DialogTitle>
            <DialogDescription>
              Revoking this fingerprint means future occurrences of this secret will no longer be automatically blocked by the firewall. Confirm this credential has been rotated in your systems.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="text-xs font-mono bg-muted p-2.5 rounded">
              Secret ID: {revokingSecret?.secret_id} ({revokingSecret?.secret_type})
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokingSecret(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRevoke}>Confirm Revocation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
