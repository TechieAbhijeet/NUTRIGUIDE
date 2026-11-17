import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { FoodItem, RatingRule, SavedFoodItem } from '../types';
import { evaluateFood, getPlainMainReason, getPlainRatingLabel } from '../lib/ratingEngine';
import { formatServingText } from '../lib/sampleFoods';
import { stopHindiSpeech } from '../lib/hindiAudio';
import { HindiAudioButton } from '../components/HindiAudioButton';

interface CanIEatViewProps {
  foods: FoodItem[];
  ratingRules: RatingRule[];
  savedFoods: SavedFoodItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  initialQuery?: string;
  onSelectFood: (food: FoodItem) => void;
  onToggleSave: (food: FoodItem) => void;
  onOpenWhatCanIEat: () => void;
}

export const CanIEatView: React.FC<CanIEatViewProps> = ({
  foods,
  ratingRules,
  loading = false,
  error = null,
  onRetry,
  initialQuery = '',
  onSelectFood,
  onOpenWhatCanIEat,
}) => {
  const { user, profile } = useAuth();
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  const conditions = profile?.conditions || [];
  const trimmedQuery = query.trim();

  const matchingFoods = useMemo(() => {
    if (!trimmedQuery) return [];
    const q = trimmedQuery.toLowerCase();
    return foods.filter(food => {
      const nameMatch = food.name.toLowerCase().includes(q);
      const catMatch = food.category.toLowerCase().includes(q);
      const typeMatch = (food.type || '').toLowerCase().includes(q);
      return nameMatch || catMatch || typeMatch;
    });
  }, [foods, trimmedQuery]);

  const saveSearchTerm = async (term: string) => {
    const cleaned = term.trim();
    if (!user || !cleaned) return;
    try {
      await addDoc(collection(db, 'users', user.uid, 'searches'), {
        query: cleaned,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Could not save search history', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmedQuery) {
      saveSearchTerm(trimmedQuery);
    }
  };

  const handleOpenFood = (food: FoodItem) => {
    stopHindiSpeech();
    if (trimmedQuery) {
      saveSearchTerm(trimmedQuery);
    }
    onSelectFood(food);
  };

  if (loading) {
    return (
      <div className="pb-24 max-w-2xl mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-stone-800 dark:text-stone-200 font-semibold">Loading foods...</p>
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
            <h3 className="text-base font-bold text-red-950 dark:text-red-100">Unable to load foods</h3>
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

  return (
    <div className="pb-24 max-w-2xl mx-auto px-4 pt-4 flex flex-col min-h-[calc(100vh-150px)]">
      <div className="space-y-4 flex-1">
        {/* Title & Subtitle */}
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-950 dark:text-white">
            Can I eat this?
          </h1>
          <p className="text-sm text-stone-700 dark:text-stone-300">
            Search any food to see how it fits your profile.
          </p>
        </div>

        {/* Search Box */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-stone-600 dark:text-stone-300 absolute left-4 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='Try "Banana"'
              aria-label="Search any food"
              className="w-full min-h-[48px] pl-11 pr-12 py-2.5 text-base font-semibold rounded-2xl bg-white dark:bg-stone-900 border-2 border-stone-400 dark:border-stone-600 shadow-xs focus:outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-700/20 dark:text-white transition-all placeholder:text-stone-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="min-h-[44px] min-w-[44px] absolute right-1.5 flex items-center justify-center rounded-xl text-stone-700 hover:text-stone-950 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <p className="text-sm text-stone-700 dark:text-stone-300 px-1">
            Start typing to search foods and dishes.
          </p>
        </form>

        {/* Results */}
        {trimmedQuery && (
          <div className="space-y-2.5 pt-1">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200 px-1">
              {matchingFoods.length} {matchingFoods.length === 1 ? 'result' : 'results'} for "{trimmedQuery}"
            </p>

            {matchingFoods.length === 0 ? (
              <div className="p-5 text-center rounded-2xl bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 space-y-1">
                <p className="text-base font-bold text-stone-950 dark:text-white">
                  No matching foods found
                </p>
                <p className="text-sm text-stone-700 dark:text-stone-300">
                  Try another dish name or ingredient.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {matchingFoods.map(food => {
                  const ev = evaluateFood(food, conditions, ratingRules);
                  const level = ev.overallLevel;
                  const overallIsLimit = level === 'limit';
                  const overallIsMod = level === 'moderate';
                  const overallIsUnknown = level === 'unknown';

                  return (
                    <div
                      key={food.id}
                      className="rounded-2xl bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 hover:border-emerald-800 transition-all shadow-xs p-3.5 space-y-3"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenFood(food)}
                        className="w-full min-h-[48px] text-left flex items-center justify-between gap-3 active:scale-[0.99]"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <h2 className="text-base font-extrabold text-stone-950 dark:text-white leading-snug">
                            {food.name}
                          </h2>
                          <p className="text-sm text-stone-700 dark:text-stone-300">
                            Serving: {formatServingText(food.servingLabel, food.servingGrams)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {overallIsLimit ? (
                              <XCircle className="w-4 h-4 text-red-700 dark:text-red-300 shrink-0" />
                            ) : overallIsMod ? (
                              <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                            ) : overallIsUnknown ? (
                              <HelpCircle className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-300 shrink-0" />
                            )}
                            <span
                              className={`text-sm font-bold ${
                                overallIsLimit
                                  ? 'text-red-900 dark:text-red-200'
                                  : overallIsMod
                                  ? 'text-amber-900 dark:text-amber-200'
                                  : overallIsUnknown
                                  ? 'text-stone-700 dark:text-stone-300'
                                  : 'text-emerald-900 dark:text-emerald-200'
                              }`}
                            >
                              {getPlainRatingLabel(level)}
                            </span>
                            {ev.hasDraftGuidance && (
                              <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                                · Draft guidance
                              </span>
                            )}
                          </div>
                          {overallIsUnknown && (
                            <p className="text-xs text-stone-600 dark:text-stone-400">
                              {getPlainMainReason(food, ev, ratingRules)}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-stone-700 dark:text-stone-300 shrink-0" />
                      </button>

                      <div className="pt-2 border-t border-stone-200 dark:border-stone-800">
                        <HindiAudioButton
                          food={food}
                          evaluation={ev}
                          ratingRules={ratingRules}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom link to What can I eat? */}
      <div className="pt-6 pb-2">
        <button
          type="button"
          onClick={() => {
            stopHindiSpeech();
            onOpenWhatCanIEat();
          }}
          className="min-h-[46px] w-full px-4 py-2.5 rounded-2xl bg-white dark:bg-stone-900 border-2 border-emerald-700 text-emerald-950 dark:text-emerald-200 text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
        >
          <span>Not sure what to eat? See good choices</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
};
