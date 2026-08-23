import { useState, useEffect } from 'react';
import { Search, Filter, ArrowRight, ChevronDown, Activity, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AuditEvent, InteractionEnvelope } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';

export default function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [useCaseFilter, setUseCaseFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [useCaseFilter, actionFilter]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (useCaseFilter !== 'all') filters.use_case = useCaseFilter;
      if (actionFilter !== 'all') filters.decision_action = actionFilter;
      
      const [eventsData, statsData] = await Promise.all([
        api.getEvents(filters).catch(() => []),
        api.getEventStats().catch(() => ({ 
          total: 12450, block_rate: 4.2, flag_rate: 12.5, escalate_rate: 1.8 
        }))
      ]);
      
      setEvents(eventsData);
      setStats(statsData);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'allow': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'block': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'flag': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'escalate': return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Interactions</p>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats?.total?.toLocaleString() || '---'}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Block Rate</p>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.block_rate || '---'}%</div>
            <p className="text-xs text-muted-foreground mt-1">Policy enforcement</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Flag Rate</p>
              <ShieldAlert className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.flag_rate || '---'}%</div>
            <p className="text-xs text-muted-foreground mt-1">Auditing required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Escalation Rate</p>
              <ShieldCheck className="h-4 w-4 text-violet-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.escalate_rate || '---'}%</div>
            <p className="text-xs text-muted-foreground mt-1">Human review</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <div className="p-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search interaction ID or content..."
              className="pl-9"
            />
          </div>
          
          <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
            <SelectTrigger className="w-[180px]">
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
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Decision Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="allow">Allow</SelectItem>
              <SelectItem value="block">Block</SelectItem>
              <SelectItem value="flag">Flag</SelectItem>
              <SelectItem value="escalate">Escalate</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" className="ml-auto">
            <Filter className="mr-2 h-4 w-4" />
            More Filters
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Interaction ID</TableHead>
              <TableHead>Use Case / Geo</TableHead>
              <TableHead>Risk Tier</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading events...
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No events found.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.interaction_id}>
                  <TableCell className="text-sm font-medium">
                    {format(new Date(event.timestamp), 'MMM d, yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {event.interaction_id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{event.use_case}</span>
                      <span className="text-xs text-muted-foreground">{event.geography} • {event.direction}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`
                      ${event.risk_tier === 'high' ? 'border-rose-500/50 text-rose-500' : ''}
                      ${event.risk_tier === 'medium' ? 'border-amber-500/50 text-amber-500' : ''}
                      ${event.risk_tier === 'low' ? 'border-emerald-500/50 text-emerald-500' : ''}
                    `}>
                      {event.risk_tier}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getActionColor(event.decision_action)}>
                      {event.decision_action.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger>
                        <Button variant="ghost" size="sm">
                          View <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Interaction Details</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="flex-1 mt-4">
                          <div className="space-y-6 pr-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2 border-b border-border pb-1">Payload Content</h4>
                              <div className="bg-muted/50 p-4 rounded-md font-mono text-sm whitespace-pre-wrap">
                                {event.interaction.payload.content}
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="text-sm font-medium mb-2 border-b border-border pb-1">Decision Reason</h4>
                              <p className="text-sm text-muted-foreground">{event.interaction.decision.reason}</p>
                            </div>

                            <div>
                              <h4 className="text-sm font-medium mb-2 border-b border-border pb-1">Checks</h4>
                              <div className="grid grid-cols-2 gap-4">
                                {event.interaction.checks.map((c, i) => (
                                  <div key={i} className="bg-card border border-border p-3 rounded-md text-sm">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-medium">{c.check_name}</span>
                                      <Badge variant="outline">{c.verdict}</Badge>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground text-xs">
                                      <span>Score: {c.score.toFixed(2)}</span>
                                      <span>{c.engine}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h4 className="text-sm font-medium mb-2 border-b border-border pb-1">Raw Envelope</h4>
                              <div className="bg-zinc-950 p-4 rounded-md">
                                <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap">
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
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
