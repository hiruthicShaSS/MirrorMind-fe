import { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Loader } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { auth, googleProvider } from '../firebase/config';

// Google-only login page
export const Login: React.FC = () => {
  const { loginWithGoogle, loading, error: authError, clearError } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleGoogleLogin = async () => {
    clearError();
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      await loginWithGoogle(idToken);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User dismissed popup; keep page unchanged.
      } else if (e instanceof Error) {
        console.error('Google login error:', e.message);
      }
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
              Sign in with Google to access your workspace.
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

            <motion.button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 px-4 rounded-none transition-all duration-200 hover:bg-gray-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
            >
              {isLoading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Signing in with Google...</span>
                </>
              ) : (
                <span>Continue with Google</span>
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};
