import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { LatLon, SkillPreset, AimCandidate, ESResult, MaskMeta, ClassId } from '@shared/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { ellipseAxes, uniformPointInEllipse, rotateTranslate, metersToLatLon, latLonToMeters } from '../../prepare/lib/ellipse';
import { PaletteMask } from '../../prepare/lib/mask';
import { MaskBufferAdapter } from '@/lib/maskAdapter';

interface OptimizerPanelProps {
  start?: LatLon;
  pin?: LatLon;
  skill: SkillPreset;
  maxCarry: number;
  mask?: MaskMeta;
  maskBuffer?: MaskBuffer;
  onBestResult?: (result: AimCandidate) => void;
}

export default function OptimizerPanel({ 
  start, pin, skill, maxCarry, mask, maskBuffer, onBestResult 
}: OptimizerPanelProps) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [candidates, setCandidates] = useState<AimCandidate[]>([]);

  const canOptimize = start && pin && skill;

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

  const runESForJob = useCallback(async (job: any): Promise<ESResult> => {
    return new Promise((resolve) => {
      const esWorker = new Worker(new URL("../../prepare/workers/esWorker.ts", import.meta.url), { type: "module" });
      esWorker.postMessage(job);
      esWorker.onmessage = (e) => {
        resolve(e.data);
        esWorker.terminate();
      };
    });
  }, []);

  const toLatLon = useCallback((rYds: number, thRad: number): LatLon => {
    if (!start) return start!;
    
    // Convert polar coordinates to lat/lon
    const meters = rYds / 1.09361; // Convert yards to meters
    const x = meters * Math.sin(thRad);
    const y = meters * Math.cos(thRad);
    
    return metersToLatLon(x, y, start);
  }, [start]);

  const axesFor = useCallback((distanceYds: number) => {
    return ellipseAxes(distanceYds, skill.offlineDeg, skill.distPct);
  }, [skill]);

  const feasible = useCallback((rYds: number, thRad: number): boolean => {
    // Simple feasibility check - can be enhanced with hazard avoidance
    return rYds > 0 && rYds <= maxCarry;
  }, [maxCarry]);

  const handleRunOptimizer = useCallback(async () => {
    if (!canOptimize || isOptimizing) return;

    setIsOptimizing(true);
    setOptimizationProgress(0);
    setCandidates([]);

    const optConfig = {
      maxCarryYds: maxCarry,
      iterations: 6,
      batchSize: 64,
      elitePct: 0.15,
      sigmaFloor: { r: 5, thDeg: 2 },
      epsilon: 0.03,
      minSamples: 200,
      maxSamples: 3000
    };

    try {
      // Create feeds object for the optimizer
      const feeds = {
        feasible,
        toLatLon,
        axesFor,
        makeEllipsePoints: generateEllipsePoints,
        sampleClasses,
        es: runESForJob
      };

      const optimizerWorker = new Worker(new URL("../../prepare/workers/optimizerWorker.ts", import.meta.url), { type: "module" });
      
      optimizerWorker.postMessage({
        start: start!,
        pin: pin!,
        feeds,
        cfg: optConfig
      });

      // Simulate progress
      const progressInterval = setInterval(() => {
        setOptimizationProgress(prev => {
          const newProgress = Math.min(prev + Math.random() * 10 + 5, 95);
          return newProgress;
        });
      }, 300);

      optimizerWorker.onmessage = (e) => {
        const result: AimCandidate = e.data;
        clearInterval(progressInterval);
        setOptimizationProgress(100);
        setIsOptimizing(false);
        
        // Set best result and create alternatives (mock for now)
        const mockAlternatives: AimCandidate[] = [
          result,
          {
            aim: { lat: result.aim.lat + 0.0002, lon: result.aim.lon - 0.0003 },
            es: { ...result.es, mean: result.es.mean + 0.025 },
            distanceYds: result.distanceYds - 10
          },
          {
            aim: { lat: result.aim.lat - 0.0003, lon: result.aim.lon + 0.0004 },
            es: { ...result.es, mean: result.es.mean + 0.045 },
            distanceYds: result.distanceYds + 15
          }
        ];
        
        setCandidates(mockAlternatives);
        onBestResult?.(result);
        optimizerWorker.terminate();
      };

      optimizerWorker.onerror = (error) => {
        console.error('Optimizer worker error:', error);
        clearInterval(progressInterval);
        setIsOptimizing(false);
        setOptimizationProgress(0);
      };

    } catch (error) {
      console.error('Failed to start optimization:', error);
      setIsOptimizing(false);
      setOptimizationProgress(0);
    }
  }, [canOptimize, isOptimizing, maxCarry, start, pin, feasible, toLatLon, axesFor, generateEllipsePoints, sampleClasses, runESForJob, onBestResult]);

  const handleCancelOptimization = useCallback(() => {
    setIsOptimizing(false);
    setOptimizationProgress(0);
  }, []);

  const getESDisplay = (candidate: AimCandidate) => {
    return `${candidate.es.mean.toFixed(3)} ± ${candidate.es.ci95.toFixed(3)}`;
  };

  const getOptimalDifference = (candidate: AimCandidate, optimal: AimCandidate) => {
    const diff = candidate.es.mean - optimal.es.mean;
    return diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-secondary">Aim Optimizer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Run/Cancel Button */}
        <Button
          className="w-full"
          onClick={isOptimizing ? handleCancelOptimization : handleRunOptimizer}
          disabled={!canOptimize}
          variant={isOptimizing ? "destructive" : "default"}
        >
          {isOptimizing ? (
            <>
              <i className="fas fa-stop mr-2"></i>
              Cancel Optimizer
            </>
          ) : (
            <>
              <i className="fas fa-play mr-2"></i>
              Run Optimizer
            </>
          )}
        </Button>

        {/* Progress Bar */}
        {isOptimizing && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span>Optimizing...</span>
              <span>{Math.floor(optimizationProgress)}%</span>
            </div>
            <Progress value={optimizationProgress} className="h-2" />
          </div>
        )}

        {/* Results */}
        {candidates.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Optimization Results</h4>
            
            <div className="space-y-2">
              {candidates.map((candidate, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    index === 0 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-sm font-medium ${
                      index === 0 ? 'text-green-800' : 'text-gray-700'
                    }`}>
                      {index === 0 ? 'Optimal Aim' : `Alternative ${index}`}
                    </span>
                    <Badge 
                      variant="secondary" 
                      className={index === 0 ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'}
                    >
                      {index === 0 ? 'Best' : getOptimalDifference(candidate, candidates[0])}
                    </Badge>
                  </div>
                  <div className={`text-sm ${
                    index === 0 ? 'text-green-700' : 'text-gray-600'
                  }`}>
                    <p>ES: <span className="font-medium">{getESDisplay(candidate)}</span></p>
                    <p>Distance: <span className="font-medium">{candidate.distanceYds} yds</span></p>
                    <p>n: <span className="font-medium">{candidate.es.n.toLocaleString()}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results state */}
        {!canOptimize && (
          <div className="text-center py-4 text-sm text-gray-500">
            Set start, pin, and skill level to run optimizer
          </div>
        )}

        {candidates.length === 0 && !isOptimizing && canOptimize && (
          <div className="text-center py-4 text-sm text-gray-500">
            Click "Run Optimizer" to find optimal aim points
          </div>
        )}
      </CardContent>
    </Card>
  );
}