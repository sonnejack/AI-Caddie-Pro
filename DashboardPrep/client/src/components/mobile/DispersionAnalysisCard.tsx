import React from 'react';
import { useMobileUI } from '@/hooks/useMobileUI';

interface DispersionAnalysisCardProps {
  className?: string;
  expectedStrokes?: string;
  confidenceInterval?: string;
  landingConditions?: Array<{
    condition: string;
    percentage: number;
    color: string;
  }>;
}

const defaultLandingConditions = [
  { condition: 'Fairway', percentage: 68, color: '#28B43C' },
  { condition: 'Rough', percentage: 22, color: '#556B2F' },
  { condition: 'Bunker', percentage: 8, color: '#D2B48C' },
  { condition: 'Water', percentage: 2, color: '#0078FF' },
];

export const DispersionAnalysisCard: React.FC<DispersionAnalysisCardProps> = ({
  className = '',
  expectedStrokes = '2.854',
  confidenceInterval = '±0.023',
  landingConditions = defaultLandingConditions,
}) => {
  const { dispersionAnalysisCardOpen, setDispersionAnalysisCardOpen } = useMobileUI();

  if (!dispersionAnalysisCardOpen) {
    return (
      <button
        onClick={() => setDispersionAnalysisCardOpen(true)}
        className={`fixed bottom-20 right-4 z-40 w-12 h-8 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors ${className}`}
        style={{
          bottom: 'calc(96px + env(safe-area-inset-bottom))',
        }}
      >
        <i className="fas fa-chart-line text-slate-600 dark:text-slate-400 text-sm"></i>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-35"
        onClick={() => setDispersionAnalysisCardOpen(false)}
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
              Shot Analysis
            </h3>
            <button
              onClick={() => setDispersionAnalysisCardOpen(false)}
              className="w-8 h-8 rounded-[12px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times text-slate-600 dark:text-slate-400 text-sm"></i>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Statistics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-white/50 dark:bg-slate-800/50 rounded-[12px] border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Expected Strokes
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {expectedStrokes}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {confidenceInterval}
                </div>
              </div>
              
              <div className="text-center p-3 bg-white/50 dark:bg-slate-800/50 rounded-[12px] border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Confidence
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  95%
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Interval
                </div>
              </div>
            </div>

            {/* Landing Conditions */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Landing Conditions
              </h4>
              <div className="space-y-2">
                {landingConditions.map((condition, index) => (
                  <div key={index} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {condition.condition}
                      </span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {condition.percentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-500 ease-out"
                        style={{
                          width: `${condition.percentage}%`,
                          backgroundColor: condition.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-[12px]">
              <div className="flex items-start space-x-2">
                <i className="fas fa-info-circle text-green-600 dark:text-green-400 text-sm mt-0.5"></i>
                <div className="text-xs text-green-700 dark:text-green-300">
                  <p className="font-medium mb-1">Shot Assessment</p>
                  <p>Good aim point with {landingConditions[0]?.percentage || 68}% fairway probability. Low risk of penalties.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};