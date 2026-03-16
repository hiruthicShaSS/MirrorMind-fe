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
  loginWithGoogle: (idToken: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  checkUserByEmail: (email: string) => Promise<{ exists: boolean; emailVerified?: boolean }>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const ENCODED_USER_ID_KEY = "encodedUserId";
const USER_CACHE_KEY = "mm_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // hydrate from localStorage immediately to avoid forced sign-in on refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = window.localStorage.getItem(USER_CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as User;
        setUser(parsed);
      } catch {
        window.localStorage.removeItem(USER_CACHE_KEY);
      }
    }
  }, []);

  const persistEncodedUserId = useCallback((u: User | null) => {
    if (typeof window === "undefined") return;
    const encoded = (u?.encodedUserId || "").trim();
    if (encoded) {
      window.localStorage.setItem(ENCODED_USER_ID_KEY, encoded);
      window.sessionStorage.setItem(ENCODED_USER_ID_KEY, encoded);
    } else {
      window.localStorage.removeItem(ENCODED_USER_ID_KEY);
      window.sessionStorage.removeItem(ENCODED_USER_ID_KEY);
    }
  }, []);

  const persistUser = useCallback((u: User | null) => {
    if (typeof window === "undefined") return;
    if (u) {
      window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    } else {
      window.localStorage.removeItem(USER_CACHE_KEY);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const u = await api.getMe();
      setUser(u);
      persistEncodedUserId(u);
      persistUser(u);
    } catch {
      // If backend is unreachable, keep any cached user to avoid forcing re-login.
      const cached =
        typeof window !== "undefined"
          ? window.localStorage.getItem(USER_CACHE_KEY)
          : null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as User;
          setUser(parsed);
        } catch {
          setUser(null);
          persistUser(null);
        }
      } else {
        setUser(null);
      }
      persistEncodedUserId(null);
    } finally {
      setLoading(false);
    }
  }, [persistEncodedUserId, persistUser]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const register = async (email: string, password: string, name?: string) => {
    setError(null);
    try {
      await api.register(email, password, name);
      // registration may require verification; keep user as null
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
      persistEncodedUserId(u);
      persistUser(u);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Login failed";
      setError(message);
      throw e;
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    setError(null);
    try {
      const u = await api.loginWithGoogle(idToken);
      setUser(u);
      persistEncodedUserId(u);
      persistUser(u);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Google login failed";
      setError(message);
      throw e;
    }
  };

  const verifyEmail = async (email: string, code: string) => {
    setError(null);
    try {
      const u = await api.verifyEmail(email, code);
      setUser(u);
      persistEncodedUserId(u);
      persistUser(u);
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
    persistEncodedUserId(null);
    persistUser(null);
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
        loginWithGoogle,
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
