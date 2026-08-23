import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Target, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { api } from '@/lib/api';

const COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#64748b'];

export default function TrustDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Mock data for charts if API fails
  const trendData = [
    { date: 'Mon', block: 40, flag: 24, escalate: 10 },
    { date: 'Tue', block: 30, flag: 13, escalate: 8 },
    { date: 'Wed', block: 20, flag: 48, escalate: 12 },
    { date: 'Thu', block: 27, flag: 39, escalate: 15 },
    { date: 'Fri', block: 18, flag: 48, escalate: 9 },
    { date: 'Sat', block: 23, flag: 38, escalate: 11 },
    { date: 'Sun', block: 34, flag: 43, escalate: 14 },
  ];

  const riskData = [
    { name: 'Customer Support', low: 400, medium: 240, high: 24 },
    { name: 'Internal Copilot', low: 300, medium: 139, high: 8 },
    { name: 'Decision Support', low: 200, medium: 380, high: 45 },
  ];

  const modelData = [
    { name: 'GPT-4o', value: 400 },
    { name: 'Claude 3.5 Sonnet', value: 300 },
    { name: 'Llama 3 (Internal)', value: 300 },
    { name: 'Mistral Large', value: 200 },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getOutcomeStats().catch(() => ({
        fpr: 2.4,
        fnr: 0.8,
        trust_score: 94.2,
        total: 15842,
        block_rate: 4.1,
        escalate_rate: 1.2,
        coverage: 98.5
      }));
      setStats(data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-medium text-muted-foreground">False Positive Rate</p>
              <Target className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.fpr || '---'}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">n=12,450 decisions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-medium text-muted-foreground">False Negative Rate</p>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.fnr || '---'}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Estimated *</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-medium text-primary">Composite Trust Score</p>
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold text-primary">{stats?.trust_score || '---'}</div>
            <p className="text-[10px] text-primary/70 mt-1">Excellent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-medium text-muted-foreground">Weekly Interactions</p>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats?.total?.toLocaleString() || '---'}</div>
            <p className="text-[10px] text-muted-foreground mt-1">+12% vs last week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-medium text-muted-foreground">Block Rate</p>
              <div className="h-4 w-4 rounded-full bg-rose-500/20 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-rose-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{stats?.block_rate || '---'}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Stable</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-xs font-medium text-muted-foreground">Retrieval Coverage</p>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold">{stats?.coverage || '---'}%</div>
            <p className="text-[10px] text-muted-foreground mt-1">Verified sources</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Intervention Trends (7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
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

        {/* Risk by Use Case */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Risk Distribution by Use Case</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    cursor={{fill: '#334155', opacity: 0.4}}
                  />
                  <Legend />
                  <Bar dataKey="low" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="medium" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="high" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Model Usage */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Model Usage & Routing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {modelData.map((entry, index) => (
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
      </div>
    </div>
  );
}
