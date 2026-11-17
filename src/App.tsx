import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { AuthProvider, useAuth } from './context/AuthContext';
import { db } from './lib/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreErrors';
import { DEFAULT_DRAFT_RATING_RULES, SAMPLE_INDIAN_FOODS } from './lib/sampleFoods';
import { getTodayLocalDate, formatLocalTimestamp } from './lib/dateUtils';
import {
  FoodItem,
  RatingRule,
  DailyPlan,
  SavedFoodItem,
  TabType,
  MealSlotType,
  PlannedFoodItem,
} from './types';

import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LandingPage } from './components/LandingPage';
import { OnboardingWizard } from './components/OnboardingWizard';
import { FoodDetailModal } from './components/FoodDetailModal';
import { DisclaimerBanner } from './components/DisclaimerBanner';
import { ErrorBoundary } from './components/ErrorBoundary';

import { HomeView } from './views/HomeView';
import { FoodsView } from './views/FoodsView';
import { PlanView } from './views/PlanView';
import { SavedView } from './views/SavedView';
import { ProfileView } from './views/ProfileView';
import { AdminView } from './views/AdminView';
import { CompareView } from './views/CompareView';
import { MealView } from './views/MealView';
import { CanIEatView } from './views/CanIEatView';
import { DetailsView } from './views/DetailsView';

function AppContent() {
  const { user, profile, loading: authLoading, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [foodsLoading, setFoodsLoading] = useState<boolean>(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);

  const [ratingRules, setRatingRules] = useState<RatingRule[]>([]);
  const [savedFoods, setSavedFoods] = useState<SavedFoodItem[]>([]);
  const [savedLoading, setSavedLoading] = useState<boolean>(true);
  const [savedError, setSavedError] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState<string>(() => {
    return getTodayLocalDate();
  });
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState<boolean>(true);
  const [planError, setPlanError] = useState<string | null>(null);

  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [searchQueryForCheck, setSearchQueryForCheck] = useState<string>('');
  const [compareFood1, setCompareFood1] = useState<FoodItem | null>(null);
  const [compareFood2, setCompareFood2] = useState<FoodItem | null>(null);

  const handleStartCompare = (food: FoodItem) => {
    setCompareFood1(food);
    setCompareFood2(null);
    setSelectedFood(null);
    setActiveTab('compare');
  };

  // Handle /admin and /details routes
  useEffect(() => {
    const checkRoute = () => {
      if (
        window.location.pathname === '/admin' ||
        window.location.hash === '#admin' ||
        window.location.hash === '#/admin'
      ) {
        setActiveTab('admin');
      } else if (
        window.location.pathname === '/details' ||
        window.location.hash === '#details' ||
        window.location.hash === '#/details'
      ) {
        setActiveTab('details');
      }
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, []);

  const navigateToTab = (tab: TabType, preserveSearch = false) => {
    if (tab === 'check' && !preserveSearch) setSearchQueryForCheck('');
    setActiveTab(tab);
    if (tab === 'details') {
      if (window.location.pathname !== '/details') {
        window.history.pushState(null, '', '/details');
      }
    } else if (window.location.pathname === '/details') {
      window.history.pushState(null, '', '/');
    }
  };

  // 1. Fetch public foods & ratingRules (everybody reads)
  const fetchFoodsAndRules = async () => {
    setFoodsLoading(true);
    setFoodsError(null);

    try {
      const foodsSnap = await getDocs(collection(db, 'foods'));
      const fetchedFoods: FoodItem[] = [];
      foodsSnap.forEach(d => {
        fetchedFoods.push({ id: d.id, ...(d.data() as Omit<FoodItem, 'id'>) });
      });

      // If database is empty, fallback to sample dataset for immediate display
      if (fetchedFoods.length === 0) {
        const fallbackFoods: FoodItem[] = SAMPLE_INDIAN_FOODS.map((item, idx) => ({
          ...item,
          id: `sample-${idx}`,
        }));
        setFoods(fallbackFoods);
      } else {
        setFoods(fetchedFoods);
      }
    } catch (err: any) {
      console.warn('Using client fallback sample foods while foods collection initializes', err);
      const fallbackFoods: FoodItem[] = SAMPLE_INDIAN_FOODS.map((item, idx) => ({
        ...item,
        id: `sample-${idx}`,
      }));
      setFoods(fallbackFoods);
    }

    try {
      const rulesSnap = await getDocs(collection(db, 'ratingRules'));
      const fetchedRules: RatingRule[] = [];
      rulesSnap.forEach(d => {
        fetchedRules.push({ id: d.id, ...(d.data() as Omit<RatingRule, 'id'>) });
      });

      if (fetchedRules.length === 0) {
        const fallbackRules: RatingRule[] = DEFAULT_DRAFT_RATING_RULES.map((r, idx) => ({
          ...r,
          id: `rule-${idx}`,
        }));
        setRatingRules(fallbackRules);
      } else {
        setRatingRules(fetchedRules);
      }
    } catch (err: any) {
      console.warn('Using client fallback rating rules while ratingRules initializes', err);
      const fallbackRules: RatingRule[] = DEFAULT_DRAFT_RATING_RULES.map((r, idx) => ({
        ...r,
        id: `rule-${idx}`,
      }));
      setRatingRules(fallbackRules);
    } finally {
      setFoodsLoading(false);
    }
  };

  useEffect(() => {
    fetchFoodsAndRules();
  }, []);

  // 2. Realtime listener for User's Saved Foods (private users/{uid}/saved)
  useEffect(() => {
    if (!user) {
      setSavedFoods([]);
      setSavedLoading(false);
      return;
    }
    setSavedLoading(true);
    setSavedError(null);
    const path = `users/${user.uid}/saved`;
    const unsubscribe = onSnapshot(
      collection(db, path),
      snapshot => {
        const items: SavedFoodItem[] = [];
        snapshot.forEach(docSnap => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<SavedFoodItem, 'id'>) });
        });
        setSavedFoods(items);
        setSavedLoading(false);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, path);
        setSavedError('Unable to load your saved foods.');
        setSavedLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 3. Realtime listener for User's Daily Plan (private users/{uid}/plans/{date})
  useEffect(() => {
    if (!user || !currentDate) {
      setDailyPlan(null);
      setPlanLoading(false);
      return;
    }

    setPlanLoading(true);
    setPlanError(null);
    const planDocRef = doc(db, `users/${user.uid}/plans`, currentDate);
    const unsubscribe = onSnapshot(
      planDocRef,
      snapshot => {
        if (snapshot.exists()) {
          setDailyPlan({ id: snapshot.id, ...(snapshot.data() as any) });
        } else {
          // Zero fake data: initialize clean empty slots
          setDailyPlan({
            id: currentDate,
            date: currentDate,
            breakfast: [],
            lunch: [],
            dinner: [],
            snacks: [],
          });
        }
        setPlanLoading(false);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/plans/${currentDate}`);
        setPlanError('Unable to load meal plan for this date.');
        setPlanLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, currentDate]);

  // Handlers
  const handleToggleSaveFood = async (food: FoodItem) => {
    if (!user) return;
    const existing = savedFoods.find(s => s.foodId === food.id);
    const path = `users/${user.uid}/saved`;

    try {
      if (existing) {
        await deleteDoc(doc(db, path, existing.id));
      } else {
        const newSaved: Omit<SavedFoodItem, 'id'> = {
          foodId: food.id,
          name: food.name,
          category: food.category,
          servingLabel: food.servingLabel,
          savedAt: new Date().toISOString(),
          kcal: food.kcal,
          isVeg: food.isVeg,
        };
        await setDoc(doc(db, path, food.id), newSaved);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleUpdatePlan = async (updatedPlan: DailyPlan) => {
    if (!user) return;
    const path = `users/${user.uid}/plans/${updatedPlan.date}`;
    try {
      await setDoc(doc(db, `users/${user.uid}/plans`, updatedPlan.date), updatedPlan, {
        merge: true,
      });
      setDailyPlan(updatedPlan);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
      throw err;
    }
  };

  const handleAddToPlan = async (slot: MealSlotType, item: PlannedFoodItem) => {
    if (!user) return;
    const currentPlan: DailyPlan = dailyPlan || {
      id: currentDate,
      date: currentDate,
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
    };

    const updatedSlot = [...(currentPlan[slot] || []), item];
    const updatedPlan: DailyPlan = {
      ...currentPlan,
      [slot]: updatedSlot,
      updatedAt: formatLocalTimestamp(),
    };

    await handleUpdatePlan(updatedPlan);
  };

  const handleAddMultipleToPlan = async (slot: MealSlotType, items: PlannedFoodItem[]) => {
    if (!user) return;
    const currentPlan: DailyPlan = dailyPlan || {
      id: currentDate,
      date: currentDate,
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
    };

    const updatedSlot = [...(currentPlan[slot] || []), ...items];
    const updatedPlan: DailyPlan = {
      ...currentPlan,
      [slot]: updatedSlot,
      updatedAt: formatLocalTimestamp(),
    };

    await handleUpdatePlan(updatedPlan);
  };

  // Check auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mb-3 shadow-lg shadow-emerald-850/20">
          <span className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
          Loading NutriGuide...
        </p>
      </div>
    );
  }

  // If user is not logged in, show only the LandingPage
  if (!user) {
    return <LandingPage />;
  }

  // If user is logged in but hasn't completed onboarding, show OnboardingWizard
  if (!profile || !profile.onboardingComplete) {
    return <OnboardingWizard />;
  }

  const isSavedFood = (foodId: string) => {
    return savedFoods.some(s => s.foodId === foodId);
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col transition-colors">
      {/* Top Header with Disclaimer */}
      <Header
        activeTab={activeTab}
        onOpenProfile={() => setActiveTab('profile')}
        onOpenAdmin={() => setActiveTab('admin')}
      />

      {/* Main Tab View */}
      <main className="flex-1">
        <ErrorBoundary resetKey={activeTab} onGoHome={() => setActiveTab('home')}>
          {activeTab === 'home' && (
            <HomeView
              foods={foods}
              ratingRules={ratingRules}
              dailyPlan={dailyPlan}
              loading={foodsLoading}
              error={foodsError}
              onRetry={fetchFoodsAndRules}
              onSelectFood={food => setSelectedFood(food)}
              onNavigateTab={navigateToTab}
              onSearchQuery={q => {
                setSearchQueryForCheck(q);
                navigateToTab('check', true);
              }}
            />
          )}

          {activeTab === 'foods' && (
            <FoodsView
              foods={foods}
              ratingRules={ratingRules}
              savedFoods={savedFoods}
              loading={foodsLoading}
              error={foodsError}
              onRetry={fetchFoodsAndRules}
              onSelectFood={food => setSelectedFood(food)}
              onToggleSave={handleToggleSaveFood}
              onOpenCanIEat={() => navigateToTab('check')}
            />
          )}

          {activeTab === 'check' && (
            <CanIEatView
              foods={foods}
              ratingRules={ratingRules}
              savedFoods={savedFoods}
              loading={foodsLoading}
              error={foodsError}
              onRetry={fetchFoodsAndRules}
              initialQuery={searchQueryForCheck}
              onSelectFood={food => setSelectedFood(food)}
              onToggleSave={handleToggleSaveFood}
              onOpenWhatCanIEat={() => navigateToTab('foods')}
            />
          )}

          {activeTab === 'plan' && (
            <PlanView
              currentDate={currentDate}
              onChangeDate={date => setCurrentDate(date)}
              dailyPlan={dailyPlan}
              foods={foods}
              ratingRules={ratingRules}
              loading={planLoading}
              error={planError}
              onRetry={() => {
                // Re-triggers date query
                setCurrentDate(prev => prev);
              }}
              onUpdatePlan={handleUpdatePlan}
              onNavigateTab={navigateToTab}
              onOpenFoodCatalog={() => navigateToTab('foods')}
              onSelectFood={food => setSelectedFood(food)}
            />
          )}

          {activeTab === 'saved' && (
            <SavedView
              savedFoods={savedFoods}
              foods={foods}
              ratingRules={ratingRules}
              loading={savedLoading}
              error={savedError}
              onSelectFood={food => setSelectedFood(food)}
              onRemoveSaved={id => {
                if (user) {
                  deleteDoc(doc(db, `users/${user.uid}/saved`, id));
                }
              }}
              onAddToPlan={handleAddToPlan}
              onNavigateTab={navigateToTab}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView onNavigateTab={navigateToTab} />
          )}

          {activeTab === 'details' && (
            <DetailsView
              foods={foods}
              ratingRules={ratingRules}
              onSelectFood={food => setSelectedFood(food)}
              onBackToProfile={() => navigateToTab('profile')}
            />
          )}

          {activeTab === 'admin' && (
            <AdminView
              currentFoods={foods}
              currentRules={ratingRules}
              onRefreshData={fetchFoodsAndRules}
            />
          )}

          {activeTab === 'compare' && (
            <CompareView
              food1={compareFood1}
              food2={compareFood2}
              allFoods={foods}
              userConditions={profile.conditions || []}
              ratingRules={ratingRules}
              onSelectFood1={f => setCompareFood1(f)}
              onSelectFood2={f => setCompareFood2(f)}
              onBack={() => navigateToTab('foods')}
            />
          )}

          {activeTab === 'meal' && (
            <MealView
              foods={foods}
              ratingRules={ratingRules}
              loading={foodsLoading}
              error={foodsError}
              onRetry={fetchFoodsAndRules}
              onAddToPlan={handleAddMultipleToPlan}
              onNavigateTab={navigateToTab}
              onSelectFoodDetail={food => setSelectedFood(food)}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Food Detail Modal */}
      {selectedFood && (
        <FoodDetailModal
          food={selectedFood}
          onClose={() => setSelectedFood(null)}
          userConditions={profile.conditions || []}
          ratingRules={ratingRules}
          isSaved={isSavedFood(selectedFood.id)}
          onToggleSave={handleToggleSaveFood}
          onAddToPlan={handleAddToPlan}
          onCompare={handleStartCompare}
          allFoods={foods}
          onSelectFood={setSelectedFood}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onChangeTab={navigateToTab}
        savedCount={savedFoods.length}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
