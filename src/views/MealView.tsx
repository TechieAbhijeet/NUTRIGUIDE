import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Utensils,
  Plus,
  X,
  Check,
  AlertTriangle,
  BookmarkCheck,
  CalendarPlus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { FoodItem, RatingRule, MealSlotType, PlannedFoodItem, TabType } from '../types';
import { evaluateFood, formatConditionName, getPlainRatingLabel } from '../lib/ratingEngine';
import { formatServingText } from '../lib/sampleFoods';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

interface MealViewProps {
  foods: FoodItem[];
  ratingRules: RatingRule[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onAddToPlan: (slot: MealSlotType, items: PlannedFoodItem[]) => Promise<void>;
  onNavigateTab: (tab: TabType) => void;
  onSelectFoodDetail?: (food: FoodItem) => void;
}

type MealSlotCategory = 'grain' | 'vegetable' | 'protein' | 'side';

export const MealView: React.FC<MealViewProps> = ({
  foods,
  ratingRules,
  loading = false,
  error = null,
  onRetry,
  onAddToPlan,
  onNavigateTab,
  onSelectFoodDetail,
}) => {
  const { user, profile } = useAuth();
  const conditions = profile?.conditions || [];
  const targets = profile?.targets || { carbs: 180, protein: 60, sodium: 2000, potassium: 2500, fiber: 30 };

  const [mealName, setMealName] = useState('My Balanced Meal');
  const [selectedGrain, setSelectedGrain] = useState<FoodItem | null>(null);
  const [selectedVegetable, setSelectedVegetable] = useState<FoodItem | null>(null);
  const [selectedProtein, setSelectedProtein] = useState<FoodItem | null>(null);
  const [selectedSide, setSelectedSide] = useState<FoodItem | null>(null);

  // Selector modal state
  const [activePickerCategory, setActivePickerCategory] = useState<MealSlotCategory | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // Save / Add state
  const [savingMeal, setSavingMeal] = useState(false);
  const [addingToPlan, setAddingToPlan] = useState(false);
  const [showSlotChooser, setShowSlotChooser] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Group foods by slot category
  const categoryFilters: Record<MealSlotCategory, (f: FoodItem) => boolean> = {
    grain: f => {
      if (f.type === 'grain') return true;
      const c = f.category.toLowerCase();
      return c.includes('bread') || c.includes('roti') || c.includes('rice') || c.includes('grain') || c.includes('cereal') || c.includes('khichdi');
    },
    vegetable: f => {
      if (f.type === 'vegetable') return true;
      const c = f.category.toLowerCase();
      return c.includes('vegetable') || c.includes('sabzi') || c.includes('dry') || c.includes('gravy');
    },
    protein: f => {
      if (f.type === 'pulse') return true;
      const c = f.category.toLowerCase();
      return c.includes('dal') || c.includes('pulse') || c.includes('paneer') || c.includes('egg') || c.includes('chicken') || c.includes('fish') || c.includes('meat');
    },
    side: f => {
      if (f.type === 'dairy' || f.type === 'snack' || f.type === 'drink') return true;
      const c = f.category.toLowerCase();
      return c.includes('raita') || c.includes('dairy') || c.includes('salad') || c.includes('soup') || c.includes('snack') || c.includes('chutney');
    },
  };

  const currentCategoryFoods = useMemo(() => {
    if (!activePickerCategory) return [];
    const filterFn = categoryFilters[activePickerCategory];
    const q = pickerSearch.trim().toLowerCase();

    const matched = foods.filter(food => {
      if (profile?.dietType === 'veg' && !food.isVeg) return false;
      if (q) {
        return food.name.toLowerCase().includes(q) || food.category.toLowerCase().includes(q);
      }
      return filterFn(food);
    });

    if (matched.length > 0) return matched;
    // Fallback if specific type/category has no entries
    return foods.filter(food => {
      if (profile?.dietType === 'veg' && !food.isVeg) return false;
      if (q) return food.name.toLowerCase().includes(q) || food.category.toLowerCase().includes(q);
      return true;
    });
  }, [foods, activePickerCategory, pickerSearch, profile]);

  const selectedItems = useMemo(() => {
    return [
      { category: 'grain' as const, label: 'Grain', food: selectedGrain, set: setSelectedGrain },
      { category: 'vegetable' as const, label: 'Vegetable', food: selectedVegetable, set: setSelectedVegetable },
      { category: 'protein' as const, label: 'Protein', food: selectedProtein, set: setSelectedProtein },
      { category: 'side' as const, label: 'Side', food: selectedSide, set: setSelectedSide },
    ];
  }, [selectedGrain, selectedVegetable, selectedProtein, selectedSide]);

  // Live Totals calculation
  const liveTotals = useMemo(() => {
    const items = [selectedGrain, selectedVegetable, selectedProtein, selectedSide].filter((f): f is FoodItem => f !== null);
    return items.reduce(
      (acc, it) => ({
        kcal: acc.kcal + it.kcal,
        carbs: Math.round((acc.carbs + it.carbs) * 10) / 10,
        protein: Math.round((acc.protein + it.protein) * 10) / 10,
        sodium: acc.sodium + it.sodium,
        potassium: acc.potassium + it.potassium,
        fiber: Math.round((acc.fiber + (it.fiber ?? 0)) * 10) / 10,
      }),
      { kcal: 0, carbs: 0, protein: 0, sodium: 0, potassium: 0, fiber: 0 }
    );
  }, [selectedGrain, selectedVegetable, selectedProtein, selectedSide]);

  // Evaluate items for Moderate or Limit ratings
  const itemsWithNotes = useMemo(() => {
    const items = [
      { slotLabel: 'Grain', food: selectedGrain },
      { slotLabel: 'Vegetable', food: selectedVegetable },
      { slotLabel: 'Protein', food: selectedProtein },
      { slotLabel: 'Side', food: selectedSide },
    ].filter((entry): entry is { slotLabel: string; food: FoodItem } => entry.food !== null);

    return items
      .map(entry => {
        const ev = evaluateFood(entry.food, conditions, ratingRules);
        return {
          ...entry,
          evaluation: ev,
          isModerateOrLimit: ev.overallLevel === 'moderate' || ev.overallLevel === 'limit',
        };
      })
      .filter(item => item.isModerateOrLimit);
  }, [selectedGrain, selectedVegetable, selectedProtein, selectedSide, conditions, ratingRules]);

  const handleSelectFoodForCategory = (food: FoodItem) => {
    if (!activePickerCategory) return;
    if (activePickerCategory === 'grain') setSelectedGrain(food);
    if (activePickerCategory === 'vegetable') setSelectedVegetable(food);
    if (activePickerCategory === 'protein') setSelectedProtein(food);
    if (activePickerCategory === 'side') setSelectedSide(food);
    setActivePickerCategory(null);
    setPickerSearch('');
  };

  const handleSaveMeal = async () => {
    if (!user) return;
    const activeFoods = [selectedGrain, selectedVegetable, selectedProtein, selectedSide].filter(Boolean);
    if (activeFoods.length === 0) {
      setSaveError('Please pick at least one food item to save your meal.');
      return;
    }

    setSavingMeal(true);
    setSaveError(null);
    const path = `users/${user.uid}/meals`;

    try {
      const mealDoc = {
        name: mealName.trim() || 'Custom Meal',
        grain: selectedGrain ? { id: selectedGrain.id, name: selectedGrain.name, kcal: selectedGrain.kcal } : null,
        vegetable: selectedVegetable ? { id: selectedVegetable.id, name: selectedVegetable.name, kcal: selectedVegetable.kcal } : null,
        protein: selectedProtein ? { id: selectedProtein.id, name: selectedProtein.name, kcal: selectedProtein.kcal } : null,
        side: selectedSide ? { id: selectedSide.id, name: selectedSide.name, kcal: selectedSide.kcal } : null,
        totals: liveTotals,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, path), mealDoc);
      setFeedbackNotice(`"${mealDoc.name}" saved to your personal meals!`);
      setTimeout(() => setFeedbackNotice(null), 3000);
    } catch (err: any) {
      console.error(err);
      setSaveError('Failed to save meal to database.');
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSavingMeal(false);
    }
  };

  const handleAddToSlot = async (slot: MealSlotType) => {
    const activeFoods = [selectedGrain, selectedVegetable, selectedProtein, selectedSide].filter((f): f is FoodItem => f !== null);
    if (activeFoods.length === 0) {
      setSaveError('Please select at least one food item first.');
      return;
    }

    setAddingToPlan(true);
    setSaveError(null);

    const plannedItems: PlannedFoodItem[] = activeFoods.map(food => ({
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
      fiber: food.fiber ?? 0,
      isVeg: food.isVeg,
    }));

    try {
      await onAddToPlan(slot, plannedItems);
      setShowSlotChooser(false);
      const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
      setFeedbackNotice(`Added ${plannedItems.length} items to ${slotLabel} in today's plan!`);
      setTimeout(() => setFeedbackNotice(null), 3000);
    } catch (err: any) {
      setSaveError('Could not add meal to plan.');
    } finally {
      setAddingToPlan(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="pb-28 max-w-lg mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-stone-500 font-medium">Loading meal builder catalog...</p>
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
            <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Unable to load meal builder</h3>
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
    <div className="pb-28 max-w-lg mx-auto px-4 pt-4 space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigateTab('home')}
          className="p-2 -ml-2 rounded-xl text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </button>
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
          Build a Meal
        </h2>
        <div className="w-8" />
      </div>

      {feedbackNotice && (
        <div className="p-3 rounded-2xl bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-md animate-in fade-in duration-200">
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedbackNotice}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Meal Title Card */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-2">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500">
          Meal Name
        </label>
        <input
          type="text"
          value={mealName}
          onChange={e => setMealName(e.target.value)}
          placeholder="e.g. Lunch Roti & Dal Thali"
          className="w-full px-3 py-2 text-sm font-bold rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:text-white"
        />
        <p className="text-[11px] text-stone-500">
          Pick 1 grain, 1 vegetable, 1 protein, and 1 side to evaluate nutrition in real time.
        </p>
      </div>

      {/* 4 Category Slots */}
      <div className="space-y-3">
        {selectedItems.map(({ category, label, food, set }) => {
          const ev = food ? evaluateFood(food, conditions, ratingRules) : null;
          const isModerate = ev?.overallLevel === 'moderate';
          const isLimit = ev?.overallLevel === 'limit';

          return (
            <div
              key={category}
              className={`p-4 rounded-3xl border transition-all ${
                food
                  ? isLimit
                    ? 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900/50'
                    : isModerate
                    ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 shadow-xs'
                  : 'bg-stone-50/70 dark:bg-stone-900/50 border-dashed border-stone-300 dark:border-stone-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  {label}
                </span>
                {food && (
                  <button
                    type="button"
                    onClick={() => set(null)}
                    className="text-[11px] text-stone-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>

              {!food ? (
                <button
                  type="button"
                  onClick={() => {
                    setActivePickerCategory(category);
                    setPickerSearch('');
                  }}
                  className="w-full py-3.5 px-4 rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:border-emerald-600 text-xs font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
                >
                  <Plus className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Choose {label}</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-xs border p-0.5 flex items-center justify-center shrink-0 ${
                            food.isVeg ? 'border-emerald-700' : 'border-red-700'
                          }`}
                        >
                          <span
                            className={`w-1 h-1 rounded-full ${
                              food.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                            }`}
                          />
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                          {food.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                        {formatServingText(food.servingLabel, food.servingGrams)} · {food.kcal} kcal · Carbs {food.carbs}g · Na {food.sodium}mg
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActivePickerCategory(category);
                        setPickerSearch('');
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 transition-colors"
                    >
                      Change
                    </button>
                  </div>

                  {/* Rating Badge & Note */}
                  {ev && (
                    <div className="pt-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${
                          isLimit
                            ? 'bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-100'
                            : isModerate
                            ? 'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100'
                            : 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-200'
                        }`}
                      >
                        {isLimit ? (
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                        ) : isModerate ? (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{getPlainRatingLabel(ev.overallLevel)}</span>
                      </span>
                      {ev.hasDraftGuidance && (
                        <span className="text-xs text-amber-900 dark:text-amber-300 font-medium">
                          (Draft guidance)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Note if item rates Moderate or Limit */}
                  {(isModerate || isLimit) && ev && (
                    <div
                      className={`p-2.5 rounded-xl text-xs space-y-0.5 ${
                        isLimit
                          ? 'bg-red-100/70 text-red-900 dark:bg-red-950/40 dark:text-red-200 border border-red-200 dark:border-red-900'
                          : 'bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200 dark:border-amber-900'
                      }`}
                    >
                      <p className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isLimit ? 'Limit Alert for Conditions' : 'Moderate Intake Recommended'}
                        </span>
                      </p>
                      {ev.evaluations.map(
                        cEv =>
                          (cEv.level === 'moderate' || cEv.level === 'limit') && (
                            <p key={cEv.condition} className="text-[11px] leading-tight">
                              • <strong>{formatConditionName(cEv.condition)}:</strong> {cEv.reasons.join(', ')}
                            </p>
                          )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live Nutrient Totals Card */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
            Live Meal Nutrition Totals
          </h3>
          <span className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-400">
            {liveTotals.kcal} kcal
          </span>
        </div>

        {/* 6-Nutrient Grid */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            <span className="text-[10px] text-stone-500 font-medium">Calories</span>
            <p className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {liveTotals.kcal} <span className="text-[10px] font-sans font-normal">kcal</span>
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            <span className="text-[10px] text-stone-500 font-medium">Carbohydrates</span>
            <p className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {liveTotals.carbs} <span className="text-[10px] font-sans font-normal">g</span>
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            <span className="text-[10px] text-stone-500 font-medium">Protein</span>
            <p className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {liveTotals.protein} <span className="text-[10px] font-sans font-normal">g</span>
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            <span className="text-[10px] text-stone-500 font-medium">Sodium</span>
            <p className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {liveTotals.sodium} <span className="text-[10px] font-sans font-normal">mg</span>
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            <span className="text-[10px] text-stone-500 font-medium">Potassium</span>
            <p className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {liveTotals.potassium} <span className="text-[10px] font-sans font-normal">mg</span>
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/70 dark:border-stone-700/70">
            <span className="text-[10px] text-stone-500 font-medium">Dietary Fiber</span>
            <p className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100">
              {liveTotals.fiber} <span className="text-[10px] font-sans font-normal">g</span>
            </p>
          </div>
        </div>

        {/* Note if any selected item rates Moderate or Limit */}
        {itemsWithNotes.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Items in this meal with Moderate or Limit ratings:</span>
            </p>
            {itemsWithNotes.map(it => (
              <p key={it.food.id} className="text-[11px]">
                • <strong>{it.food.name} ({it.slotLabel}):</strong> Rated{' '}
                <span className="font-bold uppercase">{it.evaluation.overallLevel}</span>. Check portions for your conditions.
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons: Save Meal and Add to Today */}
      <div className="space-y-2.5 pt-1">
        <button
          type="button"
          onClick={handleSaveMeal}
          disabled={savingMeal}
          className="w-full py-3 px-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:bg-stone-50 text-stone-800 dark:text-stone-100 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-50"
        >
          {savingMeal ? (
            <span className="inline-block w-4 h-4 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <BookmarkCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>Save Meal</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowSlotChooser(!showSlotChooser)}
          disabled={addingToPlan}
          className="w-full py-3.5 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-850/20 transition-all active:scale-[0.99] disabled:opacity-50"
        >
          {addingToPlan ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <CalendarPlus className="w-4 h-4" />
              <span>Add to Today (choose slot)</span>
            </>
          )}
        </button>

        {/* Meal Slot Chooser Popup */}
        {showSlotChooser && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 space-y-2 animate-in fade-in duration-150">
            <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100 block">
              Choose slot to log this meal in Today's Plan:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'breakfast' as MealSlotType, label: 'Breakfast' },
                { id: 'lunch' as MealSlotType, label: 'Lunch' },
                { id: 'dinner' as MealSlotType, label: 'Dinner' },
                { id: 'snacks' as MealSlotType, label: 'Snacks' },
              ].map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => handleAddToSlot(slot.id)}
                  className="py-2 px-1 text-xs font-semibold rounded-xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-800 hover:text-white text-stone-800 dark:text-stone-200 text-center shadow-xs transition-colors"
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Picker Modal */}
      {activePickerCategory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col border border-stone-200 dark:border-stone-800 shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 capitalize">
                  Pick {activePickerCategory}
                </h3>
                <p className="text-[11px] text-stone-500">
                  Select a food from the catalog for this meal slot
                </p>
              </div>
              <button
                onClick={() => {
                  setActivePickerCategory(null);
                  setPickerSearch('');
                }}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-stone-100 dark:border-stone-800">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  autoFocus
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder={`Search ${activePickerCategory} foods...`}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:text-white"
                />
              </div>
            </div>

            {/* Foods List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {currentCategoryFoods.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  No matching foods found in catalog.
                </div>
              ) : (
                currentCategoryFoods.map(food => {
                  const ev = evaluateFood(food, conditions, ratingRules);
                  const isFav = ev.overallLevel === 'favorable';
                  const isMod = ev.overallLevel === 'moderate';

                  return (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => handleSelectFoodForCategory(food)}
                      className="w-full p-2.5 rounded-2xl bg-stone-50/70 dark:bg-stone-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-stone-200/80 dark:border-stone-700/80 hover:border-emerald-600/50 transition-colors text-left flex items-center justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-xs border p-0.5 flex items-center justify-center shrink-0 ${
                              food.isVeg ? 'border-emerald-700' : 'border-red-700'
                            }`}
                          >
                            <span
                              className={`w-1 h-1 rounded-full ${
                                food.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                              }`}
                            />
                          </span>
                          <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                            {food.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 font-mono mt-0.5 truncate">
                          {formatServingText(food.servingLabel, food.servingGrams)} · {food.kcal} kcal · Carbs {food.carbs}g · Na {food.sodium}mg
                        </p>
                      </div>

                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 inline-flex items-center gap-1 ${
                          isFav
                            ? 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-200'
                            : isMod
                            ? 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200'
                            : 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-200'
                        }`}
                      >
                        {isFav ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : isMod ? (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{getPlainRatingLabel(ev.overallLevel)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
