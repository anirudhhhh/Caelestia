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
import AnimatedCounter from '@/components/reactbits/AnimatedCounter';
import DecryptedText from '@/components/reactbits/DecryptedText';
import SpotlightCard from '@/components/reactbits/SpotlightCard';

export default function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [useCaseFilter, setUseCaseFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

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
      {/* Top Metric Ribbon (Integrated, Unboxed) */}
      <div className="metric-ribbon grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07] shrink-0 overflow-hidden">
        <div className="metric-item">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Audited Events</span>
            <Activity className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-white">
            <AnimatedCounter value={stats?.total ?? 476} />
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Ingress & Egress telemetry</p>
        </div>

        <div className="metric-item">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Perimeter Block Rate</span>
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-rose-400">
            <AnimatedCounter 
              value={typeof stats?.block_rate === 'number' ? stats.block_rate : parseFloat(stats?.block_rate) || 53.4} 
              decimals={1} 
              suffix="%" 
            />
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Violations stopped at ingress</p>
        </div>

        <div className="metric-item">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Warning Flag Rate</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-amber-400">
            <AnimatedCounter 
              value={typeof stats?.flag_rate === 'number' ? stats.flag_rate : parseFloat(stats?.flag_rate) || 2.1} 
              decimals={1} 
              suffix="%" 
            />
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Low-confidence flags</p>
        </div>

        <div className="metric-item">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Human Escalations</span>
            <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-violet-400">
            <AnimatedCounter value={stats?.escalate_count != null ? stats.escalate_count : (stats?.escalation_count ?? 9)} />
            <span className="text-xs font-semibold text-zinc-400 ml-1.5">
              ({stats?.escalate_rate != null ? `${stats.escalate_rate}%` : '1.9%'})
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-medium">Appeals routed to human queue</p>
        </div>
      </div>

      {/* Unboxed Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 py-0.5">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search interaction ID, payload, or check..."
            aria-label="Search audit events"
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

        <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
          <SelectTrigger className="w-[180px] h-8.5 text-xs font-bold bg-white/[0.04] border-white/[0.08] rounded-full text-white" aria-label="Filter by workflow">
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
          <SelectTrigger className="w-[140px] h-8.5 text-xs font-bold bg-white/[0.04] border-white/[0.08] rounded-full text-white" aria-label="Filter by decision action">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-zinc-400 text-xs">Action:</span>
              <span className="text-white font-bold capitalize truncate">
                {actionFilter === 'all' ? 'All' : actionFilter}
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

        <Button variant="ghost" size="sm" onClick={loadData} aria-label="Refresh audit trail" className="ml-auto text-xs h-8.5 px-3 gap-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.06]">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Main Integrated Audit Table (Borderless) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-b border-white/[0.06] bg-transparent">
        <div className="overflow-auto flex-1 w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-[#0E0F12]/90 backdrop-blur-md z-10 border-b border-white/[0.06]">
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-xs w-[130px] font-bold text-zinc-400">Timestamp</TableHead>
                <TableHead className="text-xs w-[100px] font-bold text-zinc-400">Direction</TableHead>
                <TableHead className="text-xs w-[110px] font-bold text-zinc-400">Incident ID</TableHead>
                <TableHead className="text-xs w-[140px] font-bold text-zinc-400">Workflow / Geo</TableHead>
                <TableHead className="text-xs min-w-[200px] font-bold text-zinc-400">Guardrail Findings</TableHead>
                <TableHead className="text-xs w-[90px] font-bold text-zinc-400">Risk</TableHead>
                <TableHead className="text-xs w-[95px] font-bold text-zinc-400">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-zinc-400 text-xs font-medium">
                    Loading ledger stream...
                  </TableCell>
                </TableRow>
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-zinc-400 text-xs font-medium">
                    No audit records matching current query.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event, idx) => {
                  const checks = event.interaction?.checks || [];
                  const issues = checks.filter((c) => (c.score > 0 || c.verdict !== 'pass'));
                  const isInput = event.direction === 'input';

                  return (
                    <TableRow 
                      key={event.interaction_id ? `${event.interaction_id}-${event.direction}-${idx}` : idx} 
                      onClick={() => setSelectedEvent(event)}
                      className="hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors border-white/[0.04] cursor-pointer group"
                    >
                      <TableCell className="text-xs font-mono text-zinc-400 whitespace-nowrap">
                        {event.timestamp ? format(new Date(event.timestamp), 'MMM d, HH:mm:ss') : 'Just now'}
                      </TableCell>
                      
                      <TableCell>
                        {isInput ? (
                          <span className="faang-chip chip-azure text-[10px] gap-1 w-fit">
                            <ArrowDownLeft className="h-3 w-3 shrink-0" /> INPUT
                          </span>
                        ) : (
                          <span className="faang-chip chip-violet text-[10px] gap-1 w-fit">
                            <ArrowUpRight className="h-3 w-3 shrink-0" /> OUTPUT
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Audit Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-[#15161B] border-white/[0.1] text-white">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Audit Event Detail</span>
                  <span className="faang-chip chip-neutral font-mono text-[10px]">{selectedEvent.interaction_id}</span>
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 pr-3">
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="font-bold text-zinc-400">Payload Content:</span>
                    <div className="mt-1 p-3 bg-black/50 rounded-xl font-mono text-[11px] whitespace-pre-wrap break-all border border-white/[0.08] text-zinc-200">
                      {selectedEvent.interaction?.payload?.content || 'No content'}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-zinc-400">Guardrail Checks:</span>
                    <div className="mt-1 space-y-1.5">
                      {(selectedEvent.interaction?.checks || []).map((c, i) => (
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
