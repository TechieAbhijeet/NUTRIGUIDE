import React, { useState } from 'react';
import { Check, HeartPulse, Activity, ShieldAlert, ArrowRight, ArrowLeft } from 'lucide-react';
import { useAuth, calculateInitialTargets } from '../context/AuthContext';
import { ConditionType, DietType, RestrictionType, NutrientTargets } from '../types';
import { DisclaimerBanner } from './DisclaimerBanner';

export const OnboardingWizard: React.FC = () => {
  const { saveOnboarding } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [conditions, setConditions] = useState<ConditionType[]>(['diabetes']);
  const [dietType, setDietType] = useState<DietType>('veg');
  const [restrictions, setRestrictions] = useState<RestrictionType[]>(['sodium', 'added_sugar']);
  const [targets, setTargets] = useState<NutrientTargets>(() =>
    calculateInitialTargets(['diabetes'], ['sodium', 'added_sugar'])
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleCondition = (cond: ConditionType) => {
    let next: ConditionType[];
    if (conditions.includes(cond)) {
      if (conditions.length === 1) return; // Keep at least one condition
      next = conditions.filter(c => c !== cond);
    } else {
      next = [...conditions, cond];
    }
    setConditions(next);
    setTargets(calculateInitialTargets(next, restrictions));
  };

  const selectDiet = (diet: DietType) => {
    setDietType(diet);
  };

  const toggleRestriction = (rest: RestrictionType) => {
    let next: RestrictionType[];
    if (restrictions.includes(rest)) {
      next = restrictions.filter(r => r !== rest);
    } else {
      next = [...restrictions, rest];
    }
    setRestrictions(next);
    setTargets(calculateInitialTargets(conditions, next));
  };

  const handleFinish = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      await saveOnboarding({
        conditions,
        dietType,
        restrictions,
        targets,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Could not save your preferences. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex flex-col justify-between">
      <DisclaimerBanner />

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-8 flex flex-col justify-center">
        {/* Step progress pills */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-500 mb-2">
            <span>Step {step} of 3</span>
            <span>
              {step === 1 && 'Health Conditions'}
              {step === 2 && 'Dietary Preference'}
              {step === 3 && 'Dietary Restrictions & Targets'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                step >= 1 ? 'bg-emerald-700' : 'bg-stone-200 dark:bg-stone-800'
              }`}
            />
            <div
              className={`h-1.5 rounded-full transition-colors ${
                step >= 2 ? 'bg-emerald-700' : 'bg-stone-200 dark:bg-stone-800'
              }`}
            />
            <div
              className={`h-1.5 rounded-full transition-colors ${
                step >= 3 ? 'bg-emerald-700' : 'bg-stone-200 dark:bg-stone-800'
              }`}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 text-red-700 dark:text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: Conditions */}
        {step === 1 && (
          <div className="bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-stone-800 shadow-xl shadow-stone-900/5">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Select your health conditions
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                NutriGuide personalizes nutrient thresholds and traffic light evaluations to your profile. Select all that apply.
              </p>
            </div>

            <div className="space-y-3">
              {/* Diabetes */}
              <button
                type="button"
                onClick={() => toggleCondition('diabetes')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start justify-between min-h-[64px] ${
                  conditions.includes('diabetes')
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                      Type 2 Diabetes
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 pl-6">
                    Focuses on glycemic carbs, added sugars, and high-fiber Indian staples.
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                    conditions.includes('diabetes')
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'border-stone-300 dark:border-stone-700'
                  }`}
                >
                  {conditions.includes('diabetes') && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>

              {/* Hypertension */}
              <button
                type="button"
                onClick={() => toggleCondition('hypertension')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start justify-between min-h-[64px] ${
                  conditions.includes('hypertension')
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                      Hypertension (High BP)
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 pl-6">
                    Monitors sodium in pickles, papads, restaurant curries, and processed gravies.
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                    conditions.includes('hypertension')
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'border-stone-300 dark:border-stone-700'
                  }`}
                >
                  {conditions.includes('hypertension') && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>

              {/* CKD */}
              <button
                type="button"
                onClick={() => toggleCondition('ckd')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start justify-between min-h-[64px] ${
                  conditions.includes('ckd')
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                      Chronic Kidney Disease (CKD)
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 pl-6">
                    Monitors potassium, phosphorus, and safe protein pacing for renal preservation.
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                    conditions.includes('ckd')
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'border-stone-300 dark:border-stone-700'
                  }`}
                >
                  {conditions.includes('ckd') && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="py-3 px-6 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-800/20 active:scale-[0.99]"
              >
                <span>Next: Diet Preference</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Diet Type */}
        {step === 2 && (
          <div className="bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-stone-800 shadow-xl shadow-stone-900/5">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                What is your dietary pattern?
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                We'll filter and highlight Indian meals compatible with your kitchen habits.
              </p>
            </div>

            <div className="space-y-3">
              {/* Veg */}
              <button
                type="button"
                onClick={() => selectDiet('veg')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between min-h-[64px] ${
                  dietType === 'veg'
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-emerald-700 p-0.5 rounded-sm flex items-center justify-center">
                      <span className="w-1.5 h-1.5 bg-emerald-700 rounded-full" />
                    </span>
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                      Vegetarian
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 pl-6">
                    Plant-based grains, dals, sabzis, dairy (milk/curd/paneer). No eggs or meat.
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    dietType === 'veg'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-stone-300 dark:border-stone-700'
                  }`}
                >
                  {dietType === 'veg' && <span className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>

              {/* Egg */}
              <button
                type="button"
                onClick={() => selectDiet('egg')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between min-h-[64px] ${
                  dietType === 'egg'
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-amber-600 p-0.5 rounded-sm flex items-center justify-center">
                      <span className="w-1.5 h-1.5 bg-amber-600 rounded-full" />
                    </span>
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                      Eggetarian
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 pl-6">
                    Vegetarian foods plus eggs (omelettes, boiled eggs). No poultry or meat.
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    dietType === 'egg'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-stone-300 dark:border-stone-700'
                  }`}
                >
                  {dietType === 'egg' && <span className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>

              {/* Non-veg */}
              <button
                type="button"
                onClick={() => selectDiet('non-veg')}
                className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between min-h-[64px] ${
                  dietType === 'non-veg'
                    ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-red-700 p-0.5 rounded-sm flex items-center justify-center">
                      <span className="w-1.5 h-1.5 bg-red-700 rounded-full" />
                    </span>
                    <span className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                      Non-Vegetarian
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 pl-6">
                    Includes chicken, fish, seafood, mutton, eggs, and all vegetarian staples.
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    dietType === 'non-veg'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-stone-300 dark:border-stone-700'
                  }`}
                >
                  {dietType === 'non-veg' && <span className="w-2 h-2 bg-white rounded-full" />}
                </div>
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2.5 px-4 rounded-xl text-stone-600 hover:text-stone-900 dark:text-stone-400 font-semibold text-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="py-3 px-6 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-800/20 active:scale-[0.99]"
              >
                <span>Next: Restrictions</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Restrictions & Targets */}
        {step === 3 && (
          <div className="bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-stone-800 shadow-xl shadow-stone-900/5">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Dietary restrictions & daily targets
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                Select your care team's advised restrictions. Editable anytime in your Profile.
              </p>
            </div>

            {/* Restrictions toggles */}
            <div className="space-y-2 mb-5">
              {[
                { id: 'sodium' as RestrictionType, label: 'Sodium Restriction', desc: 'Advised for high BP, water retention, and CKD' },
                { id: 'potassium' as RestrictionType, label: 'Potassium Restriction', desc: 'Advised when serum potassium is elevated in CKD' },
                { id: 'phosphorus' as RestrictionType, label: 'Phosphorus Restriction', desc: 'Advised for mineral & bone health in CKD' },
                { id: 'added_sugar' as RestrictionType, label: 'Added Sugar Restriction', desc: 'Strict limit on refined sugar, sweets & syrups' },
                { id: 'fluid' as RestrictionType, label: 'Fluid Restriction', desc: 'For advanced renal or cardiac fluid management' },
              ].map(item => {
                const checked = restrictions.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleRestriction(item.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      checked
                        ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-xs text-stone-900 dark:text-stone-100">{item.label}</p>
                      <p className="text-[11px] text-stone-500">{item.desc}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                        checked
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'border-stone-300 dark:border-stone-700'
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Calculated Targets Overview */}
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 mb-6">
              <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider mb-2">
                Your Initial Daily Nutrient Targets
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                  <span className="text-stone-500 text-[11px]">Carbs Target:</span>
                  <p className="font-bold font-mono text-stone-900 dark:text-stone-100">{targets.carbs}g / day</p>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                  <span className="text-stone-500 text-[11px]">Protein Target:</span>
                  <p className="font-bold font-mono text-stone-900 dark:text-stone-100">{targets.protein}g / day</p>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                  <span className="text-stone-500 text-[11px]">Sodium Max:</span>
                  <p className="font-bold font-mono text-stone-900 dark:text-stone-100">{targets.sodium}mg / day</p>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                  <span className="text-stone-500 text-[11px]">Potassium Max:</span>
                  <p className="font-bold font-mono text-stone-900 dark:text-stone-100">{targets.potassium}mg / day</p>
                </div>
              </div>
              <p className="text-[10px] text-stone-500 mt-2">
                * You can fine-tune these numbers anytime in your Profile.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={saving}
                className="py-2.5 px-4 rounded-xl text-stone-600 hover:text-stone-900 dark:text-stone-400 font-semibold text-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={saving}
                className="py-3 px-6 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-md shadow-emerald-800/20 active:scale-[0.99] disabled:opacity-50"
              >
                {saving ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Complete & Enter</span>
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="py-4 text-center text-xs text-stone-400 border-t border-stone-200 dark:border-stone-800">
        <p className="px-4">NutriGuide · General guidance, not a substitute for your care team</p>
      </footer>
    </div>
  );
};
