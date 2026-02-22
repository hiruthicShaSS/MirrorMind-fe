import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain, Send, Square, Play, SquareStop, Mic, MicOff } from 'lucide-react';
import { useSessionContext } from '../context/SessionContext';
import type { GraphData, LogMessage, Node, Edge } from '../types/api';

interface LiveSessionProps {
  graphData: GraphData;
  onGraphUpdate: (data: GraphData) => void;
  onLog: (message: LogMessage) => void;
}

export const LiveSession: React.FC<LiveSessionProps> = ({
  graphData,
  onGraphUpdate,
  onLog,
}) => {
  const {
    session,
    loading,
    streaming,
    streamingThought,
    conceptMap,
    submitThought,
    initializeSession,
    endSession,
  } = useSessionContext();

  const [userInput, setUserInput] = useState('');
  const [endingSession, setEndingSession] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    if (!session) {
      onLog({
        role: 'system',
        text: 'Start a session first to send messages.',
        timestamp: new Date(),
      });
      return;
    }

    onLog({
      role: 'user',
      text: userInput,
      timestamp: new Date(),
    });

    const finalText = await submitThought(userInput);
    if (finalText && typeof finalText === 'string') {
      onLog({
        role: 'assistant',
        text: finalText,
        timestamp: new Date(),
      });
    }

    // Update graph from concept map - properly map concepts and values to root
    if (conceptMap && Object.keys(conceptMap).length > 0) {
      const rootNode: Node = { id: 'root', label: 'ROOT', type: 'root', x: 0, y: 0 };
      const conceptNodes: Node[] = [];
      const valueNodes: Node[] = [];
      const edges: Edge[] = [];

      // Create concept nodes and connect them to root
      Object.entries(conceptMap).forEach(([concept, values], conceptIdx) => {
        const conceptId = `concept-${conceptIdx}`;
        conceptNodes.push({
          id: conceptId,
          label: concept,
          type: 'concept',
        });
        // Connect concept to root
        edges.push({
          source: 'root',
          target: conceptId,
        });

        // Create value nodes and connect them to their concept
        if (Array.isArray(values) && values.length > 0) {
          values.forEach((value, valueIdx) => {
            const valueId = `value-${conceptIdx}-${valueIdx}`;
            valueNodes.push({
              id: valueId,
              label: value,
              type: 'action',
            });
            // Connect value to concept
            edges.push({
              source: conceptId,
              target: valueId,
            });
          });
        }
      });

      const allNodes = [rootNode, ...conceptNodes, ...valueNodes];

      onGraphUpdate({
        nodes: allNodes,
        edges: edges,
      });
    }

    setUserInput('');
  };

  const handleInterrupt = async () => {
    await submitThought(userInput, true);
    onLog({
      role: 'system',
      text: 'Stopped.',
      timestamp: new Date(),
    });
  };

  const handleEndSession = async () => {
    setEndingSession(true);
    await endSession();
    onLog({
      role: 'system',
      text: 'Session ended. Concept map saved. Start a new session to continue.',
      timestamp: new Date(),
    });
    setEndingSession(false);
  };

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      onLog({
        role: 'system',
        text: 'Speech input is not supported in this browser.',
        timestamp: new Date(),
      });
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      setUserInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, [onLog]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  // No session: show Start session button
  if (!session) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-black border-t border-white/20 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-4 p-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-white/50" />
            <span className="text-xs font-mono text-gray-500 uppercase">
              No active session
            </span>
          </div>
          <button
            type="button"
            onClick={initializeSession}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold uppercase text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Starting...' : 'Start session'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-black border-t border-white/20 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-4 p-6 max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-white/50" />
          <span className="text-xs font-mono text-gray-500 uppercase">
            Session: {session.id.slice(0, 8)}
          </span>
        </div>

        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder={
            streaming
              ? 'Processing...'
              : 'Type or speak...'
          }
          disabled={streaming}
          className="flex-1 bg-transparent border border-white/30 px-4 py-3 text-white placeholder-gray-500 font-mono text-sm focus:outline-none focus:border-white transition-colors disabled:opacity-50"
        />

        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          disabled={streaming}
          className={`p-3 border font-mono transition-colors ${
            isListening
              ? 'bg-red-500/20 border-red-500/50 text-red-300'
              : 'border-white/30 text-white hover:bg-white/10'
          } disabled:opacity-50`}
          title={isListening ? 'Stop listening' : 'Speak'}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {!streaming ? (
          <>
            <button
              type="submit"
              disabled={!userInput.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold uppercase text-xs tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
            <button
              type="button"
              onClick={handleEndSession}
              disabled={endingSession}
              className="flex items-center gap-2 px-6 py-3 border border-white/30 text-white font-bold uppercase text-xs tracking-wider hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <SquareStop className="w-4 h-4" />
              {endingSession ? 'Ending...' : 'End session'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleInterrupt}
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold uppercase text-xs tracking-wider hover:opacity-90 transition-opacity"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
      </form>

      {/* Streaming indicator */}
      {streaming && (
        <div className="border-t border-white/20 px-6 py-3 bg-white/5">
          <div className="text-xs font-mono text-gray-400 mb-2">Thinking...</div>
          <div className="text-xs text-white/70 line-clamp-2 font-mono">
            {streamingThought || 'Processing...'}
          </div>
        </div>
      )}
    </div>
  );
};
