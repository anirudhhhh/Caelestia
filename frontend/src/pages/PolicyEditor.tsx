import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Save, Plus, AlertCircle, Info, Beaker, RotateCcw, Trash2, 
  CheckCircle2, Check, X, Upload, Download, FileText, Sparkles, 
  Sliders, Shield, ShieldCheck, ShieldAlert, Server, Cpu,
  RefreshCw, Activity, Zap, SlidersHorizontal, Lock, CheckCircle
} from 'lucide-react';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PolicyRule, ThresholdProposal } from '@/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import PillSlider from '@/components/ui/PillSlider';
import SegmentedProgress from '@/components/ui/SegmentedProgress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const AVAILABLE_CHECKS = [
  'toxicity',
  'prompt_injection',
  'pii',
  'secrets',
  'sensitive_data',
  'system_prompt_leakage',
  'brand_safety'
];

const PRESETS: { name: string; description: string; icon: any; rules: PolicyRule[] }[] = [
  {
    name: 'General Starter Baseline',
    description: 'Universal starter policy across all 7 security checks with standard recommended thresholds for general workloads.',
    icon: Shield,
    rules: [
      { id: 'g_1', use_case: '*', geography: '*', check_name: 'toxicity', block_threshold: 0.80, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'g_2', use_case: '*', geography: '*', check_name: 'prompt_injection', block_threshold: 0.80, flag_threshold: 0.50, on_timeout: 'allow' },
      { id: 'g_3', use_case: '*', geography: '*', check_name: 'secrets', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'g_4', use_case: '*', geography: '*', check_name: 'pii', block_threshold: 0.75, flag_threshold: 0.40, on_timeout: 'allow' },
      { id: 'g_5', use_case: '*', geography: '*', check_name: 'sensitive_data', block_threshold: 0.50, flag_threshold: 0.30, on_timeout: 'block' },
      { id: 'g_6', use_case: '*', geography: '*', check_name: 'system_prompt_leakage', block_threshold: 0.70, flag_threshold: 0.40, on_timeout: 'block' },
      { id: 'g_7', use_case: '*', geography: '*', check_name: 'brand_safety', block_threshold: 0.75, flag_threshold: 0.40, on_timeout: 'allow' },
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
  { key: 'SSN', name: 'Social Security / National ID', desc: 'XXX-XX-XXXX, tax identifiers' },
  { key: 'CREDIT_CARD', name: 'Credit & Debit Cards', desc: '16-digit PAN, CVV, expiry tokens' },
  { key: 'IP_ADDRESS', name: 'IP Addresses', desc: 'IPv4 and IPv6 network origins' },
  { key: 'NAME', name: 'Full Personal Names', desc: 'First and last names extracted by NER' },
];

export default function PolicyEditor() {
  const [searchParams] = useSearchParams();
  const activeTabFromUrl = searchParams.get('tab');
  const sectionFromUrl = searchParams.get('section');

  const getInitialTab = (): 'rules' | 'yaml' | 'pii' => {
    if (activeTabFromUrl === 'pii' || sectionFromUrl === 'policy-pii-matrix') return 'pii';
    if (activeTabFromUrl === 'yaml' || sectionFromUrl === 'policy-yaml-editor') return 'yaml';
    return 'rules';
  };

  const [activeTab, setActiveTab] = useState<'rules' | 'yaml' | 'pii'>(getInitialTab());
  const [rules, setRules] = useState<PolicyRule[]>(PRESETS[0].rules);
  const [yamlContent, setYamlContent] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('General Starter Baseline');

  // Switch tab if section in URL changes
  useEffect(() => {
    const section = searchParams.get('section');
    if (section === 'policy-pii-matrix') {
      setActiveTab('pii');
    } else if (section === 'policy-yaml-editor') {
      setActiveTab('yaml');
    } else if (section === 'policy-threshold-sliders' || section === 'policy-nl-extractor') {
      setActiveTab('rules');
    }
  }, [searchParams]);

  // PII Permissions state: { EMAIL: 'block', PHONE: 'allow', ... }
  const [piiPermissions, setPiiPermissions] = useState<Record<string, 'allow' | 'block'>>({
    EMAIL: 'block',
    PHONE: 'allow',
    SSN: 'block',
    CREDIT_CARD: 'block',
    IP_ADDRESS: 'allow',
    NAME: 'allow',
  });

  // Self-Healing Immune System proposals (suggested after 10 human review cycles)
  const [proposals, setProposals] = useState<ThresholdProposal[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [selectedProposalForReview, setSelectedProposalForReview] = useState<ThresholdProposal | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isApplyingProposal, setIsApplyingProposal] = useState(false);
  const [proposalSuccessMsg, setProposalSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadPolicies();
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      setIsLoadingProposals(true);
      const data = await api.getProposals();
      setProposals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load threshold proposals', err);
    } finally {
      setIsLoadingProposals(false);
    }
  };

  const handleOpenReviewModal = (prop: ThresholdProposal) => {
    setSelectedProposalForReview(prop);
    setIsConfirmModalOpen(true);
  };

  const handleDismissProposal = async (propId: string) => {
    try {
      await api.dismissProposal(propId);
      setProposals(prev => prev.filter(p => (p.proposal_id || (p as any).id) !== propId));
      if (selectedProposalForReview && ((selectedProposalForReview.proposal_id || (selectedProposalForReview as any).id) === propId)) {
        setIsConfirmModalOpen(false);
        setSelectedProposalForReview(null);
      }
    } catch (err) {
      console.error('Failed to dismiss proposal', err);
    }
  };

  const handleConfirmApplyProposal = async () => {
    if (!selectedProposalForReview) return;
    setIsApplyingProposal(true);
    const prop = selectedProposalForReview;
    try {
      const propId = prop.proposal_id || (prop as any).id;
      // 1. Call Immune System API to record acceptance and update Policy Engine
      await api.acceptProposal(propId);

      // 2. Immediately update local rules in PolicyEditor state
      const targetCheck = prop.check_name;
      const targetUseCase = prop.use_case || 'customer_support';
      const threshType = prop.target_threshold_type || 'block_threshold';
      const newVal = Number(prop.proposed_threshold);

      const nextRules = [...rules];
      let ruleFound = false;
      for (let i = 0; i < nextRules.length; i++) {
        const r = nextRules[i];
        if (
          (r.check_name === targetCheck || (r as any).check === targetCheck) &&
          (r.use_case === targetUseCase || r.use_case === '*' || targetUseCase === '*')
        ) {
          nextRules[i] = { ...r, [threshType]: newVal };
          ruleFound = true;
          break;
        }
      }
      if (!ruleFound) {
        nextRules.push({
          id: `rule_applied_${Date.now()}`,
          use_case: targetUseCase as any,
          geography: (prop.geography || 'US') as any,
          check_name: targetCheck as any,
          block_threshold: threshType === 'block_threshold' ? newVal : 0.80,
          flag_threshold: threshType === 'flag_threshold' ? newVal : 0.40,
          on_timeout: 'allow',
        });
      }
      setRules(nextRules);
      setYamlContent(yamlDump({ rules: nextRules }));

      setProposalSuccessMsg(
        `Applied self-healing calibration: ${targetCheck.replace(/_/g, ' ')} ${threshType.replace(/_/g, ' ')} updated to ${newVal.toFixed(2)}!`
      );
      setTimeout(() => setProposalSuccessMsg(null), 5000);

      // 3. Remove applied proposal and reload list
      setProposals(prev => prev.filter(p => (p.proposal_id || (p as any).id) !== propId));
      setIsConfirmModalOpen(false);
      setSelectedProposalForReview(null);
      await loadProposals();
    } catch (err: any) {
      alert(`Failed to apply proposal: ${err.message || err}`);
    } finally {
      setIsApplyingProposal(false);
    }
  };

  const loadPolicies = async () => {
    try {
      const data = await api.getPolicies().catch(() => null);
      if (data && data.rules && data.rules.length > 0) {
        setRules(data.rules);
        setYamlContent(yamlDump(data));
      } else {
        setYamlContent(yamlDump({ rules: PRESETS[0].rules }));
      }
    } catch {
      setYamlContent(yamlDump({ rules: PRESETS[0].rules }));
    }
  };

  const handleApplyPreset = (presetName: string) => {
    const p = PRESETS.find(pr => pr.name === presetName);
    if (p) {
      setSelectedPreset(p.name);
      setRules([...p.rules]);
      setYamlContent(yamlDump({ rules: p.rules }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let payloadToSave: any;
      if (activeTab === 'yaml') {
        payloadToSave = yamlLoad(yamlContent);
      } else {
        payloadToSave = { rules };
      }
      await api.updatePolicies(payloadToSave);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setYamlError(err.message || 'Failed to save policy');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRuleChange = (idx: number, field: keyof PolicyRule, val: any) => {
    const next = [...rules];
    next[idx] = { ...next[idx], [field]: val };
    setRules(next);
    setYamlContent(yamlDump({ rules: next }));
  };

  return (
    <div className="h-full w-full overflow-y-auto space-y-5 sm:space-y-6 pr-1 pb-12 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328] flex items-center gap-2">
            <Sliders className="h-5 w-5 text-amber-500" />
            Zero-Trust Policy Studio
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Configure automated security check thresholds & PII sanitization profiles
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Policy Deployed
            </span>
          )}
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bento-btn-primary h-9 px-4 text-xs"
          >
            <Save className="h-3.5 w-3.5 mr-1 text-[#FFC83B]" />
            <span>{isSaving ? "Deploying..." : "Deploy Active Policy"}</span>
          </Button>
        </div>
      </div>

      {/* Self-Healing Immune System Proposals Banner (Triggered after 10+ human review cycles) */}
      {proposals.length > 0 && (
        <div className="bento-card border border-amber-500/30 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/15 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-extrabold text-[#212328]">
                    Self-Healing Immune System Proposals
                  </h3>
                  <span className="stat-pill bg-amber-500 text-white text-[9px] font-bold">
                    {proposals.length} CALIBRATION{proposals.length > 1 ? 'S' : ''} PENDING
                  </span>
                </div>
                <p className="text-xs text-zinc-600 font-medium mt-0.5">
                  Proposed after 10+ human review cycles to optimize model throughput and eliminate false-positive operator friction.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadProposals}
              disabled={isLoadingProposals}
              className="h-8 text-xs font-bold border-amber-300 text-amber-900 hover:bg-amber-100/50 self-start sm:self-auto"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoadingProposals && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {proposalSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{proposalSuccessMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {proposals.map((prop, idx) => {
              const pId = prop.proposal_id || (prop as any).id || `prop_${idx}`;
              const checkLabel = prop.check_name.replace(/_/g, ' ');
              const threshLabel = (prop.target_threshold_type || 'block_threshold').replace(/_/g, ' ');
              return (
                <div 
                  key={pId}
                  className="bg-white/90 backdrop-blur-xs rounded-2xl border border-black/5 p-4 flex flex-col justify-between space-y-3 hover:border-amber-400/50 transition-all shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-[#212328] text-white">
                        {checkLabel}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-zinc-400">
                        {prop.use_case} · {prop.geography}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <div className="px-2.5 py-1.5 rounded-xl bg-zinc-100 text-zinc-600 text-xs font-mono font-bold">
                        Current {threshLabel}: <span className="text-zinc-900 font-extrabold">{Number(prop.current_threshold).toFixed(2)}</span>
                      </div>
                      <span className="text-amber-500 font-bold">→</span>
                      <div className="px-2.5 py-1.5 rounded-xl bg-amber-100/70 text-amber-950 text-xs font-mono font-extrabold border border-amber-300/60">
                        Proposed: <span className="text-amber-800">{Number(prop.proposed_threshold).toFixed(2)}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-600 leading-relaxed font-medium">
                      {prop.reason}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismissProposal(pId)}
                      className="h-7 px-3 text-[11px] font-bold text-zinc-500 hover:text-zinc-800"
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleOpenReviewModal(prop)}
                      className="h-7 px-3.5 text-[11px] font-extrabold bg-[#212328] text-white hover:bg-black rounded-xl"
                    >
                      Review & Apply
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preset Profiles Bento (Reference Style) */}
      <div className="bento-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
              Pre-Engineered Policy Profiles
            </h3>
            <p className="text-xs text-zinc-500 font-medium">Instantly load industry-calibrated sensitivity baselines</p>
          </div>
          <span className="stat-pill text-[10px]">PRESETS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {PRESETS.map((pr) => {
            const isSelected = selectedPreset === pr.name;
            const Icon = pr.icon;

            return (
              <button
                key={pr.name}
                type="button"
                onClick={() => handleApplyPreset(pr.name)}
                className={cn(
                  "p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden",
                  isSelected
                    ? "bg-[#212328] text-white border-black shadow-md"
                    : "bg-[#FAF8F5] text-zinc-800 border-black/5 hover:bg-[#F2ECE4]"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shadow-xs",
                    isSelected ? "bg-white/10 text-[#FFC83B]" : "bg-white text-zinc-700"
                  )}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FFC83B] text-[#212328] text-[9px] font-black uppercase">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-black tracking-tight">{pr.name}</div>
                  <p className={cn(
                    "text-[11px] font-medium mt-0.5 line-clamp-2",
                    isSelected ? "text-zinc-400" : "text-zinc-500"
                  )}>
                    {pr.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-white rounded-full border border-black/5 w-fit shadow-xs">
        <button
          onClick={() => setActiveTab('rules')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
            activeTab === 'rules' ? "bg-[#212328] text-white shadow-xs" : "text-zinc-600 hover:text-black"
          )}
        >
          Visual Rule Builder
        </button>
        <button
          onClick={() => setActiveTab('pii')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
            activeTab === 'pii' ? "bg-[#212328] text-white shadow-xs" : "text-zinc-600 hover:text-black"
          )}
        >
          PII & Privacy Profile
        </button>
        <button
          onClick={() => setActiveTab('yaml')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
            activeTab === 'yaml' ? "bg-[#212328] text-white shadow-xs" : "text-zinc-600 hover:text-black"
          )}
        >
          YAML Raw Editor
        </button>
      </div>

      {/* Tab 1: Visual Rule Builder with Custom Sliders (Reference Style) */}
      {activeTab === 'rules' && (
        <div id="policy-threshold-sliders" className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {rules.map((rule, idx) => {
            const blockPct = Math.round(rule.block_threshold * 100);
            const flagPct = Math.round(rule.flag_threshold * 100);

            return (
              <div key={idx} className="bento-card p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-[#212328] text-[#FFC83B] flex items-center justify-center text-xs font-black">
                      {idx + 1}
                    </div>
                    <span className="text-sm font-extrabold text-[#212328] capitalize">
                      {rule.check_name.replace('_', ' ')} Check
                    </span>
                  </div>
                  <Select
                    value={rule.on_timeout}
                    onValueChange={(val) => handleRuleChange(idx, 'on_timeout', val)}
                  >
                    <SelectTrigger className="w-[95px] h-7 text-[11px] font-bold bg-[#FAF8F5] border-black/5 rounded-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-black/10 rounded-xl">
                      <SelectItem value="allow">Allow Timeout</SelectItem>
                      <SelectItem value="block">Block Timeout</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Pill Sliders for Block & Flag Thresholds */}
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-rose-600">Block Threshold</span>
                      <span className="font-mono text-[#212328]">{blockPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={blockPct}
                      onChange={(e) => handleRuleChange(idx, 'block_threshold', parseFloat(e.target.value) / 100)}
                      className="w-full h-2 rounded-full bg-[#EAE4DC] accent-[#212328] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-amber-600">Warning Flag Threshold</span>
                      <span className="font-mono text-[#212328]">{flagPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={flagPct}
                      onChange={(e) => handleRuleChange(idx, 'flag_threshold', parseFloat(e.target.value) / 100)}
                      className="w-full h-2 rounded-full bg-[#EAE4DC] accent-[#FFC83B] cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-zinc-500">
                  <span>Scope: {rule.use_case} ({rule.geography})</span>
                  <SegmentedProgress current={Math.round(rule.block_threshold * 10)} total={10} color="coral" size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: PII Profile Matrix */}
      {activeTab === 'pii' && (
        <div id="policy-pii-matrix" className="bento-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
                Enterprise PII Entity Sanitization
              </h3>
              <p className="text-xs text-zinc-500 font-medium">Declare deterministic blocking or tokenization per data entity</p>
            </div>
            <span className="stat-pill text-[10px]">PII ENGINE</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PII_ENTITIES.map((ent) => {
              const currentAction = piiPermissions[ent.key] || 'block';

              return (
                <div key={ent.key} className="p-4 rounded-2xl bg-[#FAF8F5] border border-black/5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-[#212328]">{ent.name}</div>
                    <div className="text-[11px] text-zinc-500 font-medium">{ent.desc}</div>
                  </div>

                  <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-black/5">
                    <button
                      onClick={() => setPiiPermissions(prev => ({ ...prev, [ent.key]: 'allow' }))}
                      className={cn(
                        "px-3 py-1 rounded-full text-[11px] font-bold transition-all",
                        currentAction === 'allow' ? "bg-emerald-600 text-white shadow-xs" : "text-zinc-500"
                      )}
                    >
                      Allow
                    </button>
                    <button
                      onClick={() => setPiiPermissions(prev => ({ ...prev, [ent.key]: 'block' }))}
                      className={cn(
                        "px-3 py-1 rounded-full text-[11px] font-bold transition-all",
                        currentAction === 'block' ? "bg-rose-600 text-white shadow-xs" : "text-zinc-500"
                      )}
                    >
                      Block
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: YAML Raw Editor */}
      {activeTab === 'yaml' && (
        <div id="policy-yaml-editor" className="bento-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
                YAML Policy Definition
              </h3>

              <p className="text-xs text-zinc-500 font-medium">Direct declarative configuration synchronized with backend engine</p>
            </div>
            <span className="stat-pill text-[10px]">YAML v1</span>
          </div>

          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            rows={16}
            className="w-full font-mono text-xs p-4 rounded-2xl bg-[#212328] text-amber-300 border border-black/10 focus:outline-none"
          />
        </div>
      )}

      {/* Interactive Review & Confirmation Modal */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="max-w-md bg-white border border-black/10 rounded-3xl p-6 space-y-4 shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600 mb-1">
              <Sparkles className="h-5 w-5" />
              <span className="text-xs font-extrabold uppercase tracking-wider">Immune System Calibration</span>
            </div>
            <DialogTitle className="text-lg font-extrabold text-[#212328]">
              Apply Proposed Threshold Change?
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Review the automated recommendation before applying changes to the live perimeter policy.
            </DialogDescription>
          </DialogHeader>

          {selectedProposalForReview && (
            <div className="space-y-3.5 py-1">
              <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-black/5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-600">
                  <span>Target Check:</span>
                  <span className="text-zinc-900 font-extrabold uppercase">
                    {selectedProposalForReview.check_name.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-zinc-600">
                  <span>Target Parameter:</span>
                  <span className="text-zinc-900 font-mono">
                    {selectedProposalForReview.target_threshold_type || 'block_threshold'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-zinc-600">
                  <span>Workflow & Geo:</span>
                  <span className="text-zinc-900">
                    {selectedProposalForReview.use_case} ({selectedProposalForReview.geography})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 rounded-2xl bg-zinc-100 border border-zinc-200">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Current Active</span>
                  <span className="text-base font-extrabold font-mono text-zinc-700">
                    {Number(selectedProposalForReview.current_threshold).toFixed(2)}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950">
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Proposed Calibration</span>
                  <span className="text-base font-extrabold font-mono text-amber-900">
                    {Number(selectedProposalForReview.proposed_threshold).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200/60 text-xs text-zinc-700 space-y-1">
                <span className="font-extrabold text-amber-900 block">Operator Review Rationale:</span>
                <p className="text-[11px] leading-relaxed">
                  {selectedProposalForReview.justification || selectedProposalForReview.reason}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={isApplyingProposal}
              className="h-9 px-4 text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApplyProposal}
              disabled={isApplyingProposal}
              className="h-9 px-4 text-xs font-extrabold bg-[#212328] text-white hover:bg-black rounded-xl"
            >
              {isApplyingProposal ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Applying...
                </>
              ) : (
                'Confirm & Apply to Policy'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
