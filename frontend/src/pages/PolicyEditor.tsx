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

  useEffect(() => {
    loadPolicies();
  }, []);

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
    </div>
  );
}
