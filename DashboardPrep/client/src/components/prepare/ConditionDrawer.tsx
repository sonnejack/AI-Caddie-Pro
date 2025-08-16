import { useState, useContext } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CONDITION_COLORS, Condition } from '@/cesium/ConditionDrawingManager';
import { DrawingManagerContext } from '@/prepare/drawing/DrawingManagerContext';

const conditionTypes: { name: Condition, color: string, icon: string }[] = [
  { name: 'green', color: CONDITION_COLORS.green.outline, icon: 'fas fa-flag' },
  { name: 'fairway', color: CONDITION_COLORS.fairway.outline, icon: 'fas fa-seedling' },
  { name: 'tee', color: CONDITION_COLORS.tee.outline, icon: 'fas fa-golf-ball' },
  { name: 'bunker', color: CONDITION_COLORS.bunker.outline, icon: 'fas fa-mountain' },
  { name: 'water', color: CONDITION_COLORS.water.outline, icon: 'fas fa-tint' },
  { name: 'hazard', color: CONDITION_COLORS.hazard.outline, icon: 'fas fa-exclamation-triangle' },
  { name: 'OB', color: CONDITION_COLORS.OB.outline, icon: 'fas fa-ban' },
  { name: 'recovery', color: CONDITION_COLORS.recovery.outline, icon: 'fas fa-tree' },
  { name: 'rough', color: CONDITION_COLORS.rough.outline, icon: 'fas fa-grass' },
];

export default function ConditionDrawer() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const drawingContext = useContext(DrawingManagerContext);

  const handleDrawCondition = (conditionType: Condition) => {
    if (!drawingContext?.manager) {
      console.warn('Drawing manager not available');
      return;
    }
    
    const drawingManager = drawingContext.manager;
    
    // If already drawing this type, don't restart
    if (drawingContext.state?.condition === conditionType && drawingContext.state?.isDrawing) {
      return;
    }
    
    // If drawing something else, finish current drawing first
    if (drawingContext.state?.isDrawing) {
      drawingManager.finish();
    }
    
    drawingManager.start(conditionType);
    console.log(`Started drawing ${conditionType} area`);
  };

  const handleFinishDrawing = () => {
    if (!drawingContext?.manager) return;
    drawingContext.manager.finish();
    console.log('Finished drawing');
  };

  const handleCancelDrawing = () => {
    if (!drawingContext?.manager) return;
    drawingContext.manager.cancel();
    console.log('Cancelled drawing');
  };

  const handleRemoveLastFeature = () => {
    if (!drawingContext?.manager) return;
    drawingContext.manager.removeLast();
    console.log('Removed last feature');
  };

  const handleClearAll = () => {
    if (!drawingContext?.manager) return;
    drawingContext.manager.clearAll();
    console.log('Cleared all features');
  };

  const isDrawing = drawingContext?.state?.isDrawing || false;
  const vertexCount = drawingContext?.state?.vertices || 0;
  const currentDrawingType = drawingContext?.state?.condition;
  const canFinish = isDrawing && vertexCount >= 3;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-secondary">Drawing Tools</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 p-0"
          >
            <i className={`fas ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-gray-500`}></i>
          </Button>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="space-y-3">
          {/* Drawing Status */}
          {isDrawing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-semibold text-blue-700 capitalize">Drawing {currentDrawingType} area</span>
              </div>
              <p className="text-xs text-blue-600">
                Click points to mark {currentDrawingType} area ({vertexCount} points placed)
                {vertexCount >= 3 ? ' - Click "Finish Drawing" when done' : ` - Need ${3 - vertexCount} more point(s)`}
              </p>
            </div>
          )}

          {conditionTypes.map((condition) => {
            const isActiveDrawing = currentDrawingType === condition.name && isDrawing;
            const isDisabled = isDrawing && !isActiveDrawing;
            
            return (
              <Button
                key={condition.name}
                variant={isActiveDrawing ? "default" : "outline"}
                disabled={isDisabled}
                className={`w-full justify-between p-3 h-auto transition-all duration-200 ${
                  isActiveDrawing 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : isDisabled 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-slate-50'
                }`}
                onClick={() => handleDrawCondition(condition.name)}
              >
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-4 h-4 rounded" 
                    style={{ backgroundColor: condition.color }}
                  />
                  <span className="text-sm font-medium capitalize">
                    {isActiveDrawing ? `✅ Drawing ${condition.name}` : `Mark ${condition.name}`}
                  </span>
                </div>
                <i className={`fas ${isActiveDrawing ? 'fa-check' : 'fa-pencil-alt'} ${isActiveDrawing ? 'text-white' : 'text-gray-400'}`}></i>
              </Button>
            );
          })}

          <div className="pt-4 border-t border-slate-200 space-y-2">
            {/* Drawing Controls */}
            {isDrawing && (
              <div className="space-y-2">
                <div className="flex space-x-2">
                  <Button 
                    variant="default"
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleFinishDrawing}
                    disabled={!canFinish}
                  >
                    <i className="fas fa-check mr-1"></i>
                    {canFinish ? 'Finish Drawing' : `Need ${3 - vertexCount} more point(s)`}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleCancelDrawing}
                  >
                    <i className="fas fa-times mr-1"></i>Cancel
                  </Button>
                </div>
              </div>
            )}
            
            {/* Management Controls */}
            {!isDrawing && (
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                  onClick={handleRemoveLastFeature}
                >
                  <i className="fas fa-undo mr-1"></i>Remove Last
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1"
                  onClick={handleClearAll}
                >
                  <i className="fas fa-eraser mr-1"></i>Clear All
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
