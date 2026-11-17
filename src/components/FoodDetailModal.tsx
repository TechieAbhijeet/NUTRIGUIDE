import React, { useState } from 'react';
import { X, Bookmark, BookmarkCheck, Plus, Check, ArrowLeftRight, ChevronRight, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { FoodItem, RatingRule, ConditionType, MealSlotType, PlannedFoodItem } from '../types';
import { evaluateFood, formatConditionName } from '../lib/ratingEngine';
import { formatServingText, getFoodIcon } from '../lib/sampleFoods';

interface FoodDetailModalProps {
  food: FoodItem | null;
  onClose: () => void;
  userConditions: ConditionType[];
  ratingRules: RatingRule[];
  isSaved: boolean;
  onToggleSave: (food: FoodItem) => void;
  onAddToPlan: (slot: MealSlotType, item: PlannedFoodItem) => void;
  onCompare?: (food: FoodItem) => void;
  allFoods?: FoodItem[];
  onSelectFood?: (food: FoodItem) => void;
}

export const FoodDetailModal: React.FC<FoodDetailModalProps> = ({
  food,
  onClose,
  userConditions,
  ratingRules,
  isSaved,
  onToggleSave,
  onAddToPlan,
  onCompare,
  allFoods = [],
  onSelectFood,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<MealSlotType>('lunch');
  const [quantity, setQuantity] = useState<number>(1);
  const [showAddSuccess, setShowAddSuccess] = useState(false);

  if (!food) return null;

  const evaluation = evaluateFood(food, userConditions, ratingRules);

  const rankMap: Record<string, number> = {
    favorable: 3,
    moderate: 2,
    limit: 1,
  };
  const currentRank = rankMap[evaluation.overallLevel] || 1;

  // Better alternatives in same category with higher overall rating for user's conditions (max 3)
  const betterAlternatives = (allFoods || [])
    .filter(
      f =>
        f.id !== food.id &&
        f.category.trim().toLowerCase() === food.category.trim().toLowerCase()
    )
    .map(altFood => {
      const altEval = evaluateFood(altFood, userConditions, ratingRules);
      const altRank = rankMap[altEval.overallLevel] || 1;
      return { food: altFood, evaluation: altEval, rank: altRank };
    })
    .filter(item => item.rank > currentRank)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3);

  const handleAdd = () => {
    const plannedItem: PlannedFoodItem = {
      foodId: food.id,
      foodName: food.name,
      servingLabel: food.servingLabel,
      servingGrams: food.servingGrams,
      quantity,
      kcal: Math.round(food.kcal * quantity),
      carbs: Math.round(food.carbs * quantity * 10) / 10,
      protein: Math.round(food.protein * quantity * 10) / 10,
      sodium: Math.round(food.sodium * quantity),
      potassium: Math.round(food.potassium * quantity),
      fiber: Math.round((food.fiber ?? 0) * quantity * 10) / 10,
      isVeg: food.isVeg,
    };

    onAddToPlan(selectedSlot, plannedItem);
    setShowAddSuccess(true);
    setTimeout(() => {
      setShowAddSuccess(false);
      onClose();
    }, 700);
  };

  const userConditionRules = ratingRules.filter(r => userConditions.includes(r.condition));
  const activeRuleNutrients = new Set(
    userConditionRules.map(r => r.nutrient.toLowerCase().trim())
  );

  const hasKeyRule = (nutrient: string) => {
    const n = nutrient.toLowerCase().trim();
    if (activeRuleNutrients.has(n)) return true;
    if (n === 'carbohydrates' || n === 'carbs') return activeRuleNutrients.has('carbs') || activeRuleNutrients.has('carbohydrates');
    if (n === 'dietary fiber' || n === 'fiber') return activeRuleNutrients.has('fiber') || activeRuleNutrients.has('dietary fiber');
    if (n === 'sugars' || n === 'sugar') return activeRuleNutrients.has('sugar') || activeRuleNutrients.has('sugars');
    if (n === 'calories' || n === 'kcal') return activeRuleNutrients.has('calories') || activeRuleNutrients.has('kcal');
    return false;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col">
        {/* Grab bar on mobile */}
        <div className="w-10 h-1.5 bg-stone-300 dark:bg-stone-700 rounded-full mx-auto my-3 sm:hidden" />

        {/* Modal Header */}
        <div className="px-5 pt-3 pb-4 border-b border-stone-100 dark:border-stone-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-2xl shrink-0 mt-0.5">
              <span aria-hidden="true">{getFoodIcon(food)}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`w-3 h-3 rounded-xs border p-0.5 flex items-center justify-center ${
                    food.isVeg
                      ? 'border-emerald-700'
                      : 'border-red-700'
                  }`}
                  title={food.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      food.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                    }`}
                  />
                </span>
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  {food.category}
                </span>
              </div>
              <h3 className="text-lg font-extrabold text-stone-950 dark:text-white leading-snug">
                {food.name}
              </h3>
              <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5">
                Serving: {formatServingText(food.servingLabel, food.servingGrams)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onCompare && (
              <button
                type="button"
                onClick={() => onCompare(food)}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-900 dark:hover:text-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Compare with another food"
              >
                <ArrowLeftRight className="w-4 h-4 text-emerald-800 dark:text-emerald-300" />
                <span>Compare</span>
              </button>
            )}
            <button
              onClick={() => onToggleSave(food)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-700 dark:text-stone-200 hover:text-emerald-800 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label={isSaved ? 'Remove from saved' : 'Save food'}
            >
              {isSaved ? (
                <BookmarkCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 fill-emerald-700 dark:fill-emerald-400" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-700 dark:text-stone-200 hover:text-stone-950 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 flex-1">
          {/* Condition Traffic Light Evaluations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-stone-950 dark:text-stone-100 uppercase tracking-wider">
                Condition Suitability Ratings
              </h4>
              {evaluation.hasDraftGuidance && (
                <span className="text-xs text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 rounded-md font-semibold">
                  Draft guidance
                </span>
              )}
            </div>

            {evaluation.evaluations.length === 0 ? (
              <p className="text-sm text-stone-700 dark:text-stone-300 italic">
                No active conditions selected.
              </p>
            ) : (
              <div className="space-y-2">
                {evaluation.evaluations.map(ev => {
                  const isLimit = ev.level === 'limit';
                  const isModerate = ev.level === 'moderate';

                  return (
                    <div
                      key={ev.condition}
                      className={`p-3 rounded-xl border transition-all ${
                        isLimit
                          ? 'bg-red-50/70 border-red-200 dark:bg-red-950/30 dark:border-red-900/50'
                          : isModerate
                          ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50'
                          : 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-bold text-stone-950 dark:text-white">
                          {formatConditionName(ev.condition)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              isLimit
                                ? 'bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-100'
                                : isModerate
                                ? 'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100'
                                : 'bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100'
                            }`}
                          >
                            {isLimit ? (
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                            ) : isModerate ? (
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{isLimit ? 'Limit / Caution' : isModerate ? 'Moderate Portion' : 'Suitable'}</span>
                          </span>
                          {ev.hasDraftGuidance && (
                            <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                              (Draft guidance)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 text-xs text-stone-800 dark:text-stone-200 space-y-0.5">
                        {ev.reasons.map((r, i) => (
                          <p key={i}>• {r}</p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Better Alternatives (hidden if none exist) */}
          {betterAlternatives.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                  Better Alternatives in {food.category}
                </h4>
                <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold">
                  Better for your profile
                </span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-400">
                Dishes in this category with a more favorable rating for your conditions:
              </p>
              <div className="space-y-1.5 pt-1">
                {betterAlternatives.map(({ food: altFood, evaluation: altEval }) => {
                  const isFav = altEval.overallLevel === 'favorable';
                  return (
                    <div
                      key={altFood.id}
                      onClick={() => {
                        if (onSelectFood) {
                          onSelectFood(altFood);
                        }
                      }}
                      className="p-2.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-emerald-600/50 transition-all flex items-center justify-between gap-2.5 cursor-pointer group shadow-2xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-xs border p-0.5 flex items-center justify-center shrink-0 ${
                              altFood.isVeg ? 'border-emerald-700' : 'border-red-700'
                            }`}
                          >
                            <span
                              className={`w-1 h-1 rounded-full ${
                                altFood.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                              }`}
                            />
                          </span>
                          <span className="text-sm font-bold text-stone-950 dark:text-stone-100 group-hover:text-emerald-800 dark:group-hover:text-emerald-400 truncate">
                            {altFood.name}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 ${
                              isFav
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                                : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                            }`}
                          >
                            {isFav ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{isFav ? 'Suitable' : 'Moderate'}</span>
                          </span>
                          {altEval.hasDraftGuidance && (
                            <span className="text-xs text-amber-800 dark:text-amber-300 shrink-0">
                              (Draft guidance)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-700 dark:text-stone-300 font-mono mt-0.5 truncate">
                          {formatServingText(altFood.servingLabel, altFood.servingGrams)} · {altFood.kcal} kcal · Carbs {altFood.carbs}g · Na {altFood.sodium}mg
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Nutrient Breakdown Grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold text-stone-900 dark:text-stone-200 uppercase tracking-wider">
                Nutrition Facts (per {formatServingText(food.servingLabel, food.servingGrams)})
              </h4>
              <span className="text-[10px] text-stone-500">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 mr-1">
                  Key
                </span>
                = Condition monitored
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Calories */}
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 relative">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] text-stone-500 font-medium">Calories</span>
                  {hasKeyRule('calories') && (
                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Key
                    </span>
                  )}
                </div>
                <p className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 tabular-nums">
                  {food.kcal} <span className="text-[10px] font-sans font-normal">kcal</span>
                </p>
              </div>

              {/* Carbohydrates */}
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 relative">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] text-stone-500 font-medium">Carbohydrates</span>
                  {hasKeyRule('carbohydrates') && (
                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Key
                    </span>
                  )}
                </div>
                <p className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 tabular-nums">
                  {food.carbs} <span className="text-[10px] font-sans font-normal">g</span>
                </p>
              </div>

              {/* Protein */}
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 relative">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] text-stone-500 font-medium">Protein</span>
                  {hasKeyRule('protein') && (
                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Key
                    </span>
                  )}
                </div>
                <p className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 tabular-nums">
                  {food.protein} <span className="text-[10px] font-sans font-normal">g</span>
                </p>
              </div>

              {/* Dietary Fiber */}
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 relative">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] text-stone-500 font-medium">Dietary Fiber</span>
                  {hasKeyRule('dietary fiber') && (
                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Key
                    </span>
                  )}
                </div>
                <p className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 tabular-nums">
                  {food.fiber !== null && food.fiber !== undefined ? (
                    <>
                      {food.fiber} <span className="text-[10px] font-sans font-normal">g</span>
                    </>
                  ) : (
                    <span className="text-xs font-sans font-normal text-stone-500">Unknown</span>
                  )}
                </p>
              </div>

              {/* Sodium */}
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 relative">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] text-stone-500 font-medium">Sodium</span>
                  {hasKeyRule('sodium') && (
                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Key
                    </span>
                  )}
                </div>
                <p className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 tabular-nums">
                  {food.sodium} <span className="text-[10px] font-sans font-normal">mg</span>
                </p>
              </div>

              {/* Potassium */}
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 relative">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <span className="text-[10px] text-stone-500 font-medium">Potassium</span>
                  {hasKeyRule('potassium') && (
                    <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Key
                    </span>
                  )}
                </div>
                <p className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 tabular-nums">
                  {food.potassium} <span className="text-[10px] font-sans font-normal">mg</span>
                </p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-stone-500">
              <span className="flex items-center gap-1">
                Sugars:{' '}
                <strong className="font-mono">
                  {food.sugars !== null && food.sugars !== undefined ? `${food.sugars}g` : 'Unknown'}
                </strong>
                {hasKeyRule('sugars') && (
                  <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Key
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                Phosphorus: <strong className="font-mono">{food.phosphorus}mg</strong>
                {hasKeyRule('phosphorus') && (
                  <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Key
                  </span>
                )}
              </span>
              <span className="italic truncate max-w-[110px]">Src: {food.source}</span>
            </div>
          </div>

          {/* Add to Daily Plan Form */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <h4 className="text-xs font-bold text-emerald-950 dark:text-emerald-200 uppercase tracking-wider mb-2.5">
              Add to Today's Meal Plan
            </h4>

            {/* Meal Slot Picker */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[
                { id: 'breakfast' as MealSlotType, label: 'Breakfast' },
                { id: 'lunch' as MealSlotType, label: 'Lunch' },
                { id: 'dinner' as MealSlotType, label: 'Dinner' },
                { id: 'snacks' as MealSlotType, label: 'Snacks' },
              ].map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlot(slot.id)}
                  className={`py-1.5 px-1 rounded-lg text-xs font-medium text-center transition-colors ${
                    selectedSlot === slot.id
                      ? 'bg-emerald-800 text-white shadow-sm'
                      : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700'
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>

            {/* Quantity Stepper */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Portion size:
              </span>
              <div className="flex items-center gap-1.5">
                {[0.5, 1, 1.5, 2].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuantity(q)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md font-semibold transition-colors ${
                      quantity === q
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    {q}x
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={showAddSuccess}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-md shadow-emerald-800/15 flex items-center justify-center gap-1.5 active:scale-[0.99]"
            >
              {showAddSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>Added to {selectedSlot}!</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>
                    Add to {selectedSlot.charAt(0).toUpperCase() + selectedSlot.slice(1)} (
                    {Math.round(food.kcal * quantity)} kcal)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal Footer Disclaimer */}
        <div className="px-5 py-3 bg-stone-50 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 text-center">
          <p className="text-xs text-stone-700 dark:text-stone-300">
            NutriGuide is general guidance and not a substitute for your care team.
          </p>
        </div>
      </div>
    </div>
  );
};
