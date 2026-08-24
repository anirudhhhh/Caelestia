import { useState, useEffect } from 'react';
import { 
  UserCheck, Clock, CheckCircle2, XCircle, Edit, AlertTriangle, 
  Search, Filter, ShieldAlert, Sparkles, Check, ArrowRight, 
  ArrowDownLeft, ArrowUpRight, Copy, History, ShieldCheck
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

export default function HumanReview() {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<EscalationItem | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Review form state
  const [reason, setReason] = useState('');
  const [editedPayload, setEditedPayload] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [wasFlagCorrect, setWasFlagCorrect] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    
    setIsSubmitting(true);
    try {
      const resPayload = {
        reviewer_id: 'human_operator_1',
        action: action,
        was_original_flag_correct: wasFlagCorrect,
        reason: reason.trim() || `Action: ${action}`,
        edited_content: isEditing ? editedPayload : undefined
      };

      await api.resolveEscalation(selectedItem.interaction_id, action, resPayload);

      // Update local state to mark resolved with resolution details
      setEscalations(prev => prev.map(item => {
        if (item.interaction_id === selectedItem.interaction_id) {
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

      setResolvedSuccess(`Escalation ${selectedItem.interaction_id.substring(0, 8)} successfully resolved as ${action.toUpperCase()}`);
      setTimeout(() => setResolvedSuccess(null), 4000);
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to resolve escalation', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRiskBadge = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'high':
        return <Badge variant="outline" className="text-[10px] font-mono border-rose-500/50 text-rose-500 bg-rose-500/10 shrink-0">HIGH</Badge>;
      case 'medium':
        return <Badge variant="outline" className="text-[10px] font-mono border-amber-500/50 text-amber-500 bg-amber-500/10 shrink-0">MEDIUM</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/50 text-emerald-500 bg-emerald-500/10 shrink-0">LOW</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] font-mono shrink-0">{tier?.toUpperCase() || 'UNKNOWN'}</Badge>;
    }
  };

  const getStatusBadge = (item: EscalationItem) => {
    if (item.status === 'resolved') {
      const res = (item.resolution || '').toLowerCase();
      if (res.includes('deny') || res === 'block') {
        return (
          <Badge variant="outline" className="text-[10px] font-mono border-rose-500/50 text-rose-400 bg-rose-500/10 flex items-center gap-1">
            <XCircle className="h-3 w-3" /> DENIED (BLOCKED)
          </Badge>
        );
      }
      if (res.includes('edit')) {
        return (
          <Badge variant="outline" className="text-[10px] font-mono border-sky-500/50 text-sky-400 bg-sky-500/10 flex items-center gap-1">
            <Edit className="h-3 w-3" /> EDITED & APPROVED
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/50 text-emerald-400 bg-emerald-500/10 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> APPROVED (ALLOWED)
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] font-mono border-amber-500/50 text-amber-400 bg-amber-500/10 flex items-center gap-1">
        <Clock className="h-3 w-3" /> PENDING REVIEW
      </Badge>
    );
  };

  const pendingCount = escalations.filter(e => e.status !== 'resolved').length;
  const resolvedCount = escalations.filter(e => e.status === 'resolved').length;

  const filteredEscalations = escalations.filter((item) => {
    // Status filter
    if (statusFilter === 'pending' && item.status === 'resolved') return false;
    if (statusFilter === 'resolved' && item.status !== 'resolved') return false;

    // Risk filter
    if (riskFilter !== 'all' && item.risk_tier?.toLowerCase() !== riskFilter.toLowerCase()) {
      return false;
    }

    // Direction filter
    const itemDirection = (item as any).direction || (item.payload?.role === 'assistant' ? 'output' : 'input');
    if (directionFilter !== 'all' && itemDirection.toLowerCase() !== directionFilter.toLowerCase()) {
      return false;
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idMatch = item.interaction_id?.toLowerCase().includes(q);
    const reasonMatch = item.escalation_reason?.toLowerCase().includes(q);
    const content = item.payload?.content || item.interaction?.payload?.content || '';
    const contentMatch = content.toLowerCase().includes(q);
    return idMatch || reasonMatch || contentMatch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Human Escalation & Review Console</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit flagged prompts, resolve policy escalations, and train the Immune System accuracy.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadEscalations} className="text-xs h-8">
          Refresh Queue
        </Button>
      </div>

      {resolvedSuccess && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{resolvedSuccess}</span>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-colors ${statusFilter === 'pending' ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Pending Escalations</p>
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold text-amber-500">{pendingCount}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting operator action</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${statusFilter === 'resolved' ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
          onClick={() => setStatusFilter('resolved')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Resolved History</p>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold text-emerald-500">{resolvedCount}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Archived with audit trail</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Avg Resolution SLA</p>
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <div className="text-2xl font-bold">1.2m</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Real-time throughput</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Immune Accuracy</p>
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            </div>
            <div className="text-2xl font-bold">100%</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Feedback loop calibrated</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card>
        <div className="p-3 flex flex-wrap items-center gap-3">
          {/* Status View Selector */}
          <div className="flex items-center bg-muted/40 p-0.5 rounded-md border border-border">
            <Button
              variant={statusFilter === 'pending' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({pendingCount})
            </Button>
            <Button
              variant={statusFilter === 'resolved' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setStatusFilter('resolved')}
            >
              Resolved ({resolvedCount})
            </Button>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setStatusFilter('all')}
            >
              All ({escalations.length})
            </Button>
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, reason, or content..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* Direction Filter */}
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs font-mono">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="input">Input (Prompt)</SelectItem>
              <SelectItem value="output">Output (Response)</SelectItem>
            </SelectContent>
          </Select>

          {/* Risk Tier Filter */}
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="Risk Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Tiers</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Escalation Queue Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[85px]">Risk</TableHead>
                <TableHead className="text-xs w-[100px]">Direction</TableHead>
                <TableHead className="text-xs w-[160px]">Status / Verdict</TableHead>
                <TableHead className="text-xs w-[110px]">Interaction ID</TableHead>
                <TableHead className="text-xs w-[130px]">Use Case</TableHead>
                <TableHead className="text-xs min-w-[180px]">Escalation Reason</TableHead>
                <TableHead className="text-xs min-w-[150px]">Detected Flags</TableHead>
                <TableHead className="text-xs text-right w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    Loading escalation queue...
                  </TableCell>
                </TableRow>
              ) : filteredEscalations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    {statusFilter === 'pending'
                      ? 'No pending reviews! All escalations have been resolved.'
                      : 'No records match the selected filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredEscalations.map((item) => {
                  const checks: CheckResult[] = item.checks || item.interaction?.checks || [];
                  const issues = checks.filter(c => c.score > 0 || c.verdict !== 'pass');
                  const isInput = (item as any).direction === 'input' || item.payload?.role === 'user' || !item.payload?.role;
                  const isResolved = item.status === 'resolved';

                  return (
                    <TableRow key={item.interaction_id} className={isResolved ? 'opacity-85' : ''}>
                      <TableCell>
                        {getRiskBadge(item.risk_tier)}
                      </TableCell>

                      {/* Direction Badge */}
                      <TableCell>
                        {isInput ? (
                          <Badge variant="outline" className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border-sky-500/30 flex items-center gap-1 w-fit">
                            <ArrowDownLeft className="h-3 w-3 shrink-0" /> INPUT
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-400 border-purple-500/30 flex items-center gap-1 w-fit">
                            <ArrowUpRight className="h-3 w-3 shrink-0" /> OUTPUT
                          </Badge>
                        )}
                      </TableCell>

                      {/* Status / Verdict Badge */}
                      <TableCell>
                        {getStatusBadge(item)}
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.interaction_id.substring(0, 8)}...
                      </TableCell>

                      <TableCell className="text-xs font-medium">
                        {item.use_case}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={item.escalation_reason}>
                        {item.escalation_reason}
                      </TableCell>

                      <TableCell>
                        {issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {issues.map((iss, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/30 shrink-0"
                              >
                                {iss.check_name}: {iss.score.toFixed(2)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Policy Warning</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {isResolved ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenReview(item)}
                          >
                            <History className="h-3 w-3 mr-1" /> View Audit
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-xs bg-primary text-primary-foreground"
                            onClick={() => handleOpenReview(item)}
                          >
                            Review <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Review & Audit Modal Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="w-[95vw] max-w-5xl max-h-[88vh] flex flex-col p-5 sm:p-6 overflow-hidden">
          {selectedItem && (() => {
            const isInput = (selectedItem as any).direction === 'input' || selectedItem.payload?.role === 'user' || !selectedItem.payload?.role;
            const isResolved = selectedItem.status === 'resolved';

            return (
              <>
                <DialogHeader className="pr-8 pb-3 border-b border-border/80">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <DialogTitle className="text-sm font-semibold">
                        {isResolved ? 'Escalation Audit Record:' : 'Human Review:'}
                      </DialogTitle>
                      <div className="flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                        <span className="font-mono text-xs text-muted-foreground truncate max-w-[180px] sm:max-w-[260px]">
                          {selectedItem.interaction_id}
                        </span>
                        <button
                          onClick={() => handleCopyId(selectedItem.interaction_id)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="Copy Full Interaction ID"
                        >
                          {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(selectedItem)}
                      {getRiskBadge(selectedItem.risk_tier)}
                    </div>
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    {isResolved 
                      ? 'Historical audit record and operator resolution feedback for this interaction.'
                      : `Evaluate the flagged ${isInput ? 'user input prompt' : 'model output response'} and resolve the policy action.`}
                  </DialogDescription>
                </DialogHeader>
                
                {/* 2-Column Responsive Body */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0 overflow-hidden pt-2">
                  {/* Left Column: Context & Checks */}
                  <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 overflow-hidden">
                    <ScrollArea className="flex-1 pr-3">
                      <div className="space-y-4 pb-2">
                        {/* Resolved Outcome Info Box if resolved */}
                        {isResolved && (
                          <div className="bg-muted/40 border border-border p-3 rounded-md space-y-1.5 text-xs">
                            <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                              <span>Reviewed by: <strong className="text-foreground">{selectedItem.resolved_by || 'human_operator_1'}</strong></span>
                              <span>{selectedItem.resolved_at ? format(new Date(selectedItem.resolved_at), 'MMM dd, HH:mm:ss') : 'Recently'}</span>
                            </div>
                            <div className="text-xs">
                              <span className="font-medium text-foreground">Resolution Note: </span>
                              <span className="text-muted-foreground">{selectedItem.resolution_reason || 'Verified and resolved by operator.'}</span>
                            </div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              Classification: <span className="font-semibold text-foreground">{selectedItem.was_original_flag_correct ? 'True Positive Violation' : 'False Positive Clean'}</span>
                            </div>
                          </div>
                        )}

                        {/* Escalation Reason Box */}
                        <div>
                          <h4 className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Escalation Reason
                          </h4>
                          <div className="text-xs text-foreground bg-amber-500/10 border border-amber-500/20 p-3 rounded-md font-mono whitespace-pre-wrap break-words">
                            {selectedItem.escalation_reason}
                          </div>
                        </div>
                        
                        {/* Payload Content Box */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              {isInput ? 'User Input Prompt' : 'AI Assistant Output Response'}
                            </h4>
                            {!isResolved && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] text-primary"
                                onClick={() => setIsEditing(!isEditing)}
                              >
                                <Edit className="h-3 w-3 mr-1" /> {isEditing ? 'Cancel Edit' : 'Edit Payload'}
                              </Button>
                            )}
                          </div>

                          {isEditing && !isResolved ? (
                            <Textarea
                              value={editedPayload}
                              onChange={(e) => setEditedPayload(e.target.value)}
                              className="font-mono text-xs min-h-[110px] bg-background resize-y"
                            />
                          ) : (
                            <div className="bg-background border border-border p-3.5 rounded-md font-mono text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground max-h-[160px] overflow-y-auto">
                              {selectedItem.edited_content || selectedItem.payload?.content || selectedItem.interaction?.payload?.content || 'No payload recorded.'}
                            </div>
                          )}
                        </div>

                        {/* Checks & Telemetry */}
                        <div>
                          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Triggered Security Checks & Telemetry
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {(selectedItem.checks || selectedItem.interaction?.checks || []).map((c, i) => (
                              <div key={i} className="bg-card border border-border p-2.5 rounded-md text-xs space-y-1.5">
                                <div className="flex justify-between items-center gap-2">
                                  <span className="font-medium text-foreground font-mono truncate">{c.check_name}</span>
                                  <Badge variant="outline" className={`text-[10px] shrink-0 ${c.verdict === 'warn' ? 'text-amber-500 border-amber-500/30' : 'text-muted-foreground'}`}>
                                    {c.verdict?.toUpperCase() || 'PASS'}
                                  </Badge>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-muted-foreground text-[10px] font-mono">
                                    <span>Score: {c.score.toFixed(2)}</span>
                                    <span className="truncate max-w-[110px]">{c.engine}</span>
                                  </div>
                                  <Progress value={c.score * 100} className="h-1" />
                                </div>
                                {c.details && Object.keys(c.details).length > 0 && (
                                  <div className="pt-1 text-[10px] font-mono text-muted-foreground border-t border-border/50 truncate" title={JSON.stringify(c.details)}>
                                    {JSON.stringify(c.details)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Right Column: Review Action Form */}
                  <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4 bg-muted/20 border border-border/80 p-4 rounded-lg min-h-0 overflow-y-auto">
                    {isResolved ? (
                      <div className="flex flex-col h-full justify-between gap-4">
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-foreground">Audit Resolution</h4>
                          <div className="p-3 rounded-md bg-background border border-border text-xs space-y-2">
                            <div>
                              <span className="text-muted-foreground text-[11px]">Final Action: </span>
                              <strong className="text-foreground uppercase font-mono">{selectedItem.resolution}</strong>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-[11px]">Operator Rationale: </span>
                              <p className="mt-0.5 text-foreground leading-relaxed">{selectedItem.resolution_reason || 'No note provided'}</p>
                            </div>
                          </div>
                        </div>

                        <Button 
                          variant="outline" 
                          className="w-full text-xs h-9" 
                          onClick={() => setSelectedItem(null)}
                        >
                          Close Audit Details
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3.5">
                          <div className="space-y-1.5">
                            <Label htmlFor="reason" className="text-xs font-medium">Operator Rationale / Note</Label>
                            <Textarea
                              id="reason"
                              placeholder="Explain decision rationale..."
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              className="min-h-[85px] text-xs resize-none bg-background"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-3 border border-border/80 p-3 rounded-md bg-background">
                            <Label htmlFor="flag-correct" className="text-xs flex-1 cursor-pointer select-none">
                              <span className="font-medium text-foreground">Flag Accuracy</span>
                              <p className="text-[10px] text-muted-foreground font-normal mt-0.5 leading-tight">
                                Calibrates Immune System accuracy
                              </p>
                            </Label>
                            <Switch
                              id="flag-correct"
                              checked={wasFlagCorrect}
                              onCheckedChange={setWasFlagCorrect}
                            />
                          </div>
                        </div>

                        <div className="space-y-2 mt-auto pt-2">
                          <Button 
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 font-medium" 
                            onClick={() => handleAction('approve')}
                            disabled={isSubmitting}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Approve (Allow)
                          </Button>

                          {isEditing && (
                            <Button 
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs h-9 font-medium" 
                              onClick={() => handleAction('edit_approve')}
                              disabled={isSubmitting}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Save Edits & Approve
                            </Button>
                          )}

                          <Button 
                            variant="destructive" 
                            className="w-full text-xs h-9 font-medium" 
                            onClick={() => handleAction('deny')}
                            disabled={isSubmitting}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Deny (Confirm Block)
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
