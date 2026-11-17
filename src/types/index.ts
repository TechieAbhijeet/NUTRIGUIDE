export type ConditionType = 'diabetes' | 'hypertension' | 'ckd';

export type DietType = 'veg' | 'egg' | 'non-veg';

export type TabType = 'home' | 'foods' | 'plan' | 'saved' | 'profile' | 'admin' | 'compare' | 'meal' | 'check' | 'details' | 'about';

export type RestrictionType = 'sodium' | 'potassium' | 'phosphorus' | 'added_sugar' | 'fluid';

export interface NutrientTargets {
  carbs: number;      // in grams
  protein: number;    // in grams
  sodium: number;     // in mg
  potassium: number;  // in mg
  fiber: number;      // in grams
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  dietType: DietType;
  conditions: ConditionType[];
  restrictions: RestrictionType[];
  targets: NutrientTargets;
  onboardingComplete: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type FoodType = 'meal' | 'fruit' | 'vegetable' | 'grain' | 'pulse' | 'dairy' | 'snack' | 'drink';

export interface FoodItem {
  id: string;
  name: string;
  aliases?: string[] | string;
  category: string;
  type?: FoodType;
  icon?: string;
  servingLabel: string;
  servingGrams: number;
  kcal: number;
  carbs: number;       // g
  sugars: number | null;      // g (null = unknown)
  fiber: number | null;       // g (null = unknown)
  protein: number;     // g
  sodium: number;      // mg
  potassium: number;   // mg
  phosphorus: number;  // mg
  isVeg: boolean;
  source: string;
  reviewedBy?: string;
  reviewedDate?: string;
}

export interface RatingRule {
  id: string;
  condition: ConditionType;
  nutrient: string;
  moderateAbove: number;
  limitAbove: number;
  unit: string;
  approved: boolean; // Must be false for DRAFT values
  disclaimer?: string;
  notes?: string;
  approvedBy?: string;
  approvedDate?: string;
}

export type RatingLevel = 'favorable' | 'moderate' | 'limit' | 'unknown';

export interface ConditionEvaluation {
  condition: ConditionType;
  level: RatingLevel;
  reasons: string[];
  missingNutrients?: string[];
  hasDraftGuidance?: boolean;
}

export interface FoodEvaluation {
  overallLevel: RatingLevel;
  evaluations: ConditionEvaluation[];
  missingNutrients?: string[];
  hasDraftGuidance?: boolean;
}

export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface PlannedFoodItem {
  foodId: string;
  foodName: string;
  servingLabel: string;
  servingGrams: number;
  quantity: number; // e.g. 1.0, 1.5, 2.0
  kcal: number;
  carbs: number;
  protein: number;
  sodium: number;
  potassium: number;
  fiber: number | null;
  isVeg: boolean;
}

export interface DailyPlan {
  id: string;
  date: string; // YYYY-MM-DD
  breakfast: PlannedFoodItem[];
  lunch: PlannedFoodItem[];
  dinner: PlannedFoodItem[];
  snacks: PlannedFoodItem[];
  updatedAt?: string;
}

export interface SavedFoodItem {
  id: string;
  foodId: string;
  name: string;
  category: string;
  servingLabel: string;
  savedAt: string;
  kcal?: number;
  isVeg?: boolean;
}
