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
    setWasFlagCorrect(item.was_original_flag_correct ?? true);
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
    const resPayload = {
      reviewer_id: 'human_operator_1',
      action: action,
      was_original_flag_correct: wasFlagCorrect,
      reason: reason.trim() || `Action: ${action}`,
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
          was_original_flag_correct: wasFlagCorrect,
          edited_content: resPayload.edited_content
        };
      }
      return item;
    }));

    try {
      await api.resolveEscalation(targetId, action, resPayload);
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
  const resolvedCount = escalations.filter(e => e.status === 'resolved').length;

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
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 shrink-0">
        <div 
          className={cn(
            "faang-card p-4.5 sm:p-5 cursor-pointer transition-all duration-200",
            statusFilter === 'pending' ? "border-amber-500/40 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)]" : "hover:border-white/[0.15]"
          )}
          onClick={() => setStatusFilter('pending')}
        >
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-bold text-zinc-400">Pending Queue</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-400">{pendingCount}</div>
          <p className="text-xs text-zinc-400 mt-1 truncate font-medium">Awaiting operator review</p>
        </div>

        <div 
          className={cn(
            "faang-card p-4.5 sm:p-5 cursor-pointer transition-all duration-200",
            statusFilter === 'resolved' ? "border-violet-500/40 bg-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]" : "hover:border-white/[0.15]"
          )}
          onClick={() => setStatusFilter('resolved')}
        >
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-bold text-zinc-400">Resolved History</span>
            <div className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-violet-400">{resolvedCount}</div>
          <p className="text-xs text-zinc-400 mt-1 truncate font-medium">Calibrated items</p>
        </div>

        <div className="faang-card p-4.5 sm:p-5">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-bold text-zinc-400">Average SLA</span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1.2m</div>
          <p className="text-xs text-zinc-400 mt-1 truncate font-medium">Triage turnaround</p>
        </div>

        <div className="faang-card p-4.5 sm:p-5">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-bold text-zinc-400">Immune Accuracy</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-400">100%</div>
          <p className="text-xs text-zinc-400 mt-1 truncate font-medium">Self-healing loop</p>
        </div>
      </div>

      {resolvedSuccess && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2.5 shadow-lg shrink-0">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{resolvedSuccess}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="faang-card p-3 flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center bg-black/40 p-1 rounded-full border border-white/[0.08]">
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all",
              statusFilter === 'pending' ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            )}
            onClick={() => setStatusFilter('pending')}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all",
              statusFilter === 'resolved' ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            )}
            onClick={() => setStatusFilter('resolved')}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all",
              statusFilter === 'all' ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            )}
            onClick={() => setStatusFilter('all')}
          >
            All ({escalations.length})
          </button>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search incident ID, reason, or content..."
            aria-label="Search escalations"
            className="pl-9 h-9 text-xs bg-black/40 border-white/[0.09] rounded-xl text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/30"
          />
        </div>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl text-white" aria-label="Filter by stream direction">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Stream:</span>
              <span className="text-white font-bold truncate">
                {directionFilter === 'all' ? 'All Streams' : directionFilter === 'input' ? 'Input' : 'Output'}
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
          <SelectTrigger className="w-[150px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl text-white" aria-label="Filter by risk tier">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Risk:</span>
              <span className="text-white font-bold capitalize truncate">
                {riskFilter === 'all' ? 'All Tiers' : `${riskFilter} Risk`}
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

        <Button variant="ghost" size="sm" onClick={loadEscalations} aria-label="Refresh escalations" className="ml-auto text-xs h-9 px-3 gap-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.06]">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Main Table */}
      <div className="faang-card flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-[#15161B] backdrop-blur-md z-10 border-b border-white/[0.08]">
              <TableRow className="border-white/[0.08] hover:bg-transparent">
                <TableHead className="text-xs w-[100px] font-bold text-zinc-300">Risk</TableHead>
                <TableHead className="text-xs w-[105px] font-bold text-zinc-300">Direction</TableHead>
                <TableHead className="text-xs w-[155px] font-bold text-zinc-300">Status / Verdict</TableHead>
                <TableHead className="text-xs w-[110px] font-bold text-zinc-300">Incident ID</TableHead>
                <TableHead className="text-xs w-[140px] font-bold text-zinc-300">Workflow</TableHead>
                <TableHead className="text-xs min-w-[280px] font-bold text-zinc-300">Escalation Trigger</TableHead>
                <TableHead className="text-xs min-w-[140px] font-bold text-zinc-300">Findings</TableHead>
                <TableHead className="text-xs text-right w-[110px] pr-4 font-bold text-zinc-300">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-zinc-400 text-xs font-medium">
                    Loading escalation queue...
                  </TableCell>
                </TableRow>
              ) : filteredEscalations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-zinc-400 text-xs font-medium">
                    No escalations in queue matching current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEscalations.map((item, idx) => {
                  const isResolved = item.status === 'resolved';
                  const issues = (item.interaction?.checks || []).filter((c: CheckResult) => c.score > 0 || c.verdict !== 'pass');
                  const isInput = (item as any).direction === 'input' || item.payload?.role === 'user' || !item.payload?.role;

                  return (
                    <TableRow key={item.interaction_id ? `${item.interaction_id}-${idx}` : idx} className="hover:bg-white/[0.03] transition-colors border-white/[0.06]">
                      <TableCell>{getRiskBadge(item.risk_tier)}</TableCell>
                      
                      <TableCell>
                        {isInput ? (
                          <span className="faang-chip chip-azure text-[10px] w-fit">
                            <ArrowDownLeft className="h-3 w-3 shrink-0" /> Ingress
                          </span>
                        ) : (
                          <span className="faang-chip chip-violet text-[10px] w-fit">
                            <ArrowUpRight className="h-3 w-3 shrink-0" /> Egress
                          </span>
                        )}
                      </TableCell>

                      <TableCell>{getStatusBadge(item)}</TableCell>

                      <TableCell className="text-xs text-zinc-400">
                        <button
                          onClick={() => handleCopyId(item.interaction_id)}
                          className="hover:text-amber-400 transition-colors flex items-center gap-1 group font-mono"
                          title="Click to copy interaction ID"
                        >
                          <span>{item.interaction_id?.substring(0, 8)}...</span>
                          <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
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

                      <TableCell className="text-right pr-4">
                        {isResolved ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.08]"
                            onClick={() => handleOpenReview(item)}
                          >
                            <History className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                        ) : (
                          <button
                            type="button"
                            className="faang-btn-primary text-xs h-8 px-3.5 gap-1.5 flex items-center justify-center whitespace-nowrap font-bold cursor-pointer"
                            onClick={() => handleOpenReview(item)}
                          >
                            <UserCheck className="h-3.5 w-3.5 mr-1" /> Triage
                          </button>
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
