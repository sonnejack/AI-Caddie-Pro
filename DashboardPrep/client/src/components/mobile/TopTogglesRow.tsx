import React from 'react';
import { useMobileUI, type MobileUICallbacks } from '@/hooks/useMobileUI';

interface TopTogglesRowProps extends MobileUICallbacks {
  className?: string;
  sampleCount?: number;
  onSampleCountChange?: (count: number) => void;
  onToggleGPS?: () => void;
  gpsEnabled?: boolean;
}

const toggles = [
  { 
    key: 'tiles3D' as const, 
    icon: 'fa-cube', 
    label: '3D', 
    action: 'onToggle3DTiles' as const 
  },
  { 
    key: 'gps' as const, 
    icon: 'fa-location-crosshairs', 
    label: 'GPS', 
    action: 'onToggleGPS' as const 
  },
  { 
    key: 'vectorFeatures' as const, 
    icon: 'fa-layer-group', 
    label: 'Features', 
    action: 'onToggleFeatures' as const 
  },
  { 
    key: 'slopeArrows' as const, 
    icon: 'fa-arrow-up', 
    label: 'Slope', 
    action: 'onToggleSlopeArrows' as const 
  },
  { 
    key: 'maskFill' as const, 
    icon: 'fa-palette', 
    label: 'Fill', 
    action: 'onToggleMaskFill' as const 
  },
  { 
    key: 'maskEdges' as const, 
    icon: 'fa-border-style', 
    label: 'Edges', 
    action: 'onToggleMaskEdges' as const 
  },
  { 
    key: 'samplePoints' as const, 
    icon: 'fa-circle-dot', 
    label: 'Samples', 
    action: 'onToggleSamples' as const 
  },
];

export const TopTogglesRow: React.FC<TopTogglesRowProps> = ({ 
  className = '',
  onToggle3DTiles,
  onToggleGPS,
  onToggleFeatures,
  onToggleSlopeArrows,
  onToggleMaskFill,
  onToggleMaskEdges,
  onToggleSamples,
  sampleCount = 1000,
  onSampleCountChange,
  gpsEnabled = false,
}) => {
  const {
    tiles3DEnabled,
    vectorFeaturesEnabled,
    slopeArrowsEnabled,
    maskFillEnabled,
    maskEdgesEnabled,
    samplePointsEnabled,
    toggle3DTiles,
    toggleVectorFeatures,
    toggleSlopeArrows,
    toggleMaskFill,
    toggleMaskEdges,
    toggleSamplePoints,
  } = useMobileUI();

  const getToggleState = (key: string) => {
    switch (key) {
      case 'tiles3D': return tiles3DEnabled;
      case 'gps': return gpsEnabled;
      case 'vectorFeatures': return vectorFeaturesEnabled;
      case 'slopeArrows': return slopeArrowsEnabled;
      case 'maskFill': return maskFillEnabled;
      case 'maskEdges': return maskEdgesEnabled;
      case 'samplePoints': return samplePointsEnabled;
      default: return false;
    }
  };

  const handleToggle = (key: string, action: string) => {
    // Update internal state
    switch (key) {
      case 'tiles3D': toggle3DTiles(); break;
      case 'gps': break; // GPS state is managed externally
      case 'vectorFeatures': toggleVectorFeatures(); break;
      case 'slopeArrows': toggleSlopeArrows(); break;
      case 'maskFill': toggleMaskFill(); break;
      case 'maskEdges': toggleMaskEdges(); break;
      case 'samplePoints': toggleSamplePoints(); break;
    }

    // Call external callback
    switch (action) {
      case 'onToggle3DTiles': onToggle3DTiles?.(); break;
      case 'onToggleGPS': onToggleGPS?.(); break;
      case 'onToggleFeatures': onToggleFeatures?.(); break;
      case 'onToggleSlopeArrows': onToggleSlopeArrows?.(); break;
      case 'onToggleMaskFill': onToggleMaskFill?.(); break;
      case 'onToggleMaskEdges': onToggleMaskEdges?.(); break;
      case 'onToggleSamples': onToggleSamples?.(); break;
    }
  };

  return (
    <div 
      className={`absolute left-0 right-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 ${className}`}
      style={{
        top: 'calc(56px + env(safe-area-inset-top))',
      }}
    >
      <div className="p-2 space-y-2">
        {/* Toggle Icons Row */}
        <div className="flex space-x-2 overflow-x-auto pb-1">
          {toggles.map((toggle) => {
            const isActive = getToggleState(toggle.key);
            
            return (
              <button
                key={toggle.key}
                onClick={() => handleToggle(toggle.key, toggle.action)}
                className={`flex-shrink-0 h-8 px-3 rounded-[8px] transition-all shadow-sm ${
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <i className={`fas ${toggle.icon} text-xs`}></i>
                  <span className="text-xs font-medium whitespace-nowrap">
                    {toggle.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        
        {/* Sample Count Slider */}
        <div className="flex items-center space-x-3">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
            Samples:
          </span>
          <div className="flex-1 flex items-center space-x-2">
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={sampleCount}
              onChange={(e) => onSampleCountChange?.(parseInt(e.target.value))}
              className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <span className="text-xs font-mono text-slate-600 dark:text-slate-400 min-w-[3rem] text-center">
              {sampleCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};