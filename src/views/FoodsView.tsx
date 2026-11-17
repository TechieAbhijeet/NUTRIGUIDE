import React, { useState, useMemo } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FoodItem, RatingRule, SavedFoodItem, FoodType } from '../types';
import { evaluateFood } from '../lib/ratingEngine';
import { formatServingText, getFoodIcon, normalizeFoodType } from '../lib/sampleFoods';

interface FoodsViewProps {
  foods: FoodItem[];
  ratingRules: RatingRule[];
  savedFoods: SavedFoodItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectFood: (food: FoodItem) => void;
  onToggleSave: (food: FoodItem) => void;
  onOpenCanIEat: () => void;
}

type CategoryFilter = 'all' | FoodType;

const CATEGORY_CHIPS: { id: FoodType; label: string }[] = [
  { id: 'meal', label: 'Meals' },
  { id: 'fruit', label: 'Fruits' },
  { id: 'vegetable', label: 'Vegetables' },
  { id: 'grain', label: 'Grains' },
  { id: 'pulse', label: 'Pulses' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'snack', label: 'Snacks' },
  { id: 'drink', label: 'Drinks' },
];

export const FoodsView: React.FC<FoodsViewProps> = ({
  foods,
  ratingRules,
  savedFoods,
  loading = false,
  error = null,
  onRetry,
  onSelectFood,
  onToggleSave,
  onOpenCanIEat,
}) => {
  const { profile } = useAuth();
  const [selectedType, setSelectedType] = useState<CategoryFilter>('all');
  const [showUnknownSection, setShowUnknownSection] = useState(false);

  const conditions = profile?.conditions || [];
  const isVegDiet = profile?.dietType === 'veg';

  const savedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    savedFoods.forEach(s => map.set(s.foodId, true));
    return map;
  }, [savedFoods]);

  const filteredFoods = useMemo(() => {
    return foods.filter(food => {
      if (isVegDiet && !food.isVeg) return false;
      if (selectedType !== 'all') {
        const resolvedType = food.type || normalizeFoodType(undefined, food.category);
        if (resolvedType !== selectedType) return false;
      }
      return true;
    });
  }, [foods, isVegDiet, selectedType]);

  const foodEvalMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluateFood>>();
    filteredFoods.forEach(f => {
      map.set(f.id, evaluateFood(f, conditions, ratingRules));
    });
    return map;
  }, [filteredFoods, conditions, ratingRules]);

  const suitableFoods = useMemo(
    () => filteredFoods.filter(f => foodEvalMap.get(f.id)?.overallLevel === 'favorable'),
    [filteredFoods, foodEvalMap]
  );

  const moderateFoods = useMemo(
    () => filteredFoods.filter(f => foodEvalMap.get(f.id)?.overallLevel === 'moderate'),
    [filteredFoods, foodEvalMap]
  );

  const limitFoods = useMemo(
    () => filteredFoods.filter(f => foodEvalMap.get(f.id)?.overallLevel === 'limit'),
    [filteredFoods, foodEvalMap]
  );

  const unknownFoods = useMemo(
    () => filteredFoods.filter(f => foodEvalMap.get(f.id)?.overallLevel === 'unknown'),
    [filteredFoods, foodEvalMap]
  );

  if (loading) {
    return (
      <div className="pb-28 max-w-4xl mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-stone-500 font-medium">Loading foods...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-28 max-w-4xl mx-auto px-4 pt-8">
        <div className="p-5 rounded-3xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Unable to load foods</h3>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">{error}</p>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderFoodCard = (food: FoodItem) => {
    const ev = foodEvalMap.get(food.id) || evaluateFood(food, conditions, ratingRules);
    const isSaved = !!savedMap.get(food.id);
    const isLimit = ev.overallLevel === 'limit';
    const isMod = ev.overallLevel === 'moderate';
    const isUnknown = ev.overallLevel === 'unknown';
    const icon = getFoodIcon(food);
    const servingText = formatServingText(food.servingLabel, food.servingGrams);

    return (
      <div
        key={food.id}
        onClick={() => onSelectFood(food)}
        className="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-emerald-700/40 transition-all text-left shadow-xs cursor-pointer active:scale-[0.99] flex flex-col justify-between gap-3"
      >
        <div className="space-y-2.5">
          {/* Top Row: Round Icon + Bookmark */}
          <div className="flex items-start justify-between gap-2">
            <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-xl shrink-0">
              <span aria-hidden="true">{icon}</span>
            </div>

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onToggleSave(food);
              }}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-600 dark:text-stone-300 hover:text-emerald-800 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label={isSaved ? 'Remove from saved' : 'Save food'}
            >
              {isSaved ? (
                <BookmarkCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 fill-emerald-700 dark:fill-emerald-400" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Name & Serving */}
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-stone-950 dark:text-white leading-snug line-clamp-2">
              {food.name}
            </h4>
            <p className="text-xs text-stone-700 dark:text-stone-300 leading-snug">
              {servingText}
            </p>
          </div>
        </div>

        {/* Rating Chip with Icon and Word */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
              isLimit
                ? 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-200'
                : isMod
                ? 'bg-amber-100 text-amber-950 dark:bg-amber-950/70 dark:text-amber-200'
                : isUnknown
                ? 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                : 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/70 dark:text-emerald-200'
            }`}
          >
            {isLimit ? (
              <XCircle className="w-3.5 h-3.5 shrink-0" />
            ) : isMod ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : isUnknown ? (
              <HelpCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isLimit ? 'Limit' : isMod ? 'Moderate' : isUnknown ? 'Not enough data' : 'Suitable'}</span>
          </span>
          {ev.hasDraftGuidance && (
            <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
              Draft guidance
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (
    title: string,
    items: FoodItem[],
    variant: 'suitable' | 'moderate' | 'limit'
  ) => {
    const borderClass =
      variant === 'limit'
        ? 'border-red-200 dark:border-red-900/60'
        : variant === 'moderate'
        ? 'border-amber-200 dark:border-amber-900/60'
        : 'border-emerald-200 dark:border-emerald-900/60';

    const titleClass =
      variant === 'limit'
        ? 'text-red-900 dark:text-red-300'
        : variant === 'moderate'
        ? 'text-amber-900 dark:text-amber-300'
        : 'text-emerald-900 dark:text-emerald-300';

    return (
      <section className="space-y-3">
        <div className={`flex items-center gap-2 pb-1.5 border-b ${borderClass}`}>
          {variant === 'limit' ? (
            <XCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
          ) : variant === 'moderate' ? (
            <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          )}
          <h3 className={`text-sm font-bold ${titleClass}`}>{title}</h3>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-stone-400 italic py-2">
            No foods in this section.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
            {items.map(renderFoodCard)}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="pb-28 max-w-4xl mx-auto px-4 pt-4 space-y-5">
      {/* Title & Subtitle + Top Link */}
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-extrabold text-stone-950 dark:text-white tracking-tight">
          What can I eat?
        </h2>
        <p className="text-sm text-stone-700 dark:text-stone-300">
          Personalized guidance for your health conditions and diet
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={onOpenCanIEat}
            className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 dark:text-emerald-300 hover:underline py-1"
          >
            <span>Looking for a specific food? Check it here</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Chips: Meals, Fruits, Vegetables, Grains, Pulses, Dairy, Snacks, Drinks */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORY_CHIPS.map(chip => {
          const isActive = selectedType === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setSelectedType(prev => (prev === chip.id ? 'all' : chip.id))}
              className={`min-h-[44px] px-3.5 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-colors border ${
                isActive
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                  : 'bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Empty Catalog / Filtered State */}
      {filteredFoods.length === 0 ? (
        <div className="p-8 text-center rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">
            {foods.length === 0 ? 'No foods in catalog' : 'No foods in this category'}
          </p>
          {selectedType !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedType('all')}
              className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
            >
              Show All Foods
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {renderSection('Suitable - Eat Regularly', suitableFoods, 'suitable')}
          {renderSection('Moderate', moderateFoods, 'moderate')}
          {renderSection('Limit', limitFoods, 'limit')}

          {/* Collapsed "Not enough data" Section at the bottom */}
          <section className="space-y-3">
            <button
              type="button"
              onClick={() => setShowUnknownSection(prev => !prev)}
              aria-expanded={showUnknownSection}
              className="w-full min-h-[44px] flex items-center justify-between gap-2 pb-1.5 border-b border-stone-200 dark:border-stone-700 text-left"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-stone-500 dark:text-stone-400 shrink-0" />
                <h3 className="text-sm font-bold text-stone-700 dark:text-stone-300">
                  Not enough data ({unknownFoods.length})
                </h3>
              </div>
              {showUnknownSection ? (
                <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />
              )}
            </button>

            {showUnknownSection && (
              unknownFoods.length === 0 ? (
                <p className="text-xs text-stone-400 italic py-2">
                  No foods in this section.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
                  {unknownFoods.map(renderFoodCard)}
                </div>
              )
            )}
          </section>
        </div>
      )}
    </div>
  );
};
