// API Types and Interfaces

export interface ConceptMap {
  [key: string]: string[];
}

export interface SessionResponse {
  id: string;
  createdAt: string;
  messages: Message[];
  conceptMap: ConceptMap;
  isActive: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ThinkRequestBody {
  userInput: string;
  isInterrupt?: boolean;
}

export interface ThinkStreamChunk {
  chunk: string;
}

export interface ThinkStreamComplete {
  done: true;
  conceptMap: ConceptMap;
  feasibilitySignal: number;
}

export interface HealthResponse {
  status: 'ok' | 'error';
}

// Graph and AI Types

export interface Node {
  id: string;
  label: string;
  type: 'root' | 'concept' | 'action' | 'question';
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface Edge {
  source: string | Node;
  target: string | Node;
  label?: string;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

export interface LogMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];
