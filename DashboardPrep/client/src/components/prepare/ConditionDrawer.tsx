import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CONDITION_COLORS } from '../../lib/types';

const conditionTypes = [
  { name: 'Green', color: 'golf-condition-green', icon: 'fas fa-flag' },
  { name: 'Fairway', color: 'golf-condition-fairway', icon: 'fas fa-seedling' },
  { name: 'Rough', color: 'golf-condition-rough', icon: 'fas fa-grass' },
  { name: 'Bunker', color: 'golf-condition-sand', icon: 'fas fa-mountain' },
  { name: 'Water', color: 'golf-condition-water', icon: 'fas fa-tint' },
  { name: 'Hazard', color: 'golf-condition-hazard', icon: 'fas fa-exclamation-triangle' },
];

export default function ConditionDrawer() {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleDrawCondition = (conditionType: string) => {
    // TODO: Implement polygon drawing functionality
    console.log(`Drawing ${conditionType} condition`);
  };

  const handleClearAll = () => {
    // TODO: Implement clear all functionality
    console.log('Clearing all conditions');
  };

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
          {conditionTypes.map((condition) => (
            <Button
              key={condition.name}
              variant="outline"
              className="w-full justify-between p-3 h-auto hover:bg-slate-50 transition-colors"
              onClick={() => handleDrawCondition(condition.name)}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-4 h-4 rounded ${condition.color}`} />
                <span className="text-sm font-medium">{condition.name}</span>
              </div>
              <i className="fas fa-pencil-alt text-gray-400"></i>
            </Button>
          ))}

          <div className="pt-4 border-t border-slate-200">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleClearAll}
            >
              <i className="fas fa-eraser mr-2"></i>Clear All
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
