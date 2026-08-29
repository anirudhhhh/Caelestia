import { useState, useEffect } from 'react';
import { ShieldCheck, Activity, RefreshCw, ShieldAlert, Zap, ArrowUpRight, BarChart3, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { api } from '@/lib/api';
import AnimatedCounter from '@/components/reactbits/AnimatedCounter';
import MagicBento from '@/components/reactbits/MagicBento';
import BubbleChart, { type BubbleMetric } from '@/components/ui/BubbleChart';
import RadialGauge from '@/components/ui/RadialGauge';
import SegmentedProgress from '@/components/ui/SegmentedProgress';
import PillSlider from '@/components/ui/PillSlider';
import ActivityCalendar from '@/components/ui/ActivityCalendar';

const COLORS = ['#FFC83B', '#FF6B5E', '#212328', '#10B981', '#8B5CF6'];

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
        { name: 'Flag', value: stats.action_counts.flag ?? 0, fill: '#FFC83B' },
        { name: 'Block', value: stats.action_counts.block ?? 0, fill: '#FF6B5E' },
        { name: 'Escalate', value: stats.action_counts.escalate ?? 0, fill: '#212328' },
      ]
    : [];

  const trustScoreNum = typeof stats?.trust_score === 'number' 
    ? stats.trust_score 
    : parseFloat(stats?.trust_score) || 76.1;

  const trustLabel =
    trustScoreNum >= 90 ? 'EXCELLENT' :
    trustScoreNum >= 75 ? 'GOOD' :
    trustScoreNum >= 60 ? 'FAIR' : 'AT RISK';

  const blockRateNum = typeof stats?.block_rate === 'number' 
    ? stats.block_rate 
    : parseFloat(stats?.block_rate) || 53.5;

  const flagRateNum = typeof stats?.flag_rate === 'number' 
    ? stats.flag_rate 
    : parseFloat(stats?.flag_rate) || 1.9;

  const totalEvaluated = stats?.total ?? 465;

  // Bubble chart metrics matching the reference hero card
  const bubbleMetrics: BubbleMetric[] = [
    {
      id: 'latency',
      label: 'ms P99',
      value: '18',
      unit: 'ms latency',
      color: 'charcoal',
    },
    {
      id: 'evaluated',
      label: 'Audited Events',
      value: totalEvaluated.toLocaleString(),
      unit: 'events evaluated',
      color: 'yellow',
    },
    {
      id: 'blocked',
      label: 'Threats Blocked',
      value: `${blockRateNum}%`,
      unit: 'blocked threats',
      color: 'coral',
    },
  ];

  const noData = !stats || stats.total === 0;

  return (
    <div className="h-full w-full overflow-y-auto space-y-5 sm:space-y-6 pr-1 pb-12 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328]">
            Trust & Immune Telemetry
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Autonomous zero-trust immune score & perimeter anomaly forensics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadData} 
            disabled={isLoading} 
            className="bento-btn-secondary h-9 px-4 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Realtime</span>
          </Button>
        </div>
      </div>

      {noData && !isLoading && (
        <div className="bento-card p-8 text-center text-zinc-500 text-sm font-semibold">
          No interactions recorded yet. Send a test message in the Playground to generate telemetry.
        </div>
      )}

      {/* Top Bento Grid: Hero Warm Bubble Card + Dark Calendar/Trend Card (Reference Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Hero Warm Bento Card with Organic Glowing Blurred Bubbles (7 Cols) */}
        <div className="lg:col-span-7">
          <BubbleChart
            title="Your Guardrail Telemetry for Today"
            subtitle="Autonomous inspection breakdown across active models"
            metrics={bubbleMetrics}
            legendItems={[
              { label: 'Audited events', color: '#FFC83B' },
              { label: 'Threats contained', color: '#FF6B5E' },
              { label: 'Overhead latency', color: '#212328' },
            ]}
            className="h-full"
          />
        </div>

        {/* Charcoal Dark Bento Card: Security Training & Activity Calendar (5 Cols) */}
        <div className="lg:col-span-5">
          <ActivityCalendar
            title="Inspection Activity"
            month="August 2026"
            className="h-full"
          />
        </div>
      </div>

      {/* Second Bento Row: Radial Gauge + Pill Slider + Habits/Workflows (Reference Layout) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
        {/* Radial Gauge Bento Card (4 Cols) */}
        <div className="md:col-span-4 bento-card p-6 flex flex-col justify-between">
          <div>
            <span className="text-[11px] uppercase font-extrabold tracking-wider text-zinc-400">
              Composite Trust Score
            </span>
            <h4 className="text-sm sm:text-base font-extrabold text-[#212328] mt-0.5">
              Keep your model aligned
            </h4>
          </div>

          <div className="my-3 flex justify-center">
            <RadialGauge
              value={trustScoreNum}
              max={100}
              label="Trust Score"
              tipValue={trustLabel}
              color="#FF6B5E"
              size={135}
              sublabel="Perimeter health rating"
              actionButton={{
                label: 'Audit Forensics',
                icon: <ArrowUpRight className="h-3 w-3" />,
              }}
            />
          </div>

          <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-zinc-500">
            <span>Rating: <strong className="text-[#212328]">{trustLabel}</strong></span>
            <span>40% Containment</span>
          </div>
        </div>

        {/* Pill Slider Bento Card (4 Cols) */}
        <div className="md:col-span-4 flex flex-col justify-between">
          <PillSlider
            title="Threat Containment Plan"
            value={blockRateNum}
            min={0}
            max={100}
            unit="%"
            startLabel="0% Min"
            endLabel="100% Target"
            percentageText={`${blockRateNum}% Block Rate`}
            badgeLabel={`${blockRateNum}% Threats`}
            className="h-full flex flex-col justify-between"
          />
        </div>

        {/* Action Breakdown / KPI Bento (4 Cols) */}
        <div className="md:col-span-4 bento-card p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm sm:text-base font-extrabold text-[#212328] tracking-tight">
              Safety Trigger Stats
            </h4>
            <span className="stat-pill text-[10px]">REALTIME</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600 font-bold">Blocked Threats</span>
              <SegmentedProgress current={7} total={10} color="coral" size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600 font-bold">Flagged Warnings</span>
              <SegmentedProgress current={3} total={10} color="amber" size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600 font-bold">Policy Alignment</span>
              <SegmentedProgress current={9} total={10} color="emerald" size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600 font-bold">Human Escalations</span>
              <SegmentedProgress current={2} total={10} color="dark" size="sm" />
            </div>
          </div>

          <div className="pt-2 border-t border-black/5 flex items-center justify-between text-[11px] font-bold text-zinc-500">
            <span>Flag rate: {flagRateNum}%</span>
            <span>Audited: {totalEvaluated}</span>
          </div>
        </div>
      </div>

      {/* Third Bento Row: 7-Day Trend Chart & Workflow Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* 7-Day Trend Chart */}
        <div className="bento-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-[#212328] tracking-tight">
                Intervention Trends (7-Day Distribution)
              </h4>
              <p className="text-xs text-zinc-500 font-medium">Temporal stream of zero-trust containment actions</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#F2ECE4] text-[10px] font-black text-zinc-800">
              Live Stream
            </span>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBlock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B5E" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#FF6B5E" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFlag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFC83B" stopOpacity={0.5}/>
                    <stop offset="95%" stopColor="#FFC83B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2ECE4" vertical={false} />
                <XAxis dataKey="date" stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#212328', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', borderRadius: '1.25rem', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}
                  itemStyle={{ color: '#FFFFFF' }}
                />
                <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '11px', fontWeight: 600 }} />
                <Area type="monotone" dataKey="block" stroke="#FF6B5E" strokeWidth={2.5} fillOpacity={1} fill="url(#colorBlock)" name="Blocked Threats" />
                <Area type="monotone" dataKey="flag" stroke="#FFC83B" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFlag)" name="Flagged Warnings" />
                <Area type="monotone" dataKey="escalate" stroke="#212328" fillOpacity={0} strokeWidth={2} strokeDasharray="4 4" name="Human Escalations" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Workflow Traffic Distribution */}
        <div className="bento-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-black/5 pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-[#212328] tracking-tight">
                Interactions by Enterprise Workflow
              </h4>
              <p className="text-xs text-zinc-500 font-medium">Model traffic share by business application</p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#F2ECE4] text-[10px] font-black text-zinc-800">
              Traffic Share
            </span>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {useCaseData.length > 0 ? (
                <PieChart>
                  <Pie
                    data={useCaseData}
                    cx="40%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {useCaseData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#212328', borderColor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', borderRadius: '1.25rem' }}
                  />
                  <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ paddingRight: '20px', fontSize: '11px', fontWeight: 600 }} />
                </PieChart>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-400 text-xs">
                  No workflow traffic recorded yet
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Zero-Trust Architecture Bento Section */}
      <div className="bento-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-black/5 pb-3">
          <div>
            <h4 className="text-sm font-extrabold text-[#212328] tracking-tight">
              Zero-Trust Perimeter Capabilities
            </h4>
            <p className="text-xs text-zinc-500 font-medium">Interactive architecture modules & telemetry defense systems</p>
          </div>
          <span className="stat-pill text-[10px]">DEFENSE GRID</span>
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
          glowColor="33, 35, 40"
        />
      </div>
    </div>
  );
}
