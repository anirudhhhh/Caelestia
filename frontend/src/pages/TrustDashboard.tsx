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

const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b'];

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
        { name: 'Allow', value: stats.action_counts.allow ?? 0, fill: '#10b981' },
        { name: 'Flag', value: stats.action_counts.flag ?? 0, fill: '#f59e0b' },
        { name: 'Block', value: stats.action_counts.block ?? 0, fill: '#f43f5e' },
        { name: 'Escalate', value: stats.action_counts.escalate ?? 0, fill: '#8b5cf6' },
      ]
    : [];

  const trustLabel =
    (stats?.trust_score ?? 100) >= 90 ? 'Excellent' :
    (stats?.trust_score ?? 100) >= 75 ? 'Good' :
    (stats?.trust_score ?? 100) >= 60 ? 'Fair' : 'At Risk';

  const noData = !stats || stats.total === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Trust Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            All metrics computed from real audit store data
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {noData && !isLoading && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
          No interactions yet. Send a message in the Playground to generate real data.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-medium text-primary">Composite Trust Score</p>
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-primary">
              {stats?.trust_score != null ? stats.trust_score : '—'}
            </div>
            <p className="text-[10px] text-primary/70 mt-1">{trustLabel}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-medium text-muted-foreground">Total Interactions</p>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats?.total?.toLocaleString() ?? '—'}</div>
            <p className="text-[10px] text-muted-foreground mt-1">All time monitored</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-medium text-muted-foreground">Block Rate</p>
              <div className="h-4 w-4 rounded-full bg-rose-500/20 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-rose-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{stats?.block_rate != null ? `${stats.block_rate}%` : '—'}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Firewall safety enforcement</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-medium text-muted-foreground">Flag / Review Rate</p>
              <div className="h-4 w-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{stats?.flag_rate != null ? `${stats.flag_rate}%` : '—'}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Escalated for human review</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7-Day Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Intervention Trends (7 Days)
              {trendData.length === 0 && (
                <Badge variant="outline" className="ml-2 text-[10px]">No data yet</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBlock" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorFlag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="block" stroke="#f43f5e" fillOpacity={1} fill="url(#colorBlock)" />
                  <Area type="monotone" dataKey="flag" stroke="#f59e0b" fillOpacity={1} fill="url(#colorFlag)" />
                  <Area type="monotone" dataKey="escalate" stroke="#8b5cf6" fillOpacity={0} strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Action Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Decision Action Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                {actionData.length > 0 ? (
                  <BarChart data={actionData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {actionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie data={[{ name: 'No data', value: 1 }]} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
                      <Cell fill="#334155" />
                    </Pie>
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Use Case Distribution */}
        {useCaseData.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Interactions by Use Case</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={useCaseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {useCaseData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    />
                    <Legend verticalAlign="middle" align="right" layout="vertical" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
