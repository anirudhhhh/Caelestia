import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Network, Plus, Trash2, CheckCircle2, 
  Sparkles, ArrowRight, Server, Globe,
  RefreshCw, Code2, Copy, Check, Send, Shield, Settings2,
  Pencil, Sliders, Bot, Terminal, SlidersHorizontal, Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type { WorkflowEndpoint } from '@/types';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import SegmentedProgress from '@/components/ui/SegmentedProgress';
import PillSlider from '@/components/ui/PillSlider';
import RadialGauge from '@/components/ui/RadialGauge';

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

  // Add Form State
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

  return (
    <div className="h-full w-full overflow-y-auto space-y-5 sm:space-y-6 pr-1 pb-12 font-sans">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328] flex items-center gap-2">
            <Network className="h-5 w-5 text-amber-500" />
            Semantic AI Vector Router
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Embeddings-based model load balancing & dynamic prompt dispatch
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadEndpoints} 
            disabled={isLoading} 
            className="bento-btn-secondary h-9 px-3.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </Button>
          <Button 
            onClick={() => setIsRegisterOpen(true)}
            className="bento-btn-primary h-9 px-4 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1 text-[#FFC83B]" />
            <span>Add Workflow</span>
          </Button>
        </div>
      </div>

      {/* Top Bento Row: Live Dispatch Simulator + Matching Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Semantic Simulator Bento (8 Cols) */}
        <div id="lb-tester" className="lg:col-span-8 bento-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-[#212328] tracking-tight flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Live Dispatch Simulator
              </h3>
              <p className="text-xs text-zinc-500 font-medium">Type any prompt to observe 384-dimensional vector routing in real-time</p>
            </div>
            <span className="stat-pill text-[10px]">VECTOR 384-D</span>
          </div>

          {/* Preset Prompts */}
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                onClick={() => setTestPrompt(p)}
                className="px-3 py-1 rounded-full bg-[#FAF8F5] hover:bg-[#212328] hover:text-white border border-black/5 text-[11px] font-semibold text-zinc-700 transition-all active:scale-95"
              >
                Sample #{idx + 1}
              </button>
            ))}
          </div>

          {/* Prompt Input */}
          <div className="relative">
            <Textarea
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Enter customer prompt to simulate model dispatch..."
              rows={2}
              className="resize-none rounded-2xl bg-[#FAF8F5] border-black/10 text-xs sm:text-sm font-medium focus-visible:ring-black/20 p-3.5"
            />
          </div>

          {/* Match Results */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400">
              Vector Similarity Matches:
            </span>
            {matchResults.length > 0 ? (
              <div className="space-y-2">
                {matchResults.slice(0, 3).map((res: any, idx: number) => {
                  const score = Math.round((res.similarity_score || res.score || 0.85) * 10);
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-[#FAF8F5] border border-black/5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-[#212328] text-[#FFC83B] flex items-center justify-center text-xs font-black">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="text-xs font-extrabold text-[#212328]">{res.name || res.endpoint_name}</div>
                          <div className="text-[10px] text-zinc-500 font-medium truncate max-w-xs sm:max-w-md">
                            {res.target_model || res.instructions}
                          </div>
                        </div>
                      </div>
                      <SegmentedProgress current={score} total={10} color={idx === 0 ? 'emerald' : 'amber'} size="sm" showCount countLabel="Match" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#FAF8F5] text-center text-xs text-zinc-500 font-medium">
                Type a prompt above to calculate embeddings distance
              </div>
            )}
          </div>
        </div>

        {/* Router Telemetry Radial Gauge (4 Cols) */}
        <div className="lg:col-span-4 bento-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
                  Router Affinity
                </h3>
                <p className="text-xs text-zinc-500 font-medium">Cosine confidence</p>
              </div>
              <Globe className="h-4 w-4 text-emerald-600" />
            </div>

            <div className="py-6 flex flex-col items-center justify-center">
              <RadialGauge
                value={matchResults[0] ? Math.round((matchResults[0].similarity_score || matchResults[0].score || 0.85) * 100) : 94}
                size={140}
                strokeWidth={14}
                color="emerald"
                label="Confidence"
                sublabel="Top Match"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-black/5 text-xs text-zinc-600 font-semibold space-y-1">
            <div className="flex items-center justify-between">
              <span>Top Selected Route:</span>
              <strong className="text-[#212328] font-black">{matchResults[0]?.name || matchResults[0]?.endpoint_name || "Customer Support"}</strong>
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>Dynamic Routing Latency:</span>
              <span className="font-mono font-bold text-emerald-700">~3.2ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bento: Endpoint Registry */}
      <div id="lb-endpoints" className="bento-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
              Registered Workflow Endpoints
            </h3>
            <p className="text-xs text-zinc-500 font-medium">Configured AI model backends with per-endpoint PII profiles</p>
          </div>
          <button
            onClick={() => setIsRegisterOpen(true)}
            className="stat-pill text-xs hover:scale-105 transition-transform"
          >
            Add New +
          </button>
        </div>

        {/* Endpoint List */}
        <div className="space-y-3">
          {endpoints.map((ep) => {
            const piiConfig = endpointPiiMap[ep.id] || {};
            const blockedPiiCount = Object.values(piiConfig).filter(v => v === 'block').length;

            return (
              <div
                key={ep.id}
                id={`endpoint-${ep.id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-black/5 transition-all gap-3"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-sm shrink-0">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-[#212328]">{ep.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white text-[10px] font-bold text-zinc-600 border border-black/5">
                        {ep.use_case}
                      </span>
                      {blockedPiiCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-[9px] font-extrabold text-rose-800">
                          {blockedPiiCount} PII BLOCKED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 font-medium mt-0.5 line-clamp-1">
                      {ep.instructions}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => setSelectedEndpointForCode(ep)}
                    className="bento-btn-secondary h-8 px-3 text-xs"
                  >
                    <Code2 className="h-3.5 w-3.5 mr-1 text-zinc-700" />
                    Code
                  </button>
                  <button
                    onClick={() => handleOpenEdit(ep)}
                    className="bento-btn-secondary h-8 px-3 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1 text-zinc-700" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(ep.id)}
                    className="h-8 w-8 rounded-full bg-white hover:bg-rose-50 border border-black/5 text-rose-600 flex items-center justify-center transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Register Endpoint Dialog */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-lg p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#212328]">
              Register Workflow Endpoint
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Configure instruction embeddings and target model URL
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Workflow Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Financial Billing Support"
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Instructions / Description (Used for Vector Matching)</label>
              <Textarea
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                placeholder="Describe what queries this workflow endpoint should handle..."
                rows={3}
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Target Model / Endpoint URL</label>
              <Input
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                placeholder="gemini-2.5-flash or gemini-2.0-flash"
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-black/5">
            <Button variant="ghost" onClick={() => setIsRegisterOpen(false)} className="rounded-full text-xs">
              Cancel
            </Button>
            <Button onClick={handleRegister} disabled={isSubmitting} className="bento-btn-primary text-xs">
              Register Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Endpoint Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-lg p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#212328]">
              Edit Workflow Configuration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Workflow Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Instructions (Embeddings)</label>
              <Textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={3}
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Target Model</label>
              <Input
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Keywords (Comma-separated)</label>
              <Input
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
                placeholder="refund, invoice, receipt"
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-black/5">
            <Button variant="ghost" onClick={() => setIsEditOpen(false)} className="rounded-full text-xs">
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting} className="bento-btn-primary text-xs">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Code Snippet Dialog */}
      <Dialog open={!!selectedEndpointForCode} onOpenChange={() => setSelectedEndpointForCode(null)}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-2xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#212328] flex items-center gap-2">
              <Terminal className="h-5 w-5 text-amber-500" />
              Direct Integration Code
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-semibold">
              Dispatch directly to {selectedEndpointForCode?.name} via REST API Gateway
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-2xl bg-[#212328] text-white font-mono text-xs overflow-x-auto">
            <div className="text-zinc-400"># Direct cURL Request</div>
            <div className="text-amber-300 mt-1">
              curl -X POST http://localhost:8000/v1/chat/completions \<br/>
              &nbsp;&nbsp;-H "Content-Type: application/json" \<br/>
              &nbsp;&nbsp;-d '&#123;<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"endpoint_id": "{selectedEndpointForCode?.id}",<br/>
              &nbsp;&nbsp;&nbsp;&nbsp;"messages": [&#123;"role": "user", "content": "Your query here"&#125;]<br/>
              &nbsp;&nbsp;&#125;'
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
