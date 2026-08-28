import { useState, useEffect } from 'react';
import { Search, Filter, ArrowRight, Activity, ShieldAlert, ShieldCheck, ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, Copy, Check, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import type { AuditEvent } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';

export default function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [useCaseFilter, setUseCaseFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [useCaseFilter, actionFilter, directionFilter]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (useCaseFilter !== 'all') filters.use_case = useCaseFilter;
      if (actionFilter !== 'all') filters.action = actionFilter;
      if (directionFilter !== 'all') filters.direction = directionFilter;
      
      const [eventsData, statsData] = await Promise.all([
        api.getEvents(filters).catch(() => []),
        api.getEventStats().catch(() => ({ 
          total: 0, block_rate: 0, flag_rate: 0, escalate_rate: 0 
        }))
      ]);
      
      setEvents(eventsData);
      setStats(statsData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getActionBadge = (action: string) => {
    switch (action?.toLowerCase()) {
      case 'allow':
        return <span className="faang-chip chip-emerald">ALLOW</span>;
      case 'block':
        return <span className="faang-chip chip-crimson">BLOCK</span>;
      case 'flag':
        return <span className="faang-chip chip-amber">FLAG</span>;
      case 'escalate':
        return <span className="faang-chip chip-violet">ESCALATE</span>;
      default:
        return <span className="faang-chip chip-neutral">{action?.toUpperCase() || 'UNKNOWN'}</span>;
    }
  };

  const filteredEvents = events.filter((event) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idMatch = event.interaction_id?.toLowerCase().includes(q);
    const contentMatch = event.interaction?.payload?.content?.toLowerCase().includes(q);
    const checkMatch = (event.interaction?.checks || []).some(
      (c) => c.check_name.toLowerCase().includes(q) || (c.score > 0 && String(c.score).includes(q))
    );
    return idMatch || contentMatch || checkMatch;
  });

  return (
    <div className="h-full w-full flex flex-col gap-4 sm:gap-5 min-h-0 overflow-hidden font-sans">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 shrink-0">
        <div className="faang-card p-4.5 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400">Total Audited Events</span>
            <div className="h-8 w-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-zinc-300">
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {stats?.total?.toLocaleString() || '0'}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 truncate font-medium">Ingress & Egress telemetry</p>
        </div>

        <div className="faang-card p-4.5 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400">Perimeter Block Rate</span>
            <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-rose-400">
            {stats?.block_rate != null ? `${stats.block_rate}%` : '0%'}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 truncate font-medium">Violations stopped at ingress</p>
        </div>

        <div className="faang-card p-4.5 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400">Warning Flag Rate</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-400">
            {stats?.flag_rate != null ? `${stats.flag_rate}%` : '0%'}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 truncate font-medium">Low-confidence flags</p>
        </div>

        <div className="faang-card p-4.5 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400">Human Escalations</span>
            <div className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-violet-400">
            {stats?.escalate_rate != null ? `${stats.escalate_rate}%` : (stats?.escalation_rate != null ? `${stats.escalation_rate}%` : '0%')}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 truncate font-medium">Appeals routed to human queue</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="faang-card p-3 flex flex-wrap items-center gap-3 shrink-0">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search interaction ID, payload, or check..."
            aria-label="Search audit events"
            className="pl-9 h-9 text-xs bg-black/40 border-white/[0.09] rounded-xl text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/30"
          />
        </div>
        
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl text-white" aria-label="Filter by stream direction">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Stream:</span>
              <span className="text-white font-bold truncate">
                {directionFilter === 'all' ? 'All Streams' : directionFilter === 'input' ? 'Ingress' : 'Egress'}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl">
            <SelectItem value="all">All Streams</SelectItem>
            <SelectItem value="input">Input (Ingress)</SelectItem>
            <SelectItem value="output">Output (Egress)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl text-white" aria-label="Filter by workflow">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Workflow:</span>
              <span className="text-white font-bold truncate">
                {useCaseFilter === 'all' ? 'All Workflows' : 
                 useCaseFilter === 'customer_support' ? 'Customer Support' :
                 useCaseFilter === 'internal_copilot' ? 'Internal Copilot' :
                 useCaseFilter === 'decision_support' ? 'Decision Support' : 'Security & Legal'}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl">
            <SelectItem value="all">All Workflows</SelectItem>
            <SelectItem value="customer_support">Customer Support</SelectItem>
            <SelectItem value="internal_copilot">Internal Copilot</SelectItem>
            <SelectItem value="decision_support">Decision Support</SelectItem>
            <SelectItem value="legal_compliance">Security & Legal</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[150px] h-9 text-xs font-bold bg-white/[0.04] border-white/[0.09] rounded-xl text-white" aria-label="Filter by decision action">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Action:</span>
              <span className="text-white font-bold capitalize truncate">
                {actionFilter === 'all' ? 'All Actions' : actionFilter}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="bg-[#15161B] border-white/[0.1] rounded-xl">
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="block">Block</SelectItem>
            <SelectItem value="flag">Flag</SelectItem>
            <SelectItem value="escalate">Escalate</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={loadData} aria-label="Refresh audit trail" className="ml-auto text-xs h-9 px-3 gap-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.06]">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Main Audit Table */}
      <div className="faang-card flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-[#15161B] backdrop-blur-md z-10 border-b border-white/[0.08]">
              <TableRow className="border-white/[0.08] hover:bg-transparent">
                <TableHead className="text-xs w-[130px] font-bold text-zinc-300">Timestamp</TableHead>
                <TableHead className="text-xs w-[100px] font-bold text-zinc-300">Direction</TableHead>
                <TableHead className="text-xs w-[110px] font-bold text-zinc-300">Incident ID</TableHead>
                <TableHead className="text-xs w-[140px] font-bold text-zinc-300">Workflow / Geo</TableHead>
                <TableHead className="text-xs min-w-[200px] font-bold text-zinc-300">Guardrail Findings</TableHead>
                <TableHead className="text-xs w-[90px] font-bold text-zinc-300">Risk</TableHead>
                <TableHead className="text-xs w-[95px] font-bold text-zinc-300">Decision</TableHead>
                <TableHead className="text-xs text-right w-[90px] pr-5 font-bold text-zinc-300">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-zinc-400 text-xs font-medium">
                    Loading ledger stream...
                  </TableCell>
                </TableRow>
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-zinc-400 text-xs font-medium">
                    No audit records matching current query.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event, idx) => {
                  const checks = event.interaction?.checks || [];
                  const issues = checks.filter((c) => (c.score > 0 || c.verdict !== 'pass'));
                  const isInput = event.direction === 'input';

                  return (
                    <TableRow key={event.interaction_id ? `${event.interaction_id}-${event.direction}-${idx}` : idx} className="hover:bg-white/[0.03] transition-colors border-white/[0.06]">
                      <TableCell className="text-xs font-mono text-zinc-400 whitespace-nowrap">
                        {event.timestamp ? format(new Date(event.timestamp), 'MMM d, HH:mm:ss') : 'Just now'}
                      </TableCell>
                      
                      <TableCell>
                        {isInput ? (
                          <span className="faang-chip chip-azure text-[10px] gap-1 w-fit">
                            <ArrowDownLeft className="h-3 w-3 shrink-0" /> INGRESS
                          </span>
                        ) : (
                          <span className="faang-chip chip-violet text-[10px] gap-1 w-fit">
                            <ArrowUpRight className="h-3 w-3 shrink-0" /> EGRESS
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="font-mono text-xs text-zinc-400">
                        {event.interaction_id?.substring(0, 8)}...
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs font-bold text-zinc-200">{event.use_case}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">{event.geography}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {issues.map((iss, i) => (
                              <span
                                key={i}
                                className={`faang-chip text-[10px] shrink-0 ${
                                  iss.verdict === 'fail'
                                    ? 'chip-crimson'
                                    : 'chip-amber'
                                }`}
                              >
                                {iss.check_name}: {iss.score.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Clean (0.00)
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className={`faang-chip uppercase text-[10px] font-bold ${
                          event.risk_tier === 'high' ? 'chip-crimson' :
                          event.risk_tier === 'medium' ? 'chip-amber' :
                          'chip-emerald'
                        }`}>
                          {event.risk_tier || 'LOW'}
                        </span>
                      </TableCell>

                      <TableCell>
                        {getActionBadge((event as any).action || event.interaction?.decision?.action || 'allow')}
                      </TableCell>

                      <TableCell className="text-right pr-4">
                        <Dialog>
                          <DialogTrigger className="faang-btn-ghost text-xs h-7 px-3 text-zinc-300 hover:text-white cursor-pointer inline-flex items-center justify-center">
                            View
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-[#15161B] border-white/[0.1] text-white">
                            <DialogHeader>
                              <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
                                <span>Audit Event Detail</span>
                                <span className="faang-chip chip-neutral font-mono text-[10px]">{event.interaction_id}</span>
                              </DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="flex-1 pr-3">
                              <div className="space-y-3.5 text-xs">
                                <div>
                                  <span className="font-bold text-zinc-400">Payload Content:</span>
                                  <div className="mt-1 p-3 bg-black/50 rounded-xl font-mono text-[11px] whitespace-pre-wrap break-all border border-white/[0.08] text-zinc-200">
                                    {event.interaction?.payload?.content || 'No content'}
                                  </div>
                                </div>

                                <div>
                                  <span className="font-bold text-zinc-400">Guardrail Checks:</span>
                                  <div className="mt-1 space-y-1.5">
                                    {(event.interaction?.checks || []).map((c, i) => (
                                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/[0.06]">
                                        <span className="font-bold text-zinc-200">{c.check_name}</span>
                                        <div className="flex items-center gap-2 font-mono">
                                          <span className="text-zinc-300">Score: {c.score.toFixed(2)}</span>
                                          <span className={`faang-chip text-[9px] ${c.verdict === 'fail' ? 'chip-crimson' : c.verdict === 'warn' ? 'chip-amber' : 'chip-emerald'}`}>
                                            {c.verdict.toUpperCase()}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
