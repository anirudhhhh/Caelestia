import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Network, Plus, Trash2, CheckCircle2, 
  Sparkles, ArrowRight, Server, Globe,
  RefreshCw, Code2, Copy, Check, Send, Shield, Settings2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { WorkflowEndpoint } from '@/types';
import { api } from '@/lib/api';

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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form State: Name, Instruction for search, and Endpoint to push
  const [formName, setFormName] = useState('');
  const [formInstructions, setFormInstructions] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const pythonSnippet = `import requests

url = "http://localhost:8000/v1/chat/completions"
payload = {
    "messages": [{"role": "user", "content": "How do I process a customer refund?"}],
    "use_case": "customer_support",
    "geography": "US"
}
response = requests.post(url, json=payload)
data = response.json()
print("Verdict:", data["decision"]["action"])
print("Response:", data["content"])`;

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

      {/* Semantic Intent Simulator */}
      <div className="faang-card p-5 space-y-4 border-violet-500/30 bg-gradient-to-b from-violet-500/[0.08] to-[#15161B]">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
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
            className="bg-black/40 border-white/[0.1] h-10 text-sm rounded-xl text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/30"
          />

          {/* Quick sample chips */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-zinc-400 mr-1">Sample queries:</span>
            {SAMPLE_PROMPTS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTestPrompt(p)}
                className="faang-btn-ghost px-3 py-1 text-zinc-300 text-xs transition-all font-medium"
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
            <div className="space-y-3 pt-3 border-t border-white/[0.07]">
              {matchResults.map((res, i) => {
                const isWinner = i === 0;
                return (
                  <div key={res.id} className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/[0.06]">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {isWinner ? (
                          <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0" />
                        ) : (
                          <div className="w-4" />
                        )}
                        <span className={`font-bold ${isWinner ? 'text-white text-sm' : 'text-zinc-400'}`}>
                          {res.name}
                        </span>
                        {isWinner && (
                          <span className="faang-chip chip-amber text-[10px] font-bold">
                            Destination → {res.target}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-extrabold ${isWinner ? 'text-amber-400 text-sm' : 'text-zinc-400'}`}>
                          {(res.score * 100).toFixed(1)}% match
                        </span>
                      </div>
                    </div>
                    {/* Multi-color Progress Bar */}
                    <div className="w-full bg-black/60 h-2 rounded-full overflow-hidden p-0.5 border border-white/[0.04]">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isWinner 
                            ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]' 
                            : 'bg-zinc-700'
                        }`}
                        style={{ width: `${Math.max(res.score * 100, 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Registered Endpoints Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Enterprise Workflow Endpoints ({endpoints.length})
          </h3>
          <span className="text-xs text-zinc-400 font-medium">
            Each endpoint maintains an independent PII Governance Whitelist
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              <div key={ep.id} className="faang-card p-5 flex flex-col justify-between space-y-4 hover:border-white/[0.18]">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                          <Server className="h-4 w-4 text-amber-400" />
                        </div>
                        <h4 className="font-bold text-sm text-white">{ep.name}</h4>
                      </div>
                      <span className="faang-chip chip-neutral text-[10px] font-mono mt-1">
                        {ep.id}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-400 hover:text-rose-400 rounded-full hover:bg-rose-500/10"
                      aria-label={`Delete endpoint ${ep.name}`}
                      onClick={() => handleDelete(ep.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="bg-black/40 p-3 rounded-xl border border-white/[0.06] text-xs text-zinc-300 space-y-1">
                    <span className="font-bold text-zinc-200">Semantic Matching Instruction:</span>
                    <p className="text-xs text-zinc-300 leading-relaxed font-medium">{ep.instructions}</p>
                  </div>

                  {/* Component PII Governance Whitelist */}
                  <div className="p-3 rounded-xl border border-white/[0.07] bg-black/30 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1.5 text-zinc-200">
                        <Shield className="h-3.5 w-3.5 text-amber-400" />
                        Scoped PII Policy Matrix
                      </span>
                      <button
                        type="button"
                        className="faang-chip chip-amber font-bold transition-all cursor-pointer"
                        onClick={() => navigate(`/policies?scope=${ep.id}`)}
                      >
                        <Settings2 className="h-3 w-3 mr-1" />
                        Configure Whitelist
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allowedList.slice(0, 4).map(k => (
                        <span key={k} className="faang-chip chip-emerald text-[10px]">
                          ✓ {k}
                        </span>
                      ))}
                      {blockedList.slice(0, 3).map(k => (
                        <span key={k} className="faang-chip chip-crimson text-[10px]">
                          ✕ {k}
                        </span>
                      ))}
                      {blockedList.length > 3 && (
                        <span className="faang-chip chip-neutral text-[10px]">
                          +{blockedList.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-3 border-t border-white/[0.06] text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Send className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-zinc-300">Pushes to Target:</span>
                  </div>
                  <span className="font-mono text-xs text-violet-400 font-bold truncate max-w-[200px]">
                    {ep.target_model_or_url || (ep as any).endpoint}
                  </span>
                </div>
              </div>
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
          <TabsList className="grid w-full grid-cols-2 max-w-[220px] bg-[#111216] p-1 rounded-full border border-white/[0.08]">
            <TabsTrigger value="curl" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">cURL</TabsTrigger>
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
          <TabsContent value="python" className="mt-3 relative">
            <pre className="p-4 bg-black/50 border border-white/[0.08] text-zinc-300 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed">
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

      {/* Add Enterprise Endpoint Dialog */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[500px] bg-[#15161B] border-white/[0.1] text-white">
          <DialogHeader>
            <DialogTitle className="text-white font-bold">Add Enterprise Endpoint</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Register a downstream workflow with its name, instruction for semantic search, and the destination endpoint to push requests to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-bold mb-1 block text-zinc-300">1. Enterprise Workflow Name</label>
              <Input
                placeholder="e.g. Customer Support & Refund Workflow"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="text-xs bg-black/40 border-white/[0.1] text-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block text-zinc-300">
                2. Instruction for Search
              </label>
              <Textarea
                placeholder="Describe what tasks, queries, and intents this workflow handles. The Load Balancer uses this instruction to match incoming prompts."
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                className="text-xs min-h-[90px] bg-black/40 border-white/[0.1] text-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block text-zinc-300">
                3. Endpoint to Push Request To
              </label>
              <Input
                placeholder="e.g. http://localhost:8006/complete or https://api.mycorp.internal/orders/process"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                className="font-mono text-xs bg-black/40 border-white/[0.1] text-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="faang-btn-ghost text-xs" onClick={() => setIsRegisterOpen(false)}>
              Cancel
            </Button>
            <button 
              type="button" 
              className="faang-btn-primary text-xs px-4 h-9 font-bold flex items-center justify-center cursor-pointer"
              onClick={handleRegister} 
              disabled={isSubmitting || !formName || !formInstructions || !formEndpoint}
            >
              {isSubmitting ? 'Adding...' : 'Add Endpoint'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
