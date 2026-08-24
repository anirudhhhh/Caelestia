import { useState, useEffect } from 'react';
import { Search, Filter, ArrowRight, Activity, ShieldAlert, ShieldCheck, ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, Copy, Check } from 'lucide-react';
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
  
  // Filters
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

  const getActionColor = (action: string) => {
    switch (action?.toLowerCase()) {
      case 'allow': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'block': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'flag': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'escalate': return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict?.toLowerCase()) {
      case 'pass':
        return <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10 shrink-0">PASS</Badge>;
      case 'warn':
        return <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10 font-bold shrink-0">WARN</Badge>;
      case 'fail':
        return <Badge variant="outline" className="text-[10px] text-rose-500 border-rose-500/30 bg-rose-500/10 font-bold shrink-0">FAIL</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">{verdict || 'N/A'}</Badge>;
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
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Total Monitored Events</p>
              <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <div className="text-2xl font-bold">
              {stats?.total != null ? stats.total.toLocaleString() : (stats?.total_interactions != null ? stats.total_interactions.toLocaleString() : events.length)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Input & Output audit stream</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Block Rate</p>
              <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold">
              {stats?.block_rate != null ? `${stats.block_rate}%` : '0%'}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Policy violations stopped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Flag Rate</p>
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold">
              {stats?.flag_rate != null ? `${stats.flag_rate}%` : '0%'}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Warnings flagged for review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between space-y-0 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Escalation Rate</p>
              <ShieldCheck className="h-4 w-4 text-violet-500 shrink-0" />
            </div>
            <div className="text-2xl font-bold">
              {stats?.escalate_rate != null ? `${stats.escalate_rate}%` : (stats?.escalation_rate != null ? `${stats.escalation_rate}%` : '0%')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Human review escalations</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <div className="p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompt, response, or check..."
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

          {/* Use Case Filter */}
          <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Use Case" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Use Cases</SelectItem>
              <SelectItem value="customer_support">Customer Support</SelectItem>
              <SelectItem value="internal_copilot">Internal Copilot</SelectItem>
              <SelectItem value="decision_support">Decision Support</SelectItem>
            </SelectContent>
          </Select>

          {/* Action Filter */}
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="allow">ALLOW</SelectItem>
              <SelectItem value="flag">FLAG</SelectItem>
              <SelectItem value="block">BLOCK</SelectItem>
              <SelectItem value="escalate">ESCALATE</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={loadData} className="ml-auto text-xs h-8">
            Refresh
          </Button>
        </div>
      </Card>

      {/* Audit Events Table with Horizontal Overflow Handling */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[130px]">Timestamp</TableHead>
                <TableHead className="text-xs w-[100px]">Direction</TableHead>
                <TableHead className="text-xs w-[120px]">Interaction ID</TableHead>
                <TableHead className="text-xs w-[150px]">Use Case / Geo</TableHead>
                <TableHead className="text-xs min-w-[200px]">Detected Flags & Issues</TableHead>
                <TableHead className="text-xs w-[90px]">Risk</TableHead>
                <TableHead className="text-xs w-[100px]">Action</TableHead>
                <TableHead className="text-xs text-right w-[90px]">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    Loading audit stream...
                  </TableCell>
                </TableRow>
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                    No audit events matching current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event, idx) => {
                  const checks = event.interaction?.checks || [];
                  const issues = checks.filter((c) => (c.score > 0 || c.verdict !== 'pass'));
                  const isInput = event.direction === 'input';

                  return (
                    <TableRow key={event.interaction_id ? `${event.interaction_id}-${event.direction}-${idx}` : idx}>
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {event.timestamp ? format(new Date(event.timestamp), 'MMM d, HH:mm:ss') : 'Just now'}
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

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {event.interaction_id?.substring(0, 8)}...
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">{event.use_case}</span>
                          <span className="text-[10px] text-muted-foreground">{event.geography}</span>
                        </div>
                      </TableCell>

                      {/* Flags / Issues Column */}
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
                          <span className="text-[11px] text-emerald-500/80 flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="h-3 w-3 shrink-0" /> Clean (0.00)
                          </span>
                        )}
                      </TableCell>

                      {/* Risk Tier */}
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-mono shrink-0
                          ${event.risk_tier === 'high' ? 'border-rose-500/50 text-rose-500 bg-rose-500/5' : ''}
                          ${event.risk_tier === 'medium' ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' : ''}
                          ${event.risk_tier === 'low' ? 'border-emerald-500/50 text-emerald-500 bg-emerald-500/5' : ''}
                        `}>
                          {event.risk_tier?.toUpperCase() || 'LOW'}
                        </Badge>
                      </TableCell>

                      {/* Decision Action */}
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] font-mono font-semibold shrink-0 ${getActionColor(event.decision_action)}`}>
                          {event.decision_action?.toUpperCase() || 'ALLOW'}
                        </Badge>
                      </TableCell>

                      {/* View Details Modal with Dynamic Overflow Handling */}
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              View <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="w-[95vw] max-w-5xl max-h-[88vh] flex flex-col p-5 sm:p-6 overflow-hidden">
                            <DialogHeader className="pr-8 pb-3 border-b border-border/80">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <DialogTitle className="text-sm font-semibold">Audit Event:</DialogTitle>
                                  <div className="flex items-center gap-1 bg-muted/60 px-2 py-0.5 rounded border border-border/60">
                                    <span className="font-mono text-xs text-muted-foreground truncate max-w-[180px] sm:max-w-[260px]">
                                      {event.interaction_id}
                                    </span>
                                    <button
                                      onClick={() => handleCopy(event.interaction_id)}
                                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                                      title="Copy Interaction ID"
                                    >
                                      {copiedId === event.interaction_id ? (
                                        <Check className="h-3 w-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isInput ? (
                                    <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-xs flex items-center gap-1">
                                      <ArrowDownLeft className="h-3 w-3" /> INPUT AUDIT
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs flex items-center gap-1">
                                      <ArrowUpRight className="h-3 w-3" /> OUTPUT AUDIT
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className={getActionColor(event.decision_action)}>
                                    {event.decision_action?.toUpperCase()}
                                  </Badge>
                                </div>
                              </div>
                            </DialogHeader>

                            <ScrollArea className="flex-1 mt-3 pr-3">
                              <div className="space-y-5 pb-2">
                                {/* Payload Box */}
                                <div>
                                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    {isInput ? 'User Input Prompt' : 'AI Assistant Output Response'}
                                  </h4>
                                  <div className="bg-muted/40 border border-border p-3.5 rounded-md font-mono text-xs whitespace-pre-wrap break-words leading-relaxed text-foreground max-h-[200px] overflow-y-auto">
                                    {event.interaction?.payload?.content || 'No content recorded.'}
                                  </div>
                                </div>

                                {/* Decision Reason */}
                                <div>
                                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Decision & Policy Reason
                                  </h4>
                                  <div className="p-3 rounded-md bg-muted/20 border border-border text-xs">
                                    <p className="font-medium text-foreground">{event.interaction?.decision?.reason || 'All checks passed'}</p>
                                    {event.interaction?.decision?.policy_version && (
                                      <p className="font-mono text-[10px] text-muted-foreground mt-1">
                                        Policy Version: {event.interaction.decision.policy_version}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Checks Grid */}
                                <div>
                                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                    Evaluated Security Checks ({checks.length})
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {checks.map((c, i) => (
                                      <div key={i} className="bg-card border border-border p-3 rounded-md text-xs space-y-2">
                                        <div className="flex justify-between items-center gap-2">
                                          <span className="font-medium text-foreground truncate font-mono">{c.check_name}</span>
                                          {getVerdictBadge(c.verdict)}
                                        </div>
                                        <div className="space-y-1">
                                          <div className="flex justify-between text-muted-foreground text-[10px] font-mono">
                                            <span>Score: {c.score.toFixed(2)}</span>
                                            <span className="truncate max-w-[100px]">{c.engine}</span>
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

                                {/* Raw Envelope */}
                                <div>
                                  <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                    Raw Audit Envelope
                                  </h4>
                                  <div className="bg-zinc-950 p-3.5 rounded-md border border-zinc-800">
                                    <pre className="text-[11px] text-zinc-300 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-[220px]">
                                      {JSON.stringify(event.interaction, null, 2)}
                                    </pre>
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
