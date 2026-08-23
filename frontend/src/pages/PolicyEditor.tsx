import { useState, useEffect } from 'react';
import { Save, Plus, AlertCircle, Info, Beaker, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { PolicyRule, ThresholdProposal } from '@/types';
import { api } from '@/lib/api';

export default function PolicyEditor() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [originalPolicies, setOriginalPolicies] = useState<PolicyRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Mock proposals from Immune System
  const [proposals] = useState<ThresholdProposal[]>([
    {
      id: 'prop_1',
      check_name: 'pii_leak',
      current_threshold: 0.9,
      proposed_threshold: 0.85,
      reason: 'Observed elevated PII variance in customer support telemetry over the past 48h. Adjusting threshold improves safety recall with negligible throughput impact.'
    }
  ]);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    setIsLoading(true);
    try {
      const data = await api.getPolicies().catch(() => [
        { id: '1', use_case: 'customer_support' as const, geography: 'US' as const, check_name: 'toxicity', block_threshold: 0.8, flag_threshold: 0.6, on_timeout: 'block' as const },
        { id: '2', use_case: 'internal_copilot' as const, geography: '*' as const, check_name: 'pii_leak', block_threshold: 0.9, flag_threshold: 0.7, on_timeout: 'allow' as const },
        { id: '3', use_case: '*' as const, geography: 'EU' as const, check_name: 'jailbreak', block_threshold: 0.75, flag_threshold: 0.5, on_timeout: 'block' as const }
      ] satisfies PolicyRule[]);
      setPolicies(data);
      setOriginalPolicies(JSON.parse(JSON.stringify(data)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.updatePolicies(policies);
      setOriginalPolicies(JSON.parse(JSON.stringify(policies)));
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

  const handleAdd = () => {
    setPolicies([
      ...policies,
      { id: `new_${Date.now()}`, use_case: '*', geography: '*', check_name: 'new_check', block_threshold: 0.8, flag_threshold: 0.6, on_timeout: 'block' }
    ]);
  };

  const handleRevert = () => {
    setPolicies(JSON.parse(JSON.stringify(originalPolicies)));
  };

  const applyProposal = (proposal: ThresholdProposal) => {
    const updated = policies.map(p => {
      if (p.check_name === proposal.check_name) {
        return { ...p, block_threshold: proposal.proposed_threshold };
      }
      return p;
    });
    setPolicies(updated);
  };

  const getThresholdColor = (val: number) => {
    if (val < 0.4) return 'text-rose-500 font-bold';
    if (val < 0.7) return 'text-amber-500 font-medium';
    return 'text-emerald-500';
  };

  const hasChanges = JSON.stringify(policies) !== JSON.stringify(originalPolicies);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">YAML Policy Configuration</h2>
          <p className="text-sm text-muted-foreground">Manage global thresholds and routing rules</p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleRevert}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Revert
            </Button>
          )}
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Publish Changes'}
          </Button>
        </div>
      </div>

      {proposals.length > 0 && (
        <Alert className="bg-primary/5 border-primary/20">
          <Beaker className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary font-medium flex items-center gap-2">
            Immune System Recommendations
            <Badge variant="secondary" className="bg-primary/20 text-primary hover:bg-primary/30">Auto-generated</Badge>
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="space-y-3">
              {proposals.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-background/50 p-3 rounded-md border border-border">
                  <div>
                    <p className="text-sm font-medium">Optimize {p.check_name} threshold</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.reason}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-mono flex items-center gap-2">
                      <span className="line-through text-muted-foreground">{p.current_threshold}</span>
                      <span>→</span>
                      <span className="text-emerald-500 font-bold">{p.proposed_threshold}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => applyProposal(p)}>
                      Apply
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Use Case</TableHead>
              <TableHead>Geography</TableHead>
              <TableHead>Check Engine</TableHead>
              <TableHead>Block Threshold</TableHead>
              <TableHead>Flag Threshold</TableHead>
              <TableHead>On Timeout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading policies...
                </TableCell>
              </TableRow>
            ) : (
              policies.map((policy, idx) => (
                <TableRow key={policy.id || idx}>
                  <TableCell>
                    <Input 
                      value={policy.use_case} 
                      onChange={(e) => handleUpdate(idx, 'use_case', e.target.value)}
                      className="h-8 font-mono text-xs w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={policy.geography} 
                      onChange={(e) => handleUpdate(idx, 'geography', e.target.value)}
                      className="h-8 font-mono text-xs w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      value={policy.check_name} 
                      onChange={(e) => handleUpdate(idx, 'check_name', e.target.value)}
                      className="h-8 font-mono text-xs w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" step="0.01" min="0" max="1"
                      value={policy.block_threshold} 
                      onChange={(e) => handleUpdate(idx, 'block_threshold', parseFloat(e.target.value))}
                      className={`h-8 font-mono text-xs w-24 ${getThresholdColor(policy.block_threshold)}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" step="0.01" min="0" max="1"
                      value={policy.flag_threshold} 
                      onChange={(e) => handleUpdate(idx, 'flag_threshold', parseFloat(e.target.value))}
                      className="h-8 font-mono text-xs w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={policy.on_timeout} 
                      onValueChange={(v) => handleUpdate(idx, 'on_timeout', v)}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">Allow</SelectItem>
                        <SelectItem value="block">Block</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="p-4 border-t border-border bg-muted/20">
          <Button variant="outline" size="sm" onClick={handleAdd} className="w-full border-dashed">
            <Plus className="mr-2 h-4 w-4" /> Add Rule
          </Button>
        </div>
      </Card>
      
      <div className="flex gap-2 items-center text-xs text-muted-foreground">
        <Info className="h-4 w-4" />
        <p>Thresholds determine actions based on confidence scores. Higher threshold = stricter blocking.</p>
      </div>
    </div>
  );
}
