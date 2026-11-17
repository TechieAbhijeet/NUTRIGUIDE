import React from 'react';
import { ArrowLeft, Database, Scale, AlertCircle, BookOpen } from 'lucide-react';

interface AboutDataViewProps {
  onBackToProfile: () => void;
}

export const AboutDataView: React.FC<AboutDataViewProps> = ({ onBackToProfile }) => {
  return (
    <div className="pb-24 max-w-2xl mx-auto px-4 pt-4 space-y-5">
      <div>
        <button
          type="button"
          onClick={onBackToProfile}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-700 text-stone-950 dark:text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>Back to Profile</span>
        </button>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-stone-950 dark:text-white">
          About the data
        </h1>
        <p className="text-sm text-stone-700 dark:text-stone-300 mt-0.5">
          Nutrient sources, serving definitions, and guidance scope
        </p>
      </div>

      {/* Sources */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-5 border-2 border-stone-300 dark:border-stone-700 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-800 dark:text-emerald-400 shrink-0" />
          <h2 className="text-base font-extrabold text-stone-950 dark:text-white">
            Nutrient data sources
          </h2>
        </div>

        <ul className="space-y-3 text-sm text-stone-800 dark:text-stone-200 leading-relaxed">
          <li className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700">
            <p className="font-bold text-stone-950 dark:text-white">
              USDA National Nutrient Database SR28
            </p>
            <p className="text-stone-700 dark:text-stone-300 text-sm mt-0.5">
              Public domain
            </p>
          </li>

          <li className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700">
            <p className="font-bold text-stone-950 dark:text-white">
              Indian Nutrient Databank
            </p>
            <p className="text-stone-700 dark:text-stone-300 text-sm mt-0.5">
              Vijayakumar et al., <em>Current Developments in Nutrition</em>, 2024; reuse permission being confirmed.
            </p>
          </li>
        </ul>
      </section>

      {/* Serving Basis & Sugars */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-5 border-2 border-stone-300 dark:border-stone-700 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-800 dark:text-emerald-400 shrink-0" />
          <h2 className="text-base font-extrabold text-stone-950 dark:text-white">
            Values and nutrient definitions
          </h2>
        </div>

        <div className="space-y-2.5 text-sm text-stone-800 dark:text-stone-200 leading-relaxed">
          <p className="flex items-start gap-2">
            <BookOpen className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0 mt-1" />
            <span>
              All nutrient values shown across foods, comparisons, and meal plans are <strong>per serving</strong>.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <BookOpen className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0 mt-1" />
            <span>
              Sugars in Indian dishes are <strong>free sugars</strong>, while USDA gives <strong>total sugars</strong>.
            </span>
          </p>
        </div>
      </section>

      {/* Guidance Notice */}
      <section className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl p-4 sm:p-5 border-2 border-amber-300 dark:border-amber-800 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-800 dark:text-amber-300 shrink-0" />
          <h2 className="text-base font-extrabold text-amber-950 dark:text-amber-100">
            Guidance notice
          </h2>
        </div>
        <p className="text-sm font-medium text-amber-950 dark:text-amber-100 leading-relaxed">
          Ratings are draft guidance, not medical advice. Always confirm dietary choices and nutrient targets with your care team.
        </p>
      </section>
    </div>
  );
};
