import React from 'react';
import { useMobileUI } from '@/hooks/useMobileUI';

interface CardsSwitcherChipProps {
  className?: string;
}

export const CardsSwitcherChip: React.FC<CardsSwitcherChipProps> = ({ 
  className = '' 
}) => {
  const { 
    cardsSwitcherOpen, 
    setCardsSwitcherOpen,
    setShotSetupCardOpen,
    setDrawingToolsCardOpen,
    setDispersionAnalysisCardOpen,
    closeAllCards,
  } = useMobileUI();

  const handleCardOpen = (cardType: 'setup' | 'drawing' | 'analysis') => {
    closeAllCards();
    setCardsSwitcherOpen(false);
    
    switch (cardType) {
      case 'setup':
        setShotSetupCardOpen(true);
        break;
      case 'drawing':
        setDrawingToolsCardOpen(true);
        break;
      case 'analysis':
        setDispersionAnalysisCardOpen(true);
        break;
    }
  };

  return (
    <>
      {/* Main Chip */}
      <button
        onClick={() => setCardsSwitcherOpen(!cardsSwitcherOpen)}
        className={`fixed bottom-20 left-4 z-40 w-12 h-12 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all ${className}`}
        style={{
          bottom: 'calc(96px + env(safe-area-inset-bottom))',
        }}
      >
        <i className={`fas fa-bars text-slate-600 dark:text-slate-400 transition-transform ${
          cardsSwitcherOpen ? 'rotate-90' : ''
        }`}></i>
      </button>

      {/* Menu */}
      {cardsSwitcherOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/10 z-35"
            onClick={() => setCardsSwitcherOpen(false)}
          />
          
          {/* Menu Items */}
          <div 
            className="fixed left-4 z-40 space-y-2"
            style={{
              bottom: 'calc(156px + env(safe-area-inset-bottom))',
            }}
          >
            <button
              onClick={() => handleCardOpen('setup')}
              className="flex items-center space-x-3 w-auto px-4 h-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Shot Setup
              </span>
            </button>
            
            <button
              onClick={() => handleCardOpen('drawing')}
              className="flex items-center space-x-3 w-auto px-4 h-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <i className="fas fa-pencil-alt text-sm text-slate-500 dark:text-slate-400"></i>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Drawing Tools
              </span>
            </button>
            
            <button
              onClick={() => handleCardOpen('analysis')}
              className="flex items-center space-x-3 w-auto px-4 h-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-colors"
            >
              <i className="fas fa-chart-line text-sm text-slate-500 dark:text-slate-400"></i>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Analysis
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );
};