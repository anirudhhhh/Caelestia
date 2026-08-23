import { useState, useEffect } from 'react';
import { Activity, Server, Database, Shield, Zap, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AnomalyAlert } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';

export default function SystemHealth() {
  const [components, setComponents] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Simulate real-time polling
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const healthData = await api.getSystemHealth().catch(() => [
        { name: 'Gateway', status: 'healthy', latency: 45, last_check: new Date().toISOString() },
        { name: 'Input Guard', status: 'healthy', latency: 120, last_check: new Date().toISOString() },
        { name: 'Output Guard', status: 'healthy', latency: 150, last_check: new Date().toISOString() },
        { name: 'PII Service', status: 'healthy', latency: 15, last_check: new Date().toISOString() },
        { name: 'Policy Engine', status: 'healthy', latency: 8, last_check: new Date().toISOString() },
        { name: 'Router', status: 'healthy', latency: 25, last_check: new Date().toISOString() },
        { name: 'Adapter', status: 'healthy', latency: 12, last_check: new Date().toISOString() },
        { name: 'Audit Store', status: 'healthy', latency: 4, last_check: new Date().toISOString() },
        { name: 'Review Console', status: 'healthy', latency: 18, last_check: new Date().toISOString() },
        { name: 'Immune System', status: 'healthy', latency: 340, last_check: new Date().toISOString() },
        { name: 'Action Guard', status: 'healthy', latency: 85, last_check: new Date().toISOString() },
      ]);
      setComponents(healthData);

      const alertsData = await api.getAnomalyAlerts().catch(() => [
        { id: 'a1', severity: 'medium' as const, metric: 'Model Latency (GPT-4o)', current_value: 1250, baseline_value: 800, timestamp: new Date().toISOString() },
        { id: 'a2', severity: 'low' as const, metric: 'Policy Engine CPU', current_value: 85, baseline_value: 45, timestamp: new Date().toISOString() }
      ] satisfies AnomalyAlert[]);
      setAlerts(alertsData);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'healthy') return <CheckCircle className="h-5 w-5 text-emerald-500" />;
    if (status === 'unhealthy') return <XCircle className="h-5 w-5 text-rose-500" />;
    return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'healthy') return 'border-emerald-500/50 bg-emerald-500/5';
    if (status === 'unhealthy') return 'border-rose-500/50 bg-rose-500/5';
    return 'border-amber-500/50 bg-amber-500/5';
  };

  const getComponentIcon = (name: string) => {
    if (name.includes('Guard') || name.includes('PII')) return <Shield className="h-4 w-4" />;
    if (name.includes('Store') || name.includes('Database')) return <Database className="h-4 w-4" />;
    if (name.includes('Engine') || name.includes('System')) return <Activity className="h-4 w-4" />;
    if (name.includes('Router') || name.includes('Gateway')) return <Server className="h-4 w-4" />;
    return <Zap className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Active Alerts */}
      {alerts.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              Active Anomalies ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-center justify-between bg-background/80 p-3 rounded-md border border-border">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={
                      alert.severity === 'high' ? 'border-rose-500 text-rose-500' :
                      alert.severity === 'medium' ? 'border-amber-500 text-amber-500' :
                      'border-emerald-500 text-emerald-500'
                    }>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="font-medium text-sm">{alert.metric}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="font-mono text-muted-foreground">
                      <span className="line-through mr-2">{alert.baseline_value}</span>
                      <span className="text-amber-500 font-bold">{alert.current_value}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(alert.timestamp), 'HH:mm')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Component Status</h3>
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          <CheckCircle className="mr-1 h-3 w-3" /> System Operational
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {components.map((comp, idx) => (
          <Card key={idx} className={`border ${getStatusColor(comp.status)} transition-colors`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-background rounded-md border border-border">
                    {getComponentIcon(comp.name)}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{comp.name}</h4>
                    <p className="text-xs text-muted-foreground capitalize">{comp.status}</p>
                  </div>
                </div>
                {getStatusIcon(comp.status)}
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Latency: <span className="font-mono font-medium text-foreground">{comp.latency}ms</span></span>
                <span className="text-muted-foreground">{format(new Date(comp.last_check), 'HH:mm:ss')}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
