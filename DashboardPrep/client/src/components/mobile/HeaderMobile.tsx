import React from 'react';
import { useMobileUI } from '@/hooks/useMobileUI';

interface HeaderMobileProps {
  className?: string;
}

export const HeaderMobile: React.FC<HeaderMobileProps> = ({ className = '' }) => {
  const { topDrawerOpen, setTopDrawerOpen } = useMobileUI();

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(56px + env(safe-area-inset-top))',
      }}
    >
      <button
        onClick={() => setTopDrawerOpen(!topDrawerOpen)}
        className="w-full h-14 px-4 flex items-center justify-between hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
            <i className="fas fa-golf-ball text-white text-xs"></i>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Golf Analytics Pro
          </h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Menu
          </span>
          <i className={`fas fa-chevron-down text-slate-600 dark:text-slate-400 transition-transform duration-200 ${
            topDrawerOpen ? 'rotate-180' : ''
          }`}></i>
        </div>
      </button>
    </header>
  );
};