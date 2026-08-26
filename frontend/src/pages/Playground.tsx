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
  XCircle
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
    const maxAttempts = 60; // ~3 minutes at 3s intervals
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
      } catch {
        // Continue polling
      }
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
      // Only send real conversation turns (filter out UI greeting placeholders & firewall-blocked system messages)
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
          action: data.decision?.action || "allow",
          reason: data.decision?.reason || "",
          interaction_id: data.interaction_id,
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

      if (data.decision?.action === "escalate" || data.decision?.action === "flag") {
        pollForResolution(data.interaction_id);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during communication.");
    } finally {
      setIsLoading(false);
    }
  };

  const [appealingId, setAppealingId] = useState<string | null>(null);

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
      console.error("Failed to appeal block", err);
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
    clearSession();
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
    <div className="flex flex-col lg:flex-row h-full gap-6 min-h-0 overflow-hidden">
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

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, idx) => {
              const isDenied = msg.action === "deny" || msg.isHumanDenied || msg.content.includes("reviewed and denied");
              const isBlocked = msg.action === "block" && !isDenied;
              const isEscalated = msg.action === "escalate" && !isDenied;

              if (msg.role === "assistant" && isDenied) {
                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-lg p-3.5 bg-rose-500/10 border border-rose-500/40 text-foreground rounded-bl-sm space-y-2 shadow-sm">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500">
                        <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                        <span>Human Review Verdict: Request Denied</span>
                        <Badge variant="outline" className="ml-auto text-[10px] text-rose-500 border-rose-500/40 font-mono bg-rose-500/10">
                          Denied (Final)
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-foreground/90 font-mono bg-background/60 p-2.5 rounded border border-rose-500/20">
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
                    <div className="max-w-[85%] rounded-lg p-3.5 bg-rose-500/10 border border-rose-500/30 text-foreground rounded-bl-sm space-y-2.5 shadow-sm">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-500">
                        <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
                        <span>Blocked by ControlPlane.ai Firewall</span>
                        <Badge variant="outline" className="ml-auto text-[10px] text-rose-500 border-rose-500/30 font-mono">
                          Input Blocked
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-foreground/90 font-mono bg-background/60 p-2.5 rounded border border-rose-500/20">
                        {msg.content}
                      </p>
                      {latestInteraction?.decision?.blocked_entities && latestInteraction.decision.blocked_entities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] font-medium text-rose-500">Prohibited PII Detected:</span>
                          {latestInteraction.decision.blocked_entities.map((etype, eidx) => (
                            <Badge key={eidx} variant="outline" className="text-[10px] font-mono bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold">
                              {etype}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-rose-500/20">
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
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Escalating...
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
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
                    <div className="max-w-[85%] rounded-lg p-3.5 bg-violet-500/10 border border-violet-500/30 text-foreground rounded-bl-sm space-y-1.5 shadow-sm">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-500">
                        <AlertTriangle className="h-4 w-4 text-violet-500 shrink-0" />
                        <span>Escalated to Human Review</span>
                        <Badge variant="outline" className="ml-auto text-[10px] text-violet-500 border-violet-500/30 font-mono">
                          Review Queue
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
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
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm border border-border text-foreground space-y-2"
                    }`}
                  >
                    {msg.role === "assistant" && idx === messages.length - 1 && latestInteraction?.warnings && latestInteraction.warnings.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>PII Policy Notice: Permitted PII detected and passed raw without redaction.</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                </div>
              );
            })}
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
        </div>

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
      <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col gap-4 overflow-y-auto min-h-0">
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

              <TabsContent value="checks" className="mt-3 space-y-2.5">
                {latestInteraction.checks.map((check, idx) => {
                  const isInput = ["prompt_injection", "secrets"].includes(check.check_name);
                  const isOutput = ["sensitive_data", "system_prompt_leakage"].includes(check.check_name);
                  const boundaryLabel = isInput ? "Input" : (isOutput ? "Output" : "Ingress/Egress");

                  const friendlyNames: Record<string, string> = {
                    prompt_injection: "Prompt Injection Defense",
                    toxicity: "Toxicity & Harassment",
                    secrets: "Secret Credentials Scanner",
                    sensitive_data: "Secret Leakage Guard",
                    system_prompt_leakage: "System Prompt Leakage",
                    pii: "PII & Privacy Engine",
                    brand_safety: "Brand Safety Filter",
                    hallucination: "Hallucination Risk"
                  };

                  const engineLabels: Record<string, string> = {
                    aho_corasick_vector_deberta: "DeBERTa + Vector Index",
                    aho_corasick_and_contextual_ml: "Neural Context Classifier",
                    gitleaks_entropy_hmac: "Entropy & Gitleaks HMAC",
                    detect_secrets_heuristic: "Shannon Entropy Scanner",
                    pii_service: "Presidio NER + Global Rules",
                    heuristic: "Structural Heuristic"
                  };

                  const displayName = friendlyNames[check.check_name] || check.check_name.replace(/_/g, " ");
                  const displayEngine = engineLabels[check.engine] || check.engine;
                  const scorePercent = (check.score * 100).toFixed(1);
                  const isPassed = check.verdict === "pass" || (!check.verdict && check.score < 0.4);
                  const isWarn = check.verdict === "warn" || (check.score >= 0.4 && check.score < 0.7);
                  const isFail = check.verdict === "fail" || check.score >= 0.7;

                  return (
                    <div 
                      key={idx} 
                      className="p-3 rounded-lg border border-border/80 bg-card/80 hover:bg-accent/20 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span 
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isFail ? "bg-rose-500" : (isWarn ? "bg-amber-500" : "bg-emerald-500")
                            }`} 
                          />
                          <span className="text-xs font-semibold text-foreground">
                            {displayName}
                          </span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground font-mono">
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
                              : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                          }`}
                        >
                          {isFail ? "FAIL" : (isWarn ? "FLAG" : "PASS")}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span className="truncate max-w-[190px]">{displayEngine}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${
                            isFail ? "text-rose-500" : (isWarn ? "text-amber-500" : "text-emerald-500")
                          }`}>
                            {scorePercent}%
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            ({check.score.toFixed(2)})
                          </span>
                        </div>
                      </div>

                      {/* Custom Pixel-Perfect Progress Bar */}
                      <div className="w-full bg-secondary/80 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${
                            isFail
                              ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]"
                              : isWarn
                              ? "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]"
                              : "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                          }`}
                          style={{ width: `${Math.max(check.score * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
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
                          <span className="font-mono">{String(ms)}ms</span>
                        </div>
                      ),
                    )}
                    <div className="pt-2 border-t border-border flex items-center justify-between text-sm font-medium">
                      <span>Total Processing</span>
                      <span className="font-mono">
                        {(
                          Object.values(latestInteraction.latency_breakdown) as number[]
                        ).reduce((a, b) => Number(a) + Number(b), 0)}
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
