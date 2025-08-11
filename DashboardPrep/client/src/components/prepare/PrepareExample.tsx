import { usePrepareState } from '../../hooks/usePrepareState';
import DispersionInspector from './DispersionInspector';
import OptimizerPanel from './OptimizerPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SKILL_PRESETS } from '@shared/types';

export default function PrepareExample() {
  const {
    courseId, holeId, setCourseId, setHoleId,
    start, setStart, pin, setPin, aim, setAim,
    skill, setSkill, maxCarry, setMaxCarry,
    mask, setMask, es, setEs, best, setBest,
    selectionMode, setSelectionMode
  } = usePrepareState();

  // Mock data for demonstration
  const handleSetMockData = () => {
    setStart({ lat: 56.348, lon: -2.82 }); // St. Andrews 1st tee
    setPin({ lat: 56.3495, lon: -2.8185 }); // St. Andrews 1st green
    setAim({ lat: 56.3487, lon: -2.8192 }); // Fairway center
    setSkill(SKILL_PRESETS[1]); // Elite Am
    setMaxCarry(280);
    
    // Mock mask data (replace with actual mask loading)
    setMask({
      url: '/mock-mask.png',
      width: 512,
      height: 512,
      bbox: { west: -2.825, south: 56.346, east: -2.815, north: 56.351 },
      paletteVersion: 1
    });
  };

  const handleClearData = () => {
    setStart(undefined);
    setPin(undefined);
    setAim(undefined);
    setEs(undefined);
    setBest(undefined);
  };

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Prepare Tab Demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button onClick={handleSetMockData}>Load Mock Data</Button>
            <Button onClick={handleClearData} variant="outline">Clear Data</Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Start:</strong> {start ? `${start.lat.toFixed(6)}, ${start.lon.toFixed(6)}` : 'Not set'}</p>
              <p><strong>Aim:</strong> {aim ? `${aim.lat.toFixed(6)}, ${aim.lon.toFixed(6)}` : 'Not set'}</p>
              <p><strong>Pin:</strong> {pin ? `${pin.lat.toFixed(6)}, ${pin.lon.toFixed(6)}` : 'Not set'}</p>
            </div>
            <div>
              <p><strong>Skill:</strong> {skill.name} ({skill.offlineDeg}°, {skill.distPct}%)</p>
              <p><strong>Max Carry:</strong> {maxCarry} yds</p>
              <p><strong>Mask:</strong> {mask ? 'Loaded' : 'Not loaded'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DispersionInspector 
          start={start}
          aim={aim}
          pin={pin}
          skill={skill}
          mask={mask}
          onESResult={setEs}
        />
        
        <OptimizerPanel 
          start={start}
          pin={pin}
          skill={skill}
          maxCarry={maxCarry}
          mask={mask}
          onBestResult={setBest}
        />
      </div>

      {es && (
        <Card>
          <CardHeader>
            <CardTitle>Expected Strokes Result</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Mean: {es.mean.toFixed(3)} ± {es.ci95.toFixed(3)} (n={es.n.toLocaleString()})</p>
          </CardContent>
        </Card>
      )}

      {best && (
        <Card>
          <CardHeader>
            <CardTitle>Optimal Aim Point</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Aim: {best.aim.lat.toFixed(6)}, {best.aim.lon.toFixed(6)}</p>
            <p>Distance: {best.distanceYds} yards</p>
            <p>Expected Strokes: {best.es.mean.toFixed(3)} ± {best.es.ci95.toFixed(3)}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}