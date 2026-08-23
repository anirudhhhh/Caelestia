import type { 
  ChatRequest, EscalationItem, ReviewAction,
  PolicyRule, AnomalyAlert, AuditEvent
} from '../types';

const API_BASE = '/api/v1';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  // ── Chat ──────────────────────────────────────────────────────────────────
  sendChat: (request: ChatRequest) =>
    fetchApi<any>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  getInteraction: (id: string) => fetchApi<any>(`/interactions/${id}`),

  // ── Audit ─────────────────────────────────────────────────────────────────
  // Backend returns { events: [...] } — unwrap here so callers get AuditEvent[]
  getEvents: async (filters?: Record<string, string>): Promise<AuditEvent[]> => {
    const params = filters
      ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString()
      : '';
    const data = await fetchApi<{ events: any[] } | any[]>(`/audit/events${params}`);
    // Handle both wrapped { events: [...] } and plain array
    return Array.isArray(data) ? data : (data as any).events ?? [];
  },

  getEventStats: () => fetchApi<any>('/audit/stats'),

  // ── Escalations ───────────────────────────────────────────────────────────
  getEscalations: async (): Promise<EscalationItem[]> => {
    const data = await fetchApi<EscalationItem[] | any>('/escalations');
    return Array.isArray(data) ? data : data.escalations ?? [];
  },

  resolveEscalation: (id: string, _action: ReviewAction, data: any) =>
    fetchApi<void>(`/escalations/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Policies ──────────────────────────────────────────────────────────────
  // Backend returns { version, config: { policies: [...], defaults: {...} } }
  // We normalize to a flat PolicyRule[] for the editor
  getPolicies: async (): Promise<PolicyRule[]> => {
    const data = await fetchApi<any>('/policies');
    if (Array.isArray(data)) return data;
    const config = data?.config ?? data;
    const policies: any[] = config?.policies ?? [];
    return policies.map((p: any, i: number) => ({
      id: String(i),
      use_case: p.use_case ?? '*',
      geography: p.geography ?? '*',
      check_name: p.check ?? p.check_name ?? '',
      block_threshold: p.block_threshold ?? 0.7,
      flag_threshold: p.flag_threshold ?? 0.4,
      on_timeout: p.on_timeout ?? 'block',
    }));
  },

  updatePolicies: (policies: PolicyRule[]) =>
    fetchApi<void>('/policies', {
      method: 'PUT',
      body: JSON.stringify({
        policies: policies.map((p) => ({
          use_case: p.use_case,
          geography: p.geography,
          check: p.check_name,
          block_threshold: p.block_threshold,
          flag_threshold: p.flag_threshold,
          on_timeout: p.on_timeout,
        })),
      }),
    }),

  // ── System Health ─────────────────────────────────────────────────────────
  getSystemHealth: () => fetchApi<any>('/health/system'),

  getAnomalyAlerts: async (): Promise<AnomalyAlert[]> => {
    const data = await fetchApi<AnomalyAlert[] | any>('/health/alerts');
    return Array.isArray(data) ? data : data.alerts ?? [];
  },

  // ── Trust / Stats (REAL data from audit store + outcome store) ────────────
  getTrustStats: async () => {
    const [auditStats, outcomeStats] = await Promise.all([
      fetchApi<any>('/audit/stats').catch(() => null),
      fetchApi<any>('/trust/outcomes').catch(() => null),
    ]);

    const total = auditStats?.total_interactions ?? 0;
    const actionCounts = auditStats?.action_counts ?? {};
    const blockRate = auditStats?.block_rate != null
      ? +(auditStats.block_rate * 100).toFixed(1)
      : 0;
    const escalateRate = auditStats?.escalation_rate != null
      ? +(auditStats.escalation_rate * 100).toFixed(1)
      : 0;
    const flagCount = actionCounts['flag'] ?? 0;
    const flagRate = total > 0 ? +((flagCount / total) * 100).toFixed(1) : 0;

    const totalReviews = outcomeStats?.total_reviews ?? 0;
    const fpRate = outcomeStats?.false_positive_rate != null
      ? +(outcomeStats.false_positive_rate * 100).toFixed(1)
      : null;
    const fnRate = outcomeStats?.false_negative_rate != null
      ? +(outcomeStats.false_negative_rate * 100).toFixed(1)
      : null;

    // Composite trust score: 100 - weighted penalty from block/FP rates
    const trustScore = Math.max(0, Math.min(100,
      100 - blockRate * 2 - (fpRate ?? 0) * 3
    )).toFixed(1);

    return {
      total,
      block_rate: blockRate,
      flag_rate: flagRate,
      escalate_rate: escalateRate,
      fpr: fpRate,
      fnr: fnRate,
      trust_score: trustScore,
      total_reviews: totalReviews,
      by_use_case: auditStats?.by_use_case ?? {},
      action_counts: actionCounts,
    };
  },

  // Keep old name as alias for backward compat
  getOutcomeStats: () => api.getTrustStats(),

  getModels: () => fetchApi<any>('/models'),

  guardAction: (request: any) =>
    fetchApi<any>('/guard', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};
