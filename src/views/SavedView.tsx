import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, ChevronRight, Trash2, CalendarPlus, Check, AlertTriangle, RefreshCw, CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FoodItem, RatingRule, SavedFoodItem, TabType, MealSlotType, PlannedFoodItem } from '../types';
import { evaluateFood, formatConditionName, getPlainRatingLabel } from '../lib/ratingEngine';
import { formatServingText } from '../lib/sampleFoods';

interface SavedViewProps {
  savedFoods: SavedFoodItem[];
  foods: FoodItem[];
  ratingRules: RatingRule[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectFood: (food: FoodItem) => void;
  onRemoveSaved: (savedId: string) => void;
  onAddToPlan: (slot: MealSlotType, item: PlannedFoodItem) => void;
  onNavigateTab: (tab: TabType) => void;
}

export const SavedView: React.FC<SavedViewProps> = ({
  savedFoods,
  foods,
  ratingRules,
  loading = false,
  error = null,
  onRetry,
  onSelectFood,
  onRemoveSaved,
  onAddToPlan,
  onNavigateTab,
}) => {
  const { profile } = useAuth();
  const conditions = profile?.conditions || [];

  const [activeSlotPickerFoodId, setActiveSlotPickerFoodId] = useState<string | null>(null);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  const foodMap = new Map<string, FoodItem>();
  foods.forEach(f => foodMap.set(f.id, f));

  const handleAddPortionToSlot = (food: FoodItem, slot: MealSlotType) => {
    const plannedItem: PlannedFoodItem = {
      foodId: food.id,
      foodName: food.name,
      servingLabel: food.servingLabel,
      servingGrams: food.servingGrams,
      quantity: 1, // 1x portion
      kcal: food.kcal,
      carbs: food.carbs,
      protein: food.protein,
      sodium: food.sodium,
      potassium: food.potassium,
      fiber: food.fiber !== null && food.fiber !== undefined ? food.fiber : null,
      isVeg: food.isVeg,
    };

    onAddToPlan(slot, plannedItem);
    const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
    setAddedNotice(`Added 1x ${food.name} to ${slotLabel}!`);
    setActiveSlotPickerFoodId(null);
    setTimeout(() => {
      setAddedNotice(null);
    }, 2500);
  };

  // Loading state
  if (loading) {
    return (
      <div className="pb-28 max-w-lg mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-stone-500 font-medium">Loading saved foods...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="pb-28 max-w-lg mx-auto px-4 pt-8">
        <div className="p-5 rounded-3xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Unable to load saved foods</h3>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">{error}</p>
          </div>
          {onRetry && (
            <button
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

  return (
    <div className="pb-24 max-w-lg mx-auto px-4 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
            Saved Indian Foods
          </h2>
          <p className="text-xs text-stone-500">
            {savedFoods.length} bookmarked items for fast meal logging
          </p>
        </div>
      </div>

      {addedNotice && (
        <div className="p-3 rounded-2xl bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-md animate-in fade-in duration-200">
          <Check className="w-4 h-4 shrink-0" />
          <span>{addedNotice}</span>
        </div>
      )}

      {/* Empty State */}
      {savedFoods.length === 0 ? (
        <div className="p-8 text-center rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs mt-4">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 flex items-center justify-center mx-auto mb-3">
            <Bookmark className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200">
            No saved foods yet
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto mb-4">
            Bookmark your favorite rotis, dals, and snacks while browsing to quickly add them to your daily plan.
          </p>
          <button
            onClick={() => onNavigateTab('foods')}
            className="py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
          >
            Explore Foods Catalog
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {savedFoods.map(item => {
            const food = foodMap.get(item.foodId);
            const ev = food ? evaluateFood(food, conditions, ratingRules) : null;
            const isPickerOpen = activeSlotPickerFoodId === item.id;

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-emerald-700/40 transition-all text-left shadow-xs space-y-2.5 group"
              >
                {/* Header Row */}
                <div
                  onClick={() => {
                    if (food) onSelectFood(food);
                  }}
                  className="flex items-start justify-between gap-3 cursor-pointer"
                >
                  <div className="flex-1 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-xs border p-0.5 flex items-center justify-center shrink-0 ${
                          item.isVeg ? 'border-emerald-700' : 'border-red-700'
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${
                            item.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                          }`}
                        />
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 group-hover:text-emerald-800 dark:group-hover:text-emerald-400 transition-colors">
                        {item.name}
                      </h4>
                    </div>

                    <p className="text-xs text-stone-700 dark:text-stone-300 mt-0.5">
                      {item.category} · {food ? formatServingText(food.servingLabel, food.servingGrams) : item.servingLabel}
                    </p>

                    {food && (
                      <div className="flex items-center gap-2 text-xs text-stone-800 dark:text-stone-200 font-mono mt-1 flex-wrap">
                        <span>{food.kcal} kcal</span>
                        <span>·</span>
                        <span>Carbs {food.carbs}g</span>
                        <span>·</span>
                        <span>Na {food.sodium}mg</span>
                      </div>
                    )}

                    {ev && ev.evaluations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {ev.evaluations.map(cEv => (
                          <span
                            key={cEv.condition}
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              cEv.level === 'limit'
                                ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
                                : cEv.level === 'moderate'
                                ? 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200'
                                : cEv.level === 'unknown'
                                ? 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                                : 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-200'
                            }`}
                          >
                            {cEv.level === 'limit' ? (
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                            ) : cEv.level === 'moderate' ? (
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            ) : cEv.level === 'unknown' ? (
                              <HelpCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{formatConditionName(cEv.condition)}: {getPlainRatingLabel(cEv.level)}</span>
                          </span>
                        ))}
                        {ev.hasDraftGuidance && (
                          <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                            (Draft guidance)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onRemoveSaved(item.id);
                      }}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-600 dark:text-stone-300 hover:text-red-700 transition-colors"
                      aria-label="Remove bookmark"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-stone-600 dark:text-stone-300 group-hover:text-stone-900" />
                  </div>
                </div>

                {/* Add to plan action row */}
                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSlotPickerFoodId(isPickerOpen ? null : item.id);
                      }}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-bold flex items-center gap-1.5 transition-colors border border-emerald-700/40"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      <span>{isPickerOpen ? 'Cancel' : 'Add to diet chart'}</span>
                    </button>

                    <span className="text-xs text-stone-700 dark:text-stone-300">
                      1x serving
                    </span>
                  </div>

                  {/* Meal slot picker (Breakfast, Lunch, Dinner, Snacks) */}
                  {isPickerOpen && food && (
                    <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-2 animate-in fade-in duration-150">
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">
                        Select Meal ({food.kcal} kcal)
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { id: 'breakfast' as MealSlotType, label: 'Breakfast' },
                          { id: 'lunch' as MealSlotType, label: 'Lunch' },
                          { id: 'dinner' as MealSlotType, label: 'Dinner' },
                          { id: 'snacks' as MealSlotType, label: 'Snacks' },
                        ].map(slot => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => handleAddPortionToSlot(food, slot.id)}
                            className="py-1.5 px-1 rounded-lg text-xs font-semibold bg-white dark:bg-stone-900 hover:bg-emerald-800 hover:text-white dark:hover:bg-emerald-700 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 transition-colors shadow-2xs text-center"
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
