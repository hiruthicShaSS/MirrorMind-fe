import { useState, useEffect } from "react";
import { getAllSessions, type SessionResponse, type ConceptMapSummary } from "../lib/api";
import { Loader, Search } from "lucide-react";
import EditableConceptMap from "./EditableConceptMap";

// Normalize session to ConceptMapSummary-like shape for list + detail
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

export default function KnowledgeBase() {
  const [conceptMaps, setConceptMaps] = useState<ConceptMapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use getAllSessions so we show all sessions (including those with empty concept map)
      const sessions: SessionResponse[] = await getAllSessions(50);
      const summaries = sessions.map(sessionToSummary);
      setConceptMaps(summaries);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load knowledge base";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const filteredMaps = conceptMaps.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const map = item.conceptMap || {};
    return (
      item.sessionId.toLowerCase().includes(query) ||
      item.preview?.toLowerCase().includes(query) ||
      Object.keys(map).some((concept) => concept.toLowerCase().includes(query)) ||
      Object.values(map).some((terms) =>
        Array.isArray(terms) && terms.some((term) => String(term).toLowerCase().includes(query))
      )
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        <Loader className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm font-mono">Loading knowledge base...</span>
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

  const selectedMap = selectedSession
    ? conceptMaps.find((m) => m.sessionId === selectedSession)
    : null;

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="border-b border-white/20 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold uppercase tracking-wider text-white font-mono">
            Knowledge Base
          </h2>
          <button
            onClick={loadHistory}
            className="text-xs text-gray-400 hover:text-white font-mono uppercase"
          >
            Refresh
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search concepts, terms, sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 px-10 py-2 text-sm font-mono focus:outline-none focus:border-white/40"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Session List */}
        <div className="w-1/3 border-r border-white/20 overflow-y-auto">
          {filteredMaps.length === 0 ? (
            <div className="p-6 text-center text-gray-500 font-mono text-sm">
              {searchQuery ? "No matches found" : "No knowledge entries yet"}
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {filteredMaps.map((item) => (
                <button
                  key={item.sessionId}
                  onClick={() => setSelectedSession(item.sessionId)}
                  className={`w-full text-left p-4 border rounded-none transition-colors font-mono ${
                    selectedSession === item.sessionId
                      ? "bg-white/10 border-white/40"
                      : "bg-black/40 border-white/20 hover:border-white/30"
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {item.sessionId.slice(0, 8)}...
                  </div>
                  <div className="text-sm text-white font-bold mb-2">
                    {Object.keys(item.conceptMap).length} Concepts
                  </div>
                  {item.preview && (
                    <div className="text-xs text-gray-500 line-clamp-2">
                      {item.preview}
                    </div>
                  )}
                  {item.feasibilitySignal !== null && (
                    <div className="text-xs text-gray-400 mt-2">
                      Feasibility: {Math.round(item.feasibilitySignal * 100)}%
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Selected Concept Map */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedMap ? (
            <div className="space-y-6">
              <div>
                <div className="text-xs text-gray-400 font-mono mb-2">
                  Session: {selectedMap.sessionId}
                </div>
                <div className="text-xs text-gray-400 font-mono mb-4">
                  Created: {new Date(selectedMap.createdAt).toLocaleString()} •{" "}
                  {selectedMap.messageCount} messages •{" "}
                  {selectedMap.isActive ? (
                    <span className="text-green-400">Active</span>
                  ) : (
                    <span className="text-gray-500">Closed</span>
                  )}
                </div>
                {selectedMap.preview && (
                  <div className="p-4 bg-white/5 border border-white/20 mb-6">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 font-mono">
                      Preview
                    </div>
                    <p className="text-sm text-white font-mono leading-relaxed">
                      {selectedMap.preview}
                    </p>
                  </div>
                )}
              </div>

              <EditableConceptMap
                sessionId={selectedMap.sessionId}
                conceptMap={selectedMap.conceptMap || {}}
                onUpdate={(updated) => {
                  setConceptMaps((prev) =>
                    prev.map((m) =>
                      m.sessionId === selectedMap.sessionId
                        ? { ...m, conceptMap: updated }
                        : m
                    )
                  );
                }}
              />

              {selectedMap.feasibilitySignal !== null && (
                <div className="p-4 bg-white/5 border border-white/20">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 font-mono">
                    Feasibility Signal
                  </div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {Math.round(selectedMap.feasibilitySignal * 100)}%
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
              Select a session to view concept map
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
