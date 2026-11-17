import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Table as TableIcon,
  Layers,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FoodItem, RatingRule, RatingLevel } from '../types';
import {
  evaluateFood,
  formatConditionName,
  formatNutrientLabel,
  getRuleNutrientValue,
} from '../lib/ratingEngine';

interface DetailsViewProps {
  foods: FoodItem[];
  ratingRules: RatingRule[];
  onSelectFood: (food: FoodItem) => void;
  onBackToProfile: () => void;
}

type TopTab = 'all' | 'meals' | 'fruits' | 'vegetables' | 'other';
type TabBucketKey = 'meals' | 'fruits' | 'vegetables' | 'other';
type SortOrder = 'none' | 'suitable_first' | 'limit_first';

const TAB_BUCKETS: { id: TabBucketKey; label: string }[] = [
  { id: 'meals', label: 'Meals' },
  { id: 'fruits', label: 'Fruits' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'other', label: 'Other' },
];

const RATING_RANK: Record<RatingLevel, number> = {
  favorable: 0,
  moderate: 1,
  limit: 2,
};

function matchesBucket(food: FoodItem, bucket: TopTab): boolean {
  if (bucket === 'all') return true;
  if (bucket === 'meals') return food.type === 'meal';
  if (bucket === 'fruits') return food.type === 'fruit';
  if (bucket === 'vegetables') return food.type === 'vegetable';
  return food.type !== 'meal' && food.type !== 'fruit' && food.type !== 'vegetable';
}

function getFoodNutrientValue(food: FoodItem, nutrient: string): number {
  return getRuleNutrientValue(food, nutrient, 1) ?? 0;
}

function formatNutrientDisplayName(nutrient: string): string {
  return formatNutrientLabel(nutrient);
}

export const DetailsView: React.FC<DetailsViewProps> = ({
  foods,
  ratingRules,
  onSelectFood,
  onBackToProfile,
}) => {
  const { profile } = useAuth();
  const [topTab, setTopTab] = useState<TopTab>('all');
  const [filterRating, setFilterRating] = useState<'all' | RatingLevel>('all');
  const [vegOnly, setVegOnly] = useState<boolean>(profile?.dietType === 'veg');
  const [tableSort, setTableSort] = useState<SortOrder>('suitable_first');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const conditions = profile?.conditions || [];

  const foodEvalMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluateFood>>();
    foods.forEach(f => {
      map.set(f.id, evaluateFood(f, conditions, ratingRules));
    });
    return map;
  }, [foods, conditions, ratingRules]);

  const hasDraftRules = useMemo(
    () => Array.from(foodEvalMap.values()).some(ev => ev.hasDraftGuidance),
    [foodEvalMap]
  );

  const dietScopedFoods = useMemo(() => {
    return foods.filter(f => !vegOnly || f.isVeg);
  }, [foods, vegOnly]);

  const stackedTabStats = useMemo(() => {
    return TAB_BUCKETS.map(bucket => {
      const bucketFoods = dietScopedFoods.filter(f => matchesBucket(f, bucket.id));
      let suitable = 0;
      let moderate = 0;
      let limit = 0;
      bucketFoods.forEach(f => {
        const ev = foodEvalMap.get(f.id) || evaluateFood(f, conditions, ratingRules);
        if (ev.overallLevel === 'favorable') suitable++;
        else if (ev.overallLevel === 'moderate') moderate++;
        else limit++;
      });
      return {
        id: bucket.id,
        label: bucket.label,
        total: bucketFoods.length,
        suitable,
        moderate,
        limit,
      };
    });
  }, [dietScopedFoods, foodEvalMap, conditions, ratingRules]);

  const userRelevantRules = useMemo(() => {
    const matching = ratingRules.filter(r => conditions.includes(r.condition));
    const source = matching.length > 0 ? matching : ratingRules;
    const priorityScore = (r: RatingRule) => {
      const n = r.nutrient.toLowerCase();
      if (r.condition === 'ckd' && n === 'potassium') return 1;
      if (r.condition === 'hypertension' && n === 'sodium') return 2;
      if (r.condition === 'diabetes' && n === 'carbs') return 3;
      if (r.condition === 'ckd' && n === 'sodium') return 4;
      if (r.condition === 'ckd' && n === 'phosphorus') return 5;
      if (r.condition === 'diabetes' && n === 'sugars') return 6;
      return 10;
    };
    return [...source].sort((a, b) => priorityScore(a) - priorityScore(b));
  }, [ratingRules, conditions]);

  const activeKeyRule: RatingRule | null = useMemo(() => {
    if (userRelevantRules.length === 0) return null;
    if (selectedRuleId) {
      const found = userRelevantRules.find(r => r.id === selectedRuleId);
      if (found) return found;
    }
    return userRelevantRules[0];
  }, [userRelevantRules, selectedRuleId]);

  const foodsInTopTab = useMemo(() => {
    return foods.filter(food => matchesBucket(food, topTab));
  }, [foods, topTab]);

  const filteredFoods = useMemo(() => {
    return foodsInTopTab.filter(food => {
      if (vegOnly && !food.isVeg) return false;
      if (filterRating !== 'all') {
        const ev = foodEvalMap.get(food.id) || evaluateFood(food, conditions, ratingRules);
        if (ev.overallLevel !== filterRating) return false;
      }
      return true;
    });
  }, [foodsInTopTab, vegOnly, filterRating, foodEvalMap, conditions, ratingRules]);

  const tableRows = useMemo(() => {
    const base = filteredFoods.map(food => ({
      food,
      ev: foodEvalMap.get(food.id) || evaluateFood(food, conditions, ratingRules),
    }));

    if (tableSort === 'suitable_first') {
      base.sort((a, b) => RATING_RANK[a.ev.overallLevel] - RATING_RANK[b.ev.overallLevel]);
    } else if (tableSort === 'limit_first') {
      base.sort((a, b) => RATING_RANK[b.ev.overallLevel] - RATING_RANK[a.ev.overallLevel]);
    }
    return base;
  }, [filteredFoods, foodEvalMap, conditions, ratingRules, tableSort]);

  const keyNutrientChart = useMemo(() => {
    if (!activeKeyRule) return null;
    const scoped = foodsInTopTab.filter(f => !vegOnly || f.isVeg);
    const entries = scoped
      .map(food => {
        const value = getFoodNutrientValue(food, activeKeyRule.nutrient);
        const level: RatingLevel =
          value >= activeKeyRule.limitAbove
            ? 'limit'
            : value >= activeKeyRule.moderateAbove
            ? 'moderate'
            : 'favorable';
        return { food, value, level };
      })
      .sort((a, b) => b.value - a.value);

    const maxFoodVal = entries.length > 0 ? entries[0].value : 0;
    const maxScale = Math.max(maxFoodVal * 1.08, activeKeyRule.limitAbove * 1.18, 1);

    return {
      rule: activeKeyRule,
      entries,
      maxScale,
      moderatePct: Math.min(100, (activeKeyRule.moderateAbove / maxScale) * 100),
      limitPct: Math.min(100, (activeKeyRule.limitAbove / maxScale) * 100),
    };
  }, [activeKeyRule, foodsInTopTab, vegOnly]);

  const handleSegmentFilter = (bucketId: TabBucketKey, level: RatingLevel) => {
    setTopTab(bucketId);
    setFilterRating(prev => (topTab === bucketId && prev === level ? 'all' : level));
  };

  const handleCycleSort = () => {
    setTableSort(prev =>
      prev === 'suitable_first' ? 'limit_first' : prev === 'limit_first' ? 'none' : 'suitable_first'
    );
  };

  return (
    <div className="pb-24 max-w-2xl mx-auto px-4 pt-4 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBackToProfile}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 text-stone-950 dark:text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setVegOnly(prev => !prev)}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl border-2 text-sm font-bold transition-colors ${
            vegOnly
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white dark:bg-stone-900 text-stone-950 dark:text-white border-stone-300 dark:border-stone-700'
          }`}
        >
          {vegOnly ? 'Veg Only: On' : 'Veg Only: Off'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-950 dark:text-white">
            Detailed view for care team
          </h1>
          <p className="text-sm text-stone-700 dark:text-stone-300">
            Your food map, condition compatibility table, and key nutrient charts
          </p>
        </div>
        {hasDraftRules && (
          <span className="text-xs font-bold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2.5 py-1 rounded-full">
            Draft guidance
          </span>
        )}
      </div>

      {/* Tab Selector */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all' as TopTab, label: 'All' },
          { id: 'meals' as TopTab, label: 'Meals' },
          { id: 'fruits' as TopTab, label: 'Fruits' },
          { id: 'vegetables' as TopTab, label: 'Vegetables' },
          { id: 'other' as TopTab, label: 'Other' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setTopTab(tab.id);
              setFilterRating('all');
            }}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
              topTab === tab.id
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-white dark:bg-stone-900 text-stone-950 dark:text-white border-stone-300 dark:border-stone-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Stacked Bar Per Tab (Your food map) */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl p-4 border-2 border-stone-300 dark:border-stone-700 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-800 dark:text-emerald-400" />
            <h2 className="text-base font-extrabold text-stone-950 dark:text-white">
              Your food map
            </h2>
          </div>
          <span className="text-xs text-stone-700 dark:text-stone-300">
            Tap a bar to filter
          </span>
        </div>

        {/* Icon + Text Legend */}
        <div className="flex items-center gap-4 text-xs font-bold text-stone-900 dark:text-stone-100 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
            <span>Suitable</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-300" />
            <span>Moderate</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-red-700 dark:text-red-300" />
            <span>Limit</span>
          </span>
        </div>

        <div className="space-y-3">
          {stackedTabStats.map(stat => {
            const denom = Math.max(stat.total, 1);
            const suitPct = (stat.suitable / denom) * 100;
            const modPct = (stat.moderate / denom) * 100;
            const limPct = (stat.limit / denom) * 100;

            return (
              <div key={stat.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
                  <span className="font-bold text-stone-950 dark:text-white">
                    {stat.label}
                  </span>
                  <span className="font-mono tabular-nums text-xs text-stone-800 dark:text-stone-200">
                    {stat.suitable} Suit · {stat.moderate} Mod · {stat.limit} Lim
                  </span>
                </div>

                {stat.total === 0 ? (
                  <div className="min-h-[44px] rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-xs text-stone-700 dark:text-stone-300">
                    No foods in {stat.label}
                  </div>
                ) : (
                  <div className="min-h-[44px] w-full rounded-xl overflow-hidden flex bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700">
                    {stat.suitable > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSegmentFilter(stat.id, 'favorable')}
                        style={{ width: `${suitPct}%` }}
                        className="min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold font-mono tabular-nums flex items-center justify-center gap-1 px-1 transition-all truncate"
                        title={`Filter ${stat.label}: Suitable (${stat.suitable})`}
                      >
                        <span>{stat.suitable}</span>
                      </button>
                    )}
                    {stat.moderate > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSegmentFilter(stat.id, 'moderate')}
                        style={{ width: `${modPct}%` }}
                        className="min-h-[44px] bg-amber-400 hover:bg-amber-500 text-stone-950 text-xs font-bold font-mono tabular-nums flex items-center justify-center gap-1 px-1 transition-all truncate"
                        title={`Filter ${stat.label}: Moderate (${stat.moderate})`}
                      >
                        <span>{stat.moderate}</span>
                      </button>
                    )}
                    {stat.limit > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSegmentFilter(stat.id, 'limit')}
                        style={{ width: `${limPct}%` }}
                        className="min-h-[44px] bg-red-700 hover:bg-red-800 text-white text-xs font-bold font-mono tabular-nums flex items-center justify-center gap-1 px-1 transition-all truncate"
                        title={`Filter ${stat.label}: Limit (${stat.limit})`}
                      >
                        <span>{stat.limit}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Condition Compatibility Table */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl p-4 border-2 border-stone-300 dark:border-stone-700 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <TableIcon className="w-5 h-5 text-emerald-800 dark:text-emerald-400" />
            <h2 className="text-base font-extrabold text-stone-950 dark:text-white">
              Condition compatibility table
            </h2>
          </div>

          <button
            type="button"
            onClick={handleCycleSort}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-bold text-stone-950 dark:text-white inline-flex items-center gap-1.5 transition-colors"
          >
            {tableSort === 'suitable_first' ? (
              <ArrowUp className="w-4 h-4 text-emerald-800 dark:text-emerald-300" />
            ) : tableSort === 'limit_first' ? (
              <ArrowDown className="w-4 h-4 text-red-700 dark:text-red-300" />
            ) : (
              <ArrowUpDown className="w-4 h-4" />
            )}
            <span>
              {tableSort === 'suitable_first'
                ? 'Suitable first'
                : tableSort === 'limit_first'
                ? 'Limit first'
                : 'Default order'}
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-stone-700 dark:text-stone-300 flex-wrap gap-2">
          <span>Showing {tableRows.length} foods</span>
          {hasDraftRules && (
            <span className="font-bold text-amber-900 dark:text-amber-300">
              Draft guidance
            </span>
          )}
        </div>

        {tableRows.length === 0 ? (
          <p className="text-sm text-stone-700 dark:text-stone-300 py-3 text-center">
            No foods match the active filter.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-stone-300 dark:border-stone-700">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-stone-800 border-b border-stone-300 dark:border-stone-700">
                <tr>
                  <th className="py-2.5 px-3 font-extrabold text-stone-950 dark:text-white min-w-[140px]">
                    Food
                  </th>
                  {conditions.map(cond => (
                    <th
                      key={cond}
                      className="py-2.5 px-3 font-extrabold text-stone-950 dark:text-white whitespace-nowrap"
                    >
                      {cond === 'ckd' ? 'CKD' : formatConditionName(cond)}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 font-extrabold text-stone-950 dark:text-white whitespace-nowrap">
                    Overall
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {tableRows.map(({ food, ev }) => {
                  const renderCellBadge = (level: RatingLevel) => {
                    const icon =
                      level === 'limit' ? (
                        <XCircle className="w-4 h-4 text-red-700 dark:text-red-300 shrink-0" />
                      ) : level === 'moderate' ? (
                        <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-300 shrink-0" />
                      );
                    const textClass =
                      level === 'limit'
                        ? 'text-red-900 dark:text-red-200'
                        : level === 'moderate'
                        ? 'text-amber-900 dark:text-amber-200'
                        : 'text-emerald-900 dark:text-emerald-200';
                    const label =
                      level === 'limit' ? 'Limit' : level === 'moderate' ? 'Moderate' : 'Suitable';

                    return (
                      <span className={`inline-flex items-center gap-1 font-bold whitespace-nowrap ${textClass}`}>
                        {icon}
                        <span>{label}</span>
                      </span>
                    );
                  };

                  return (
                    <tr
                      key={food.id}
                      onClick={() => onSelectFood(food)}
                      className="hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold text-stone-950 dark:text-white">
                        {food.name}
                      </td>
                      {conditions.map(cond => {
                        const cEv = ev.evaluations.find(e => e.condition === cond);
                        return (
                          <td key={cond} className="py-2.5 px-3">
                            {renderCellBadge(cEv?.level || 'favorable')}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3">
                        {renderCellBadge(ev.overallLevel)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Key Nutrient Bar Chart */}
      {keyNutrientChart && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-4 border-2 border-stone-300 dark:border-stone-700 shadow-xs space-y-3.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-800 dark:text-emerald-400" />
              <h2 className="text-base font-extrabold text-stone-950 dark:text-white">
                Key nutrient: {formatNutrientDisplayName(keyNutrientChart.rule.nutrient)}
              </h2>
            </div>
            <p className="text-xs text-stone-700 dark:text-stone-300">
              {formatConditionName(keyNutrientChart.rule.condition)} thresholds
              {hasDraftRules ? ' · Draft guidance' : ''}
            </p>
          </div>

          {userRelevantRules.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {userRelevantRules.map(rule => {
                const isActive = rule.id === keyNutrientChart.rule.id;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => setSelectedRuleId(rule.id)}
                    className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border-2 ${
                      isActive
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-950 dark:text-white border-stone-300 dark:border-stone-700'
                    }`}
                  >
                    {formatNutrientDisplayName(rule.nutrient)} ({rule.condition === 'ckd' ? 'CKD' : formatConditionName(rule.condition)})
                  </button>
                );
              })}
            </div>
          )}

          {/* Threshold Legend */}
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums bg-stone-50 dark:bg-stone-800 p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 flex-wrap">
            <span className="inline-flex items-center gap-1 text-emerald-900 dark:text-emerald-200 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Suitable &lt; {keyNutrientChart.rule.moderateAbove}{keyNutrientChart.rule.unit}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-amber-900 dark:text-amber-200 font-bold">
              <AlertCircle className="w-4 h-4" />
              <span>Moderate ≥ {keyNutrientChart.rule.moderateAbove}{keyNutrientChart.rule.unit}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-red-900 dark:text-red-200 font-bold">
              <XCircle className="w-4 h-4" />
              <span>Limit ≥ {keyNutrientChart.rule.limitAbove}{keyNutrientChart.rule.unit}</span>
            </span>
          </div>

          {keyNutrientChart.entries.length === 0 ? (
            <p className="text-sm text-stone-700 dark:text-stone-300 py-3 text-center">
              No foods available in this tab to chart.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto pr-1 space-y-2.5">
              {keyNutrientChart.entries.map(({ food, value, level }) => {
                const barPct = Math.max(2, Math.min(100, (value / keyNutrientChart.maxScale) * 100));
                const barColor =
                  level === 'limit'
                    ? 'bg-red-600'
                    : level === 'moderate'
                    ? 'bg-amber-500'
                    : 'bg-emerald-700';

                return (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => onSelectFood(food)}
                    className="w-full min-h-[44px] text-left block space-y-1 hover:bg-stone-50 dark:hover:bg-stone-800/50 rounded-xl p-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs sm:text-sm flex-wrap">
                      <span className="font-bold text-stone-950 dark:text-white">
                        {food.name}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-stone-900 dark:text-stone-100 inline-flex items-center gap-1">
                        {level === 'limit' ? (
                          <XCircle className="w-4 h-4 text-red-700 dark:text-red-300" />
                        ) : level === 'moderate' ? (
                          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-300" />
                        )}
                        <span>
                          {value}{keyNutrientChart.rule.unit} ({level === 'limit' ? 'Limit' : level === 'moderate' ? 'Moderate' : 'Suitable'})
                        </span>
                      </span>
                    </div>

                    <div className="relative h-3 w-full rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-amber-600 z-10 pointer-events-none"
                        style={{ left: `${keyNutrientChart.moderatePct}%` }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-red-800 z-10 pointer-events-none"
                        style={{ left: `${keyNutrientChart.limitPct}%` }}
                      />
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
