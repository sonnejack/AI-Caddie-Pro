import React from 'react';
import { type CameraPreset, type MobileUICallbacks } from '@/hooks/useMobileUI';

interface FooterMobileProps extends MobileUICallbacks {
  className?: string;
}

const cameraPresets: { id: CameraPreset; icon: string; label: string }[] = [
  { id: 'pov', icon: 'fa-eye', label: 'POV' },
  { id: 'overview', icon: 'fa-globe', label: 'Overview' },
  { id: 'tee', icon: 'fa-golf-ball', label: 'Tee' },
  { id: 'fairway', icon: 'fa-seedling', label: 'Fairway' },
  { id: 'green', icon: 'fa-flag', label: 'Green' },
];

export const FooterMobile: React.FC<FooterMobileProps> = ({
  className = '',
  onCameraPreset,
  onOptimize,
}) => {
  return (
    <footer 
      className={`fixed bottom-0 left-0 right-0 z-20 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-700/50 ${className}`}
      style={{
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center justify-between px-2 py-3 gap-2">
        {/* Left: Camera Presets */}
        <div className="flex-1 min-w-0">
          <div className="flex space-x-1 overflow-x-auto">
            {cameraPresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onCameraPreset?.(preset.id)}
                className="flex-shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-[8px] bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors"
              >
                <i className={`fas ${preset.icon} text-xs text-slate-600 dark:text-slate-400 mb-0.5`}></i>
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 leading-none">
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Center: Optimize Button */}
        <div className="flex-shrink-0">
          <button
            onClick={() => onOptimize?.()}
            className="h-10 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-[8px] shadow-md transition-colors"
          >
            <div className="flex items-center space-x-1.5">
              <i className="fas fa-bullseye text-xs"></i>
              <span className="text-sm">Optimize</span>
            </div>
          </button>
        </div>

        {/* Right: Status Icon */}
        <div className="flex-1 min-w-0 flex justify-end">
          <div className="w-8 h-8 rounded-[8px] bg-white/50 dark:bg-slate-800/50 flex items-center justify-center">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </footer>
  );
};