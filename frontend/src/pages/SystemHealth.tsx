import { useState, useEffect } from 'react';
import { Activity, Server, Database, Shield, Zap, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AnomalyAlert } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import DecryptedText from '@/components/reactbits/DecryptedText';

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
    guardrails_ml: 'Guardrails ML',
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
    <div className="h-full w-full overflow-y-auto space-y-6 pr-2 pb-12 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Activity className="h-4.5 w-4.5 text-amber-400" />
            </div>
            Microservice Cluster & Mesh Health
          </h2>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Last refreshed {format(lastRefresh, 'HH:mm:ss')} · Realtime 30s heartbeat probe
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`faang-chip text-xs font-bold ${
              overallStatus === 'operational' ? 'chip-emerald shadow-[0_0_15px_rgba(16,185,129,0.2)]' :
              overallStatus === 'degraded' ? 'chip-amber' :
              'chip-crimson'
            }`}
          >
            {overallStatus === 'degraded' && <AlertTriangle className="mr-1 h-3.5 w-3.5" />}
            {overallStatus === 'critical' && <XCircle className="mr-1 h-3.5 w-3.5" />}
            MESH {overallStatus.toUpperCase()} ({components.length}/{components.length})
          </span>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={isLoading} className="faang-btn-ghost h-9 px-3 gap-2 text-xs text-zinc-300 hover:text-white">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Active Alerts (Borderless, Integrated) */}
      {alerts.length > 0 && (
        <div className="unboxed-section space-y-3 pb-3 mb-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Active Perimeter Anomalies ({alerts.length})</span>
          </div>
          <div className="space-y-1.5">
            {alerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between bg-white/[0.015] p-2.5 rounded-lg border-t border-b border-amber-500/20">
                <div className="flex items-center gap-2.5">
                  <span className={`faang-chip text-[9px] font-bold uppercase ${
                    alert.severity === 'high' ? 'chip-crimson' :
                    alert.severity === 'medium' ? 'chip-amber' :
                    'chip-emerald'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="font-bold text-xs text-white">{alert.metric}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-zinc-400 font-medium text-[11px]">
                    <span className="line-through mr-2 text-zinc-500">{alert.baseline_value}</span>
                    <span className="text-amber-400 font-extrabold">{alert.current_value}</span>
                  </div>
                  {alert.timestamp && (
                    <span className="text-[10px] text-zinc-500 font-medium font-mono">
                      {format(new Date(alert.timestamp), 'HH:mm')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Component Grid (Borderless, Integrated) */}
      {isLoading && components.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-xs font-medium">Checking service mesh health...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {components.map((comp, idx) => {
            const isHealthy = comp.status === 'healthy';
            return (
              <SpotlightCard 
                key={idx} 
                className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.015] flex flex-col justify-between space-y-2.5 hover:border-amber-500/25 transition-all shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 bg-white/[0.03] rounded-md border border-white/[0.05] flex items-center justify-center text-amber-400">
                      {getComponentIcon(comp.name)}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-white">{comp.name}</h4>
                      <div className="mt-0.5">
                        <span className={`faang-chip text-[8px] font-bold uppercase ${isHealthy ? 'chip-emerald' : 'chip-crimson'}`}>
                          {comp.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400 font-medium">
                    Latency: <strong className={`font-bold font-mono ${comp.latency > 500 ? 'text-amber-400' : 'text-zinc-200'}`}>
                      {comp.latency}ms
                    </strong>
                  </span>
                  <span className="text-zinc-500 font-mono font-medium">{format(new Date(comp.last_check), 'HH:mm:ss')}</span>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
