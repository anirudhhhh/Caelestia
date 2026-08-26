import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  MessageSquare, FileText, UserCheck, BarChart3, Settings, Activity, ShieldCheck, Network, KeyRound
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const location = useLocation();

  const navItems = [
    { name: 'Playground', path: '/', icon: MessageSquare },
    { name: 'Load Balancer', path: '/load-balancer', icon: Network },
    { name: 'Human Review', path: '/review', icon: UserCheck },
    { name: 'Trust Dashboard', path: '/trust', icon: BarChart3 },
    { name: 'Audit Trail', path: '/audit', icon: FileText },
    { name: 'Policy Editor', path: '/policies', icon: Settings },
    { name: 'Secret Registration', path: '/secrets', icon: KeyRound },
    { name: 'System Health', path: '/health', icon: Activity },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 flex items-center gap-2 border-b border-border h-16">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg tracking-tight">ControlPlane.ai</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground text-center">
            ControlPlane.ai v1.0
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-border bg-card flex items-center px-6 shadow-sm z-10">
          <h1 className="text-xl font-semibold">
            {navItems.find(item => item.path === location.pathname)?.name || 'Dashboard'}
          </h1>
        </header>
        
        <div className="flex-1 overflow-auto p-6 bg-background">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
