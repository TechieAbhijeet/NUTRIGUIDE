import React from 'react';
import { Home, Utensils, CalendarDays, Bookmark, User } from 'lucide-react';
import { TabType } from '../types';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  savedCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab, savedCount = 0 }) => {
  const tabs = [
    { id: 'home' as TabType, label: 'Home', icon: Home },
    { id: 'foods' as TabType, label: 'Foods', icon: Utensils },
    { id: 'plan' as TabType, label: 'Diet Chart', icon: CalendarDays },
    { id: 'saved' as TabType, label: 'Saved', icon: Bookmark, badge: savedCount > 0 ? savedCount : null },
    { id: 'profile' as TabType, label: 'Profile', icon: User },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t-2 border-stone-300 dark:border-stone-700 transition-colors shadow-lg"
      role="navigation"
      aria-label="Bottom Navigation"
    >
      <div className="max-w-2xl mx-auto flex items-stretch justify-between px-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className={`flex-1 min-h-[56px] flex flex-col items-center justify-center py-1.5 px-1 transition-colors relative ${
                isActive
                  ? 'text-emerald-900 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 font-extrabold'
                  : 'text-stone-700 hover:text-stone-950 dark:text-stone-200 dark:hover:text-white font-semibold'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  className={`w-6 h-6 transition-transform ${
                    isActive ? 'scale-105 stroke-[2.25]' : 'stroke-[2]'
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2.5 bg-emerald-800 text-white text-[11px] leading-none font-bold rounded-full min-h-[18px] min-w-[18px] px-1 flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[12px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
