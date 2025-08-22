import React from 'react';
import { useMobileUI, type ConditionType, type MobileUICallbacks } from '@/hooks/useMobileUI';

interface DrawingToolsCardProps extends MobileUICallbacks {
  className?: string;
}

const conditionTypes: { 
  name: ConditionType; 
  color: string; 
  label: string; 
  icon: string 
}[] = [
  { name: 'green', color: '#6CFF8A', label: 'Green', icon: 'fa-flag' },
  { name: 'fairway', color: '#28B43C', label: 'Fairway', icon: 'fa-seedling' },
  { name: 'tee', color: '#0EA5E9', label: 'Tee', icon: 'fa-golf-ball' },
  { name: 'bunker', color: '#D2B48C', label: 'Bunker', icon: 'fa-mountain' },
  { name: 'water', color: '#0078FF', label: 'Water', icon: 'fa-tint' },
  { name: 'hazard', color: '#E74C3C', label: 'Hazard', icon: 'fa-exclamation-triangle' },
  { name: 'OB', color: '#ECECEC', label: 'OB', icon: 'fa-ban' },
  { name: 'recovery', color: '#8E44AD', label: 'Recovery', icon: 'fa-tree' },
  { name: 'rough', color: '#556B2F', label: 'Rough', icon: 'fa-grass' },
];

export const DrawingToolsCard: React.FC<DrawingToolsCardProps> = ({
  className = '',
  onStartDrawing,
  onFinishDrawing,
  onCancelDrawing,
  onRemoveLast,
  onClearAll,
}) => {
  const { 
    drawingToolsCardOpen, 
    setDrawingToolsCardOpen,
    isDrawing,
    currentDrawingType,
    setIsDrawing,
    setCurrentDrawingType,
  } = useMobileUI();

  const handleStartDrawing = (type: ConditionType) => {
    setIsDrawing(true);
    setCurrentDrawingType(type);
    onStartDrawing?.(type);
  };

  const handleFinishDrawing = () => {
    setIsDrawing(false);
    setCurrentDrawingType(null);
    onFinishDrawing?.();
  };

  const handleCancelDrawing = () => {
    setIsDrawing(false);
    setCurrentDrawingType(null);
    onCancelDrawing?.();
  };

  if (!drawingToolsCardOpen) {
    return (
      <button
        onClick={() => setDrawingToolsCardOpen(true)}
        className={`fixed bottom-20 right-4 z-40 w-12 h-8 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-[12px] shadow-md border border-slate-200/50 dark:border-slate-700/50 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors ${className}`}
        style={{
          bottom: 'calc(136px + env(safe-area-inset-bottom))', // Positioned above dispersion analysis
        }}
      >
        <i className="fas fa-pencil-alt text-slate-600 dark:text-slate-400 text-sm"></i>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-35"
        onClick={() => setDrawingToolsCardOpen(false)}
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
              Drawing Tools
            </h3>
            <button
              onClick={() => setDrawingToolsCardOpen(false)}
              className="w-8 h-8 rounded-[12px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times text-slate-600 dark:text-slate-400 text-sm"></i>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Drawing Status */}
            {isDrawing && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-[12px] p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300 capitalize">
                    Drawing {currentDrawingType} area
                  </span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Tap points to mark the area boundary
                </p>
              </div>
            )}

            {/* Condition Grid */}
            <div className="grid grid-cols-3 gap-2">
              {conditionTypes.map((condition) => (
                <button
                  key={condition.name}
                  onClick={() => handleStartDrawing(condition.name)}
                  disabled={isDrawing && currentDrawingType !== condition.name}
                  className={`h-12 p-2 rounded-[12px] border-2 transition-all flex flex-col items-center justify-center ${
                    currentDrawingType === condition.name && isDrawing
                      ? 'bg-blue-600 text-white border-blue-600'
                      : isDrawing
                        ? 'opacity-50 cursor-not-allowed bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                        : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-700/80'
                  }`}
                  style={{
                    borderColor: !isDrawing || currentDrawingType === condition.name 
                      ? condition.color 
                      : undefined
                  }}
                >
                  <i className={`fas ${condition.icon} text-xs mb-1 ${
                    currentDrawingType === condition.name && isDrawing
                      ? 'text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}></i>
                  <span className={`text-xs font-medium ${
                    currentDrawingType === condition.name && isDrawing
                      ? 'text-white'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {condition.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Drawing Controls */}
            {isDrawing ? (
              <div className="flex space-x-2">
                <button
                  onClick={handleFinishDrawing}
                  className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white font-medium rounded-[12px] transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <i className="fas fa-check text-sm"></i>
                    <span>Finish</span>
                  </div>
                </button>
                <button
                  onClick={handleCancelDrawing}
                  className="flex-1 h-10 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-[12px] hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <i className="fas fa-times text-sm"></i>
                    <span>Cancel</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={() => onRemoveLast?.()}
                  className="flex-1 h-10 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-[12px] hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <i className="fas fa-undo text-sm"></i>
                    <span>Remove Last</span>
                  </div>
                </button>
                <button
                  onClick={() => onClearAll?.()}
                  className="flex-1 h-10 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-[12px] hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors"
                >
                  <div className="flex items-center justify-center space-x-2">
                    <i className="fas fa-eraser text-sm"></i>
                    <span>Clear All</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};