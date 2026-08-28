import { useState, useRef, useEffect } from "react";
import {
  Send,
  Shield,
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
  RotateCcw,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [activePiiConfig, setActivePiiConfig] = useState<Record<string, 'allow' | 'block'>>({});

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const activeScope = selectedEndpoint !== "auto" ? selectedEndpoint : useCase;

  useEffect(() => {
    if (endpoints.length === 0) {
      loadEndpoints();
    }
  }, []);

  useEffect(() => {
    loadActivePiiConfig();
  }, [useCase, selectedEndpoint]);

  const loadActivePiiConfig = async () => {
    try {
      const cfg = await api.getUseCaseConfig(activeScope);
      if (cfg && cfg.pii_permissions) {
        setActivePiiConfig(cfg.pii_permissions);
      }
    } catch {}
  };

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
      } as any);

      if (data.session_id) {
        setSessionId(data.session_id);
      }

      let syntheticEnvelope: InteractionEnvelope | null = null;

      if (data.interaction_id) {
        try {
          const detail = await api.getInteraction(data.interaction_id);
          if (detail && detail.interaction) {
            syntheticEnvelope = detail.interaction;
          }
        } catch {}
      }

      if (!syntheticEnvelope) {
        syntheticEnvelope = {
          interaction_id: data.interaction_id,
          timestamp: new Date().toISOString(),
          use_case: useCase,
          geography: geography,
          direction: "output",
          payload: { role: "assistant", content: data.content },
          decision: {
            action: data.decision?.action || "allow",
            reason: data.decision?.reason || "Request allowed by policy",
            policy_version: "v1.0.0",
            confidence: data.decision?.confidence ?? 1.0,
            blocked_entities: data.blocked_pii || [],
          },
          risk_assessment: {
            tier: data.risk?.tier || "low",
            confidence: data.risk?.confidence || 0.0,
            blast_radius: "low",
            reasoning: "Automated risk assessment",
          },
          checks: data.checks_summary || [],
          latency_breakdown: {
            input_guard: 12.4,
            router: 4.1,
            adapter: Math.max(Number(data.latency_ms) - 20, 30),
            output_guard: 8.2,
          },
          warnings: data.warnings || [],
        };
      }

      setLatestInteraction(syntheticEnvelope);

      if (data.decision && data.decision.action === "block") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: (data.content ? `[Original Response]: ${data.content}\n\n` : "") + (data.decision?.reason || "Request blocked by enterprise security guardrails."),
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
            content: (data.content ? `[Original Response]: ${data.content}\n\n` : "") + "Your request flagged perimeter security policies and has been queued for Human Review. Waiting for reviewer verdict...",
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
        return <span className="faang-chip chip-emerald">ALLOW</span>;
      case "block":
        return <span className="faang-chip chip-crimson">BLOCK</span>;
      case "flag":
        return <span className="faang-chip chip-amber">FLAG</span>;
      case "escalate":
        return <span className="faang-chip chip-violet">ESCALATE</span>;
      default:
        return <span className="faang-chip chip-neutral">UNKNOWN</span>;
    }
  };

  const copyCode = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const [mobileTab, setMobileTab] = useState<'chat' | 'inspector'>('chat');

  return (
    <div className="flex flex-col h-full w-full gap-3.5 min-h-0 overflow-hidden font-sans">
      {/* Mobile Tab Switcher (Visible only on < lg screens) */}
      <div className="flex lg:hidden items-center p-1 bg-[#15161B] border border-white/[0.08] rounded-full shrink-0 shadow-lg backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setMobileTab('chat')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-xs font-bold transition-all",
            mobileTab === 'chat' ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Chat Bench</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('inspector')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-xs font-bold transition-all",
            mobileTab === 'inspector' ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
          )}
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Security Inspector</span>
          {latestInteraction && (
            <span className="faang-chip chip-violet text-[9px] px-1.5 py-0">NEW</span>
          )}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 h-full w-full gap-5 min-h-0 overflow-hidden">
        {/* Left Panel: Chat Interface */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 h-full rounded-2xl border border-white/[0.08] bg-[#111216]/50 backdrop-blur-xl overflow-hidden",
          mobileTab === 'inspector' ? "hidden lg:flex" : "flex"
        )}>
          {/* Top Filter & Route Bar */}
          <div className="p-3.5 border-b border-white/[0.07] bg-[#111216]/80 backdrop-blur-md flex flex-wrap gap-3 items-center justify-between shrink-0">
            <div className="flex flex-wrap gap-2.5 items-center">
              <Select 
                value={selectedEndpoint} 
                onValueChange={(val) => {
                  setSelectedEndpoint(val);
                  if (val !== 'auto') {
                    setUseCase(val as UseCase);
                  }
                }}
              >
                <SelectTrigger className="w-[270px] sm:w-[300px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl hover:border-white/[0.18] transition-all" aria-label="Select enterprise workflow endpoint">
                  <div className="flex items-center gap-2 truncate">
                    {selectedEndpoint === 'auto' ? (
                      <span className="flex items-center gap-1.5 text-amber-400 font-bold truncate">
                        <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
                        Auto (Semantic AI Router)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-white font-bold truncate">
                        <Bot className="h-4 w-4 text-violet-400 shrink-0" />
                        {endpoints.find(e => e.id === selectedEndpoint)?.name || selectedEndpoint}
                      </span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl shadow-2xl">
                  <SelectItem value="auto">
                    <span className="flex items-center gap-2 text-amber-400 font-bold">
                      <Sparkles className="h-4 w-4" />
                      Auto (Semantic AI Router)
                    </span>
                  </SelectItem>
                  {endpoints.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      <span className="flex items-center gap-2 font-medium text-zinc-200">
                        <Bot className="h-4 w-4 text-violet-400" />
                        {ep.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={geography} onValueChange={(v) => {
                setGeography(v as Geography);
                clearSession();
              }}>
                <SelectTrigger className="w-[88px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl" aria-label="Select geography region">
                  <SelectValue placeholder="Geo" />
                </SelectTrigger>
                <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl">
                  <SelectItem value="US">🇺🇸 US</SelectItem>
                  <SelectItem value="EU">🇪🇺 EU</SelectItem>
                  <SelectItem value="IN">🇮🇳 IN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="faang-btn-ghost text-xs h-9 px-3.5 gap-1.5"
                onClick={() => setIsApiModalOpen(true)}
              >
                <Code2 className="h-3.5 w-3.5 text-violet-400" />
                API Code
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-9 px-3 gap-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.06]"
                onClick={clearSession}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, idx) => {
              const isDenied = msg.action === "deny" || msg.isHumanDenied || msg.content.includes("reviewed and denied");
              const isBlocked = msg.action === "block" && !isDenied;
              const isEscalated = msg.action === "escalate" && !isDenied;

              if (msg.role === "assistant" && isDenied) {
                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-2xl p-4 bg-[#16171D] border border-rose-500/25 space-y-3 shadow-xl">
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <XCircle className="h-4 w-4 shrink-0" />
                          </div>
                          <span className="text-xs font-bold text-rose-300">Human Review Verdict: Request Denied</span>
                        </div>
                        <span className="faang-chip chip-crimson text-[10px] font-bold">
                          DENIED
                        </span>
                      </div>
                      <div className="p-3 bg-black/30 rounded-xl border border-white/[0.06]">
                        <p className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-sans font-medium">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.role === "assistant" && isBlocked) {
                const targetInteractionId = msg.interaction_id || latestInteraction?.interaction_id;
                const isCurrentlyAppealing = appealingId === targetInteractionId;

                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-2xl p-4 bg-[#16171D] border border-rose-500/25 space-y-3 shadow-xl">
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <ShieldAlert className="h-4 w-4 shrink-0" />
                          </div>
                          <span className="text-xs font-bold text-rose-300">Blocked by ControlPlane.ai Firewall</span>
                        </div>
                        <span className="faang-chip chip-crimson text-[10px] font-bold">
                          PERIMETER BLOCKED
                        </span>
                      </div>
                      
                      <div className="p-3 bg-black/30 rounded-xl border border-white/[0.06]">
                        <p className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-sans font-medium">
                          {msg.content}
                        </p>
                      </div>

                      {latestInteraction?.decision?.blocked_entities && latestInteraction.decision.blocked_entities.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-xs font-bold text-rose-400">Prohibited PII:</span>
                          {latestInteraction.decision.blocked_entities.map((etype, eidx) => (
                            <span key={eidx} className="faang-chip chip-crimson text-[10px]">
                              {etype}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06]">
                        <span className="text-xs text-zinc-400 font-medium">
                          Believe this was an over-strict block?
                        </span>
                        <button
                          type="button"
                          className="faang-btn-ghost hover:bg-white/[0.08] text-white border border-white/[0.12] h-7.5 px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          disabled={isCurrentlyAppealing}
                          onClick={() => handleAppealBlock(idx, targetInteractionId)}
                        >
                          {isCurrentlyAppealing ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                              <span>Escalating...</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-3.5 w-3.5 text-zinc-300" />
                              <span>Appeal to Human Review</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.role === "assistant" && isEscalated) {
                return (
                  <div key={idx} className="flex w-full justify-start">
                    <div className="max-w-[85%] rounded-2xl p-4 bg-[#16171D] border border-violet-500/25 space-y-3 shadow-xl">
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                          </div>
                          <span className="text-xs font-bold text-violet-300">Escalated to Human Review</span>
                        </div>
                        <span className="faang-chip chip-violet text-[10px] font-bold">
                          REVIEW QUEUE
                        </span>
                      </div>
                      <div className="p-3 bg-black/30 rounded-xl border border-white/[0.06]">
                        <p className="whitespace-pre-wrap text-xs text-zinc-300 leading-relaxed font-sans font-medium">
                          {msg.content}
                        </p>
                      </div>
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
                    className={`max-w-[82%] rounded-2xl p-4 text-sm leading-relaxed shadow-md ${
                      msg.role === "user"
                        ? "bg-white text-black font-semibold rounded-br-sm"
                        : "bg-[#181920] border border-white/[0.08] text-zinc-100 rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#181920] border border-white/[0.08] text-zinc-200 max-w-[80%] rounded-2xl p-4 flex items-center gap-3 shadow-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  <span className="text-xs font-semibold text-zinc-300">
                    Evaluating perimeter guardrails via ControlPlane...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div className="bg-rose-500/10 border border-rose-500/25 text-rose-300 max-w-[80%] rounded-2xl p-3.5">
                  <p className="text-xs font-semibold">{error}</p>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-[#15161B]/80 border-t border-white/[0.07] backdrop-blur-xl shrink-0">
          <div className="max-w-3xl mx-auto flex items-end gap-3">
            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter prompt or test payload (e.g. Try prompt injection, SSN, API keys, or normal queries)..."
                className="min-h-[72px] max-h-[160px] resize-none text-sm bg-black/40 border border-white/[0.1] rounded-2xl p-3.5 pr-14 focus-visible:border-white/40 focus-visible:ring-1 focus-visible:ring-white/20 text-white placeholder:text-zinc-500 shadow-inner"
              />
              <div className="absolute right-3.5 bottom-3.5 text-[11px] text-zinc-500 font-medium pointer-events-none">
                Enter ↵
              </div>
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="faang-btn-primary h-[72px] w-14 rounded-2xl shrink-0 flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              aria-label="Send test message"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Analysis & Inspector */}
      <div className={cn(
        "w-full lg:w-[420px] xl:w-[460px] h-full shrink-0 flex flex-col gap-3.5 min-h-0 overflow-y-auto pr-1 pb-8",
        mobileTab === 'chat' ? "hidden lg:flex" : "flex"
      )}>
        {!latestInteraction ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 p-8 text-center border border-dashed border-white/[0.1] rounded-3xl bg-[#15161B]/60 backdrop-blur-xl">
            <div className="h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400 mb-4 shadow-inner">
              <ShieldCheck className="h-7 w-7 text-amber-400" />
            </div>
            <h3 className="text-base font-extrabold mb-1.5 text-white">Awaiting Ingress Stream</h3>
            <p className="text-xs text-zinc-400 max-w-[260px] leading-relaxed font-medium">
              Send a test message from the left bench to inspect sub-millisecond guardrails, ML scores, and zero-trust policies.
            </p>
          </div>
        ) : (
          <>
            {/* Top Decision Section (Borderless, Integrated) */}
            <div className="space-y-3 pb-3 border-b border-white/[0.07]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Firewall Decision</span>
                    <div className="text-xs font-extrabold text-white">Perimeter Verdict</div>
                  </div>
                </div>
                {getDecisionBadge(latestInteraction.decision.action)}
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Policy Reason</div>
                <div className="text-xs font-medium text-zinc-200 bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.05] leading-relaxed">
                  {latestInteraction.decision.reason}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Confidence Score</span>
                  <div className="font-extrabold text-sm text-white mt-0.5">
                    {(latestInteraction.decision.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Assessed Risk Tier</span>
                  <div className="mt-0.5">
                    <span
                      className={`faang-chip uppercase text-[9px] font-bold ${
                        latestInteraction.risk_assessment.tier === "high"
                          ? "chip-crimson"
                          : latestInteraction.risk_assessment.tier === "medium"
                          ? "chip-amber"
                          : "chip-emerald"
                      }`}
                    >
                      {latestInteraction.risk_assessment.tier} Tier
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Tabs */}
            <Tabs defaultValue="checks" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-8 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06]">
                <TabsTrigger value="checks" className="text-xs font-bold rounded-md data-[state=active]:bg-white/[0.08] data-[state=active]:text-white text-zinc-400">
                  Checks ({latestInteraction.checks.length})
                </TabsTrigger>
                <TabsTrigger value="trace" className="text-xs font-bold rounded-md data-[state=active]:bg-white/[0.08] data-[state=active]:text-white text-zinc-400">
                  Trace
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs font-bold rounded-md data-[state=active]:bg-white/[0.08] data-[state=active]:text-white text-zinc-400">
                  JSON
                </TabsTrigger>
              </TabsList>

              {/* Checks Tab — Borderless Continuous Stream */}
              <TabsContent value="checks" className="mt-1 divide-y divide-white/[0.05]">
                {latestInteraction.checks.map((check, idx) => {
                  const isOutput = ["sensitive_data", "system_prompt_leakage", "hallucination", "brand_safety"].includes(check.check_name);
                  const boundaryLabel = isOutput ? "Output" : "Input";

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
                      className="py-2.5 px-1 space-y-1.5 hover:bg-white/[0.02] rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100">{displayName}</span>
                          <span className={`faang-chip text-[9px] px-1.5 py-0 font-medium ${boundaryLabel === 'Output' ? 'chip-neutral text-violet-300' : 'chip-neutral text-zinc-300'}`}>
                            {boundaryLabel}
                          </span>
                        </div>
                        <span
                          className={`faang-chip text-[9px] font-bold uppercase ${
                            isFail
                              ? "chip-crimson"
                              : isWarn
                              ? "chip-amber"
                              : "chip-emerald"
                          }`}
                        >
                          {isFail ? "FAIL" : (isWarn ? "FLAG" : "PASS")}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="truncate max-w-[210px] font-mono text-[10px] text-zinc-400">{check.engine || "stateless_evaluator"}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${isFail ? "text-rose-400" : (isWarn ? "text-amber-400" : "text-emerald-400")}`}>
                            {scorePercent}%
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">({check.score.toFixed(2)})</span>
                        </div>
                      </div>

                      {/* Clean Hairline Progress Track */}
                      <div className="w-full bg-black/60 h-1.5 rounded-full overflow-hidden p-0">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isFail ? "bg-rose-500" : 
                            isWarn ? "bg-amber-400" : 
                            "bg-gradient-to-r from-violet-500 to-indigo-400"
                          }`}
                          style={{ width: `${check.score <= 0.005 ? 0 : Math.max(check.score * 100, 4)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              {/* Trace Tab — Borderless */}
              <TabsContent value="trace" className="mt-2 space-y-2">
                <div className="space-y-2 text-xs py-1">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
                    <Activity className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-xs font-bold text-white">Execution Latency Breakdown</span>
                  </div>
                  {Object.entries(latestInteraction.latency_breakdown).map(([stage, ms]) => (
                    <div key={stage} className="flex items-center justify-between py-1 border-b border-white/[0.03]">
                      <span className="text-zinc-400 capitalize font-medium">{stage.replace(/_/g, " ")}</span>
                      <span className="font-semibold text-zinc-200">{String(ms)}ms</span>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between font-bold text-sm">
                    <span className="text-white">Total Firewall Overhead</span>
                    <span className="text-amber-400 font-extrabold">
                      {(Object.values(latestInteraction.latency_breakdown) as number[]).reduce((a, b) => Number(a) + Number(b), 0)}ms
                    </span>
                  </div>
                </div>
              </TabsContent>

              {/* JSON Tab — Borderless */}
              <TabsContent value="json" className="mt-2">
                <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl max-h-[380px] overflow-y-auto">
                  <pre className="text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all leading-relaxed">
                    {JSON.stringify(latestInteraction, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      </div>

      {/* Connect API Dialog */}
      <Dialog open={isApiModalOpen} onOpenChange={setIsApiModalOpen}>
        <DialogContent className="max-w-2xl bg-[#15161B] border-white/[0.1] text-white">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white">Connect via API</DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  Call ControlPlane.ai Gateway directly from your backend services, bots, and pipelines:
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs defaultValue="curl" className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-3 max-w-[320px] bg-[#111216] p-1 rounded-full border border-white/[0.08]">
              <TabsTrigger value="curl" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">
                cURL
              </TabsTrigger>
              <TabsTrigger value="javascript" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">
                JavaScript
              </TabsTrigger>
              <TabsTrigger value="python" className="text-xs font-bold rounded-full data-[state=active]:bg-white data-[state=active]:text-black">
                Python
              </TabsTrigger>
            </TabsList>

            {/* cURL Snippet */}
            <TabsContent value="curl" className="mt-3 relative">
              <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2.5 right-2.5 h-8 text-xs gap-1.5 px-3 text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] rounded-lg border border-white/[0.08]"
                  onClick={() => copyCode(
`curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello, ControlPlane!"}],
    "use_case": "${useCase}",
    "geography": "${geography}"${selectedEndpoint !== "auto" ? `,\n    "endpoint_id": "${selectedEndpoint}"` : ""}
  }'`, "curl")}
                >
                  {copiedSnippet === "curl" ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSnippet === "curl" ? "Copied" : "Copy"}
                </Button>
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-zinc-200 pr-16 leading-relaxed">
{`curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{"role": "user", "content": "Hello, ControlPlane!"}],
    "use_case": "${useCase}",
    "geography": "${geography}"${selectedEndpoint !== "auto" ? `,\n    "endpoint_id": "${selectedEndpoint}"` : ""}
  }'`}
                </pre>
              </div>
            </TabsContent>

            {/* JavaScript Snippet */}
            <TabsContent value="javascript" className="mt-3 relative">
              <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2.5 right-2.5 h-8 text-xs gap-1.5 px-3 text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] rounded-lg border border-white/[0.08]"
                  onClick={() => copyCode(
`// 1. Using Standard Fetch / Node.js
async function askControlPlane() {
  const res = await fetch("http://localhost:8000/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello, ControlPlane!" }],
      use_case: "${useCase}",
      geography: "${geography}"${selectedEndpoint !== "auto" ? `,\n      endpoint_id: "${selectedEndpoint}"` : ""}
    })
  });

  const data = await res.json();
  console.log("Decision:", data.decision?.action); // "allow" | "block"
  console.log("Content:", data.content);
}

// 2. Or using OpenAI SDK (Drop-in Replacement)
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "controlplane-api-key"
});

const completion = await client.chat.completions.create({
  model: "${selectedEndpoint !== "auto" ? selectedEndpoint : "auto"}",
  messages: [{ role: "user", content: "Hello, ControlPlane!" }]
});
console.log(completion.choices[0].message.content);`, "javascript")}
                >
                  {copiedSnippet === "javascript" ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSnippet === "javascript" ? "Copied" : "Copy"}
                </Button>
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-zinc-200 pr-16 leading-relaxed max-h-[320px] overflow-y-auto">
{`// 1. Using Standard Fetch / Node.js
async function askControlPlane() {
  const res = await fetch("http://localhost:8000/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello, ControlPlane!" }],
      use_case: "${useCase}",
      geography: "${geography}"${selectedEndpoint !== "auto" ? `,\n      endpoint_id: "${selectedEndpoint}"` : ""}
    })
  });

  const data = await res.json();
  console.log("Decision:", data.decision?.action); // "allow" | "block"
  console.log("Content:", data.content);
}

// 2. Or using OpenAI SDK (Drop-in Replacement)
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "controlplane-api-key"
});

const completion = await client.chat.completions.create({
  model: "${selectedEndpoint !== "auto" ? selectedEndpoint : "auto"}",
  messages: [{ role: "user", content: "Hello, ControlPlane!" }]
});
console.log(completion.choices[0].message.content);`}
                </pre>
              </div>
            </TabsContent>

            {/* Python Snippet */}
            <TabsContent value="python" className="mt-3 relative">
              <div className="p-4 bg-black/60 border border-white/[0.08] rounded-2xl relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2.5 right-2.5 h-8 text-xs gap-1.5 px-3 text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] rounded-lg border border-white/[0.08]"
                  onClick={() => copyCode(
`# 1. Using Requests / Httpx
import requests

url = "http://localhost:8000/v1/chat/completions"
payload = {
    "messages": [{"role": "user", "content": "Hello, ControlPlane!"}],
    "use_case": "${useCase}",
    "geography": "${geography}"${selectedEndpoint !== "auto" ? `,\n    "endpoint_id": "${selectedEndpoint}"` : ""}
}

response = requests.post(url, json=payload)
data = response.json()

print("Perimeter Action:", data["decision"]["action"])
print("AI Response:", data["content"])

# 2. Or using OpenAI Python SDK
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="controlplane-api-key"
)

completion = client.chat.completions.create(
    model="${selectedEndpoint !== "auto" ? selectedEndpoint : "auto"}",
    messages=[{"role": "user", "content": "Hello, ControlPlane!"}]
)
print(completion.choices[0].message.content)`, "python")}
                >
                  {copiedSnippet === "python" ? <Check className="h-3.5 w-3.5 text-amber-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSnippet === "python" ? "Copied" : "Copy"}
                </Button>
                <pre className="text-[11px] font-mono whitespace-pre-wrap text-zinc-200 pr-16 leading-relaxed max-h-[320px] overflow-y-auto">
{`# 1. Using Requests / Httpx
import requests

url = "http://localhost:8000/v1/chat/completions"
payload = {
    "messages": [{"role": "user", "content": "Hello, ControlPlane!"}],
    "use_case": "${useCase}",
    "geography": "${geography}"${selectedEndpoint !== "auto" ? `,\n    "endpoint_id": "${selectedEndpoint}"` : ""}
}

response = requests.post(url, json=payload)
data = response.json()

print("Perimeter Action:", data["decision"]["action"])
print("AI Response:", data["content"])

# 2. Or using OpenAI Python SDK
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="controlplane-api-key"
)

completion = client.chat.completions.create(
    model="${selectedEndpoint !== "auto" ? selectedEndpoint : "auto"}",
    messages=[{"role": "user", "content": "Hello, ControlPlane!"}]
)
print(completion.choices[0].message.content)`}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
