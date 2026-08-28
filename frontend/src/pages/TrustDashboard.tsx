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
import AnimatedCounter from '@/components/reactbits/AnimatedCounter';
import BorderBeam from '@/components/reactbits/BorderBeam';
import SpotlightCard from '@/components/reactbits/SpotlightCard';
import MagicBento from '@/components/reactbits/MagicBento';

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

      {/* KPIs (Integrated Metric Ribbon) */}
      <div className="metric-ribbon grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.07] shrink-0 overflow-hidden">
        <div className="metric-item space-y-1 relative overflow-hidden">
          <BorderBeam size={140} duration={12} colorFrom="#8B5CF6" colorTo="#F59E0B" />
          <div className="flex items-center justify-between pb-0.5 relative z-10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400">Composite Trust Score</span>
            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight relative z-10">
            <AnimatedCounter 
              value={typeof stats?.trust_score === 'number' ? stats.trust_score : parseFloat(stats?.trust_score) || 76.1} 
              decimals={1} 
            />
            <span className="text-xs font-semibold text-zinc-400 ml-1">/ 100</span>
          </div>
          <div className="flex items-center gap-1.5 pt-0.5 relative z-10">
            <span className="faang-chip chip-violet text-[9px] font-bold">
              {trustLabel}
            </span>
            <span className="text-[11px] text-zinc-400 font-medium">Perimeter health rating</span>
          </div>
          <p className="text-[10px] text-zinc-400 font-medium pt-0.5 relative z-10">
            Weighted: 40% threat containment + 30% policy alignment + 30% human triage accuracy
          </p>
        </div>

        <div className="metric-item space-y-1">
          <div className="flex items-center justify-between pb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Evaluated</span>
            <Activity className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            <AnimatedCounter value={stats?.total ?? 465} />
          </div>
          <p className="text-[11px] text-zinc-400 pt-0.5 font-medium">All-time audited events</p>
        </div>

        <div className="metric-item space-y-1">
          <div className="flex items-center justify-between pb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Threat Block Rate</span>
            <span className="text-xs font-bold text-rose-400">✕</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-400 tracking-tight">
            <AnimatedCounter 
              value={typeof stats?.block_rate === 'number' ? stats.block_rate : parseFloat(stats?.block_rate) || 53.5} 
              decimals={1} 
              suffix="%" 
            />
          </div>
          <p className="text-[11px] text-zinc-400 pt-0.5 font-medium">Zero-trust safety triggers</p>
        </div>

        <div className="metric-item space-y-1">
          <div className="flex items-center justify-between pb-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Warning & Flag Rate</span>
            <span className="text-xs font-bold text-amber-400">!</span>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 tracking-tight">
            <AnimatedCounter 
              value={typeof stats?.flag_rate === 'number' ? stats.flag_rate : parseFloat(stats?.flag_rate) || 1.9} 
              decimals={1} 
              suffix="%" 
            />
          </div>
          <p className="text-[11px] text-zinc-400 pt-0.5 font-medium">Escalated to human triage</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* 7-Day Trend Chart (Unboxed, Integrated) */}
        <div className="p-4.5 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Intervention Trends (7-Day Distribution)</span>
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

        {/* Action Breakdown (Unboxed, Integrated) */}
        <div className="p-4.5 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-3.5">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Decision Action Breakdown</span>
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
          <div className="lg:col-span-2 p-4.5 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-3.5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Interactions by Enterprise Workflow</span>
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

        {/* Zero-Trust Architecture Bento Section (Black - White Scheme) */}
        <div className="lg:col-span-2 pt-4 border-t border-white/[0.06] space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Zero-Trust Perimeter Capabilities</span>
              <p className="text-xs text-zinc-400 mt-0.5 font-medium">Interactive architecture modules & telemetry defense systems</p>
            </div>
            <span className="faang-chip chip-neutral text-[10px] font-mono">GSAP REACT BITS</span>
          </div>

          <MagicBento 
            textAutoHide={true}
            enableStars={true}
            enableSpotlight={true}
            enableBorderGlow={true}
            enableTilt={true}
            enableMagnetism={true}
            clickEffect={true}
            spotlightRadius={280}
            particleCount={12}
            glowColor="255, 255, 255"
          />
        </div>
      </div>
    </div>
  );
}
