import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  MessageSquare, FileText, UserCheck, BarChart3, Settings, Activity, ShieldCheck, Network, KeyRound, Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function AppLayout() {
  const location = useLocation();

  const navItems = [
    { name: 'Playground', path: '/', icon: MessageSquare, description: 'Live firewall test bench' },
    { name: 'Semantic Router', path: '/load-balancer', icon: Network, description: 'Vector routing & LB' },
    { name: 'Human Review', path: '/review', icon: UserCheck, description: 'Operator escalation queue' },
    { name: 'Trust Dashboard', path: '/trust', icon: BarChart3, description: 'Immune & governance metrics' },
    { name: 'Audit Trail', path: '/audit', icon: FileText, description: 'Cryptographic ledger' },
    { name: 'Policy Studio', path: '/policies', icon: Settings, description: 'YAML rules & PII matrix' },
    { name: 'Secret Vault', path: '/secrets', icon: KeyRound, description: 'Credential fingerprinting' },
    { name: 'System Health', path: '/health', icon: Activity, description: '12 microservices telemetry' },
  ];

  const currentNav = navItems.find(item => item.path === location.pathname);

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/70 bg-card/60 backdrop-blur-xl flex flex-col shrink-0 z-20">
        <div className="p-4 flex items-center justify-between border-b border-border/70 h-16">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight leading-none">ControlPlane.ai</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Enterprise Firewall</div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-500 bg-emerald-500/5 gap-1 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            v1.0
          </Badge>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Control Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold" 
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-110", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                <div className="flex flex-col min-w-0">
                  <span className="truncate leading-none">{item.name}</span>
                </div>
                {isActive && (
                  <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-primary-foreground/80" />
                )}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-3 border-t border-border/70 bg-muted/20">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-muted-foreground">Cluster Mesh</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-500 font-semibold">12 / 12 Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background">
        <header className="h-16 border-b border-border/70 bg-card/40 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
          <div>
            <h1 className="text-base font-bold tracking-tight">
              {currentNav?.name || 'Dashboard'}
            </h1>
            <p className="text-[12px] text-muted-foreground">
              {currentNav?.description || 'Enterprise AI Governance Middleware'}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border/60 text-xs font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Gateway:</span>
              <span className="font-mono text-foreground">8000 (Active)</span>
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-hidden p-6 bg-background/50">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
