import { useState, useRef, useEffect } from "react";
import {
  Send,
  ShieldCheck,
  Activity,
  Cpu,
  Loader2,
  Network,
  Code2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Bot
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { UseCase, Geography, InteractionEnvelope, WorkflowEndpoint } from "@/types";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "controlplane_playground_session";
const DEFAULT_GREETING: Message = {
  role: "assistant",
  content:
    "Hello! I am ready to assist you. My responses and your inputs are protected by ControlPlane.ai.",
};

function loadPersisted() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const persisted = loadPersisted();

export default function Playground() {
  const [messages, setMessages] = useState<Message[]>(
    persisted?.messages ?? [DEFAULT_GREETING],
  );
  const [input, setInput] = useState("");
  const [useCase, setUseCase] = useState<UseCase>(
    persisted?.useCase ?? "customer_support",
  );
  const [geography, setGeography] = useState<Geography>(
    persisted?.geography ?? "US",
  );
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>("auto");
  const [endpoints, setEndpoints] = useState<WorkflowEndpoint[]>([]);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [latestInteraction, setLatestInteraction] =
    useState<InteractionEnvelope | null>(persisted?.latestInteraction ?? null);
  const [sessionId, setSessionId] = useState<string | null>(
    persisted?.sessionId ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEndpoints();
  }, []);

  const loadEndpoints = async () => {
    try {
      const eps = await api.getEndpoints().catch(() => []);
      setEndpoints(eps);
    } catch {}
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          messages,
          useCase,
          geography,
          latestInteraction,
          sessionId,
        }),
      );
    } catch {}
  }, [messages, useCase, geography, latestInteraction, sessionId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const requestMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const data = await api.sendChat({
        messages: requestMessages,
        use_case: useCase,
        geography: geography,
        model: selectedEndpoint !== "auto" ? selectedEndpoint : undefined,
        session_id: sessionId ?? undefined,
      });

      if (data.session_id && data.session_id !== sessionId)
        setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant" as const,
          content: data.content || "No response received.",
        },
      ]);
      setLatestInteraction({
        interaction_id: data.interaction_id,
        timestamp: new Date().toISOString(),
        use_case: useCase,
        geography: geography,
        direction: "output",
        payload: { content: data.content },
        checks: (data.checks_summary || []).map((c: any) => ({
          check_name: c.check_name,
          engine: c.engine || "unknown",
          verdict: c.verdict,
          score: c.score,
          latency_ms: c.latency_ms || 0,
        })),
        risk_assessment: {
          tier: data.risk?.tier || "low",
          confidence: data.risk?.confidence || 0,
          blast_radius: "low",
          reasoning: "",
        },
        decision: {
          action: data.decision?.action || "allow",
          reason: data.decision?.reason || "",
          confidence: data.decision?.confidence || 0,
          policy_version: data.decision?.policy_version || "",
        },
        latency_breakdown: { total: data.latency_ms || 0 },
        model_used: data.model_used,
      } as any);
    } catch (err: any) {
      setError(err.message || "An error occurred during communication.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getDecisionColor = (action?: string) => {
    switch (action) {
      case "allow":
        return "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20";
      case "block":
        return "bg-rose-500/10 text-rose-500 hover:bg-rose-500/20";
      case "flag":
        return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20";
      case "escalate":
        return "bg-violet-500/10 text-violet-500 hover:bg-violet-500/20";
      default:
        return "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20";
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case "pass":
        return "bg-emerald-500";
      case "warn":
        return "bg-amber-500";
      case "fail":
        return "bg-rose-500";
      default:
        return "bg-slate-500";
    }
  };

  const handleClearSession = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setMessages([DEFAULT_GREETING]);
    setLatestInteraction(null);
    setSessionId(null);
    setError(null);
  };

  const copyCode = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const curlCode = `curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "How do I update billing settings?"}
    ],
    "use_case": "${useCase}",
    "geography": "${geography}"
  }'`;

  return (
    <div className="flex h-full gap-6">
      {/* Left Panel: Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0 bg-card rounded-lg border border-border overflow-hidden shadow-sm">
        <div className="p-3 border-b border-border bg-muted/30 flex flex-wrap gap-3 items-center">
          <div className="flex flex-wrap gap-2 items-center flex-1">
            {/* Endpoint / Route Selector */}
            <Select
              value={selectedEndpoint}
              onValueChange={setSelectedEndpoint}
            >
              <SelectTrigger className="w-[210px] text-xs font-medium">
                <SelectValue placeholder="Destination Endpoint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <Sparkles className="h-3.5 w-3.5" />
                    Auto (Semantic LB)
                  </span>
                </SelectItem>
                {endpoints.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    <span className="flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      {ep.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Use Case Selector */}
            <Select
              value={useCase}
              onValueChange={(v) => setUseCase(v as UseCase)}
            >
              <SelectTrigger className="w-[160px] text-xs">
                <SelectValue placeholder="Use Case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_support">Customer Support</SelectItem>
                <SelectItem value="internal_copilot">Internal Copilot</SelectItem>
                <SelectItem value="decision_support">Decision Support</SelectItem>
              </SelectContent>
            </Select>

            {/* Geography Selector */}
            <Select
              value={geography}
              onValueChange={(v) => setGeography(v as Geography)}
            >
              <SelectTrigger className="w-[90px] text-xs">
                <SelectValue placeholder="Geo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="US">US</SelectItem>
                <SelectItem value="EU">EU</SelectItem>
                <SelectItem value="IN">IN</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setIsApiModalOpen(true)}
            >
              <Code2 className="h-3.5 w-3.5 mr-1" />
              Connect API
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8"
              onClick={handleClearSession}
            >
              New session
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm border border-border text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted border border-border text-foreground max-w-[80%] rounded-lg rounded-bl-sm p-4 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Analyzing via ControlPlane.ai...
                  </span>
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-start">
                <div className="bg-destructive/10 border border-destructive/20 text-destructive max-w-[80%] rounded-lg rounded-bl-sm p-3">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>
        </ScrollArea>

        <div className="p-4 bg-background border-t border-border">
          <div className="max-w-3xl mx-auto relative flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your prompt here... (Press Enter to send)"
              className="min-h-[80px] max-h-[200px] resize-y bg-background"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="mb-1"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel: Analysis */}
      <div className="w-[450px] flex flex-col gap-4 overflow-y-auto">
        {!latestInteraction ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center border border-dashed border-border rounded-lg bg-card/50">
            <ShieldCheck className="h-12 w-12 mb-4 opacity-20" />
            <h3 className="text-lg font-medium mb-2">No Analysis Yet</h3>
            <p className="text-sm text-muted-foreground max-w-[250px]">
              Send a message to see real-time Guardrails, Routing, and Policy
              checks in action.
            </p>
          </div>
        ) : (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-3 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Decision Result
                  </CardTitle>
                  <Badge
                    className={getDecisionColor(
                      latestInteraction.decision.action,
                    )}
                  >
                    {latestInteraction.decision.action.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <p className="text-sm font-medium mb-1">Reason:</p>
                <p className="text-sm text-muted-foreground">
                  {latestInteraction.decision.reason}
                </p>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Confidence
                    </p>
                    <p className="text-sm font-medium">
                      {(latestInteraction.decision.confidence * 100).toFixed(1)}
                      %
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Risk Tier
                    </p>
                    <Badge
                      variant="outline"
                      className={`
                      ${latestInteraction.risk_assessment.tier === "high" ? "border-rose-500/50 text-rose-500" : ""}
                      ${latestInteraction.risk_assessment.tier === "medium" ? "border-amber-500/50 text-amber-500" : ""}
                      ${latestInteraction.risk_assessment.tier === "low" ? "border-emerald-500/50 text-emerald-500" : ""}
                    `}
                    >
                      {latestInteraction.risk_assessment.tier.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="checks" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="checks">Checks</TabsTrigger>
                <TabsTrigger value="trace">Trace</TabsTrigger>
                <TabsTrigger value="json">Raw JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="checks" className="mt-4 space-y-4">
                {latestInteraction.checks.map((check, idx) => (
                  <Card key={idx} className="border-border shadow-none">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${getVerdictColor(check.verdict)}`}
                          />
                          <span className="text-sm font-medium">
                            {check.check_name}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-muted/50 font-mono"
                        >
                          {check.engine}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress
                          value={check.score * 100}
                          className="h-1.5 flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-8 text-right font-mono">
                          {check.score.toFixed(2)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="trace" className="mt-4 space-y-4">
                <Card className="border-border shadow-none">
                  <CardHeader className="p-3 border-b border-border bg-muted/20">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Latency Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-3">
                    {Object.entries(latestInteraction.latency_breakdown).map(
                      ([stage, ms]) => (
                        <div
                          key={stage}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground capitalize">
                            {stage.replace("_", " ")}
                          </span>
                          <span className="font-mono">{ms}ms</span>
                        </div>
                      ),
                    )}
                    <div className="pt-2 border-t border-border flex items-center justify-between text-sm font-medium">
                      <span>Total Processing</span>
                      <span className="font-mono">
                        {Object.values(
                          latestInteraction.latency_breakdown,
                        ).reduce((a, b) => a + b, 0)}
                        ms
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border shadow-none">
                  <CardHeader className="p-3 border-b border-border bg-muted/20">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Network className="h-4 w-4 text-primary" />
                      Routing & Model Destination
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Destination:</span>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {latestInteraction.model_used || "google/gemini-2.5-flash"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Mode:</span>
                      <span className="font-medium text-[11px]">
                        {selectedEndpoint === "auto" ? "Semantic Load Balancer" : "Explicit Target"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Governed By:</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        Policy {latestInteraction.decision.policy_version || "default"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="json" className="mt-4">
                <Card className="border-border shadow-none bg-zinc-950">
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      <pre className="p-4 text-xs font-mono text-zinc-300">
                        {JSON.stringify(latestInteraction, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Connect External API Modal */}
      <Dialog open={isApiModalOpen} onOpenChange={setIsApiModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              Connect External Service to ControlPlane.ai
            </DialogTitle>
            <DialogDescription className="text-xs">
              Send requests from your backend microservices, web apps, or autonomous agents to receive governed safety checks and semantic load balancing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded border border-border">
              <span className="font-medium text-foreground">Ingress Gateway: </span>
              <code className="font-mono text-primary">POST http://localhost:8000/v1/chat/completions</code>
            </div>

            <Tabs defaultValue="curl" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="curl">cURL Command</TabsTrigger>
                <TabsTrigger value="python">Python Requests</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-3 relative">
                <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-md text-xs font-mono overflow-x-auto">
                  {curlCode}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2 h-7 text-xs bg-background/80"
                  onClick={() => copyCode(curlCode, 'curl')}
                >
                  {copiedSnippet === 'curl' ? <Check className="h-3 w-3 text-emerald-500 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copiedSnippet === 'curl' ? 'Copied' : 'Copy'}
                </Button>
              </TabsContent>
              <TabsContent value="python" className="mt-3 relative">
                <pre className="p-4 bg-zinc-950 text-zinc-300 rounded-md text-xs font-mono overflow-x-auto">
{`import requests

resp = requests.post(
    "http://localhost:8000/v1/chat/completions",
    json={
        "messages": [{"role": "user", "content": "How do I update billing settings?"}],
        "use_case": "${useCase}",
        "geography": "${geography}"
    }
)
data = resp.json()
print("Verdict:", data["decision"]["action"])
print("Content:", data["content"])`}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2 h-7 text-xs bg-background/80"
                  onClick={() => copyCode(`import requests\n\nresp = requests.post(\n    "http://localhost:8000/v1/chat/completions",\n    json={\n        "messages": [{"role": "user", "content": "How do I update billing settings?"}],\n        "use_case": "${useCase}",\n        "geography": "${geography}"\n    }\n)\ndata = resp.json()\nprint("Verdict:", data["decision"]["action"])\nprint("Content:", data["content"])`, 'python')}
                >
                  {copiedSnippet === 'python' ? <Check className="h-3 w-3 text-emerald-500 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copiedSnippet === 'python' ? 'Copied' : 'Copy'}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
