/** Client → Server */
export type LiveClientMessage =
  | { type: "init"; sessionId: string }
  | { type: "text"; payload: string }
  | { type: "audio"; payload: string; mimeType?: string };

/** Server → Client (payload = our API; data = Gemini ADK style) */
export type LiveServerMessage =
  | { type: "ready" }
  | { type: "text"; payload?: string; data?: string }
  | { type: "audio"; payload?: string; data?: string; mimeType?: string }
  | { type: "interrupted" }
  | { type: "done"; fullText?: string; conceptMap: Record<string, string[]>; feasibilitySignal?: number }
  | { type: "error"; message: string };
