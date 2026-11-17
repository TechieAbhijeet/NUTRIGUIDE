import {
  ConditionEvaluation,
  ConditionType,
  FoodEvaluation,
  FoodItem,
  RatingLevel,
  RatingRule,
} from '../types';

const NUTRIENT_ALIASES: Record<string, string> = {
  carbohydrate: 'carbs',
  carbohydrates: 'carbs',
  carb: 'carbs',
  sugar: 'sugars',
  'dietary fiber': 'fiber',
  calories: 'kcal',
  calorie: 'kcal',
  gi: 'glycemicIndex',
  glycemic_index: 'glycemicIndex',
};

const UNSCALED_NUTRIENT_KEYS = new Set([
  'glycemicindex',
  'glycemic_index',
  'gi',
  'glycemicloadindex',
]);

export function isServingUnscaledNutrient(nutrient: string): boolean {
  const normalized = nutrient.toLowerCase().replace(/\s+/g, '');
  return UNSCALED_NUTRIENT_KEYS.has(normalized);
}

export function resolveFoodNutrientKey(food: FoodItem, nutrient: string): string | null {
  const record = food as unknown as Record<string, unknown>;
  const trimmed = nutrient.trim();
  if (!trimmed) return null;

  if (typeof record[trimmed] === 'number' && Number.isFinite(record[trimmed])) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const aliasTarget = NUTRIENT_ALIASES[lower];
  if (
    aliasTarget &&
    typeof record[aliasTarget] === 'number' &&
    Number.isFinite(record[aliasTarget])
  ) {
    return aliasTarget;
  }

  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) {
      if (typeof record[key] === 'number' && Number.isFinite(record[key])) {
        return key;
      }
    }
  }

  return null;
}

export function getRuleNutrientValue(
  food: FoodItem,
  nutrient: string,
  servings = 1
): number | undefined {
  const resolvedKey = resolveFoodNutrientKey(food, nutrient);
  if (!resolvedKey) return undefined;

  const record = food as unknown as Record<string, unknown>;
  const raw = record[resolvedKey];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return undefined;
  }

  if (isServingUnscaledNutrient(nutrient) || isServingUnscaledNutrient(resolvedKey)) {
    return raw;
  }

  const scale = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return Math.round(raw * scale * 100) / 100;
}

export function formatNutrientLabel(nutrient: string): string {
  const trimmed = nutrient.trim();
  const lower = trimmed.toLowerCase();
  switch (lower) {
    case 'carbs':
    case 'carbohydrate':
    case 'carbohydrates':
      return 'Carbs';
    case 'sugars':
    case 'sugar':
      return 'Sugars';
    case 'sodium':
      return 'Sodium';
    case 'potassium':
      return 'Potassium';
    case 'phosphorus':
      return 'Phosphorus';
    case 'fiber':
    case 'dietary fiber':
      return 'Fiber';
    case 'protein':
      return 'Protein';
    case 'kcal':
    case 'calories':
      return 'Calories';
    case 'glycemicindex':
    case 'glycemic_index':
    case 'gi':
      return 'Glycemic Index';
    default:
      return trimmed
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, ch => ch.toUpperCase());
  }
}

export function evaluateFood(
  food: FoodItem,
  userConditions: ConditionType[],
  rules: RatingRule[],
  servings = 1
): FoodEvaluation {
  if (!userConditions || userConditions.length === 0) {
    return {
      overallLevel: 'favorable',
      evaluations: [],
      missingNutrients: [],
      hasDraftGuidance: false,
    };
  }

  const evaluations: ConditionEvaluation[] = userConditions.map(condition => {
    const conditionRules = rules.filter(r => r.condition === condition);
    let hasLimit = false;
    let hasModerate = false;
    const reasons: string[] = [];
    const triggeredRules: RatingRule[] = [];
    const evaluatedRules: RatingRule[] = [];
    const missingNutrients: string[] = [];
    const missingRules: RatingRule[] = [];

    if (conditionRules.length === 0) {
      return {
        condition,
        level: 'favorable' as RatingLevel,
        reasons: ['No limits configured'],
        missingNutrients: [],
        hasDraftGuidance: false,
      };
    }

    for (const rule of conditionRules) {
      const nutrientVal = getRuleNutrientValue(food, rule.nutrient, servings);
      const nutrientLabel = formatNutrientLabel(rule.nutrient);
      if (nutrientVal === undefined) {
        const missingName = nutrientLabel.toLowerCase();
        if (!missingNutrients.includes(missingName)) {
          missingNutrients.push(missingName);
        }
        missingRules.push(rule);
        continue;
      }

      evaluatedRules.push(rule);
      const unitSuffix = rule.unit ? rule.unit : '';

      if (nutrientVal >= rule.limitAbove) {
        hasLimit = true;
        triggeredRules.push(rule);
        reasons.push(
          `${nutrientLabel}: ${nutrientVal}${unitSuffix} (exceeds limit ${rule.limitAbove}${unitSuffix})`
        );
      } else if (nutrientVal >= rule.moderateAbove) {
        hasModerate = true;
        triggeredRules.push(rule);
        reasons.push(
          `${nutrientLabel}: ${nutrientVal}${unitSuffix} (moderate above ${rule.moderateAbove}${unitSuffix})`
        );
      }
    }

    const conditionLevel: RatingLevel = hasLimit
      ? 'limit'
      : hasModerate
      ? 'moderate'
      : missingNutrients.length > 0
      ? 'unknown'
      : 'favorable';

    for (const missingName of missingNutrients) {
      reasons.push(
        `We don't have a value for ${missingName}. Ask your care team before eating this.`
      );
    }

    const hasDraftGuidance =
      triggeredRules.length > 0
        ? triggeredRules.some(r => !r.approved)
        : conditionLevel === 'unknown'
        ? missingRules.some(r => !r.approved)
        : evaluatedRules.some(r => !r.approved);

    if (conditionLevel === 'favorable' && reasons.length === 0) {
      reasons.push(
        hasDraftGuidance ? 'Meets standard draft targets' : 'Meets approved targets'
      );
    }

    return {
      condition,
      level: conditionLevel,
      reasons,
      missingNutrients,
      hasDraftGuidance,
    };
  });

  let overallLevel: RatingLevel = 'favorable';
  if (evaluations.some(e => e.level === 'limit')) {
    overallLevel = 'limit';
  } else if (evaluations.some(e => e.level === 'moderate')) {
    overallLevel = 'moderate';
  } else if (evaluations.some(e => e.level === 'unknown')) {
    overallLevel = 'unknown';
  }

  const allMissingNutrients: string[] = [];
  for (const ev of evaluations) {
    for (const m of ev.missingNutrients || []) {
      if (!allMissingNutrients.includes(m)) {
        allMissingNutrients.push(m);
      }
    }
  }

  const hasDraftGuidance =
    overallLevel === 'favorable'
      ? evaluations.some(e => e.hasDraftGuidance)
      : evaluations.some(e => e.level === overallLevel && e.hasDraftGuidance);

  return {
    overallLevel,
    evaluations,
    missingNutrients: allMissingNutrients,
    hasDraftGuidance,
  };
}

export function formatConditionName(condition: ConditionType): string {
  switch (condition) {
    case 'diabetes':
      return 'Diabetes';
    case 'hypertension':
      return 'Hypertension';
    case 'ckd':
      return 'CKD (Kidney)';
    default:
      return condition;
  }
}

export function getPlainRatingLabel(level: RatingLevel): string {
  switch (level) {
    case 'favorable':
      return 'Good choice';
    case 'moderate':
      return 'Eat a small portion';
    case 'limit':
      return 'Better to limit';
    case 'unknown':
      return 'Not enough data';
  }
}

export function getPlainMainReason(
  food: FoodItem,
  evaluation: FoodEvaluation,
  rules: RatingRule[]
): string {
  if (evaluation.overallLevel === 'favorable') {
    return 'Fits well with your health settings in a standard serving.';
  }

  if (evaluation.overallLevel === 'unknown') {
    const firstMissing = evaluation.missingNutrients?.[0];
    if (firstMissing) {
      return `We don't have a value for ${firstMissing}. Ask your care team before eating this.`;
    }
    return "We don't have values for all rule nutrients. Ask your care team before eating this.";
  }

  const targetLevel: RatingLevel = evaluation.overallLevel === 'limit' ? 'limit' : 'moderate';
  const relevantEvals = evaluation.evaluations.filter(ev => ev.level === targetLevel);

  for (const ev of relevantEvals) {
    const condRules = rules.filter(r => r.condition === ev.condition);
    for (const rule of condRules) {
      const val = getRuleNutrientValue(food, rule.nutrient, 1);
      if (val === undefined) continue;

      const hit = targetLevel === 'limit' ? val >= rule.limitAbove : val >= rule.moderateAbove;
      if (!hit) continue;

      const n = rule.nutrient.toLowerCase();
      if (n.includes('sodium')) {
        return targetLevel === 'limit'
          ? 'High in salt (sodium), which can raise blood pressure.'
          : 'Moderate amount of salt (sodium) — keep your serving small.';
      }
      if (n.includes('potassium')) {
        return targetLevel === 'limit'
          ? 'High in potassium, which needs extra care for your kidneys.'
          : 'Moderate amount of potassium — keep your serving small.';
      }
      if (n.includes('phosphorus')) {
        return targetLevel === 'limit'
          ? 'High in phosphorus, which needs extra care for your kidneys.'
          : 'Moderate amount of phosphorus — keep your serving small.';
      }
      if (n.includes('sugar')) {
        return targetLevel === 'limit'
          ? 'High in sugar, which can raise blood sugar quickly.'
          : 'Contains some sugar — keep your serving small.';
      }
      if (n.includes('carb')) {
        return targetLevel === 'limit'
          ? 'High in carbohydrates, which can raise blood sugar.'
          : 'Moderate carbohydrates — keep your serving small.';
      }

      const label = formatNutrientLabel(rule.nutrient);
      const unitSuffix = rule.unit ? ` ${rule.unit}` : '';
      return targetLevel === 'limit'
        ? `High ${label.toLowerCase()} (${val}${unitSuffix}) — exceeds limit.`
        : `Moderate ${label.toLowerCase()} (${val}${unitSuffix}) — keep your serving small.`;
    }
  }

  return targetLevel === 'limit'
    ? 'Higher in nutrients your care plan watches closely.'
    : 'Enjoy only in a small portion for your health settings.';
}
