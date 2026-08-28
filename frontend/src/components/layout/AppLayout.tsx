import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { 
  MessageSquare, FileText, UserCheck, BarChart3, Settings, Activity, 
  ShieldCheck, Network, KeyRound, Radio, Menu, X, ChevronRight,
  Cpu, Terminal, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import ShinyText from '@/components/reactbits/ShinyText';
import DecryptedText from '@/components/reactbits/DecryptedText';

export default function AppLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { 
      name: 'Playground', 
      path: '/', 
      icon: MessageSquare, 
      category: 'TEST & INSPECT',
      description: 'Live firewall test bench & stream inspector', 
      badge: 'Live' 
    },
    { 
      name: 'Semantic Router', 
      path: '/load-balancer', 
      icon: Network, 
      category: 'TEST & INSPECT',
      description: 'Dynamic vector routing & PII enforcement' 
    },
    { 
      name: 'Human Review', 
      path: '/review', 
      icon: UserCheck, 
      category: 'GOVERNANCE & TRIAGE',
      description: 'High-risk escalation triage & resolution',
      badge: 'Queue'
    },
    { 
      name: 'Trust Dashboard', 
      path: '/trust', 
      icon: BarChart3, 
      category: 'GOVERNANCE & TRIAGE',
      description: 'Immune health scores & runtime forensics' 
    },
    { 
      name: 'Audit Trail', 
      path: '/audit', 
      icon: FileText, 
      category: 'GOVERNANCE & TRIAGE',
      description: 'Immutable cryptographic security ledger' 
    },
    { 
      name: 'Policy Studio', 
      path: '/policies', 
      icon: Settings, 
      category: 'PERIMETER CONFIG',
      description: 'Zero-trust YAML rules & PII profiles' 
    },
    { 
      name: 'Secret Vault', 
      path: '/secrets', 
      icon: KeyRound, 
      category: 'PERIMETER CONFIG',
      description: 'Zero-knowledge credential fingerprinting' 
    },
    { 
      name: 'System Health', 
      path: '/health', 
      icon: Activity, 
      category: 'PERIMETER CONFIG',
      description: '12 microservices latency & uptime grid', 
      badge: '12/12' 
    },
  ];

  const currentNav = navItems.find(item => item.path === location.pathname);

  // Group items by category for clean visual hierarchy
  const categories = ['TEST & INSPECT', 'GOVERNANCE & TRIAGE', 'PERIMETER CONFIG'];

  return (
    <div className="flex h-screen w-screen bg-[#0C0D10] text-[#F4F4F6] overflow-hidden font-sans select-none antialiased">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-70 border-r border-white/[0.06] bg-[#0E0F12] flex-col shrink-0 z-20">
        {/* Brand Header */}
        <div className="px-5 py-4.5 flex items-center justify-between border-b border-white/[0.06] h-17 shrink-0">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400/20 via-violet-500/15 to-transparent border border-white/[0.12] flex items-center justify-center text-white shadow-[0_0_16px_rgba(245,158,11,0.18)] group-hover:border-amber-400/40 transition-colors">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="font-extrabold text-[15px] tracking-tight text-white flex items-center gap-1">
                ControlPlane<span className="text-amber-400">.ai</span>
              </div>
              <div className="text-[10.5px] text-zinc-500 font-medium tracking-wide">Zero-Trust AI Guardrail</div>
            </div>
          </Link>
        </div>
        
        {/* Navigation List grouped by Category */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-5">
          {categories.map((cat) => {
            const items = navItems.filter(item => item.category === cat);
            return (
              <div key={cat} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                  {cat}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 group relative",
                        isActive 
                          ? "bg-white/[0.08] text-white border border-white/[0.14] shadow-sm" 
                          : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-100 border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          "p-1 rounded-md transition-colors",
                          isActive ? "bg-white text-black" : "bg-white/[0.03] text-zinc-400 group-hover:text-zinc-200"
                        )}>
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                        </div>
                        <span className="truncate">{item.name}</span>
                      </div>
                      {item.badge && !isActive && (
                        <span className="faang-chip chip-neutral text-[9px] px-1.5 py-0 font-medium">
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#F59E0B]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        
        {/* Cluster Status Footer */}
        <div className="p-3.5 border-t border-white/[0.06] bg-black/20 shrink-0">
          <Link 
            to="/health"
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] transition-colors group"
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]" />
              <span className="text-[11px] font-semibold text-zinc-300 group-hover:text-white">Cluster Mesh</span>
            </div>
            <span className="faang-chip chip-emerald text-[9px] font-bold px-2 py-0.5">
              12/12 NODES
            </span>
          </Link>
        </div>
      </aside>

      {/* Mobile Drawer */}
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
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="w-76 max-w-[85vw] h-full bg-[#0E0F12] border-r border-white/[0.08] flex flex-col p-5 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-white">
                    <ShieldCheck className="h-4.5 w-4.5 text-amber-400" />
                  </div>
                  <div>
                    <span className="font-extrabold text-sm text-white">ControlPlane.ai</span>
                    <div className="text-[10px] text-zinc-500">Zero-Trust Guardrail</div>
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
                        "flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all",
                        isActive 
                          ? "bg-white/[0.1] text-white border border-white/[0.18]" 
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4" />
                        <span>{item.name}</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                    </Link>
                  );
                })}
              </nav>

              <div className="p-3 rounded-lg bg-black/40 border border-white/[0.08] text-xs text-white flex items-center justify-between">
                <span className="font-medium text-zinc-300">Cluster Mesh</span>
                <span className="faang-chip chip-emerald text-[9px] font-bold">12 / 12 Healthy</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#0C0D10]">
        {/* Top App Header */}
        <header className="h-15 border-b border-white/[0.06] bg-[#0E0F12]/95 backdrop-blur-xl flex items-center justify-between px-5 lg:px-7 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 md:hidden text-zinc-300 bg-white/[0.04] border-white/[0.08] rounded-lg hover:bg-white/[0.08]"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 hidden sm:inline">
                ControlPlane
              </span>
              <span className="text-zinc-600 hidden sm:inline">/</span>
              <h1 className="text-sm lg:text-[15px] font-extrabold tracking-tight text-white truncate">
                {currentNav?.name || 'Dashboard'}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.07] text-[11px] font-medium text-zinc-300">
              <Activity className="h-3 w-3 text-violet-400" />
              <span>
                P99 Overhead: <strong className="text-white font-bold font-mono"><DecryptedText text="18ms" speed={50} animateOn="hover" /></strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/[0.08] border border-amber-400/25 text-[11px] font-bold text-amber-300 shrink-0">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
              <span className="font-mono"><DecryptedText text="GATEWAY : 8000" speed={30} animateOn="hover" /></span>
            </div>
          </div>
        </header>
        
        {/* Page Content Container */}
        <motion.div 
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 lg:p-6 overflow-hidden bg-[#0C0D10]"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
