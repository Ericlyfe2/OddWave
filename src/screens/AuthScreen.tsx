import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Mail, Lock, Phone, User, Eye, EyeOff, Loader2, AlertCircle, KeyRound, Info } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { DEMO_MODE } from '@/lib/config';
import { useDocumentMeta } from '@/lib/seo';

export function AuthScreen() {
  const { signIn, signUp, requestPasswordReset, resetPassword } = useAuth();
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(params.get('mode') === 'signup' ? 'signup' : 'login');
  useDocumentMeta(mode === 'signup' ? 'Sign Up' : 'Log In', mode === 'signup' ? 'Create your free OddWave account and claim your welcome bonus.' : 'Log in to OddWave to place bets and manage your account.');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showResetCodeHint, setShowResetCodeHint] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'login') {
      if (!email || !password) return setError('Please enter your email and password');
      setLoading(true);
      const { error: err } = await signIn(email, password);
      setLoading(false);
      if (err) return setError(err);
      toast('success', 'Welcome back!');
      navigate('/');
    } else if (mode === 'signup') {
      setLoading(true);
      const { error: err } = await signUp(email, password, phone, fullName);
      setLoading(false);
      if (err) return setError(err);
      toast('success', 'Account created — welcome to OddWave!');
      navigate('/welcome');
    } else {
      if (!showResetCodeHint) {
        setLoading(true);
        const res = await requestPasswordReset(email);
        setLoading(false);
        if (!res.ok || !res.resetCode) return setError(res.error ?? 'Could not start reset');
        setShowResetCodeHint(res.resetCode);
        return;
      }
      setLoading(true);
      const { error: err } = await resetPassword(email, resetCode, newPassword);
      setLoading(false);
      if (err) return setError(err);
      toast('success', 'Password updated — sign in now');
      setMode('login');
    }
  };

  const quickFill = (e: string, p: string) => {
    setMode('login');
    setEmail(e);
    setPassword(p);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-ink-900 flex flex-col">
      <div className="bg-gradient-to-b from-primary-700 to-primary-800 pt-12 pb-8 px-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-white/15 ring-1 ring-white/30 rounded-2xl flex items-center justify-center mb-3 shadow-lg">
          <svg width="40" height="40" viewBox="0 0 128 128" aria-hidden>
            <path d="M16 84 C34 52 48 52 64 76 C80 100 94 100 112 66" fill="none" stroke="#ffffff" strokeWidth="12" strokeLinecap="round" />
            <path d="M16 56 C34 24 48 24 64 48 C80 72 94 72 112 38" fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" opacity="0.55" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">OddWave</h1>
        <p className="text-primary-100 text-sm mt-1">Ride the odds. Cash out the moment.</p>
      </div>

      <div className="flex-1 px-6 pt-6 pb-10 max-w-md w-full mx-auto">
        <div className="flex bg-ink-600 rounded-xl p-1 mb-6">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
                setShowResetCodeHint(null);
              }}
              className={clsx('flex-1 py-2.5 rounded-lg text-sm font-bold transition-all', mode === m ? 'bg-primary-500 text-white shadow-card' : 'text-ink-200')}
            >
              {m === 'login' ? 'Login' : 'Sign Up'}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-error-500/15 border border-error-500/30 text-error-500 rounded-lg px-3 py-2.5 mb-4 text-sm animate-shake" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              <InputField icon={<User className="w-5 h-5" />} type="text" placeholder="Full Name" value={fullName} onChange={setFullName} autoComplete="name" />
              <InputField icon={<Phone className="w-5 h-5" />} type="tel" placeholder="Phone Number (e.g. 0241234567)" value={phone} onChange={setPhone} autoComplete="tel" />
            </>
          )}
          {mode !== 'forgot' && (
            <InputField icon={<Mail className="w-5 h-5" />} type="email" placeholder="Email Address" value={email} onChange={setEmail} autoComplete="email" />
          )}
          {mode === 'forgot' && !showResetCodeHint && (
            <InputField icon={<Mail className="w-5 h-5" />} type="email" placeholder="Your account email" value={email} onChange={setEmail} autoComplete="email" />
          )}
          {mode === 'forgot' && showResetCodeHint && (
            <>
              <div className="flex items-start gap-2 bg-secondary-500/15 border border-secondary-500/40 rounded-lg px-3 py-2.5 text-xs text-secondary-200">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-secondary-400" />
                <span>Demo mode: no email service is configured. Your reset code is <b className="font-mono">{showResetCodeHint}</b> — enter it below.</span>
              </div>
              <InputField icon={<KeyRound className="w-5 h-5" />} type="text" placeholder="Reset code" value={resetCode} onChange={setResetCode} />
              <div className="relative">
                <InputField icon={<Lock className="w-5 h-5" />} type={showPassword ? 'text' : 'password'} placeholder="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-ink-300" aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </>
          )}
          {(mode === 'login' || mode === 'signup') && (
            <div className="relative">
              <InputField icon={<Lock className="w-5 h-5" />} type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-ink-300" aria-label="Toggle password visibility">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-500 hover:bg-primary-600 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : mode === 'login' ? (
              'Login'
            ) : mode === 'signup' ? (
              'Create Account'
            ) : showResetCodeHint ? (
              'Set New Password'
            ) : (
              'Send Reset Code'
            )}
          </button>

          {mode === 'login' && (
            <button type="button" onClick={() => { setMode('forgot'); setError(null); }} className="w-full text-center text-xs font-semibold text-primary-600">
              Forgot password?
            </button>
          )}
        </form>

        {mode === 'signup' && (
          <p className="text-center text-xs text-ink-200 mt-4">
            New accounts get a <span className="text-secondary-400 font-bold">25 GH₵</span> bonus stake on your first bet.
          </p>
        )}

        {DEMO_MODE && mode === 'login' && (
          <div className="mt-6 rounded-xl border border-dashed border-ink-400/50 p-3">
            <p className="text-[11px] font-bold text-ink-200 uppercase tracking-wide mb-2">Demo accounts — tap to fill</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => quickFill('fan@oddwave.demo', 'Fan12345')} className="bg-ink-600 hover:bg-ink-500 rounded-lg px-3 py-1.5 text-[11px] font-bold text-ink-100 transition-colors">
                Player · fan@oddwave.demo
              </button>
              <button onClick={() => quickFill('admin@oddwave.demo', 'Admin123!')} className="bg-ink-600 hover:bg-ink-500 rounded-lg px-3 py-1.5 text-[11px] font-bold text-secondary-300 transition-colors">
                Admin · admin@oddwave.demo
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-ink-300 mt-6">
          By continuing you confirm you are 18+. Play responsibly.{' '}
          <Link to="/responsible-gaming" className="underline underline-offset-2">Learn more</Link>
        </p>
      </div>
    </div>
  );
}

function InputField({
  icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-ink-600 border border-ink-400/50 rounded-xl px-4 py-3 focus-within:border-primary-500 transition-colors">
      <span className="text-ink-300">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="flex-1 bg-transparent text-ink-50 placeholder-ink-300 text-sm outline-none"
      />
    </div>
  );
}
