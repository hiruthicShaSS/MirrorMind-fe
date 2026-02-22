import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import * as api from "../lib/api";

export type User = api.User;

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  register: (email: string, password: string, name?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  checkUserByEmail: (email: string) => Promise<{ exists: boolean; emailVerified?: boolean }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const register = async (email: string, password: string, name?: string) => {
    setError(null);
    try {
      await api.register(email, password, name);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Registration failed";
      setError(message);
      throw e;
    }
  };

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const u = await api.login(email, password);
      setUser(u);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Login failed";
      setError(message);
      throw e;
    }
  };

  const verifyEmail = async (email: string, code: string) => {
    setError(null);
    try {
      const u = await api.verifyEmail(email, code);
      setUser(u);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid code";
      setError(message);
      throw e;
    }
  };

  const resendVerification = async (email: string) => {
    setError(null);
    try {
      await api.resendVerification(email);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Resend failed";
      setError(message);
      throw e;
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setUser(null);
  };

  const checkUserByEmail = async (email: string) => {
    const data = await api.checkUserByEmail(email);
    return { exists: data.exists, emailVerified: data.emailVerified };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        error,
        register,
        login,
        verifyEmail,
        resendVerification,
        logout,
        checkUserByEmail,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
