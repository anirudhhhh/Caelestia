import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  MessageSquare, FileText, UserCheck, BarChart3, Settings, Activity, 
  ShieldCheck, Network, KeyRound, Radio, Menu, X, Sparkles, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AppLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { name: 'Playground', path: '/', icon: MessageSquare, description: 'Live firewall test bench & stream inspector', badge: 'Active' },
    { name: 'Semantic Router', path: '/load-balancer', icon: Network, description: 'Dynamic vector routing & PII enforcement' },
    { name: 'Human Review', path: '/review', icon: UserCheck, description: 'High-risk escalation triage & resolution' },
    { name: 'Trust Dashboard', path: '/trust', icon: BarChart3, description: 'Immune health scores & runtime analytics' },
    { name: 'Audit Trail', path: '/audit', icon: FileText, description: 'Immutable cryptographic security ledger' },
    { name: 'Policy Studio', path: '/policies', icon: Settings, description: 'Zero-trust YAML rules & PII profiles' },
    { name: 'Secret Vault', path: '/secrets', icon: KeyRound, description: 'Zero-knowledge credential fingerprinting' },
    { name: 'System Health', path: '/health', icon: Activity, description: '12 microservices latency & uptime grid', badge: '12/12' },
  ];

  const currentNav = navItems.find(item => item.path === location.pathname);

  return (
    <div className="flex h-screen w-screen bg-[#0E0F12] text-foreground overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-68 border-r border-white/[0.08] bg-[#111216] flex-col shrink-0 z-20 select-none">
        {/* Brand Header */}
        <div className="p-5 flex items-center justify-between border-b border-white/[0.07] h-18 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-violet-500/20 to-amber-400/20 border border-white/[0.12] flex items-center justify-center text-white shadow-[0_0_20px_rgba(139,92,246,0.25)]">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                ControlPlane<span className="text-amber-400">.ai</span>
              </div>
              <div className="text-[11px] text-zinc-400 font-medium tracking-wide">Zero-Trust AI Guardrail</div>
            </div>
          </div>
          <span className="faang-chip chip-amber text-[10px] font-bold">
            PRO
          </span>
        </div>
        
        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Security Control Plane
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group relative",
                  isActive 
                    ? "bg-white/[0.1] text-white border border-white/[0.18] shadow-sm translate-x-0.5" 
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-white border border-transparent"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    isActive ? "bg-white text-black" : "bg-white/[0.04] text-zinc-400 group-hover:text-white"
                  )}>
                    <Icon className="h-4 w-4 shrink-0" />
                  </div>
                  <span className="truncate">{item.name}</span>
                </div>
                {item.badge && !isActive && (
                  <span className="faang-chip chip-neutral text-[10px]">
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <span className="faang-chip chip-violet text-[9px] font-extrabold uppercase">
                    ACTIVE
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        
        {/* Cluster Status Footer */}
        <div className="p-4 border-t border-white/[0.07] bg-white/[0.01] shrink-0">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/40 border border-white/[0.08]">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-zinc-300">Cluster Mesh</span>
            </div>
            <span className="faang-chip chip-emerald text-[10px] font-bold">12 / 12 NODES</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Backdrop & Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md md:hidden flex flex-col"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div 
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-76 max-w-[85vw] h-full bg-[#111216] border-r border-white/[0.08] flex flex-col p-5 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-white">
                    <ShieldCheck className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-white">ControlPlane.ai</span>
                    <div className="text-[10px] text-zinc-400">Zero-Trust Guardrail</div>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-zinc-400 hover:text-white rounded-full hover:bg-white/[0.08]"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <nav className="flex-1 overflow-y-auto space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all",
                        isActive 
                          ? "bg-white/[0.1] text-white border border-white/[0.18]" 
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </Link>
                  );
                })}
              </nav>

              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] text-xs text-white flex items-center justify-between">
                <span className="font-medium text-zinc-300">Cluster Mesh</span>
                <span className="faang-chip chip-emerald text-[10px] font-bold">12 / 12 Healthy</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#0E0F12]">
        {/* Top Header */}
        <header className="h-18 border-b border-white/[0.07] bg-[#111216]/90 backdrop-blur-xl flex items-center justify-between px-5 lg:px-8 shrink-0 z-10 select-none">
          <div className="flex items-center gap-3.5">
            {/* Mobile Menu Button */}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 md:hidden text-zinc-300 bg-white/[0.04] border-white/[0.08] rounded-xl hover:bg-white/[0.08]"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base lg:text-lg font-extrabold tracking-tight text-white flex items-center gap-2 truncate">
                {currentNav?.name || 'Dashboard'}
              </h1>
              <p className="text-xs text-zinc-400 truncate max-w-[140px] sm:max-w-md font-medium">
                {currentNav?.description || 'Enterprise AI Governance Middleware'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-semibold text-zinc-300">
              <Activity className="h-3.5 w-3.5 text-violet-400" />
              <span>P99 SLA: <strong className="text-white font-extrabold">18ms</strong></span>
            </div>

            <div className="flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.12] text-xs font-bold text-white shadow-sm shrink-0">
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">GATEWAY ONLINE : 8000</span>
              <span className="sm:hidden text-[11px]">8000 ONLINE</span>
            </div>
          </div>
        </header>
        
        {/* Full-Height Responsive Workspace Container with fluid transition */}
        <motion.div 
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 lg:p-7 overflow-hidden bg-[#0E0F12]"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
