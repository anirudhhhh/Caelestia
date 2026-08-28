import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Network, Plus, Trash2, CheckCircle2, 
  Sparkles, ArrowRight, Server, Globe,
  RefreshCw, Code2, Copy, Check, Send, Shield, Settings2,
  Pencil, Sliders
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import type { WorkflowEndpoint } from '@/types';
import { api } from '@/lib/api';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import BorderBeam from '@/components/reactbits/BorderBeam';
import DecryptedText from '@/components/reactbits/DecryptedText';
import Magnet from '@/components/reactbits/Magnet';

const SAMPLE_PROMPTS = [
  "Can you help me check the status of my order and request a refund?",
  "Can you debug this Python asyncio memory leak with the database connection pool?",
  "What is our enterprise invoice billing cycle and payment terms for annual renewals?",
  "What are our GDPR data retention and user privacy compliance guidelines?",
];

export default function LoadBalancer() {
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<WorkflowEndpoint[]>([]);
  const [endpointPiiMap, setEndpointPiiMap] = useState<Record<string, Record<string, 'allow' | 'block'>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<WorkflowEndpoint | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Add Form State: Name, Instruction for search, and Endpoint to push
  const [formName, setFormName] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Form State
  const [editName, setEditName] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editUseCase, setEditUseCase] = useState('general');
  const [editWeight, setEditWeight] = useState(1.0);
  const [editActive, setEditActive] = useState(true);
  const [editKeywords, setEditKeywords] = useState('');

  // Live Semantic Simulator State
  const [testPrompt, setTestPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [isMatching, setIsMatching] = useState(false);

  useEffect(() => {
    loadEndpoints();
  }, []);

  const loadEndpoints = async () => {
    setIsLoading(true);
    try {
      const data = await api.getEndpoints().catch(() => []);
      setEndpoints(data);

      // Load PII configs for each endpoint in parallel
      const piiEntries = await Promise.all(
        data.map(async (ep: any) => {
          try {
            const cfg = await api.getUseCaseConfig(ep.id);
            return { id: ep.id, pii: cfg?.pii_permissions || {} };
          } catch {
            return { id: ep.id, pii: {} };
          }
        })
      );
      const newMap: Record<string, Record<string, 'allow' | 'block'>> = {};
      piiEntries.forEach(e => {
        newMap[e.id] = e.pii;
      });
      setEndpointPiiMap(newMap);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!testPrompt.trim()) {
      setMatchResults([]);
      return;
    }
    runMatchSimulation(testPrompt);
  }, [testPrompt, endpoints]);

  const runMatchSimulation = async (prompt: string) => {
    setIsMatching(true);
    try {
      const res = await api.matchEndpoint(prompt).catch(() => ({ results: [] }));
      setMatchResults(res.results || []);
    } finally {
      setIsMatching(false);
    }
  };

  const handleRegister = async () => {
    if (!formName.trim() || !formInstructions.trim() || !formEndpoint.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      const id = formName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const newEp: WorkflowEndpoint = {
        id: id,
        name: formName.trim(),
        instructions: formInstructions.trim(),
        target_model_or_url: formEndpoint.trim(),
        use_case: 'general',
        keywords: [],
        weight: 1.0,
        active: true,
      };
      await api.registerEndpoint(newEp);
      setIsRegisterOpen(false);
      // Reset form
      setFormName('');
      setFormInstructions('');
      setFormEndpoint('');
      loadEndpoints();
    } catch (e) {
      console.error('Failed to register endpoint', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEndpoint(id);
      loadEndpoints();
    } catch (e) {
      console.error('Failed to delete endpoint', e);
    }
  };

  const handleOpenEdit = (ep: WorkflowEndpoint) => {
    setEditingEndpoint(ep);
    setEditName(ep.name);
    setEditInstructions(ep.instructions);
    setEditTarget(ep.target_model_or_url || (ep as any).endpoint || '');
    setEditUseCase(ep.use_case || 'general');
    setEditWeight(ep.weight ?? 1.0);
    setEditActive(ep.active !== false);
    setEditKeywords((ep.keywords || []).join(', '));
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingEndpoint || !editName.trim() || !editInstructions.trim()) return;
    setIsSubmitting(true);
    try {
      const updated: Partial<WorkflowEndpoint> = {
        id: editingEndpoint.id,
        name: editName.trim(),
        instructions: editInstructions.trim(),
        target_model_or_url: editTarget.trim(),
        use_case: editUseCase,
        weight: Number(editWeight) || 1.0,
        active: editActive,
        keywords: editKeywords.split(',').map(k => k.trim()).filter(Boolean),
      };
      await api.updateEndpoint(editingEndpoint.id, updated);
      setIsEditOpen(false);
      setEditingEndpoint(null);
      loadEndpoints();
    } catch (err) {
      console.error('Failed to update endpoint', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const [selectedEndpointForCode, setSelectedEndpointForCode] = useState<WorkflowEndpoint | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const curlSnippet = `curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "How do I process a customer refund?"}],
    "use_case": "customer_support",
    "geography": "US"
  }'`;

  const jsSnippet = `// 1. Using Standard Fetch / Node.js
async function callSemanticRouter() {
  const response = await fetch("http://localhost:8000/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "How do I process a customer refund?" }],
      use_case: "customer_support",
      geography: "US"
    })
  });

  const data = await response.json();
  console.log("Verdict:", data.decision?.action);
  console.log("Output:", data.content);
}

// 2. Or using OpenAI SDK (Drop-in Replacement)
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "controlplane-api-key"
});

const completion = await client.chat.completions.create({
  model: "auto", // Automatically classified by 384-d Vector Router
  messages: [{ role: "user", content: "How do I process a customer refund?" }]
});
console.log(completion.choices[0].message.content);`;

  const pythonSnippet = `# 1. Using Requests / Httpx
import requests

url = "http://localhost:8000/v1/chat/completions"
payload = {
    "messages": [{"role": "user", "content": "How do I process a customer refund?"}],
    "use_case": "customer_support",
    "geography": "US"
}
response = requests.post(url, json=payload)
data = response.json()
print("Verdict:", data["decision"]["action"])
print("Response:", data["content"])

# 2. Or using OpenAI Python SDK
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="controlplane-api-key"
)

completion = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "How do I process a customer refund?"}]
)
print(completion.choices[0].message.content)`;

  const getEndpointCurl = (ep: WorkflowEndpoint) => `curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Query for ${ep.name}..."}],
    "endpoint_id": "${ep.id}",
    "use_case": "${ep.use_case}"
  }'`;

  const getEndpointJs = (ep: WorkflowEndpoint) => `// 1. Using Standard Fetch
async function sendTo${ep.id.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())}() {
  const res = await fetch("http://localhost:8000/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Query for ${ep.name}..." }],
      endpoint_id: "${ep.id}",
      use_case: "${ep.use_case}"
    })
  });
  const data = await res.json();
  console.log("Decision:", data.decision?.action);
  console.log("Content:", data.content);
}

// 2. Or using OpenAI Node SDK
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "controlplane-api-key"
});

const completion = await client.chat.completions.create({
  model: "${ep.id}", // Direct dispatch to ${ep.name}
  messages: [{ role: "user", content: "Query for ${ep.name}..." }]
});
console.log(completion.choices[0].message.content);`;

  const getEndpointPython = (ep: WorkflowEndpoint) => `# 1. Using Requests / Httpx
import requests

url = "http://localhost:8000/v1/chat/completions"
payload = {
    "messages": [{"role": "user", "content": "Query for ${ep.name}..."}],
    "endpoint_id": "${ep.id}",
    "use_case": "${ep.use_case}"
}

response = requests.post(url, json=payload)
data = response.json()
print("Verdict:", data["decision"]["action"])
print("Response:", data["content"])

# 2. Or using OpenAI Python SDK
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="controlplane-api-key"
)

completion = client.chat.completions.create(
    model="${ep.id}",
    messages=[{"role": "user", "content": "Query for ${ep.name}..."}]
)
print(completion.choices[0].message.content)`;

  return (
    <div className="h-full w-full overflow-y-auto space-y-6 pr-2 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Network className="h-4.5 w-4.5 text-amber-400" />
            </div>
            Enterprise Semantic Router & Gateway
          </h2>
          <p className="text-xs text-zinc-400 mt-1 font-medium max-w-2xl">
            Matches incoming prompts against enterprise workflow instructions, pushes filtered requests to the destination endpoint, and returns governed responses.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={loadEndpoints} disabled={isLoading} aria-label="Refresh endpoints" className="faang-btn-ghost h-9 px-3.5 gap-2 text-xs">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </Button>
          <button 
            type="button"
            className="faang-btn-primary h-9 px-4 gap-2 text-xs flex items-center justify-center cursor-pointer font-bold"
            onClick={() => setIsRegisterOpen(true)}
          >
            <Plus className="h-4 w-4" />
            <span>Add Workflow Endpoint</span>
          </button>
        </div>
      </div>

      {/* Semantic Intent Simulator (Unboxed, Integrated) */}
      <div className="p-4.5 rounded-xl border border-violet-500/25 bg-white/[0.02] space-y-3.5">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Live Semantic Routing Matcher</span>
          </div>
          <span className="faang-chip chip-violet text-[10px] font-bold">
            VECTOR MATCHER ACTIVE
          </span>
        </div>
        <p className="text-xs text-zinc-300 font-medium">
          Type any prompt to simulate how ControlPlane vector search classifies intent and assigns the target workflow endpoint.
        </p>

        <div className="space-y-3">
          <Input
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Type a test query to simulate semantic destination..."
            className="bg-white/[0.04] border-white/[0.08] h-9 text-xs rounded-full text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/30"
          />

          {/* Quick sample chips */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-bold text-zinc-400 mr-1">Sample queries:</span>
            {SAMPLE_PROMPTS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTestPrompt(p)}
                className="faang-btn-ghost px-3 py-1 text-zinc-300 text-[11px] transition-all font-medium rounded-full cursor-pointer"
              >
                {p.slice(0, 36)}...
              </button>
            ))}
          </div>

          {/* Real-time Match Scores */}
          {!testPrompt.trim() ? (
            <div className="py-6 text-center text-xs text-zinc-400 border-t border-white/[0.06] font-medium">
              Type a test prompt or click a sample query above to simulate live vector routing across endpoints.
            </div>
          ) : (
            <div className="space-y-3 pt-3 border-t border-white/[0.06]">
              {matchResults.map((res, i) => {
                const isWinner = i === 0;
                const rawScore = typeof res.score === 'number' ? res.score : 0;
                const scorePercent = Math.max(0, Math.min(100, rawScore * 100));
                
                return (
                  <div 
                    key={res.id} 
                    className={`space-y-2.5 p-3.5 rounded-xl transition-all relative overflow-hidden ${
                      isWinner
                        ? 'bg-amber-500/[0.08] border border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.12)]'
                        : 'bg-white/[0.02] border border-white/[0.07] hover:border-white/[0.12]'
                    }`}
                  >
                    {isWinner && <BorderBeam size={220} duration={8} colorFrom="#F59E0B" colorTo="#FCD34D" />}
                    <div className="flex items-center justify-between text-xs relative z-10">
                      <div className="flex items-center gap-2.5">
                        {isWinner ? (
                          <div className="h-5 w-5 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
                            <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                          </div>
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-white/[0.04] border border-white/15 flex items-center justify-center text-[10px] text-zinc-400 font-bold shrink-0">
                            {i + 1}
                          </div>
                        )}
                        <span className={`font-bold ${isWinner ? 'text-white text-sm' : 'text-zinc-300 text-xs'}`}>
                          {res.name}
                        </span>
                        {isWinner && (
                          <span className="faang-chip chip-amber text-[10px] font-bold">
                            Destination → {res.target}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-extrabold ${isWinner ? 'text-amber-400 text-sm' : 'text-zinc-400 text-xs'}`}>
                          {rawScore < 0 ? '0.0%' : `${scorePercent.toFixed(1)}% match`}
                        </span>
                      </div>
                    </div>

                    {/* Prominent High-Contrast Progress Bar */}
                    <div className="w-full bg-[#181920] h-3 rounded-full overflow-hidden border border-white/[0.1] relative p-[1.5px] shadow-inner">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ease-out relative ${
                          isWinner 
                            ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 shadow-[0_0_14px_rgba(245,158,11,0.65)]' 
                            : scorePercent > 10
                            ? 'bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-400 shadow-[0_0_10px_rgba(139,92,246,0.4)]'
                            : scorePercent > 0
                            ? 'bg-gradient-to-r from-zinc-500 to-zinc-400'
                            : 'bg-zinc-700/40'
                        }`}
                        style={{ 
                          width: `${Math.max(scorePercent, isWinner ? 6 : (scorePercent > 0 ? 3 : 0))}%` 
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Registered Endpoints Grid (Unboxed, Integrated) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Enterprise Workflow Endpoints ({endpoints.length})
          </h3>
          <span className="text-[11px] text-zinc-400 font-medium">
            Each endpoint maintains an independent PII Governance Whitelist
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {endpoints.map((ep) => {
            const piiForEp = endpointPiiMap[ep.id] || {
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
            const allowedList = Object.entries(piiForEp).filter(([_, action]) => action === 'allow').map(([k]) => k);
            const blockedList = Object.entries(piiForEp).filter(([_, action]) => action === 'block').map(([k]) => k);

            return (
              <SpotlightCard 
                key={ep.id} 
                onClick={() => handleOpenEdit(ep)}
                className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.015] flex flex-col justify-between space-y-3 hover:bg-white/[0.035] hover:border-amber-500/30 transition-all cursor-pointer group shadow-sm"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                          <Server className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                        <h4 className="font-bold text-xs text-white group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                          {ep.name}
                          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="faang-chip chip-neutral text-[9px] font-mono mt-0.5">
                          {ep.id}
                        </span>
                        {ep.active === false && (
                          <span className="faang-chip chip-crimson text-[9px] font-bold">
                            INACTIVE
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-400 hover:text-amber-300 rounded-full hover:bg-amber-500/10"
                        aria-label={`Edit endpoint ${ep.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(ep);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-400 hover:text-rose-400 rounded-full hover:bg-rose-500/10"
                        aria-label={`Delete endpoint ${ep.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(ep.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04] text-xs text-zinc-300 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Matching Instruction:</span>
                    <p className="text-[11px] text-zinc-300 leading-relaxed font-medium line-clamp-3">{ep.instructions}</p>
                  </div>

                  {/* Component PII Governance Whitelist */}
                  <div className="p-2.5 rounded-lg border border-white/[0.04] bg-white/[0.02] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-zinc-400">
                        <Shield className="h-3 w-3 text-amber-400" />
                        Scoped PII Policy
                      </span>
                      <button
                        type="button"
                        className="faang-chip chip-amber text-[9px] font-bold transition-all cursor-pointer rounded-full"
                        onClick={() => navigate(`/policies?scope=${ep.id}`)}
                      >
                        <Settings2 className="h-2.5 w-2.5 mr-1" />
                        Configure
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allowedList.slice(0, 4).map(k => (
                        <span key={k} className="faang-chip chip-emerald text-[9px]">
                          ✓ {k}
                        </span>
                      ))}
                      {blockedList.slice(0, 3).map(k => (
                        <span key={k} className="faang-chip chip-crimson text-[9px]">
                          ✕ {k}
                        </span>
                      ))}
                      {blockedList.length > 3 && (
                        <span className="faang-chip chip-neutral text-[9px]">
                          +{blockedList.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2.5 border-t border-white/[0.04] text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Send className="h-3 w-3 text-amber-400" />
                    <span className="text-[11px] font-medium text-zinc-400">Push Target:</span>
                    <span className="font-mono text-[11px] text-violet-300 font-semibold truncate max-w-[140px]">
                      {ep.target_model_or_url || (ep as any).endpoint}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6.5 px-2.5 text-[10px] gap-1 faang-btn-ghost text-zinc-300 hover:text-white rounded-full font-bold"
                    onClick={() => setSelectedEndpointForCode(ep)}
                  >
                    <Code2 className="h-3 w-3 text-violet-400" />
                    API Code
                  </Button>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      </div>

      {/* External Service Integration Guide */}
      <div className="faang-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4.5 w-4.5 text-violet-400" />
            <span className="text-sm font-bold text-white">Connect External Services to ControlPlane Gateway</span>
          </div>
          <span className="faang-chip chip-amber text-[10px]">PORT: 8000</span>
        </div>
        <p className="text-xs text-zinc-300 font-medium">
          External applications push prompts to port 8000. ControlPlane filters the input, semantically routes to the target workflow endpoint, inspects the response, and returns it.
        </p>

        <Tabs defaultValue="curl" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-[320px] bg-[#111216] p-1 rounded-full border border-white/[0.08]">
            <TabsTrigger value="curl" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">cURL</TabsTrigger>
            <TabsTrigger value="javascript" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">JavaScript</TabsTrigger>
            <TabsTrigger value="python" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">Python</TabsTrigger>
          </TabsList>

          <TabsContent value="curl" className="mt-3 relative">
            <pre className="p-4 bg-black/50 border border-white/[0.08] text-zinc-300 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed">
              {curlSnippet}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2.5 right-2.5 h-8 text-xs faang-btn-ghost px-3 text-zinc-300 hover:text-white"
              onClick={() => copyToClipboard(curlSnippet, 'curl')}
            >
              {copiedCode === 'curl' ? <Check className="h-3.5 w-3.5 text-amber-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copiedCode === 'curl' ? 'Copied' : 'Copy'}
            </Button>
          </TabsContent>

          <TabsContent value="javascript" className="mt-3 relative">
            <pre className="p-4 bg-black/50 border border-white/[0.08] text-zinc-300 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed max-h-[300px]">
              {jsSnippet}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2.5 right-2.5 h-8 text-xs faang-btn-ghost px-3 text-zinc-300 hover:text-white"
              onClick={() => copyToClipboard(jsSnippet, 'js')}
            >
              {copiedCode === 'js' ? <Check className="h-3.5 w-3.5 text-amber-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copiedCode === 'js' ? 'Copied' : 'Copy'}
            </Button>
          </TabsContent>

          <TabsContent value="python" className="mt-3 relative">
            <pre className="p-4 bg-black/50 border border-white/[0.08] text-zinc-300 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed max-h-[300px]">
              {pythonSnippet}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2.5 right-2.5 h-8 text-xs faang-btn-ghost px-3 text-zinc-300 hover:text-white"
              onClick={() => copyToClipboard(pythonSnippet, 'python')}
            >
              {copiedCode === 'python' ? <Check className="h-3.5 w-3.5 text-amber-400 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copiedCode === 'python' ? 'Copied' : 'Copy'}
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* Endpoint Specific API Code Dialog */}
      <Dialog open={!!selectedEndpointForCode} onOpenChange={(open) => !open && setSelectedEndpointForCode(null)}>
        <DialogContent className="max-w-2xl bg-[#15161B] border-white/[0.1] text-white">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Connect to {selectedEndpointForCode?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  Target workflow endpoint: <code className="text-amber-400 font-mono font-bold">{selectedEndpointForCode?.id}</code> (Pushes to {selectedEndpointForCode?.target_model_or_url || (selectedEndpointForCode as any)?.endpoint})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedEndpointForCode && (
            <Tabs defaultValue="curl" className="w-full mt-2">
              <TabsList className="grid w-full grid-cols-3 max-w-[320px] bg-[#111216] p-1 rounded-full border border-white/[0.08]">
                <TabsTrigger value="curl" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">cURL</TabsTrigger>
                <TabsTrigger value="javascript" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">JavaScript</TabsTrigger>
                <TabsTrigger value="python" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">Python</TabsTrigger>
              </TabsList>

              <TabsContent value="curl" className="mt-3 relative">
                <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2.5 right-2.5 h-8 text-xs gap-1.5 px-3 text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] rounded-lg border border-white/[0.08]"
                    onClick={() => copyToClipboard(getEndpointCurl(selectedEndpointForCode), 'ep_curl')}
                  >
                    {copiedCode === 'ep_curl' ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode === 'ep_curl' ? 'Copied' : 'Copy'}
                  </Button>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap text-zinc-200 pr-16 leading-relaxed">
                    {getEndpointCurl(selectedEndpointForCode)}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="javascript" className="mt-3 relative">
                <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2.5 right-2.5 h-8 text-xs gap-1.5 px-3 text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] rounded-lg border border-white/[0.08]"
                    onClick={() => copyToClipboard(getEndpointJs(selectedEndpointForCode), 'ep_js')}
                  >
                    {copiedCode === 'ep_js' ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode === 'ep_js' ? 'Copied' : 'Copy'}
                  </Button>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap text-zinc-200 pr-16 leading-relaxed max-h-[300px] overflow-y-auto">
                    {getEndpointJs(selectedEndpointForCode)}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="python" className="mt-3 relative">
                <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2.5 right-2.5 h-8 text-xs gap-1.5 px-3 text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] rounded-lg border border-white/[0.08]"
                    onClick={() => copyToClipboard(getEndpointPython(selectedEndpointForCode), 'ep_python')}
                  >
                    {copiedCode === 'ep_python' ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode === 'ep_python' ? 'Copied' : 'Copy'}
                  </Button>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap text-zinc-200 pr-16 leading-relaxed max-h-[300px] overflow-y-auto">
                    {getEndpointPython(selectedEndpointForCode)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Enterprise Endpoint Dialog (Refined & Un-cluttered) */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[460px] p-5 bg-[#15161B] border border-white/[0.09] text-white rounded-2xl shadow-2xl">
          <DialogHeader className="space-y-1 pb-1">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <Network className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <DialogTitle className="text-sm font-bold text-white tracking-tight">Add Enterprise Endpoint</DialogTitle>
            </div>
            <DialogDescription className="text-[11px] text-zinc-400 leading-relaxed font-medium">
              Register a downstream workflow endpoint with semantic matching instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 pb-1">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                1. Workflow Name
              </label>
              <Input
                placeholder="e.g. Customer Support & Refund Workflow"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-8 text-xs bg-black/50 border-white/[0.08] text-white placeholder:text-zinc-500 rounded-lg focus-visible:ring-1 focus-visible:ring-white/30"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                2. Semantic Match Instruction
              </label>
              <Textarea
                placeholder="Describe what tasks, queries, and intents this workflow handles. The vector router uses this instruction to match incoming prompts."
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                className="text-xs min-h-[72px] bg-black/50 border-white/[0.08] text-white placeholder:text-zinc-500 rounded-lg p-2.5 leading-relaxed focus-visible:ring-1 focus-visible:ring-white/30 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                3. Push Target Endpoint URL
              </label>
              <Input
                placeholder="e.g. http://localhost:8006/complete"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                className="h-8 font-mono text-[11px] bg-black/50 border-white/[0.08] text-violet-300 placeholder:text-zinc-500 rounded-lg focus-visible:ring-1 focus-visible:ring-white/30"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-white/[0.06] flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="faang-btn-ghost h-7.5 px-3 text-xs rounded-lg" onClick={() => setIsRegisterOpen(false)}>
              Cancel
            </Button>
            <button 
              type="button" 
              className="faang-btn-primary text-xs px-3.5 h-7.5 font-bold flex items-center justify-center cursor-pointer rounded-lg disabled:opacity-50"
              onClick={handleRegister} 
              disabled={isSubmitting || !formName || !formInstructions || !formEndpoint}
            >
              {isSubmitting ? 'Adding...' : 'Add Endpoint'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Enterprise Endpoint Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[480px] p-5 bg-[#15161B] border border-white/[0.09] text-white rounded-2xl shadow-2xl">
          <DialogHeader className="space-y-1 pb-1">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Pencil className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-white tracking-tight">
                  Edit Workflow Endpoint
                </DialogTitle>
                <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                  ID: {editingEndpoint?.id}
                </div>
              </div>
            </div>
            <DialogDescription className="text-[11px] text-zinc-400 leading-relaxed font-medium">
              Update semantic matching instructions, destination push target, weight, and active status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 pb-1">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                1. Workflow Name
              </label>
              <Input
                placeholder="Workflow display name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-xs bg-black/50 border-white/[0.08] text-white placeholder:text-zinc-500 rounded-lg focus-visible:ring-1 focus-visible:ring-white/30"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                2. Semantic Match Instruction
              </label>
              <Textarea
                placeholder="Describe queries and tasks to route to this endpoint..."
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                className="text-xs min-h-[72px] bg-black/50 border-white/[0.08] text-white placeholder:text-zinc-500 rounded-lg p-2.5 leading-relaxed focus-visible:ring-1 focus-visible:ring-white/30 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                3. Push Target (Model ID or URL)
              </label>
              <Input
                placeholder="e.g. gemini-3.5-flash-lite or http://localhost:8099/generate"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                className="h-8 font-mono text-[11px] bg-black/50 border-white/[0.08] text-violet-300 placeholder:text-zinc-500 rounded-lg focus-visible:ring-1 focus-visible:ring-white/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Keywords (Optional)
                </label>
                <Input
                  placeholder="e.g. refund, billing, payment"
                  value={editKeywords}
                  onChange={(e) => setEditKeywords(e.target.value)}
                  className="h-8 text-xs bg-black/50 border-white/[0.08] text-white placeholder:text-zinc-500 rounded-lg focus-visible:ring-1 focus-visible:ring-white/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Routing Weight
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10.0"
                  value={editWeight}
                  onChange={(e) => setEditWeight(parseFloat(e.target.value) || 1.0)}
                  className="h-8 text-xs bg-black/50 border-white/[0.08] text-white placeholder:text-zinc-500 rounded-lg focus-visible:ring-1 focus-visible:ring-white/30"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-white/[0.06] mt-1">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white block">Active in Load Balancer</span>
                <span className="text-[10px] text-zinc-400">When disabled, queries bypass this endpoint</span>
              </div>
              <Switch
                checked={editActive}
                onCheckedChange={setEditActive}
              />
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-white/[0.06] flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="faang-btn-ghost h-7.5 px-3 text-xs rounded-lg" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <button 
              type="button" 
              className="faang-btn-primary text-xs px-3.5 h-7.5 font-bold flex items-center justify-center cursor-pointer rounded-lg disabled:opacity-50"
              onClick={handleSaveEdit} 
              disabled={isSubmitting || !editName || !editInstructions}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
