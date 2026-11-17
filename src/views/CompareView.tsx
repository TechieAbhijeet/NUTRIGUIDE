import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, CheckCircle2, AlertCircle, XCircle, HelpCircle } from 'lucide-react';
import { FoodItem, RatingRule, ConditionType, TabType } from '../types';
import { evaluateFood, formatConditionName } from '../lib/ratingEngine';
import { formatServingText } from '../lib/sampleFoods';

interface CompareViewProps {
  food1: FoodItem | null;
  food2: FoodItem | null;
  allFoods: FoodItem[];
  userConditions: ConditionType[];
  ratingRules: RatingRule[];
  onSelectFood1: (food: FoodItem) => void;
  onSelectFood2: (food: FoodItem) => void;
  onBack: () => void;
}

export const CompareView: React.FC<CompareViewProps> = ({
  food1,
  food2,
  allFoods,
  userConditions,
  ratingRules,
  onSelectFood1,
  onSelectFood2,
  onBack,
}) => {
  const [searchQuery2, setSearchQuery2] = useState('');
  const [isChangingFood1, setIsChangingFood1] = useState(false);
  const [searchQuery1, setSearchQuery1] = useState('');

  const filteredFoods2 = useMemo(() => {
    const q = searchQuery2.trim().toLowerCase();
    return allFoods
      .filter(f => f.id !== food1?.id)
      .filter(f => !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allFoods, food1, searchQuery2]);

  const filteredFoods1 = useMemo(() => {
    const q = searchQuery1.trim().toLowerCase();
    return allFoods
      .filter(f => f.id !== food2?.id)
      .filter(f => !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allFoods, food2, searchQuery1]);

  const ev1 = food1 ? evaluateFood(food1, userConditions, ratingRules) : null;
  const ev2 = food2 ? evaluateFood(food2, userConditions, ratingRules) : null;

  const nutrients: {
    label: string;
    key: keyof Pick<
      FoodItem,
      'kcal' | 'carbs' | 'sugars' | 'fiber' | 'protein' | 'sodium' | 'potassium' | 'phosphorus'
    >;
    unit: string;
  }[] = [
    { label: 'Calories', key: 'kcal', unit: 'kcal' },
    { label: 'Carbohydrates', key: 'carbs', unit: 'g' },
    { label: 'Sugars', key: 'sugars', unit: 'g' },
    { label: 'Dietary Fiber', key: 'fiber', unit: 'g' },
    { label: 'Protein', key: 'protein', unit: 'g' },
    { label: 'Sodium', key: 'sodium', unit: 'mg' },
    { label: 'Potassium', key: 'potassium', unit: 'mg' },
    { label: 'Phosphorus', key: 'phosphorus', unit: 'mg' },
  ];

  return (
    <div className="pb-28 max-w-lg mx-auto px-4 pt-4 space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
          Food Comparison
        </h2>
        <div className="w-8" />
      </div>

      {/* Selectors Header Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Food 1 Column Selector */}
        <div className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Food 1
            </span>
            <button
              onClick={() => setIsChangingFood1(!isChangingFood1)}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {isChangingFood1 ? 'Done' : 'Change'}
            </button>
          </div>

          {isChangingFood1 ? (
            <div className="space-y-2 mt-2">
              <input
                type="text"
                autoFocus
                value={searchQuery1}
                onChange={e => setSearchQuery1(e.target.value)}
                placeholder="Search food..."
                className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
              />
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredFoods1.map(f => (
                  <button
                    key={f.id}
                    onClick={() => {
                      onSelectFood1(f);
                      setIsChangingFood1(false);
                      setSearchQuery1('');
                    }}
                    className="w-full text-left p-1.5 text-[11px] font-medium rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 truncate block"
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          ) : food1 ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-xs border p-0.5 flex items-center justify-center shrink-0 ${
                    food1.isVeg ? 'border-emerald-700' : 'border-red-700'
                  }`}
                >
                  <span
                    className={`w-1 h-1 rounded-full ${
                      food1.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                    }`}
                  />
                </span>
                <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                  {food1.name}
                </p>
              </div>
              <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                {formatServingText(food1.servingLabel, food1.servingGrams)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-stone-400 italic">Select food 1</p>
          )}
        </div>

        {/* Food 2 Column Selector */}
        <div className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Food 2
            </span>
            {food2 && (
              <button
                onClick={() => setSearchQuery2(searchQuery2 ? '' : ' ')}
                className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Change
              </button>
            )}
          </div>

          {food2 ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-xs border p-0.5 flex items-center justify-center shrink-0 ${
                    food2.isVeg ? 'border-emerald-700' : 'border-red-700'
                  }`}
                >
                  <span
                    className={`w-1 h-1 rounded-full ${
                      food2.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                    }`}
                  />
                </span>
                <p className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                  {food2.name}
                </p>
              </div>
              <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                {formatServingText(food2.servingLabel, food2.servingGrams)}
              </p>
            </div>
          ) : (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Select second food below
            </span>
          )}
        </div>
      </div>

      {/* If food 2 is not yet chosen, show search picker */}
      {!food2 ? (
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
              Search a second food to compare
            </h3>
          </div>
          <input
            type="text"
            autoFocus
            value={searchQuery2}
            onChange={e => setSearchQuery2(e.target.value)}
            placeholder="Search by name (e.g. roti, brown rice, dal, dahi)..."
            className="w-full px-3 py-2.5 text-xs sm:text-sm rounded-xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />

          <div className="space-y-1.5 max-h-72 overflow-y-auto pt-1">
            {filteredFoods2.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFood2(f)}
                className="w-full p-2.5 rounded-xl border border-stone-100 dark:border-stone-800 hover:border-emerald-700/40 text-left flex items-center justify-between transition-colors bg-stone-50/50 dark:bg-stone-800/40"
              >
                <div>
                  <p className="text-xs font-bold text-stone-900 dark:text-stone-100">
                    {f.name}
                  </p>
                  <p className="text-[11px] text-stone-500 font-mono">
                    {formatServingText(f.servingLabel, f.servingGrams)} · {f.kcal} kcal
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Select
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Side by Side Comparison Grid */
        food1 && (
          <div className="space-y-5">
            {/* 1. Nutrients Comparison Table */}
            <div className="bg-white dark:bg-stone-900 rounded-3xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-xs">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-100 dark:border-stone-800">
                <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                  Nutrient Comparison
                </h3>
                <span className="text-[10px] text-stone-500">
                  Marked with lower value
                </span>
              </div>

              {/* Serving Size Row */}
              <div className="py-2.5 border-b border-stone-100 dark:border-stone-800 grid grid-cols-5 items-center text-xs">
                <span className="col-span-2 font-semibold text-stone-600 dark:text-stone-400">
                  Serving
                </span>
                <span className="col-span-1.5 text-center font-medium text-stone-800 dark:text-stone-200 truncate pr-1">
                  {formatServingText(food1.servingLabel, food1.servingGrams)}
                </span>
                <span className="col-span-1.5 text-center font-medium text-stone-800 dark:text-stone-200 truncate pl-1">
                  {formatServingText(food2.servingLabel, food2.servingGrams)}
                </span>
              </div>

              {/* Nutrients Rows */}
              <div className="divide-y divide-stone-100 dark:divide-stone-800">
                {nutrients.map(n => {
                  const raw1 = food1[n.key];
                  const raw2 = food2[n.key];
                  const val1 = typeof raw1 === 'number' && Number.isFinite(raw1) ? raw1 : null;
                  const val2 = typeof raw2 === 'number' && Number.isFinite(raw2) ? raw2 : null;
                  const is1Lower = val1 !== null && val2 !== null && val1 < val2;
                  const is2Lower = val1 !== null && val2 !== null && val2 < val1;

                  return (
                    <div
                      key={n.key}
                      className="py-2.5 grid grid-cols-5 items-center text-xs"
                    >
                      <span className="col-span-2 font-semibold text-stone-700 dark:text-stone-300">
                        {n.label}
                      </span>

                      {/* Food 1 Value */}
                      <div className="col-span-1.5 text-center font-mono">
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {val1 !== null ? `${val1} ${n.unit}` : 'Not available'}
                        </span>
                        {is1Lower && (
                          <div className="mt-0.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                              Lower
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Food 2 Value */}
                      <div className="col-span-1.5 text-center font-mono">
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {val2 !== null ? `${val2} ${n.unit}` : 'Not available'}
                        </span>
                        {is2Lower && (
                          <div className="mt-0.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                              Lower
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Per-Condition Ratings Side by Side */}
            <div className="bg-white dark:bg-stone-900 rounded-3xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
                <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                  Per-Condition Ratings
                </h3>
                {(ev1?.hasDraftGuidance || ev2?.hasDraftGuidance) && (
                  <span className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded font-medium">
                    Draft guidance
                  </span>
                )}
              </div>

              {userConditions.length === 0 ? (
                <p className="text-xs text-stone-500 italic">
                  No active health conditions selected.
                </p>
              ) : (
                <div className="space-y-3">
                  {userConditions.map(cond => {
                    const cEv1 = ev1?.evaluations.find(e => e.condition === cond);
                    const cEv2 = ev2?.evaluations.find(e => e.condition === cond);

                    return (
                      <div
                        key={cond}
                        className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/80 space-y-2"
                      >
                        <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          {formatConditionName(cond)}
                        </h4>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {/* Food 1 evaluation */}
                          <div className="p-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                            <p className="text-[10px] text-stone-400 font-medium truncate mb-1">
                              {food1.name}
                            </p>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                cEv1?.level === 'limit'
                                  ? 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200'
                                  : cEv1?.level === 'moderate'
                                  ? 'bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200'
                                  : cEv1?.level === 'unknown'
                                  ? 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                                  : 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200'
                              }`}
                            >
                              {cEv1?.level === 'limit' ? (
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                              ) : cEv1?.level === 'moderate' ? (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              ) : cEv1?.level === 'unknown' ? (
                                <HelpCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>
                                {cEv1?.level === 'limit'
                                  ? 'Limit'
                                  : cEv1?.level === 'moderate'
                                  ? 'Moderate'
                                  : cEv1?.level === 'unknown'
                                  ? 'Not enough data'
                                  : 'Suitable'}
                              </span>
                            </span>
                            <div className="mt-1 text-xs text-stone-700 dark:text-stone-300 space-y-0.5">
                              {cEv1?.reasons.map((r, i) => (
                                <p key={i}>• {r}</p>
                              ))}
                            </div>
                          </div>

                          {/* Food 2 evaluation */}
                          <div className="p-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                            <p className="text-xs text-stone-700 dark:text-stone-300 font-semibold truncate mb-1">
                              {food2.name}
                            </p>
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                cEv2?.level === 'limit'
                                  ? 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200'
                                  : cEv2?.level === 'moderate'
                                  ? 'bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-200'
                                  : cEv2?.level === 'unknown'
                                  ? 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                                  : 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-200'
                              }`}
                            >
                              {cEv2?.level === 'limit' ? (
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                              ) : cEv2?.level === 'moderate' ? (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              ) : cEv2?.level === 'unknown' ? (
                                <HelpCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>
                                {cEv2?.level === 'limit'
                                  ? 'Limit'
                                  : cEv2?.level === 'moderate'
                                  ? 'Moderate'
                                  : cEv2?.level === 'unknown'
                                  ? 'Not enough data'
                                  : 'Suitable'}
                              </span>
                            </span>
                            <div className="mt-1 text-xs text-stone-700 dark:text-stone-300 space-y-0.5">
                              {cEv2?.reasons.map((r, i) => (
                                <p key={i}>• {r}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
};
