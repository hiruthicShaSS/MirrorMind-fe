import { useState, useEffect, useCallback } from 'react';
import {
  syncSessionToNotion,
  getKnowledgeGraph,
  rebuildKnowledgeGraph,
  searchKnowledgeGraph,
  getKnowledgeGraphNodeDetails,
  type KnowledgeGraphResponse,
  type KnowledgeGraphNodeDetails,
  type KnowledgeGraphSearchResult,
  type KnowledgeGraphRebuildStats,
} from './lib/api';
import { MindMap } from './components/AgentChat';
import { Intro } from './components/Intro';
import LiveView from './components/LiveView';
import { useSessionContext } from './context/SessionContext';
import type { GraphData, LogMessage } from './types/api';
import { Layers, Share2, Menu, X, Home, Brain, Cpu, ChevronLeft, ChevronRight, Sparkles, Radio, Map } from 'lucide-react';

function AppContent() {
  // State management for UI
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isRightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [isLeftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showConceptMapModal, setShowConceptMapModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [graphMode, setGraphMode] = useState<'live' | 'knowledge'>('live');
  const [knowledgeGraphData, setKnowledgeGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [knowledgeGraphLoading, setKnowledgeGraphLoading] = useState(false);
  const [knowledgeGraphError, setKnowledgeGraphError] = useState<string | null>(null);
  const [knowledgeRebuilding, setKnowledgeRebuilding] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeGraphRebuildStats | null>(null);
  const [kgQuery, setKgQuery] = useState('');
  const [kgResults, setKgResults] = useState<KnowledgeGraphSearchResult[]>([]);
  const [kgSearchLoading, setKgSearchLoading] = useState(false);
  const [focusedKgNodeId, setFocusedKgNodeId] = useState<string | null>(null);
  const [selectedKgNodeId, setSelectedKgNodeId] = useState<string | null>(null);
  const [selectedKgNodeDetails, setSelectedKgNodeDetails] = useState<KnowledgeGraphNodeDetails | null>(null);
  const [nodeDetailsLoading, setNodeDetailsLoading] = useState(false);

  const { session, streaming, streamingThought, conceptMap, feasibilitySignal } = useSessionContext();
  const [syncingToNotion, setSyncingToNotion] = useState(false);
  const [liveConceptMap, setLiveConceptMap] = useState<Record<string, string[]>>({});
  const [liveFeasibilitySignal, setLiveFeasibilitySignal] = useState<number | null>(null);

  const mapKnowledgeGraph = (graph: KnowledgeGraphResponse): GraphData => ({
    nodes: (graph.nodes || []).map((n) => {
      const rawType = (n.type || '').toLowerCase();
      return {
        id: String(n.id),
        label: n.label || n.name || String(n.id),
        type: rawType.includes('concept') ? 'concept' : 'action',
        weight: n.weight ?? 1,
        rawType: n.type || 'term',
        sessionIds: n.sessionIds || [],
      };
    }),
    edges: (graph.edges || []).map((e) => ({
      source: String(e.source),
      target: String(e.target),
      label: e.label || e.type || '',
      relationType: e.type || e.label || '',
      weight: e.weight ?? 1,
    })),
  });

  const fetchKnowledgeGraphData = useCallback(async () => {
    setKnowledgeGraphLoading(true);
    try {
      const res = await getKnowledgeGraph(300, 600);
      setKnowledgeGraphData(mapKnowledgeGraph(res));
      setKnowledgeGraphError(null);
    } catch (e) {
      setKnowledgeGraphError(e instanceof Error ? e.message : 'Failed to load knowledge graph');
    } finally {
      setKnowledgeGraphLoading(false);
    }
  }, []);

  const fetchNodeDetails = useCallback(async (nodeId: string) => {
    setNodeDetailsLoading(true);
    try {
      const details = await getKnowledgeGraphNodeDetails(nodeId);
      setSelectedKgNodeDetails(details);
    } catch (e) {
      setSelectedKgNodeDetails(null);
      setKnowledgeGraphError(e instanceof Error ? e.message : 'Failed to load node details');
    } finally {
      setNodeDetailsLoading(false);
    }
  }, []);

  const handleRebuildKnowledgeGraph = useCallback(async () => {
    setKnowledgeRebuilding(true);
    try {
      const stats = await rebuildKnowledgeGraph();
      setKnowledgeStats(stats);
      setKnowledgeGraphError(null);
      await fetchKnowledgeGraphData();
    } catch (e) {
      setKnowledgeGraphError(e instanceof Error ? e.message : 'Failed to rebuild knowledge graph');
    } finally {
      setKnowledgeRebuilding(false);
    }
  }, [fetchKnowledgeGraphData]);

  // Initialize with root node
  useEffect(() => {
    setGraphData({
      nodes: [{ id: '1', label: 'NEURAL_ROOT', type: 'root', x: 0, y: 0 }],
      edges: [],
    });
  }, []);

  useEffect(() => {
    if (graphMode === 'knowledge') {
      fetchKnowledgeGraphData();
    }
  }, [graphMode, fetchKnowledgeGraphData]);

  useEffect(() => {
    if (conceptMap && Object.keys(conceptMap).length > 0) {
      fetchKnowledgeGraphData();
    }
  }, [conceptMap, fetchKnowledgeGraphData]);

  useEffect(() => {
    const q = kgQuery.trim();
    if (q.length < 2) {
      setKgResults([]);
      setKgSearchLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setKgSearchLoading(true);
      try {
        const results = await searchKnowledgeGraph(q, 20);
        setKgResults(results || []);
      } catch (e) {
        setKnowledgeGraphError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setKgSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [kgQuery]);

  const handleSyncToNotion = async () => {
    if (!session?.id) {
      setLogs((prev) => [
        ...prev,
        { role: 'system', text: 'Start a session first to sync to Notion.', timestamp: new Date() },
      ]);
      return;
    }
    setSyncingToNotion(true);
    try {
      await syncSessionToNotion(session.id);
      await fetchKnowledgeGraphData();
      setLogs((prev) => [
        ...prev,
        { role: 'system', text: 'Synced to Notion.', timestamp: new Date() },
      ]);
      alert('Synced to Notion!');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sync failed';
      setLogs((prev) => [
        ...prev,
        { role: 'system', text: `Notion sync failed: ${message}`, timestamp: new Date() },
      ]);
      alert('Sync failed: ' + message);
    } finally {
      setSyncingToNotion(false);
    }
  };

  return (
    <div className="w-full h-screen bg-black text-white relative font-sans overflow-hidden">
      {/* Subtle grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-10"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* Intro Modal Overlay */}
      {showIntro && (
        <div className="absolute inset-0 z-40">
          <Intro onComplete={() => setShowIntro(false)} />
        </div>
      )}

      {/* Main Application Layout */}
      <div
        className={`absolute inset-0 flex transition-opacity duration-1000 ${
          showIntro ? 'opacity-0 invisible pointer-events-none' : 'opacity-100 visible'
        }`}
      >
        {/* LEFT SIDEBAR - Collapsible */}
        <div
          className={`${
            isLeftSidebarOpen ? 'w-64' : 'w-0'
          } transition-all duration-300 ease-in-out border-r border-white/10 bg-white/5 backdrop-blur-xl flex flex-col h-full overflow-hidden`}
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Brain className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-lg">NEURAL_SPACE</h2>
            </div>
            <p className="text-xs text-gray-400">Cognitive Processing Engine</p>
          </div>

          {/* Sidebar Content - Reserved for future menu items */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-white/10">
                <p className="text-sm font-medium">Active Session</p>
                <p className="text-xs text-gray-400 mt-1">Connected</p>
              </div>
              <div className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer border border-white/10">
                <p className="text-sm font-medium">Knowledge Base</p>
                <p className="text-xs text-gray-400 mt-1">0 nodes</p>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER MAIN AREA - MindMap Canvas */}
        <div className="flex-1 flex flex-col relative z-10">
          {/* Top Navigation Bar */}
          <nav className="h-20 border-b border-white/15 bg-black/80 backdrop-blur-sm flex items-center justify-between px-8">
            {/* Left Nav Section */}
            <div className="flex items-center gap-6">
              {/* Left Sidebar Toggle */}
              <button
                onClick={() => setLeftSidebarOpen(!isLeftSidebarOpen)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
                title="Toggle sidebar"
              >
                {isLeftSidebarOpen ? (
                  <ChevronLeft className="w-5 h-5 text-gray-400 group-hover:text-white" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white" />
                )}
              </button>

              {/* Logo & Title */}
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight">MIRROR.MIND</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-none border border-white/40 bg-white/10 uppercase tracking-widest font-mono">
                  v1.0 alpha
                </span>
              </div>
            </div>

            {/* Center - Status */}
            <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm text-gray-300">SYSTEM_ACTIVE</span>
            </div>

            {/* Right Nav Section - Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowIntro(true)}
                className="px-4 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-all hover:border-white/40"
                title="Back to home"
              >
                <Home className="w-4 h-4" />
              </button>

              <button
                onClick={() => setGraphMode((prev) => (prev === 'knowledge' ? 'live' : 'knowledge'))}
                className={`px-4 py-2 text-sm rounded-lg border transition-all flex items-center gap-2 ${
                  graphMode === 'knowledge'
                    ? 'bg-green-500/20 border-green-400/60 text-green-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 hover:border-white/40'
                }`}
                title="Toggle knowledge graph"
              >
                <Map className="w-4 h-4" />
                {graphMode === 'knowledge' ? 'Knowledge Graph' : 'Live Graph'}
              </button>

              <button
                onClick={handleSyncToNotion}
                disabled={!session?.id || syncingToNotion}
                className="px-4 py-2 text-sm rounded-lg bg-white/5 hover:bg-white/10 border border-white/30 hover:border-white transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync to Notion"
              >
                <Share2 className="w-4 h-4" />
                {syncingToNotion ? 'Syncing...' : 'Sync to Notion'}
              </button>

              <button
                onClick={() => setRightSidebarOpen(!isRightSidebarOpen)}
                className="px-4 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-all hover:border-white/40"
              >
                {isRightSidebarOpen ? (
                  <Layers className="w-4 h-4" />
                ) : (
                  <Menu className="w-4 h-4" />
                )}
              </button>
            </div>
          </nav>

          {/* Content Area - MindMap */}
          <div className="flex-1 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute w-full h-full opacity-5">
                <Sparkles className="w-full h-full" />
              </div>
            </div>

            {/* MindMap Component */}
            <div className="absolute inset-0 z-0">
              <MindMap
                data={graphMode === 'knowledge' ? knowledgeGraphData : graphData}
                mode={graphMode === 'knowledge' ? 'knowledge' : 'default'}
                focusedNodeId={graphMode === 'knowledge' ? focusedKgNodeId : null}
                onNodeClick={graphMode === 'knowledge'
                  ? (node) => {
                      setSelectedKgNodeId(node.id);
                      setFocusedKgNodeId(node.id);
                      fetchNodeDetails(node.id);
                    }
                  : undefined}
              />
            </div>
          </div>

          {/* Bottom Control Panel removed; Live interactions happen in the right sidebar */}
        </div>

        {/* RIGHT SIDEBAR - Live, Concept Map, Analytics */}
        <div
          className={`${
            isRightSidebarOpen ? 'w-screen sm:w-[480px] lg:w-[520px]' : 'w-0'
          } transition-all duration-300 ease-in-out border-l border-white/10 bg-gradient-to-b from-black via-gray-950 to-black backdrop-blur-xl flex flex-col h-full overflow-hidden relative`}
        >
          {/* Close Button */}
          {isRightSidebarOpen && (
            <div className="absolute top-4 right-4 md:hidden z-30">
              <button
                onClick={() => setRightSidebarOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg border border-white/20"
              >
                <X className="text-white w-4 h-4" />
              </button>
            </div>
          )}

          {/* Live Content */}
          <div className="border-b border-white/20 bg-black/60">
            <div className="flex items-center gap-2 px-4 py-3">
              <Radio className="w-4 h-4 text-white" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-white font-mono">
                Live
              </h3>
              <div
                className={`ml-auto w-2 h-2 rounded-full ${
                  streaming ? 'bg-white animate-pulse' : 'bg-white/30'
                }`}
              />
            </div>
          </div>
          <div className={`${graphMode === 'knowledge' ? 'h-[46%]' : 'flex-1'} overflow-hidden`}>
            <LiveView
              onGraphUpdate={(newData) => setGraphData(newData)}
              onLog={(msg) => setLogs((prev) => [...prev, msg])}
              onTurnComplete={() => {
                fetchKnowledgeGraphData();
              }}
              onConceptMapUpdate={(map, feas) => {
                setLiveConceptMap(map || {});
                setLiveFeasibilitySignal(feas ?? null);
              }}
            />
          </div>

          <div className="border-t border-white/10 bg-black/60">
            <div className="flex items-center gap-2 px-4 py-3">
              <Map className="w-4 h-4 text-green-300" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-white font-mono">
                Knowledge Graph
              </h3>
              <button
                type="button"
                onClick={() => {
                  setGraphMode('knowledge');
                  fetchKnowledgeGraphData();
                }}
                className="ml-auto px-3 py-1 text-[10px] uppercase border border-white/20 hover:bg-white/10"
              >
                Open
              </button>
            </div>
            <div className="px-4 pb-4 space-y-3 max-h-[34vh] overflow-y-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={kgQuery}
                  onChange={(e) => setKgQuery(e.target.value)}
                  placeholder="Search nodes..."
                  className="flex-1 bg-white/5 border border-white/20 px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
                />
                <button
                  type="button"
                  onClick={fetchKnowledgeGraphData}
                  className="px-3 py-2 text-xs border border-white/20 hover:bg-white/10"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleRebuildKnowledgeGraph}
                  disabled={knowledgeRebuilding}
                  className="px-3 py-2 text-xs border border-green-400/40 text-green-200 hover:bg-green-500/10 disabled:opacity-50"
                >
                  {knowledgeRebuilding ? 'Rebuilding...' : 'Rebuild Graph'}
                </button>
              </div>

              {knowledgeStats && (
                <div className="text-[11px] text-gray-300 border border-white/10 bg-white/5 px-3 py-2">
                  sessionsTotal: {knowledgeStats.sessionsTotal} | sessionsUsed: {knowledgeStats.sessionsUsed} | nodes: {knowledgeStats.nodes} | edges: {knowledgeStats.edges}
                </div>
              )}

              {knowledgeGraphError && (
                <div className="border border-red-400/40 bg-red-900/10 p-3">
                  <p className="text-xs text-red-300 mb-2">{knowledgeGraphError}</p>
                  <button
                    type="button"
                    onClick={fetchKnowledgeGraphData}
                    className="text-xs border border-red-300/50 px-2 py-1 hover:bg-red-400/10"
                  >
                    Retry
                  </button>
                </div>
              )}

              {graphMode === 'knowledge' && !knowledgeGraphLoading && knowledgeGraphData.nodes.length === 0 && (
                <div className="text-xs text-gray-400 border border-white/10 bg-white/5 p-3">
                  No graph yet. Start a conversation.
                </div>
              )}

              {kgSearchLoading && <div className="text-xs text-gray-400">Searching...</div>}

              {kgResults.length > 0 && (
                <div className="space-y-1">
                  {kgResults.map((r) => {
                    const nodeId = String(r.id);
                    const label = r.label || r.name || nodeId;
                    return (
                      <button
                        type="button"
                        key={nodeId}
                        onClick={() => {
                          setGraphMode('knowledge');
                          setFocusedKgNodeId(nodeId);
                          setSelectedKgNodeId(nodeId);
                          fetchNodeDetails(nodeId);
                        }}
                        className="w-full text-left px-3 py-2 border border-white/15 bg-white/5 hover:bg-white/10"
                      >
                        <div className="text-xs text-white">{label}</div>
                        <div className="text-[10px] text-gray-400">
                          {r.type || 'node'} | weight {r.weight ?? 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {(selectedKgNodeId || selectedKgNodeDetails || nodeDetailsLoading) && (
            <div className="absolute inset-y-0 right-0 w-[90%] sm:w-[82%] bg-black/95 border-l border-white/20 z-20 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/15">
                <div className="text-xs uppercase tracking-wider text-white font-mono">
                  Node Details
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKgNodeId(null);
                    setSelectedKgNodeDetails(null);
                  }}
                  className="p-1 border border-white/20 hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {nodeDetailsLoading && <div className="text-gray-400">Loading node details...</div>}
                {!nodeDetailsLoading && selectedKgNodeDetails && (
                  <>
                    <div className="border border-white/10 bg-white/5 p-3">
                      <div className="text-white font-bold">
                        {selectedKgNodeDetails.node.label || selectedKgNodeDetails.node.name || selectedKgNodeDetails.node.id}
                      </div>
                      <div className="text-gray-400 mt-1">
                        type: {selectedKgNodeDetails.node.type || 'node'} | weight: {selectedKgNodeDetails.node.weight ?? 1}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-300 uppercase tracking-wider mb-1">Neighbors</div>
                      <div className="space-y-1">
                        {(selectedKgNodeDetails.neighbors || []).map((n) => (
                          <button
                            type="button"
                            key={n.id}
                            onClick={() => {
                              setFocusedKgNodeId(String(n.id));
                              setSelectedKgNodeId(String(n.id));
                              fetchNodeDetails(String(n.id));
                            }}
                            className="w-full text-left border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
                          >
                            {n.label || n.name || n.id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-300 uppercase tracking-wider mb-1">Connecting Edges</div>
                      <div className="space-y-1">
                        {(selectedKgNodeDetails.edges || []).map((e, idx) => (
                          <div key={`${e.source}-${e.target}-${idx}`} className="border border-white/10 bg-white/5 px-2 py-1 text-gray-300">
                            {String(e.source)} {' -> '} {String(e.target)} ({e.type || e.label || 'relates_to'}, w={e.weight ?? 1})
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-300 uppercase tracking-wider mb-1">Related Sessions</div>
                      <div className="text-gray-400 break-all">
                        {(selectedKgNodeDetails.sessionIds || []).length > 0
                          ? (selectedKgNodeDetails.sessionIds || []).join(', ')
                          : 'None'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Concept Map - trigger button when data exists */}
          {(() => {
            const map =
              Object.keys(liveConceptMap).length > 0 ? liveConceptMap : conceptMap ?? {};
            return map && Object.keys(map).length > 0;
          })() && (
            <div className="border-t border-white/10 bg-black/50 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowConceptMapModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/20 backdrop-blur-sm text-white font-mono text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
              >
                <Map className="w-4 h-4 text-green-400" />
                View concept map
              </button>
            </div>
          )}

          {/* Concept Map popup modal */}
          {showConceptMapModal && (() => {
            const map =
              Object.keys(liveConceptMap).length > 0 ? liveConceptMap : conceptMap ?? {};
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="concept-map-title"
              >
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => setShowConceptMapModal(false)}
                  aria-hidden="true"
                />
                <div className="relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl flex flex-col">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
                    <h2 id="concept-map-title" className="font-bold text-sm uppercase tracking-wider text-white font-mono flex items-center gap-2">
                      <Map className="w-4 h-4 text-green-400" />
                      Concept map
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowConceptMapModal(false)}
                      className="p-2 rounded-lg border border-white/20 hover:bg-white/10 transition-colors text-white"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {Object.entries(map).map(([concept, terms]) => (
                      <div key={concept} className="border-l-2 border-white/30 pl-4 py-2">
                        <p className="text-xs font-bold text-white uppercase tracking-wider mb-2 font-mono">
                          {concept}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {terms.map((term, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 text-xs bg-white/10 text-white border border-white/20 font-mono rounded-lg"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Analytics/Metrics - Collapsible */}
          <div className="border-t border-white/10 bg-black/50">
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-white">
                  Analysis Buffer
                </h4>
              </div>
              <ChevronLeft
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  showAnalytics ? 'rotate-90' : ''
                }`}
              />
            </button>

            {showAnalytics && (
              <div className="px-6 pb-6 space-y-4 bg-gradient-to-b from-blue-950/20 to-transparent">
                {/* Coherence */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Coherence
                    </span>
                    <span className="text-sm font-bold text-purple-400">78%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden border border-white/20">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                      style={{ width: '78%' }}
                    />
                  </div>
                </div>

                {/* Feasibility */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Feasibility
                    </span>
                    <span className="text-sm font-bold text-white">
                      {(liveFeasibilitySignal ?? feasibilitySignal) !== null
                        ? Math.round((liveFeasibilitySignal ?? feasibilitySignal)! * 100)
                        : '-'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden border border-white/20">
                    <div
                      className="h-full bg-gradient-to-r from-white to-gray-300 rounded-full"
                      style={{
                        width:
                          liveFeasibilitySignal ?? feasibilitySignal
                            ? `${(liveFeasibilitySignal ?? feasibilitySignal)! * 100}%`
                            : '0%',
                      }}
                    />
                  </div>
                </div>

                {/* Node Count */}
                <div className="p-3 rounded-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/20">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Active Nodes
                    </span>
                    <span className="text-lg font-bold text-white">
                      {String((graphMode === 'knowledge' ? knowledgeGraphData.nodes.length : graphData.nodes.length)).padStart(3, '0')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function App() {
  return <ProtectedRoute><AppContent /></ProtectedRoute>;
}
