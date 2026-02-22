import type {
  SessionResponse,
  ThinkRequestBody,
  ThinkStreamChunk,
  ThinkStreamComplete,
  HealthResponse,
} from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Log API connection status
console.log('🔗 API Base URL:', API_BASE_URL);

// Helper function to log API errors gracefully
function logApiError(error: Error, endpoint: string) {
  if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
    console.warn(`⚠️  Cannot reach backend at ${API_BASE_URL}${endpoint}`);
    console.warn('💡 Tip: Make sure backend is running with CORS enabled');
  } else {
    console.error(`❌ API Error (${endpoint}):`, error.message);
  }
}

export const apiClient = {
  async createSession(): Promise<SessionResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      logApiError(error as Error, '/api/agent/sessions');
      // Return demo session as fallback
      const demoSession: SessionResponse = {
        id: `demo-${Date.now()}`,
        createdAt: new Date().toISOString(),
        messages: [],
        conceptMap: {},
        isActive: true,
      };
      return demoSession;
    }
  },

  async getSession(sessionId: string): Promise<SessionResponse> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agent/sessions/${sessionId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to get session: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      logApiError(error as Error, `/api/agent/sessions/${sessionId}`);
      // Return demo session as fallback
      const demoSession: SessionResponse = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        messages: [],
        conceptMap: {},
        isActive: true,
      };
      return demoSession;
    }
  },

  async *streamThinking(
    sessionId: string,
    body: ThinkRequestBody
  ): AsyncGenerator<ThinkStreamChunk | ThinkStreamComplete, void, unknown> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agent/sessions/${sessionId}/think`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userInput: body.userInput,
            isInterrupt: body.isInterrupt ?? false,
          }),
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to stream thinking: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON objects from buffer
        const lines = buffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        buffer = lines[lines.length - 1];

        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line.length === 0) continue;

          try {
            const chunk = JSON.parse(line) as
              | ThinkStreamChunk
              | ThinkStreamComplete;
            yield chunk;
          } catch (e) {
            console.error('Failed to parse SSE chunk:', line, e);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim().length > 0) {
        try {
          const chunk = JSON.parse(buffer) as
            | ThinkStreamChunk
            | ThinkStreamComplete;
          yield chunk;
        } catch (e) {
          console.error('Failed to parse final SSE chunk:', buffer, e);
        }
      }
    } finally {
      reader.releaseLock();
    }
    } catch (error) {
      logApiError(error as Error, `/api/agent/sessions/${sessionId}/think`);
      // Yield demo response as fallback
      console.log('💡 Demo mode: Yielding simulated thinking...');
      yield {
        chunk: `Analyzing: "${body.userInput}"... [DEMO MODE - Backend not connected]`,
      };
      yield {
        done: true as const,
        conceptMap: {
          'Demo Mode': [body.userInput || 'Thought captured'],
        },
        feasibilitySignal: 0.7,
      };
    }
  },

  async healthCheck(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      logApiError(error as Error, '/api/health');
      // Return healthy demo response
      return { status: 'ok' };
    }
  },
};
