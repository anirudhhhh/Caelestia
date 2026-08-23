import { useState, useEffect } from 'react';
import { UserCheck, Clock, CheckCircle, XCircle, Edit, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { EscalationItem, ReviewAction } from '@/types';
import { api } from '@/lib/api';

export default function HumanReview() {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<EscalationItem | null>(null);
  
  // Review form state
  const [reason, setReason] = useState('');
  const [wasFlagCorrect, setWasFlagCorrect] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadEscalations();
  }, []);

  const loadEscalations = async () => {
    setIsLoading(true);
    try {
      const data = await api.getEscalations().catch(() => []);
      setEscalations(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: ReviewAction) => {
    if (!selectedItem || !reason.trim()) return;
    
    setIsSubmitting(true);
    try {
      await api.resolveEscalation(selectedItem.interaction_id, action, {
        reason,
        was_original_flag_correct: wasFlagCorrect
      });
      // Remove from list
      setEscalations(prev => prev.filter(item => item.interaction_id !== selectedItem.interaction_id));
      setSelectedItem(null);
      setReason('');
      setWasFlagCorrect(true);
    } catch (error) {
      console.error('Failed to resolve escalation', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRiskColor = (tier: string) => {
    switch (tier) {
      case 'high': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'medium': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'low': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Pending Escalations</p>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold">{escalations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Avg Resolution Time</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">14m</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-muted-foreground">Flag Accuracy</p>
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold">92.4%</div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review Queue</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Risk Tier</TableHead>
              <TableHead>Interaction ID</TableHead>
              <TableHead>Use Case</TableHead>
              <TableHead>Escalation Reason</TableHead>
              <TableHead>Time in Queue</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading queue...
                </TableCell>
              </TableRow>
            ) : escalations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Queue is empty. Great job!
                </TableCell>
              </TableRow>
            ) : (
              escalations.map((item) => (
                <TableRow key={item.interaction_id}>
                  <TableCell>
                    <Badge variant="outline" className={getRiskColor(item.risk_tier)}>
                      {item.risk_tier.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.interaction_id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>{item.use_case}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {item.escalation_reason}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center text-muted-foreground">
                      <Clock className="mr-1 h-3 w-3" />
                      {item.time_in_queue}m
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => setSelectedItem(item)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Escalation</DialogTitle>
          </DialogHeader>
          
          {selectedItem && (
            <div className="flex flex-col md:flex-row gap-6 mt-4 flex-1 min-h-0">
              {/* Left Column: Context */}
              <ScrollArea className="flex-1 border border-border rounded-md p-4">
                <div className="space-y-6 pr-4">
                  <div>
                    <h4 className="text-sm font-medium text-rose-500 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Escalation Reason
                    </h4>
                    <p className="text-sm">{selectedItem.escalation_reason}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2 border-b border-border pb-1">Payload Content</h4>
                    <div className="bg-muted/50 p-4 rounded-md font-mono text-sm whitespace-pre-wrap">
                      {selectedItem.interaction.payload.content}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2 border-b border-border pb-1">Triggered Checks</h4>
                    <div className="space-y-2">
                      {selectedItem.interaction.checks.filter(c => c.verdict !== 'pass').map((c, i) => (
                        <div key={i} className="bg-card border border-border p-3 rounded-md text-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-amber-500">{c.check_name}</span>
                            <Badge variant="outline">{c.verdict}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Score: {c.score.toFixed(2)} | Engine: {c.engine}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* Right Column: Action Form */}
              <div className="w-[300px] flex flex-col gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reason">Decision Reason (Required)</Label>
                    <Textarea
                      id="reason"
                      placeholder="Explain your decision..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-2 border border-border p-3 rounded-md">
                    <Label htmlFor="flag-correct" className="flex-1 cursor-pointer">
                      Was original flag correct?
                      <p className="text-xs text-muted-foreground font-normal mt-1">
                        Helps improve system accuracy
                      </p>
                    </Label>
                    <Switch
                      id="flag-correct"
                      checked={wasFlagCorrect}
                      onCheckedChange={setWasFlagCorrect}
                    />
                  </div>
                </div>

                <div className="space-y-2 mt-auto">
                  <Button 
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" 
                    onClick={() => handleAction('approve')}
                    disabled={!reason.trim() || isSubmitting}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve (Allow)
                  </Button>
                  <Button 
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white" 
                    onClick={() => handleAction('edit_approve')}
                    disabled={!reason.trim() || isSubmitting}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit & Approve
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="w-full" 
                    onClick={() => handleAction('deny')}
                    disabled={!reason.trim() || isSubmitting}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Deny (Block)
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
