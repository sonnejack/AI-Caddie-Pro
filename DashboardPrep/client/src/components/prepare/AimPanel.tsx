import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PrepareState, LatLon, SKILL_PRESETS, RollCondition } from '../../lib/types';
import { getPointElevation } from '@/lib/pointElevation';

interface AimPanelProps {
  state: PrepareState;
  onPointSet: (type: 'start' | 'aim' | 'pin', point: LatLon) => void;
  onSkillChange: (skill: typeof SKILL_PRESETS[0]) => void;
  onRollConditionChange: (rollCondition: RollCondition) => void;
  onSelectionModeChange: (mode: 'start' | 'aim' | 'pin' | null) => void;
}

export default function AimPanel({ state, onPointSet, onSkillChange, onRollConditionChange, onSelectionModeChange }: AimPanelProps) {
  const formatCoordinate = (point: LatLon | null, pointType: 'start' | 'aim' | 'pin') => {
    if (!point) return 'Not set';
    
    const elevation = getPointElevation(pointType);
    const elevationText = elevation !== undefined ? ` • ${elevation.toFixed(1)}m` : ' • sampling...';
    
    return `${point.lat.toFixed(4)}°N, ${Math.abs(point.lon).toFixed(4)}°${point.lon >= 0 ? 'E' : 'W'}${elevationText}`;
  };

  const getPointDescription = (type: 'start' | 'aim' | 'pin') => {
    switch (type) {
      case 'start':
        return state.start ? 'Starting Position Set' : 'Click to set starting position';
      case 'aim':
        return state.aim ? 'Aim Point Set' : 'Click to set aim point';
      case 'pin':
        return state.pin ? 'Pin Position Set' : 'Click to set pin position';
      default:
        return 'Not set';
    }
  };


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Shot Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {/* Point Pickers */}
        <div className="space-y-2">
          {/* Starting Position */}
          <div>
            <Button
              variant="outline"
              className={`w-full p-2 h-auto text-left justify-start transition-colors ${
                state.selectionMode === 'start' ? 'border-red-500 bg-red-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => {
                const newMode = state.selectionMode === 'start' ? null : 'start';
                onSelectionModeChange(newMode);
              }}
            >
              <div className="flex items-start space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{getPointDescription('start')}</span>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {formatCoordinate(state.start, 'start')}
                  </p>
                </div>
              </div>
            </Button>
          </div>

          {/* Aim Point */}
          <div>
            <Button
              variant="outline"
              className={`w-full p-2 h-auto text-left justify-start transition-colors ${
                state.selectionMode === 'aim' ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => {
                const newMode = state.selectionMode === 'aim' ? null : 'aim';
                onSelectionModeChange(newMode);
              }}
            >
              <div className="flex items-start space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{getPointDescription('aim')}</span>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {formatCoordinate(state.aim, 'aim')}
                  </p>
                </div>
              </div>
            </Button>
          </div>

          {/* Pin Position */}
          <div>
            <Button
              variant="outline"
              className={`w-full p-2 h-auto text-left justify-start transition-colors ${
                state.selectionMode === 'pin' ? 'border-green-500 bg-green-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => {
                const newMode = state.selectionMode === 'pin' ? null : 'pin';
                onSelectionModeChange(newMode);
              }}
            >
              <div className="flex items-start space-x-2">
                <div className="w-3 h-3 bg-yellow-500 mt-0.5" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{getPointDescription('pin')}</span>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {formatCoordinate(state.pin, 'pin')}
                  </p>
                </div>
              </div>
            </Button>
          </div>
        </div>

        {/* Skill Selector */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1">Skill Level</Label>
          <Select
            value={state.skillPreset.name}
            onValueChange={(value) => {
              const skill = SKILL_PRESETS.find(s => s.name === value);
              if (skill) {
                onSkillChange(skill);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILL_PRESETS.map((preset) => (
                <SelectItem key={preset.name} value={preset.name}>
                  {preset.name} (±{preset.offlineDeg}° / ±{preset.distPct}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Roll Condition Selector */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-1">Roll Condition</Label>
          <Select
            value={state.rollCondition}
            onValueChange={(value: RollCondition) => {
              onRollConditionChange(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="soft">Soft</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="firm">Firm</SelectItem>
              <SelectItem value="concrete">Concrete</SelectItem>
            </SelectContent>
          </Select>
        </div>

      </CardContent>
    </Card>
  );
}
