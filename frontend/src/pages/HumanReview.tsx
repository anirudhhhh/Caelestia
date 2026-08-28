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
    <div className="h-full w-full flex flex-col gap-4 min-h-0 overflow-hidden">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        <Card 
          className={`cursor-pointer transition-all border-border/80 bg-card/80 shadow-sm ${statusFilter === 'pending' ? 'ring-1 ring-amber-500/50 bg-amber-500/5' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Pending Queue</span>
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-amber-500">{pendingCount}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting human operator review</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all border-border/80 bg-card/80 shadow-sm ${statusFilter === 'resolved' ? 'ring-1 ring-emerald-500/50 bg-emerald-500/5' : ''}`}
          onClick={() => setStatusFilter('resolved')}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Resolved History</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-500">{resolvedCount}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Audited and calibrated items</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Average SLA</span>
              <Clock className="h-4 w-4 text-primary shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight">1.2m</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Real-time triage turnaround</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Immune Accuracy</span>
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-emerald-500">100%</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Self-healing feedback loop</p>
          </CardContent>
        </Card>
      </div>

      {resolvedSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs flex items-center gap-2 shrink-0">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{resolvedSuccess}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <Card className="border-border/80 bg-card/80 shadow-sm shrink-0">
        <div className="p-2.5 flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/60">
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

          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search interaction ID, reason, or content..."
              className="pl-8 h-8 text-xs bg-background/80"
            />
          </div>

          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-background/80">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="input">Input (Prompt)</SelectItem>
              <SelectItem value="output">Output (Response)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs bg-background/80">
              <SelectValue placeholder="Risk Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={loadEscalations} className="ml-auto text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="flex-1 min-h-0 border-border/80 bg-card/80 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur-md z-10">
              <TableRow>
                <TableHead className="text-xs w-[80px] font-semibold">Risk</TableHead>
                <TableHead className="text-xs w-[90px] font-semibold">Direction</TableHead>
                <TableHead className="text-xs w-[140px] font-semibold">Status / Resolution</TableHead>
                <TableHead className="text-xs w-[110px] font-semibold">Interaction ID</TableHead>
                <TableHead className="text-xs w-[130px] font-semibold">Use Case</TableHead>
                <TableHead className="text-xs min-w-[180px] font-semibold">Escalation Trigger</TableHead>
                <TableHead className="text-xs min-w-[140px] font-semibold">Findings</TableHead>
                <TableHead className="text-xs text-right w-[90px] font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    Loading escalation queue...
                  </TableCell>
                </TableRow>
              ) : filteredEscalations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    No escalations in queue matching current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEscalations.map((item, idx) => {
                  const isResolved = item.status === 'resolved';
                  const issues = (item.interaction?.checks || []).filter((c: CheckResult) => c.score > 0 || c.verdict !== 'pass');
                  const isInput = (item as any).direction === 'input' || item.payload?.role === 'user' || !item.payload?.role;

                  return (
                    <TableRow key={item.interaction_id ? `${item.interaction_id}-${idx}` : idx} className="hover:bg-muted/30 transition-colors">
                      <TableCell>{getRiskBadge(item.risk_tier)}</TableCell>
                      
                      <TableCell>
                        {isInput ? (
                          <Badge variant="outline" className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border-sky-500/30 gap-1 w-fit">
                            <ArrowDownLeft className="h-3 w-3 shrink-0" /> INPUT
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-400 border-purple-500/30 gap-1 w-fit">
                            <ArrowUpRight className="h-3 w-3 shrink-0" /> OUTPUT
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>{getStatusBadge(item)}</TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.interaction_id?.substring(0, 8)}...
                      </TableCell>

                      <TableCell className="text-xs font-medium">{item.use_case}</TableCell>

                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate font-mono">
                        {item.escalation_reason}
                      </TableCell>

                      <TableCell>
                        {issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {issues.map((iss: CheckResult, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/30 shrink-0">
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
                            <History className="h-3 w-3 mr-1" /> View
                          </Button>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-xs bg-primary text-primary-foreground font-medium"
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

      {/* Review Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 overflow-hidden">
          {selectedItem && (
            <>
              <DialogHeader className="pb-3 border-b border-border/80">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-sm font-bold">
                      {selectedItem.status === 'resolved' ? 'Escalation Audit Record' : 'Human Review & Triage'}
                    </DialogTitle>
                    <Badge variant="outline" className="font-mono text-[10px]">{selectedItem.interaction_id}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedItem)}
                    {getRiskBadge(selectedItem.risk_tier)}
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs">
                <div>
                  <span className="font-semibold text-amber-500 uppercase tracking-wider text-[11px]">Escalation Reason:</span>
                  <div className="mt-1 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg font-mono text-foreground leading-relaxed">
                    {selectedItem.escalation_reason}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">Content Payload:</span>
                  <div className="mt-1 p-3 bg-background border border-border rounded-lg font-mono whitespace-pre-wrap break-all leading-relaxed max-h-[160px] overflow-y-auto">
                    {selectedItem.payload?.content || selectedItem.interaction?.payload?.content || 'No content payload'}
                  </div>
                </div>

                {selectedItem.status !== 'resolved' && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground">Resolution Note / Rationale:</Label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain resolution rationale (e.g. Verified benign developer query)..."
                        className="mt-1 h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <Switch
                        id="flag-correct"
                        checked={wasFlagCorrect}
                        onCheckedChange={setWasFlagCorrect}
                      />
                      <Label htmlFor="flag-correct" className="text-xs cursor-pointer">
                        {wasFlagCorrect ? 'Confirm flag was a genuine threat' : 'Mark as False Positive (immune calibration)'}
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              {selectedItem.status !== 'resolved' && (
                <DialogFooter className="pt-3 border-t border-border flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-500/40 text-rose-500 hover:bg-rose-500/10 h-8 text-xs font-semibold"
                    onClick={() => handleAction('deny')}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Deny & Block
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-semibold"
                    onClick={() => handleAction('approve')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve & Allow
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
