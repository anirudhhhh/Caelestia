import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  MessageSquare, FileText, UserCheck, BarChart3, Settings, Activity,
  ShieldCheck, Network, KeyRound, Menu, X, ChevronRight,
  Search, PanelLeftClose, PanelLeft, ArrowUpRight, Command
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import GlobalSearchModal from '@/components/search/GlobalSearchModal';
import { useSectionHighlight } from '@/lib/useSectionHighlight';

interface NavItem {
  name: string;
  path: string;
  icon: any;
  category: string;
  description: string;
  badge?: string;
}

export default function AppLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Enable automatic section scrolling and highlighting across routes
  useSectionHighlight();

  // Listen for global Cmd+K or Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const primaryNavItems: NavItem[] = [
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
  ];

  const secondaryNavItems: NavItem[] = [
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
  ];

  const allNavItems: NavItem[] = [
    ...primaryNavItems,
    ...secondaryNavItems,
    {
      name: 'System Health',
      path: '/health',
      icon: Activity,
      category: 'PERIMETER CONFIG',
      description: '12 microservices latency & uptime grid',
      badge: '12/12'
    }
  ];

  const currentNav = allNavItems.find(item => item.path === location.pathname);

  return (
    <div className="flex h-screen w-screen bg-[#F2ECE4] text-[#1E2024] overflow-hidden font-sans select-none antialiased p-3 sm:p-4 lg:p-5 gap-4">
      {/* Floating Segmented Pill Sidebar (Desktop) */}
      <aside
        className={cn(
          "hidden md:flex flex-col justify-between shrink-0 z-30 transition-all duration-300 ease-out",
          isExpanded ? "w-64" : "w-16"
        )}
      >
        {isExpanded ? (
          /* Expanded Full-Width Capsule */
          <div className="h-full w-full bg-white rounded-[32px] border border-black/5 shadow-[0_12px_36px_rgba(0,0,0,0.04)] p-4 flex flex-col justify-between">
            {/* Header Brand */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-black/5">
                <Link to="/" className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-2xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-md">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-black text-sm tracking-tight text-[#212328]">
                      ControlPlane<span className="text-[#FF6B5E]">.ai</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-bold">AI Guardrail Engine</div>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="h-8 w-8 rounded-full text-zinc-500 hover:text-black hover:bg-[#F2ECE4]"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
                {allNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold transition-all",
                        isActive
                          ? "bg-[#212328] text-white shadow-md"
                          : "text-zinc-600 hover:bg-[#F7F4EE] hover:text-zinc-900"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#FFC83B]" : "text-zinc-500")} />
                        <span className="truncate">{item.name}</span>
                      </div>
                      {item.badge && !isActive && (
                        <span className="px-2 py-0.5 rounded-full bg-[#EAE4DC] text-[9px] font-extrabold text-zinc-700">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Status Card */}
            <div className="pt-3 border-t border-black/5 space-y-2">
              <Link
                to="/health"
                className="flex items-center justify-between p-2.5 rounded-2xl bg-[#F7F4EE] hover:bg-[#EFE8DE] transition-colors border border-black/5"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#10B981] animate-pulse" />
                  <span className="text-xs font-extrabold text-[#212328]">Cluster Mesh</span>
                </div>
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  12/12 ONLINE
                </span>
              </Link>
            </div>
          </div>
        ) : (
          /* Segmented Floating Pill Capsules (Reference Style) */
          <div className="flex flex-col justify-between h-full space-y-3">
            {/* Top Capsule: Brand Logo & Main Nav */}
            <div className="nav-capsule">
              {/* Brand Glyph */}
              <Link to="/" className="w-11 h-11 rounded-full bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-md mb-1 hover:scale-105 transition-transform">
                <ShieldCheck className="h-5 w-5" />
              </Link>

              {/* Primary Navigation Icons */}
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger className="cursor-pointer" render={<Link to={item.path} className={cn("nav-item-pill", isActive && "active")} />}>
                      <Icon className="h-5 w-5" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-bold text-xs bg-[#212328] text-white rounded-xl">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Middle Capsule: Secondary Nav / Config */}
            <div className="nav-capsule">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger className="cursor-pointer" render={<Link to={item.path} className={cn("nav-item-pill", isActive && "active")} />}>
                      <Icon className="h-5 w-5" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-bold text-xs bg-[#212328] text-white rounded-xl">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Bottom Capsule: Health Pulse & Profile / Expander */}
            <div className="nav-capsule">
              {/* System Health */}
              <Tooltip>
                <TooltipTrigger className="cursor-pointer" render={<Link to="/health" className={cn("nav-item-pill", location.pathname === '/health' && "active")} />}>
                  <div className="relative">
                    <Activity className="h-5 w-5" />
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-bold text-xs bg-[#212328] text-white rounded-xl">
                  System Health (12/12 Healthy)
                </TooltipContent>
              </Tooltip>

              {/* Sidebar Expand Toggle */}
              <Tooltip>
                <TooltipTrigger className="cursor-pointer" render={<button onClick={() => setIsExpanded(true)} className="nav-item-pill hover:bg-zinc-100" />}>
                  <PanelLeft className="h-4.5 w-4.5 text-zinc-600" />
                </TooltipTrigger>
                <TooltipContent side="right" className="font-bold text-xs bg-[#212328] text-white rounded-xl">
                  Expand Navigation
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-transparent">
        {/* Top Header Bar (Reference Matching) */}
        <header className="h-16 sm:h-18 flex items-center justify-between px-2 sm:px-4 shrink-0 z-20">
          {/* Left Greeting & Subtitle */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 md:hidden bg-white border-black/5 rounded-full shadow-sm text-zinc-700 hover:bg-zinc-100"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-[#212328] tracking-tight leading-tight">
                ControlPlane Guardrail
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-500 font-semibold hidden sm:block">
                {currentNav?.description || "Realtime zero-trust security & stream inspector"}
              </p>
            </div>
          </div>

          {/* Right Search Input & Pill Actions */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            {/* System-Wide Fuzzy Search Trigger Pill */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="relative hidden sm:flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 rounded-full bg-white border border-black/5 hover:border-[#FFC83B]/80 hover:shadow-md transition-all text-xs font-semibold text-zinc-500 w-48 md:w-60 lg:w-72 text-left cursor-pointer group"
            >
              <Search className="h-4 w-4 text-zinc-400 group-hover:text-[#212328] transition-colors shrink-0" />
              <span className="truncate flex-1">Fuzzy search telemetry...</span>
              <kbd className="hidden lg:inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-[#FAF8F5] border border-black/10 font-mono text-[10px] font-black text-[#212328]">
                Ctrl+K
              </kbd>
            </button>

            {/* Mobile Search Icon Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="h-10 w-10 sm:hidden bg-white border-black/5 rounded-full shadow-sm text-zinc-700 hover:bg-zinc-100"
              aria-label="Open search"
            >
              <Search className="h-4.5 w-4.5" />
            </Button>

            {/* P99 Latency Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-black/5 shadow-sm text-xs font-bold text-zinc-700">
              <Activity className="h-3.5 w-3.5 text-[#FF6B5E]" />
              <span>P99: <strong className="text-[#212328]">18ms</strong></span>
            </div>

            {/* Gateway Status Badge */}
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#212328] text-white text-xs font-extrabold shadow-md">
              <div className="h-2 w-2 rounded-full bg-[#FFC83B] animate-pulse" />
              <span className="font-mono text-[11px] tracking-wide">GATEWAY : 8000</span>
            </div>

            {/* Quick Action Pill Button */}
            <Link
              to="/policies"
              className="bento-btn-primary hidden sm:inline-flex"
            >
              <span>Deploy Rules</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </header>

        {/* Page Content Container */}
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex-1 min-h-0 flex flex-col p-1 sm:p-2 overflow-hidden"
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Global System-Wide Search Command Palette */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        initialQuery={searchQuery}
      />


      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden flex flex-col"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="w-76 max-w-[85vw] h-full bg-[#F2ECE4] flex flex-col p-5 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-black/5 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-2xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-md">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-black text-sm text-[#212328]">ControlPlane.ai</span>
                    <div className="text-[10px] text-zinc-500 font-bold">Zero-Trust Guardrail</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-500 hover:text-black rounded-full hover:bg-black/5"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <nav className="flex-1 overflow-y-auto space-y-2">
                {allNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all",
                        isActive
                          ? "bg-[#212328] text-white shadow-md"
                          : "text-zinc-700 hover:bg-white bg-white/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn("h-4.5 w-4.5", isActive ? "text-[#FFC83B]" : "text-zinc-500")} />
                        <span>{item.name}</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                    </Link>
                  );
                })}
              </nav>

              <div className="p-3.5 rounded-2xl bg-white border border-black/5 text-xs text-[#212328] flex items-center justify-between shadow-sm">
                <span className="font-bold text-zinc-700">Cluster Mesh</span>
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  12 / 12 Healthy
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
