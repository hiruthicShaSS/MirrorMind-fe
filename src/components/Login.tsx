import { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

// Login page - email/password with existing hacker aesthetic
export const Login: React.FC = () => {
  const { login, loading, error: authError, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      await login(email, password);
    } catch (_) {
      // error set by AuthContext
    } finally {
      setBusy(false);
    }
  };

  const error = authError;
  const isLoading = loading || busy;

  return (
    <div className="relative w-full h-screen bg-black text-white font-mono overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-10 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none" />

      <div className="relative z-10 w-full h-full flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md px-6"
        >
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex justify-center mb-6"
            >
              <div className="w-16 h-16 bg-white text-black flex items-center justify-center rounded-none">
                <Brain className="w-10 h-10" />
              </div>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-5xl font-bold tracking-tighter mb-2"
            >
              MIRROR.MIND
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-gray-400 text-xs uppercase tracking-widest"
            >
              Cognitive Interface
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-8 border border-white/20 bg-black/40 backdrop-blur-md"
          >
            <p className="text-sm text-gray-400 mb-8 text-center leading-relaxed">
              Sign in to access your neural processing workspace.
            </p>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-6 p-3 bg-red-900/20 border border-red-500/50 text-red-300 text-xs rounded-none"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 py-3 px-4 rounded-none focus:outline-none focus:border-white/40"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 py-3 px-4 rounded-none focus:outline-none focus:border-white/40"
              />
              <motion.button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 px-4 rounded-none transition-all duration-200 hover:bg-gray-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
              >
                {isLoading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Log in</span>
                )}
              </motion.button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/10 text-center">
              <Link
                to="/register"
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Don’t have an account? Register
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 text-center text-xs text-gray-600 space-y-2"
          >
            <p>By signing in, you agree to our Terms of Service</p>
            <div className="flex justify-center gap-4">
              <a href="#" className="hover:text-gray-400 transition-colors">
                [ Privacy ]
              </a>
              <a href="#" className="hover:text-gray-400 transition-colors">
                [ Terms ]
              </a>
              <a href="#" className="hover:text-gray-400 transition-colors">
                [ Support ]
              </a>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="absolute inset-0 opacity-5">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>
  );
};
