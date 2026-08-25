import { useState, useEffect, useRef } from 'react';
import { 
  Save, Plus, AlertCircle, Info, Beaker, RotateCcw, Trash2, 
  CheckCircle2, Check, X, Upload, Download, FileText, Sparkles, 
  Sliders, Shield, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
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

const PRESETS: { name: string; description: string; icon: any; rules: PolicyRule[] }[] = [
  {
    name: 'General Starter Baseline',
    description: 'Universal starter policy across all 8 security checks with standard recommended thresholds for general workloads.',
    icon: Shield,
    rules: [
      { id: 'g_1', use_case: '*', geography: '*', check_name: 'toxicity', block_threshold: 0.80, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'g_2', use_case: '*', geography: '*', check_name: 'prompt_injection', block_threshold: 0.80, flag_threshold: 0.50, on_timeout: 'allow' },
      { id: 'g_3', use_case: '*', geography: '*', check_name: 'secrets', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'g_4', use_case: '*', geography: '*', check_name: 'pii', block_threshold: 0.75, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'g_5', use_case: '*', geography: '*', check_name: 'sensitive_data', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'g_6', use_case: '*', geography: '*', check_name: 'system_prompt_leakage', block_threshold: 0.70, flag_threshold: 0.40, on_timeout: 'block' },
      { id: 'g_7', use_case: '*', geography: '*', check_name: 'brand_safety', block_threshold: 0.75, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'g_8', use_case: '*', geography: '*', check_name: 'hallucination_risk', block_threshold: 0.65, flag_threshold: 0.40, on_timeout: 'block' },
    ]
  },
  {
    name: 'Balanced Enterprise Baseline',
    description: 'Standard multi-layer enterprise protection across all checks with moderate sensitivity.',
    icon: ShieldCheck,
    rules: [
      { id: 'b_1', use_case: 'customer_support', geography: 'US', check_name: 'toxicity', block_threshold: 0.85, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'b_2', use_case: 'customer_support', geography: 'US', check_name: 'prompt_injection', block_threshold: 0.85, flag_threshold: 0.50, on_timeout: 'allow' },
      { id: 'b_3', use_case: 'customer_support', geography: 'US', check_name: 'secrets', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'b_4', use_case: 'customer_support', geography: 'US', check_name: 'pii', block_threshold: 0.80, flag_threshold: 0.50, on_timeout: 'allow' },
      { id: 'b_5', use_case: 'customer_support', geography: 'US', check_name: 'sensitive_data', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'b_6', use_case: 'customer_support', geography: 'US', check_name: 'system_prompt_leakage', block_threshold: 0.70, flag_threshold: 0.40, on_timeout: 'block' },
      { id: 'b_7', use_case: 'decision_support', geography: 'US', check_name: 'hallucination_risk', block_threshold: 0.65, flag_threshold: 0.40, on_timeout: 'block' },
    ]
  },
  {
    name: 'Strict Banking & Financial Compliance',
    description: 'Zero-tolerance thresholds for financial services, credential leakage, and PII exposure.',
    icon: ShieldAlert,
    rules: [
      { id: 's_1', use_case: 'decision_support', geography: 'US', check_name: 'secrets', block_threshold: 0.30, flag_threshold: 0.15, on_timeout: 'block' },
      { id: 's_2', use_case: 'decision_support', geography: 'US', check_name: 'sensitive_data', block_threshold: 0.30, flag_threshold: 0.15, on_timeout: 'block' },
      { id: 's_3', use_case: 'decision_support', geography: 'US', check_name: 'pii', block_threshold: 0.60, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 's_4', use_case: 'decision_support', geography: 'US', check_name: 'prompt_injection', block_threshold: 0.70, flag_threshold: 0.35, on_timeout: 'block' },
      { id: 's_5', use_case: 'customer_support', geography: 'US', check_name: 'toxicity', block_threshold: 0.75, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 's_6', use_case: 'decision_support', geography: 'US', check_name: 'hallucination_risk', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
    ]
  },
  {
    name: 'Internal Engineering Copilot',
    description: 'Permissive thresholds optimized for coding, stack traces, and software debugging.',
    icon: Sliders,
    rules: [
      { id: 'e_1', use_case: 'internal_copilot', geography: 'US', check_name: 'secrets', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'e_2', use_case: 'internal_copilot', geography: 'US', check_name: 'prompt_injection', block_threshold: 0.90, flag_threshold: 0.60, on_timeout: 'allow' },
      { id: 'e_3', use_case: 'internal_copilot', geography: 'US', check_name: 'toxicity', block_threshold: 0.90, flag_threshold: 0.60, on_timeout: 'allow' },
      { id: 'e_4', use_case: 'internal_copilot', geography: 'US', check_name: 'system_prompt_leakage', block_threshold: 0.85, flag_threshold: 0.50, on_timeout: 'allow' },
    ]
  },
  {
    name: 'Healthcare & HIPAA Privacy Focus',
    description: 'Maximal entity detection for medical records, patient identifiers, and health data.',
    icon: Sparkles,
    rules: [
      { id: 'h_1', use_case: 'customer_support', geography: 'US', check_name: 'pii', block_threshold: 0.50, flag_threshold: 0.25, on_timeout: 'block' },
      { id: 'h_2', use_case: 'customer_support', geography: 'US', check_name: 'sensitive_data', block_threshold: 0.40, flag_threshold: 0.20, on_timeout: 'block' },
      { id: 'h_3', use_case: 'customer_support', geography: 'US', check_name: 'toxicity', block_threshold: 0.80, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'h_4', use_case: 'customer_support', geography: 'US', check_name: 'prompt_injection', block_threshold: 0.80, flag_threshold: 0.45, on_timeout: 'block' },
    ]
  }
];

export default function PolicyEditor() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [originalPolicies, setOriginalPolicies] = useState<PolicyRule[]>([]);
  const [proposals, setProposals] = useState<ThresholdProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [publishedSuccess, setPublishedSuccess] = useState<string | null>(null);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [uploadMode, setUploadMode] = useState<'replace' | 'merge'>('replace');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewRules, setPreviewRules] = useState<PolicyRule[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const threshLabel = proposal.target_threshold_type === 'flag_threshold' ? 'flag' : 'block';
    const targetField = proposal.target_threshold_type === 'flag_threshold' ? 'flag_threshold' : 'block_threshold';

    try {
      const resp = await api.acceptProposal(propId);
      await loadPoliciesData();
      await loadProposalsOnly();
      setPublishedSuccess(resp?.message || `Immune system proposal accepted: Updated ${proposal.check_name} ${threshLabel} threshold to ${proposal.proposed_threshold}! Policy hot-reloaded.`);
      setTimeout(() => setPublishedSuccess(null), 5000);
    } catch (e) {
      console.error('Failed to accept proposal', e);
      const updated = policies.map(p => {
        if (p.check_name === proposal.check_name) {
          return { ...p, [targetField]: proposal.proposed_threshold };
        }
        return p;
      });
      setPolicies(updated);
      await api.updatePolicies(updated);
      setOriginalPolicies(JSON.parse(JSON.stringify(updated)));
      setProposals(prev => prev.filter(p => (p.id || p.proposal_id) !== propId));
      setPublishedSuccess(`Updated ${proposal.check_name} ${threshLabel} threshold to ${proposal.proposed_threshold}! Policy saved.`);
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

  // ─── File Upload & Parsing ──────────────────────────────────────────────────
  const parsePolicyString = (rawText: string): PolicyRule[] => {
    let parsed: any;
    try {
      parsed = yamlLoad(rawText);
    } catch (e: any) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new Error(`YAML/JSON Syntax Error: ${e.message || 'Invalid format'}`);
      }
    }

    if (!parsed) throw new Error('Policy file is empty');

    const rawList: any[] = Array.isArray(parsed) 
      ? parsed 
      : (parsed.policies || parsed.rules || (typeof parsed === 'object' ? Object.values(parsed) : []));

    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error('Policy file must contain a list of rules under `policies:` or root array.');
    }

    return rawList.map((r: any, idx: number) => {
      const check = r.check || r.check_name || 'toxicity';
      const block = typeof r.block_threshold === 'number' ? r.block_threshold : (typeof r.block === 'number' ? r.block : 0.7);
      const flag = typeof r.flag_threshold === 'number' ? r.flag_threshold : (typeof r.flag === 'number' ? r.flag : 0.4);
      const timeout = r.on_timeout === 'block' ? 'block' : 'allow';

      return {
        id: `imported_${idx}_${Date.now()}`,
        use_case: r.use_case || '*',
        geography: r.geography || '*',
        check_name: check,
        block_threshold: Math.max(0, Math.min(1, block)),
        flag_threshold: Math.max(0, Math.min(1, flag)),
        on_timeout: timeout,
      };
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadText(text);
      try {
        const rules = parsePolicyString(text);
        setPreviewRules(rules);
        setUploadError(null);
      } catch (err: any) {
        setUploadError(err.message || 'Failed to parse policy file.');
        setPreviewRules(null);
      }
    };
    reader.readAsText(file);
  };

  const handleUploadTextChange = (text: string) => {
    setUploadText(text);
    if (!text.trim()) {
      setPreviewRules(null);
      setUploadError(null);
      return;
    }
    try {
      const rules = parsePolicyString(text);
      setPreviewRules(rules);
      setUploadError(null);
    } catch (err: any) {
      setUploadError(err.message);
      setPreviewRules(null);
    }
  };

  const handleApplyUpload = async () => {
    if (!previewRules || previewRules.length === 0) return;

    let finalPolicies: PolicyRule[];
    if (uploadMode === 'replace') {
      finalPolicies = previewRules;
    } else {
      // Merge by use_case + geography + check_name
      const merged = [...policies];
      previewRules.forEach(newRule => {
        const existingIdx = merged.findIndex(
          p => p.use_case === newRule.use_case && p.geography === newRule.geography && p.check_name === newRule.check_name
        );
        if (existingIdx >= 0) {
          merged[existingIdx] = newRule;
        } else {
          merged.push(newRule);
        }
      });
      finalPolicies = merged;
    }

    setPolicies(finalPolicies);
    setIsUploadOpen(false);
    setPreviewRules(null);
    setUploadText('');

    // Auto-save to Policy Engine
    setIsSaving(true);
    try {
      await api.updatePolicies(finalPolicies);
      setOriginalPolicies(JSON.parse(JSON.stringify(finalPolicies)));
      setPublishedSuccess(`Successfully imported & applied ${previewRules.length} policy rules into the live Policy Engine!`);
      setTimeout(() => setPublishedSuccess(null), 5000);
    } catch (err) {
      console.error('Failed to auto-save uploaded policy', err);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Export YAML ──────────────────────────────────────────────────────────
  const handleExportYaml = () => {
    const yamlObject = {
      version: `exported_${Date.now()}`,
      policies: policies.map(p => ({
        use_case: p.use_case,
        geography: p.geography,
        check: p.check_name,
        block_threshold: p.block_threshold,
        flag_threshold: p.flag_threshold,
        on_timeout: p.on_timeout
      })),
      defaults: {
        block_threshold: 0.70,
        flag_threshold: 0.40,
        on_timeout: 'block'
      }
    };

    const yamlString = yamlDump(yamlObject, { indent: 2 });
    const blob = new Blob([yamlString], { type: 'text/yaml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `controlplane-policies-${new Date().toISOString().slice(0, 10)}.yaml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    setPolicies(preset.rules);
    setIsSaving(true);
    api.updatePolicies(preset.rules)
      .then(() => {
        setOriginalPolicies(JSON.parse(JSON.stringify(preset.rules)));
        setPublishedSuccess(`Loaded and applied "${preset.name}" preset! Policy Engine hot-reloaded.`);
        setTimeout(() => setPublishedSuccess(null), 4000);
      })
      .finally(() => setIsSaving(false));
  };

  const hasChanges = JSON.stringify(policies) !== JSON.stringify(originalPolicies);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Policy Engine & Firewall Thresholds</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure safety thresholds, block limits, and upload custom policy definitions for automated perimeter enforcement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { setIsUploadOpen(true); setUploadError(null); setPreviewRules(null); setUploadText(''); }} 
            className="text-xs h-8"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload Policy (YAML / JSON)
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportYaml} 
            className="text-xs h-8"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export YAML
          </Button>
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleRevert} className="text-xs h-8">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Revert
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving} className="text-xs h-8">
            <Save className="mr-1.5 h-3.5 w-3.5" />
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

      {/* Preset Quick Templates */}
      <Card className="border-border/60">
        <CardHeader className="py-3 px-4 pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Enterprise Compliance Presets (1-Click Templates)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              return (
                <div 
                  key={preset.name}
                  className="p-3 rounded-lg border border-border/70 bg-card hover:bg-accent/40 transition-colors flex flex-col justify-between gap-2.5 cursor-pointer group"
                  onClick={() => handleApplyPreset(preset)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium group-hover:text-primary transition-colors">{preset.name}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{preset.description}</p>
                  </div>
                  <Button size="sm" variant="secondary" className="h-6 text-[11px] w-full">
                    Apply Preset
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
                          Check: <span className="font-bold text-foreground">{prop.check_name}</span> | Proposed {prop.target_threshold_type === 'flag_threshold' ? 'Flag' : 'Block'} Threshold: <span className="text-rose-500 line-through font-mono">{prop.current_threshold}</span> &rarr; <span className="text-emerald-500 font-bold font-mono">{prop.proposed_threshold}</span>
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

      {/* Main Rules Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-sm font-medium">Configured Security Rules & Violation Thresholds</CardTitle>
            <CardDescription className="text-xs">
              Requests exceeding the Block threshold are blocked at the perimeter. Requests between Flag and Block are admitted and queued for human audit.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleAdd} className="text-xs h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading active policies...</div>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Use Case</TableHead>
                    <TableHead>Geography</TableHead>
                    <TableHead>Scanner Check</TableHead>
                    <TableHead className="w-36">Block Threshold (0-1)</TableHead>
                    <TableHead className="w-36">Flag Threshold (0-1)</TableHead>
                    <TableHead className="w-32">On Timeout</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((policy, idx) => (
                    <TableRow key={policy.id || idx} className="text-xs">
                      <TableCell>
                        <Select
                          value={policy.use_case}
                          onValueChange={(val) => handleUpdate(idx, 'use_case', val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="*">All (*)</SelectItem>
                            <SelectItem value="customer_support">Customer Support</SelectItem>
                            <SelectItem value="internal_copilot">Internal Copilot</SelectItem>
                            <SelectItem value="decision_support">Decision Support</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={policy.geography}
                          onValueChange={(val) => handleUpdate(idx, 'geography', val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="*">Global (*)</SelectItem>
                            <SelectItem value="US">US</SelectItem>
                            <SelectItem value="EU">EU (GDPR)</SelectItem>
                            <SelectItem value="APAC">APAC</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={policy.check_name}
                          onValueChange={(val) => handleUpdate(idx, 'check_name', val)}
                        >
                          <SelectTrigger className="h-8 text-xs font-mono">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_CHECKS.map((c) => (
                              <SelectItem key={c} value={c} className="font-mono text-xs">
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={policy.block_threshold}
                          onChange={(e) => handleThresholdChange(idx, 'block_threshold', e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={policy.flag_threshold}
                          onChange={(e) => handleThresholdChange(idx, 'flag_threshold', e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={policy.on_timeout}
                          onValueChange={(val) => handleUpdate(idx, 'on_timeout', val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="allow">Allow (Fail Open)</SelectItem>
                            <SelectItem value="block">Block (Fail Closed)</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Policy Modal / Dialog */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Upload Policy Definitions (YAML / JSON)</h3>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsUploadOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* File Dropzone */}
              <div 
                className="border-2 border-dashed border-border rounded-lg p-5 text-center hover:border-primary/50 transition-colors cursor-pointer bg-accent/20"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs font-medium">Click to browse or drop a .yaml, .yml, or .json file</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Compatible with standard ControlPlane policy schemas</p>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept=".yaml,.yml,.json,.txt" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
              </div>

              {/* Text / Paste Area */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center justify-between">
                  <span>Or paste YAML / JSON definition:</span>
                  <span className="text-[10px] text-muted-foreground font-mono">policies: [...]</span>
                </label>
                <textarea
                  value={uploadText}
                  onChange={(e) => handleUploadTextChange(e.target.value)}
                  placeholder={`policies:\n  - use_case: customer_support\n    geography: US\n    check: toxicity\n    block_threshold: 0.80\n    flag_threshold: 0.40\n    on_timeout: allow\n  - use_case: decision_support\n    geography: US\n    check: secrets\n    block_threshold: 0.40\n    flag_threshold: 0.20\n    on_timeout: block`}
                  className="w-full h-40 font-mono text-xs p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {uploadError && (
                <Alert className="bg-destructive/10 border-destructive/30 text-destructive py-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <AlertDescription className="text-xs font-mono">{uploadError}</AlertDescription>
                </Alert>
              )}

              {/* Parsed Preview */}
              {previewRules && previewRules.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Parsed {previewRules.length} rules successfully
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Mode:</label>
                      <Select value={uploadMode} onValueChange={(val: any) => setUploadMode(val)}>
                        <SelectTrigger className="h-7 text-xs w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="replace">Replace All Existing</SelectItem>
                          <SelectItem value="merge">Merge with Existing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[11px]">
                          <TableHead className="py-1">Use Case</TableHead>
                          <TableHead className="py-1">Check</TableHead>
                          <TableHead className="py-1 font-mono">Block Thresh</TableHead>
                          <TableHead className="py-1 font-mono">Flag Thresh</TableHead>
                          <TableHead className="py-1">On Timeout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRules.map((r, i) => (
                          <TableRow key={i} className="text-[11px]">
                            <TableCell className="py-1 font-mono">{r.use_case} ({r.geography})</TableCell>
                            <TableCell className="py-1 font-mono text-primary font-medium">{r.check_name}</TableCell>
                            <TableCell className="py-1 font-mono text-rose-500 font-bold">{r.block_threshold}</TableCell>
                            <TableCell className="py-1 font-mono text-amber-500 font-medium">{r.flag_threshold}</TableCell>
                            <TableCell className="py-1">{r.on_timeout}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2 bg-card">
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setIsUploadOpen(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                className="text-xs h-8 bg-primary text-primary-foreground"
                disabled={!previewRules || previewRules.length === 0}
                onClick={handleApplyUpload}
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Apply & Hot-Reload Policy
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
