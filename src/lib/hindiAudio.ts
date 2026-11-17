import { FoodEvaluation, FoodItem, RatingRule } from '../types';
import { getRuleNutrientValue } from './ratingEngine';

export type HindiReasonKey =
  | 'sodium'
  | 'potassium'
  | 'phosphorus'
  | 'sugars'
  | 'carbs'
  | 'other';

const FAVORABLE_SENTENCE = 'हाँ, आप इसे खा सकते हैं। यह आपके लिए अच्छा विकल्प है।';
const MODERATE_PREFIX = 'आप इसे खा सकते हैं, लेकिन थोड़ी मात्रा में। ';
const LIMIT_PREFIX = 'बेहतर है कि आप इसे कम खाएँ या न खाएँ। ';
const UNKNOWN_SENTENCE =
  'इसकी पूरी जानकारी उपलब्ध नहीं है। खाने से पहले अपने डॉक्टर या डायटीशियन से पूछें।';

const MODERATE_REASONS: Record<HindiReasonKey, string> = {
  sodium: 'इसमें नमक थोड़ा ज़्यादा है।',
  potassium: 'इसमें पोटैशियम थोड़ा ज़्यादा है।',
  phosphorus: 'इसमें फॉस्फोरस थोड़ा ज़्यादा है।',
  sugars: 'इसमें चीनी थोड़ी ज़्यादा है।',
  carbs: 'इसमें कार्बोहाइड्रेट थोड़ा ज़्यादा है।',
  other: 'इसमें कुछ पोषक तत्व थोड़े ज़्यादा हैं।',
};

const LIMIT_REASONS: Record<HindiReasonKey, string> = {
  sodium: 'इसमें नमक बहुत ज़्यादा है, जो ब्लड प्रेशर बढ़ा सकता है।',
  potassium: 'इसमें पोटैशियम बहुत ज़्यादा है, किडनी के लिए सावधानी ज़रूरी है।',
  phosphorus: 'इसमें फॉस्फोरस बहुत ज़्यादा है, किडनी के लिए सावधानी ज़रूरी है।',
  sugars: 'इसमें चीनी बहुत ज़्यादा है, जो शुगर तेज़ी से बढ़ा सकती है।',
  carbs: 'इसमें कार्बोहाइड्रेट बहुत ज़्यादा है, जो ब्लड शुगर बढ़ा सकता है।',
  other: 'इसमें कुछ पोषक तत्व बहुत ज़्यादा हैं।',
};

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

function extractDevanagariFromValue(val: unknown): string | null {
  if (!val) return null;
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = extractDevanagariFromValue(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof val === 'string') {
    const parts = val.split(/[,;|/]+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && DEVANAGARI_REGEX.test(trimmed)) {
        return trimmed;
      }
    }
  }
  return null;
}

export function getDevanagariAlias(
  food: Pick<FoodItem, 'aliases'> & Record<string, unknown>
): string | null {
  const candidateKeys = [
    'aliases',
    'alias',
    'hindiName',
    'hindi',
    'nameHi',
    'devanagari',
    'devanagariName',
  ];
  for (const key of candidateKeys) {
    const found = extractDevanagariFromValue(food[key]);
    if (found) return found;
  }
  return null;
}

export function mapNutrientToHindiReasonKey(nutrient: string): HindiReasonKey {
  const n = nutrient.trim().toLowerCase();
  if (n.includes('sodium') || n === 'salt') return 'sodium';
  if (n.includes('potassium')) return 'potassium';
  if (n.includes('phosphorus')) return 'phosphorus';
  if (n.includes('sugar')) return 'sugars';
  if (n.includes('carb')) return 'carbs';
  return 'other';
}

export function getStrongestTriggeredReasonKey(
  food: FoodItem,
  evaluation: FoodEvaluation,
  rules: RatingRule[],
  servings = 1
): HindiReasonKey {
  const level = evaluation.overallLevel;
  if (level !== 'limit' && level !== 'moderate') {
    return 'other';
  }

  const relevantEvals = (evaluation.evaluations || []).filter(ev => ev.level === level);
  let bestRule: RatingRule | null = null;
  let bestStrength = -1;

  for (const ev of relevantEvals) {
    const condRules = (rules || []).filter(r => r.condition === ev.condition);
    for (const rule of condRules) {
      const val = getRuleNutrientValue(food, rule.nutrient, servings);
      if (val === undefined) continue;

      if (level === 'limit' && val >= rule.limitAbove) {
        const strength = rule.limitAbove > 0 ? val / rule.limitAbove : val + 1;
        if (strength > bestStrength) {
          bestStrength = strength;
          bestRule = rule;
        }
      } else if (level === 'moderate' && val >= rule.moderateAbove && val < rule.limitAbove) {
        const strength = rule.moderateAbove > 0 ? val / rule.moderateAbove : val + 1;
        if (strength > bestStrength) {
          bestStrength = strength;
          bestRule = rule;
        }
      }
    }
  }

  if (bestRule) {
    return mapNutrientToHindiReasonKey(bestRule.nutrient);
  }

  // Fallback if caller supplied reasons without rules
  for (const ev of relevantEvals) {
    for (const reason of ev.reasons || []) {
      const lower = reason.toLowerCase();
      if (lower.includes('sodium')) return 'sodium';
      if (lower.includes('potassium')) return 'potassium';
      if (lower.includes('phosphorus')) return 'phosphorus';
      if (lower.includes('sugar')) return 'sugars';
      if (lower.includes('carb')) return 'carbs';
    }
  }

  return 'other';
}

export function buildHindiSentence(
  food: FoodItem & Record<string, unknown>,
  evaluation: FoodEvaluation,
  rules: RatingRule[],
  servings = 1
): string {
  let body: string;

  switch (evaluation.overallLevel) {
    case 'favorable':
      body = FAVORABLE_SENTENCE;
      break;
    case 'moderate': {
      const reasonKey = getStrongestTriggeredReasonKey(food, evaluation, rules, servings);
      body = MODERATE_PREFIX + MODERATE_REASONS[reasonKey];
      break;
    }
    case 'limit': {
      const reasonKey = getStrongestTriggeredReasonKey(food, evaluation, rules, servings);
      body = LIMIT_PREFIX + LIMIT_REASONS[reasonKey];
      break;
    }
    case 'unknown':
    default:
      body = UNKNOWN_SENTENCE;
      break;
  }

  const alias = getDevanagariAlias(food);
  if (!alias) {
    return body;
  }

  const trimmedAlias = alias.trim();
  const separator = /[।.!?]$/.test(trimmedAlias) ? ' ' : '। ';
  return `${trimmedAlias}${separator}${body}`;
}

// Speech synthesis playback management
const stopListeners = new Set<() => void>();

export function subscribeSpeechStop(listener: () => void): () => void {
  stopListeners.add(listener);
  return () => {
    stopListeners.delete(listener);
  };
}

export function stopHindiSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore speech synthesis cancellation errors
    }
  }
  stopListeners.forEach(fn => fn());
}

export function findHindiVoiceFromList(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find(v => (v.lang || '').toLowerCase().startsWith('hi')) || null;
}

export async function waitForHindiVoice(timeoutMs = 1500): Promise<{
  supported: boolean;
  voice: SpeechSynthesisVoice | null;
}> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { supported: false, voice: null };
  }

  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) {
    return { supported: true, voice: findHindiVoiceFromList(existing) };
  }

  const loaded = await new Promise<SpeechSynthesisVoice[]>(resolve => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const handleVoicesChanged = () => {
      const next = synth.getVoices();
      if (next.length > 0) {
        finish(next);
      }
    };

    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', handleVoicesChanged);
      }
      resolve(voices);
    };

    timer = setTimeout(() => {
      finish(synth.getVoices());
    }, timeoutMs);

    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', handleVoicesChanged);
    } else {
      const prev = synth.onvoiceschanged;
      synth.onvoiceschanged = (ev: Event) => {
        if (typeof prev === 'function') prev.call(synth, ev);
        handleVoicesChanged();
      };
    }
  });

  return { supported: true, voice: findHindiVoiceFromList(loaded) };
}
