import { useState, useEffect } from "react";
import { getConceptMapHistory, getAllSessions, type ConceptMapSummary, type SessionResponse } from "../lib/api";
import { Loader } from "lucide-react";

function sessionToSummary(s: SessionResponse): ConceptMapSummary {
  const conceptMap = s.conceptMap && typeof s.conceptMap === "object" ? s.conceptMap : {};
  return {
    sessionId: s.id,
    conceptMap,
    feasibilitySignal: (s as SessionResponse & { feasibilitySignal?: number }).feasibilitySignal ?? null,
    createdAt: s.createdAt,
    updatedAt: (s as SessionResponse & { updatedAt?: string }).updatedAt,
    isActive: s.isActive,
    messageCount: s.messages?.length ?? 0,
    preview: s.messages?.[0]?.content?.slice(0, 100) ?? "",
  };
}

export default function ConceptMapHistory() {
  const [conceptMaps, setConceptMaps] = useState<ConceptMapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      let data: ConceptMapSummary[];
      try {
        data = await getConceptMapHistory(50);
      } catch {
        data = [];
      }
      if (!Array.isArray(data) || data.length === 0) {
        const sessions: SessionResponse[] = await getAllSessions(50);
        data = sessions
          .map(sessionToSummary)
          .filter((item) => Object.keys(item.conceptMap || {}).length > 0);
      }
      setConceptMaps(
        data.map((item) => ({
          ...item,
          conceptMap:
            item.conceptMap && typeof item.conceptMap === "object"
              ? item.conceptMap
              : {},
        }))
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load history";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        <Loader className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm font-mono">Loading concept maps...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-400 text-sm font-mono border border-red-500/50 bg-red-900/20">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold uppercase tracking-wider text-white font-mono">
          Concept Map History
        </h2>
        <button
          type="button"
          onClick={loadHistory}
          className="text-xs text-gray-400 hover:text-white font-mono uppercase"
        >
          Refresh
        </button>
      </div>
      {conceptMaps.length === 0 ? (
        <div className="text-center py-12 text-gray-500 font-mono text-sm">
          <p>No concept maps yet.</p>
          <p className="mt-2">Start a session, have a conversation, then click &quot;End session&quot; to store the concept map.</p>
          <button
            type="button"
            onClick={loadHistory}
            className="mt-4 px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-xs uppercase"
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {conceptMaps.map((item) => (
            <div
              key={item.sessionId}
              className="border border-white/20 bg-black/40 backdrop-blur-md p-6 rounded-none hover:border-white/40 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <strong className="text-white font-mono text-sm uppercase">
                    Session {item.sessionId.slice(0, 8)}...
                  </strong>
                  <div className="text-xs text-gray-400 mt-1 font-mono">
                    {new Date(item.createdAt).toLocaleDateString()} •{" "}
                    {item.messageCount} messages •{" "}
                    {item.isActive ? (
                      <span className="text-green-400">Active</span>
                    ) : (
                      <span className="text-gray-500">Closed</span>
                    )}
                  </div>
                </div>
                {item.feasibilitySignal !== null && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500 font-mono uppercase mb-1">
                      Feasibility
                    </div>
                    <div className="text-lg font-bold text-white font-mono">
                      {Math.round(item.feasibilitySignal * 100)}%
                    </div>
                  </div>
                )}
              </div>

              {item.preview && (
                <p className="text-sm text-gray-400 mb-4 font-mono leading-relaxed">
                  {item.preview}...
                </p>
              )}

              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 font-mono">
                  Concepts ({Object.keys(item.conceptMap || {}).length})
                </div>
                <div className="space-y-3">
                  {Object.entries(item.conceptMap || {}).map(([concept, terms]) => (
                    <div key={concept} className="border-l-2 border-white/20 pl-4">
                      <div className="text-sm font-bold text-white uppercase mb-2 font-mono">
                        {concept}
                      </div>
                      {Array.isArray(terms) && terms.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {terms.map((term, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 text-xs bg-white/10 border border-white/20 text-white font-mono rounded-none"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
