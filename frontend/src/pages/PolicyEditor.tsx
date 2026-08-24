import { useState, useEffect } from 'react';
import { Save, Plus, AlertCircle, Info, Beaker, RotateCcw, Trash2, CheckCircle2, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { PolicyRule, ThresholdProposal } from '@/types';
import { api } from '@/lib/api';

const AVAILABLE_CHECKS = [
  'toxicity',
  'prompt_injection',
  'pii',
  'secrets',
  'sensitive_data',
  'system_prompt_leakage',
  'brand_safety',
  'hallucination_risk'
];

export default function PolicyEditor() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [originalPolicies, setOriginalPolicies] = useState<PolicyRule[]>([]);
  const [proposals, setProposals] = useState<ThresholdProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [publishedSuccess, setPublishedSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadProposalsOnly, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadPoliciesData(), loadProposalsOnly()]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPoliciesData = async () => {
    try {
      const data = await api.getPolicies().catch(() => [
        { id: '1', use_case: 'customer_support' as const, geography: 'US' as const, check_name: 'toxicity', block_threshold: 0.9, flag_threshold: 0.4, on_timeout: 'allow' as const },
        { id: '2', use_case: 'customer_support' as const, geography: 'US' as const, check_name: 'prompt_injection', block_threshold: 0.85, flag_threshold: 0.5, on_timeout: 'allow' as const },
        { id: '3', use_case: 'customer_support' as const, geography: 'US' as const, check_name: 'secrets', block_threshold: 0.5, flag_threshold: 0.3, on_timeout: 'block' as const },
        { id: '4', use_case: 'customer_support' as const, geography: 'US' as const, check_name: 'sensitive_data', block_threshold: 0.5, flag_threshold: 0.3, on_timeout: 'block' as const }
      ] satisfies PolicyRule[]);
      setPolicies(data);
      setOriginalPolicies(JSON.parse(JSON.stringify(data)));
    } catch (e) {
      console.error('Failed to load policies', e);
    }
  };

  const loadProposalsOnly = async () => {
    try {
      const propData = await api.getProposals().catch(() => []);
      setProposals(propData);
    } catch (e) {
      console.error('Failed to load proposals', e);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setPublishedSuccess(null);
    try {
      await api.updatePolicies(policies);
      setOriginalPolicies(JSON.parse(JSON.stringify(policies)));
      setPublishedSuccess('Policy published and hot-reloaded successfully into the running Policy Engine!');
      setTimeout(() => setPublishedSuccess(null), 4000);
    } catch (error) {
      console.error('Failed to save policies', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = (index: number, field: keyof PolicyRule, value: any) => {
    const updated = [...policies];
    updated[index] = { ...updated[index], [field]: value };
    setPolicies(updated);
  };

  const handleThresholdChange = (index: number, field: 'block_threshold' | 'flag_threshold', valStr: string) => {
    const num = parseFloat(valStr);
    const safeVal = isNaN(num) ? 0 : Math.max(0, Math.min(1, num));
    handleUpdate(index, field, safeVal);
  };

  const handleAdd = () => {
    setPolicies([
      ...policies,
      { id: `new_${Date.now()}`, use_case: 'customer_support', geography: 'US', check_name: 'toxicity', block_threshold: 0.85, flag_threshold: 0.4, on_timeout: 'allow' }
    ]);
  };

  const handleDelete = (index: number) => {
    const updated = policies.filter((_, i) => i !== index);
    setPolicies(updated);
  };

  const handleRevert = () => {
    setPolicies(JSON.parse(JSON.stringify(originalPolicies)));
    setPublishedSuccess(null);
  };

  const handleAcceptProposal = async (proposal: ThresholdProposal) => {
    const propId = proposal.id || proposal.proposal_id;
    if (!propId) return;

    try {
      const resp = await api.acceptProposal(propId);
      // Immediately reload updated policies from the policy engine
      await loadPoliciesData();
      await loadProposalsOnly();
      setPublishedSuccess(resp?.message || `Immune system proposal accepted: Updated ${proposal.check_name} block threshold to ${proposal.proposed_threshold}! Policy hot-reloaded.`);
      setTimeout(() => setPublishedSuccess(null), 5000);
    } catch (e) {
      console.error('Failed to accept proposal', e);
      // Fallback: apply locally and save
      const updated = policies.map(p => {
        if (p.check_name === proposal.check_name) {
          return { ...p, block_threshold: proposal.proposed_threshold };
        }
        return p;
      });
      setPolicies(updated);
      await api.updatePolicies(updated);
      setOriginalPolicies(JSON.parse(JSON.stringify(updated)));
      setProposals(prev => prev.filter(p => (p.id || p.proposal_id) !== propId));
      setPublishedSuccess(`Updated ${proposal.check_name} block threshold to ${proposal.proposed_threshold}! Policy saved.`);
      setTimeout(() => setPublishedSuccess(null), 5000);
    }
  };

  const handleDismissProposal = async (proposal: ThresholdProposal) => {
    const propId = proposal.id || proposal.proposal_id;
    if (!propId) return;
    try {
      await api.dismissProposal(propId).catch(() => {});
      setProposals(prev => prev.filter(p => (p.id || p.proposal_id) !== propId));
    } catch (e) {
      console.error('Failed to dismiss proposal', e);
    }
  };

  const getThresholdColor = (val: number) => {
    if (val < 0.5) return 'text-rose-500 font-bold';
    if (val < 0.8) return 'text-amber-500 font-medium';
    return 'text-emerald-500 font-semibold';
  };

  const hasChanges = JSON.stringify(policies) !== JSON.stringify(originalPolicies);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Policy Engine & Firewall Thresholds</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure safety thresholds, block limits, and escalation rules by use case and geography.
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleRevert} className="text-xs h-8">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Revert
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving} className="text-xs h-8">
            <Save className="mr-2 h-3.5 w-3.5" />
            {isSaving ? 'Publishing...' : 'Publish Changes'}
          </Button>
        </div>
      </div>

      {publishedSuccess && (
        <Alert className="bg-emerald-500/10 border-emerald-500/30 text-emerald-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <AlertTitle className="text-emerald-500 font-medium text-xs">Active & Deployed</AlertTitle>
          <AlertDescription className="text-xs">{publishedSuccess}</AlertDescription>
        </Alert>
      )}

      {/* Immune System Self-Healing Proposal Banner */}
      {proposals.length > 0 && (
        <Alert className="bg-primary/5 border-primary/20">
          <Beaker className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary font-medium flex items-center gap-2 text-xs">
            Immune System Threshold Proposal
            <Badge variant="outline" className="text-[10px] bg-background">Self-Healing Active</Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 text-xs">
            <div className="space-y-2">
              {proposals.map(prop => {
                const propId = prop.id || prop.proposal_id || 'prop';
                const reasonText = prop.reason || prop.justification || 'Telemetry analysis recommends adjusting threshold.';
                const useCase = prop.use_case || 'customer_support';
                const geo = prop.geography || 'US';

                return (
                  <div key={propId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md bg-background/80 border border-border gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {useCase} ({geo})
                        </Badge>
                        <p className="font-mono text-xs">
                          Check: <span className="font-bold text-foreground">{prop.check_name}</span> | Proposed Block Threshold: <span className="text-rose-500 line-through font-mono">{prop.current_threshold}</span> &rarr; <span className="text-emerald-500 font-bold font-mono">{prop.proposed_threshold}</span>
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{reasonText}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleAcceptProposal(prop)}
                      >
                        <Check className="h-3 w-3 mr-1" /> Accept & Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleDismissProposal(prop)}
                      >
                        <X className="h-3 w-3 mr-1" /> Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Policies Rules Table with Overflow Handling */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[170px]">Use Case</TableHead>
                <TableHead className="text-xs w-[120px]">Geography</TableHead>
                <TableHead className="text-xs w-[180px]">Check Engine</TableHead>
                <TableHead className="text-xs w-[140px]">Block Threshold</TableHead>
                <TableHead className="text-xs w-[140px]">Flag Threshold</TableHead>
                <TableHead className="text-xs w-[150px]">On Timeout</TableHead>
                <TableHead className="text-xs w-10 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                    Loading policies...
                  </TableCell>
                </TableRow>
              ) : (
                policies.map((policy, idx) => (
                  <TableRow key={policy.id || idx}>
                    {/* Use Case Select */}
                    <TableCell>
                      <Select
                        value={policy.use_case}
                        onValueChange={(v) => handleUpdate(idx, 'use_case', v)}
                      >
                        <SelectTrigger className="h-8 text-xs font-mono w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="customer_support">customer_support</SelectItem>
                          <SelectItem value="internal_copilot">internal_copilot</SelectItem>
                          <SelectItem value="decision_support">decision_support</SelectItem>
                          <SelectItem value="*">* (All)</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Geography Select */}
                    <TableCell>
                      <Select
                        value={policy.geography}
                        onValueChange={(v) => handleUpdate(idx, 'geography', v)}
                      >
                        <SelectTrigger className="h-8 text-xs font-mono w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">US</SelectItem>
                          <SelectItem value="EU">EU</SelectItem>
                          <SelectItem value="IN">IN</SelectItem>
                          <SelectItem value="*">* (All)</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Check Engine Select */}
                    <TableCell>
                      <Select
                        value={policy.check_name}
                        onValueChange={(v) => handleUpdate(idx, 'check_name', v)}
                      >
                        <SelectTrigger className="h-8 text-xs font-mono w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_CHECKS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Block Threshold Input */}
                    <TableCell>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={policy.block_threshold}
                        onChange={(e) => handleThresholdChange(idx, 'block_threshold', e.target.value)}
                        className={`h-8 font-mono text-xs w-24 ${getThresholdColor(policy.block_threshold)}`}
                      />
                    </TableCell>

                    {/* Flag Threshold Input */}
                    <TableCell>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={policy.flag_threshold}
                        onChange={(e) => handleThresholdChange(idx, 'flag_threshold', e.target.value)}
                        className="h-8 font-mono text-xs w-24"
                      />
                    </TableCell>

                    {/* On Timeout Select */}
                    <TableCell>
                      <Select
                        value={policy.on_timeout}
                        onValueChange={(v) => handleUpdate(idx, 'on_timeout', v)}
                      >
                        <SelectTrigger className="h-8 text-xs font-mono w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="allow">allow</SelectItem>
                          <SelectItem value="block">block</SelectItem>
                          <SelectItem value="allow_with_flag">allow_with_flag</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Delete Row Button */}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 border-t border-border bg-muted/20">
          <Button variant="outline" size="sm" onClick={handleAdd} className="w-full border-dashed text-xs h-8">
            <Plus className="mr-2 h-3.5 w-3.5" /> Add Rule
          </Button>
        </div>
      </Card>
      
      <div className="flex gap-2 items-center text-xs text-muted-foreground">
        <Info className="h-4 w-4" />
        <span>Scores above the block threshold trigger immediate perimeter blocking. Scores between flag and block thresholds trigger asynchronous human review without stalling user execution.</span>
      </div>
    </div>
  );
}
