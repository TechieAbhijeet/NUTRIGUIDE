import React, { useState } from 'react';
import { Mail, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const EmailVerificationBanner: React.FC = () => {
  const { user, emailVerified, resendVerificationEmail, refreshVerificationStatus } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<string>('');
  const [feedbackError, setFeedbackError] = useState<string>('');

  if (!user || emailVerified) {
    return null;
  }

  const handleResend = async () => {
    setResending(true);
    setFeedback('');
    setFeedbackError('');
    try {
      await resendVerificationEmail();
      setFeedback('Verification email sent. Check your inbox.');
    } catch (err: any) {
      if (err?.code === 'auth/too-many-requests') {
        setFeedbackError('Please wait a moment before requesting another email.');
      } else {
        setFeedbackError('Could not send verification email. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    setFeedback('');
    setFeedbackError('');
    try {
      const verified = await refreshVerificationStatus();
      if (!verified) {
        setFeedbackError('Not verified yet. Open the link in your email, then tap "I\'ve verified".');
      }
    } catch {
      setFeedbackError('Could not refresh verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 dark:bg-amber-950/60 border-b-2 border-amber-300 dark:border-amber-800 px-4 py-2.5 transition-colors"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 text-amber-950 dark:text-amber-100">
          <Mail className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
          <div className="text-sm leading-snug">
            <span className="font-bold">Verify your email</span>
            {user.email ? (
              <span className="text-amber-900 dark:text-amber-200">
                {' '}
                — check <span className="font-semibold">{user.email}</span> for your verification link.
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || checking}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border-2 border-amber-400 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-950 dark:text-amber-100 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
            <span>{resending ? 'Sending...' : 'Resend'}</span>
          </button>

          <button
            type="button"
            onClick={handleCheckVerified}
            disabled={resending || checking}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{checking ? 'Checking...' : "I've verified"}</span>
          </button>
        </div>
      </div>

      {(feedback || feedbackError) && (
        <div className="max-w-4xl mx-auto mt-1.5 flex items-center gap-1.5 text-xs font-semibold">
          {feedback ? (
            <span className="text-emerald-900 dark:text-emerald-300 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{feedback}</span>
            </span>
          ) : (
            <span className="text-red-800 dark:text-red-300 inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{feedbackError}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
