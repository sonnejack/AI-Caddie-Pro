import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { LatLon, SkillPreset } from '@/lib/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import type { OptimizerInput, Candidate, ProgressMsg, DoneMsg, ErrorMsg, OptimizeMsg } from '@/lib/optimizer/types';
import { initCandidateLayer, setCandidates as setCandidatePoints, clearCandidates, onCandidateClick } from './CandidateLayer';

interface OptimizerPanelProps {
  viewer?: any; // Cesium viewer reference
  start?: LatLon;
  pin?: LatLon;
  aim?: LatLon;
  skill: SkillPreset;
  maxCarry: number;
  maskBuffer?: MaskBuffer;
  heightGrid?: any; // Height grid data - only used for advanced short game analysis (not implemented yet)
  sampleCount?: number; // Controlled sample count from parent
  onSampleCountChange?: (count: number) => void; // Callback to update parent sample count
  onAimSet?: (aim: LatLon) => void; // Called when user clicks a candidate
  onOptimizationComplete?: (candidates: Candidate[]) => void;
}

export default function OptimizerPanel({ 
  viewer,
  start, 
  pin, 
  aim,
  skill, 
  maxCarry, 
  maskBuffer,
  heightGrid,
  sampleCount = 800,
  onSampleCountChange,
  onAimSet,
  onOptimizationComplete
}: OptimizerPanelProps) {
  const [strategy, setStrategy] = useState<'CEM' | 'RingGrid'>('CEM');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressNote, setProgressNote] = useState<string>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string>('');
  
  // Advanced parameters (with defaults)
  const [maxDistance, setMaxDistance] = useState(maxCarry);
  const [nEarly, setNEarly] = useState(350);
  const [ci95Stop, setCi95Stop] = useState(0.001);
  
  // Use controlled sample count from parent instead of local state
  const nFinal = sampleCount;

  const workerRef = useRef<Worker | null>(null);
  const candidateLayerInitialized = useRef(false);

  const canOptimize = start && pin && skill && maskBuffer;

  // Initialize candidate layer when viewer becomes available
  useEffect(() => {
    if (viewer && !candidateLayerInitialized.current) {
      initCandidateLayer(viewer);
      candidateLayerInitialized.current = true;
      
      // Set up candidate click handler
      onCandidateClick((idx: number, candidate: Candidate) => {
        onAimSet?.({ lon: candidate.lon, lat: candidate.lat });
      });
    }
  }, [viewer, onAimSet]);

  // Update max distance when maxCarry changes
  useEffect(() => {
    setMaxDistance(maxCarry);
  }, [maxCarry]);

  const handleRunOptimizer = useCallback(async () => {
    console.log('🎯 Optimize button clicked');
    console.log('🎯 canOptimize:', canOptimize);
    console.log('🎯 isOptimizing:', isOptimizing);
    console.log('🎯 Prerequisites:', { start: !!start, pin: !!pin, skill: !!skill, maskBuffer: !!maskBuffer });
    
    if (!canOptimize || isOptimizing) {
      console.warn('⚠️ Cannot optimize - prerequisites not met or already optimizing');
      return;
    }

    console.log('🎯 Starting optimization process...');

    setIsOptimizing(true);
    setProgress(0);
    setProgressNote('');
    setError('');
    setCandidates([]);
    clearCandidates();

    try {
      // Log mask buffer info for debugging
      console.log('🎯 Optimizer using mask buffer:', {
        width: maskBuffer!.width,
        height: maskBuffer!.height,
        bbox: maskBuffer!.bbox,
        dataLength: maskBuffer!.data.length
      });
      
      // Create optimizer input
      const optimizerInput: OptimizerInput = {
        start: start!,
        pin: pin!,
        maxDistanceMeters: maxDistance * 0.9144, // Convert yards to meters
        skill: {
          offlineDeg: skill.offlineDeg,
          distPct: skill.distPct
        },
        mask: {
          width: maskBuffer!.width,
          height: maskBuffer!.height,
          bbox: maskBuffer!.bbox,
          classes: maskBuffer!.data // Pass the full RGBA data, worker will extract class data
        },
        // heightGrid: Only used for advanced short game analysis (not implemented yet)
        // For normal optimization, we don't use elevation data
        heightGrid: undefined,
        eval: {
          nEarly,
          nFinal,
          ci95Stop
        },
        constraints: {
          disallowFartherThanPin: true,
          minSeparationMeters: 2.74 // ~3 yards
        }
      };

      // Create worker
      console.log('🎯 Creating optimizer worker...');
      workerRef.current = new Worker(
        new URL("../../workers/optimizerWorker.ts", import.meta.url), 
        { type: "module" }
      );
      console.log('🎯 Worker created:', workerRef.current);

      // Set up message handlers
      workerRef.current.onmessage = (e: MessageEvent<ProgressMsg | DoneMsg | ErrorMsg>) => {
        const message = e.data;
        console.log('🎯 Received message from worker:', message);
        
        switch (message.type) {
          case 'progress':
            setProgress(message.pct);
            setProgressNote(message.note || '');
            break;
            
          case 'done':
            setProgress(100);
            setProgressNote('Optimization complete');
            setIsOptimizing(false);
            
            const resultCandidates = message.result.candidates;
            console.log('🎯 Optimization completed with candidates:', resultCandidates);
            console.log('🎯 Viewer reference for candidates:', !!viewer);
            
            setCandidates(resultCandidates);
            setCandidatePoints(resultCandidates);
            onOptimizationComplete?.(resultCandidates);
            
            // Auto-set the best candidate as aim
            if (resultCandidates.length > 0) {
              const bestCandidate = resultCandidates[0];
              onAimSet?.({ lon: bestCandidate.lon, lat: bestCandidate.lat });
            }
            break;
            
          case 'error':
            setError(message.error);
            setIsOptimizing(false);
            setProgress(0);
            setProgressNote('');
            break;
        }
      };

      workerRef.current.onerror = (error) => {
        console.error('🎯 Optimizer worker error:', error);
        setError('Optimizer worker failed');
        setIsOptimizing(false);
        setProgress(0);
        setProgressNote('');
      };
      
      // Also listen for worker creation errors
      workerRef.current.onmessageerror = (error) => {
        console.error('🎯 Worker message error:', error);
        setError('Worker communication failed');
        setIsOptimizing(false);
      };

      // Start optimization
      const message: OptimizeMsg = {
        type: 'run',
        strategy,
        input: optimizerInput
      };
      
      console.log('🎯 Sending message to worker:', message);
      workerRef.current.postMessage(message);
      console.log('🎯 Message sent to worker');

    } catch (error) {
      console.error('Failed to start optimization:', error);
      setError(error instanceof Error ? error.message : 'Failed to start optimization');
      setIsOptimizing(false);
      setProgress(0);
      setProgressNote('');
    }
  }, [canOptimize, isOptimizing, strategy, start, pin, maxDistance, skill, maskBuffer, heightGrid, nEarly, nFinal, ci95Stop, onAimSet, onOptimizationComplete]);

  const handleCancelOptimization = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'cancel' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsOptimizing(false);
    setProgress(0);
    setProgressNote('');
  }, []);

  const handleCandidateClick = useCallback((candidate: Candidate, rank: number) => {
    onAimSet?.({ lon: candidate.lon, lat: candidate.lat });
  }, [onAimSet]);

  const formatES = (es: number, ci95?: number) => {
    if (ci95 !== undefined) {
      return `${es.toFixed(3)} ± ${ci95.toFixed(3)}`;
    }
    return es.toFixed(3);
  };

  const getDifferenceFromBest = (candidate: Candidate, bestES: number) => {
    const diff = candidate.es - bestES;
    return diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Aim Optimizer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Strategy Selection */}
        <div className="space-y-2">
          <Label htmlFor="strategy">Optimization Strategy</Label>
          <Select value={strategy} onValueChange={(value: 'CEM' | 'RingGrid') => setStrategy(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CEM">CEM (Cross-Entropy Method)</SelectItem>
              <SelectItem value="RingGrid">Ring Grid (Forward Half-Disc)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Advanced Parameters */}
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="maxDistance">Max Distance (yds)</Label>
              <Input 
                id="maxDistance"
                type="number" 
                value={maxDistance} 
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                min={50}
                max={450}
              />
            </div>
            <div>
              <Label htmlFor="nEarly">Early Samples</Label>
              <Input 
                id="nEarly"
                type="number" 
                value={nEarly} 
                onChange={(e) => setNEarly(Number(e.target.value))}
                min={100}
                max={500}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="nFinal">Final Samples</Label>
              <Input 
                id="nFinal"
                type="number" 
                value={nFinal} 
                onChange={(e) => onSampleCountChange?.(Number(e.target.value))}
                min={300}
                max={1000}
              />
            </div>
            <div>
              <Label htmlFor="ci95Stop">CI95 Threshold</Label>
              <Input 
                id="ci95Stop"
                type="number" 
                step="0.01"
                value={ci95Stop} 
                onChange={(e) => setCi95Stop(Number(e.target.value))}
                min={0.01}
                max={0.1}
              />
            </div>
          </div>
        </div>

        {/* Run/Cancel Button */}
        <Button
          className="w-full"
          onClick={() => {
            console.log('🎯 Button clicked - isOptimizing:', isOptimizing);
            if (isOptimizing) {
              handleCancelOptimization();
            } else {
              handleRunOptimizer();
            }
          }}
          disabled={!canOptimize}
          variant={isOptimizing ? "destructive" : "default"}
        >
          {isOptimizing ? (
            <>
              <i className="fas fa-stop mr-2"></i>
              Cancel Optimization
            </>
          ) : (
            <>
              <i className="fas fa-play mr-2"></i>
              Optimize
            </>
          )}
        </Button>

        {/* Progress */}
        {isOptimizing && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span>{progressNote || 'Running optimization...'}</span>
              <span>{Math.floor(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Results */}
        {candidates.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Ranked Candidates</h4>
            <p className="text-xs text-gray-500">Click a candidate on the map or below to set as aim point</p>
            
            <div className="space-y-2">
              {candidates.map((candidate, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    index === 0 
                      ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100' // Gold
                      : index === 1
                      ? 'bg-gray-50 border-gray-300 hover:bg-gray-100'      // Silver
                      : index === 2
                      ? 'bg-orange-50 border-orange-300 hover:bg-orange-100' // Bronze
                      : 'bg-slate-250 border-slate-500 hover:bg-slate-300'    // Good ES
                  }`}
                  onClick={() => handleCandidateClick(candidate, index + 1)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-sm font-medium ${
                      index === 0 ? 'text-yellow-800' : 
                      index === 1 ? 'text-gray-800' : 
                      index === 2 ? 'text-orange-800' : 'text-slate-800'
                    }`}>
                      #{index + 1} {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '✨'}
                    </span>
                    <Badge 
                      variant="secondary" 
                      className={
                        index === 0 ? 'bg-yellow-200 text-yellow-800' : 
                        index === 1 ? 'bg-gray-200 text-gray-800' :
                        index === 2 ? 'bg-orange-200 text-orange-800' : 'bg-slate-200 text-slate-800'
                      }
                    >
                      {index === 0 ? 'Best' : getDifferenceFromBest(candidate, candidates[0].es)}
                    </Badge>
                  </div>
                  <div className={`text-sm ${
                    index === 0 ? 'text-yellow-700' : 
                    index === 1 ? 'text-gray-700' : 
                    index === 2 ? 'text-orange-700' : 'text-slate-700'
                  }`}>
                    <p>ES: <span className="font-medium">{formatES(candidate.es, candidate.esCi95)}</span></p>
                    <p>Position: <span className="font-mono text-xs">{candidate.lat.toFixed(6)}, {candidate.lon.toFixed(6)}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Help Text */}
        {!canOptimize && (
          <div className="text-center py-4 text-sm text-gray-500">
            Set start, pin, and load course mask to run optimizer
          </div>
        )}

        {candidates.length === 0 && !isOptimizing && canOptimize && (
          <div className="text-center py-4 text-sm text-gray-500">
            Click "Optimize" to find the best aim points
          </div>
        )}
      </CardContent>
    </Card>
  );
}