import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { LatLon, SkillPreset, ESResult, MaskMeta, ClassId } from '@shared/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { ellipseAxes, uniformPointInEllipse, rotateTranslate, metersToLatLon, latLonToMeters } from '../../prepare/lib/ellipse';
import { sampleClassFromMask } from '@/lib/maskBuffer';
import { MaskBufferAdapter } from '@/lib/maskAdapter';
import { ES } from '@shared/expectedStrokesAdapter';

interface DispersionInspectorProps {
  start?: LatLon;
  aim?: LatLon;
  pin?: LatLon;
  skill: SkillPreset;
  mask?: MaskMeta;
  maskBuffer?: MaskBuffer;
  sampleCount?: number;
  onESResult?: (result: ESResult & { samplePoints?: Array<{point: LatLon, classId: number}>, avgProximity?: number, avgProximityInPlay?: number }) => void;
}

export default function DispersionInspector({ 
  start, aim, pin, skill, mask, maskBuffer, sampleCount = 600, onESResult 
}: DispersionInspectorProps) {
  const [samplingProgress, setSamplingProgress] = useState(0);
  const [processedSamples, setProcessedSamples] = useState(0);
  const [confidence, setConfidence] = useState(Infinity);
  const [status, setStatus] = useState<'idle' | 'sampling' | 'converged'>('idle');
  const [ellipseDimensions, setEllipseDimensions] = useState({ a: 0, b: 0 });
  const [esResult, setESResult] = useState<ESResult>();

  // Calculate ellipse dimensions when state changes
  useEffect(() => {
    if (start && aim) {
      const distance = calculateDistance(start, aim);
      const { a, b } = ellipseAxes(distance, skill.offlineDeg, skill.distPct);
      setEllipseDimensions({ a, b });
    } else {
      setEllipseDimensions({ a: 0, b: 0 });
    }
  }, [start, aim, skill]);

  // Use the same distance calculation as the ES worker for consistency
  const calculateDistance = (p1: LatLon, p2: LatLon) => {
    const Rm = 6371000;
    const toRad = (d: number) => d * Math.PI / 180;
    const yds = (m: number) => m * 1.09361;
    const x = toRad(p2.lon - p1.lon) * Math.cos(toRad((p1.lat + p2.lat) / 2));
    const y = toRad(p2.lat - p1.lat);
    return yds(Math.sqrt(x * x + y * y) * Rm);
  };

  const generateEllipsePoints = useCallback((aim: LatLon, a: number, b: number, n: number): LatLon[] => {
    if (!start) return [];
    
    // Calculate bearing from start to aim
    const startMeters = latLonToMeters(start, start);
    const aimMeters = latLonToMeters(aim, start);
    const bearing = Math.atan2(aimMeters.x - startMeters.x, aimMeters.y - startMeters.y);
    
    const points: LatLon[] = [];
    for (let i = 1; i <= n; i++) {
      const localPoint = uniformPointInEllipse(i, a, b);
      const rotatedPoint = rotateTranslate(localPoint.x, localPoint.y, bearing, aimMeters);
      const worldPoint = metersToLatLon(rotatedPoint.x, rotatedPoint.y, start);
      points.push(worldPoint);
    }
    return points;
  }, [start]);

  const sampleClasses = useCallback(async (points: LatLon[]): Promise<ClassId[]> => {
    if (!maskBuffer) {
      console.log('⚠️ No maskBuffer available, using default fairway for all points');
      return points.map(() => 6 as ClassId); // Default to fairway
    }
    
    try {
      console.log('🎯 Sampling', points.length, 'points using maskBuffer (these are ellipse dispersion samples representing shot outcomes)');
      const results = points.map(point => sampleClassFromMask(point.lon, point.lat, maskBuffer));
      
      // Function to map class ID to condition name for logging
      const getConditionName = (classId: number): string => {
        switch (classId) {
          case 0: return 'unknown/rough';
          case 1: return 'OB';
          case 2: return 'water';
          case 3: return 'hazard';
          case 4: return 'bunker/sand';
          case 5: return 'green';
          case 6: return 'fairway';
          case 7: return 'recovery';
          case 8: return 'rough';
          case 9: return 'tee';
          default: return `unknown-${classId}`;
        }
      };

      // Log first few samples for debugging with distances to pin
      if (pin) {
        for (let i = 0; i < Math.min(5, points.length); i++) {
          const distanceToPin = calculateDistance(points[i], pin);
          console.log(`Sample ${i + 1}: (${points[i].lat.toFixed(6)}, ${points[i].lon.toFixed(6)}) -> ${distanceToPin.toFixed(1)} yards to pin, class ${results[i]} (${getConditionName(results[i])})`);
        }
      } else {
        for (let i = 0; i < Math.min(5, points.length); i++) {
          console.log(`Sample ${i + 1}: (${points[i].lat.toFixed(6)}, ${points[i].lon.toFixed(6)}) -> NO PIN SET, class ${results[i]} (${getConditionName(results[i])})`);
        }
      }
      
      return results;
    } catch (error) {
      console.error('❌ Error sampling maskBuffer, using default fairway:', error);
      return points.map(() => 6 as ClassId); // Default to fairway on error
    }
  }, [maskBuffer]);

  const runESEvaluation = useCallback(async () => {
    if (!aim || !pin || !start) return;

    setStatus('sampling');
    setSamplingProgress(0);
    setProcessedSamples(0);
    setConfidence(Infinity);

    const { a, b } = ellipseAxes(calculateDistance(start, aim), skill.offlineDeg, skill.distPct);
    // Use sample count from props (controlled by UI slider)
    const numberOfSamples = sampleCount;
    console.log('🎯 Using', numberOfSamples, 'sample points for dispersion analysis');
    
    // Generate points
    const points = generateEllipsePoints(aim, a, b, numberOfSamples);
    const classes = await sampleClasses(points);

    console.log('🎯 Generated', points.length, 'ellipse points and', classes.length, 'class samples');

    // Calculate Expected Strokes for each point directly (no worker needed for simple calculation)
    const esResults: number[] = [];
    let totalDistance = 0;
    let inPlayDistance = 0;
    let inPlayCount = 0;
    const samplePointsData = [];

    console.log('🎯 Calculating Expected Strokes for each sample point:');
    console.log('📍 Start point:', `(${start!.lat.toFixed(6)}, ${start!.lon.toFixed(6)})`);
    console.log('🎯 Aim point:', `(${aim!.lat.toFixed(6)}, ${aim!.lon.toFixed(6)})`);
    console.log('📌 Pin point:', `(${pin!.lat.toFixed(6)}, ${pin!.lon.toFixed(6)})`);

    for (let i = 0; i < numberOfSamples; i++) {
      const point = points[i];
      const classId = classes[i];
      const distanceToPin = calculateDistance(point, pin);
      const distanceFromTee = calculateDistance(start!, point);
      
      // Map class to condition and calculate penalty for ES calculation
      let condition: "green"|"fairway"|"rough"|"sand"|"recovery"|"water";
      let penalty = 0;
      
      switch (classId) {
        case 0: condition = "rough"; penalty = 0; break; // UNKNOWN -> rough
        case 1: condition = "rough"; penalty = 2; break; // OB -> rough + 2
        case 2: condition = "water"; penalty = 0; break; // WATER (already includes +1 in engine)
        case 3: condition = "rough"; penalty = 1; break; // HAZARD -> rough + 1
        case 4: condition = "sand"; penalty = 0; break;  // BUNKER -> sand
        case 5: condition = "green"; penalty = 0; break; // GREEN
        case 6: condition = "fairway"; penalty = 0; break; // FAIRWAY
        case 7: condition = "recovery"; penalty = 0; break; // RECOVERY
        case 8: condition = "rough"; penalty = 0; break; // ROUGH
        case 9: condition = "fairway"; penalty = 0; break; // TEE -> fairway
        default: condition = "rough"; penalty = 0; break;
      }

      // Calculate Expected Strokes using the correct engine
      const baseES = ES.calculate(distanceToPin, condition);
      const es = baseES + penalty;
      esResults.push(es);
      
      totalDistance += distanceToPin;
      samplePointsData.push({ point, classId, distance: distanceToPin });

      // In-play excludes OB (1) and Water (2)
      if (classId !== 1 && classId !== 2) {
        inPlayDistance += distanceToPin;
        inPlayCount++;
      }

      // Debug first 10 points with all details
      if (i < 10) {
        console.log(`Sampled point ${i + 1}: ${distanceFromTee.toFixed(1)} yards from tee, ${distanceToPin.toFixed(1)} yards to pin, condition = ${condition}, ES = ${es.toFixed(3)}`);
      }
    }

    // Calculate results
    const meanES = esResults.reduce((sum, es) => sum + es, 0) / esResults.length;
    
    // Calculate standard error and 95% confidence interval
    const variance = esResults.reduce((sum, es) => sum + Math.pow(es - meanES, 2), 0) / (esResults.length - 1);
    const standardError = Math.sqrt(variance / esResults.length);
    const ci95 = 1.96 * standardError; // 95% confidence interval
    
    const avgProximity = totalDistance / numberOfSamples;
    const avgProximityInPlay = inPlayCount > 0 ? inPlayDistance / inPlayCount : avgProximity;

    // Create proper ESBreakdown with all class IDs
    const countsByClass: Record<ClassId, number> = {
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0
    };
    
    classes.forEach(cls => {
      if (cls >= 0 && cls <= 9) {
        countsByClass[cls as ClassId]++;
      }
    });

    const result = {
      mean: meanES,
      ci95: ci95,
      n: numberOfSamples,
      countsByClass,
      avgProximity,
      avgProximityInPlay
    };

    // Update UI
    setESResult(result);
    setProcessedSamples(result.n);
    setConfidence(result.ci95);
    setSamplingProgress(100);
    setStatus('converged');

    console.log('📊 Final Results:', {
      meanES: meanES.toFixed(3),
      avgProximity: avgProximity.toFixed(1),
      avgProximityInPlay: avgProximityInPlay.toFixed(1),
      samplesUsed: numberOfSamples
    });

    onESResult?.({
      ...result,
      samplePoints: samplePointsData,
      avgProximity,
      avgProximityInPlay
    });
  }, [aim, pin, start, skill, sampleCount, generateEllipsePoints, sampleClasses, onESResult]);

  // Reset status to 'idle' when points, skill, or sample count change to allow auto-evaluation
  useEffect(() => {
    console.log('🔄 Parameters changed:', {
      start: start ? `(${start.lat.toFixed(6)}, ${start.lon.toFixed(6)})` : 'null',
      aim: aim ? `(${aim.lat.toFixed(6)}, ${aim.lon.toFixed(6)})` : 'null', 
      pin: pin ? `(${pin.lat.toFixed(6)}, ${pin.lon.toFixed(6)})` : 'null',
      skillName: skill.name,
      sampleCount
    });
    
    // Reset status to allow auto-evaluation when parameters change
    if (start && aim && pin) {
      console.log('🔄 Resetting status to idle for auto-evaluation');
      setStatus('idle');
    }
  }, [start, aim, pin, skill, sampleCount]);

  // Auto-evaluate when points, skill, or sample count change (debounced)
  useEffect(() => {
    console.log('🔄 Auto-evaluation useEffect triggered:', {
      hasStart: !!start,
      hasAim: !!aim,
      hasPin: !!pin,
      hasMaskBuffer: !!maskBuffer,
      status,
      sampleCount,
      skillName: skill.name,
      canEvaluate: start && aim && pin && maskBuffer && status === 'idle'
    });
    
    if (start && aim && pin && maskBuffer && status === 'idle') {
      console.log('⏰ Starting auto-evaluation in 300ms...');
      const timeoutId = setTimeout(() => {
        console.log('🚀 Auto-evaluation timeout fired, calling runESEvaluation()');
        runESEvaluation();
      }, 300);
      return () => {
        console.log('⏰ Auto-evaluation timeout cleared');
        clearTimeout(timeoutId);
      };
    } else {
      console.log('❌ Auto-evaluation conditions not met');
    }
  }, [start, aim, pin, skill, sampleCount, maskBuffer, runESEvaluation, status]);

  const canEvaluate = start && aim && pin;

  // Calculate condition breakdown from ES result
  const calculateConditionBreakdown = () => {
    const totalSamples = esResult?.n || 0;
    
    // Map class IDs to conditions with colors (always show all condition types)
    const conditionMapping = [
      { classId: 6, condition: 'Fairway', color: 'bg-lime-500' },
      { classId: 5, condition: 'Green', color: 'bg-green-400' },
      { classId: 8, condition: 'Rough', color: 'bg-yellow-600' },
      { classId: 4, condition: 'Bunker', color: 'bg-yellow-300' },
      { classId: 2, condition: 'Water', color: 'bg-blue-500' },
      { classId: 3, condition: 'Hazard', color: 'bg-red-500' },
      { classId: 1, condition: 'OB', color: 'bg-gray-600' },
      { classId: 7, condition: 'Recovery', color: 'bg-purple-500' },
      { classId: 9, condition: 'Tee', color: 'bg-cyan-400' },
      { classId: 0, condition: 'Unknown', color: 'bg-gray-400' }
    ];

    return conditionMapping
      .map(({ classId, condition, color }) => {
        const count = esResult?.countsByClass?.[classId as keyof typeof esResult.countsByClass] || 0;
        const percentage = totalSamples > 0 ? Math.round((count / totalSamples) * 100) : 0;
        const hasData = count > 0; // Show row if there's any count, even if percentage rounds to 0
        return { condition, percentage, count, color, hasData };
      })
      .sort((a, b) => b.count - a.count); // Sort by count descending to put populated rows first
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">Dispersion Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Ellipse Dimensions */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Ellipse Dimensions</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 bg-muted rounded">
              <p className="text-lg font-bold text-primary">
                {(ellipseDimensions.a * 2).toFixed(1)}
              </p>
              <p className="text-xs text-gray-600">Long. (yds)</p>
            </div>
            <div className="text-center p-2 bg-muted rounded">
              <p className="text-lg font-bold text-primary">
                {(ellipseDimensions.b * 2).toFixed(1)}
              </p>
              <p className="text-xs text-gray-600">Lateral (yds)</p>
            </div>
          </div>
        </div>

        {/* Landing Conditions */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Landing Conditions</h4>
          <div className="space-y-1.5">
            {calculateConditionBreakdown().map((condition, index) => (
              <div key={index} className="flex items-center space-x-2 h-5">
                {/* Condition label */}
                <div className="flex-shrink-0 w-12 text-xs text-gray-600 text-right flex items-center justify-end h-full">
                  {condition.hasData ? condition.condition : ''}
                </div>
                
                {/* Bar container */}
                <div className="flex-1 bg-muted rounded-full h-3 relative overflow-hidden">
                  {/* Filled bar */}
                  <div
                    className={`h-full ${condition.color} transition-all duration-300 ease-out`}
                    style={{ width: `${Math.max(condition.percentage, condition.hasData ? 1 : 0)}%` }}
                  />
                  
                  {/* Percentage text overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-800 drop-shadow-sm">
                      {condition.percentage > 0 ? `${condition.percentage}%` : condition.hasData ? '<1%' : ''}
                    </span>
                  </div>
                </div>
                
                {/* Count */}
                <div className="flex-shrink-0 w-6 text-xs text-gray-500 text-left flex items-center h-full">
                  {condition.count > 0 ? condition.count : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}