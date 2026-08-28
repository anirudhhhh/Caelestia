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
        return <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 text-[10px] font-semibold">ALLOW</Badge>;
      case 'block':
        return <Badge className="bg-rose-500/15 text-rose-500 border border-rose-500/30 text-[10px] font-semibold">BLOCK</Badge>;
      case 'flag':
        return <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px] font-semibold">FLAG</Badge>;
      case 'escalate':
        return <Badge className="bg-violet-500/15 text-violet-500 border border-violet-500/30 text-[10px] font-semibold">ESCALATE</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{action || 'UNKNOWN'}</Badge>;
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
    <div className="h-full w-full flex flex-col gap-4 min-h-0 overflow-hidden">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Total Audited Events</span>
              <Activity className="h-4 w-4 text-primary shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.total != null ? stats.total.toLocaleString() : (stats?.total_interactions != null ? stats.total_interactions.toLocaleString() : events.length)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ingress & Egress boundary telemetry</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Perimeter Block Rate</span>
              <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-rose-500">
              {stats?.block_rate != null ? `${stats.block_rate}%` : '0%'}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Policy violations stopped at ingress</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Warning Flag Rate</span>
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-amber-500">
              {stats?.flag_rate != null ? `${stats.flag_rate}%` : '0%'}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Permitted PII / Low-confidence flags</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground">Human Escalations</span>
              <ShieldCheck className="h-4 w-4 text-violet-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold tracking-tight text-violet-500">
              {stats?.escalate_rate != null ? `${stats.escalate_rate}%` : (stats?.escalation_rate != null ? `${stats.escalation_rate}%` : '0%')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Appeals routed to human queue</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-border/80 bg-card/80 shadow-sm shrink-0">
        <div className="p-2.5 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search interaction ID, text, or scanner..."
              className="pl-8 h-8 text-xs bg-background/80"
            />
          </div>
          
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-background/80">
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Streams</SelectItem>
              <SelectItem value="input">Input (Ingress)</SelectItem>
              <SelectItem value="output">Output (Egress)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-background/80">
              <SelectValue placeholder="Use Case" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Use Cases</SelectItem>
              <SelectItem value="customer_support">Customer Support</SelectItem>
              <SelectItem value="internal_copilot">Internal Copilot</SelectItem>
              <SelectItem value="decision_support">Decision Support</SelectItem>
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs bg-background/80">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="allow">Allow</SelectItem>
              <SelectItem value="block">Block</SelectItem>
              <SelectItem value="flag">Flag</SelectItem>
              <SelectItem value="escalate">Escalate</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={loadData} className="ml-auto text-xs h-8 gap-1.5 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Main Audit Table */}
      <Card className="flex-1 min-h-0 border-border/80 bg-card/80 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur-md z-10">
              <TableRow>
                <TableHead className="text-xs w-[130px] font-semibold">Timestamp</TableHead>
                <TableHead className="text-xs w-[100px] font-semibold">Direction</TableHead>
                <TableHead className="text-xs w-[110px] font-semibold">Interaction ID</TableHead>
                <TableHead className="text-xs w-[140px] font-semibold">Use Case / Geo</TableHead>
                <TableHead className="text-xs min-w-[200px] font-semibold">Guardrail Findings</TableHead>
                <TableHead className="text-xs w-[80px] font-semibold">Risk</TableHead>
                <TableHead className="text-xs w-[90px] font-semibold">Decision</TableHead>
                <TableHead className="text-xs text-right w-[80px] font-semibold">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    Loading ledger stream...
                  </TableCell>
                </TableRow>
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-xs">
                    No audit records matching current query.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event, idx) => {
                  const checks = event.interaction?.checks || [];
                  const issues = checks.filter((c) => (c.score > 0 || c.verdict !== 'pass'));
                  const isInput = event.direction === 'input';

                  return (
                    <TableRow key={event.interaction_id ? `${event.interaction_id}-${event.direction}-${idx}` : idx} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {event.timestamp ? format(new Date(event.timestamp), 'MMM d, HH:mm:ss') : 'Just now'}
                      </TableCell>
                      
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

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {event.interaction_id?.substring(0, 8)}...
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col leading-tight">
                          <span className="text-xs font-medium">{event.use_case}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{event.geography}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {issues.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {issues.map((iss, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className={`text-[10px] font-mono shrink-0 ${
                                  iss.verdict === 'fail'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                }`}
                              >
                                {iss.check_name}: {iss.score.toFixed(2)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Clean (0.00)
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-mono uppercase ${
                          event.risk_tier === 'high' ? 'border-rose-500/40 text-rose-500 bg-rose-500/10' :
                          event.risk_tier === 'medium' ? 'border-amber-500/40 text-amber-500 bg-amber-500/10' :
                          'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                        }`}>
                          {event.risk_tier || 'LOW'}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {getActionBadge((event as any).action || event.interaction?.decision?.action || 'allow')}
                      </TableCell>

                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger>
                            <span className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-2.5 hover:bg-muted cursor-pointer">
                              View
                            </span>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                            <DialogHeader>
                              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                                <span>Audit Event Detail</span>
                                <Badge variant="outline" className="font-mono text-[10px]">{event.interaction_id}</Badge>
                              </DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="flex-1 pr-3">
                              <div className="space-y-3.5 text-xs">
                                <div>
                                  <span className="font-semibold text-muted-foreground">Payload Content:</span>
                                  <div className="mt-1 p-3 bg-muted/50 rounded-lg font-mono text-[11px] whitespace-pre-wrap break-all border border-border">
                                    {event.interaction?.payload?.content || 'No content'}
                                  </div>
                                </div>

                                <div>
                                  <span className="font-semibold text-muted-foreground">Guardrail Checks:</span>
                                  <div className="mt-1 space-y-1.5">
                                    {(event.interaction?.checks || []).map((c, i) => (
                                      <div key={i} className="flex items-center justify-between p-2 rounded bg-card border border-border">
                                        <span className="font-medium">{c.check_name}</span>
                                        <div className="flex items-center gap-2 font-mono">
                                          <span>Score: {c.score.toFixed(2)}</span>
                                          <Badge variant="outline" className="text-[10px]">{c.verdict}</Badge>
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
      </Card>
    </div>
  );
}
