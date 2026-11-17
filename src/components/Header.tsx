import React from 'react';
import { Leaf, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DisclaimerBanner } from './DisclaimerBanner';

interface HeaderProps {
  onOpenProfile?: () => void;
  onOpenAdmin?: () => void;
  activeTab?: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenProfile, onOpenAdmin, activeTab }) => {
  const { user, profile, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-stone-900 border-b-2 border-stone-200 dark:border-stone-800 transition-colors">
      <DisclaimerBanner />
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-800 dark:bg-emerald-600 flex items-center justify-center text-white shadow-sm">
            <Leaf className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-stone-950 dark:text-white leading-tight">
              NutriGuide
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className={`h-11 min-h-[44px] px-3.5 text-sm font-bold rounded-xl border-2 transition-colors ${
                activeTab === 'admin'
                  ? 'bg-emerald-900 text-white border-emerald-900'
                  : 'bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-700'
              }`}
            >
              Admin
            </button>
          )}

          {user && profile && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2 px-3.5 h-11 min-h-[44px] rounded-full bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-950 dark:text-white border-2 border-stone-300 dark:border-stone-700 transition-colors text-sm font-bold"
              aria-label="User profile"
            >
              <UserIcon className="w-4 h-4 text-emerald-800 dark:text-emerald-300 shrink-0" />
              <span className="max-w-[120px] truncate hidden sm:inline">
                {profile.displayName || user.email?.split('@')[0]}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
