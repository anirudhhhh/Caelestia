import { useState, useRef, useEffect } from "react";
import {
  Send,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Cpu,
  Loader2,
  Network,
  Code2,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Bot,
  AlertTriangle,
  UserCheck,
  XCircle,
  Zap,
  Globe,
  RotateCcw
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { UseCase, Geography, InteractionEnvelope, WorkflowEndpoint } from "@/types";
import { api } from "@/lib/api";
import { usePlayground, type PlaygroundMessage as Message } from "@/context/PlaygroundContext";

export default function Playground() {
  const {
    messages,
    setMessages,
    input,
    setInput,
    useCase,
    setUseCase,
    geography,
    setGeography,
    selectedEndpoint,
    setSelectedEndpoint,
    latestInteraction,
    setLatestInteraction,
    sessionId,
    setSessionId,
    endpoints,
    setEndpoints,
    clearSession,
  } = usePlayground();

  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appealingId, setAppealingId] = useState<string | null>(null);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (endpoints.length === 0) {
      loadEndpoints();
    }
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

  const pollForResolution = async (interactionId: string) => {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const item = await api.getEscalation(interactionId);
        if (item && item.status === "resolved") {
          const isDenied = item.resolution === "deny";
          setMessages((prev) => {
            const updated = prev.map((m) => {
              if (
                m.interaction_id === interactionId ||
                (m.action === "escalate" && m.content.includes("escalated"))
              ) {
                return {
                  ...m,
                  action: isDenied ? ("deny" as const) : ("allow" as const),
                  isHumanDenied: isDenied,
                };
              }
              return m;
            });
            return [
              ...updated,
              {
                role: "assistant" as const,
                content: isDenied
                  ? "Human Review Outcome: A reviewer reviewed and denied this request. It will not be executed."
                  : item.edited_content || "Human Review Outcome: A reviewer approved this request.",
                action: isDenied ? ("deny" as const) : ("allow" as const),
                isHumanDenied: isDenied,
                interaction_id: interactionId,
                reason: item.resolution_reason || `Resolved by ${item.resolved_by || "reviewer"}`,
              },
            ];
          });
          return;
        }
      } catch {}
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const requestMessages = messages
        .filter((m) => !m.isGreeting && m.action !== "block" && !m.content.startsWith("Failed ") && !m.content.includes("ready to assist you"))
        .concat(userMessage)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const data = await api.sendChat({
        messages: requestMessages,
        use_case: useCase,
        geography: geography,
        session_id: sessionId || undefined,
        endpoint_id: selectedEndpoint !== "auto" ? selectedEndpoint : undefined,
      });

      if (data.session_id) {
        setSessionId(data.session_id);
      }

      let syntheticEnvelope: InteractionEnvelope | null = null;

      if (data.interaction_id) {
        try {
          const detail = await api.getEventDetail(data.interaction_id);
          if (detail && detail.interaction) {
            syntheticEnvelope = detail.interaction;
          }
        } catch {}
      }

      if (!syntheticEnvelope) {
        syntheticEnvelope = {
          interaction_id: data.interaction_id,
          session_id: data.session_id,
          use_case: useCase,
          geography: geography,
          direction: "output",
          payload: { role: "assistant", content: data.content },
          model: {
            requested: "google/gemini-2.5-flash",
            routed_to: data.model_used || "google/gemini-2.5-flash",
            provider: "google",
            temperature: 0.7,
            max_tokens: 1024,
          },
          decision: {
            action: data.decision?.action || "allow",
            reason: data.decision?.reason || "Request allowed by policy",
            policy_version: "v1.0.0",
            decided_by: "policy_engine",
            confidence: data.decision?.confidence ?? 1.0,
            blocked_entities: data.blocked_pii || [],
            warnings: data.warnings || [],
          },
          risk_assessment: {
            tier: data.risk?.tier || "low",
            score: data.risk?.score || 0.0,
            factors: data.risk?.factors || [],
          },
          checks: data.checks_summary || [],
          latency_breakdown: {
            input_guard: 12.4,
            router: 4.1,
            adapter: Math.max(Number(data.latency_ms) - 20, 30),
            output_guard: 8.2,
          },
          metadata: {},
          timestamp: new Date().toISOString(),
          warnings: data.warnings || [],
        };
      }

      setLatestInteraction(syntheticEnvelope);

      if (data.decision && data.decision.action === "block") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.decision?.reason || "Request blocked by enterprise security guardrails.",
            action: "block",
            interaction_id: data.interaction_id,
            reason: data.decision?.reason,
          },
        ]);
      } else if (data.decision && data.decision.action === "escalate") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Your request flagged perimeter security policies and has been queued for Human Review. Waiting for reviewer verdict...",
            action: "escalate",
            interaction_id: data.interaction_id,
            reason: data.decision?.reason,
          },
        ]);
        if (data.interaction_id) {
          pollForResolution(data.interaction_id);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.content,
            action: (data.decision?.action as any) || "allow",
            interaction_id: data.interaction_id,
            payload: { role: "assistant", content: data.content },
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during communication.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppealBlock = async (msgIdx: number, interactionId?: string) => {
    const userMsg = messages[msgIdx - 1]?.content || "";
    const targetId = interactionId || messages[msgIdx]?.interaction_id || latestInteraction?.interaction_id;
    if (!targetId) return;

    setAppealingId(targetId);
    try {
      const targetMsg = messages[msgIdx];
      const isOutputBlock = targetMsg?.role === "assistant";
      await api.appealBlockedRequest({
        interaction_id: targetId,
        session_id: sessionId || undefined,
        content: targetMsg?.content || latestInteraction?.payload?.content || userMsg,
        direction: isOutputBlock ? "output" : "input",
        payload: targetMsg?.payload || latestInteraction?.payload || { role: isOutputBlock ? "assistant" : "user", content: userMsg },
        reason: "User requested human appeal for perimeter-blocked request",
        use_case: useCase,
        geography: geography,
        checks_summary: latestInteraction?.checks || [],
      });

      const updated = [...messages];
      updated[msgIdx] = {
        ...updated[msgIdx],
        action: "escalate",
        content: "Blocked request has been escalated to Human Review for operator appeal. Waiting for reviewer verdict...",
      };
      setMessages(updated);
      pollForResolution(targetId);
    } catch (err: any) {
      setError(err.message || "Failed to submit appeal to human review.");
    } finally {
      setAppealingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getDecisionBadge = (action?: string) => {
    switch (action?.toLowerCase()) {
      case "allow":
        return <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 text-xs font-semibold">ALLOW</Badge>;
      case "block":
        return <Badge className="bg-rose-500/15 text-rose-500 border border-rose-500/30 px-2 py-0.5 text-xs font-semibold">BLOCK</Badge>;
      case "flag":
        return <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2 py-0.5 text-xs font-semibold">FLAG</Badge>;
      case "escalate":
        return <Badge className="bg-violet-500/15 text-violet-500 border border-violet-500/30 px-2 py-0.5 text-xs font-semibold">ESCALATE</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">UNKNOWN</Badge>;
    }
  };

  const copyCode = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-8.5rem)] gap-5 min-h-0 overflow-hidden">
      {/* Left Panel: Chat Interface */}
      <div className="flex-1 flex flex-col min-w-0 bg-card rounded-xl border border-border/80 overflow-hidden shadow-sm">
        {/* Top Filter & Route Bar */}
        <div className="p-3 border-b border-border/80 bg-muted/20 flex flex-wrap gap-2.5 items-center justify-between shrink-0">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
              <SelectTrigger className="w-[190px] h-8 text-xs font-medium bg-background">
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

            <Select value={useCase} onValueChange={(v) => setUseCase(v as UseCase)}>
              <SelectTrigger className="w-[150px] h-8 text-xs bg-background">
                <SelectValue placeholder="Use Case" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_support">Customer Support</SelectItem>
                <SelectItem value="internal_copilot">Internal Copilot</SelectItem>
                <SelectItem value="decision_support">Decision Support</SelectItem>
              </SelectContent>
            </Select>

            <Select value={geography} onValueChange={(v) => setGeography(v as Geography)}>
              <SelectTrigger className="w-[85px] h-8 text-xs bg-background">
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
              className="text-xs h-8 gap-1.5 bg-background"
              onClick={() => setIsApiModalOpen(true)}
            >
              <Code2 className="h-3.5 w-3.5" />
              API Code
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={clearSession}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, idx) => {
              const isDenied = msg.action === "deny" || msg.isHumanDenied || msg.content.includes("reviewed and denied");
              const isBlocked = msg.action === "block" && !isDenied;
              const isEscalated = msg.action === "escalate" && !isDenied;

              if (msg.role === "assistant" && isDenied) {
                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-xl p-4 bg-rose-500/10 border border-rose-500/30 text-foreground space-y-2.5 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-rose-500">
                        <XCircle className="h-4 w-4 shrink-0" />
                        <span>Human Review Verdict: Request Denied</span>
                        <Badge variant="outline" className="ml-auto text-[10px] text-rose-500 border-rose-500/40 bg-rose-500/10">
                          Denied (Final)
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-foreground/90 font-mono bg-background/80 p-3 rounded-lg border border-rose-500/20">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              }

              if (msg.role === "assistant" && isBlocked) {
                const targetInteractionId = msg.interaction_id || latestInteraction?.interaction_id;
                const isCurrentlyAppealing = appealingId === targetInteractionId;

                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-xl p-4 bg-rose-500/10 border border-rose-500/30 text-foreground space-y-3 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-rose-500">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>Blocked by ControlPlane.ai Firewall</span>
                        <Badge variant="outline" className="ml-auto text-[10px] text-rose-500 border-rose-500/30 font-mono">
                          Perimeter Guard
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-foreground/90 font-mono bg-background/80 p-3 rounded-lg border border-rose-500/20">
                        {msg.content}
                      </p>
                      {latestInteraction?.decision?.blocked_entities && latestInteraction.decision.blocked_entities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] font-medium text-rose-500">Prohibited PII:</span>
                          {latestInteraction.decision.blocked_entities.map((etype, eidx) => (
                            <Badge key={eidx} variant="outline" className="text-[10px] font-mono bg-rose-500/15 border-rose-500/30 text-rose-400 font-bold">
                              {etype}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-rose-500/20">
                        <span className="text-[11px] text-muted-foreground">
                          Believe this was an over-strict block?
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-rose-500/40 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 font-medium"
                          disabled={isCurrentlyAppealing}
                          onClick={() => handleAppealBlock(idx, targetInteractionId)}
                        >
                          {isCurrentlyAppealing ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                              Escalating...
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                              Appeal to Human Review
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.role === "assistant" && isEscalated) {
                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-xl p-4 bg-violet-500/10 border border-violet-500/30 text-foreground space-y-2 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-violet-500">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Escalated to Human Review</span>
                        <Badge variant="outline" className="ml-auto text-[10px] text-violet-500 border-violet-500/30 font-mono">
                          Review Queue
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-3.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "bg-muted/70 border border-border/80 text-foreground space-y-2"
                    }`}
                  >
                    {msg.role === "assistant" && idx === messages.length - 1 && latestInteraction?.warnings && latestInteraction.warnings.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>PII Policy Notice: Permitted PII detected and passed raw without redaction.</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted/60 border border-border text-foreground max-w-[80%] rounded-xl p-3.5 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Evaluating perimeter guardrails via ControlPlane...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div className="bg-destructive/10 border border-destructive/20 text-destructive max-w-[80%] rounded-xl p-3">
                  <p className="text-xs font-medium">{error}</p>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3.5 bg-card border-t border-border/80 shrink-0">
          <div className="max-w-3xl mx-auto flex items-end gap-2.5">
            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter prompt or test payload (e.g. Try prompt injection, SSN, API keys, or normal queries)..."
                className="min-h-[70px] max-h-[160px] resize-none text-xs bg-background/80 rounded-xl pr-12 focus-visible:ring-1"
              />
              <div className="absolute right-2.5 bottom-2.5 text-[10px] text-muted-foreground/60 font-mono pointer-events-none">
                Enter ↵
              </div>
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="h-[70px] w-12 rounded-xl shrink-0"
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel: Analysis & Inspector */}
      <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
        {!latestInteraction ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center border border-dashed border-border/80 rounded-xl bg-card/30">
            <ShieldCheck className="h-10 w-10 mb-3 text-muted-foreground/40" />
            <h3 className="text-sm font-semibold mb-1 text-foreground">Awaiting Ingress Stream</h3>
            <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
              Send a test message from the left bench to inspect sub-millisecond guardrails, ML scores, and policy decisions.
            </p>
          </div>
        ) : (
          <>
            {/* Top Decision Card */}
            <Card className="border-border/80 shadow-sm bg-card/90">
              <CardHeader className="p-3.5 pb-2.5 border-b border-border/60 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <CardTitle className="text-xs font-semibold">Firewall Decision</CardTitle>
                  </div>
                  {getDecisionBadge(latestInteraction.decision.action)}
                </div>
              </CardHeader>
              <CardContent className="p-3.5 space-y-3">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-0.5 font-medium">Policy Reason</div>
                  <div className="text-xs font-medium text-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60 leading-relaxed font-mono">
                    {latestInteraction.decision.reason}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50 text-xs">
                  <div>
                    <span className="text-[11px] text-muted-foreground">Confidence</span>
                    <div className="font-semibold text-foreground mt-0.5">
                      {(latestInteraction.decision.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Risk Tier</span>
                    <div className="mt-0.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 font-bold uppercase ${
                          latestInteraction.risk_assessment.tier === "high"
                            ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
                            : latestInteraction.risk_assessment.tier === "medium"
                            ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                            : "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                        }`}
                      >
                        {latestInteraction.risk_assessment.tier}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Tabs */}
            <Tabs defaultValue="checks" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-8 bg-muted/40 p-0.5">
                <TabsTrigger value="checks" className="text-xs">Checks ({latestInteraction.checks.length})</TabsTrigger>
                <TabsTrigger value="trace" className="text-xs">Latency Trace</TabsTrigger>
                <TabsTrigger value="json" className="text-xs">Envelope JSON</TabsTrigger>
              </TabsList>

              {/* Checks Tab */}
              <TabsContent value="checks" className="mt-2.5 space-y-2">
                {latestInteraction.checks.map((check, idx) => {
                  const isInput = ["prompt_injection", "secrets"].includes(check.check_name);
                  const isOutput = ["sensitive_data", "system_prompt_leakage"].includes(check.check_name);
                  const boundaryLabel = isInput ? "Input" : (isOutput ? "Output" : "Ingress");

                  const friendlyNames: Record<string, string> = {
                    prompt_injection: "Prompt Injection Defense",
                    toxicity: "Contextual Toxicity Scanner",
                    secrets: "Secret Credentials Scanner",
                    sensitive_data: "Secret Leakage Guard",
                    system_prompt_leakage: "System Prompt Leakage",
                    pii: "PII & Privacy Engine",
                    brand_safety: "Brand Safety Filter",
                    hallucination: "Hallucination Risk"
                  };

                  const displayName = friendlyNames[check.check_name] || check.check_name.replace(/_/g, " ");
                  const scorePercent = (check.score * 100).toFixed(1);
                  const isFail = check.verdict === "fail" || check.score >= 0.7;
                  const isWarn = check.verdict === "warn" || (check.score >= 0.4 && check.score < 0.7);

                  return (
                    <div 
                      key={idx} 
                      className="p-3 rounded-xl border border-border/70 bg-card/80 space-y-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span 
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isFail ? "bg-rose-500 animate-pulse" : (isWarn ? "bg-amber-500" : "bg-emerald-500")
                            }`} 
                          />
                          <span className="text-xs font-semibold text-foreground">{displayName}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground font-mono">
                            {boundaryLabel}
                          </Badge>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-bold px-1.5 py-0 uppercase ${
                            isFail
                              ? "border-rose-500/50 text-rose-500 bg-rose-500/10"
                              : isWarn
                              ? "border-amber-500/50 text-amber-500 bg-amber-500/10"
                              : "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                          }`}
                        >
                          {isFail ? "FAIL" : (isWarn ? "FLAG" : "PASS")}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span className="truncate max-w-[200px]">{check.engine || "stateless_evaluator"}</span>
                        <div className="flex items-center gap-1">
                          <span className={`font-semibold ${isFail ? "text-rose-500" : (isWarn ? "text-amber-500" : "text-emerald-500")}`}>
                            {scorePercent}%
                          </span>
                          <span className="text-[10px] text-muted-foreground/60">({check.score.toFixed(2)})</span>
                        </div>
                      </div>

                      {/* Smooth Progress Bar */}
                      <div className="w-full bg-secondary/80 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isFail ? "bg-rose-500" : (isWarn ? "bg-amber-500" : "bg-emerald-500")
                          }`}
                          style={{ width: `${Math.max(check.score * 100, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              {/* Trace Tab */}
              <TabsContent value="trace" className="mt-2.5 space-y-2">
                <Card className="border-border/70 shadow-none bg-card/80">
                  <CardHeader className="p-3 border-b border-border/60 bg-muted/20">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      Execution Latency Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2.5 text-xs">
                    {Object.entries(latestInteraction.latency_breakdown).map(([stage, ms]) => (
                      <div key={stage} className="flex items-center justify-between">
                        <span className="text-muted-foreground capitalize font-medium">{stage.replace(/_/g, " ")}</span>
                        <span className="font-mono font-semibold">{String(ms)}ms</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between font-semibold">
                      <span>Total Firewall Overhead</span>
                      <span className="font-mono text-emerald-500">
                        {(Object.values(latestInteraction.latency_breakdown) as number[]).reduce((a, b) => Number(a) + Number(b), 0)}ms
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* JSON Tab */}
              <TabsContent value="json" className="mt-2.5">
                <div className="p-3 bg-muted/40 border border-border/70 rounded-xl max-h-[380px] overflow-y-auto">
                  <pre className="text-[11px] font-mono text-foreground/90 whitespace-pre-wrap break-all">
                    {JSON.stringify(latestInteraction, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Connect API Dialog */}
      <Dialog open={isApiModalOpen} onOpenChange={setIsApiModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Connect via API</DialogTitle>
            <DialogDescription className="text-xs">
              Call ControlPlane.ai Gateway directly from your backend services:
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            <div className="p-3 bg-muted/60 border border-border rounded-lg relative">
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-2 right-2 h-7 text-xs gap-1"
                onClick={() => copyCode(`curl -X POST http://localhost:8000/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -d '{"messages": [{"role": "user", "content": "Hello!"}], "use_case": "${useCase}"}'`, "curl")}
              >
                {copiedSnippet === "curl" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSnippet === "curl" ? "Copied" : "Copy"}
              </Button>
              <pre className="text-[11px] font-mono whitespace-pre-wrap text-foreground pr-14">
{`curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Your query..."}],
    "use_case": "${useCase}",
    "geography": "${geography}"
  }'`}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
