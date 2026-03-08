export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/**
 * WebSocket URL for Live agent (ws or wss from http/https).
 * REST uses credentials: 'include'. If UI (e.g. :5173) and API (:5000) differ, the browser
 * may not send cookies to the WS; use a dev proxy (same origin) or run UI from API origin to test.
 */
export function getLiveWebSocketUrl(): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}/api/agent/live`;
}

const defaultOptions: RequestInit = {
  credentials: "include",
  headers: { "Content-Type": "application/json" },
};

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers } as HeadersInit,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message || (data as { error?: string }).error || "Request failed"
    );
  }
  return data as T;
}

// --- Auth (email/password + session cookie) ---
export type User = { id: string; email: string; name: string; picture?: string };

export async function register(email: string, password: string, name?: string) {
  return api<{ message: string; email: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: name || "" }),
  });
}

export async function login(email: string, password: string) {
  return api<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyEmail(email: string, code: string) {
  return api<User>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function resendVerification(email: string) {
  return api<{ message: string }>("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function checkUserByEmail(email: string) {
  return api<{ exists: boolean; emailVerified?: boolean; name?: string }>(
    `/api/auth/verify?email=${encodeURIComponent(email)}`
  );
}

export async function getMe() {
  return api<User>("/api/auth/me");
}

export async function logout() {
  return api<{ success: boolean }>("/api/auth/logout", { method: "POST" });
}

// --- Agent sessions ---
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
export type SessionResponse = {
  id: string;
  createdAt: string;
  messages: Message[];
  conceptMap: Record<string, string[]>;
  isActive: boolean;
};

export async function createSession() {
  return api<SessionResponse>("/api/agent/sessions", { method: "POST" });
}

export async function getSession(sessionId: string) {
  return api<SessionResponse>(`/api/agent/sessions/${sessionId}`);
}

export async function closeSession(sessionId: string) {
  return api<{ success: boolean }>(`/api/agent/sessions/${sessionId}/close`, {
    method: "POST",
  });
}

// Get all user sessions (with concept maps)
export async function getAllSessions(limit = 50) {
  return api<SessionResponse[]>(`/api/agent/sessions?limit=${limit}`);
}

// Get concept map history (summary)
export type ConceptMapSummary = {
  sessionId: string;
  conceptMap: Record<string, string[]>;
  feasibilitySignal: number | null;
  createdAt: string;
  updatedAt?: string;
  isActive: boolean;
  messageCount: number;
  preview: string;
};

export async function getConceptMapHistory(limit = 50) {
  return api<ConceptMapSummary[]>(`/api/agent/concept-maps?limit=${limit}`);
}

// Update concept map for a session
export async function updateConceptMap(
  sessionId: string,
  conceptMap: Record<string, string[]>
) {
  return api<{ success: boolean; conceptMap: Record<string, string[]> }>(
    `/api/agent/sessions/${sessionId}/concept-map`,
    {
      method: "PUT",
      body: JSON.stringify({ conceptMap }),
    }
  );
}

// Sync session to Notion (ideas, concept map, feasibility)
export async function syncSessionToNotion(sessionId: string) {
  return api<{ success: boolean; notionPageId?: string }>(
    `/api/agent/sessions/${sessionId}/sync-notion`,
    { method: "POST" }
  );
}

// --- Knowledge graph ---
export type KnowledgeGraphNode = {
  id: string;
  label?: string;
  name?: string;
  type?: string;
  weight?: number;
  sessionIds?: string[];
};

export type KnowledgeGraphEdge = {
  id?: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  weight?: number;
};

export type KnowledgeGraphResponse = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

export type KnowledgeGraphRebuildStats = {
  sessionsTotal: number;
  sessionsUsed: number;
  nodes: number;
  edges: number;
};

export type KnowledgeGraphSearchResult = {
  id: string;
  label?: string;
  name?: string;
  type?: string;
  weight?: number;
};

export type KnowledgeGraphNodeDetails = {
  node: KnowledgeGraphNode;
  neighbors: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  sessionIds: string[];
};

export async function getKnowledgeGraph(limitNodes = 300, limitEdges = 600) {
  return api<KnowledgeGraphResponse>(
    `/api/agent/knowledge-graph?limitNodes=${limitNodes}&limitEdges=${limitEdges}`
  );
}

export async function rebuildKnowledgeGraph() {
  return api<KnowledgeGraphRebuildStats>(`/api/agent/knowledge-graph/rebuild`, {
    method: "POST",
  });
}

export async function searchKnowledgeGraph(q: string, limit = 20) {
  return api<KnowledgeGraphSearchResult[]>(
    `/api/agent/knowledge-graph/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export async function getKnowledgeGraphNodeDetails(nodeId: string) {
  return api<KnowledgeGraphNodeDetails>(
    `/api/agent/knowledge-graph/node/${encodeURIComponent(nodeId)}`
  );
}

export async function thinkStream(
  sessionId: string,
  userInput: string,
  onChunk: (text: string) => void,
  onDone: (data: {
    conceptMap: Record<string, string[]>;
    feasibilitySignal?: number;
  }) => void,
  isInterrupt?: boolean
) {
  const res = await fetch(`${API_BASE}/api/agent/sessions/${sessionId}/think`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userInput, isInterrupt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Think request failed: ${res.statusText}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const dec = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as {
          chunk?: string;
          done?: boolean;
          conceptMap?: Record<string, string[]>;
          feasibilitySignal?: number;
        };
        if (obj.chunk) onChunk(obj.chunk);
        if (obj.done)
          onDone({
            conceptMap: obj.conceptMap || {},
            feasibilitySignal: obj.feasibilitySignal,
          });
      } catch (e) {
        console.warn("Failed to parse line:", line, e);
      }
    }
  }
  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer) as {
        chunk?: string;
        done?: boolean;
        conceptMap?: Record<string, string[]>;
        feasibilitySignal?: number;
      };
      if (obj.chunk) onChunk(obj.chunk);
      if (obj.done)
        onDone({
          conceptMap: obj.conceptMap || {},
          feasibilitySignal: obj.feasibilitySignal,
        });
    } catch (e) {
      console.warn("Failed to parse buffer:", buffer, e);
    }
  }
}
