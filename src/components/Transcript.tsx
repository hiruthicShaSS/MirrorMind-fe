import { useEffect, useRef, useState } from 'react';
import type { LogMessage } from '../types/api';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TranscriptProps {
  logs: LogMessage[];
  streamingThought?: string;
  isStreaming?: boolean;
}

// Helper to bold keywords in text
const BoldKeywords = ({ text }: { text: string }) => {
  const keywords = [
    'analysis', 'breathing', 'healthcare', 'recovery', 'performance',
    'biofeedback', 'feasibility', 'concept', 'key observations',
    'medical', 'therapeutic', 'improvement', 'focus', 'stress',
    'exercise', 'meditation', 'data', 'metrics', 'insight'
  ];

  let result = text;
  keywords.forEach((keyword) => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
    result = result.replace(
      regex,
      `<strong className="text-purple-300">$1</strong>`
    );
  });

  return (
    <div
      dangerouslySetInnerHTML={{ __html: result }}
      className="prose prose-invert max-w-none"
    />
  );
};

export const Transcript: React.FC<TranscriptProps> = ({ 
  logs, 
  streamingThought = '',
  isStreaming = false 
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, streamingThought]);

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLogs(newExpanded);
  };

  return (
    <div className="h-full flex flex-col bg-black">
      {logs.length === 0 && !streamingThought && (
        <div className="flex-1 flex items-center justify-center text-center px-8">
          <div>
            <p className="text-sm text-gray-500 mb-2">NEURAL_SPACE IDLE</p>
            <p className="text-xs text-gray-600">waiting for thought input...</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-6 px-6 py-6 scrollbar-thin scrollbar-thumb-white/20">
        {/* Completed Messages */}
        {logs.map((log, i) => {
          const isExpanded = expandedLogs.has(i);
          const isTruncated = log.text.length > 280;
          const displayText = isExpanded ? log.text : log.text.substring(0, 280);

          if (log.role === 'system') {
            return (
              <div key={i} className="flex justify-center">
                <div className="text-xs text-gray-600 italic border-l-2 border-gray-700 pl-3">
                  {log.text}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex justify-center">
              <div
                className={`max-w-2xl w-full p-6 rounded-none transition-all border ${
                  log.role === 'user'
                    ? 'bg-white/5 border-white/30 ml-auto'
                    : 'bg-black/40 border-white/20'
                }`}
              >
                {/* Role Label */}
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2 font-mono">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      log.role === 'user' ? 'bg-white' : 'bg-gray-500'
                    }`}
                  />
                  {log.role === 'user' ? 'Your Think' : 'Mirror Mind Response'}
                </div>

                {/* Content */}
                <p className="text-sm leading-relaxed text-white font-mono whitespace-pre-wrap">
                  {displayText}
                  {isTruncated && !isExpanded && '...'}
                </p>

                {/* Expand/Collapse Button */}
                {isTruncated && (
                  <button
                    onClick={() => toggleExpand(i)}
                    className="mt-4 flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show more ({log.text.length - 280} characters)
                      </>
                    )}
                  </button>
                )}

                {/* Timestamp */}
                <div className="text-xs text-gray-600 mt-4 pt-3 border-t border-white/10">
                  {log.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* Streaming Response */}
        {streamingThought && (
          <div className="flex justify-center">
            <div className="max-w-2xl w-full p-6 rounded-none bg-black/40 border border-white/20">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2 font-mono">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {isStreaming ? 'Analyzing your thought...' : 'Response Complete'}
              </div>

              <p className="text-sm leading-relaxed text-white font-mono whitespace-pre-wrap">
                {streamingThought}
                {isStreaming && <span className="ml-1 animate-blink">▋</span>}
              </p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s infinite;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
};
