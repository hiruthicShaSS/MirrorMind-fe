import { useState, useCallback, useRef, useEffect } from 'react';
import { useSessionContext } from '../context/SessionContext';
import { useLiveAgent } from '../hooks/useLiveAgent';
import { startMicCapture } from '../lib/audioCapture';
import { Mic, MicOff, Send, Wifi, WifiOff, Play, Volume2, Radio } from 'lucide-react';
import type { GraphData, LogMessage, Node, Edge } from '../types/api';

interface LiveViewProps {
  onGraphUpdate?: (data: GraphData) => void;
  onLog?: (message: LogMessage) => void;
  onConceptMapUpdate?: (conceptMap: Record<string, string[]>, feasibilitySignal: number | null) => void;
}

/** Strip internal reasoning and raw JSON so only the user-facing reply is shown. */
function stripJsonBlob(text: string): string {
  let out = text;
  const jsonStart = out.indexOf('{"conceptMap":');
  if (jsonStart < 0) return out;

  let depth = 0;
  let j = jsonStart;
  while (j < out.length) {
    if (out[j] === '{') depth++;
    else if (out[j] === '}') {
      depth--;
      if (depth === 0) {
        out = (out.slice(0, jsonStart).trimEnd() + out.slice(j + 1).trimStart()).trim();
        break;
      }
    }
    j++;
  }
  return out;
}

function splitAssistantContent(raw: string): { response: string; thoughts: string } {
  const base = stripJsonBlob(raw || '').trim();
  if (!base) return { response: '', thoughts: '' };

  const withoutThoughtTags = base
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();

  const finalMarker = withoutThoughtTags.match(/\b(final answer|answer|response)\s*:\s*/i);
  if (finalMarker && finalMarker.index !== undefined) {
    const idx = finalMarker.index;
    const splitIdx = idx + finalMarker[0].length;
    return {
      response: withoutThoughtTags.slice(splitIdx).trim(),
      thoughts: withoutThoughtTags.slice(0, idx).trim(),
    };
  }

  const thoughtish = /(^\*\*.*\*\*$)|\b(i'm now|i have now|i've now|i've homed in|zeroing in|moving toward|structuring this|assessment leans|refining|considering options|as a concept map|backend requirements)\b/i;
  const paras = withoutThoughtTags.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) {
    if (paras[0] && thoughtish.test(paras[0])) {
      return { response: '', thoughts: paras[0] };
    }
    return { response: withoutThoughtTags, thoughts: '' };
  }

  let splitAt = 0;
  while (splitAt < paras.length && thoughtish.test(paras[splitAt])) {
    splitAt++;
  }

  if (splitAt > 0) {
    return {
      response: paras.slice(splitAt).join('\n\n').trim(),
      thoughts: paras.slice(0, splitAt).join('\n\n').trim(),
    };
  }

  return { response: withoutThoughtTags, thoughts: '' };
}

function sanitizeTextLabel(text: string): string {
  return text
    .replace(/^[`"'[\]().,:;!?-]+|[`"'[\]().,:;!?-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSentenceLike(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 8 || /[.!?]/.test(text) || text.length > 64;
}

function normalizeConceptMap(map: Record<string, string[]> | null): Record<string, string[]> {
  if (!map) return {};

  const out: Record<string, string[]> = {};
  const seenConcepts = new Set<string>();

  Object.entries(map).forEach(([rawConcept, rawTerms]) => {
    const concept = sanitizeTextLabel(rawConcept);
    if (!concept || isSentenceLike(concept)) return;
    const conceptKey = concept.toLowerCase();
    if (seenConcepts.has(conceptKey)) return;
    seenConcepts.add(conceptKey);

    const terms = Array.isArray(rawTerms)
      ? rawTerms
          .map((t) => sanitizeTextLabel(String(t)))
          .filter((t) => t && !isSentenceLike(t))
          .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
          .slice(0, 8)
      : [];

    out[concept] = terms;
  });

  return out;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);
}

function filterConceptMapToCurrentFlow(
  map: Record<string, string[]> | null,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeReply: string
): Record<string, string[]> {
  const normalized = normalizeConceptMap(map);
  if (Object.keys(normalized).length === 0) return {};

  const recentMessages = messages.slice(-4).map((m) => m.content).join(' ');
  const contextTokens = new Set([
    ...tokenize(recentMessages),
    ...tokenize(activeReply),
  ]);

  if (contextTokens.size === 0) return normalized;

  const filteredEntries = Object.entries(normalized).filter(([concept, terms]) => {
    const conceptTokens = tokenize(concept);
    const termTokens = Array.isArray(terms) ? tokenize(terms.join(' ')) : [];
    return [...conceptTokens, ...termTokens].some((t) => contextTokens.has(t));
  });

  // Keep a useful map even if token matching is too strict.
  if (filteredEntries.length === 0) {
    return Object.fromEntries(Object.entries(normalized).slice(-3));
  }

  return Object.fromEntries(filteredEntries);
}

export default function LiveView({ onGraphUpdate, onLog, onConceptMapUpdate }: LiveViewProps) {
  const { session, loading, initializeSession } = useSessionContext();
  const [userInput, setUserInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [captureHandle, setCaptureHandle] = useState<{ stop: () => Promise<string> } | null>(null);
  const pendingStopRef = useRef(false);
  const voiceTranscriptRef = useRef('');
  const messagesRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const replyRef = useRef('');
  const [stableConceptMap, setStableConceptMap] = useState<Record<string, string[]>>({});

  const handleDone = useCallback(
    (data: { conceptMap: Record<string, string[]>; feasibilitySignal?: number }) => {
      const mapToRender = filterConceptMapToCurrentFlow(data.conceptMap, messagesRef.current, replyRef.current);
      if (!onGraphUpdate || !mapToRender || Object.keys(mapToRender).length === 0) return;
      const rootNode: Node = { id: 'root', label: 'ROOT', type: 'root', x: 0, y: 0 };
      const conceptNodes: Node[] = [];
      const valueNodes: Node[] = [];
      const edges: Edge[] = [];
      Object.entries(mapToRender).forEach(([concept, values], conceptIdx) => {
        const conceptId = `concept-${conceptIdx}`;
        conceptNodes.push({ id: conceptId, label: concept, type: 'concept' });
        edges.push({ source: 'root', target: conceptId });
        if (Array.isArray(values) && values.length > 0) {
          values.forEach((value, valueIdx) => {
            const valueId = `value-${conceptIdx}-${valueIdx}`;
            valueNodes.push({ id: valueId, label: value, type: 'action' });
            edges.push({ source: conceptId, target: valueId });
          });
        }
      });
      onGraphUpdate({
        nodes: [rootNode, ...conceptNodes, ...valueNodes],
        edges,
      });
    },
    [onGraphUpdate]
  );

  const {
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
    clearError,
  } = useLiveAgent(handleDone);

  useEffect(() => {
    messagesRef.current = messages;
    replyRef.current = reply;
  }, [messages, reply]);

  const focusedConceptMap = filterConceptMapToCurrentFlow(conceptMap, messages, reply);

  useEffect(() => {
    if (Object.keys(focusedConceptMap).length > 0) {
      setStableConceptMap(focusedConceptMap);
    }
  }, [focusedConceptMap]);

  useEffect(() => {
    setStableConceptMap({});
  }, [session?.id]);

  const replyEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    replyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reply]);

  useEffect(() => {
    onConceptMapUpdate?.(
      Object.keys(focusedConceptMap).length > 0 ? focusedConceptMap : stableConceptMap,
      feasibilitySignal ?? null
    );
  }, [focusedConceptMap, stableConceptMap, feasibilitySignal, onConceptMapUpdate]);

  const handleSendText = () => {
    if (!userInput.trim()) return;
    if (session) onLog?.({ role: 'user', text: userInput, timestamp: new Date() });
    sendText(userInput.trim());
    setUserInput('');
  };

  const handleMicPressStart = async () => {
    if (!connected || !ready) {
      return;
    }
    pendingStopRef.current = false;
    voiceTranscriptRef.current = '';
    try {
      // Optional browser-side speech recognition for showing what the user said.
      const SpeechRecognitionAPI =
        (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
          const result = event.results[event.results.length - 1];
          const transcript = result[0]?.transcript ?? '';
          voiceTranscriptRef.current = transcript;
        };
        recognition.start();
      }

      const handle = await startMicCapture();
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        try {
          const base64 = await handle.stop();
          if (base64) {
            sendAudio(base64, 'audio/pcm;rate=16000', voiceTranscriptRef.current);
          }
        } catch (err) {
          console.error('Error while stopping mic capture after late handle resolution:', err);
        }
        return;
      }
      setCaptureHandle(handle);
      setRecording(true);
    } catch (e) {
      console.error('Microphone access failed:', e);
      onLog?.({
        role: 'system',
        text: 'Microphone access failed: ' + (e instanceof Error ? e.message : 'Unknown'),
        timestamp: new Date(),
      });
    }
  };

  const handleMicPressEnd = async () => {
    if (!captureHandle || !recording) {
      // Mark that a stop was requested before the capture handle became available.
      pendingStopRef.current = true;
      return;
    }
    pendingStopRef.current = false;
    setRecording(false);
    try {
      const base64 = await captureHandle.stop();
      setCaptureHandle(null);
      if (base64) {
        sendAudio(base64, 'audio/pcm;rate=16000', voiceTranscriptRef.current);
      }
    } catch (err) {
      console.error('Error while stopping mic capture or sending audio:', err);
    }
  };

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md rounded-2xl border border-white/20 bg-white/5 backdrop-blur-xl shadow-2xl p-8 flex flex-col items-center gap-6 text-center">
          <div className="w-12 h-12 rounded-full border border-white/20 bg-white/10 flex items-center justify-center">
            <Radio className="w-6 h-6 text-white/80" />
          </div>
          <div>
            <h3 className="font-bold text-white font-mono text-sm uppercase tracking-wider mb-2">
              Live voice & chat
            </h3>
            <p className="text-gray-400 font-mono text-xs">
              Start a session to talk or type with the agent in real time.
            </p>
          </div>
          <button
            type="button"
            onClick={initializeSession}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/20 border border-white/30 text-white font-mono font-bold uppercase text-xs tracking-wider hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black text-white font-mono">
      {/* Header */}
      <div className="p-4 border-b border-white/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {connecting ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : connected ? (
            <Wifi className="w-4 h-4 text-green-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-xs uppercase">
            {connecting ? 'Connecting...' : connected ? (ready ? (isAudioPlaying ? 'Playing...' : 'Agent ready') : 'Waiting for agent...') : 'Not connected'}
          </span>
          {isAudioPlaying && (
            <span title="Agent speaking">
              <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {connected ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className="px-3 py-1.5 text-xs border border-white/20 hover:bg-white/10"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => connect(session.id)}
              disabled={connecting}
              className="px-3 py-1.5 text-xs bg-white text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? 'Connecting...' : 'Connect Live'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-900/20 border border-red-500/50 text-red-300 text-xs flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Full conversation (for Notion sync); streaming reply appended live */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col min-h-0">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
          Conversation
        </div>
        {messages.length === 0 && !reply && (
          <div className="text-sm text-white/60 whitespace-pre-wrap min-h-[4rem]">
            {connected ? (ready ? 'Type or speak — reply will appear here.' : 'Waiting for agent...') : 'Connect Live, then type or speak.'}
          </div>
        )}
        {messages.map((m, i) => {
          const split = m.role === 'assistant' ? splitAssistantContent(m.content) : { response: '', thoughts: '' };
          const assistantDisplay = m.role === 'assistant' ? split.response : '';
          return (
            <div
              key={i}
              className={`mb-4 ${m.role === 'user' ? 'text-right' : ''}`}
            >
              <span className="text-xs uppercase text-gray-500 mr-2">
                {m.role === 'user' ? 'You' : 'Agent'}
              </span>
              <div
                className={`text-sm whitespace-pre-wrap break-words mt-1 ${
                  m.role === 'user'
                    ? 'inline-block px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-right'
                    : 'text-white'
                }`}
              >
                {m.role === 'assistant' ? (assistantDisplay || 'Open Thoughts to view agent reasoning.') : m.content}
              </div>
              {m.role === 'assistant' && split.thoughts && (
                <details className="mt-2 border border-white/20 bg-white/5 px-3 py-2 rounded-lg">
                  <summary className="text-xs uppercase tracking-wider text-gray-300 cursor-pointer select-none">
                    Thoughts
                  </summary>
                  <div className="text-xs text-gray-300 whitespace-pre-wrap break-words mt-2">
                    {split.thoughts}
                  </div>
                </details>
              )}
            </div>
          );
        })}
        {reply && (
          (() => {
            const split = splitAssistantContent(reply);
            return (
          <div className="mb-4">
            <span className="text-xs uppercase text-gray-500 mr-2">Agent</span>
            <div className="text-sm text-white whitespace-pre-wrap break-words mt-1">
              {split.response || 'Open Thoughts to view agent reasoning.'}
            </div>
            {split.thoughts && (
              <details className="mt-2 border border-white/20 bg-white/5 px-3 py-2 rounded-lg">
                <summary className="text-xs uppercase tracking-wider text-gray-300 cursor-pointer select-none">
                  Thoughts
                </summary>
                <div className="text-xs text-gray-300 whitespace-pre-wrap break-words mt-2">
                  {split.thoughts}
                </div>
              </details>
            )}
          </div>
            );
          })()
        )}
        <div ref={replyEndRef} />
        {Object.keys(stableConceptMap).length > 0 && (
          <div className="mt-6 border-t border-white/20 pt-4">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Concept flow (current topic)
            </div>
            <div className="space-y-2">
              {Object.entries(stableConceptMap).map(([concept, terms]) => (
                <div key={concept} className="border-l-2 border-white/20 pl-3">
                  <div className="text-sm font-bold text-white">{concept}</div>
                  {terms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {terms.map((t, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-white/10 border border-white/20"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {feasibilitySignal != null && (
          <div className="mt-4 text-xs text-gray-400">
            Feasibility: {Math.round(feasibilitySignal * 100)}%
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/20 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
            placeholder={ready ? 'Type a message...' : 'Wait for Agent ready...'}
            disabled={!connected || !ready}
            className="flex-1 bg-white/5 border border-white/20 px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-white/40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSendText}
            disabled={!connected || !ready || !userInput.trim()}
            className="px-4 py-2 bg-white text-black font-bold text-xs uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Voice:</span>
          <button
            type="button"
            onMouseDown={handleMicPressStart}
            onMouseUp={handleMicPressEnd}
            onMouseLeave={recording ? handleMicPressEnd : undefined}
            onTouchStart={(e) => {
              e.preventDefault();
              handleMicPressStart();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleMicPressEnd();
            }}
            disabled={!connected || !ready}
            className={`p-3 border transition-colors ${
              recording
                ? 'bg-red-500/20 border-red-500/50'
                : 'border-white/20 hover:bg-white/10'
            } disabled:opacity-50`}
            title="Hold to talk"
          >
            {recording ? (
              <MicOff className="w-5 h-5 text-red-400" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
          <span className="text-xs text-gray-500">
            {recording ? 'Recording... release to send' : 'Hold to talk'}
          </span>
        </div>
      </div>
    </div>
  );
}
