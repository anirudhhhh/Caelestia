import { useState, useEffect } from 'react';
import { 
  Network, Plus, Trash2, CheckCircle2, 
  Sparkles, ArrowRight, Server, Globe,
  RefreshCw, Code2, Copy, Check, Send
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
  const [endpoints, setEndpoints] = useState<WorkflowEndpoint[]>([]);
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
    <div className="h-[calc(100vh-8.5rem)] flex flex-col gap-5 min-h-0 overflow-y-auto pr-1 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Enterprise Load Balancer & Semantic Router
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Matches incoming prompts against enterprise workflow instructions, pushes filtered requests to the destination endpoint, and returns governed responses.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadEndpoints} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setIsRegisterOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Enterprise Endpoint
          </Button>
        </div>
      </div>

      {/* Semantic Intent Simulator */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              Live Semantic Routing Matcher
            </span>
            <Badge variant="outline" className="bg-background text-[10px]">
              Intent Matching Active
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Type any prompt to see which enterprise workflow instruction matches best and where the filtered request will be pushed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Type a test query to simulate semantic destination..."
              className="bg-background"
            />
          </div>

          {/* Quick sample chips */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-muted-foreground mr-1">Sample queries:</span>
            {SAMPLE_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => setTestPrompt(p)}
                className="text-[11px] px-2 py-0.5 rounded-full bg-background border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                {p.slice(0, 35)}...
              </button>
            ))}
          </div>

          {/* Real-time Match Scores */}
          {!testPrompt.trim() ? (
            <div className="py-6 text-center text-xs text-muted-foreground border-t border-border/40 font-mono">
              Type a test prompt or click a sample query above to simulate live vector routing across endpoints.
            </div>
          ) : (
            <div className="space-y-2.5 pt-2 border-t border-primary/10">
              {matchResults.map((res, i) => {
                const isWinner = i === 0;
                return (
                  <div key={res.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {isWinner ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="w-3.5" />
                        )}
                        <span className={`font-medium ${isWinner ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                          {res.name}
                        </span>
                        {isWinner && (
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 text-[10px] py-0 px-1.5 border-emerald-500/20">
                            Pushes To → {res.target}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-medium ${isWinner ? 'text-emerald-500 font-semibold' : 'text-muted-foreground'}`}>
                          {(res.score * 100).toFixed(1)}% match
                        </span>
                      </div>
                    </div>
                    {/* Custom Pixel-Perfect Progress Bar */}
                    <div className="w-full bg-secondary/80 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isWinner 
                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' 
                            : 'bg-muted-foreground/30'
                        }`}
                        style={{ width: `${Math.max(res.score * 100, 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registered Endpoints Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Enterprise Workflow Endpoints ({endpoints.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {endpoints.map((ep) => (
            <Card key={ep.id} className="border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-primary" />
                      <h4 className="font-medium text-sm">{ep.name}</h4>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(ep.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="bg-muted/40 p-2.5 rounded text-xs text-muted-foreground space-y-1">
                  <span className="font-medium text-foreground">Instruction for Search: </span>
                  <p className="text-xs text-foreground/80 mt-0.5">{ep.instructions}</p>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Send className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-medium text-foreground">Pushes to Endpoint:</span>
                  </div>
                  <span className="font-mono text-[11px] text-primary truncate max-w-[240px]">
                    {ep.target_model_or_url || (ep as any).endpoint}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* External Service Integration Guide */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Code2 className="h-4 w-4 text-primary" />
            Connect External Services to ControlPlane Gateway
          </CardTitle>
          <CardDescription className="text-xs">
            External applications push prompts to port 8000. ControlPlane filters the input, semantically routes to the target workflow endpoint, inspects the response, and returns it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="curl" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-[240px]">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3 relative">
              <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-md text-xs font-mono overflow-x-auto">
                {curlSnippet}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2 h-7 text-xs bg-background/80"
                onClick={() => copyToClipboard(curlSnippet, 'curl')}
              >
                {copiedCode === 'curl' ? <Check className="h-3 w-3 text-emerald-500 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copiedCode === 'curl' ? 'Copied' : 'Copy'}
              </Button>
            </TabsContent>
            <TabsContent value="python" className="mt-3 relative">
              <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-md text-xs font-mono overflow-x-auto">
                {pythonSnippet}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2 h-7 text-xs bg-background/80"
                onClick={() => copyToClipboard(pythonSnippet, 'python')}
              >
                {copiedCode === 'python' ? <Check className="h-3 w-3 text-emerald-500 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copiedCode === 'python' ? 'Copied' : 'Copy'}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Enterprise Endpoint Dialog */}
      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Enterprise Endpoint</DialogTitle>
            <DialogDescription className="text-xs">
              Register a downstream workflow with its name, instruction for semantic search, and the destination endpoint to push requests to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium mb-1 block">1. Enterprise Workflow Name</label>
              <Input
                placeholder="e.g. Customer Support & Refund Workflow"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">
                2. Instruction for Search
              </label>
              <Textarea
                placeholder="Describe what tasks, queries, and intents this workflow handles. The Load Balancer uses this instruction to match incoming prompts."
                value={formInstructions}
                onChange={(e) => setFormInstructions(e.target.value)}
                className="text-xs min-h-[90px]"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">
                3. Endpoint to Push Request To
              </label>
              <Input
                placeholder="e.g. http://localhost:8006/complete or https://api.mycorp.internal/orders/process"
                value={formEndpoint}
                onChange={(e) => setFormEndpoint(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsRegisterOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRegister} disabled={isSubmitting || !formName || !formInstructions || !formEndpoint}>
              {isSubmitting ? 'Adding...' : 'Add Endpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
