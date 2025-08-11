import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { LatLon, SkillPreset, ESResult, MaskMeta, ClassId } from '@shared/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { ellipseAxes, uniformPointInEllipse, rotateTranslate, metersToLatLon, latLonToMeters } from '../../prepare/lib/ellipse';
import { PaletteMask } from '../../prepare/lib/mask';
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

  const calculateDistance = (p1: LatLon, p2: LatLon) => {
    const R = 6371000;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.09361; // Convert to yards
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
    if (!mask) return points.map(() => 6 as ClassId); // Default to fairway
    
    const paletteMask = new PaletteMask(mask);
    await paletteMask.ready();
    
    return points.map(point => paletteMask.sample(point));
  }, [mask]);

  const runESEvaluation = useCallback(async () => {
    if (!aim || !pin || !start) return;

    setStatus('sampling');
    setSamplingProgress(0);
    setSampleCount(0);
    setConfidence(Infinity);

    const { a, b } = ellipseAxes(calculateDistance(start, aim), skill.offlineDeg, skill.distPct);
    const maxSamples = 3000;
    const minSamples = 200;
    const epsilon = 0.03;
    
    // Generate points
    const points = generateEllipsePoints(aim, a, b, maxSamples);
    const classes = await sampleClasses(points);

    // Run ES worker
    const esWorker = new Worker(new URL("../../prepare/workers/esWorker.ts", import.meta.url), { type: "module" });
    const job = {
      pin,
      points,
      classes,
      minSamples,
      maxSamples,
      epsilon
    };

    esWorker.postMessage(job);
    esWorker.onmessage = (e) => {
      const result: ESResult = e.data;
      setESResult(result);
      setSampleCount(result.n);
      setConfidence(result.ci95);
      setSamplingProgress(100);
      setStatus('converged');

      // Calculate proximity metrics
      let totalDistance = 0;
      let inPlayDistance = 0;
      let inPlayCount = 0;
      const samplePointsData = [];

      for (let i = 0; i < result.n; i++) {
        const point = points[i];
        const classId = classes[i];
        const distance = calculateDistance(point, pin);
        
        totalDistance += distance;
        samplePointsData.push({ point, classId });

        // In-play excludes OB (1) and Water (2)
        if (classId !== 1 && classId !== 2) {
          inPlayDistance += distance;
          inPlayCount++;
        }
      }

      const avgProximity = totalDistance / result.n;
      const avgProximityInPlay = inPlayCount > 0 ? inPlayDistance / inPlayCount : avgProximity;

      onESResult?.({
        ...result,
        samplePoints: samplePointsData,
        avgProximity,
        avgProximityInPlay
      });
      esWorker.terminate();
    };
  }, [aim, pin, start, skill, generateEllipsePoints, sampleClasses, onESResult]);

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
                {ellipseDimensions.a.toFixed(1)}
              </p>
              <p className="text-xs text-gray-600">Long. (yds)</p>
            </div>
            <div className="text-center p-2 bg-slate-50 rounded">
              <p className="text-lg font-bold text-primary">
                {ellipseDimensions.b.toFixed(1)}
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