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

  getEvents: async (filters?: Record<string, string>): Promise<AuditEvent[]> => {
    const params = filters
      ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString()
      : '';
    const data = await fetchApi<{ events: any[] } | any[]>(`/audit/events${params}`);
    const rawList: any[] = Array.isArray(data) ? data : (data as any).events ?? [];
    return rawList.map((e: any) => ({
      interaction_id: e.interaction_id,
      timestamp: e.created_at || e.timestamp || new Date().toISOString(),
      use_case: e.use_case,
      geography: e.geography,
      direction: e.direction,
      decision_action: e.decision_action,
      risk_tier: e.envelope?.risk_assessment?.tier || 'low',
      interaction: e.envelope || e.interaction || {},
    }));
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

  appealBlockedRequest: (data: {
    interaction_id?: string;
    session_id?: string;
    content?: string;
    direction?: string;
    payload?: any;
    reason?: string;
    use_case?: string;
    geography?: string;
    checks_summary?: any[];
  }) =>
    fetchApi<{ status: string; interaction_id: string }>('/escalations/appeal', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

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

  generateProposals: async (): Promise<ThresholdProposal[]> => {
    const data = await fetchApi<ThresholdProposal[] | any>('/health/proposals/generate', {
      method: 'POST',
    });
    return Array.isArray(data) ? data : data.proposals ?? [];
  },

  resetProposals: async () => {
    return fetchApi<any>('/health/proposals/reset', {
      method: 'POST',
    });
  },

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

  updateEndpoint: (endpointId: string, endpoint: any) =>
    fetchApi<any>(`/router/endpoints/${endpointId}`, {
      method: 'PUT',
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

  // ── Secrets Registration (§4) ──────────────────────────────────────────
  registerSecret: (rawSecret: string, secretType: string = 'api_key', actionOnMatch: string = 'block') =>
    fetchApi<{ status: string; secret_id: string; secret_type: string; action_on_match: string; date_registered: string }>('/secrets/register', {
      method: 'POST',
      body: JSON.stringify({ raw_secret: rawSecret, secret_type: secretType, action_on_match: actionOnMatch }),
    }),

  getSecrets: async () => {
    const data = await fetchApi<{ secrets: any[] }>('/secrets');
    return data.secrets || [];
  },

  revokeSecret: (secretId: string) =>
    fetchApi<{ status: string; secret_id: string }>(`/secrets/${secretId}/revoke`, {
      method: 'POST',
    }),

  // ── Structured Policies (§3 & §5) ────────────────────────────────────────
  extractPolicyRule: (text: string, title?: string) =>
    fetchApi<any>('/policies/extract', {
      method: 'POST',
      body: JSON.stringify({ text, title }),
    }),

  saveStructuredPolicy: (policyRecord: any) =>
    fetchApi<{ status: string; policy_id: string; version: number }>('/policies/structured', {
      method: 'POST',
      body: JSON.stringify(policyRecord),
    }),

  getStructuredPolicies: async (status?: string) => {
    const url = status ? `/policies/structured?status=${status}` : '/policies/structured';
    const data = await fetchApi<{ policies: any[] }>(url);
    return data.policies || [];
  },

  getPolicyHistory: (policyId: string) =>
    fetchApi<{ policy_id: string; history: any[] }>(`/policies/structured/${policyId}/history`),

  archivePolicy: (policyId: string) =>
    fetchApi<{ status: string; policy_id: string }>(`/policies/structured/${policyId}/archive`, {
      method: 'POST',
    }),

  // ── Use-Case Configuration (§5 & §9) ─────────────────────────────────────
  getUseCaseConfig: (useCaseId: string) =>
    fetchApi<any>(`/configs/${useCaseId}`),

  saveUseCaseConfig: (useCaseId: string, config: any) =>
    fetchApi<{ status: string; use_case_id: string; version: number }>(`/configs/${useCaseId}`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getUseCaseConfigHistory: (useCaseId: string) =>
    fetchApi<{ use_case_id: string; history: any[] }>(`/configs/${useCaseId}/history`),

  // ── Redaction Vault (§3.10) ──────────────────────────────────────────────
  revealVaultEntity: (interactionId: string, placeholderId: string) =>
    fetchApi<{ placeholder_id: string; raw_value: string }>(`/vault/${interactionId}/reveal`, {
      method: 'POST',
      body: JSON.stringify({ placeholder_id: placeholderId }),
    }),

  guardAction: (request: any) =>
    fetchApi<any>('/guard', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};

