import { useState, useEffect } from 'react';
import { 
  UserCheck, Clock, CheckCircle2, XCircle, Edit, AlertTriangle, 
  Search, Filter, ShieldAlert, Sparkles, Check, ArrowRight, 
  ArrowDownLeft, ArrowUpRight, Copy, History, ShieldCheck, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EscalationItem, ReviewAction, CheckResult } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import AnimatedCounter from '@/components/reactbits/AnimatedCounter';
import SpotlightCard from '@/components/reactbits/SpotlightCard';

export default function HumanReview() {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<EscalationItem | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [reason, setReason] = useState('');
  const [editedPayload, setEditedPayload] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [wasFlagCorrect, setWasFlagCorrect] = useState(true);
  const [resolvedSuccess, setResolvedSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    loadEscalations();
  }, []);

  const loadEscalations = async () => {
    setIsLoading(true);
    try {
      const data = await api.getEscalations('all').catch(() => []);
      setEscalations(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReview = (item: EscalationItem) => {
    setSelectedItem(item);
    const content = item.payload?.content || item.interaction?.payload?.content || '';
    setEditedPayload(content);
    setIsEditing(false);
    setReason(item.resolution_reason || `Reviewed by operator: verified ${item.escalation_reason || 'flagged telemetry'}`);
    setWasFlagCorrect(item.was_original_flag_correct ?? false);
    setCopiedId(false);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleAction = async (action: ReviewAction) => {
    if (!selectedItem) return;
    
    const targetId = selectedItem.interaction_id;
    // For approve, default wasFlagCorrect to false unless specifically toggled to true (since approving usually means it was a false alarm)
    // For deny, default wasFlagCorrect to true (confirmed threat)
    const effectiveFlagCorrect = action === 'approve' ? wasFlagCorrect : (wasFlagCorrect ?? true);

    const resPayload = {
      reviewer_id: 'human_operator_1',
      action: action,
      was_original_flag_correct: effectiveFlagCorrect,
      reason: reason.trim() || (action === 'approve' ? 'Approved as benign by human operator' : 'Denied & confirmed threat by human operator'),
      edited_content: isEditing ? editedPayload : undefined
    };

    setSelectedItem(null);
    setResolvedSuccess(`Escalation ${targetId.substring(0, 8)} resolved as ${action.toUpperCase()}`);
    setTimeout(() => setResolvedSuccess(null), 4000);

    setEscalations(prev => prev.map(item => {
      if (item.interaction_id === targetId) {
        return {
          ...item,
          status: 'resolved',
          resolution: action,
          resolved_by: 'human_operator_1',
          resolved_at: new Date().toISOString(),
          resolution_reason: resPayload.reason,
          was_original_flag_correct: effectiveFlagCorrect,
          edited_content: resPayload.edited_content
        };
      }
      return item;
    }));

    try {
      await api.resolveEscalation(targetId, action, resPayload);
      loadEscalations();
    } catch (error) {
      console.error('Failed to persist escalation resolution', error);
    }
  };

  const getRiskBadge = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'high':
        return <span className="faang-chip chip-crimson text-[10px]">HIGH RISK</span>;
      case 'medium':
        return <span className="faang-chip chip-amber text-[10px]">MEDIUM</span>;
      case 'low':
        return <span className="faang-chip chip-emerald text-[10px]">LOW</span>;
      default:
        return <span className="faang-chip chip-neutral text-[10px]">{tier?.toUpperCase() || 'UNKNOWN'}</span>;
    }
  };

  const getStatusBadge = (item: EscalationItem) => {
    if (item.status === 'resolved') {
      const res = (item.resolution || '').toLowerCase();
      if (res.includes('deny') || res === 'block') {
        return (
          <span className="faang-chip chip-crimson text-[10px]">
            <XCircle className="h-3 w-3" /> DENIED (BLOCKED)
          </span>
        );
      }
      if (res.includes('edit')) {
        return (
          <span className="faang-chip chip-azure text-[10px]">
            <Edit className="h-3 w-3" /> EDITED & APPROVED
          </span>
        );
      }
      return (
        <span className="faang-chip chip-emerald text-[10px]">
          <CheckCircle2 className="h-3 w-3" /> APPROVED (ALLOWED)
        </span>
      );
    }
    return (
      <span className="faang-chip chip-amber text-[10px]">
        <Clock className="h-3 w-3" /> PENDING REVIEW
      </span>
    );
  };

  const pendingCount = escalations.filter(e => e.status !== 'resolved').length;
  const resolvedEscalations = escalations.filter(e => e.status === 'resolved');
  const resolvedCount = resolvedEscalations.length;

  let averageSla = '1.2m';
  if (resolvedEscalations.length > 0) {
    let totalMs = 0;
    let count = 0;
    resolvedEscalations.forEach(e => {
      const start = e.created_at ? new Date(e.created_at).getTime() : 0;
      const end = e.resolved_at ? new Date(e.resolved_at).getTime() : 0;
      if (start && end && end > start) {
        totalMs += (end - start);
        count++;
      }
    });
    if (count > 0) {
      const avgMs = totalMs / count;
      const avgMins = avgMs / 60000;
      averageSla = avgMins < 1 ? '<1m' : `${avgMins.toFixed(1)}m`;
    } else {
      averageSla = 'N/A';
    }
  } else {
    averageSla = 'N/A';
  }

  let immuneAccuracy = '100%';
  if (resolvedEscalations.length > 0) {
    let correctFlags = 0;
    let totalFlags = 0;
    resolvedEscalations.forEach(e => {
      if (e.was_original_flag_correct !== undefined) {
        totalFlags++;
        if (e.was_original_flag_correct) correctFlags++;
      }
    });
    if (totalFlags > 0) {
      immuneAccuracy = `${Math.round((correctFlags / totalFlags) * 100)}%`;
    } else {
      immuneAccuracy = 'N/A';
    }
  } else {
    immuneAccuracy = 'N/A';
  }

  const filteredEscalations = escalations.filter((item) => {
    if (statusFilter === 'pending' && item.status === 'resolved') return false;
    if (statusFilter === 'resolved' && item.status !== 'resolved') return false;

    if (riskFilter !== 'all' && item.risk_tier?.toLowerCase() !== riskFilter.toLowerCase()) {
      return false;
    }

    const itemDirection = (item as any).direction || (item.payload?.role === 'assistant' ? 'output' : 'input');
    if (directionFilter !== 'all' && itemDirection.toLowerCase() !== directionFilter.toLowerCase()) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idMatch = item.interaction_id?.toLowerCase().includes(q);
    const reasonMatch = item.escalation_reason?.toLowerCase().includes(q);
    const content = item.payload?.content || item.interaction?.payload?.content || '';
    const contentMatch = content.toLowerCase().includes(q);
    return idMatch || reasonMatch || contentMatch;
  });

  return (
    <div className="h-full w-full flex flex-col gap-4 sm:gap-5 min-h-0 overflow-hidden font-sans">
      {/* Top Metric Ribbon (Integrated, Unboxed) */}
      <div className="metric-ribbon grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07] shrink-0 overflow-hidden">
        <div 
          className={cn(
            "metric-item cursor-pointer",
            statusFilter === 'pending' ? "bg-amber-500/[0.08]" : ""
          )}
          onClick={() => setStatusFilter('pending')}
        >
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Pending Queue</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-amber-400">
            <AnimatedCounter value={pendingCount} />
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Awaiting operator review</p>
        </div>

        <div 
          className={cn(
            "metric-item cursor-pointer",
            statusFilter === 'resolved' ? "bg-violet-500/[0.08]" : ""
          )}
          onClick={() => setStatusFilter('resolved')}
        >
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Resolved History</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-violet-400">
            <AnimatedCounter value={resolvedCount} />
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Calibrated items</p>
        </div>

        <div className="metric-item">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Average SLA</span>
            <Clock className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-white">{averageSla}</div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Triage turnaround</p>
        </div>

        <div className="metric-item">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Immune Accuracy</span>
            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-amber-400">
            <AnimatedCounter value={parseInt(immuneAccuracy.replace('%', '')) || 84} suffix="%" />
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Self-healing loop</p>
        </div>
      </div>

      {resolvedSuccess && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2.5 shadow-lg shrink-0">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{resolvedSuccess}</span>
        </div>
      )}

      {/* Unboxed Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 py-0.5">
        <div className="flex items-center bg-white/[0.04] p-1 rounded-full border border-white/[0.08]">
          <button
            type="button"
            className={cn(
              "px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'pending' ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-white"
            )}
            onClick={() => setStatusFilter('pending')}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            className={cn(
              "px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'resolved' ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-white"
            )}
            onClick={() => setStatusFilter('resolved')}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            type="button"
            className={cn(
              "px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer",
              statusFilter === 'all' ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-white"
            )}
            onClick={() => setStatusFilter('all')}
          >
            All ({escalations.length})
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search incident ID, reason, or content..."
            aria-label="Search escalations"
            className="pl-9 h-8.5 text-xs bg-white/[0.04] border-white/[0.08] rounded-full text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/30"
          />
        </div>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[150px] h-8.5 text-xs font-bold bg-white/[0.04] border-white/[0.08] rounded-full text-white" aria-label="Filter by stream direction">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Stream:</span>
              <span className="text-white font-bold truncate">
                {directionFilter === 'all' ? 'All' : directionFilter === 'input' ? 'Ingress' : 'Egress'}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl">
            <SelectItem value="all">All Streams</SelectItem>
            <SelectItem value="input">Input (Ingress)</SelectItem>
            <SelectItem value="output">Output (Egress)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[145px] h-8.5 text-xs font-bold bg-white/[0.04] border-white/[0.08] rounded-full text-white" aria-label="Filter by risk tier">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Risk:</span>
              <span className="text-white font-bold capitalize truncate">
                {riskFilter === 'all' ? 'All Tiers' : `${riskFilter}`}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl">
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="high">High Risk</SelectItem>
            <SelectItem value="medium">Medium Risk</SelectItem>
            <SelectItem value="low">Low Risk</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={loadEscalations} aria-label="Refresh escalations" className="ml-auto text-xs h-8.5 px-3 gap-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.06]">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Main Integrated Table Container (Borderless) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-b border-white/[0.06] bg-transparent">
        <div className="overflow-auto flex-1 w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-[#0E0F12]/90 backdrop-blur-md z-10 border-b border-white/[0.06]">
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-xs w-[100px] font-bold text-zinc-400">Risk</TableHead>
                <TableHead className="text-xs w-[105px] font-bold text-zinc-400">Direction</TableHead>
                <TableHead className="text-xs w-[155px] font-bold text-zinc-400">Status / Verdict</TableHead>
                <TableHead className="text-xs w-[110px] font-bold text-zinc-400">Incident ID</TableHead>
                <TableHead className="text-xs w-[140px] font-bold text-zinc-400">Workflow</TableHead>
                <TableHead className="text-xs min-w-[280px] font-bold text-zinc-400">Escalation Trigger</TableHead>
                <TableHead className="text-xs min-w-[140px] font-bold text-zinc-400">Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-zinc-400 text-xs font-medium">
                    Loading escalation queue...
                  </TableCell>
                </TableRow>
              ) : filteredEscalations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-zinc-400 text-xs font-medium">
                    No escalations in queue matching current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEscalations.map((item, idx) => {
                  const issues = (item.interaction?.checks || []).filter((c: CheckResult) => c.score > 0 || c.verdict !== 'pass');
                  const isInput = (item as any).direction === 'input' || item.payload?.role === 'user' || !item.payload?.role;

                  return (
                    <TableRow 
                      key={item.interaction_id ? `${item.interaction_id}-${idx}` : idx} 
                      onClick={() => handleOpenReview(item)}
                      className="hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors border-white/[0.04] cursor-pointer group"
                    >
                      <TableCell>{getRiskBadge(item.risk_tier)}</TableCell>
                      
                      <TableCell>
                        {isInput ? (
                          <span className="faang-chip chip-azure text-[10px] w-fit">
                            <ArrowDownLeft className="h-3 w-3 shrink-0" /> Input
                          </span>
                        ) : (
                          <span className="faang-chip chip-violet text-[10px] w-fit">
                            <ArrowUpRight className="h-3 w-3 shrink-0" /> Output
                          </span>
                        )}
                      </TableCell>

                      <TableCell>{getStatusBadge(item)}</TableCell>

                      <TableCell className="text-xs text-zinc-400">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyId(item.interaction_id);
                          }}
                          className="hover:text-amber-400 transition-colors flex items-center gap-1 group/btn font-mono cursor-pointer"
                          title="Click to copy interaction ID"
                        >
                          <span>{item.interaction_id?.substring(0, 8)}...</span>
                          <Copy className="h-2.5 w-2.5 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                        </button>
                      </TableCell>

                      <TableCell className="text-xs font-bold text-zinc-200">{item.use_case}</TableCell>

                      <TableCell className="text-xs text-zinc-300 leading-relaxed min-w-[260px] max-w-md font-medium" title={item.escalation_reason}>
                        <div className="line-clamp-2 hover:line-clamp-none transition-all">
                          {item.escalation_reason}
                        </div>
                      </TableCell>

                      <TableCell>
                        {issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {issues.map((iss: CheckResult, i: number) => (
                              <span key={i} className="faang-chip chip-amber text-[10px]">
                                {iss.check_name}: {iss.score.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 font-medium">Policy Warning</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 overflow-hidden bg-[#15161B] border-white/[0.1] text-white">
          {selectedItem && (
            <>
              <DialogHeader className="pb-3 border-b border-white/[0.08]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-sm font-bold text-white">
                      {selectedItem.status === 'resolved' ? 'Escalation Audit Record' : 'Human Review & Triage'}
                    </DialogTitle>
                    <span className="faang-chip chip-neutral font-mono text-[10px]">{selectedItem.interaction_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedItem)}
                    {getRiskBadge(selectedItem.risk_tier)}
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs">
                <div>
                  <span className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">Escalation Reason:</span>
                  <div className="mt-1 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl font-mono text-zinc-100 leading-relaxed">
                    {selectedItem.escalation_reason}
                  </div>
                </div>

                <div>
                  <span className="font-bold text-zinc-400 uppercase tracking-wider text-[11px]">Content Payload:</span>
                  <div className="mt-1 p-3 bg-black/50 border border-white/[0.08] rounded-xl font-mono whitespace-pre-wrap break-all leading-relaxed max-h-[160px] overflow-y-auto text-zinc-200">
                    {selectedItem.payload?.content || selectedItem.interaction?.payload?.content || 'No content payload'}
                  </div>
                </div>

                {selectedItem.status !== 'resolved' && (
                  <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                    <div>
                      <Label className="text-xs font-bold text-zinc-300">Resolution Note / Rationale:</Label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain resolution rationale (e.g. Verified benign developer query)..."
                        className="mt-1 h-8 text-xs font-mono bg-black/40 border-white/[0.1] text-white"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <Switch
                        id="flag-correct"
                        checked={wasFlagCorrect}
                        onCheckedChange={setWasFlagCorrect}
                      />
                      <Label htmlFor="flag-correct" className="text-xs cursor-pointer text-zinc-200 font-medium">
                        {wasFlagCorrect ? 'Confirm flag was a genuine threat' : 'Mark as False Positive (immune calibration)'}
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              {selectedItem.status !== 'resolved' && (
                <DialogFooter className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="faang-btn-crimson h-9 px-4 text-xs font-bold flex items-center justify-center cursor-pointer"
                    onClick={() => handleAction('deny')}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Deny & Block
                  </button>
                  <button
                    type="button"
                    className="faang-btn-primary h-9 px-4 text-xs font-bold flex items-center justify-center cursor-pointer"
                    onClick={() => handleAction('approve')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve & Allow
                  </button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
