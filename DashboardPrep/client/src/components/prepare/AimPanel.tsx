import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrepareState, LatLon, SKILL_PRESETS } from '../../lib/types';

interface AimPanelProps {
  state: PrepareState;
  onPointSet: (type: 'start' | 'aim' | 'pin', point: LatLon) => void;
  onSkillChange: (skill: typeof SKILL_PRESETS[0]) => void;
  onSelectionModeChange: (mode: 'start' | 'aim' | 'pin' | null) => void;
}

export default function AimPanel({ state, onPointSet, onSkillChange, onSelectionModeChange }: AimPanelProps) {
  const formatCoordinate = (point: LatLon | null) => {
    if (!point) return 'Not set';
    return `${point.lat.toFixed(4)}°N, ${Math.abs(point.lon).toFixed(4)}°${point.lon >= 0 ? 'E' : 'W'}`;
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

  const handleMaxCarryChange = (value: string) => {
    // TODO: Implement max carry change
    console.log('Max carry changed to:', value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-secondary">Shot Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Point Pickers */}
        <div className="space-y-4">
          {/* Starting Position */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2">Starting Position</Label>
            <Button
              variant="outline"
              className={`w-full p-3 h-auto text-left justify-start transition-colors ${
                state.selectionMode === 'start' ? 'border-red-500 bg-red-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => {
                const newMode = state.selectionMode === 'start' ? null : 'start';
                onSelectionModeChange(newMode);
              }}
            >
              <div className="flex items-start space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full mt-1" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{getPointDescription('start')}</span>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {formatCoordinate(state.start)}
                  </p>
                </div>
              </div>
            </Button>
          </div>

          {/* Aim Point */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2">Aim Point</Label>
            <Button
              variant="outline"
              className={`w-full p-3 h-auto text-left justify-start transition-colors ${
                state.selectionMode === 'aim' ? 'border-blue-500 bg-blue-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => {
                const newMode = state.selectionMode === 'aim' ? null : 'aim';
                onSelectionModeChange(newMode);
              }}
            >
              <div className="flex items-start space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full mt-1" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{getPointDescription('aim')}</span>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {formatCoordinate(state.aim)}
                  </p>
                </div>
              </div>
            </Button>
          </div>

          {/* Pin Position */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2">Pin Position</Label>
            <Button
              variant="outline"
              className={`w-full p-3 h-auto text-left justify-start transition-colors ${
                state.selectionMode === 'pin' ? 'border-green-500 bg-green-50' : 'hover:bg-slate-50'
              }`}
              onClick={() => {
                const newMode = state.selectionMode === 'pin' ? null : 'pin';
                onSelectionModeChange(newMode);
              }}
            >
              <div className="flex items-start space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full mt-1" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm block">{getPointDescription('pin')}</span>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {formatCoordinate(state.pin)}
                  </p>
                </div>
              </div>
            </Button>
          </div>
        </div>

        {/* Skill Selector */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2">Skill Level</Label>
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

        {/* Max Carry */}
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2">Max Carry (yards)</Label>
          <Input
            type="number"
            value={state.maxCarry}
            onChange={(e) => handleMaxCarryChange(e.target.value)}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}
