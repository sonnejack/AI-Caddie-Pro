import React from 'react';
import { useMobileUI, type MobileUICallbacks } from '@/hooks/useMobileUI';

interface HoleChipProps extends MobileUICallbacks {
  className?: string;
  par?: number;
}

export const HoleChip: React.FC<HoleChipProps> = ({ 
  className = '',
  par = 4,
  onPrevHole,
  onNextHole,
}) => {
  const { currentHole, setCurrentHole } = useMobileUI();

  const handlePrevHole = () => {
    if (currentHole > 1) {
      const newHole = currentHole - 1;
      setCurrentHole(newHole);
      onPrevHole?.();
    }
  };

  const handleNextHole = () => {
    if (currentHole < 18) {
      const newHole = currentHole + 1;
      setCurrentHole(newHole);
      onNextHole?.();
    }
  };

  return (
    <div 
      className={`fixed left-1/2 transform -translate-x-1/2 z-30 ${className}`}
      style={{
        top: 'calc(56px + env(safe-area-inset-top) + 80px)', // Increased to account for persistent controls
      }}
    >
      <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 px-4 py-2">
        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrevHole}
            disabled={currentHole === 1}
            className={`w-6 h-6 rounded-[6px] flex items-center justify-center transition-colors ${
              currentHole === 1
                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fas fa-chevron-left text-xs"></i>
          </button>
          
          <div className="text-center">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                Hole {currentHole}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                (Par {par})
              </span>
            </div>
          </div>
          
          <button
            onClick={handleNextHole}
            disabled={currentHole === 18}
            className={`w-6 h-6 rounded-[6px] flex items-center justify-center transition-colors ${
              currentHole === 18
                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className="fas fa-chevron-right text-xs"></i>
          </button>
        </div>
      </div>
    </div>
  );
};