import { useState, useEffect } from 'react';
import { Activity, Server, Database, Shield, Zap, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AnomalyAlert } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';

// Map the gateway's keyed health object { input_guard: {status, latency_ms}, ... }
// into the array shape the component renders
function normalizeHealth(raw: any): Array<{ name: string; status: string; latency: number; last_check: string }> {
  if (Array.isArray(raw)) return raw;
  const NAME_MAP: Record<string, string> = {
    gateway: 'Gateway',
    input_guard: 'Input Guard',
    output_guard: 'Output Guard',
    pii_service: 'PII Service',
    policy_engine: 'Policy Engine',
    router: 'Router',
    adapter: 'Adapter',
    audit_store: 'Audit Store',
    review_console: 'Review Console',
    immune_system: 'Immune System',
    action_guard: 'Action Guard',
  };
  return Object.entries(raw).map(([key, val]: [string, any]) => ({
    name: NAME_MAP[key] ?? key,
    status: val?.status ?? 'unknown',
    latency: Math.round(val?.latency_ms ?? 0),
    last_check: new Date().toISOString(),
  }));
}

export default function SystemHealth() {
  const [components, setComponents] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rawHealth, rawAlerts] = await Promise.all([
        api.getSystemHealth().catch(() => null),
        api.getAnomalyAlerts().catch(() => []),
      ]);

      if (rawHealth) {
        setComponents(normalizeHealth(rawHealth));
      }
      setAlerts(rawAlerts);
      setLastRefresh(new Date());
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

  const unhealthyCount = components.filter(c => c.status !== 'healthy').length;
  const overallStatus = unhealthyCount === 0 ? 'operational' : unhealthyCount <= 2 ? 'degraded' : 'critical';

  return (
    <div className="h-full w-full overflow-y-auto space-y-6 pr-2 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">System Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refreshed {format(lastRefresh, 'HH:mm:ss')} · Auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className={
              overallStatus === 'operational' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
              overallStatus === 'degraded' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
              'bg-rose-500/10 text-rose-500 border-rose-500/20'
            }
          >
            {overallStatus === 'operational' && <CheckCircle className="mr-1 h-3 w-3" />}
            {overallStatus === 'degraded' && <AlertTriangle className="mr-1 h-3 w-3" />}
            {overallStatus === 'critical' && <XCircle className="mr-1 h-3 w-3" />}
            {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
          </Badge>
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

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
                    {alert.timestamp && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(alert.timestamp), 'HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Component Grid */}
      {isLoading && components.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Checking service health...</div>
      ) : (
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
                  <span className="text-muted-foreground">
                    Latency: <span className={`font-mono font-medium ${comp.latency > 500 ? 'text-amber-500' : 'text-foreground'}`}>
                      {comp.latency}ms
                    </span>
                  </span>
                  <span className="text-muted-foreground">{format(new Date(comp.last_check), 'HH:mm:ss')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
