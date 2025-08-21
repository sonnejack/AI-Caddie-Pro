import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { LatLon, SkillPreset, ESResult, MaskMeta, ClassId, RollCondition } from '@shared/types';
import { getRollMultipliers } from '@/lib/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { ellipseAxes, uniformPointInEllipse, rotateTranslate, metersToLatLon, latLonToMeters } from '../../prepare/lib/ellipse';
import { generateEllipseSamples } from '@/lib/sampling';
import { sampleClassFromMask } from '@/lib/maskBuffer';
import { MaskBufferAdapter } from '@/lib/maskAdapter';
import { ES } from '@shared/expectedStrokesAdapter';

interface DispersionInspectorProps {
  start?: LatLon;
  aim?: LatLon;
  pin?: LatLon;
  skill: SkillPreset;
  rollCondition: RollCondition;
  mask?: MaskMeta;
  maskBuffer?: MaskBuffer;
  sampleCount?: number;
  sampleData?: { points: LatLon[], classes: number[], pointsLL: Float64Array };
  onESResult?: (result: ESResult & { samplePoints?: Array<{point: LatLon, classId: number}>, avgProximity?: number, avgProximityInPlay?: number }) => void;
}

export default function DispersionInspector({ 
  start, aim, pin, skill, rollCondition, mask, maskBuffer, sampleCount = 600, sampleData, onESResult 
}: DispersionInspectorProps) {
  const [samplingProgress, setSamplingProgress] = useState(0);
  const [processedSamples, setProcessedSamples] = useState(0);
  const [confidence, setConfidence] = useState(Infinity);
  const [status, setStatus] = useState<'idle' | 'sampling' | 'converged'>('idle');
  const [ellipseDimensions, setEllipseDimensions] = useState({ a: 0, b: 0 });
  const [esResult, setESResult] = useState<ESResult & { samplePoints?: Array<{point: LatLon, classId: number}>, avgProximity?: number, avgProximityInPlay?: number }>();

  // Calculate ellipse dimensions when state changes
  useEffect(() => {
    if (start && aim) {
      const distance = calculateDistance(start, aim);
      const { a, b } = ellipseAxes(distance, skill.offlineDeg, skill.distPct);
      
      // Apply roll condition multipliers to ellipse dimensions
      const rollMultipliers = getRollMultipliers(rollCondition);
      const adjustedA = a * rollMultipliers.depthMultiplier;
      const adjustedB = b * rollMultipliers.widthMultiplier;
      
      setEllipseDimensions({ a: adjustedA, b: adjustedB });
      console.log('🏌️ Ellipse dimensions with roll condition:', {
        rollCondition,
        rollMultipliers,
        original: { a, b },
        adjusted: { a: adjustedA, b: adjustedB }
      });
    } else {
      setEllipseDimensions({ a: 0, b: 0 });
    }
  }, [start, aim, skill, rollCondition]);

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
    
    // Calculate bearing from start to aim (same as CesiumCanvas)
    const startMeters = latLonToMeters(start, start);
    const aimMeters = latLonToMeters(aim, start);
    const bearing = Math.atan2(aimMeters.x - startMeters.x, aimMeters.y - startMeters.y);
    
    // Use SAME sampling function as CesiumCanvas for consistency
    // NOTE: CesiumCanvas uses (semiMajor=lateral, semiMinor=distance) 
    // but ellipseAxes returns (a=distance, b=lateral), so we swap them
    const pointsLL = generateEllipseSamples(n, b, a, bearing, aim, 1);
    
    // Convert Float64Array to LatLon array
    const points: LatLon[] = [];
    for (let i = 0; i < n; i++) {
      points.push({
        lon: pointsLL[i * 2],
        lat: pointsLL[i * 2 + 1]
      });
    }
    return points;
  }, [start]);

  const sampleClasses = useCallback(async (points: LatLon[]): Promise<ClassId[]> => {
    if (!maskBuffer) {
      console.log('⚠️ No maskBuffer available, using default fairway for all points');
      return points.map(() => 6 as ClassId); // Default to fairway
    }
    
    try {
      console.log('🎯 [DispersionInspector] Sampling', points.length, 'points using maskBuffer (these are ellipse dispersion samples representing shot outcomes)');
      console.log('🎯 [DispersionInspector] MaskBuffer dimensions:', maskBuffer.width, 'x', maskBuffer.height);
      console.log('🎯 [DispersionInspector] MaskBuffer bbox:', maskBuffer.bbox);
      console.log('🎯 [DispersionInspector] MaskBuffer data length:', maskBuffer.data.length);
      
      // Sample a histogram of the mask data to verify it contains user polygon changes
      const classCounts = new Map<number, number>();
      for (let i = 0; i < maskBuffer.data.length; i += 4) {
        const classId = maskBuffer.data[i];
        classCounts.set(classId, (classCounts.get(classId) || 0) + 1);
      }
      console.log('🎯 [DispersionInspector] Mask class distribution:', Array.from(classCounts.entries()).map(([k,v]) => `Class ${k}: ${v}`));
      
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

      // Log first few samples for debugging with distances to pin and pixel coordinates
      if (pin) {
        for (let i = 0; i < Math.min(5, points.length); i++) {
          const distanceToPin = calculateDistance(points[i], pin);
          
          // Calculate what pixel coordinates this point maps to
          const x = Math.floor(((points[i].lon - maskBuffer.bbox.west) / (maskBuffer.bbox.east - maskBuffer.bbox.west)) * maskBuffer.width);
          const y = Math.floor(((maskBuffer.bbox.north - points[i].lat) / (maskBuffer.bbox.north - maskBuffer.bbox.south)) * maskBuffer.height);
          const clampedX = Math.max(0, Math.min(maskBuffer.width - 1, x));
          const clampedY = Math.max(0, Math.min(maskBuffer.height - 1, y));
          const pixelIndex = (clampedY * maskBuffer.width + clampedX) * 4;
          const rawClassId = maskBuffer.data[pixelIndex];
          
          console.log(`Sample ${i + 1}: (${points[i].lat.toFixed(6)}, ${points[i].lon.toFixed(6)}) -> ${distanceToPin.toFixed(1)}y to pin, pixel(${clampedX},${clampedY}), rawClass=${rawClassId}, finalClass=${results[i]} (${getConditionName(results[i])})`);
        }
      } else {
        for (let i = 0; i < Math.min(5, points.length); i++) {
          console.log(`Sample ${i + 1}: (${points[i].lat.toFixed(6)}, ${points[i].lon.toFixed(6)}) -> NO PIN SET, class ${results[i]} (${getConditionName(results[i])})`);
        }
      }
      
      // Count sampled classes and compare to mask distribution
      const sampledClassCounts = new Map<number, number>();
      results.forEach(classId => {
        sampledClassCounts.set(classId, (sampledClassCounts.get(classId) || 0) + 1);
      });
      
      console.log('🎯 [DispersionInspector] Landing Conditions class distribution from', results.length, 'points:', Array.from(sampledClassCounts.entries()).map(([k,v]) => `Class ${k}: ${v} (${(100*v/results.length).toFixed(1)}%)`));
      
      // Show coordinate ranges to verify we're sampling the same area
      const lons = points.map(p => p.lon);
      const lats = points.map(p => p.lat);
      console.log('🎯 [DispersionInspector] Coordinate ranges: lon', Math.min(...lons).toFixed(6), 'to', Math.max(...lons).toFixed(6), ', lat', Math.min(...lats).toFixed(6), 'to', Math.max(...lats).toFixed(6));
      
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

    // Use sample data from CesiumCanvas if available, otherwise skip
    if (!sampleData || !sampleData.points.length) {
      console.log('🎯 [DispersionInspector] No sample data available from CesiumCanvas yet');
      setStatus('idle');
      return;
    }

    const points = sampleData.points;
    const classes = sampleData.classes as ClassId[];

    console.log('🎯 [DispersionInspector] Using', points.length, 'sample points from CesiumCanvas');
    console.log('🎯 [DispersionInspector] Sample data received - points:', points.length, 'classes:', classes.length);

    // Calculate Expected Strokes for each point directly (no worker needed for simple calculation)
    const esResults: number[] = [];
    let totalDistance = 0;
    let inPlayDistance = 0;
    let inPlayCount = 0;
    const samplePointsData = [];
    const numberOfSamples = points.length;

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
      avgProximityInPlay,
      samplePoints: samplePointsData
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

    // Don't call onESResult here to avoid infinite loop
    // onESResult will be called in a separate effect when esResult changes
  }, [aim, pin, start, skill, sampleCount, sampleData]);

  // Call onESResult when we have a new result, but use a ref to prevent infinite loops
  const lastResultRef = useRef<typeof result | null>(null);
  
  useEffect(() => {
    if (esResult && onESResult && esResult !== lastResultRef.current) {
      lastResultRef.current = esResult;
      onESResult(esResult);
      console.log('📊 DispersionInspector: Sent result to parent:', {
        meanES: esResult.mean.toFixed(3),
        avgProximity: esResult.avgProximity?.toFixed(1),
        avgProximityInPlay: esResult.avgProximityInPlay?.toFixed(1),
        sampleCount: esResult.n
      });
    }
  }, [esResult, onESResult]);

  // Reset status to 'idle' when points, skill, or sample count change to allow auto-evaluation
  useEffect(() => {
    console.log('🔄 Parameters changed:', {
      start: start ? `(${start.lat.toFixed(6)}, ${start.lon.toFixed(6)})` : 'null',
      aim: aim ? `(${aim.lat.toFixed(6)}, ${aim.lon.toFixed(6)})` : 'null', 
      pin: pin ? `(${pin.lat.toFixed(6)}, ${pin.lon.toFixed(6)})` : 'null',
      skillName: skill.name,
      rollCondition,
      sampleCount,
      maskBufferExists: !!maskBuffer,
      sampleDataAvailable: !!sampleData && sampleData.points.length > 0
    });
    
    // Reset status to allow auto-evaluation when parameters change (including mask and roll condition)
    if (start && aim && pin) {
      console.log('🔄 Resetting status to idle for auto-evaluation');
      setStatus('idle');
    }
  }, [start, aim, pin, skill, rollCondition, sampleCount, maskBuffer, sampleData]);

  // Auto-evaluate when points, skill, or sample count change (debounced)
  // Remove status and runESEvaluation from deps to prevent infinite loop
  useEffect(() => {
    if (start && aim && pin && sampleData) {
      const timeoutId = setTimeout(() => {
        // Only run if we're still idle when timeout fires
        setStatus(prevStatus => {
          if (prevStatus === 'idle') {
            runESEvaluation();
          }
          return prevStatus;
        });
      }, 300);
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [start, aim, pin, skill, rollCondition, sampleCount, sampleData]);

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
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200 drop-shadow-sm">
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