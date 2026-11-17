import React, { useEffect, useState } from 'react';
import {
  HelpCircle,
  Utensils,
  CalendarDays,
  ChefHat,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { getTodayLocalDate } from '../lib/dateUtils';
import { useAuth } from '../context/AuthContext';
import { FoodItem, RatingRule, DailyPlan, TabType } from '../types';

interface HomeViewProps {
  foods: FoodItem[];
  ratingRules: RatingRule[];
  dailyPlan: DailyPlan | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectFood: (food: FoodItem) => void;
  onNavigateTab: (tab: TabType) => void;
  onSearchQuery: (query: string) => void;
}

const formatAmount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const HomeView: React.FC<HomeViewProps> = ({
  dailyPlan,
  loading = false,
  error = null,
  onRetry,
  onNavigateTab,
  onSearchQuery,
}) => {
  const { user, profile } = useAuth();
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [todayPlanOverride, setTodayPlanOverride] = useState<DailyPlan | null>(null);

  const todayDate = getTodayLocalDate();
  const effectiveTodayPlan =
    dailyPlan && dailyPlan.date === todayDate ? dailyPlan : todayPlanOverride;

  useEffect(() => {
    if (!user || (dailyPlan && dailyPlan.date === todayDate)) {
      setTodayPlanOverride(null);
      return;
    }

    const path = `users/${user.uid}/plans/${todayDate}`;
    const unsubscribe = onSnapshot(
      doc(db, `users/${user.uid}/plans`, todayDate),
      snapshot => {
        if (snapshot.exists()) {
          setTodayPlanOverride({ id: snapshot.id, ...(snapshot.data() as Omit<DailyPlan, 'id'>) });
        } else {
          setTodayPlanOverride(null);
        }
      },
      err => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => unsubscribe();
  }, [user, dailyPlan, todayDate]);

  useEffect(() => {
    if (!user) {
      setRecentSearches([]);
      return;
    }

    const path = `users/${user.uid}/searches`;
    const unsubscribe = onSnapshot(
      collection(db, path),
      snapshot => {
        const docs: { query: string; ts: string }[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as { query?: unknown; createdAt?: unknown; searchedAt?: unknown };
          const q = typeof data.query === 'string' ? data.query.trim() : '';
          if (!q) return;
          const ts =
            typeof data.createdAt === 'string'
              ? data.createdAt
              : typeof data.searchedAt === 'string'
              ? data.searchedAt
              : '';
          docs.push({ query: q, ts });
        });

        docs.sort((a, b) => b.ts.localeCompare(a.ts));

        const seen = new Set<string>();
        const unique: string[] = [];
        for (const item of docs) {
          const key = item.query.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(item.query);
          }
          if (unique.length >= 8) break;
        }
        setRecentSearches(unique);
      },
      err => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const targets = profile?.targets || {
    carbs: 180,
    protein: 60,
    sodium: 2000,
    potassium: 2500,
    fiber: 30,
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const firstName = profile?.displayName?.split(' ')[0] || 'Friend';

  const allPlannedItems = effectiveTodayPlan
    ? [
        ...(effectiveTodayPlan.breakfast || []),
        ...(effectiveTodayPlan.lunch || []),
        ...(effectiveTodayPlan.dinner || []),
        ...(effectiveTodayPlan.snacks || []),
      ]
    : [];

  const consumedCarbs = allPlannedItems.reduce((acc, it) => acc + (it.carbs || 0), 0);
  const consumedProtein = allPlannedItems.reduce((acc, it) => acc + (it.protein || 0), 0);
  const consumedSodium = allPlannedItems.reduce((acc, it) => acc + (it.sodium || 0), 0);
  const consumedPotassium = allPlannedItems.reduce((acc, it) => acc + (it.potassium || 0), 0);
  const totalCalories = allPlannedItems.reduce((acc, it) => acc + (it.kcal || 0), 0);

  const nutrientCards = [
    {
      label: 'Carbohydrates',
      consumed: consumedCarbs,
      target: targets.carbs,
      unit: 'g',
    },
    {
      label: 'Protein',
      consumed: consumedProtein,
      target: targets.protein,
      unit: 'g',
    },
    {
      label: 'Sodium',
      consumed: consumedSodium,
      target: targets.sodium,
      unit: 'mg',
    },
    {
      label: 'Potassium',
      consumed: consumedPotassium,
      target: targets.potassium,
      unit: 'mg',
    },
  ];

  if (loading) {
    return (
      <div className="pb-24 max-w-2xl mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-stone-800 dark:text-stone-200 font-semibold">
          Loading...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-24 max-w-2xl mx-auto px-4 pt-8">
        <div className="p-5 rounded-3xl bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-800 text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-red-950 dark:text-red-100">
              Could not load your information
            </h3>
            <p className="text-sm text-red-900 dark:text-red-200 mt-1">{error}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-red-700 hover:bg-red-800 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try again</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const actions: {
    id: TabType;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'check', label: 'Can I eat this?', subtitle: 'Check suitability', icon: HelpCircle },
    { id: 'foods', label: 'What can I eat?', subtitle: 'Browse safe foods', icon: Utensils },
    { id: 'plan', label: 'Diet Chart', subtitle: 'Meal schedule', icon: CalendarDays },
    { id: 'meal', label: 'Build a Meal', subtitle: 'Combine thali items', icon: ChefHat },
  ];

  return (
    <div className="pb-24 max-w-2xl mx-auto px-4 pt-4 space-y-5">
      {/* Greeting + Subtitle */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-950 dark:text-white leading-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5">
          Make better food choices for your health.
        </p>
      </div>

      {/* 2x2 Grid of Compact Action Cards */}
      <div className="grid grid-cols-2 gap-3">
        {actions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onNavigateTab(action.id)}
              className="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 hover:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-left transition-all active:scale-[0.99] flex flex-col justify-between gap-2.5 shadow-xs"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-stone-950 dark:text-white leading-snug">
                  {action.label}
                </div>
                <p className="text-xs text-stone-700 dark:text-stone-300 truncate mt-0.5">
                  {action.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Recently searched chips (hidden when none) */}
      {recentSearches.length > 0 && (
        <section aria-label="Recently searched" className="space-y-2.5">
          <h2 className="text-sm font-bold text-stone-950 dark:text-white">
            Recently searched
          </h2>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map(term => (
              <button
                key={term}
                type="button"
                onClick={() => onSearchQuery(term)}
                className="min-h-[44px] px-4 py-1.5 rounded-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-sm font-semibold text-stone-900 dark:text-stone-100 transition-colors"
              >
                {term}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Today's Nutrition Section */}
      <section aria-label="Today's Nutrition" className="space-y-3">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-stone-950 dark:text-white">
              Today&apos;s Nutrition
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('plan')}
              className="min-h-[44px] inline-flex items-center text-sm font-bold text-emerald-800 dark:text-emerald-300 hover:underline shrink-0"
            >
              View plan
            </button>
          </div>
          <p className="text-xs text-stone-700 dark:text-stone-300">
            <span className="font-semibold tabular-nums">
              {formatAmount(totalCalories)} kcal eaten
            </span>
            {' · '}
            <span>Starting defaults - confirm with your care team</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {nutrientCards.map(item => {
            const hasTarget = item.target > 0;
            const rawPct = hasTarget ? (item.consumed / item.target) * 100 : 0;
            const pct = Math.round(rawPct);
            const isOver = hasTarget && item.consumed > item.target;
            const barWidth = isOver ? 100 : Math.max(0, Math.min(100, rawPct));

            return (
              <div
                key={item.label}
                className="rounded-2xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 p-3.5 space-y-2 shadow-xs"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                    {item.label}
                  </span>
                  <span className="text-sm tabular-nums text-stone-600 dark:text-stone-400">
                    <strong className="font-extrabold text-stone-950 dark:text-white">
                      {formatAmount(item.consumed)}
                    </strong>{' '}
                    / {formatAmount(item.target)} {item.unit}
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-label={item.label}
                  aria-valuenow={Math.round(item.consumed)}
                  aria-valuemin={0}
                  aria-valuemax={item.target}
                  className="w-full h-2.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden"
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOver
                        ? 'bg-amber-500'
                        : 'bg-emerald-700 dark:bg-emerald-500'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {isOver ? (
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle
                      className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0"
                      aria-hidden="true"
                    />
                    <span>Over your target</span>
                  </p>
                ) : (
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    {pct}% of your configured target
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-stone-600 dark:text-stone-400">
          Targets shown are your configured targets, not universal medical goals.
        </p>
      </section>
    </div>
  );
};
