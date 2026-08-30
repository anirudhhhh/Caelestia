import { useState, useEffect } from 'react';
import { Activity, Server, Database, Shield, Zap, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AnomalyAlert } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import RadialGauge from '@/components/ui/RadialGauge';
import SegmentedProgress from '@/components/ui/SegmentedProgress';

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

  const getComponentIcon = (name: string) => {
    if (name.includes('Guard') || name.includes('PII')) return <Shield className="h-4 w-4" />;
    if (name.includes('Store') || name.includes('Database')) return <Database className="h-4 w-4" />;
    if (name.includes('Engine') || name.includes('System')) return <Activity className="h-4 w-4" />;
    if (name.includes('Router') || name.includes('Gateway')) return <Server className="h-4 w-4" />;
    return <Zap className="h-4 w-4" />;
  };

  const unhealthyCount = components.filter(c => c.status !== 'healthy').length;
  const overallStatus = unhealthyCount === 0 ? 'operational' : unhealthyCount <= 2 ? 'degraded' : 'critical';
  const healthyCount = components.length - unhealthyCount;
  const healthPercentage = components.length > 0 ? Math.round((healthyCount / components.length) * 100) : 100;

  return (
    <div className="h-full w-full overflow-y-auto space-y-5 sm:space-y-6 pr-1 pb-12 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328] flex items-center gap-2">
            <Activity className="h-5 w-5 text-amber-500" />
            Cluster & Mesh Health Telemetry
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Realtime 30s heartbeat probe · Refreshed {format(lastRefresh, 'HH:mm:ss')}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wide",
              overallStatus === 'operational' ? "bg-emerald-100 text-emerald-800" :
              overallStatus === 'degraded' ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
            )}
          >
            MESH {overallStatus.toUpperCase()} ({healthyCount}/{components.length || 12})
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadData} 
            disabled={isLoading} 
            className="bento-btn-secondary h-9 px-3.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Top Bento Row: Radial Uptime Gauge + Anomaly Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
        {/* Radial Gauge (4 Cols) */}
        <div id="health-mesh-gauge" className="md:col-span-4 bento-card p-6 flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider text-zinc-400">
              Mesh Uptime
            </span>
            <h4 className="text-base font-extrabold text-[#212328] mt-0.5">
              Service Health Index
            </h4>
          </div>

          <div className="my-3 flex justify-center">
            <RadialGauge
              value={healthPercentage}
              max={100}
              label="Cluster Health"
              tipValue={`${healthyCount}/${components.length || 12} NODES`}
              color="#10B981"
              size={135}
              sublabel="Active microservice consensus"
            />
          </div>

          <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-zinc-500">
            <span>Status: <strong className="text-[#212328]">{overallStatus.toUpperCase()}</strong></span>
            <span>100% Target SLA</span>
          </div>
        </div>

        {/* Anomaly Alerts & Active Node Summary (8 Cols) */}
        <div id="health-anomalies" className="md:col-span-8 bento-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-[#212328] tracking-tight flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Active Perimeter Anomalies ({alerts.length})
              </h3>
              <p className="text-xs text-zinc-500 font-medium">Real-time baseline deviations detected across guardrail services</p>
            </div>
            <span className="stat-pill text-[10px]">REALTIME</span>
          </div>

          {alerts.length > 0 ? (
            <div className="space-y-2.5">
              {alerts.map(alert => (
                <div key={alert.id} className="flex items-center justify-between bg-[#FAF8F5] p-3 rounded-2xl border border-black/5">
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                      alert.severity === 'high' ? "bg-rose-100 text-rose-800" :
                      alert.severity === 'medium' ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    )}>
                      {alert.severity}
                    </span>
                    <span className="font-bold text-xs text-[#212328]">{alert.metric}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-zinc-400 line-through">{alert.baseline_value}</span>
                    <span className="text-amber-600 font-black">{alert.current_value}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#FAF8F5] text-center text-xs text-zinc-500 font-medium">
              Zero perimeter anomalies detected. All 12 services operating within nominal bounds.
            </div>
          )}
        </div>
      </div>

      {/* 12 Microservices Bento Grid */}
      <div id="health-mesh-grid" className="bento-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#212328] tracking-tight">
              Microservice Mesh Topology ({components.length} Nodes)
            </h3>
            <p className="text-xs text-zinc-500 font-medium">Individual heartbeat, latency metrics, and probe status</p>
          </div>
          <span className="stat-pill text-[10px]">MESH GRID</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {components.map((comp, idx) => {
            const isHealthy = comp.status === 'healthy';

            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-black/5 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-xs">
                      {getComponentIcon(comp.name)}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[#212328]">{comp.name}</h4>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[8px] font-black uppercase mt-0.5 inline-block",
                        isHealthy ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      )}>
                        {comp.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-zinc-500">
                  <span>Latency: <strong className="text-[#212328] font-mono">{comp.latency}ms</strong></span>
                  <SegmentedProgress current={isHealthy ? 10 : 2} total={10} color={isHealthy ? 'emerald' : 'coral'} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
