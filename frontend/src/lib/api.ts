import type { 
  ChatRequest, ChatResponse, EscalationItem, ReviewAction,
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
  sendChat: (request: ChatRequest) => 
    fetchApi<ChatResponse>('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
    
  getInteraction: (id: string) => fetchApi<any>(`/interactions/${id}`),
  
  getEvents: (filters?: any) => {
    const params = new URLSearchParams(filters || {}).toString();
    return fetchApi<AuditEvent[]>(`/audit/events?${params}`);
  },
  
  getEventStats: () => fetchApi<any>('/audit/stats'),
  
  getEscalations: () => fetchApi<EscalationItem[]>('/escalations'),
  
  resolveEscalation: (id: string, action: ReviewAction, data: any) => 
    fetchApi<void>(`/escalations/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action, ...data }),
    }),
    
  getPolicies: () => fetchApi<PolicyRule[]>('/policies'),
  
  updatePolicies: (policies: PolicyRule[]) => 
    fetchApi<void>('/policies', {
      method: 'PUT',
      body: JSON.stringify(policies),
    }),
    
  getSystemHealth: () => fetchApi<any>('/health/system'),
  
  getAnomalyAlerts: () => fetchApi<AnomalyAlert[]>('/health/alerts'),
  
  getOutcomeStats: () => fetchApi<any>('/trust/outcomes'),
  
  getModels: () => fetchApi<any>('/models'),
  
  guardAction: (request: any) => 
    fetchApi<any>('/guard', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
};
