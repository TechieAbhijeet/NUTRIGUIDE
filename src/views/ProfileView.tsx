import React, { useState } from 'react';
import {
  User,
  HeartPulse,
  Activity,
  ShieldAlert,
  Save,
  LogOut,
  Key,
  ShieldCheck,
  Check,
  Sliders,
  ChevronRight,
  Trash2,
  AlertTriangle,
  X,
  BarChart3,
} from 'lucide-react';
import { useAuth, calculateInitialTargets } from '../context/AuthContext';
import { ConditionType, DietType, NutrientTargets, RestrictionType, TabType } from '../types';

interface ProfileViewProps {
  onNavigateTab: (tab: TabType) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigateTab }) => {
  const {
    user,
    profile,
    isAdmin,
    loading: authLoading,
    updateProfileData,
    logout,
    resetPassword,
    deleteAccountAndData,
  } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [dietType, setDietType] = useState<DietType>(profile?.dietType || 'veg');
  const [conditions, setConditions] = useState<ConditionType[]>(profile?.conditions || ['diabetes']);
  const [restrictions, setRestrictions] = useState<RestrictionType[]>(profile?.restrictions || ['sodium']);
  const [targets, setTargets] = useState<NutrientTargets>(
    profile?.targets || {
      carbs: 180,
      protein: 60,
      sodium: 2000,
      potassium: 2500,
      fiber: 30,
    }
  );

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (authLoading || !profile) {
    return (
      <div className="pb-28 max-w-lg mx-auto px-4 pt-12 text-center">
        <div className="w-10 h-10 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
          <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-stone-500 font-medium">Loading profile settings...</p>
      </div>
    );
  }

  const toggleCondition = (cond: ConditionType) => {
    let next: ConditionType[];
    if (conditions.includes(cond)) {
      if (conditions.length === 1) return;
      next = conditions.filter(c => c !== cond);
    } else {
      next = [...conditions, cond];
    }
    setConditions(next);
  };

  const toggleRestriction = (rest: RestrictionType) => {
    let next: RestrictionType[];
    if (restrictions.includes(rest)) {
      next = restrictions.filter(r => r !== rest);
    } else {
      next = [...restrictions, rest];
    }
    setRestrictions(next);
  };

  const handleRecalculateTargets = () => {
    const fresh = calculateInitialTargets(conditions, restrictions);
    setTargets(fresh);
    setSuccessMsg('Recalculated baseline targets based on your conditions & restrictions.');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await updateProfileData({
        displayName: displayName.trim() || 'Health Seeker',
        dietType,
        conditions,
        restrictions,
        targets,
      });
      setSuccessMsg('Profile and clinical targets updated successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      setSuccessMsg(`Password reset instructions sent to ${user.email}`);
    } catch (err: any) {
      setErrorMsg('Could not send password reset email.');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError('');

    try {
      await deleteAccountAndData(deletePassword || undefined);
    } catch (err: any) {
      console.error('Delete account error:', err);
      if (err.message === 'RECENT_LOGIN_REQUIRED') {
        setRequiresPassword(true);
        setDeleteError('Security requires a recent login. Please enter your password or sign in again.');
      } else {
        setDeleteError(err.message || 'Could not complete deletion. Please try again.');
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="pb-28 max-w-lg mx-auto px-4 pt-4 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-stone-950 dark:text-white">
          Profile & Health Settings
        </h2>
        <p className="text-sm text-stone-700 dark:text-stone-300">
          Manage your conditions, diet type, restrictions, and targets
        </p>
      </div>

      {/* Detailed view for care team (links to /details) */}
      <button
        type="button"
        onClick={() => onNavigateTab('details')}
        className="w-full min-h-[48px] p-3.5 rounded-2xl bg-white dark:bg-stone-900 border-2 border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-left flex items-center justify-between gap-3 shadow-xs transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <span className="text-base font-bold text-stone-950 dark:text-white">
            Detailed view for care team
          </span>
        </div>
        <ChevronRight className="w-5 h-5 text-stone-800 dark:text-stone-200 shrink-0" />
      </button>

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 dark:text-emerald-300 text-xs">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Admin Quick Entry if Admin */}
      {isAdmin && (
        <div className="p-4 rounded-2xl bg-emerald-900 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h4 className="text-xs font-bold">Admin Portal Access</h4>
              <p className="text-[11px] text-emerald-200">Import CSV foods & seed rating rules</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('admin')}
            className="py-1.5 px-3 rounded-lg bg-white text-emerald-950 text-xs font-bold hover:bg-emerald-50 transition-colors flex items-center gap-1"
          >
            <span>Open</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* User Account Info */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3.5">
          <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
            Account Details
          </h3>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              disabled
              value={user?.email || ''}
              className="w-full px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800 text-stone-500 cursor-not-allowed"
            />
          </div>
        </div>

        {/* Conditions Section */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
            Active Health Conditions
          </h3>
          <p className="text-[11px] text-stone-500">
            NutriGuide generates traffic light ratings based on these conditions.
          </p>

          <div className="space-y-2 pt-1">
            {[
              { id: 'diabetes' as ConditionType, label: 'Type 2 Diabetes', icon: Activity },
              { id: 'hypertension' as ConditionType, label: 'Hypertension (High BP)', icon: HeartPulse },
              { id: 'ckd' as ConditionType, label: 'Chronic Kidney Disease (CKD)', icon: ShieldAlert },
            ].map(c => {
              const Icon = c.icon;
              const active = conditions.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCondition(c.id)}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                    active
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
                      : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                      {c.label}
                    </span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      active ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-stone-300'
                    }`}
                  >
                    {active && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Diet Type Section */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
            Dietary Preference
          </h3>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'veg' as DietType, label: 'Vegetarian' },
              { id: 'egg' as DietType, label: 'Eggetarian' },
              { id: 'non-veg' as DietType, label: 'Non-Veg' },
            ].map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDietType(d.id)}
                className={`py-2 px-2 rounded-xl text-xs font-semibold text-center border transition-all ${
                  dietType === d.id
                    ? 'border-emerald-700 bg-emerald-800 text-white'
                    : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dietary Restrictions */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-2.5">
          <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
            Specific Restrictions
          </h3>

          <div className="space-y-1.5">
            {[
              { id: 'sodium' as RestrictionType, label: 'Sodium Restriction' },
              { id: 'potassium' as RestrictionType, label: 'Potassium Restriction' },
              { id: 'phosphorus' as RestrictionType, label: 'Phosphorus Restriction' },
              { id: 'added_sugar' as RestrictionType, label: 'Added Sugar Restriction' },
              { id: 'fluid' as RestrictionType, label: 'Fluid Restriction' },
            ].map(r => {
              const active = restrictions.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRestriction(r.id)}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs font-medium transition-all ${
                    active
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                      : 'border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <span>{r.label}</span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      active ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-stone-300'
                    }`}
                  >
                    {active && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Targets */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
                Daily Nutrient Targets
              </h3>
              <p className="text-xs text-emerald-900 dark:text-emerald-200 font-semibold mt-0.5">
                Starting defaults - confirm with your care team
              </p>
            </div>
            <button
              type="button"
              onClick={handleRecalculateTargets}
              className="min-h-[44px] px-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:underline shrink-0"
            >
              Recalculate Defaults
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-stone-700 dark:text-stone-300">Carbs Target (g/day)</span>
                <span className="font-mono font-bold">{targets.carbs}g</span>
              </div>
              <input
                type="range"
                min={80}
                max={300}
                step={5}
                value={targets.carbs}
                onChange={e => setTargets({ ...targets, carbs: Number(e.target.value) })}
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-stone-700 dark:text-stone-300">Protein Target (g/day)</span>
                <span className="font-mono font-bold">{targets.protein}g</span>
              </div>
              <input
                type="range"
                min={30}
                max={120}
                step={2}
                value={targets.protein}
                onChange={e => setTargets({ ...targets, protein: Number(e.target.value) })}
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-stone-700 dark:text-stone-300">Sodium Limit (mg/day)</span>
                <span className="font-mono font-bold">{targets.sodium}mg</span>
              </div>
              <input
                type="range"
                min={800}
                max={3000}
                step={50}
                value={targets.sodium}
                onChange={e => setTargets({ ...targets, sodium: Number(e.target.value) })}
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-stone-700 dark:text-stone-300">Potassium Limit (mg/day)</span>
                <span className="font-mono font-bold">{targets.potassium}mg</span>
              </div>
              <input
                type="range"
                min={1200}
                max={4000}
                step={100}
                value={targets.potassium}
                onChange={e => setTargets({ ...targets, potassium: Number(e.target.value) })}
                className="w-full accent-emerald-700"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-stone-700 dark:text-stone-300">Fiber Target (g/day)</span>
                <span className="font-mono font-bold">{targets.fiber}g</span>
              </div>
              <input
                type="range"
                min={15}
                max={50}
                step={1}
                value={targets.fiber}
                onChange={e => setTargets({ ...targets, fiber: Number(e.target.value) })}
                className="w-full accent-emerald-700"
              />
            </div>
          </div>
        </div>

        {/* Save CTA */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-md shadow-emerald-800/20 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Profile Changes</span>
            </>
          )}
        </button>
      </form>

      {/* Account actions */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={handlePasswordReset}
          className="w-full py-2.5 px-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors"
        >
          <Key className="w-4 h-4 text-stone-400" />
          <span>Send Password Reset Email</span>
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full py-2.5 px-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-stone-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>

        {/* Delete account and all data button */}
        <button
          type="button"
          onClick={() => {
            setShowDeleteModal(true);
            setDeleteError('');
            setRequiresPassword(false);
            setDeletePassword('');
          }}
          className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-red-100/50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete account and all my data</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Delete account and all data?
              </h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                This will permanently remove your health profile, conditions, targets, meal plans, saved items, and delete your login account. This action cannot be undone.
              </p>
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs">
                {deleteError}
              </div>
            )}

            {requiresPassword && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Confirm Password to Re-authenticate
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-2 focus:ring-red-600"
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {deleteLoading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>Confirm Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
