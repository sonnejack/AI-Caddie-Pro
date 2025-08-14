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

interface DispersionInspectorProps {
  start?: LatLon;
  aim?: LatLon;
  pin?: LatLon;
  skill: SkillPreset;
  mask?: MaskMeta;
  maskBuffer?: MaskBuffer;
  onESResult?: (result: ESResult & { samplePoints?: Array<{point: LatLon, classId: number}>, avgProximity?: number, avgProximityInPlay?: number }) => void;
}

export default function DispersionInspector({ 
  start, aim, pin, skill, mask, maskBuffer, onESResult 
}: DispersionInspectorProps) {
  const [samplingProgress, setSamplingProgress] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
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
    setSampleCount(0);
    setConfidence(Infinity);

    const { a, b } = ellipseAxes(calculateDistance(start, aim), skill.offlineDeg, skill.distPct);
    // Use fixed number of samples (remove Monte Carlo convergence)
    const numberOfSamples = 600; // Default slider value
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
      
      // Map class to condition for ES calculation
      const condition = 
        classId === 5 ? "green" :
        classId === 6 ? "fairway" :
        classId === 4 ? "sand" :
        classId === 7 ? "recovery" :
        classId === 2 ? "water" :
        "rough";

      // Calculate Expected Strokes (we'll implement this properly)
      const es = 2.0 + (distanceToPin / 100); // Placeholder - need real ES calculation
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
    const avgProximity = totalDistance / numberOfSamples;
    const avgProximityInPlay = inPlayCount > 0 ? inPlayDistance / inPlayCount : avgProximity;

    const result = {
      mean: meanES,
      ci95: 0.05, // Placeholder
      n: numberOfSamples,
      countsByClass: classes.reduce((counts, cls) => {
        counts[cls] = (counts[cls] || 0) + 1;
        return counts;
      }, {} as Record<number, number>)
    };

    // Update UI
    setESResult(result);
    setSampleCount(result.n);
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
  }, [aim, pin, start, skill, generateEllipsePoints, sampleClasses, onESResult]);

  // Reset status to 'idle' when points change to allow auto-evaluation
  useEffect(() => {
    console.log('🔄 Point coordinates changed:', {
      start: start ? `(${start.lat.toFixed(6)}, ${start.lon.toFixed(6)})` : 'null',
      aim: aim ? `(${aim.lat.toFixed(6)}, ${aim.lon.toFixed(6)})` : 'null', 
      pin: pin ? `(${pin.lat.toFixed(6)}, ${pin.lon.toFixed(6)})` : 'null'
    });
    
    // Reset status to allow auto-evaluation when points change
    if (start && aim && pin) {
      console.log('🔄 Resetting status to idle for auto-evaluation');
      setStatus('idle');
    }
  }, [start, aim, pin]);

  // Auto-evaluate when points change (debounced)
  useEffect(() => {
    console.log('🔄 Auto-evaluation useEffect triggered:', {
      hasStart: !!start,
      hasAim: !!aim,
      hasPin: !!pin,
      hasMaskBuffer: !!maskBuffer,
      status,
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
  }, [start, aim, pin, skill, maskBuffer, runESEvaluation, status]);

  const canEvaluate = start && aim && pin;

  const getStatusBadge = () => {
    switch (status) {
      case 'sampling':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Sampling</Badge>;
      case 'converged':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Converged</Badge>;
      default:
        return <Badge variant="secondary" className="bg-gray-100 text-gray-600">Idle</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-secondary">Dispersion Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ellipse Dimensions */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Ellipse Dimensions</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 bg-slate-50 rounded">
              <p className="text-lg font-bold text-primary">
                {(ellipseDimensions.a * 2).toFixed(1)}
              </p>
              <p className="text-xs text-gray-600">Long. (yds)</p>
            </div>
            <div className="text-center p-2 bg-slate-50 rounded">
              <p className="text-lg font-bold text-primary">
                {(ellipseDimensions.b * 2).toFixed(1)}
              </p>
              <p className="text-xs text-gray-600">Lateral (yds)</p>
            </div>
          </div>
        </div>

        {/* Evaluate Button */}
        <Button
          className="w-full"
          onClick={runESEvaluation}
          disabled={!canEvaluate || status === 'sampling'}
        >
          <i className="fas fa-calculator mr-2"></i>
          Evaluate ES
        </Button>

        {/* Sampling Info */}
        {status !== 'idle' && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Monte Carlo Sampling</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Samples:</span>
                <span className="font-medium">{sampleCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Confidence:</span>
                <span className="font-medium">±{confidence === Infinity ? '∞' : confidence.toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Status:</span>
                {getStatusBadge()}
              </div>
              {esResult && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Expected Strokes:</span>
                  <span className="font-medium">{esResult.mean.toFixed(3)} ± {esResult.ci95.toFixed(3)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {status === 'sampling' && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-600">Sampling Progress</span>
              <span className="text-xs text-gray-600">{Math.floor(samplingProgress)}%</span>
            </div>
            <Progress value={samplingProgress} className="h-2" />
          </div>
        )}

        {status === 'idle' && (
          <div className="text-center py-4 text-sm text-gray-500">
            Set start, aim, and pin points to begin analysis
          </div>
        )}
      </CardContent>
    </Card>
  );
}