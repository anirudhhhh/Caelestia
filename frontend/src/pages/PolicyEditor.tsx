import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Save, Plus, AlertCircle, Info, Beaker, RotateCcw, Trash2, 
  CheckCircle2, Check, X, Upload, Download, FileText, Sparkles, 
  Sliders, Shield, ShieldCheck, ShieldAlert, Server, Cpu,
  RefreshCw, Activity, Zap
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
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import BorderBeam from '@/components/reactbits/BorderBeam';
import Magnet from '@/components/reactbits/Magnet';
import DecryptedText from '@/components/reactbits/DecryptedText';
import AnimatedList from '@/components/reactbits/AnimatedList';

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

const PII_ENTITIES = [
  { key: 'EMAIL', name: 'Email Addresses', desc: 'customer@company.com, user@domain.org' },
  { key: 'PHONE', name: 'Phone Numbers', desc: '+1 (555) 019-2834, mobile & landlines' },
  { key: 'ADDRESS', name: 'Physical Addresses', desc: 'Street addresses, zip codes, physical locations' },
  { key: 'SSN', name: 'US Social Security Numbers', desc: '9-digit SSN (123-45-6789, ssn is ...)' },
  { key: 'CREDIT_CARD', name: 'Payment Cards (PAN)', desc: 'Credit & debit card numbers (Visa, MC, Amex)' },
  { key: 'PAN', name: 'Indian PAN Tax ID', desc: '10-character alphanumeric PAN cards' },
  { key: 'AADHAAR', name: 'Indian Aadhaar Numbers', desc: '12-digit UIDAI biometric card numbers' },
  { key: 'BANK_ACCOUNT', name: 'Bank Accounts & IBAN', desc: 'Account numbers, routing codes, and IBANs' },
  { key: 'GOVERNMENT_ID', name: 'Passports & Licenses', desc: 'Driver licenses, national IDs, and passports' },
];

const DEFAULT_PII_MAP: Record<string, 'allow' | 'block'> = {
  EMAIL: 'allow',
  PHONE: 'allow',
  ADDRESS: 'allow',
  SSN: 'block',
  CREDIT_CARD: 'block',
  PAN: 'block',
  AADHAAR: 'block',
  BANK_ACCOUNT: 'block',
  GOVERNMENT_ID: 'block'
};

export default function PolicyEditor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialScope = searchParams.get('scope') || 'customer_support';

  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [originalPolicies, setOriginalPolicies] = useState<PolicyRule[]>([]);
  const [proposals, setProposals] = useState<ThresholdProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [publishedSuccess, setPublishedSuccess] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Dynamic Scope & Unified Enterprise Workflow PII Map
  const [selectedUseCase, setSelectedUseCase] = useState<string>(initialScope);
  const [endpointsList, setEndpointsList] = useState<any[]>([]);
  const [allPiiConfigs, setAllPiiConfigs] = useState<Record<string, Record<string, 'allow' | 'block'>>>({
    customer_support: { ...DEFAULT_PII_MAP },
    internal_copilot: { ...DEFAULT_PII_MAP },
    decision_support: { ...DEFAULT_PII_MAP },
    legal_compliance: { ...DEFAULT_PII_MAP }
  });

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
      await Promise.all([
        loadPoliciesData(),
        loadProposalsOnly(),
        loadAllComponentConfigs()
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllComponentConfigs = async () => {
    try {
      const eps = await api.getEndpoints().catch(() => []);
      setEndpointsList(eps);

      const allScopes = Array.from(new Set([
        'customer_support',
        'internal_copilot',
        'decision_support',
        'legal_compliance',
        ...eps.map((e: any) => e.id)
      ]));

      const results = await Promise.all(
        allScopes.map(async (scopeId) => {
          try {
            const cfg = await api.getUseCaseConfig(scopeId);
            return { scopeId, pii: cfg?.pii_permissions || DEFAULT_PII_MAP };
          } catch {
            return { scopeId, pii: DEFAULT_PII_MAP };
          }
        })
      );

      const updatedMap: Record<string, Record<string, 'allow' | 'block'>> = {};
      results.forEach(r => {
        updatedMap[r.scopeId] = { ...DEFAULT_PII_MAP, ...r.pii };
      });
      setAllPiiConfigs(prev => ({ ...prev, ...updatedMap }));
    } catch (e) {
      console.error('Failed to load component configs', e);
    }
  };

  const handleScopeChange = (newScope: string) => {
    setSelectedUseCase(newScope);
    setSearchParams({ scope: newScope });

    if (!allPiiConfigs[newScope]) {
      api.getUseCaseConfig(newScope).then(cfg => {
        if (cfg?.pii_permissions) {
          setAllPiiConfigs(prev => ({
            ...prev,
            [newScope]: { ...DEFAULT_PII_MAP, ...cfg.pii_permissions }
          }));
        }
      }).catch(() => {});
    }
  };

  const handleTogglePii = async (key: string, newAction: 'allow' | 'block') => {
    const currentForScope = allPiiConfigs[selectedUseCase] || DEFAULT_PII_MAP;
    const updatedForScope = { ...currentForScope, [key]: newAction };

    setAllPiiConfigs(prev => ({
      ...prev,
      [selectedUseCase]: updatedForScope
    }));

    try {
      await api.saveUseCaseConfig(selectedUseCase, {
        use_case_id: selectedUseCase,
        name: selectedUseCase.replace('_', ' ').toUpperCase(),
        version: 1,
        latency_tier: 'real_time',
        detectors: {},
        pii_permissions: updatedForScope,
        strict_pii_declaration: false,
        change_note: `Updated ${key} to ${newAction}`
      });
      setPublishedSuccess(`Updated ${key} to ${newAction.toUpperCase()} for "${selectedUseCase}"! Saved & active.`);
      setTimeout(() => setPublishedSuccess(null), 3000);
    } catch (e) {
      console.error('Failed to save PII permission', e);
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

  const handleGenerateProposals = async () => {
    setIsAnalyzing(true);
    try {
      const fresh = await api.generateProposals().catch(() => []);
      setProposals(fresh);
      setPublishedSuccess(`Telemetry analysis complete. Loaded ${fresh.length} active threshold recommendations.`);
      setTimeout(() => setPublishedSuccess(null), 4000);
    } catch (e) {
      console.error('Failed to generate proposals', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResetProposals = async () => {
    setIsAnalyzing(true);
    try {
      await api.resetProposals().catch(() => {});
      const fresh = await api.generateProposals().catch(() => []);
      setProposals(fresh);
      setPublishedSuccess('Reset proposal history and re-evaluated fresh telemetry.');
      setTimeout(() => setPublishedSuccess(null), 4000);
    } catch (e) {
      console.error('Failed to reset proposals', e);
    } finally {
      setIsAnalyzing(false);
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
      } catch (err: any) {
        setUploadError(err.message || 'Failed to parse policy file.');
        setPreviewRules(null);
      }
    };
    reader.readAsText(file);
  };

  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtractFromText = async () => {
    if (!uploadText.trim()) return;
    setIsExtracting(true);
    setUploadError(null);
    try {
      const extracted = await api.extractPolicyRule(uploadText);
      if (extracted?.structured_rule) {
        const ent = extracted.structured_rule.entities || [];
        const isBlock = extracted.structured_rule.action === 'BLOCK';
        const generatedRules: PolicyRule[] = [
          {
            id: `extracted_${Date.now()}_1`,
            use_case: '*',
            geography: '*',
            check_name: ent.includes('EMAIL') || ent.includes('SSN') || ent.includes('PHONE') ? 'pii' : 'secrets',
            block_threshold: isBlock ? 0.50 : 0.75,
            flag_threshold: 0.30,
            on_timeout: isBlock ? 'block' : 'allow'
          }
        ];
        if (ent.includes('CREDIT_CARD') || ent.includes('FINANCIAL_DATA') || ent.includes('API_KEY')) {
          generatedRules.push({
            id: `extracted_${Date.now()}_2`,
            use_case: '*',
            geography: '*',
            check_name: 'sensitive_data',
            block_threshold: 0.40,
            flag_threshold: 0.20,
            on_timeout: 'block'
          });
        }
        setPreviewRules(generatedRules);
        setUploadText(yamlDump({ policies: generatedRules }));
      }
    } catch (e: any) {
      setUploadError(e.message || 'Failed to extract policy rules with AI');
    } finally {
      setIsExtracting(false);
    }
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
    <div className="h-full w-full overflow-y-auto space-y-6 pr-2 pb-10 font-sans">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">Policy Engine & Firewall Thresholds</h2>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Configure safety thresholds, block limits, and upload custom policy definitions for automated perimeter enforcement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { setIsUploadOpen(true); setUploadError(null); setPreviewRules(null); setUploadText(''); }} 
            className="faang-btn-ghost text-xs h-8 text-zinc-300 hover:text-white"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload Policy (YAML / JSON)
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportYaml} 
            className="faang-btn-ghost text-xs h-8 text-zinc-300 hover:text-white"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export YAML
          </Button>
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleRevert} className="faang-btn-ghost text-xs h-8 text-zinc-400 hover:text-white">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Revert
            </Button>
          )}
          <button 
            type="button"
            onClick={handleSave} 
            disabled={!hasChanges || isSaving} 
            className="faang-btn-primary text-xs h-8 px-4 font-bold flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSaving ? 'Publishing...' : 'Publish Changes'}
          </button>
        </div>
      </div>

      {publishedSuccess && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2.5 shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0" />
          <span>{publishedSuccess}</span>
        </div>
      )}

      {/* Preset Quick Templates (Unboxed, Integrated) */}
      <div className="unboxed-section space-y-3">
        <div className="flex items-center gap-2 pb-1 text-zinc-300 font-bold text-xs uppercase tracking-wider">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span>Enterprise Compliance Presets (1-Click Templates)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {PRESETS.map((preset, pIdx) => {
            const Icon = preset.icon;
            const accentColors = [
              'text-violet-400 bg-violet-500/15 border-violet-500/30',
              'text-blue-400 bg-blue-500/15 border-blue-500/30',
              'text-rose-400 bg-rose-500/15 border-rose-500/30',
              'text-amber-400 bg-amber-500/15 border-amber-500/30',
              'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
            ];
            const colorClass = accentColors[pIdx % accentColors.length];

            return (
              <SpotlightCard 
                key={preset.name}
                className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.04] transition-all flex flex-col justify-between gap-3 cursor-pointer group shadow-sm"
                onClick={() => handleApplyPreset(preset)}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-lg flex items-center justify-center border ${colorClass}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">{preset.name}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">{preset.description}</p>
                </div>
                <button type="button" className="faang-btn-ghost h-6.5 text-[11px] w-full font-bold text-zinc-300 group-hover:text-white rounded-full">
                  Apply Preset
                </button>
              </SpotlightCard>
            );
          })}
        </div>
      </div>

      {/* Enterprise PII Governance Matrix (Unboxed, Integrated) */}
      <div className="unboxed-section space-y-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 pb-1">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-400" />
              <span>Enterprise PII Governance Matrix (Interactive Allow / Block)</span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-medium">
              Default is DENY / BLOCK for any unlisted PII types. Permitted types pass raw without redaction to downstream LLMs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-300 font-bold whitespace-nowrap" htmlFor="scope-select">
              Workflow Profile:
            </label>
            <Select 
              value={selectedUseCase} 
              onValueChange={handleScopeChange}
            >
              <SelectTrigger id="scope-select" className="h-8.5 text-xs w-72 sm:w-80 font-bold bg-white/[0.04] border-white/[0.08] rounded-full text-white" aria-label="Select enterprise workflow profile">
                <SelectValue placeholder="Select workflow profile..." />
              </SelectTrigger>
              <SelectContent className="max-h-80 bg-[#15161B] border-white/[0.1] rounded-xl text-white">
                {endpointsList.length > 0 ? (
                  endpointsList.map((ep: any) => (
                    <SelectItem key={ep.id} value={ep.id} className="text-xs">
                      <span className="font-bold text-white">{ep.name}</span> <span className="text-zinc-400 text-xs">({ep.id})</span>
                    </SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="customer_support" className="text-xs">
                      Customer Support & Success (customer_support)
                    </SelectItem>
                    <SelectItem value="internal_copilot" className="text-xs">
                      Engineering & Internal Copilot (internal_copilot)
                    </SelectItem>
                    <SelectItem value="decision_support" className="text-xs">
                      Billing & Financial Decision Support (decision_support)
                    </SelectItem>
                    <SelectItem value="legal_compliance" className="text-xs">
                      Security & Legal Compliance (legal_compliance)
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PII_ENTITIES.map((entity) => {
            const currentPii = allPiiConfigs[selectedUseCase] || DEFAULT_PII_MAP;
            const currentAction = currentPii[entity.key] || 'block';
            const isAllowed = currentAction === 'allow';

            return (
              <div 
                key={entity.key}
                className={`p-3 rounded-lg border-t border-b transition-all ${
                  isAllowed 
                    ? 'border-emerald-500/30 bg-emerald-500/[0.02]' 
                    : 'border-rose-500/30 bg-rose-500/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{entity.name}</span>
                  </div>
                  <span 
                    className={`faang-chip text-[9px] font-bold uppercase ${
                      isAllowed 
                        ? 'chip-emerald' 
                        : 'chip-crimson'
                    }`}
                  >
                    {currentAction}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mb-2.5 truncate font-medium" title={entity.desc}>
                  {entity.desc}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`h-6.5 rounded-full text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                      isAllowed 
                        ? 'faang-btn-primary text-black shadow-sm' 
                        : 'faang-btn-ghost text-zinc-400 hover:text-white'
                    }`}
                    onClick={() => handleTogglePii(entity.key, 'allow')}
                  >
                    <Check className="h-3 w-3 mr-1" /> Allow Raw
                  </button>
                  <button
                    type="button"
                    className={`h-6.5 rounded-full text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                      !isAllowed 
                        ? 'faang-btn-crimson' 
                        : 'faang-btn-ghost text-zinc-400 hover:text-rose-400'
                    }`}
                    onClick={() => handleTogglePii(entity.key, 'block')}
                  >
                    <X className="h-3 w-3 mr-1" /> Strict Block
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Autonomous Policy Recommendations & Immune Calibration (Borderless, Integrated) */}
      <div className="unboxed-section space-y-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 pb-1">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Autonomous Policy Recommendations & Immune Calibration</h3>
              <span className="faang-chip chip-amber text-[10px] font-bold">
                {proposals.length > 0 ? `${proposals.length} PENDING CALIBRATIONS` : 'AI TELEMETRY OPTIMAL'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-medium">
              The AI Immune Engine continuously analyzes live firewall telemetry, false positive feedback, and attack clusters to recommend automated policy calibrations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateProposals}
              disabled={isAnalyzing}
              className="faang-btn-ghost text-xs h-8 px-3 text-zinc-300 hover:text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 rounded-full"
              title="Analyze recent telemetry and calculate threshold recommendations"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isAnalyzing ? 'Analyzing Telemetry...' : 'Analyze Telemetry'}</span>
            </button>
            <button
              type="button"
              onClick={handleResetProposals}
              disabled={isAnalyzing}
              className="faang-btn-ghost text-xs h-8 px-2.5 text-zinc-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer disabled:opacity-50 rounded-full"
              title="Reset proposal history and re-evaluate"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset History</span>
            </button>
          </div>
        </div>

        {proposals.length > 0 ? (
          <div className="space-y-2">
            {proposals.map(prop => {
              const propId = prop.id || prop.proposal_id || 'prop';
              const reasonText = prop.reason || prop.justification || 'Empirical telemetry analysis recommends adjusting threshold.';
              const useCase = prop.use_case || 'customer_support';
              const geo = prop.geography || 'US';
              const isFlagThresh = prop.target_threshold_type === 'flag_threshold';

              return (
                <div 
                  key={propId} 
                  className="p-3 rounded-lg bg-white/[0.015] border-t border-b border-white/[0.05] hover:bg-white/[0.03] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="faang-chip chip-azure text-[10px] font-bold">
                        {useCase} ({geo})
                      </span>
                      <span className="faang-chip chip-violet text-[10px] font-bold">
                        Check: {prop.check_name}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs font-mono">
                        <span className="text-zinc-400">{isFlagThresh ? 'Flag' : 'Block'} Threshold:</span>
                        <span className="faang-chip chip-crimson text-[10px] line-through font-bold">
                          {prop.current_threshold}
                        </span>
                        <span className="text-zinc-500 font-bold">&rarr;</span>
                        <span className="faang-chip chip-emerald text-[10px] font-bold">
                          {prop.proposed_threshold}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                      {reasonText}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="faang-btn-primary text-xs h-7 px-3.5 font-bold flex items-center justify-center cursor-pointer shadow-sm rounded-full"
                      onClick={() => handleAcceptProposal(prop)}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Accept & Apply
                    </button>
                    <button
                      type="button"
                      className="faang-btn-ghost text-xs h-7 px-3 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer rounded-full"
                      onClick={() => handleDismissProposal(prop)}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-2.5 px-3 rounded-lg bg-white/[0.015] border-t border-b border-white/[0.05] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">All Security Policies Optimal & Calibrated</p>
                <p className="text-[11px] text-zinc-400 font-medium">
                  Firewall telemetry is operating within expected sigma variance. Click "Analyze Telemetry" to run a deep statistical re-evaluation.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateProposals}
              disabled={isAnalyzing}
              className="faang-btn-ghost text-xs h-7 px-3 text-zinc-300 hover:text-white shrink-0 cursor-pointer rounded-full"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isAnalyzing ? 'animate-spin' : ''}`} />
              Run Deep Evaluation
            </button>
          </div>
        )}
      </div>

      {/* Main Rules Table (Borderless, Integrated) */}
      <div className="unboxed-section space-y-3.5">
        <div className="flex flex-row items-center justify-between pb-1">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">Configured Security Rules & Violation Thresholds</h3>
            <p className="text-xs text-zinc-400 mt-0.5 font-medium">
              Requests exceeding the Block threshold are blocked at the perimeter. Requests between Flag and Block are admitted and queued for human audit.
            </p>
          </div>
          <button 
            type="button" 
            onClick={handleAdd} 
            className="faang-btn-primary text-xs h-8 px-3.5 font-bold flex items-center justify-center cursor-pointer"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Rule
          </button>
        </div>
        <div>
          {isLoading ? (
            <div className="py-8 text-center text-xs text-zinc-400 font-medium">Loading active policies...</div>
          ) : (
            <div className="overflow-x-auto border-t border-b border-white/[0.06] bg-transparent">
              <Table>
                <TableHeader className="bg-[#15161B]">
                  <TableRow className="text-xs border-white/[0.08]">
                    <TableHead className="font-bold text-zinc-300">Use Case</TableHead>
                    <TableHead className="font-bold text-zinc-300">Geography</TableHead>
                    <TableHead className="font-bold text-zinc-300">Scanner Check</TableHead>
                    <TableHead className="w-36 font-bold text-zinc-300">Block Threshold (0-1)</TableHead>
                    <TableHead className="w-36 font-bold text-zinc-300">Flag Threshold (0-1)</TableHead>
                    <TableHead className="w-36 font-bold text-zinc-300">On Timeout</TableHead>
                    <TableHead className="w-16 text-right font-bold text-zinc-300">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((policy, idx) => (
                    <TableRow key={policy.id || idx} className="text-xs border-white/[0.06] hover:bg-white/[0.03]">
                      <TableCell>
                        <Select
                          value={policy.use_case}
                          onValueChange={(val) => handleUpdate(idx, 'use_case', val)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-black/40 border-white/[0.1] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#15161B] border-white/[0.1] text-white">
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
                          <SelectTrigger className="h-8 text-xs bg-black/40 border-white/[0.1] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#15161B] border-white/[0.1] text-white">
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
                          <SelectTrigger className="h-8 text-xs font-mono bg-black/40 border-white/[0.1] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#15161B] border-white/[0.1] text-white">
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
                          className="h-8 text-xs font-mono bg-black/40 border-white/[0.1] text-white"
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
                          className="h-8 text-xs font-mono bg-black/40 border-white/[0.1] text-white"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={policy.on_timeout}
                          onValueChange={(val) => handleUpdate(idx, 'on_timeout', val)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-black/40 border-white/[0.1] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#15161B] border-white/[0.1] text-white">
                            <SelectItem value="allow">Allow (Fail Open)</SelectItem>
                            <SelectItem value="block">Block (Fail Closed)</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-rose-400"
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
        </div>
      </div>

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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Paste YAML, JSON, or Plain English Policy:</label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                    disabled={isExtracting || !uploadText.trim()}
                    onClick={handleExtractFromText}
                  >
                    <Sparkles className="w-3 h-3" />
                    {isExtracting ? 'Extracting...' : 'AI Extract Rules'}
                  </Button>
                </div>
                <textarea
                  value={uploadText}
                  onChange={(e) => handleUploadTextChange(e.target.value)}
                  placeholder={`Example plain English:\n"Do not allow sharing customer SSNs and financial reports to external AI."\n\nOr YAML/JSON:\npolicies:\n  - use_case: customer_support\n    geography: US\n    check: toxicity\n    block_threshold: 0.80\n    flag_threshold: 0.40\n    on_timeout: allow`}
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
