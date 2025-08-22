import React from 'react';
import { useMobileUI, type MobileUICallbacks } from '@/hooks/useMobileUI';

interface ShotSetupCardProps extends MobileUICallbacks {
  className?: string;
  startCoords?: string;
  aimCoords?: string;
  pinCoords?: string;
  startElevation?: string;
  aimElevation?: string;
  pinElevation?: string;
  skillLevel?: string;
  rollCondition?: string;
}

const skillLevels = [
  'Tour Pro (±0.8° / ±3%)',
  'Elite Amateur (±1.2° / ±4%)',
  'Good Amateur (±1.8° / ±6%)',
  'Average Golfer (±2.5° / ±8%)',
  'High Handicap (±3.5° / ±12%)',
];

const rollConditions = [
  'None',
  'Soft',
  'Medium', 
  'Firm',
  'Concrete',
];

export const ShotSetupCard: React.FC<ShotSetupCardProps> = ({
  className = '',
  startCoords = 'Not set',
  aimCoords = 'Not set',
  pinCoords = 'Not set',
  startElevation = 'sampling...',
  aimElevation = 'sampling...',
  pinElevation = 'sampling...',
  skillLevel = skillLevels[1],
  rollCondition = rollConditions[0],
  onSelectStart,
  onSelectAim,
  onSelectPin,
}) => {
  const { shotSetupCardOpen, setShotSetupCardOpen } = useMobileUI();

  if (!shotSetupCardOpen) {
    return (
      <button
        onClick={() => setShotSetupCardOpen(true)}
        className={`fixed top-20 right-4 z-40 w-12 h-8 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors ${className}`}
        style={{
          top: 'calc(56px + env(safe-area-inset-top) + 80px)',
        }}
      >
        <div className="flex items-center justify-center space-x-1">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
        </div>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-35"
        onClick={() => setShotSetupCardOpen(false)}
      />
      
      {/* Card */}
      <div 
        className={`fixed left-4 right-4 bottom-4 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-[12px] shadow-lg border border-slate-200/50 dark:border-slate-700/50 ${className}`}
        style={{
          maxHeight: '85vh',
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200/50 dark:border-slate-700/50">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Shot Setup
            </h3>
            <button
              onClick={() => setShotSetupCardOpen(false)}
              className="w-8 h-8 rounded-[12px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times text-slate-600 dark:text-slate-400 text-sm"></i>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Point Selectors */}
            <div className="space-y-3">
              {/* Start Position */}
              <button
                onClick={() => {
                  onSelectStart?.();
                  setShotSetupCardOpen(false);
                }}
                className="w-full p-3 rounded-[12px] bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors text-left"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-4 h-4 bg-red-500 rounded-full mt-0.5"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      Starting Position
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {startCoords} • {startElevation}
                    </div>
                  </div>
                </div>
              </button>

              {/* Aim Point */}
              <button
                onClick={() => {
                  onSelectAim?.();
                  setShotSetupCardOpen(false);
                }}
                className="w-full p-3 rounded-[12px] bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors text-left"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-4 h-4 bg-blue-500 rounded-full mt-0.5"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      Aim Point
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {aimCoords} • {aimElevation}
                    </div>
                  </div>
                </div>
              </button>

              {/* Pin Position */}
              <button
                onClick={() => {
                  onSelectPin?.();
                  setShotSetupCardOpen(false);
                }}
                className="w-full p-3 rounded-[12px] bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors text-left"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-4 h-4 bg-yellow-500 mt-0.5" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      Pin Position
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {pinCoords} • {pinElevation}
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* Skill Level */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Skill Level
              </label>
              <select className="w-full p-3 rounded-[12px] bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm">
                {skillLevels.map((skill) => (
                  <option key={skill} value={skill} selected={skill === skillLevel}>
                    {skill}
                  </option>
                ))}
              </select>
            </div>

            {/* Roll Condition */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Roll Condition
              </label>
              <select className="w-full p-3 rounded-[12px] bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm">
                {rollConditions.map((condition) => (
                  <option key={condition} value={condition} selected={condition === rollCondition}>
                    {condition}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};