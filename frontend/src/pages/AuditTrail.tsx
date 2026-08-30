import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, Filter, ArrowRight, Activity, ShieldAlert, ShieldCheck, 
  ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, 
  Copy, Check, RefreshCw, FileText, Download, Terminal, X, Sparkles,
  Layers, ChevronDown
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AuditEvent } from '@/types';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { searchCollection, getHighlightSegments, fuzzyScore } from '@/lib/fuzzy';
import SegmentedProgress from '@/components/ui/SegmentedProgress';

const USE_CASES = [
  { value: 'all', label: 'All Use Cases' },
  { value: 'customer_support', label: 'Customer Support' },
  { value: 'internal_copilot', label: 'Internal Copilot' },
  { value: 'decision_support', label: 'Decision Support' },
  { value: 'legal_compliance', label: 'Legal Compliance' },
  { value: 'email_dispatch', label: 'Email Dispatch' },
  { value: 'leave_approval', label: 'Leave Approval' },
  { value: 'weather_service', label: 'Weather Service' },
];

export default function AuditTrail() {
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || searchParams.get('search') || '');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  
  const [useCaseFilter, setUseCaseFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [eventsData, statsData] = await Promise.all([
        api.getEvents().catch(() => []),
        api.getEventStats().catch(() => ({ 
          total: 0, block_rate: 0, flag_rate: 0, escalate_rate: 0 
        }))
      ]);
      
      setEvents(eventsData);
      setStats(statsData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    try {
      const newParams = new URLSearchParams(window.location.search);
      if (val.trim()) {
        newParams.set('q', val.trim());
      } else {
        newParams.delete('q');
        newParams.delete('search');
      }
      const queryStr = newParams.toString();
      const newUrl = `${window.location.pathname}${queryStr ? `?${queryStr}` : ''}`;
      window.history.replaceState(null, '', newUrl);
    } catch {
      // safe fallback
    }
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const getActionBadge = (action: string) => {
    switch (action?.toLowerCase()) {
      case 'allow':
        return <span className="stat-pill bg-emerald-600">ALLOW</span>;
      case 'block':
        return <span className="stat-pill bg-[#FF6B5E]">BLOCK</span>;
      case 'flag':
        return <span className="stat-pill bg-[#FFC83B] text-[#212328]">FLAG</span>;
      case 'escalate':
        return <span className="stat-pill bg-[#212328]">ESCALATE</span>;
      default:
        return <span className="stat-pill bg-zinc-500">{action?.toUpperCase() || 'UNKNOWN'}</span>;
    }
  };

  // 1. Instant in-memory categorical filtering
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      // Filter by Action
      if (actionFilter !== 'all') {
        const act = (evt.decision_action || evt.interaction?.decision?.action || '').toLowerCase();
        if (act !== actionFilter.toLowerCase()) {
          return false;
        }
      }
      // Filter by Direction
      if (directionFilter !== 'all') {
        const dir = (evt.direction || evt.interaction?.direction || '').toLowerCase();
        if (dir !== directionFilter.toLowerCase()) {
          return false;
        }
      }
      // Filter by Use Case
      if (useCaseFilter !== 'all') {
        const uc = (evt.use_case || evt.interaction?.use_case || '').toLowerCase();
        if (uc !== useCaseFilter.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  }, [events, actionFilter, directionFilter, useCaseFilter]);

  // 2. High-performance multi-field fuzzy search over filtered events
  const searchResults = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return filteredEvents.map((evt) => ({ item: evt, score: 1, matchedIndices: [] as number[] }));
    }

    return searchCollection(filteredEvents, query, [
      { key: 'interaction_id', weight: 2.8 },
      { getter: (e) => e.interaction?.payload?.content, weight: 2.4 },
      { getter: (e) => (typeof e.interaction?.payload === 'string' ? e.interaction?.payload : ''), weight: 2.0 },
      { key: 'decision_action', weight: 1.8 },
      { getter: (e) => e.interaction?.decision?.action, weight: 1.8 },
      { key: 'direction', weight: 1.3 },
      { getter: (e) => e.use_case || e.interaction?.use_case, weight: 1.5 },
      { getter: (e) => e.geography || e.interaction?.geography, weight: 1.4 },
      { getter: (e) => e.interaction?.decision?.reason, weight: 1.8 },
      { 
        getter: (e) => (e.interaction?.checks || []).map((c: any) => `${c.check_name} ${Math.round((c.score || 0) * 100)}% ${c.verdict || ''}`).join(' '),
        weight: 2.0 
      }
    ]);
  }, [filteredEvents, searchQuery]);

  // Action counts for pill counters
  const actionCounts = useMemo(() => {
    const counts = { all: events.length, block: 0, flag: 0, allow: 0, escalate: 0 };
    events.forEach(e => {
      const act = (e.decision_action || e.interaction?.decision?.action || '').toLowerCase();
      if (act === 'block') counts.block++;
      else if (act === 'flag') counts.flag++;
      else if (act === 'allow') counts.allow++;
      else if (act === 'escalate') counts.escalate++;
    });
    return counts;
  }, [events]);

  const resetAllFilters = () => {
    setActionFilter('all');
    setDirectionFilter('all');
    setUseCaseFilter('all');
    handleSearchChange('');
  };

  return (
    <div className="h-full w-full flex flex-col gap-4 sm:gap-5 min-h-0 overflow-y-auto pb-12 font-sans pr-1">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-[28px] border border-black/5 shadow-sm shrink-0">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#212328] flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            Cryptographic Audit Trail
          </h2>
          <p className="text-xs text-zinc-500 font-semibold mt-0.5">
            Immutable SHA-256 verified ledger of all ingress and egress interactions
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadData} 
            disabled={isLoading} 
            className="bento-btn-secondary h-9 px-3.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Ledger</span>
          </Button>
        </div>
      </div>

      {/* Bento Metric Ribbon (Reference Style) */}
      <div id="audit-metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bento-card p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Audited Events</span>
            <Activity className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-[#212328]">
            {stats?.total?.toLocaleString() || events.length.toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-500 font-medium truncate">Live evaluated stream</p>
        </div>

        <div className="bento-card p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Perimeter Block Rate</span>
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-[#FF6B5E]">
            {stats?.block_rate != null ? `${stats.block_rate}%` : `${Math.round((actionCounts.block / (events.length || 1)) * 100)}%`}
          </div>
          <p className="text-[11px] text-zinc-500 font-medium truncate">{actionCounts.block} zero-trust safety blocks</p>
        </div>

        <div className="bento-card p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Warning Flag Rate</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-amber-600">
            {stats?.flag_rate != null ? `${stats.flag_rate}%` : `${Math.round((actionCounts.flag / (events.length || 1)) * 100)}%`}
          </div>
          <p className="text-[11px] text-zinc-500 font-medium truncate">{actionCounts.flag} policy warning events</p>
        </div>

        <div className="bento-card p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Human Escalations</span>
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" />
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-[#212328]">
            {stats?.escalate_count ?? stats?.escalation_count ?? actionCounts.escalate}
          </div>
          <p className="text-[11px] text-zinc-500 font-medium truncate">{actionCounts.escalate} queued for triage</p>
        </div>
      </div>

      {/* Filter Toolbar Bento with Real-time Fuzzy Search & 1-Click Filter Pills */}
      <div id="audit-filters" className="bento-card p-4 sm:p-5 space-y-3.5 shrink-0">
        {/* Top Row: Search Input + Select Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 justify-between">
          {/* Fuzzy Search Input */}
          <div className="relative flex-1 min-w-[240px] max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Fuzzy search ID, content, check (e.g. 'dan', 'ssn', 'toxicity 80%', 'phone')..."
              className="bento-search w-full pl-10 pr-9 h-10 text-xs sm:text-sm font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Use Case Dropdown */}
            <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
              <SelectTrigger className="w-[150px] sm:w-[170px] h-10 text-xs font-bold bg-[#FAF8F5] border-black/10 rounded-full shadow-xs">
                <SelectValue placeholder="All Use Cases" />
              </SelectTrigger>
              <SelectContent className="bg-white border-black/10 rounded-2xl shadow-xl">
                {USE_CASES.map((uc) => (
                  <SelectItem key={uc.value} value={uc.value} className="text-xs font-medium cursor-pointer">
                    {uc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Direction Dropdown */}
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-[130px] h-10 text-xs font-bold bg-[#FAF8F5] border-black/10 rounded-full shadow-xs">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent className="bg-white border-black/10 rounded-2xl shadow-xl">
                <SelectItem value="all" className="text-xs font-medium cursor-pointer">All Directions</SelectItem>
                <SelectItem value="input" className="text-xs font-medium cursor-pointer">Input (Ingress)</SelectItem>
                <SelectItem value="output" className="text-xs font-medium cursor-pointer">Output (Egress)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bottom Row: 1-Click Action Pill Buttons + Counters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-black/5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-wider mr-1">Action:</span>
            
            <button
              onClick={() => setActionFilter('all')}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                actionFilter === 'all'
                  ? "bg-[#212328] text-white shadow-sm scale-105"
                  : "bg-[#FAF8F5] text-zinc-600 hover:bg-[#F2ECE4] border border-black/5"
              )}
            >
              <span>All</span>
              <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full", actionFilter === 'all' ? "bg-white/20 text-white" : "bg-black/5 text-zinc-600")}>
                {actionCounts.all}
              </span>
            </button>

            <button
              onClick={() => setActionFilter('block')}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                actionFilter === 'block'
                  ? "bg-[#FF6B5E] text-white shadow-sm scale-105"
                  : "bg-[#FAF8F5] text-zinc-600 hover:bg-[#F2ECE4] border border-black/5"
              )}
            >
              <span>Block</span>
              <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full", actionFilter === 'block' ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800")}>
                {actionCounts.block}
              </span>
            </button>

            <button
              onClick={() => setActionFilter('flag')}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                actionFilter === 'flag'
                  ? "bg-[#FFC83B] text-[#212328] shadow-sm scale-105"
                  : "bg-[#FAF8F5] text-zinc-600 hover:bg-[#F2ECE4] border border-black/5"
              )}
            >
              <span>Flag</span>
              <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full", actionFilter === 'flag' ? "bg-black/20 text-[#212328]" : "bg-amber-100 text-amber-800")}>
                {actionCounts.flag}
              </span>
            </button>

            <button
              onClick={() => setActionFilter('allow')}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                actionFilter === 'allow'
                  ? "bg-emerald-600 text-white shadow-sm scale-105"
                  : "bg-[#FAF8F5] text-zinc-600 hover:bg-[#F2ECE4] border border-black/5"
              )}
            >
              <span>Allow</span>
              <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full", actionFilter === 'allow' ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800")}>
                {actionCounts.allow}
              </span>
            </button>

            <button
              onClick={() => setActionFilter('escalate')}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                actionFilter === 'escalate'
                  ? "bg-[#212328] text-white shadow-sm scale-105"
                  : "bg-[#FAF8F5] text-zinc-600 hover:bg-[#F2ECE4] border border-black/5"
              )}
            >
              <span>Escalate</span>
              <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full", actionFilter === 'escalate' ? "bg-white/20 text-white" : "bg-zinc-200 text-zinc-800")}>
                {actionCounts.escalate}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {searchQuery && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#FEF08A] text-[#854D0E] text-[10px] font-black border border-amber-300 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Fuzzy Filter Active
              </span>
            )}
            <span className="text-xs font-bold text-zinc-500">
              Showing {searchResults.length} of {events.length} events
            </span>
          </div>
        </div>
      </div>

      {/* Events List Bento with Match Highlights */}
      <div id="audit-events-list" className="bento-card p-5 sm:p-6 space-y-3 flex-1">
        {searchResults.length > 0 ? (
          searchResults.map((result, idx) => {
            const evt = result.item;
            const content = evt.interaction?.payload?.content || (typeof evt.interaction?.payload === 'string' ? evt.interaction.payload : '') || '';
            const reason = evt.interaction?.decision?.reason || '';
            const uniqueKey = `${evt.interaction_id}-${evt.direction || 'dir'}-${evt.timestamp || idx}-${idx}`;

            // Compute highlighting for interaction ID and content
            const idScore = searchQuery.trim() ? fuzzyScore(searchQuery.trim(), evt.interaction_id) : { score: 0, matchedIndices: [] };
            const contentScore = searchQuery.trim() ? fuzzyScore(searchQuery.trim(), content || reason) : { score: 0, matchedIndices: [] };
            const idSegments = getHighlightSegments(evt.interaction_id, idScore.matchedIndices);
            const contentSegments = getHighlightSegments(
              content || reason || "Audited interaction payload",
              contentScore.matchedIndices
            );

            return (
              <div
                key={uniqueKey}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-[#FAF8F5] hover:bg-[#F2ECE4] border border-black/5 transition-all gap-3"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[#212328] text-[#FFC83B] flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-black text-[#212328]">
                        {idSegments.slice(0, 12).map((seg, sIdx) => (
                          seg.isHighlighted ? (
                            <mark key={sIdx} className="fuzzy-match-mark">{seg.text}</mark>
                          ) : (
                            <span key={sIdx}>{seg.text}</span>
                          )
                        ))}...
                      </span>
                      {getActionBadge(evt.decision_action)}
                      <span className="px-2 py-0.5 rounded-full bg-white text-[9px] font-bold text-zinc-600 border border-black/5 uppercase">
                        {evt.direction}
                      </span>
                      {evt.use_case && (
                        <span className="px-2 py-0.5 rounded-full bg-[#EAE4DC] text-[9px] font-bold text-zinc-700">
                          {evt.use_case}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-400 font-bold">
                        {format(new Date(evt.timestamp || Date.now()), 'MMM d, HH:mm:ss')}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-700 font-medium mt-1 line-clamp-1">
                      {contentSegments.map((seg, sIdx) => (
                        seg.isHighlighted ? (
                          <mark key={sIdx} className="fuzzy-match-mark">{seg.text}</mark>
                        ) : (
                          <span key={sIdx}>{seg.text}</span>
                        )
                      ))}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleCopy(evt.interaction_id)}
                    className="bento-btn-secondary h-8 px-3 text-xs cursor-pointer"
                  >
                    {copiedId === evt.interaction_id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedId === evt.interaction_id ? "Copied" : "Copy ID"}</span>
                  </button>
                  <button
                    onClick={() => setSelectedEvent(evt)}
                    className="bento-btn-primary h-8 px-4 text-xs cursor-pointer"
                  >
                    Inspect
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FAF8F5] text-zinc-400 flex items-center justify-center mx-auto border border-black/5">
              <Search className="h-6 w-6" />
            </div>
            <p className="text-sm font-black text-[#212328]">No audit records match your filters</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto font-medium">
              {searchQuery ? `No events matched search "${searchQuery}"` : "No events matched the selected action or direction filters."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={resetAllFilters}
              className="rounded-full text-xs font-bold mt-2 bento-btn-secondary"
            >
              Reset All Filters & Search
            </Button>
          </div>
        )}
      </div>

      {/* Inspect Event Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="bg-white border-black/10 rounded-[32px] max-w-2xl p-6 sm:p-7 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#212328] flex items-center justify-between">
              <span>Cryptographic Audit Inspection</span>
              {selectedEvent && getActionBadge(selectedEvent.decision_action)}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Interaction ID: {selectedEvent?.interaction_id}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-4 py-2">
              {/* Payload Preview */}
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-black/5 space-y-1">
                <span className="text-xs font-bold text-zinc-700 block">Payload Content</span>
                <div className="text-xs font-mono bg-white p-3 rounded-xl border border-black/5 max-h-36 overflow-y-auto whitespace-pre-wrap text-zinc-800">
                  {selectedEvent.interaction?.payload?.content || selectedEvent.interaction?.decision?.reason || "No content payload"}
                </div>
              </div>

              {/* Checks Breakdown */}
              {selectedEvent.interaction?.checks && selectedEvent.interaction.checks.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-zinc-700 block">Security Check Results</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedEvent.interaction.checks.map((chk, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-[#FAF8F5] flex items-center justify-between text-xs border border-black/5">
                        <span className="font-bold text-zinc-800">{chk.check_name}</span>
                        <span className="font-mono font-bold text-zinc-600">{(chk.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-black/5 flex items-center justify-between">
                <Button variant="ghost" onClick={() => setSelectedEvent(null)} className="rounded-full text-xs cursor-pointer">
                  Close
                </Button>
                <Button
                  onClick={() => handleCopyJson(selectedEvent)}
                  className="bento-btn-primary text-xs cursor-pointer"
                >
                  {copiedJson ? <Check className="h-3.5 w-3.5 mr-1 text-[#FFC83B]" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copiedJson ? "Copied Envelope" : "Copy Raw JSON"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
