import { createContext, useContext, type PropsWithChildren } from 'react';
import { useSession } from '../hooks/useSession';
import type { SessionResponse, ConceptMap } from '../types/api';

interface SessionContextType {
  session: SessionResponse | null;
  loading: boolean;
  error: Error | null;
  streaming: boolean;
  streamingThought: string;
  conceptMap: ConceptMap | null;
  feasibilitySignal: number | null;
  initializeSession: () => Promise<void>;
  endSession: () => Promise<void>;
  submitThought: (userInput: string, isInterrupt?: boolean) => Promise<string | null>;
  fetchSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(
  undefined
);

export function SessionProvider({ children }: PropsWithChildren) {
  const sessionHook = useSession();
  // Session is started explicitly via "Start session" button, not on mount
  return (
    <SessionContext.Provider value={sessionHook}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionContextType {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
