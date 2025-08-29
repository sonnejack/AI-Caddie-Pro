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
    <div className="space-y-0 flex flex-col items-center">
      {/* Point Buttons - Vertical Stack */}
      <div className="flex flex-col gap-0 justify-center items-center">
        {/* Start Point */}
        <Button
          variant="outline"
          size="sm"
          className="h-4 w-4 p-0 flex items-center justify-center bg-transparent hover:bg-transparent"
          style={state.selectionMode === 'start' ? { borderColor: '#dc2626' } : {}}
          onClick={() => {
            const newMode = state.selectionMode === 'start' ? null : 'start';
            onSelectionModeChange(newMode);
          }}
        >
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full" style={state.selectionMode === 'start' ? { filter: 'brightness(1.2)' } : {}} />
        </Button>

        {/* Aim Point */}
        <Button
          variant="outline"
          size="sm"
          className="h-4 w-4 p-0 flex items-center justify-center bg-transparent hover:bg-transparent"
          style={state.selectionMode === 'aim' ? { borderColor: '#2563eb' } : {}}
          onClick={() => {
            const newMode = state.selectionMode === 'aim' ? null : 'aim';
            onSelectionModeChange(newMode);
          }}
        >
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" style={state.selectionMode === 'aim' ? { filter: 'brightness(1.2)' } : {}} />
        </Button>

        {/* Pin Point */}
        <Button
          variant="outline"
          size="sm"
          className="h-4 w-4 p-0 flex items-center justify-center bg-transparent hover:bg-transparent"
          style={state.selectionMode === 'pin' ? { borderColor: '#eab308' } : {}}
          onClick={() => {
            const newMode = state.selectionMode === 'pin' ? null : 'pin';
            onSelectionModeChange(newMode);
          }}
        >
          <div className="w-1.5 h-1.5 bg-yellow-500" style={
            {
              ...(state.selectionMode === 'pin' ? { filter: 'brightness(1.2)' } : {}),
              clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'
            }
          } />
        </Button>
      </div>

      {/* Dropdowns Column - Vertically Stacked */}
      <div className="space-y-0 flex flex-col items-center">
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
          <SelectTrigger className="h-4 text-xs px-1 bg-transparent hover:bg-transparent [&>svg]:hidden flex items-center justify-center">
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
          <SelectTrigger className="h-4 text-xs px-1 bg-transparent hover:bg-transparent [&>svg]:hidden flex items-center justify-center">
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
