import { useState, useEffect, useMemo } from 'react';
import { 
  UserCheck, Clock, CheckCircle2, XCircle, Edit, AlertTriangle, 
  Search, Filter, ShieldAlert, Sparkles, Check, ArrowRight, 
  ArrowDownLeft, ArrowUpRight, Copy, History, ShieldCheck, RefreshCw,
  FileText, CheckCircle, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EscalationItem, ReviewAction } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { searchCollection, getHighlightSegments } from '@/lib/fuzzy';
import RadialGauge from '@/components/ui/RadialGauge';
import SegmentedProgress from '@/components/ui/SegmentedProgress';


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
          edited_content: isEditing ? editedPayload : undefined
        };
      }
      return item;
    }));

    try {
      await api.resolveEscalation(targetId, action, resPayload);
      loadEscalations();
    } catch (err) {
      console.error('Failed to submit resolution', err);
    }
  };

  // Multi-field fuzzy search over escalation queue
  const filteredItems = useMemo(() => {
    let baseItems = escalations;
    if (statusFilter !== 'all') baseItems = baseItems.filter(item => item.status === statusFilter);
    if (riskFilter !== 'all') baseItems = baseItems.filter(item => item.risk_tier === riskFilter);
    if (directionFilter !== 'all') baseItems = baseItems.filter(item => item.direction === directionFilter);

    if (!searchQuery.trim()) {
      return baseItems;
    }

    const searchRes = searchCollection(baseItems, searchQuery, [
      { key: 'interaction_id', weight: 2.5 },
      { getter: (item) => item.payload?.content || item.interaction?.payload?.content, weight: 2.2 },
      { key: 'escalation_reason', weight: 1.8 },
      { key: 'use_case', weight: 1.5 },
      { key: 'status', weight: 1.3 },
      { key: 'resolution', weight: 1.4 },
      { getter: (item) => item.resolution_reason, weight: 1.4 }
    ]);

    return searchRes.map(res => res.item);
  }, [escalations, statusFilter, riskFilter, directionFilter, searchQuery]);

  const pendingCount = escalations.filter(e => e.status === 'pending').length;
  const resolvedCount = escalations.filter(e => e.status === 'resolved').length;
  const totalCount = escalations.length || 1;
  const resolutionPercentage = Math.round((resolvedCount / totalCount) * 100);

  return (
    <div className="h-full w-full overflow-y-auto space-y-5 sm:space-y-6 pr-1 pb-12 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328] flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-amber-500" />
            Human Escalation & Triage Console
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Operator-in-the-loop security queue & false-positive resolution
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadEscalations} 
            disabled={isLoading} 
            className="bento-btn-secondary h-9 px-3.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Queue</span>
          </Button>
        </div>
      </div>

      {resolvedSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          {resolvedSuccess}
        </div>
      )}

      {/* Top Bento Metrics: Resolution Radial Gauge + Queue Stats */}
      <div id="review-metrics" className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
        {/* Radial Resolution Gauge (4 Cols) */}
        <div className="md:col-span-4 bento-card p-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400">
              Resolution Progress
            </span>
            <h4 className="text-base font-extrabold text-[#212328] mt-0.5">
              Escalation Triage Rate
            </h4>
          </div>

          <div className="my-3 flex justify-center">
            <RadialGauge
              value={resolutionPercentage}
              max={100}
              label="Resolved"
              tipValue={`${resolvedCount} DONE`}
              color="#FFC83B"
              size={135}
              sublabel="Queue clearance percentage"
            />
          </div>

          <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-zinc-500">
            <span>Pending: <strong className="text-amber-600">{pendingCount} items</strong></span>
            <span>Total: {escalations.length}</span>
          </div>
        </div>

        {/* Queue KPI Cards (8 Cols) */}
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bento-card p-5 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500 uppercase">Pending Triage</span>
              <span className="stat-pill bg-amber-500 text-black">QUEUE</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#212328]">{pendingCount}</div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 font-medium">Awaiting operator action</span>
              <SegmentedProgress current={Math.min(pendingCount, 10)} total={10} color="amber" size="sm" />
            </div>
          </div>

          <div className="bento-card p-5 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500 uppercase">Resolved Cases</span>
              <span className="stat-pill bg-emerald-600">COMPLETED</span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#212328]">{resolvedCount}</div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500 font-medium">Verified by human operators</span>
              <SegmentedProgress current={Math.min(resolvedCount, 10)} total={10} color="emerald" size="sm" />
            </div>
          </div>

          <div className="bento-card p-5 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500 uppercase">Average Latency</span>
              <Clock className="h-4 w-4 text-zinc-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#212328]">1.4 min</div>
            <p className="text-[11px] text-zinc-500 font-medium">Average time to operator verdict</p>
          </div>

          <div className="bento-card p-5 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-500 uppercase">Containment Accuracy</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700">98.5%</div>
            <p className="text-[11px] text-zinc-500 font-medium">Zero-trust policy alignment rate</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div id="review-search" className="bento-card p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2.5 items-center flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Fuzzy search ID, reason, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bento-search w-full pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-full border border-black/5">
            {(['pending', 'resolved', 'all'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold capitalize transition-all",
                  statusFilter === st ? "bg-[#212328] text-white shadow-xs" : "text-zinc-500 hover:text-black"
                )}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <span className="text-xs font-bold text-zinc-500">
          Showing {filteredItems.length} of {escalations.length} items
        </span>
      </div>

      {/* Escalation Queue Table / Card List */}
      <div id="review-queue" className="bento-card p-6 space-y-4">

        <div className="space-y-3">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => {
              const isPending = item.status === 'pending';
              const content = item.payload?.content || item.interaction?.payload?.content || '';
              const uniqueKey = `${item.interaction_id}-${item.status || ''}-${item.created_at || idx}-${idx}`;

              return (
                <div
                  key={uniqueKey}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-black/5 transition-all gap-3"
                >

                  <div className="flex items-start gap-3.5">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm shrink-0 mt-0.5",
                      isPending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    )}>
                      {isPending ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-black text-[#212328]">
                          {item.interaction_id.substring(0, 12)}...
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                          isPending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                        )}>
                          {item.status}
                        </span>
                        {item.resolution && (
                          <span className="px-2 py-0.5 rounded-full bg-[#212328] text-white text-[9px] font-black uppercase">
                            {item.resolution}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-400 font-bold">
                          {format(new Date(item.created_at || Date.now()), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-700 font-medium mt-1 line-clamp-2">
                        {content}
                      </p>
                      {item.escalation_reason && (
                        <p className="text-[11px] text-amber-700 font-bold mt-1">
                          Reason: {item.escalation_reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => handleOpenReview(item)}
                      className={cn(
                        "h-8 px-4 text-xs",
                        isPending ? "bento-btn-primary" : "bento-btn-secondary"
                      )}
                    >
                      {isPending ? "Triage Request" : "View Record"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-zinc-500 font-medium">
              No escalation records found matching current filters
            </div>
          )}
        </div>
      </div>

      {/* Review / Triage Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-2xl p-6 sm:p-7 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#212328] flex items-center justify-between">
              <span>Escalation Triage Resolution</span>
              {selectedItem && (
                <button
                  onClick={() => handleCopyId(selectedItem.interaction_id)}
                  className="text-xs font-mono font-bold text-zinc-500 hover:text-black flex items-center gap-1"
                >
                  {copiedId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  {selectedItem.interaction_id.substring(0, 8)}
                </button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Inspect flagged payload, optionally sanitize content, and submit human operator verdict.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Payload Content Area */}
            <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-black/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-700">Flagged Payload Content</span>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1"
                >
                  <Edit className="h-3 w-3" />
                  {isEditing ? "Cancel Edit" : "Sanitize Content"}
                </button>
              </div>

              {isEditing ? (
                <Textarea
                  value={editedPayload}
                  onChange={(e) => setEditedPayload(e.target.value)}
                  rows={4}
                  className="rounded-xl bg-white border-black/10 text-xs font-medium"
                />
              ) : (
                <div className="text-xs font-mono bg-white p-3 rounded-xl border border-black/5 max-h-36 overflow-y-auto whitespace-pre-wrap">
                  {editedPayload}
                </div>
              )}
            </div>

            {/* Operator Reason */}
            <div>
              <label className="text-xs font-bold text-zinc-700 block mb-1">Operator Notes / Rationale</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State why this was approved or denied..."
                className="rounded-xl bg-[#FAF8F5]"
              />
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-black/5 flex flex-wrap gap-2 justify-between">
            <Button variant="ghost" onClick={() => setSelectedItem(null)} className="rounded-full text-xs">
              Close
            </Button>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleAction('deny')}
                className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Deny Threat
              </Button>
              <Button
                onClick={() => handleAction('approve')}
                className="bento-btn-primary text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-[#FFC83B]" />
                Approve as Benign
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
