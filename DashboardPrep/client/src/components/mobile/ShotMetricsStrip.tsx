import React from 'react';

interface ShotMetricsStripProps {
  className?: string;
  totalDistance?: string;
  totalPlaysLike?: string;
  shotDistance?: string;
  shotPlaysLike?: string;
  expectedStrokes?: string;
  avgProximity?: string;
}

export const ShotMetricsStrip: React.FC<ShotMetricsStripProps> = ({
  className = '',
  totalDistance = '287y',
  totalPlaysLike = '+15y',
  shotDistance = '275y',
  shotPlaysLike = '+12y',
  expectedStrokes = '2.85',
  avgProximity = '42ft',
}) => {
  const metrics = [
    {
      label: 'Total Dist',
      primary: totalDistance,
      secondary: `${totalPlaysLike} plays like`,
    },
    {
      label: 'Shot Dist',
      primary: shotDistance,
      secondary: `${shotPlaysLike} plays like`,
    },
    {
      label: 'Expected Strokes',
      primary: expectedStrokes,
      secondary: null,
    },
    {
      label: 'Avg Proximity',
      primary: avgProximity,
      secondary: null,
    },
  ];

  return (
    <div 
      className={`fixed left-0 right-0 z-20 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-700/50 ${className}`}
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
      }}
    >
      <div className="overflow-x-auto">
        <div className="flex space-x-3 px-4 py-3 min-w-max">
          {metrics.map((metric, index) => (
            <div
              key={index}
              className="flex-shrink-0 w-20 text-center"
            >
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {metric.label}
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mb-0.5">
                {metric.primary}
              </div>
              {metric.secondary && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {metric.secondary}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};