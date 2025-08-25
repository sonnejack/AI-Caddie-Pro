import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PrepareState, LatLon, SKILL_PRESETS, RollCondition } from '../../lib/types';
import { getPointElevation } from '@/lib/pointElevation';

interface ShotSetupMobileProps {
  state: PrepareState;
  onPointSet: (type: 'start' | 'aim' | 'pin', point: LatLon) => void;
  onSkillChange: (skill: typeof SKILL_PRESETS[0]) => void;
  onRollConditionChange: (rollCondition: RollCondition) => void;
  onSelectionModeChange: (mode: 'start' | 'aim' | 'pin' | null) => void;
}

export default function ShotSetupMobile({ 
  state, 
  onPointSet, 
  onSkillChange, 
  onRollConditionChange, 
  onSelectionModeChange 
}: ShotSetupMobileProps) {

  return (
    <div className="space-y-0.5">
      {/* Point Buttons - Vertical Stack */}
      <div className="flex flex-col gap-0.5">
        {/* Start Point */}
        <Button
          variant="outline"
          size="sm"
          className={`h-4 w-4 p-0 flex items-center justify-center border ${
            state.selectionMode === 'start' 
              ? 'bg-red-500/20 border-red-500' 
              : 'border-border hover:bg-red-500/10'
          }`}
          onClick={() => {
            const newMode = state.selectionMode === 'start' ? null : 'start';
            onSelectionModeChange(newMode);
          }}
        >
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
        </Button>

        {/* Aim Point */}
        <Button
          variant="outline"
          size="sm"
          className={`h-4 w-4 p-0 flex items-center justify-center border ${
            state.selectionMode === 'aim' 
              ? 'bg-blue-500/20 border-blue-500' 
              : 'border-border hover:bg-blue-500/10'
          }`}
          onClick={() => {
            const newMode = state.selectionMode === 'aim' ? null : 'aim';
            onSelectionModeChange(newMode);
          }}
        >
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
        </Button>

        {/* Pin Point */}
        <Button
          variant="outline"
          size="sm"
          className={`h-4 w-4 p-0 flex items-center justify-center border ${
            state.selectionMode === 'pin' 
              ? 'bg-yellow-500/20 border-yellow-500' 
              : 'border-border hover:bg-yellow-500/10'
          }`}
          onClick={() => {
            const newMode = state.selectionMode === 'pin' ? null : 'pin';
            onSelectionModeChange(newMode);
          }}
        >
          <div className="w-1.5 h-1.5 bg-yellow-500" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}} />
        </Button>
      </div>

      {/* Dropdowns Column - Vertically Stacked */}
      <div className="space-y-0.5">
        {/* Skill Level Dropdown - Ultra Compact */}
        <Select
          value={state.skillPreset.name}
          onValueChange={(value) => {
            const skill = SKILL_PRESETS.find(s => s.name === value);
            if (skill) {
              onSkillChange(skill);
            }
          }}
        >
          <SelectTrigger className="h-4 text-xs px-1 [&>svg]:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SKILL_PRESETS.map((preset) => (
              <SelectItem key={preset.name} value={preset.name} className="text-xs">
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Roll Condition Dropdown - Ultra Compact */}
        <Select
          value={state.rollCondition}
          onValueChange={(value: RollCondition) => {
            onRollConditionChange(value);
          }}
        >
          <SelectTrigger className="h-4 text-xs px-1 [&>svg]:hidden">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">None</SelectItem>
            <SelectItem value="soft" className="text-xs">Soft</SelectItem>
            <SelectItem value="medium" className="text-xs">Medium</SelectItem>
            <SelectItem value="firm" className="text-xs">Firm</SelectItem>
            <SelectItem value="concrete" className="text-xs">Concrete</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}