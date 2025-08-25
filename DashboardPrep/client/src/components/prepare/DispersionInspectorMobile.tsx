import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { LatLon, SkillPreset, ESResult, MaskMeta, ClassId } from '@shared/types';
import { getRollMultipliers, type RollCondition } from '@/lib/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { ellipseAxes, uniformPointInEllipse, rotateTranslate, metersToLatLon, latLonToMeters } from '../../prepare/lib/ellipse';
import { generateEllipseSamples } from '@/lib/sampling';
import { sampleClassFromMask } from '@/lib/maskBuffer';
import { MaskBufferAdapter } from '@/lib/maskAdapter';
import { ES } from '@shared/expectedStrokesAdapter';

interface DispersionInspectorMobileProps {
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

export default function DispersionInspectorMobile({ 
  start, aim, pin, skill, rollCondition, mask, maskBuffer, sampleCount = 600, sampleData, onESResult 
}: DispersionInspectorMobileProps) {
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
      const results = points.map(point => sampleClassFromMask(point.lon, point.lat, maskBuffer));
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
      setStatus('idle');
      return;
    }

    const points = sampleData.points;
    const classes = sampleData.classes as ClassId[];

    // Calculate Expected Strokes for each point directly (no worker needed for simple calculation)
    const esResults: number[] = [];
    let totalDistance = 0;
    let inPlayDistance = 0;
    let inPlayCount = 0;
    const samplePointsData = [];
    const numberOfSamples = points.length;

    for (let i = 0; i < numberOfSamples; i++) {
      const point = points[i];
      const classId = classes[i];
      const distanceToPin = calculateDistance(point, pin);
      
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
  }, [aim, pin, start, skill, sampleCount, sampleData]);

  // Call onESResult when we have a new result, but use a ref to prevent infinite loops
  const lastResultRef = useRef<typeof esResult | null>(null);
  
  useEffect(() => {
    if (esResult && onESResult && esResult !== lastResultRef.current) {
      lastResultRef.current = esResult;
      onESResult(esResult);
    }
  }, [esResult, onESResult]);

  // Reset status to 'idle' when points, skill, or sample count change to allow auto-evaluation
  useEffect(() => {
    // Reset status to allow auto-evaluation when parameters change (including mask and roll condition)
    if (start && aim && pin) {
      setStatus('idle');
    }
  }, [start, aim, pin, skill, rollCondition, sampleCount, maskBuffer, sampleData]);

  // Auto-evaluate when points, skill, or sample count change (debounced)
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

  // Calculate condition breakdown from ES result - TOP 3 ONLY
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
        const hasData = count > 0;
        return { condition, percentage, count, color, hasData };
      })
      .filter(item => item.hasData) // Only show conditions that have samples
      .sort((a, b) => b.count - a.count) // Sort by count descending
      .slice(0, 3); // TOP 3 ONLY
  };

  return (
    <div className="space-y-1">
      {/* Ellipse Dimensions - Side by Side, Super Compact */}
      <div className="flex gap-1">
        <div className="text-center px-1 py-0.5 bg-muted rounded flex-1">
          <p className="text-xs font-bold text-primary">
            {(ellipseDimensions.a * 2).toFixed(0)}
          </p>
          <p className="text-xs text-gray-600 leading-none">L</p>
        </div>
        <div className="text-center px-1 py-0.5 bg-muted rounded flex-1">
          <p className="text-xs font-bold text-primary">
            {(ellipseDimensions.b * 2).toFixed(0)}
          </p>
          <p className="text-xs text-gray-600 leading-none">W</p>
        </div>
      </div>

      {/* Landing Conditions - Single Stacked Bar */}
      <div>
        <div className="flex rounded-full h-2 overflow-hidden bg-muted">
          {calculateConditionBreakdown().slice(0, 2).map((condition, index) => (
            <div
              key={index}
              className={`${condition.color} transition-all duration-300`}
              style={{ width: `${condition.percentage}%` }}
              title={`${condition.condition}: ${condition.percentage}%`}
            />
          ))}
        </div>
        {/* Show percentages for top 2 conditions */}
        <div className="flex justify-between text-xs text-gray-600 mt-0.5">
          {calculateConditionBreakdown().slice(0, 2).map((condition, index) => (
            <span key={index} className="text-xs">
              {condition.condition.slice(0, 3)}: {condition.percentage}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}