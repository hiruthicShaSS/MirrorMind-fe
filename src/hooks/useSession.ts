import { useState, useCallback, useRef } from 'react';
import { apiClient } from '../services/api';
import { closeSession as apiCloseSession } from '../lib/api';
import type {
  SessionResponse,
  ThinkRequestBody,
  ThinkStreamComplete,
  ConceptMap,
} from '../types/api';

interface UseSessionState {
  session: SessionResponse | null;
  loading: boolean;
  error: Error | null;
  streaming: boolean;
  streamingThought: string;
  conceptMap: ConceptMap | null;
  feasibilitySignal: number | null;
}

interface UseSessionActions {
  initializeSession: () => Promise<void>;
  endSession: () => Promise<void>;
  /** Returns the final assistant reply text (for chat log). Only plain text, no JSON/concept map. */
  submitThought: (userInput: string, isInterrupt?: boolean) => Promise<string | null>;
  fetchSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
}

export function useSession(): UseSessionState & UseSessionActions {
  const [state, setState] = useState<UseSessionState>({
    session: null,
    loading: false,
    error: null,
    streaming: false,
    streamingThought: '',
    conceptMap: null,
    feasibilitySignal: null,
  });

  // Ref to accumulate streaming text without re-rendering on every chunk
  // This dramatically improves performance for streaming responses
  const streamingTextRef = useRef('');

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const initializeSession = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const session = await apiClient.createSession();
      setState((prev) => ({
        ...prev,
        session,
        conceptMap: session.conceptMap || {},
        loading: false,
      }));
    } catch (err) {
      console.warn('Backend session creation failed, using demo session:', err);
      const demoSession: SessionResponse = {
        id: `demo-${Date.now()}`,
        createdAt: new Date().toISOString(),
        messages: [],
        conceptMap: {},
        isActive: true,
      };
      setState((prev) => ({
        ...prev,
        session: demoSession,
        conceptMap: demoSession.conceptMap,
        loading: false,
        error: null,
      }));
    }
  }, []);

  const endSession = useCallback(async () => {
    const currentSession = state.session;
    if (!currentSession) return;
    try {
      await apiCloseSession(currentSession.id);
    } catch (err) {
      console.warn('End session request failed:', err);
    }
    setState((prev) => ({
      ...prev,
      session: null,
      conceptMap: null,
      feasibilitySignal: null,
      streamingThought: '',
    }));
  }, [state.session]);

  const fetchSession = useCallback(async (sessionId: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const session = await apiClient.getSession(sessionId);
      setState((prev) => ({
        ...prev,
        session,
        conceptMap: session.conceptMap,
        loading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err : new Error(String(err)),
        loading: false,
      }));
    }
  }, []);

  const submitThought = useCallback(
    async (userInput: string, isInterrupt?: boolean): Promise<string | null> => {
      if (!state.session) {
        setState((prev) => ({
          ...prev,
          error: new Error('No active session'),
        }));
        return null;
      }

      setState((prev) => ({
        ...prev,
        streaming: true,
        streamingThought: '',
        error: null,
        feasibilitySignal: null,
      }));

      // Reset ref for new streaming session
      streamingTextRef.current = '';
      let finalConceptMap: ConceptMap | null = null;
      let updateCount = 0;

      try {
        const body: ThinkRequestBody = {
          userInput,
          isInterrupt,
        };

        // Stream chunks from backend
        for await (const chunk of apiClient.streamThinking(
          state.session.id,
          body
        )) {
          if ('chunk' in chunk) {
            // Accumulate text in ref (no re-renders yet - much faster!)
            streamingTextRef.current += chunk.chunk || '';
            updateCount++;

            // Batch updates: update React state every 5 chunks
            // This provides smooth UI updates while reducing re-renders
            // Prevents React from re-rendering on literally every character
            if (updateCount % 5 === 0) {
              setState((prev) => ({
                ...prev,
                streamingThought: streamingTextRef.current,
              }));
            }
          } else if ('done' in chunk) {
            // Extract final data from completion chunk
            const complete = chunk as ThinkStreamComplete;
            finalConceptMap = complete.conceptMap;
            // Update state with feasibility signal immediately
            setState((prev) => ({
              ...prev,
              feasibilitySignal: complete.feasibilitySignal ?? null,
            }));
          }
        }

        // Ensure final text is displayed by doing a final state update
        setState((prev) => ({
          ...prev,
          streamingThought: streamingTextRef.current,
        }));

        // Fetch updated session to sync with backend
        await fetchSession(state.session.id);

        const finalText = streamingTextRef.current || null;
        setState((prev) => ({
          ...prev,
          streaming: false,
          conceptMap: finalConceptMap || prev.conceptMap,
        }));
        return finalText;
      } catch (err) {
        console.error('Think error:', err);
        setState((prev) => ({
          ...prev,
          streaming: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
        return null;
      } finally {
        streamingTextRef.current = '';
      }
    },
    [state.session, fetchSession]
  );

  return {
    ...state,
    initializeSession,
    endSession,
    submitThought,
    fetchSession,
    clearError,
  };
}
