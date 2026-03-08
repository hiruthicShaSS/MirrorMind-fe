import { useState, useCallback, useRef, useEffect } from 'react';
import { getLiveWebSocketUrl } from '../lib/api';
import type { LiveClientMessage, LiveServerMessage } from '../lib/liveTypes';
import { usePCMPlayer } from './usePCMPlayer';

export type LiveConversationMessage = { role: 'user' | 'assistant'; content: string };

export interface UseLiveAgentState {
  connecting: boolean;
  connected: boolean;
  ready: boolean;
  /** True while agent audio is playing (for UI indicator) */
  isAudioPlaying: boolean;
  messages: LiveConversationMessage[];
  reply: string;
  conceptMap: Record<string, string[]> | null;
  feasibilitySignal: number | null;
  error: string | null;
}

export interface UseLiveAgentActions {
  connect: (sessionId: string) => void;
  disconnect: () => void;
  sendText: (payload: string) => void;
  sendAudio: (payloadBase64: string, mimeType?: string, displayText?: string) => void;
  clearReply: () => void;
  clearError: () => void;
}

export function useLiveAgent(
  onDone?: (data: { conceptMap: Record<string, string[]>; feasibilitySignal?: number }) => void
): UseLiveAgentState & UseLiveAgentActions {
  const { push: pushAudio, stop: stopAudio, isPlaying: isAudioPlaying } = usePCMPlayer();

  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<LiveConversationMessage[]>([]);
  const [reply, setReply] = useState('');
  const [conceptMap, setConceptMap] = useState<Record<string, string[]> | null>(null);
  const [feasibilitySignal, setFeasibilitySignal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const initSentRef = useRef(false);
  const closingRef = useRef(false);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setReplyRef = useRef(setReply);
  const setMessagesRef = useRef(setMessages);
  const replyAccumulatorRef = useRef('');

  setReplyRef.current = setReply;
  setMessagesRef.current = setMessages;

  const READY_FALLBACK_MS = 2000;

  const clearReply = useCallback(() => {
    replyAccumulatorRef.current = '';
    setReply('');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const disconnect = useCallback(() => {
    closingRef.current = true;
    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    stopAudio();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    initSentRef.current = false;
    setConnecting(false);
    setConnected(false);
    setReady(false);
    replyAccumulatorRef.current = '';
  }, []);

  const connect = useCallback(
    (sessionId: string) => {
      disconnect();
      closingRef.current = false;
      setError(null);
      setConnecting(true);
      const url = getLiveWebSocketUrl();
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        setConnecting(false);
        setError(e instanceof Error ? e.message : 'Failed to create WebSocket');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        setConnecting(false);
        setError(null);
        setReady(false);
        // 1. Send init first (sessionId from POST /api/agent/sessions)
        const init: LiveClientMessage = { type: 'init', sessionId };
        ws.send(JSON.stringify(init));
        initSentRef.current = true;
        setConnected(true);
        // Fallback: allow sends after short delay if server never sends `ready`
        readyTimeoutRef.current = setTimeout(() => {
          readyTimeoutRef.current = null;
          setReady((r) => (r ? r : true));
        }, READY_FALLBACK_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data) as LiveServerMessage;
          switch (msg.type) {
            case 'ready':
              if (readyTimeoutRef.current) {
                clearTimeout(readyTimeoutRef.current);
                readyTimeoutRef.current = null;
              }
              setReady(true);
              break;
            case 'text': {
              // Append payload to current assistant message (streaming transcription + model text)
              const token = msg.payload ?? msg.data ?? '';
              replyAccumulatorRef.current += token;
              setReplyRef.current(() => replyAccumulatorRef.current);
              break;
            }
            case 'audio': {
              const audioB64 = msg.payload ?? msg.data;
              if (audioB64) {
                pushAudio(audioB64, msg.mimeType);
              }
              break;
            }
            case 'interrupted': {
              stopAudio();
              replyAccumulatorRef.current = '';
              setReplyRef.current('');
              break;
            }
            case 'done': {
              const map = msg.conceptMap || {};
              const feas = msg.feasibilitySignal ?? null;
              setConceptMap(map);
              setFeasibilitySignal(feas);
              const fromFullText = typeof msg.fullText === 'string' ? msg.fullText.trim() : '';
              const fromStream = replyAccumulatorRef.current.trim();
              const finalContent = fromFullText || fromStream;
              if (finalContent) {
                setMessagesRef.current((prev) => [...prev, { role: 'assistant', content: finalContent }]);
              }
              replyAccumulatorRef.current = '';
              setReplyRef.current('');
              onDone?.({ conceptMap: map, feasibilitySignal: msg.feasibilitySignal });
              break;
            }
            case 'error':
              setError(msg.message || 'Unknown error');
              break;
            default:
              break;
          }
        } catch (e) {
          console.warn('Live message parse error:', e);
        }
      };

      ws.onerror = () => {
        setError('WebSocket error');
      };

      ws.onclose = (event: CloseEvent) => {
        if (readyTimeoutRef.current) {
          clearTimeout(readyTimeoutRef.current);
          readyTimeoutRef.current = null;
        }
        const trailingReply = replyAccumulatorRef.current.trim();
        if (trailingReply) {
          setMessagesRef.current((prev) => [...prev, { role: 'assistant', content: trailingReply }]);
        }
        wsRef.current = null;
        initSentRef.current = false;
        setConnecting(false);
        setConnected(false);
        setReady(false);
        replyAccumulatorRef.current = '';
        setReplyRef.current('');
        if (!closingRef.current && (event.code !== 1000 || event.reason)) {
          const reason = event.reason || (event.code === 1006 ? 'Connection failed. Is the backend running on ' + url + '?' : `Connection closed (${event.code})`);
          setError(reason);
        }
      };
    },
    [disconnect, onDone]
  );

  const sendText = useCallback((payload: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !ready) return;
    setMessagesRef.current((prev) => [...prev, { role: 'user', content: payload }]);
    const msg: LiveClientMessage = { type: 'text', payload };
    wsRef.current.send(JSON.stringify(msg));
    replyAccumulatorRef.current = '';
    setReply('');
  }, [ready]);

  const sendAudio = useCallback((payloadBase64: string, mimeType?: string, displayText?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !ready) return;
    setMessagesRef.current((prev) => [
      ...prev,
      { role: 'user', content: displayText && displayText.trim().length > 0 ? displayText : 'Voice message' },
    ]);
    const msg: LiveClientMessage = { type: 'audio', payload: payloadBase64, mimeType };
    wsRef.current.send(JSON.stringify(msg));
    replyAccumulatorRef.current = '';
    setReply('');
  }, [ready]);

  useEffect(() => {
    return () => {
      disconnect();
      stopAudio();
    };
  }, [disconnect, stopAudio]);

  return {
    connecting,
    connected,
    ready,
    isAudioPlaying,
    messages,
    reply,
    conceptMap,
    feasibilitySignal,
    error,
    connect,
    disconnect,
    sendText,
    sendAudio,
    clearReply,
    clearError,
  };
}
