import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Check,
  CalendarDays,
  CalendarRange,
  X,
  Search,
  Lock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { DailyPlan, FoodItem, MealSlotType, PlannedFoodItem, RatingRule, TabType } from '../types';
import { evaluateFood, getPlainRatingLabel } from '../lib/ratingEngine';
import { formatServingText } from '../lib/sampleFoods';
import {
  getTodayLocalDate,
  parseLocalDate,
  formatLocalDate,
  addDaysLocal,
  addMonthsLocal,
  getMondayOfWeekLocal,
  formatLocalTimestamp,
  formatDailyHeading,
} from '../lib/dateUtils';

interface PlanViewProps {
  currentDate: string;
  onChangeDate: (date: string) => void;
  dailyPlan: DailyPlan | null;
  foods: FoodItem[];
  ratingRules: RatingRule[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onUpdatePlan: (plan: DailyPlan) => Promise<void>;
  onNavigateTab: (tab: TabType) => void;
  onOpenFoodCatalog: () => void;
  onSelectFood?: (food: FoodItem) => void;
}

type PlanViewMode = 'daily' | 'weekly' | 'monthly';

export const PlanView: React.FC<PlanViewProps> = ({
  currentDate,
  onChangeDate,
  dailyPlan,
  foods,
  ratingRules,
  loading = false,
  error = null,
  onRetry,
  onUpdatePlan,
  onSelectFood,
}) => {
  const { user, profile } = useAuth();
  const [viewMode, setViewMode] = useState<PlanViewMode>('daily');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Quick food picker modal for adding to slot directly in Daily view
  const [quickPickerSlot, setQuickPickerSlot] = useState<MealSlotType | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerPortion, setPickerPortion] = useState<number>(1);

  // All plans map for Weekly & Monthly views: { 'YYYY-MM-DD': DailyPlan }
  const [allPlansMap, setAllPlansMap] = useState<Record<string, DailyPlan>>({});
  const [plansLoading, setPlansLoading] = useState<boolean>(true);

  const todayStr = getTodayLocalDate();
  const isPastDay = currentDate < todayStr;

  const targets = profile?.targets || {
    carbs: 180,
    protein: 60,
    sodium: 2000,
    potassium: 2500,
    fiber: 30,
  };

  // Real-time listener for all user plans
  useEffect(() => {
    if (!user) {
      setAllPlansMap({});
      setPlansLoading(false);
      return;
    }

    setPlansLoading(true);
    const path = `users/${user.uid}/plans`;
    const plansColl = collection(db, 'users', user.uid, 'plans');

    const unsubscribe = onSnapshot(
      plansColl,
      snapshot => {
        const map: Record<string, DailyPlan> = {};
        snapshot.forEach(docSnap => {
          map[docSnap.id] = { id: docSnap.id, ...(docSnap.data() as any) };
        });
        setAllPlansMap(map);
        setPlansLoading(false);
      },
      err => {
        console.error('Error listening to plans collection:', path, err);
        setPlansLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Active day's plan (combines realtime map with prop fallback)
  const activePlan: DailyPlan = allPlansMap[currentDate] || dailyPlan || {
    id: currentDate,
    date: currentDate,
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };

  const breakfast = Array.isArray(activePlan.breakfast) ? activePlan.breakfast : [];
  const lunch = Array.isArray(activePlan.lunch) ? activePlan.lunch : [];
  const dinner = Array.isArray(activePlan.dinner) ? activePlan.dinner : [];
  const snacks = Array.isArray(activePlan.snacks) ? activePlan.snacks : [];
  const allItems = [...breakfast, ...lunch, ...dinner, ...snacks];

  const totalKcal = allItems.reduce((acc, it) => acc + (Number(it?.kcal) || 0), 0);
  const totalCarbs = allItems.reduce((acc, it) => acc + (Number(it?.carbs) || 0), 0);
  const totalProtein = allItems.reduce((acc, it) => acc + (Number(it?.protein) || 0), 0);
  const totalSodium = allItems.reduce((acc, it) => acc + (Number(it?.sodium) || 0), 0);
  const totalPotassium = allItems.reduce((acc, it) => acc + (Number(it?.potassium) || 0), 0);
  const totalFiber = allItems.reduce((acc, it) => acc + (typeof it?.fiber === 'number' ? it.fiber : 0), 0);

  const foodLookup = useMemo(() => {
    const map = new Map<string, FoodItem>();
    foods.forEach(f => map.set(f.id, f));
    return map;
  }, [foods]);

  const hasUnknownTrackedNutrient = (
    nutrient: 'carbs' | 'protein' | 'sodium' | 'potassium' | 'fiber'
  ) =>
    allItems.some(it => {
      if (it?.[nutrient] === null || it?.[nutrient] === undefined) return true;
      const liveFood = foodLookup.get(it.foodId);
      if (liveFood && (liveFood[nutrient] === null || liveFood[nutrient] === undefined)) {
        return true;
      }
      return false;
    });

  // Suitable foods for user conditions & diet type (excludes unknown)
  const suitableFoods = useMemo(() => {
    const conditions = profile?.conditions || [];
    const isVeg = profile?.dietType === 'veg';
    return foods.filter(f => {
      if (isVeg && !f.isVeg) return false;
      const ev = evaluateFood(f, conditions, ratingRules);
      return ev.overallLevel === 'favorable';
    });
  }, [foods, profile, ratingRules]);

  // Helper to turn FoodItem into PlannedFoodItem
  const makePlannedItem = (food: FoodItem, quantity: number = 1): PlannedFoodItem => ({
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
    fiber:
      food.fiber !== null && food.fiber !== undefined
        ? Math.round(food.fiber * quantity * 10) / 10
        : null,
    isVeg: food.isVeg,
  });

  const pickSuitableForSlot = (slot: MealSlotType, excludeIds: Set<string>): FoodItem => {
    if (suitableFoods.length === 0) {
      throw new Error('No Suitable foods available for your active conditions.');
    }

    let keywords: string[] = [];
    if (slot === 'breakfast') keywords = ['bread', 'roti', 'grain', 'cereal', 'fruit', 'breakfast', 'poha', 'idli', 'upma'];
    else if (slot === 'lunch') keywords = ['dal', 'pulse', 'vegetable', 'rice', 'sabzi', 'curry', 'khichdi', 'meal'];
    else if (slot === 'dinner') keywords = ['bread', 'roti', 'vegetable', 'dal', 'soup', 'salad', 'sabzi'];
    else keywords = ['snack', 'dairy', 'curd', 'fruit', 'drink', 'tea', 'chutney', 'raita'];

    const categoryMatches = suitableFoods.filter(
      f =>
        !excludeIds.has(f.id) &&
        (keywords.some(k => f.category.toLowerCase().includes(k)) ||
          keywords.some(k => (f.type || '').toLowerCase().includes(k)))
    );
    if (categoryMatches.length > 0) {
      return categoryMatches[Math.floor(Math.random() * categoryMatches.length)];
    }

    const notExcluded = suitableFoods.filter(f => !excludeIds.has(f.id));
    if (notExcluded.length > 0) {
      return notExcluded[Math.floor(Math.random() * notExcluded.length)];
    }

    return suitableFoods[Math.floor(Math.random() * suitableFoods.length)];
  };

  // ==========================================
  // 1. DAILY HANDLERS
  // ==========================================
  const handleSuggestMyDay = async () => {
    if (!user || isPastDay) return;
    setUpdating(true);
    setUpdateError(null);
    setNoticeMsg(null);

    try {
      if (suitableFoods.length === 0) {
        setUpdateError('No foods in the database are currently rated as fully Suitable for your active conditions.');
        return;
      }

      const isBreakfastEmpty = breakfast.length === 0;
      const isLunchEmpty = lunch.length === 0;
      const isDinnerEmpty = dinner.length === 0;
      const isSnacksEmpty = snacks.length === 0;

      if (!isBreakfastEmpty && !isLunchEmpty && !isDinnerEmpty && !isSnacksEmpty) {
        setNoticeMsg('All meal slots already contain items. Your manual items were preserved.');
        setTimeout(() => setNoticeMsg(null), 3000);
        return;
      }

      const usedIds = new Set<string>();
      allItems.forEach(it => usedIds.add(it.foodId));

      const updatedBreakfast = isBreakfastEmpty
        ? [makePlannedItem(pickSuitableForSlot('breakfast', usedIds))]
        : breakfast;
      if (isBreakfastEmpty && updatedBreakfast.length > 0) usedIds.add(updatedBreakfast[0].foodId);

      const updatedLunch = isLunchEmpty
        ? [makePlannedItem(pickSuitableForSlot('lunch', usedIds))]
        : lunch;
      if (isLunchEmpty && updatedLunch.length > 0) usedIds.add(updatedLunch[0].foodId);

      const updatedDinner = isDinnerEmpty
        ? [makePlannedItem(pickSuitableForSlot('dinner', usedIds))]
        : dinner;
      if (isDinnerEmpty && updatedDinner.length > 0) usedIds.add(updatedDinner[0].foodId);

      const updatedSnacks = isSnacksEmpty
        ? [makePlannedItem(pickSuitableForSlot('snacks', usedIds))]
        : snacks;

      const updatedPlan: DailyPlan = {
        ...activePlan,
        id: currentDate,
        date: currentDate,
        breakfast: updatedBreakfast,
        lunch: updatedLunch,
        dinner: updatedDinner,
        snacks: updatedSnacks,
        updatedAt: formatLocalTimestamp(),
      };

      await onUpdatePlan(updatedPlan);
      setNoticeMsg('Filled empty slots with Suitable foods at 1x portion. Manual items were preserved.');
      setTimeout(() => setNoticeMsg(null), 3500);
    } catch (err) {
      setUpdateError('Failed to suggest day meal plan.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSwapItem = async (slot: MealSlotType, index: number, currentItem: PlannedFoodItem) => {
    if (!user || isPastDay) return;
    setUpdating(true);
    setUpdateError(null);

    try {
      const candidates = suitableFoods.filter(f => f.id !== currentItem.foodId);
      if (candidates.length === 0) {
        setUpdateError('No alternative Suitable food available to swap.');
        return;
      }

      const newFood = candidates[Math.floor(Math.random() * candidates.length)];
      const swappedItem = makePlannedItem(newFood, currentItem.quantity || 1);

      const currentSlotItems = Array.isArray(activePlan[slot]) ? [...activePlan[slot]] : [];
      currentSlotItems[index] = swappedItem;

      const updatedPlan: DailyPlan = {
        ...activePlan,
        id: currentDate,
        date: currentDate,
        [slot]: currentSlotItems,
        updatedAt: formatLocalTimestamp(),
      };

      await onUpdatePlan(updatedPlan);
      setNoticeMsg(`Swapped for Suitable food: ${newFood.name}`);
      setTimeout(() => setNoticeMsg(null), 3000);
    } catch (err) {
      setUpdateError('Failed to swap food item.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveItem = async (slot: MealSlotType, index: number) => {
    if (!user || isPastDay) return;
    setUpdating(true);
    setUpdateError(null);
    const updatedSlot = Array.isArray(activePlan[slot]) ? [...activePlan[slot]] : [];
    updatedSlot.splice(index, 1);

    const updatedPlan: DailyPlan = {
      ...activePlan,
      id: currentDate,
      date: currentDate,
      [slot]: updatedSlot,
      updatedAt: formatLocalTimestamp(),
    };

    try {
      await onUpdatePlan(updatedPlan);
    } catch (err) {
      setUpdateError('Failed to remove item.');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateQuantity = async (slot: MealSlotType, index: number, newMultiplier: number) => {
    if (!user || isPastDay) return;
    setUpdating(true);
    setUpdateError(null);
    const currentSlotItems = Array.isArray(activePlan[slot]) ? activePlan[slot] : [];
    const item = currentSlotItems[index];
    if (!item) {
      setUpdating(false);
      return;
    }
    const baseQuantity = item.quantity || 1;
    const ratio = newMultiplier / baseQuantity;

    const updatedItem: PlannedFoodItem = {
      ...item,
      quantity: newMultiplier,
      kcal: Math.round(item.kcal * ratio),
      carbs: Math.round(item.carbs * ratio * 10) / 10,
      protein: Math.round(item.protein * ratio * 10) / 10,
      sodium: Math.round(item.sodium * ratio),
      potassium: Math.round(item.potassium * ratio),
      fiber:
        typeof item.fiber === 'number'
          ? Math.round(item.fiber * ratio * 10) / 10
          : null,
    };

    const updatedSlot = [...currentSlotItems];
    updatedSlot[index] = updatedItem;

    const updatedPlan: DailyPlan = {
      ...activePlan,
      id: currentDate,
      date: currentDate,
      [slot]: updatedSlot,
      updatedAt: formatLocalTimestamp(),
    };

    try {
      await onUpdatePlan(updatedPlan);
    } catch (err) {
      setUpdateError('Failed to update portion size.');
    } finally {
      setUpdating(false);
    }
  };

  const handleAddFoodToSlot = async (food: FoodItem) => {
    if (!user || !quickPickerSlot || isPastDay) return;
    setUpdating(true);
    setUpdateError(null);

    const plannedItem = makePlannedItem(food, pickerPortion);
    const currentSlotItems = Array.isArray(activePlan[quickPickerSlot]) ? activePlan[quickPickerSlot] : [];
    const updatedSlot = [...currentSlotItems, plannedItem];

    const updatedPlan: DailyPlan = {
      ...activePlan,
      id: currentDate,
      date: currentDate,
      [quickPickerSlot]: updatedSlot,
      updatedAt: formatLocalTimestamp(),
    };

    try {
      await onUpdatePlan(updatedPlan);
      setQuickPickerSlot(null);
      setPickerSearch('');
      setPickerPortion(1);
      setNoticeMsg(`Added ${food.name} to ${quickPickerSlot}!`);
      setTimeout(() => setNoticeMsg(null), 3000);
    } catch (err) {
      setUpdateError('Failed to add food to slot.');
    } finally {
      setUpdating(false);
    }
  };

  // ==========================================
  // 2. WEEKLY CHART HELPERS & "SUGGEST MY WEEK"
  // ==========================================
  // Monday to Sunday containing the shared selected date (currentDate)
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeekLocal(currentDate);

    const pillColors = [
      'bg-amber-500 text-white', // MON
      'bg-lime-700 text-white',  // TUE
      'bg-rose-500 text-white',  // WED
      'bg-teal-600 text-white',  // THU
      'bg-amber-600 text-white', // FRI
      'bg-emerald-700 text-white', // SAT
      'bg-red-500 text-white',   // SUN
    ];

    const days = [];
    const shortNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const dateStr = formatLocalDate(d);
      days.push({
        date: dateStr,
        dayShort: shortNames[i],
        pillColor: pillColors[i],
        dayNum: d.getDate(),
        monthShort: d.toLocaleDateString(undefined, { month: 'short' }),
        isPast: dateStr < todayStr,
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [currentDate, todayStr]);

  const isEntireWeekPast = weekDays[6].date < todayStr;

  // Carb target distribution calculated from user's daily carb target
  const carbPerMeal = useMemo(() => {
    const dailyCarb = targets.carbs || 180;
    return {
      breakfast: Math.round(dailyCarb * 0.25),
      lunch: Math.round(dailyCarb * 0.35),
      snacks: Math.round(dailyCarb * 0.10),
      dinner: Math.round(dailyCarb * 0.30),
    };
  }, [targets.carbs]);

  // Suggest My Week Handler: fills ONLY empty cells from today onward with Suitable foods, avoiding consecutive-day duplicates
  const handleSuggestMyWeek = async () => {
    if (!user || isEntireWeekPast) return;
    setUpdating(true);
    setUpdateError(null);
    setNoticeMsg(null);

    try {
      if (suitableFoods.length === 0) {
        setUpdateError('No Suitable foods available to suggest for the week.');
        return;
      }

      const batch = writeBatch(db);
      let previousDayFoodIds = new Set<string>();

      // Check the Sunday before Monday if it exists
      const prevSunStr = addDaysLocal(weekDays[0].date, -1);
      if (allPlansMap[prevSunStr]) {
        const prevPlan = allPlansMap[prevSunStr];
        const prevItems = [
          ...(Array.isArray(prevPlan.breakfast) ? prevPlan.breakfast : []),
          ...(Array.isArray(prevPlan.lunch) ? prevPlan.lunch : []),
          ...(Array.isArray(prevPlan.dinner) ? prevPlan.dinner : []),
          ...(Array.isArray(prevPlan.snacks) ? prevPlan.snacks : []),
        ];
        prevItems.forEach(it => previousDayFoodIds.add(it.foodId));
      }

      let updatedDaysCount = 0;

      for (const day of weekDays) {
        const existingPlan = allPlansMap[day.date] || {
          id: day.date,
          date: day.date,
          breakfast: [],
          lunch: [],
          dinner: [],
          snacks: [],
        };

        const existingBf = Array.isArray(existingPlan.breakfast) ? existingPlan.breakfast : [];
        const existingLunch = Array.isArray(existingPlan.lunch) ? existingPlan.lunch : [];
        const existingDinner = Array.isArray(existingPlan.dinner) ? existingPlan.dinner : [];
        const existingSnacks = Array.isArray(existingPlan.snacks) ? existingPlan.snacks : [];

        const currentDayFoodIds = new Set<string>();
        [...existingBf, ...existingLunch, ...existingDinner, ...existingSnacks].forEach(it =>
          currentDayFoodIds.add(it.foodId)
        );

        // Skip past days (fill only from today onward)
        if (day.date < todayStr) {
          previousDayFoodIds = currentDayFoodIds;
          continue;
        }

        const isBfEmpty = existingBf.length === 0;
        const isLunchEmpty = existingLunch.length === 0;
        const isDinnerEmpty = existingDinner.length === 0;
        const isSnacksEmpty = existingSnacks.length === 0;

        // Combined exclusion set: items from previous day + items already picked today
        const excludeForToday = new Set<string>([...previousDayFoodIds, ...currentDayFoodIds]);

        let changed = false;

        const updatedBreakfast = isBfEmpty
          ? (() => {
              const f = pickSuitableForSlot('breakfast', excludeForToday);
              excludeForToday.add(f.id);
              currentDayFoodIds.add(f.id);
              changed = true;
              return [makePlannedItem(f, 1)];
            })()
          : existingBf;

        const updatedLunch = isLunchEmpty
          ? (() => {
              const f = pickSuitableForSlot('lunch', excludeForToday);
              excludeForToday.add(f.id);
              currentDayFoodIds.add(f.id);
              changed = true;
              return [makePlannedItem(f, 1)];
            })()
          : existingLunch;

        const updatedSnacks = isSnacksEmpty
          ? (() => {
              const f = pickSuitableForSlot('snacks', excludeForToday);
              excludeForToday.add(f.id);
              currentDayFoodIds.add(f.id);
              changed = true;
              return [makePlannedItem(f, 1)];
            })()
          : existingSnacks;

        const updatedDinner = isDinnerEmpty
          ? (() => {
              const f = pickSuitableForSlot('dinner', excludeForToday);
              excludeForToday.add(f.id);
              currentDayFoodIds.add(f.id);
              changed = true;
              return [makePlannedItem(f, 1)];
            })()
          : existingDinner;

        if (changed) {
          const newDayPlan: DailyPlan = {
            ...existingPlan,
            id: day.date,
            date: day.date,
            breakfast: updatedBreakfast,
            lunch: updatedLunch,
            dinner: updatedDinner,
            snacks: updatedSnacks,
            updatedAt: formatLocalTimestamp(),
          };

          const planRef = doc(db, 'users', user.uid, 'plans', day.date);
          batch.set(planRef, newDayPlan, { merge: true });
          updatedDaysCount++;
        }

        previousDayFoodIds = currentDayFoodIds;
      }

      if (updatedDaysCount > 0) {
        await batch.commit();
        setNoticeMsg('Filled empty cells from today onward with Suitable foods, avoiding consecutive-day duplicates.');
      } else {
        setNoticeMsg('All eligible cells from today onward already have meals. Manual items were preserved.');
      }
      setTimeout(() => setNoticeMsg(null), 3500);
    } catch (err) {
      setUpdateError('Failed to suggest week meal plan.');
    } finally {
      setUpdating(false);
    }
  };

  // ==========================================
  // 3. MONTHLY CALENDAR HELPERS (Weeks start on Monday, shared currentDate)
  // ==========================================
  const monthData = useMemo(() => {
    const selectedObj = parseLocalDate(currentDate);
    const year = selectedObj.getFullYear();
    const month = selectedObj.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-start offset: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    const startingOffset = (firstDay.getDay() + 6) % 7;

    const monthName = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const days = [];
    for (let i = 0; i < startingOffset; i++) {
      days.push({ dayNumber: null, dateStr: null });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatLocalDate(new Date(year, month, d));
      days.push({ dayNumber: d, dateStr });
    }

    return { monthName, days };
  }, [currentDate]);

  // Dot color logic: green (all targets met), amber (1 exceeded), red (2+ exceeded), grey (empty)
  const getDayDotStatus = (dateStr: string) => {
    const plan = allPlansMap[dateStr];
    if (!plan) return 'grey';

    const items = [
      ...(Array.isArray(plan.breakfast) ? plan.breakfast : []),
      ...(Array.isArray(plan.lunch) ? plan.lunch : []),
      ...(Array.isArray(plan.dinner) ? plan.dinner : []),
      ...(Array.isArray(plan.snacks) ? plan.snacks : []),
    ];
    if (items.length === 0) return 'grey';

    const dayCarbs = items.reduce((acc, it) => acc + (Number(it?.carbs) || 0), 0);
    const daySodium = items.reduce((acc, it) => acc + (Number(it?.sodium) || 0), 0);
    const dayPotassium = items.reduce((acc, it) => acc + (Number(it?.potassium) || 0), 0);

    let exceededCount = 0;
    if (dayCarbs > targets.carbs) exceededCount++;
    if (daySodium > targets.sodium) exceededCount++;
    if (dayPotassium > targets.potassium) exceededCount++;

    if (exceededCount === 0) return 'green';
    if (exceededCount === 1) return 'amber';
    return 'red';
  };

  const handlePrevMonth = () => {
    onChangeDate(addMonthsLocal(currentDate, -1));
  };

  const handleNextMonth = () => {
    onChangeDate(addMonthsLocal(currentDate, 1));
  };

  // Prev / Next day switcher for Daily view (no upper limit)
  const handlePrevDay = () => {
    onChangeDate(addDaysLocal(currentDate, -1));
  };

  const handleNextDay = () => {
    onChangeDate(addDaysLocal(currentDate, 1));
  };

  // Prev / Next week switcher
  const handlePrevWeek = () => {
    onChangeDate(addDaysLocal(currentDate, -7));
  };

  const handleNextWeek = () => {
    onChangeDate(addDaysLocal(currentDate, 7));
  };

  const handleJumpToToday = () => {
    onChangeDate(getTodayLocalDate());
  };

  // Filter foods for quick picker (declared before early returns)
  const filteredPickerFoods = useMemo(() => {
    if (!quickPickerSlot) return [];
    const q = pickerSearch.trim().toLowerCase();
    const isVeg = profile?.dietType === 'veg';

    return foods.filter(food => {
      if (isVeg && !food.isVeg) return false;
      if (q) {
        return food.name.toLowerCase().includes(q) || food.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [foods, quickPickerSlot, pickerSearch, profile]);

  // Loading state
  if (loading || plansLoading) {
    return (
      <div className="pb-28 max-w-lg mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-stone-500 font-medium">Loading diet chart...</p>
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
            <h3 className="text-sm font-bold text-red-900 dark:text-red-200">Unable to load diet chart</h3>
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

  const handleOpenPlannedFood = (item: PlannedFoodItem) => {
    if (!onSelectFood) return;
    const found = foods.find(f => f.id === item.foodId);
    if (found) {
      onSelectFood(found);
      return;
    }
    const mult = item.quantity || 1;
    onSelectFood({
      id: item.foodId,
      name: item.foodName,
      category: 'Planned Food',
      servingLabel: item.servingLabel,
      servingGrams: item.servingGrams,
      kcal: Math.round(item.kcal / mult),
      carbs: Math.round((item.carbs / mult) * 10) / 10,
      sugars: null,
      fiber:
        typeof item.fiber === 'number'
          ? Math.round((item.fiber / mult) * 10) / 10
          : null,
      protein: Math.round((item.protein / mult) * 10) / 10,
      sodium: Math.round(item.sodium / mult),
      potassium: Math.round(item.potassium / mult),
      phosphorus: 0,
      isVeg: item.isVeg,
      source: 'Diet Chart',
    });
  };

  // RENDER: Daily Meal Slot Card
  const renderDailySlotCard = (slot: MealSlotType, title: string, items: PlannedFoodItem[]) => {
    const slotKcal = items.reduce((acc, it) => acc + (Number(it?.kcal) || 0), 0);

    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border-2 border-stone-300 dark:border-stone-700 shadow-sm transition-all">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-stone-800 flex-wrap">
          <div>
            <h3 className="text-base font-extrabold text-stone-950 dark:text-white">
              {title}
            </h3>
            <p className="text-xs text-stone-700 dark:text-stone-300 font-mono mt-0.5">
              {items.length} {items.length === 1 ? 'item' : 'items'} · <strong className="text-stone-950 dark:text-white">{slotKcal} kcal</strong>
            </p>
          </div>

          {!isPastDay && (
            <button
              type="button"
              onClick={() => {
                setQuickPickerSlot(slot);
                setPickerSearch('');
                setPickerPortion(1);
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900 text-emerald-950 dark:text-emerald-200 border border-emerald-700/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-5 text-center space-y-2.5">
            <p className="text-sm text-stone-700 dark:text-stone-300">No foods added for {title.toLowerCase()}.</p>
            {!isPastDay && (
              <button
                type="button"
                onClick={() => {
                  setQuickPickerSlot(slot);
                  setPickerSearch('');
                  setPickerPortion(1);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-dashed border-stone-400 dark:border-stone-600 text-stone-900 dark:text-stone-100 hover:border-emerald-700 text-xs font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Choose a food for {title}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-stone-200 dark:divide-stone-800 mt-1">
            {items.map((item, idx) => (
              <div key={`${item.foodId}-${idx}`} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => handleOpenPlannedFood(item)}
                  className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                >
                  <h4 className="text-sm font-bold text-stone-950 dark:text-white underline decoration-stone-300 dark:decoration-stone-700 underline-offset-4">
                    {item.foodName}
                  </h4>

                  <p className="text-xs text-stone-700 dark:text-stone-300 font-mono mt-0.5">
                    {item.quantity}x ({formatServingText(item.servingLabel, item.servingGrams)}) · <strong className="text-emerald-900 dark:text-emerald-300">{item.kcal} kcal</strong>
                  </p>
                </button>

                {!isPastDay && (
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleSwapItem(slot, idx, item)}
                      disabled={updating}
                      className="p-2 rounded-xl text-stone-500 hover:text-emerald-700 bg-stone-50 hover:bg-emerald-50 dark:bg-stone-800 dark:hover:bg-emerald-950/40 transition-colors flex items-center gap-1 text-[11px] font-semibold"
                      title="Swap with another Suitable food"
                      aria-label="Swap food"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Swap</span>
                    </button>

                    <select
                      value={item.quantity}
                      onChange={e => handleUpdateQuantity(slot, idx, parseFloat(e.target.value))}
                      disabled={updating}
                      className="text-xs font-mono font-semibold px-2 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 focus:outline-none"
                      aria-label="Portion size"
                    >
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1.0x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2.0x</option>
                      <option value={3}>3.0x</option>
                    </select>

                    <button
                      onClick={() => handleRemoveItem(slot, idx)}
                      disabled={updating}
                      className="p-2 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const dailyHeadingLabel = formatDailyHeading(currentDate, todayStr);
  const fullLocalDateSubtitle = parseLocalDate(currentDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="pb-28 max-w-lg mx-auto px-4 pt-3 space-y-4">
      {/* Page Title */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 dark:text-stone-100">
            Diet Chart
          </h1>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Personalized meal planning tailored to your active conditions & targets
          </p>
        </div>
        <button
          type="button"
          onClick={handleJumpToToday}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
            currentDate !== todayStr
              ? 'bg-emerald-800 hover:bg-emerald-700 text-white shadow-xs'
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
          }`}
        >
          Today
        </button>
      </div>

      {/* 1. Daily / Weekly / Monthly Toggle */}
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200/80 dark:border-stone-700/80">
        <button
          type="button"
          onClick={() => setViewMode('daily')}
          className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            viewMode === 'daily'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 hover:bg-stone-200/50 dark:hover:bg-stone-700/50'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Daily</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('weekly')}
          className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            viewMode === 'weekly'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 hover:bg-stone-200/50 dark:hover:bg-stone-700/50'
          }`}
        >
          <CalendarRange className="w-3.5 h-3.5" />
          <span>Weekly</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('monthly')}
          className={`py-2 px-2 text-center rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            viewMode === 'monthly'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 hover:bg-stone-200/50 dark:hover:bg-stone-700/50'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>Monthly</span>
        </button>
      </div>

      {noticeMsg && (
        <div className="p-3 rounded-2xl bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-md animate-in fade-in duration-200">
          <Check className="w-4 h-4 shrink-0" />
          <span>{noticeMsg}</span>
        </div>
      )}

      {updateError && (
        <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{updateError}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. DAILY VIEW (Default)                                   */}
      {/* ========================================================= */}
      {viewMode === 'daily' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Date Header Switcher */}
          <div className="flex items-center justify-between bg-white dark:bg-stone-900 rounded-2xl p-3 border border-stone-200 dark:border-stone-800 shadow-xs">
            <button
              type="button"
              onClick={handlePrevDay}
              className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <span className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                {dailyHeadingLabel}
              </span>
              <span className="text-[11px] text-stone-500 font-medium">
                {fullLocalDateSubtitle}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextDay}
              className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Past Day View-Only Banner OR Suggest My Day Banner */}
          {isPastDay ? (
            <div className="p-3.5 rounded-2xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 flex items-center justify-between gap-2 text-xs text-stone-700 dark:text-stone-300">
              <div className="flex items-center gap-2 font-semibold">
                <Lock className="w-4 h-4 text-stone-500 shrink-0" />
                <span>Past day, view only</span>
              </div>
              <button
                type="button"
                onClick={handleJumpToToday}
                className="px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
              >
                Today
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-800 to-emerald-950 text-white shadow-md flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span>Suggest My Day</span>
                </h3>
                <p className="text-[11px] text-emerald-200 mt-0.5">
                  Fills only empty slots with Suitable foods for your profile (1x portion). Never touches your manual items.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSuggestMyDay}
                disabled={updating}
                className="py-2.5 px-3.5 rounded-xl bg-white text-emerald-950 font-bold text-xs hover:bg-emerald-50 transition-all shadow-sm shrink-0 active:scale-[0.99] disabled:opacity-50"
              >
                {updating ? 'Suggesting...' : 'Suggest my day'}
              </button>
            </div>
          )}

          {/* Nutrient Progress Bars on Top */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs uppercase font-bold tracking-wider text-stone-500">
                  Nutrient Progress Bars
                </h3>
                <span className="text-[10px] text-stone-400">
                  Starting defaults - confirm with your care team
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-400">
                {totalKcal} kcal total
              </span>
            </div>

            {/* Carbs */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-stone-700 dark:text-stone-300">Carbohydrates</span>
                <span className="font-mono tabular-nums text-stone-500">
                  <strong className="text-stone-900 dark:text-stone-100">{Math.round(totalCarbs)}g</strong> / {targets.carbs}g
                </span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalCarbs > targets.carbs ? 'bg-amber-500' : 'bg-emerald-600'
                  }`}
                  style={{ width: `${Math.min(100, (totalCarbs / Math.max(targets.carbs, 1)) * 100)}%` }}
                />
              </div>
              {hasUnknownTrackedNutrient('carbs') && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mt-1">
                  some values unknown
                </p>
              )}
            </div>

            {/* Sodium */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-stone-700 dark:text-stone-300">Sodium (Salt)</span>
                <span className="font-mono tabular-nums text-stone-500">
                  <strong className="text-stone-900 dark:text-stone-100">{Math.round(totalSodium)}mg</strong> / {targets.sodium}mg max
                </span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalSodium > targets.sodium ? 'bg-red-500' : 'bg-emerald-600'
                  }`}
                  style={{ width: `${Math.min(100, (totalSodium / Math.max(targets.sodium, 1)) * 100)}%` }}
                />
              </div>
              {hasUnknownTrackedNutrient('sodium') && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mt-1">
                  some values unknown
                </p>
              )}
            </div>

            {/* Potassium */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-stone-700 dark:text-stone-300">Potassium</span>
                <span className="font-mono tabular-nums text-stone-500">
                  <strong className="text-stone-900 dark:text-stone-100">{Math.round(totalPotassium)}mg</strong> / {targets.potassium}mg
                </span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalPotassium > targets.potassium ? 'bg-amber-500' : 'bg-emerald-600'
                  }`}
                  style={{ width: `${Math.min(100, (totalPotassium / Math.max(targets.potassium, 1)) * 100)}%` }}
                />
              </div>
              {hasUnknownTrackedNutrient('potassium') && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mt-1">
                  some values unknown
                </p>
              )}
            </div>

            {/* Protein & Fiber row */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 text-xs">
                <span className="text-[10px] text-stone-500 font-medium">Protein</span>
                <p className="font-bold font-mono text-stone-900 dark:text-stone-100 mt-0.5">
                  {Math.round(totalProtein)}g <span className="font-normal text-stone-500">/ {targets.protein}g</span>
                </p>
                {hasUnknownTrackedNutrient('protein') && (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mt-1">
                    some values unknown
                  </p>
                )}
              </div>
              <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 text-xs">
                <span className="text-[10px] text-stone-500 font-medium">Dietary Fiber</span>
                <p className="font-bold font-mono text-stone-900 dark:text-stone-100 mt-0.5">
                  {Math.round(totalFiber)}g <span className="font-normal text-stone-500">/ {targets.fiber}g</span>
                </p>
                {hasUnknownTrackedNutrient('fiber') && (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mt-1">
                    some values unknown
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* One Big Card Per Slot: Breakfast, Lunch, Snacks, Dinner */}
          <div className="space-y-4">
            {renderDailySlotCard('breakfast', 'Breakfast', breakfast)}
            {renderDailySlotCard('lunch', 'Lunch', lunch)}
            {renderDailySlotCard('snacks', 'Snacks', snacks)}
            {renderDailySlotCard('dinner', 'Dinner', dinner)}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. WEEKLY VIEW: Monday to Sunday                          */}
      {/* ========================================================= */}
      {viewMode === 'weekly' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Week Navigator */}
          <div className="flex items-center justify-between bg-white dark:bg-stone-900 rounded-2xl p-3 border border-stone-200 dark:border-stone-800 shadow-xs">
            <button
              type="button"
              onClick={handlePrevWeek}
              className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-400 block">
                Mon – Sun Weekly Chart
              </span>
              <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                {weekDays[0].monthShort} {weekDays[0].dayNum} – {weekDays[6].monthShort} {weekDays[6].dayNum}
              </span>
            </div>

            <button
              type="button"
              onClick={handleNextWeek}
              className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Next week"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* "Suggest my week" Banner OR Past Week View-Only */}
          {isEntireWeekPast ? (
            <div className="p-3.5 rounded-2xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 flex items-center justify-between gap-2 text-xs text-stone-700 dark:text-stone-300">
              <div className="flex items-center gap-2 font-semibold">
                <Lock className="w-4 h-4 text-stone-500 shrink-0" />
                <span>Past day, view only</span>
              </div>
              <button
                type="button"
                onClick={handleJumpToToday}
                className="px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors"
              >
                Today
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-800 to-emerald-950 text-white shadow-md flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                  <span>Suggest My Week</span>
                </h3>
                <p className="text-[11px] text-emerald-200 mt-0.5">
                  Fills empty cells from today onward with Suitable foods, avoiding consecutive-day duplicates.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSuggestMyWeek}
                disabled={updating}
                className="py-2.5 px-3.5 rounded-xl bg-white text-emerald-950 font-bold text-xs hover:bg-emerald-50 transition-all shadow-sm shrink-0 active:scale-[0.99] disabled:opacity-50"
              >
                {updating ? 'Suggesting...' : 'Suggest my week'}
              </button>
            </div>
          )}

          <p className="text-[11px] text-stone-500 italic px-1">
            Tap any day row to open that exact date in Daily view.
          </p>

          {/* 7-Row Chart (Mon-Sun) */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse min-w-[620px]">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-850/70">
                    <th className="py-3 px-3 text-[10px] font-bold uppercase tracking-wider text-stone-400 w-24">
                      Day
                    </th>
                    <th className="py-3 px-3 text-xs font-bold text-stone-900 dark:text-stone-100">
                      <div>Breakfast</div>
                      <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400 font-mono">
                        [{carbPerMeal.breakfast}g carb]
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs font-bold text-stone-900 dark:text-stone-100">
                      <div>Lunch</div>
                      <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400 font-mono">
                        [{carbPerMeal.lunch}g carb]
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs font-bold text-stone-900 dark:text-stone-100">
                      <div>Snacks</div>
                      <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400 font-mono">
                        [{carbPerMeal.snacks}g carb]
                      </span>
                    </th>
                    <th className="py-3 px-3 text-xs font-bold text-stone-900 dark:text-stone-100">
                      <div>Dinner</div>
                      <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400 font-mono">
                        [{carbPerMeal.dinner}g carb]
                      </span>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                  {weekDays.map(day => {
                    const dayPlan = allPlansMap[day.date];
                    const isSelected = day.date === currentDate;
                    const bf = Array.isArray(dayPlan?.breakfast) ? dayPlan.breakfast : [];
                    const ln = Array.isArray(dayPlan?.lunch) ? dayPlan.lunch : [];
                    const sn = Array.isArray(dayPlan?.snacks) ? dayPlan.snacks : [];
                    const dn = Array.isArray(dayPlan?.dinner) ? dayPlan.dinner : [];

                    return (
                      <tr
                        key={day.date}
                        onClick={() => {
                          onChangeDate(day.date);
                          setViewMode('daily');
                        }}
                        className={`hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 cursor-pointer transition-colors ${
                          day.isToday
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                            : isSelected
                            ? 'bg-stone-100/70 dark:bg-stone-800/40'
                            : ''
                        } ${day.isPast ? 'opacity-75' : ''}`}
                      >
                        <td className="py-3 px-3 align-top">
                          <div className="flex flex-col items-center">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shadow-2xs text-center inline-block min-w-[54px] ${day.pillColor}`}
                            >
                              {day.dayShort}
                            </span>
                            <span className="text-[10px] text-stone-500 font-mono mt-1">
                              {day.dayNum} {day.monthShort}
                            </span>
                            {day.isToday && (
                              <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                                Today
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Breakfast Cell */}
                        <td className="py-3 px-3 align-top text-xs text-stone-700 dark:text-stone-300">
                          {bf.length === 0 ? (
                            <span className="text-stone-300 dark:text-stone-700 font-mono text-[11px]">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {bf.map((it, idx) => (
                                <li key={idx} className="leading-snug">
                                  <strong className="text-stone-900 dark:text-stone-100">{it.foodName}</strong>
                                  <span className="text-[10px] text-stone-500 block">
                                    {it.quantity}x ({formatServingText(it.servingLabel, it.servingGrams)})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>

                        {/* Lunch Cell */}
                        <td className="py-3 px-3 align-top text-xs text-stone-700 dark:text-stone-300">
                          {ln.length === 0 ? (
                            <span className="text-stone-300 dark:text-stone-700 font-mono text-[11px]">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {ln.map((it, idx) => (
                                <li key={idx} className="leading-snug">
                                  <strong className="text-stone-900 dark:text-stone-100">{it.foodName}</strong>
                                  <span className="text-[10px] text-stone-500 block">
                                    {it.quantity}x ({formatServingText(it.servingLabel, it.servingGrams)})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>

                        {/* Snacks Cell */}
                        <td className="py-3 px-3 align-top text-xs text-stone-700 dark:text-stone-300">
                          {sn.length === 0 ? (
                            <span className="text-stone-300 dark:text-stone-700 font-mono text-[11px]">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {sn.map((it, idx) => (
                                <li key={idx} className="leading-snug">
                                  <strong className="text-stone-900 dark:text-stone-100">{it.foodName}</strong>
                                  <span className="text-[10px] text-stone-500 block">
                                    {it.quantity}x ({formatServingText(it.servingLabel, it.servingGrams)})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>

                        {/* Dinner Cell */}
                        <td className="py-3 px-3 align-top text-xs text-stone-700 dark:text-stone-300">
                          {dn.length === 0 ? (
                            <span className="text-stone-300 dark:text-stone-700 font-mono text-[11px]">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {dn.map((it, idx) => (
                                <li key={idx} className="leading-snug">
                                  <strong className="text-stone-900 dark:text-stone-100">{it.foodName}</strong>
                                  <span className="text-[10px] text-stone-500 block">
                                    {it.quantity}x ({formatServingText(it.servingLabel, it.servingGrams)})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. MONTHLY VIEW: Weeks start on Monday, highlights today  */}
      {/* ========================================================= */}
      {viewMode === 'monthly' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Month Switcher */}
          <div className="flex items-center justify-between bg-white dark:bg-stone-900 rounded-2xl p-3 border border-stone-200 dark:border-stone-800 shadow-xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {monthData.monthName}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Calendar Grid Card (Weeks start on Monday) */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl p-4 sm:p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-3">
            {/* Day of Week Headers: Monday -> Sunday */}
            <div className="grid grid-cols-7 text-center">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                <span key={d} className="text-xs font-bold text-stone-800 dark:text-stone-200 py-1">
                  {d}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {monthData.days.map((item, idx) => {
                if (!item.dateStr) {
                  return <div key={`empty-${idx}`} className="min-h-[48px]" />;
                }

                const dotStatus = getDayDotStatus(item.dateStr);
                const isToday = item.dateStr === todayStr;
                const isSelected = item.dateStr === currentDate;

                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => {
                      onChangeDate(item.dateStr!);
                      setViewMode('daily');
                    }}
                    aria-label={`${item.dateStr}${
                      dotStatus === 'green'
                        ? ', All targets met'
                        : dotStatus === 'amber'
                        ? ', 1 target exceeded'
                        : dotStatus === 'red'
                        ? ', 2 or more targets exceeded'
                        : ''
                    }`}
                    className={`min-h-[48px] rounded-xl p-1 flex flex-col items-center justify-between transition-all border-2 relative ${
                      isToday
                        ? 'border-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 font-extrabold ring-2 ring-emerald-500/20'
                        : isSelected
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 font-bold'
                        : 'border-stone-300 dark:border-stone-700 hover:border-emerald-700 bg-stone-50 dark:bg-stone-850 text-stone-950 dark:text-stone-100'
                    }`}
                  >
                    <span className="text-xs font-bold leading-none pt-0.5">{item.dayNumber}</span>

                    <div className="mb-0.5 flex items-center justify-center">
                      {dotStatus === 'green' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                      )}
                      {dotStatus === 'amber' && (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                      )}
                      {dotStatus === 'red' && (
                        <XCircle className="w-3.5 h-3.5 text-red-700 dark:text-red-300" aria-hidden="true" />
                      )}
                      {dotStatus === 'grey' && (
                        <span className="text-xs leading-none text-stone-400" aria-hidden="true">–</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend with Icons + Words */}
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs text-stone-900 dark:text-stone-100 flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>All targets met</span>
              </span>
              <span className="inline-flex items-center gap-1 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>1 exceeded</span>
              </span>
              <span className="inline-flex items-center gap-1 font-semibold">
                <XCircle className="w-4 h-4 text-red-700" />
                <span>2+ exceeded</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* QUICK FOOD PICKER MODAL (Add to slot from Daily card)      */}
      {/* ========================================================= */}
      {quickPickerSlot && !isPastDay && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col border border-stone-200 dark:border-stone-800 shadow-2xl">
            <div className="p-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 capitalize">
                  Add to {quickPickerSlot}
                </h3>
                <p className="text-[11px] text-stone-500">
                  Select a food from the catalog for {currentDate}
                </p>
              </div>
              <button
                onClick={() => {
                  setQuickPickerSlot(null);
                  setPickerSearch('');
                }}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 border-b border-stone-100 dark:border-stone-800 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  autoFocus
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Search foods to add (e.g. roti, dal, sabzi)..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-medium text-stone-500">
                  Portion Multiplier:
                </span>
                <div className="flex items-center gap-1.5">
                  {[0.5, 1, 1.5, 2].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPickerPortion(p)}
                      className={`px-2 py-0.5 text-xs font-mono font-semibold rounded-md transition-colors ${
                        pickerPortion === p
                          ? 'bg-emerald-800 text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      {p}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredPickerFoods.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  No matching foods found in catalog.
                </div>
              ) : (
                filteredPickerFoods.map(food => {
                  const ev = evaluateFood(food, profile?.conditions || [], ratingRules);
                  const isFav = ev.overallLevel === 'favorable';
                  const isMod = ev.overallLevel === 'moderate';
                  const isUnk = ev.overallLevel === 'unknown';

                  return (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => handleAddFoodToSlot(food)}
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
                            : isUnk
                            ? 'bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-200'
                            : 'bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-200'
                        }`}
                      >
                        {isFav ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : isMod ? (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        ) : isUnk ? (
                          <HelpCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
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
