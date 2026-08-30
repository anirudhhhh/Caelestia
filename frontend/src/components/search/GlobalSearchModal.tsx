import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ShieldCheck, ShieldAlert, Settings, FileText, BarChart3,
  UserCheck, Activity, Network, KeyRound, MessageSquare, ArrowRight,
  Sparkles, CheckCircle2, Lock, Cpu, Globe, Server, Hash,
  CornerDownLeft, X, Terminal, HelpCircle, Layers
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { searchCollection, getHighlightSegments } from '@/lib/fuzzy';
import { triggerSectionHighlight } from '@/lib/useSectionHighlight';
import { cn } from '@/lib/utils';

export interface SearchItem {
  id: string;
  title: string;
  description: string;
  category: 'PAGES & VIEWS' | 'SECURITY GUARDS' | 'POLICY & GOVERNANCE' | 'ROUTING & ENDPOINTS' | 'AUDIT & TELEMETRY' | 'SECRET VAULT';
  path: string;
  sectionId?: string;
  keywords: string[];
  icon: any;
  badge?: string;
}

export const SYSTEM_SEARCH_ITEMS: SearchItem[] = [
  // PAGES & VIEWS
  {
    id: 'page-playground',
    title: 'Live AI Playground',
    description: 'Real-time zero-trust security & stream inspector for prompt testing',
    category: 'PAGES & VIEWS',
    path: '/',
    sectionId: 'playground-chat',
    keywords: ['playground', 'chat', 'firewall', 'stream', 'inspector', 'test', 'gemini', 'prompt', 'completion'],
    icon: MessageSquare,
    badge: 'Live'
  },
  {
    id: 'page-router',
    title: 'Semantic Router & Load Balancer',
    description: 'Dynamic 384-d vector routing, workflow endpoints & PII enforcement',
    category: 'PAGES & VIEWS',
    path: '/load-balancer',
    sectionId: 'lb-tester',
    keywords: ['router', 'load balancer', 'vector', 'semantic', 'minilm', 'pinecone', 'embedding', 'cosine', 'routing'],
    icon: Network,
    badge: 'Port 8005'
  },
  {
    id: 'page-review',
    title: 'Human Review Console',
    description: 'High-risk escalation triage, operator review & closed-loop learning',
    category: 'PAGES & VIEWS',
    path: '/review',
    sectionId: 'review-queue',
    keywords: ['human review', 'review', 'triage', 'escalation', 'operator', 'approve', 'deny', 'appeal', 'queue'],
    icon: UserCheck,
    badge: 'Port 8008'
  },
  {
    id: 'page-trust',
    title: 'Enterprise Trust Dashboard',
    description: 'Immune health scores, compliance matrix & runtime forensics',
    category: 'PAGES & VIEWS',
    path: '/trust',
    sectionId: 'trust-metrics',
    keywords: ['trust', 'dashboard', 'metrics', 'compliance', 'gdpr', 'nist', 'dpdp', 'hipaa', 'sla', 'forensics', 'accuracy'],
    icon: BarChart3,
    badge: 'Analytics'
  },
  {
    id: 'page-audit',
    title: 'Cryptographic Audit Trail',
    description: 'Immutable SHA-256 verified ledger of all ingress & egress interactions',
    category: 'PAGES & VIEWS',
    path: '/audit',
    sectionId: 'audit-events-list',
    keywords: ['audit', 'trail', 'ledger', 'sqlite', 'sha256', 'cryptographic', 'records', 'events', 'history', 'log'],
    icon: FileText,
    badge: 'Port 8007'
  },
  {
    id: 'page-policies',
    title: 'Policy Studio & Rule Editor',
    description: 'Zero-trust declarative YAML rules, dynamic thresholds & PII profiles',
    category: 'PAGES & VIEWS',
    path: '/policies',
    sectionId: 'policy-pii-matrix',
    keywords: ['policy', 'policies', 'studio', 'rules', 'yaml', 'thresholds', 'editor', 'pii matrix', 'governance'],
    icon: Settings,
    badge: 'Port 8004'
  },
  {
    id: 'page-secrets',
    title: 'Secret Vault & Fingerprint Registry',
    description: 'Zero-knowledge HMAC-SHA256 credential fingerprinting and revocation',
    category: 'PAGES & VIEWS',
    path: '/secrets',
    sectionId: 'secrets-register',
    keywords: ['secret', 'secrets', 'vault', 'credentials', 'api keys', 'hmac', 'sha256', 'fingerprint', 'entropy', 'token'],
    icon: KeyRound,
    badge: 'Zero-Plaintext'
  },
  {
    id: 'page-health',
    title: 'System Health & Cluster Mesh',
    description: '12 microservices latency & uptime grid with anomaly detection',
    category: 'PAGES & VIEWS',
    path: '/health',
    sectionId: 'health-mesh-grid',
    keywords: ['health', 'system', 'cluster', 'mesh', 'microservices', 'uptime', 'anomalies', 'latency', 'heartbeat', 'proposals'],
    icon: Activity,
    badge: '12/12 Online'
  },

  // SECURITY GUARDS & CHECK ENGINES
  {
    id: 'check-prompt-injection',
    title: 'Prompt Injection & Jailbreak Defense',
    description: 'DeBERTa transformer classifier + L3 vector similarity against DAN/jailbreaks',
    category: 'SECURITY GUARDS',
    path: '/',
    sectionId: 'playground-inspector',
    keywords: ['prompt injection', 'jailbreak', 'dan', 'system prompt override', 'deberta', 'adversarial', 'deceiver', 'stan'],
    icon: ShieldAlert,
    badge: 'L2 Neural'
  },
  {
    id: 'check-toxicity',
    title: 'Contextual Toxicity & Harassment Filter',
    description: 'Neural RoBERTa classifier disambiguating technical commands from hostility',
    category: 'SECURITY GUARDS',
    path: '/',
    sectionId: 'playground-inspector',
    keywords: ['toxicity', 'harassment', 'hostility', 'profanity', 'hate speech', 'kill -9', 'slur', 'offensive'],
    icon: ShieldAlert,
    badge: 'L2 RoBERTa'
  },
  {
    id: 'check-pii-service',
    title: 'PII & Privacy Engine (Presidio NER)',
    description: 'Presidio Named Entity Recognition for Email, Phone, SSN, PAN, Aadhaar, Cards',
    category: 'SECURITY GUARDS',
    path: '/policies',
    sectionId: 'policy-pii-matrix',
    keywords: ['pii', 'privacy', 'presidio', 'ner', 'ssn', 'email', 'phone', 'aadhaar', 'pan card', 'credit card', 'redaction'],
    icon: ShieldCheck,
    badge: 'Presidio NER'
  },
  {
    id: 'check-secrets-engine',
    title: 'Secret Credentials & Key Scanner',
    description: 'Gitleaks regex signatures + Shannon entropy (>4.30 bits) + HMAC matches',
    category: 'SECURITY GUARDS',
    path: '/secrets',
    sectionId: 'secrets-register',
    keywords: ['secrets scanner', 'gitleaks', 'shannon entropy', 'api key', 'jwt', 'sk-proj', 'ghp_', 'leakage'],
    icon: Lock,
    badge: 'Entropy >4.30'
  },
  {
    id: 'check-system-prompt-leak',
    title: 'System Prompt Leakage Guard',
    description: 'Canary tripwires, 4-gram Jaccard overlap, and cosine sentence similarity',
    category: 'SECURITY GUARDS',
    path: '/',
    sectionId: 'playground-inspector',
    keywords: ['system prompt leakage', 'exfiltration', 'canary', 'jaccard', 'lcs', 'egress', 'leakage'],
    icon: ShieldCheck,
    badge: 'Egress Guard'
  },
  {
    id: 'check-hallucination-judge',
    title: 'L4 LLM Grounding & Hallucination Judge',
    description: 'AI-as-judge evidence verification and claim validation via Google Gemini',
    category: 'SECURITY GUARDS',
    path: '/trust',
    sectionId: 'trust-compliance',
    keywords: ['hallucination', 'grounding', 'judge', 'gemini', 'evidence', 'rag', 'verification', 'unverified'],
    icon: Cpu,
    badge: 'L4 Verifier'
  },

  // POLICY & GOVERNANCE
  {
    id: 'policy-pii-matrix',
    title: 'Interactive PII Permissions Matrix',
    description: 'Toggle ALLOW RAW vs STRICT BLOCK per entity type and use case',
    category: 'POLICY & GOVERNANCE',
    path: '/policies',
    sectionId: 'policy-pii-matrix',
    keywords: ['pii matrix', 'allow raw', 'strict block', 'permissions', 'email', 'phone', 'ssn', 'pan', 'aadhaar', 'matrix'],
    icon: Settings,
    badge: 'Hot-Reload'
  },
  {
    id: 'policy-threshold-sliders',
    title: 'Dynamic Safety Threshold Sliders',
    description: 'Adjust continuous confidence thresholds for block and flag actions',
    category: 'POLICY & GOVERNANCE',
    path: '/policies',
    sectionId: 'policy-threshold-sliders',
    keywords: ['thresholds', 'sliders', 'confidence', 'block threshold', 'flag threshold', 'sensitivity', 'policy limits'],
    icon: Settings,
    badge: 'Continuous'
  },
  {
    id: 'policy-nl-extractor',
    title: 'Natural Language Policy Extractor',
    description: 'Compile plain enterprise English policies into structured machine-executable rules',
    category: 'POLICY & GOVERNANCE',
    path: '/policies',
    sectionId: 'policy-nl-extractor',
    keywords: ['natural language policy', 'extract', 'compiler', 'corporate policy', 'plain text rules', 'nl extractor'],
    icon: Sparkles,
    badge: 'AI Compiler'
  },
  {
    id: 'policy-yaml-export',
    title: 'Policy YAML Upload & Snapshot Export',
    description: 'Export active policy configuration or upload versioned policies with zero downtime',
    category: 'POLICY & GOVERNANCE',
    path: '/policies',
    sectionId: 'policy-yaml-editor',
    keywords: ['yaml', 'export', 'upload', 'hot reload', 'policies.yaml', 'default_policy', 'config'],
    icon: Terminal,
    badge: 'Zero-Downtime'
  },
  {
    id: 'policy-geo-sovereignty',
    title: 'Regional Sovereign Data Zones (US / EU / IN)',
    description: 'Configure sovereign compliance perimeters, GDPR rules, and DPDP mandates',
    category: 'POLICY & GOVERNANCE',
    path: '/',
    sectionId: 'playground-geography',
    keywords: ['geography', 'sovereignty', 'eu gdpr', 'india dpdp', 'us federal', 'regional compliance', 'zones'],
    icon: Globe,
    badge: 'Data Sovereignty'
  },

  // ROUTING & ENDPOINTS
  {
    id: 'router-test-bench',
    title: 'Vector Routing Test Bench & Simulator',
    description: 'Test prompts against 384-d semantic embedding index with live similarity scores',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'lb-tester',
    keywords: ['routing test', 'simulator', 'cosine similarity', 'vector matching', 'minilm', 'hybrid routing'],
    icon: Network,
    badge: '384-d MiniLM'
  },
  {
    id: 'endpoint-customer-support',
    title: 'Customer Support Workflow Endpoint',
    description: 'Specialized enterprise agent for general inquiries, customer success, and order tracking',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'endpoint-customer_support',
    keywords: ['customer support', 'support agent', 'inquiries', 'refund', 'order', 'tickets', 'workflow'],
    icon: Server,
    badge: 'Port 8000'
  },
  {
    id: 'endpoint-engineering',
    title: 'Engineering Copilot Workflow Endpoint',
    description: 'Developer copilot specialized in coding, SQL, DevOps commands, and debugging',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'endpoint-internal_copilot',
    keywords: ['engineering copilot', 'developer', 'coding', 'sql', 'devops', 'internal copilot', 'code generation'],
    icon: Server,
    badge: 'Port 8000'
  },
  {
    id: 'endpoint-decision',
    title: 'Decision Support & Financial Strategy',
    description: 'Specialized analysis for market risk, budgeting, strategic planning, and forecasting',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'endpoint-decision_support',
    keywords: ['decision support', 'finance', 'risk assessment', 'strategy', 'forecasting', 'market analysis'],
    icon: Server,
    badge: 'Port 8000'
  },
  {
    id: 'endpoint-legal',
    title: 'Legal Compliance & Contract Review',
    description: 'Contract analysis, compliance checks, data sovereignty policies, and legal advisory',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'endpoint-legal_compliance',
    keywords: ['legal compliance', 'contracts', 'gdpr audit', 'regulations', 'liability', 'legal advisory'],
    icon: Server,
    badge: 'Port 8000'
  },
  {
    id: 'endpoint-email',
    title: 'Email Dispatch Service (Port 8022)',
    description: 'Natural language email extraction and delivery via SMTP or persistent outbox',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'lb-endpoints',
    keywords: ['email service', 'send email', 'smtp', 'outbox', 'recipient', 'notifications', 'port 8022'],
    icon: Server,
    badge: 'Port 8022'
  },
  {
    id: 'endpoint-leave',
    title: 'Leave Approval Service (Port 8023)',
    description: 'NLP duration extraction with deterministic business rules (Auto, Manager, Reject)',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'lb-endpoints',
    keywords: ['leave approval', 'vacation', 'time off', 'business rules', 'manager approval', 'port 8023'],
    icon: Server,
    badge: 'Port 8023'
  },
  {
    id: 'endpoint-weather',
    title: 'Weather Meteorological Service (Port 8024)',
    description: 'Geocoding and real-time live meteorological data fetching via Open-Meteo',
    category: 'ROUTING & ENDPOINTS',
    path: '/load-balancer',
    sectionId: 'lb-endpoints',
    keywords: ['weather service', 'temperature', 'forecast', 'open-meteo', 'geocoding', 'port 8024'],
    icon: Server,
    badge: 'Port 8024'
  },

  // AUDIT & TELEMETRY
  {
    id: 'audit-ledger-search',
    title: 'Cryptographic Audit Events Ledger',
    description: 'Search interaction IDs, user prompt payloads, check results, and decision reasons',
    category: 'AUDIT & TELEMETRY',
    path: '/audit',
    sectionId: 'audit-events-list',
    keywords: ['audit search', 'interaction id', 'payload content', 'ledger search', 'envelope inspection'],
    icon: FileText,
    badge: 'Full Ledger'
  },
  {
    id: 'trust-compliance-matrix',
    title: 'Regulatory & Compliance Frameworks Matrix',
    description: 'Certification audit tracking for GDPR, EU AI Act, NIST AI RMF, DPDP Act, HIPAA',
    category: 'AUDIT & TELEMETRY',
    path: '/trust',
    sectionId: 'trust-compliance',
    keywords: ['compliance matrix', 'gdpr article 22', 'eu ai act', 'nist rmf', 'india dpdp', 'hipaa', 'certifications'],
    icon: CheckCircle2,
    badge: 'Compliance'
  },
  {
    id: 'health-proposals',
    title: 'Immune System Self-Healing Proposals',
    description: 'Automated statistical threshold proposals (mu +/- k*sigma) ready for 1-click acceptance',
    category: 'AUDIT & TELEMETRY',
    path: '/health',
    sectionId: 'health-proposals',
    keywords: ['immune system', 'self-healing', 'threshold proposals', 'sigma anomaly', 'auto-tuning', 'proposals'],
    icon: Activity,
    badge: 'Immune System'
  },
  {
    id: 'health-anomalies-list',
    title: 'Active Perimeter Anomalies & Alerts',
    description: 'Real-time statistical drift tracking across block rate and latency baselines',
    category: 'AUDIT & TELEMETRY',
    path: '/health',
    sectionId: 'health-anomalies',
    keywords: ['anomalies', 'alerts', 'statistical drift', 'drift detection', 'perimeter spikes', 'rate limit'],
    icon: ShieldAlert,
    badge: 'Real-time'
  },

  // SECRET VAULT
  {
    id: 'secrets-register-form',
    title: 'Register Secret HMAC Fingerprint',
    description: 'Register enterprise API keys, database URLs, and passwords for zero-plaintext scanning',
    category: 'SECRET VAULT',
    path: '/secrets',
    sectionId: 'secrets-register',
    keywords: ['register secret', 'hmac fingerprint', 'zero plaintext', 'hash api key', 'credential vault'],
    icon: KeyRound,
    badge: 'SHA-256 HMAC'
  },
  {
    id: 'secrets-active-table',
    title: 'Active Registered Secrets & Revocation Table',
    description: 'View active credential hashes, match count, last triggered timestamp, and revoke keys',
    category: 'SECRET VAULT',
    path: '/secrets',
    sectionId: 'secrets-active-list',
    keywords: ['active secrets', 'revoke key', 'compromised token', 'credential status', 'revocation table'],
    icon: Lock,
    badge: 'Revocation'
  }
];

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export default function GlobalSearchModal({ isOpen, onClose, initialQuery = '' }: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Sync initial query if passed
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Execute multi-field fuzzy search
  const filteredResults = useMemo(() => {
    let itemsToSearch = SYSTEM_SEARCH_ITEMS;
    if (selectedCategory !== 'ALL') {
      itemsToSearch = itemsToSearch.filter(item => item.category === selectedCategory);
    }

    if (!query.trim()) {
      return itemsToSearch.map(item => ({ item, score: 1, matchedIndices: [] }));
    }

    return searchCollection(itemsToSearch, query, [
      { key: 'title', weight: 2.2 },
      { key: 'description', weight: 1.4 },
      { key: 'category', weight: 1.0 },
      { getter: (item) => item.keywords, weight: 1.8 },
      { key: 'badge', weight: 1.2 }
    ]);
  }, [query, selectedCategory]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, selectedCategory]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelectItem(filteredResults[selectedIndex].item);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const handleSelectItem = (item: SearchItem) => {
    onClose();

    const targetUrl = item.sectionId
      ? `${item.path}?section=${item.sectionId}`
      : item.path;

    navigate(targetUrl, {
      state: { highlightSection: item.sectionId }
    });

    // If already on the same path, manually trigger highlight immediately
    if (window.location.pathname === item.path && item.sectionId) {
      setTimeout(() => {
        triggerSectionHighlight(item.sectionId!);
      }, 100);
    }
  };

  const categories = ['ALL', 'PAGES & VIEWS', 'SECURITY GUARDS', 'POLICY & GOVERNANCE', 'ROUTING & ENDPOINTS', 'AUDIT & TELEMETRY', 'SECRET VAULT'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-2xl p-0 overflow-hidden shadow-2xl font-sans text-[#1E2024]">
        <DialogTitle className="sr-only">System-Wide Search</DialogTitle>
        <DialogDescription className="sr-only">Search across all ControlPlane.ai guards, policies, endpoints, and telemetry</DialogDescription>
        
        {/* Search Header Input Bar */}
        <div className="p-4 sm:p-5 border-b border-black/5 flex items-center gap-3 bg-[#FAF8F5]">
          <div className="w-10 h-10 rounded-2xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shrink-0 shadow-sm">
            <Search className="h-5 w-5" />
          </div>
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Fuzzy search policies, guards, endpoints, audit telemetry (e.g., 'ssn', 'toxicity', 'minilm')..."
              className="w-full bg-transparent text-sm sm:text-base font-bold text-[#212328] placeholder-zinc-400 outline-none pr-8"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-zinc-400 bg-white px-2.5 py-1 rounded-xl border border-black/5 shadow-xs">
            <span>ESC to close</span>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="px-4 py-2.5 border-b border-black/5 bg-white flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all cursor-pointer",
                selectedCategory === cat
                  ? "bg-[#212328] text-white shadow-xs"
                  : "bg-[#FAF8F5] text-zinc-600 hover:bg-[#F2ECE4] hover:text-zinc-900"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Results List */}
        <div 
          ref={resultsContainerRef}
          className="max-h-[50vh] sm:max-h-[55vh] overflow-y-auto p-3 space-y-1.5 bg-[#FAF8F5]"
        >
          {filteredResults.length > 0 ? (
            filteredResults.map((result, idx) => {
              const item = result.item;
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              const titleSegments = getHighlightSegments(item.title, result.matchedIndices || []);

              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-150 border",
                    isSelected
                      ? "bg-white border-[#FFC83B]/80 shadow-md translate-x-1"
                      : "bg-white/70 hover:bg-white border-black/5 shadow-xs"
                  )}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors mt-0.5",
                      isSelected ? "bg-[#212328] text-[#FFC83B]" : "bg-[#F2ECE4] text-zinc-700"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-extrabold text-[#212328] tracking-tight">
                          {titleSegments.map((seg, sIdx) => (
                            seg.isHighlighted ? (
                              <mark key={sIdx} className="fuzzy-match-mark">{seg.text}</mark>
                            ) : (
                              <span key={sIdx}>{seg.text}</span>
                            )
                          ))}
                        </span>
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-[#FAF8F5] text-[9px] font-black text-zinc-700 border border-black/5">
                            {item.badge}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          • {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 font-medium line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isSelected ? (
                      <div className="flex items-center gap-1 text-[11px] font-black text-[#212328] bg-[#FFC83B] px-3 py-1.5 rounded-full shadow-xs">
                        <span>Open & Highlight</span>
                        <CornerDownLeft className="h-3 w-3" />
                      </div>
                    ) : (
                      <ArrowRight className="h-4 w-4 text-zinc-300" />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-[#F2ECE4] text-zinc-400 flex items-center justify-center mx-auto">
                <HelpCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-[#212328]">No matching components or telemetry</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Try searching for keywords like "SSN", "prompt injection", "toxicity", "minilm", "policy", or "audit".
              </p>
            </div>
          )}
        </div>

        {/* Footer Shortcut Helper Bar */}
        <div className="px-4 py-3 bg-white border-t border-black/5 flex items-center justify-between text-xs text-zinc-500 font-medium">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded-md bg-[#FAF8F5] border border-black/10 font-mono text-[10px] font-black text-[#212328]">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded-md bg-[#FAF8F5] border border-black/10 font-mono text-[10px] font-black text-[#212328]">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-black/10 font-mono text-[10px] font-black text-[#212328]">↵</kbd>
              <span>to select & highlight</span>
            </span>
          </div>
          <span className="font-bold text-[#212328]">{filteredResults.length} matching sections</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
