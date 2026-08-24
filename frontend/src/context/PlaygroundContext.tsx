import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { UseCase, Geography, InteractionEnvelope, WorkflowEndpoint } from '@/types';

export interface PlaygroundMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: 'allow' | 'block' | 'flag' | 'escalate';
  reason?: string;
}

const DEFAULT_GREETING: PlaygroundMessage = {
  role: 'assistant',
  content: 'Hello! I am ready to assist you. My responses and your inputs are protected by ControlPlane.ai.',
};

interface PlaygroundContextType {
  messages: PlaygroundMessage[];
  setMessages: React.Dispatch<React.SetStateAction<PlaygroundMessage[]>>;
  input: string;
  setInput: (val: string) => void;
  useCase: UseCase;
  setUseCase: (val: UseCase) => void;
  geography: Geography;
  setGeography: (val: Geography) => void;
  selectedEndpoint: string;
  setSelectedEndpoint: (val: string) => void;
  latestInteraction: InteractionEnvelope | null;
  setLatestInteraction: React.Dispatch<React.SetStateAction<InteractionEnvelope | null>>;
  sessionId: string | null;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  endpoints: WorkflowEndpoint[];
  setEndpoints: React.Dispatch<React.SetStateAction<WorkflowEndpoint[]>>;
  clearSession: () => void;
}

const PlaygroundContext = createContext<PlaygroundContextType | undefined>(undefined);

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  // Pure in-memory state held in RAM for the entire frontend lifecycle
  const [messages, setMessages] = useState<PlaygroundMessage[]>([DEFAULT_GREETING]);
  const [input, setInput] = useState('');
  const [useCase, setUseCase] = useState<UseCase>('customer_support');
  const [geography, setGeography] = useState<Geography>('US');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('auto');
  const [latestInteraction, setLatestInteraction] = useState<InteractionEnvelope | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<WorkflowEndpoint[]>([]);

  const clearSession = () => {
    setMessages([DEFAULT_GREETING]);
    setLatestInteraction(null);
    setSessionId(null);
    setInput('');
  };

  return (
    <PlaygroundContext.Provider
      value={{
        messages,
        setMessages,
        input,
        setInput,
        useCase,
        setUseCase,
        geography,
        setGeography,
        selectedEndpoint,
        setSelectedEndpoint,
        latestInteraction,
        setLatestInteraction,
        sessionId,
        setSessionId,
        endpoints,
        setEndpoints,
        clearSession,
      }}
    >
      {children}
    </PlaygroundContext.Provider>
  );
}

export function usePlayground() {
  const context = useContext(PlaygroundContext);
  if (!context) {
    throw new Error('usePlayground must be used within a PlaygroundProvider');
  }
  return context;
}
