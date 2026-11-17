import React, { useState } from 'react';
import { Leaf, ShieldCheck, HeartPulse, Activity, ArrowRight, Lock, Mail, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DisclaimerBanner } from './DisclaimerBanner';

export const LandingPage: React.FC = () => {
  const { signInWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else if (mode === 'register') {
        if (!name.trim()) {
          throw new Error('Please enter your name');
        }
        if (!consent) {
          throw new Error('Please agree to the Privacy Policy and Terms of Service to create an account.');
        }
        await registerWithEmail(email, password, name);
      } else if (mode === 'reset') {
        await resetPassword(email);
        setSuccessMsg('Password reset link sent to your email!');
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || 'Authentication error';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        msg = 'Invalid email or password. Please try again.';
      } else if (msg.includes('auth/email-already-in-use')) {
        msg = 'An account already exists with this email.';
      } else if (msg.includes('auth/weak-password')) {
        msg = 'Password should be at least 6 characters.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error(err);
      if (!err.message?.includes('popup-closed-by-user')) {
        setErrorMsg('Google sign-in could not be completed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col justify-between">
      {/* Top Disclaimer */}
      <DisclaimerBanner />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">
        {/* Brand Hero */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-700 text-white flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-700/25">
            <Leaf className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-950 dark:text-emerald-50">
            NutriGuide
          </h1>
          <p className="text-sm font-medium text-emerald-800/80 dark:text-emerald-300 mt-1">
            Indian Dietary Guidance for Diabetes, High BP & CKD
          </p>
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-2 max-w-sm mx-auto leading-relaxed">
            Navigate rotis, dals, sabzis, and everyday Indian meals with condition-specific traffic light ratings and personal nutrient tracking.
          </p>
        </div>

        {/* Auth Box */}
        <div className="w-full bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-stone-800 shadow-xl shadow-stone-900/5">
          {/* Google Sign-in */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-100 font-medium text-sm transition-all shadow-sm active:scale-[0.99] disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative my-5 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200 dark:border-stone-800" />
            </div>
            <span className="relative px-3 bg-white dark:bg-stone-900 text-[11px] font-medium text-stone-500 uppercase tracking-wider">
              or with email
            </span>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Your Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:text-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:text-white"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                      className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* Required Consent Checkbox for Registration */}
            {mode === 'register' && (
              <div className="flex items-start gap-2 pt-1">
                <input
                  type="checkbox"
                  id="consentCheckbox"
                  required
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer shrink-0"
                />
                <label
                  htmlFor="consentCheckbox"
                  className="text-xs text-stone-600 dark:text-stone-400 leading-snug cursor-pointer"
                >
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowPrivacy(true)}
                    className="text-emerald-700 dark:text-emerald-400 font-semibold underline underline-offset-2"
                  >
                    Privacy Policy
                  </button>{' '}
                  and{' '}
                  <button
                    type="button"
                    onClick={() => setShowTerms(true)}
                    className="text-emerald-700 dark:text-emerald-400 font-semibold underline underline-offset-2"
                  >
                    Terms of Service
                  </button>
                  .
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm transition-all shadow-md shadow-emerald-800/20 active:scale-[0.99] disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : mode === 'register' ? (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <span>Send Reset Link</span>
              )}
            </button>
          </form>

          {/* Toggle modes */}
          <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800 text-center text-xs text-stone-600 dark:text-stone-400">
            {mode === 'login' ? (
              <p>
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                    setSuccessMsg('');
                    setConsent(false);
                  }}
                  className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Sign up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Pillars / Trust bullets */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full text-center">
          <div className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <HeartPulse className="w-5 h-5 mx-auto text-emerald-700 dark:text-emerald-400 mb-1" />
            <p className="text-[11px] font-bold text-stone-800 dark:text-stone-200">Conditions</p>
            <p className="text-[10px] text-stone-500">Diabetes, BP & CKD</p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <Activity className="w-5 h-5 mx-auto text-emerald-700 dark:text-emerald-400 mb-1" />
            <p className="text-[11px] font-bold text-stone-800 dark:text-stone-200">Indian Foods</p>
            <p className="text-[10px] text-stone-500">Rich staples guide</p>
          </div>
          <div className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
            <ShieldCheck className="w-5 h-5 mx-auto text-emerald-700 dark:text-emerald-400 mb-1" />
            <p className="text-[11px] font-bold text-stone-800 dark:text-stone-200">100% Private</p>
            <p className="text-[10px] text-stone-500">Zero fake user data</p>
          </div>
        </div>
      </div>

      {/* Persistent Footer Disclaimer */}
      <footer className="py-4 text-center text-xs text-stone-400 dark:text-stone-500 border-t border-stone-200 dark:border-stone-800">
        <p className="px-4">NutriGuide · General guidance, not a substitute for your care team</p>
      </footer>

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Privacy Policy
              </h3>
              <button
                onClick={() => setShowPrivacy(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed space-y-2">
              <p>
                We store your health conditions, diet type, and meal plans only to personalize guidance; you can delete them anytime; we don't sell data.
              </p>
            </div>
            <button
              onClick={() => setShowPrivacy(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Terms of Service Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Terms of Service
              </h3>
              <button
                onClick={() => setShowTerms(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed space-y-2">
              <p>
                General guidance only, not medical advice.
              </p>
            </div>
            <button
              onClick={() => setShowTerms(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
            >
              I Understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
