import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { api } from '@/lib/api';

const COLORS = ['#8B5CF6', '#F59E0B', '#EF4444', '#007AFF', '#10B981'];

export default function TrustDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [trustStats, trend] = await Promise.all([
        api.getOutcomeStats().catch(() => null),
        fetch('/api/v1/audit/trend').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      if (trustStats) setStats(trustStats);
      if (trend?.length) setTrendData(trend);
    } finally {
      setIsLoading(false);
    }
  };

  // Build use-case pie data from real by_use_case counts
  const useCaseData = stats?.by_use_case
    ? Object.entries(stats.by_use_case).map(([name, value]) => ({
        name: name.replace('_', ' '),
        value: value as number,
      }))
    : [];

  // Build action breakdown bar data from real action_counts
  const actionData = stats?.action_counts
    ? [
        { name: 'Allow', value: stats.action_counts.allow ?? 0, fill: '#10B981' },
        { name: 'Flag', value: stats.action_counts.flag ?? 0, fill: '#F59E0B' },
        { name: 'Block', value: stats.action_counts.block ?? 0, fill: '#EF4444' },
        { name: 'Escalate', value: stats.action_counts.escalate ?? 0, fill: '#8B5CF6' },
      ]
    : [];

  const trustLabel =
    (stats?.trust_score ?? 100) >= 90 ? 'EXCELLENT' :
    (stats?.trust_score ?? 100) >= 75 ? 'GOOD' :
    (stats?.trust_score ?? 100) >= 60 ? 'FAIR' : 'AT RISK';

  const noData = !stats || stats.total === 0;

  return (
    <div className="h-full w-full overflow-y-auto space-y-6 pr-2 pb-12 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-white">Trust & Immune Telemetry</h2>
          <p className="text-xs text-zinc-400 mt-1 font-medium">
            Autonomous zero-trust immune score & perimeter anomaly forensics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading} className="faang-btn-ghost h-9 px-3.5 gap-2 text-xs text-zinc-300 hover:text-white">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Sync Realtime</span>
        </Button>
      </div>

      {noData && !isLoading && (
        <div className="rounded-3xl border border-dashed border-white/[0.1] bg-[#15161B]/50 p-10 text-center text-zinc-400 text-sm font-medium">
          No interactions recorded yet. Send a test message in the Playground to generate telemetry.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
        <div className="faang-card-highlight p-5 space-y-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">Composite Trust Score</span>
            <div className="h-8 w-8 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.3)]">
              <ShieldCheck className="h-4.5 w-4.5 text-amber-400" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {stats?.trust_score != null ? stats.trust_score : '100'}
            <span className="text-sm font-semibold text-zinc-400 ml-1">/ 100</span>
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <span className="faang-chip chip-violet text-[10px] font-bold">
              {trustLabel}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">Perimeter rating</span>
          </div>
        </div>

        <div className="faang-card p-5 space-y-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Evaluated</span>
            <div className="h-8 w-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-zinc-300">
              <Activity className="h-4.5 w-4.5 text-amber-400" />
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {stats?.total?.toLocaleString() ?? '0'}
          </div>
          <p className="text-xs text-zinc-400 pt-1 font-medium">All-time audited events</p>
        </div>

        <div className="faang-card p-5 space-y-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Threat Block Rate</span>
            <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <span className="text-xs font-bold">✕</span>
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-rose-400 tracking-tight">
            {stats?.block_rate != null ? `${stats.block_rate}%` : '0%'}
          </div>
          <p className="text-xs text-zinc-400 pt-1 font-medium">Zero-trust safety triggers</p>
        </div>

        <div className="faang-card p-5 space-y-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Warning & Flag Rate</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <span className="text-xs font-bold">!</span>
            </div>
          </div>
          <div className="text-3xl sm:text-4xl font-extrabold text-amber-400 tracking-tight">
            {stats?.flag_rate != null ? `${stats.flag_rate}%` : '0%'}
          </div>
          <p className="text-xs text-zinc-400 pt-1 font-medium">Escalated to human triage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* 7-Day Trend Chart */}
        <div className="faang-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <span className="text-sm font-bold text-white">Intervention Trends (7-Day Distribution)</span>
            <span className="faang-chip chip-amber text-[10px]">Realtime feed</span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBlock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFlag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
                <XAxis dataKey="date" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#15161B', borderColor: 'rgba(255, 255, 255, 0.12)', color: '#F4F4F6', borderRadius: '1rem', backdropFilter: 'blur(12px)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}
                  itemStyle={{ color: '#F4F4F6' }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <Area type="monotone" dataKey="block" stroke="#EF4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBlock)" name="Blocked Threats" />
                <Area type="monotone" dataKey="flag" stroke="#F59E0B" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFlag)" name="Flagged Warnings" />
                <Area type="monotone" dataKey="escalate" stroke="#8B5CF6" fillOpacity={0} strokeWidth={2} strokeDasharray="4 4" name="Human Escalations" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action Breakdown */}
        <div className="faang-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <span className="text-sm font-bold text-white">Decision Action Breakdown</span>
            <span className="faang-chip chip-emerald text-[10px]">Realtime</span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {actionData.length > 0 ? (
                <BarChart data={actionData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
                  <XAxis dataKey="name" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#15161B', borderColor: 'rgba(255, 255, 255, 0.12)', color: '#F4F4F6', borderRadius: '1rem', backdropFilter: 'blur(12px)' }}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {actionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={[{ name: 'No data', value: 1 }]} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
                    <Cell fill="#27272A" />
                  </Pie>
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Use Case Distribution */}
        {useCaseData.length > 0 && (
          <div className="lg:col-span-2 faang-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
              <span className="text-sm font-bold text-white">Interactions by Enterprise Workflow</span>
              <span className="faang-chip chip-azure text-[10px]">Traffic Share</span>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={useCaseData}
                    cx="38%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {useCaseData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#15161B', borderColor: 'rgba(255, 255, 255, 0.12)', color: '#F4F4F6', borderRadius: '1rem', backdropFilter: 'blur(12px)' }}
                  />
                  <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ paddingRight: '25px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
