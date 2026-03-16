import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Brain, X } from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { auth, googleProvider } from '../firebase/config';
import { AnimatedBackground } from './AnimatedBackground';

type LoginProps = {
  onClose?: () => void;
};

export const Login: React.FC<LoginProps> = ({ onClose }) => {
  const { loginWithGoogle, loading, error: authError, clearError } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleGoogleLogin = async () => {
    clearError();
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      await loginWithGoogle(idToken);
    } finally {
      setBusy(false);
    }
  };

  const isLoading = loading || busy;
  const error = authError;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#050505] text-white flex items-center justify-center p-6">
      <AnimatedBackground />
      {/* animated background accents */}
      <motion.div
        className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-gradient-to-br from-white/10 via-white/6 to-transparent blur-3xl"
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute -bottom-24 -right-10 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-white/12 via-white/6 to-transparent blur-3xl"
        animate={{ rotate: -360 }}
        transition={{ duration: 55, repeat: Infinity, ease: 'linear' }}
      />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.55)_70%,_rgba(0,0,0,0.9)_100%)] pointer-events-none" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-screen bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-30 rounded-full border border-white/20 bg-black/60 px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-white hover:bg-white/10 transition-colors"
        >
        <div className="flex items-center gap-1">
          <X className="w-4 h-4" />
          Close
        </div>
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-gradient-to-b from-[#0b0b0b]/90 to-[#050505]/90 backdrop-blur-xl border border-gray-800/60 rounded-2xl shadow-[0_10px_60px_rgba(0,0,0,0.6)] p-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180 }}
            className="flex flex-col items-center mb-8"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 blur-2xl bg-gradient-to-r from-gray-400 to-gray-600 opacity-20 rounded-full"
              />
              <Brain className="w-16 h-16 text-gray-200 relative z-10" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-light text-gray-100 mt-4 tracking-wide">Mirror Mind</h1>
            <p className="text-gray-400 text-sm mt-2 font-light">Reflect your consciousness</p>
          </motion.div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {error}
            </div>
          )}

          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium tracking-wide transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3 py-4 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed border border-gray-300/60"
            whileHover={{ scale: isLoading ? 1 : 1.01 }}
            whileTap={{ scale: isLoading ? 1 : 0.99 }}
          >
            <svg className="w-5 h-5 text-gray-900" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 2a10 10 0 1 0 9.49 6.84H12v4.32h5.56A5.5 5.5 0 1 1 12 6.5a5.45 5.45 0 0 1 3.88 1.53l2.89-2.89A9.97 9.97 0 0 0 12 2Z" />
            </svg>
            <span className="relative z-10">{isLoading ? 'Signing in...' : 'Continue with Google'}</span>
            <motion.span
              className="relative z-10"
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ArrowRight className="w-5 h-5" />
            </motion.span>
          </motion.button>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-8 flex items-center gap-4"
          >
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-gray-500 text-xs mt-6 font-light"
        >
          Every thought matters. Every mind connects.
        </motion.p>
      </motion.div>
    </div>
  );
};
