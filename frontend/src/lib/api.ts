import type { 
  ChatRequest, EscalationItem, ReviewAction,
  PolicyRule, AnomalyAlert, AuditEvent, ThresholdProposal
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
  getEscalations: async (status?: string): Promise<EscalationItem[]> => {
    const url = status && status !== 'all' ? `/escalations?status=${status}` : '/escalations';
    const data = await fetchApi<EscalationItem[] | any>(url);
    return Array.isArray(data) ? data : data.escalations ?? [];
  },

  getEscalation: (id: string): Promise<EscalationItem> =>
    fetchApi<EscalationItem>(`/escalations/${id}`),

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
    fetchApi<{ status: string; version: string }>('/policies', {
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

  uploadPolicyYaml: (yamlContent: string) =>
    fetchApi<{ status: string; version: string; rule_count: number; policies: any[] }>('/policies/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: yamlContent,
    }),

  // ── System Health ─────────────────────────────────────────────────────────
  getSystemHealth: () => fetchApi<any>('/health/system'),

  getAnomalyAlerts: async (): Promise<AnomalyAlert[]> => {
    const data = await fetchApi<AnomalyAlert[] | any>('/health/alerts');
    return Array.isArray(data) ? data : data.alerts ?? [];
  },

  getProposals: async (): Promise<ThresholdProposal[]> => {
    const data = await fetchApi<ThresholdProposal[] | any>('/health/proposals');
    return Array.isArray(data) ? data : data.proposals ?? [];
  },

  acceptProposal: (proposalId: string) =>
    fetchApi<any>(`/health/proposals/${proposalId}/accept`, {
      method: 'POST',
    }),

  dismissProposal: (proposalId: string) =>
    fetchApi<any>(`/health/proposals/${proposalId}/dismiss`, {
      method: 'POST',
    }),

  // ── Trust / Stats (REAL data from audit store + outcome store) ────────────
  getTrustStats: () => fetchApi<any>('/trust/outcomes'),

  // Keep old name as alias for backward compat
  getOutcomeStats: () => fetchApi<any>('/trust/outcomes'),

  getModels: () => fetchApi<any>('/models'),

  // ── Router & Endpoints ───────────────────────────────────────────────────
  getEndpoints: () => fetchApi<any[]>('/router/endpoints'),

  registerEndpoint: (endpoint: any) =>
    fetchApi<any>('/router/endpoints', {
      method: 'POST',
      body: JSON.stringify(endpoint),
    }),

  deleteEndpoint: (endpointId: string) =>
    fetchApi<any>(`/router/endpoints/${endpointId}`, {
      method: 'DELETE',
    }),

  matchEndpoint: (prompt: string) =>
    fetchApi<any>('/router/match', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  guardAction: (request: any) =>
    fetchApi<any>('/guard', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};
