import React from 'react';
import { AlertCircle } from 'lucide-react';

interface DisclaimerBannerProps {
  className?: string;
  compact?: boolean;
}

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({ className = '' }) => {
  return (
    <div
      role="note"
      aria-label="Medical disclaimer"
      className={`bg-emerald-100 dark:bg-emerald-950/60 border-b border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-center transition-colors ${className}`}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-1.5 text-[13px] font-semibold text-emerald-950 dark:text-emerald-100 leading-tight whitespace-nowrap overflow-hidden">
        <AlertCircle className="w-4 h-4 shrink-0 text-emerald-800 dark:text-emerald-300" />
        <span className="truncate">
          General guidance, not a substitute for your care team
        </span>
      </div>
    </div>
  );
};
