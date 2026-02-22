import { useState } from 'react';
import { motion } from 'framer-motion';
import { Brain, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function Register() {
  const { register, verifyEmail, resendVerification, error, clearError } = useAuth();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      await register(email, password, name);
      setStep('verify');
    } catch (_) {}
    setBusy(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      await verifyEmail(email, code);
    } catch (_) {}
    setBusy(false);
  };

  const handleResend = async () => {
    clearError();
    setResendMessage('');
    try {
      await resendVerification(email);
      setResendMessage('Code sent. Check your email.');
    } catch (_) {}
  };

  const layout = (
    <div className="relative w-full min-h-screen bg-black text-white font-mono overflow-hidden">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-10 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="relative z-10 w-full min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-white text-black flex items-center justify-center rounded-none">
                <Brain className="w-8 h-8" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tighter">MIRROR.MIND</h1>
            <p className="text-gray-400 text-xs uppercase tracking-widest mt-1">Cognitive Interface</p>
          </div>

          <div className="p-8 border border-white/20 bg-black/40 backdrop-blur-md">
            {step === 'verify' ? (
              <>
                <h2 className="text-lg font-semibold mb-2">Verify your email</h2>
                <p className="text-sm text-gray-400 mb-6">
                  We sent a 6-digit code to <strong className="text-white">{email}</strong>
                </p>
                {error && (
                  <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 text-red-300 text-xs rounded-none">
                    {error}
                  </div>
                )}
                {resendMessage && (
                  <div className="mb-4 p-3 bg-green-900/20 border border-green-500/50 text-green-300 text-xs rounded-none">
                    {resendMessage}
                  </div>
                )}
                <form onSubmit={handleVerify} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    autoComplete="one-time-code"
                    className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 py-3 px-4 rounded-none focus:outline-none focus:border-white/40"
                  />
                  <button
                    type="submit"
                    disabled={busy || code.length !== 6}
                    className="w-full bg-white text-black font-semibold py-3 px-4 rounded-none hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
                  >
                    {busy ? 'Verifying...' : 'Verify'}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={busy}
                  className="mt-4 w-full text-sm text-gray-400 hover:text-white disabled:opacity-50"
                >
                  Resend code
                </button>
                <p className="mt-6 text-center">
                  <Link to="/login" className="text-xs text-gray-400 hover:text-white">
                    Back to login
                  </Link>
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-6">Register</h2>
                {error && (
                  <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 text-red-300 text-xs rounded-none">
                    {error}
                  </div>
                )}
                <form onSubmit={handleRegister} className="space-y-4">
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 py-3 px-4 rounded-none focus:outline-none focus:border-white/40"
                  />
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 py-3 px-4 rounded-none focus:outline-none focus:border-white/40"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                    className="w-full bg-white/5 border border-white/20 text-white placeholder-gray-500 py-3 px-4 rounded-none focus:outline-none focus:border-white/40"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 px-4 rounded-none hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-white/20"
                  >
                    {busy ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Register'
                    )}
                  </button>
                </form>
                <p className="mt-6 text-center">
                  <Link to="/login" className="text-xs text-gray-400 hover:text-white">
                    Already have an account? Log in
                  </Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );

  return layout;
}
