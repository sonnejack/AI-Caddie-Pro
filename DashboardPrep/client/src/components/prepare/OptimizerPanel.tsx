import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { LatLon, SkillPreset, RollCondition } from '@/lib/types';
import { getRollMultipliers } from '@/lib/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import type { OptimizerInput, Candidate, ProgressMsg, DoneMsg, ErrorMsg, OptimizeMsg } from '@/lib/optimizer/types';
import { initCandidateLayer, setCandidates as setCandidatePoints, clearCandidates, onCandidateClick } from './CandidateLayer';

interface OptimizerPanelProps {
  viewer?: any; // Cesium viewer reference
  start?: LatLon;
  pin?: LatLon;
  aim?: LatLon;
  skill: SkillPreset;
  rollCondition: RollCondition;
  maxCarry: number;
  maskBuffer?: MaskBuffer;
  heightGrid?: any; // Height grid data - only used for advanced short game analysis (not implemented yet)
  sampleCount?: number; // Controlled sample count from parent
  onSampleCountChange?: (count: number) => void; // Callback to update parent sample count
  onAimSet?: (aim: LatLon) => void; // Called when user clicks a candidate
  onOptimizationComplete?: (candidates: Candidate[]) => void;
}

const OptimizerPanel = forwardRef<{ handleRunOptimizer: () => void }, OptimizerPanelProps>(({ 
  viewer,
  start, 
  pin, 
  aim,
  skill, 
  rollCondition,
  maxCarry, 
  maskBuffer,
  heightGrid,
  sampleCount = 800,
  onSampleCountChange,
  onAimSet,
  onOptimizationComplete
}, ref) => {
  const [strategy, setStrategy] = useState<'CEM' | 'RingGrid' | 'FullGrid'>('RingGrid');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressNote, setProgressNote] = useState<string>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string>('');
  const [parametersOpen, setParametersOpen] = useState(false);
  
  // Advanced parameters (with defaults)
  const [maxDistance, setMaxDistance] = useState(maxCarry);
  const [nEarly, setNEarly] = useState(400);
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

  // Filter candidates by plays-like distance using live elevation data
  const filterCandidatesByElevation = useCallback(async (candidates: Candidate[]): Promise<Candidate[]> => {
    console.log(`🏔️ Filtering ${candidates.length} candidates by plays-like distance ≤ ${maxDistance} yards`);
    
    if (!start) {
      console.warn('🏔️ No start position for elevation filtering');
      return candidates.slice(0, 5); // Return top 5 without filtering
    }

    const { samplePointElevation } = await import('@/lib/pointElevation');
    const validCandidates: Candidate[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidatePoint = { lon: candidate.lon, lat: candidate.lat };

      try {
        // Calculate surface distance
        const surfaceDistanceMeters = calculateDistance(start, candidatePoint);
        const surfaceDistanceYards = surfaceDistanceMeters / 0.9144;

        // Sample elevations
        const startElevation = await samplePointElevation(start, 'filter-start');
        const aimElevation = await samplePointElevation(candidatePoint, 'filter-aim');

        let playsLikeYards = surfaceDistanceYards;
        let elevationChange = 0;

        // Calculate plays-like distance if elevation data available
        if (typeof startElevation === 'number' && typeof aimElevation === 'number') {
          const elevationChangeMeters = aimElevation - startElevation;
          elevationChange = elevationChangeMeters * 1.09361; // Convert to yards
          playsLikeYards = surfaceDistanceYards + elevationChange;
        }

        const isValid = playsLikeYards <= maxDistance;

        // Log results for top 10 or valid candidates
        if (i < 10 || isValid) {
          console.log(`🏔️ #${(i+1).toString().padStart(3, ' ')}: ES=${candidate.es.toFixed(3)}, Surface=${surfaceDistanceYards.toFixed(1)}y, PlaysLike=${playsLikeYards.toFixed(1)}y, ElevΔ=${elevationChange.toFixed(1)}y, Valid=${isValid ? '✅' : '❌'}`);
        }

        if (isValid) {
          validCandidates.push(candidate);
          
          // Stop once we have 5 valid candidates
          if (validCandidates.length >= 5) {
            console.log('🏔️ Found 5 valid candidates, stopping elevation filtering');
            break;
          }
        }

      } catch (error) {
        console.warn('🏔️ Elevation sampling failed for candidate:', error);
        // If elevation sampling fails, assume valid based on surface distance
        const surfaceDistanceMeters = calculateDistance(start, candidatePoint);
        const surfaceDistanceYards = surfaceDistanceMeters / 0.9144;
        
        if (surfaceDistanceYards <= maxDistance && validCandidates.length < 5) {
          validCandidates.push(candidate);
        }
      }
    }

    console.log(`🏔️ Elevation filtering complete: ${validCandidates.length} valid candidates from ${candidates.length} total`);
    return validCandidates;
  }, [start, maxDistance]);

  // Helper function to calculate distance between two points
  const calculateDistance = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number => {
    const R = 6371000; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // meters
  };

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
      const rollMultipliers = getRollMultipliers(rollCondition);
      const optimizerInput: OptimizerInput = {
        start: start!,
        pin: pin!,
        maxDistanceMeters: (maxDistance + 30) * 0.9144, // Add 30-yard buffer and convert yards to meters
        skill: {
          offlineDeg: skill.offlineDeg,
          distPct: skill.distPct
        },
        rollCondition: rollCondition,
        rollMultipliers: rollMultipliers,
        mask: {
          width: maskBuffer!.width,
          height: maskBuffer!.height,
          bbox: maskBuffer!.bbox,
          classes: maskBuffer!.data // Pass the full RGBA data, worker will extract class data
        },
        // heightGrid: Only used for advanced short game analysis (not implemented yet)
        // For normal optimization, we don't use elevation data
        heightGrid: undefined,
        // Pass elevation bake data for plays-like distance calculations
        elevationBake: maskBuffer!.elevationBake ? {
          width: maskBuffer!.elevationBake.width,
          height: maskBuffer!.elevationBake.height,
          bbox: maskBuffer!.elevationBake.bbox,
          heightMeters: maskBuffer!.elevationBake.heightMeters
        } : undefined,
        eval: {
          nEarly,
          nFinal,
          ci95Stop,
          maxDistanceYards: maxDistance // Pass the real max distance for plays-like constraint checking
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
      workerRef.current.onmessage = async (e: MessageEvent<ProgressMsg | DoneMsg | ErrorMsg | any>) => {
        const message = e.data;
        
        switch (message.type) {
          case 'progress':
            setProgress(message.pct);
            setProgressNote(message.note || '');
            break;
            
          case 'done':
            setProgress(90);
            setProgressNote('Filtering by elevation...');
            
            const rawCandidates = message.result.candidates;
            console.log('🎯 Worker completed, got candidates for elevation filtering:', rawCandidates.length);
            
            // Apply elevation filtering on main thread (where Cesium is available)
            filterCandidatesByElevation(rawCandidates)
              .then(filteredCandidates => {
                setProgress(100);
                setProgressNote('Optimization complete');
                setIsOptimizing(false);
                
                console.log('🎯 Final candidates after elevation filtering:', filteredCandidates);
                console.log('🔍 First candidate properties:', Object.keys(filteredCandidates[0] || {}));
                console.log('🔍 First candidate ellipseDimensions:', (filteredCandidates[0] as any)?.ellipseDimensions);
                
                setCandidates(filteredCandidates);
                setCandidatePoints(filteredCandidates).catch(console.error);
                onOptimizationComplete?.(filteredCandidates);
                
                // Auto-set the best candidate as aim
                if (filteredCandidates.length > 0) {
                  const bestCandidate = filteredCandidates[0];
                  onAimSet?.({ lon: bestCandidate.lon, lat: bestCandidate.lat });
                }
              })
              .catch(error => {
                console.error('🏔️ Elevation filtering failed:', error);
                setError('Elevation filtering failed');
                setIsOptimizing(false);
              });
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

      // Start optimization in worker
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

  // Expose handleRunOptimizer to parent components via ref
  useImperativeHandle(ref, () => ({
    handleRunOptimizer
  }), [handleRunOptimizer]);

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

  const getClassIdName = (classId: number): string => {
    switch (classId) {
      case 0: return 'Unknown';
      case 1: return 'OB';
      case 2: return 'Water';
      case 3: return 'Hazard';
      case 4: return 'Bunker';
      case 5: return 'Green';
      case 6: return 'Fairway';
      case 7: return 'Recovery';
      case 8: return 'Rough';
      case 9: return 'Tee';
      default: return `Class-${classId}`;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Aim Optimizer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Advanced Parameters - Collapsible */}
        <Collapsible open={parametersOpen} onOpenChange={setParametersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto text-sm">
              <span>Optimizer Parameters</span>
              <i className={`fas fa-chevron-right text-xs transition-transform duration-200 ${parametersOpen ? 'rotate-90' : ''}`}></i>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="space-y-3 pt-2">
              {/* Strategy Selection */}
              <div className="space-y-2">
                <Label htmlFor="strategy">Optimization Strategy</Label>
                <Select value={strategy} onValueChange={(value: 'CEM' | 'RingGrid' | 'FullGrid') => setStrategy(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CEM">CEM (Cross-Entropy Method)</SelectItem>
                    <SelectItem value="RingGrid">Ring Grid (Forward Half-Disc)</SelectItem>
                    <SelectItem value="FullGrid">Full Grid (Exhaustive Search)</SelectItem>
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
            </div>
          </CollapsibleContent>
        </Collapsible>

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
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-800/30' // Gold
                      : index === 1
                      ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/50'      // Silver
                      : index === 2
                      ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-500 hover:bg-orange-100 dark:hover:bg-orange-800/30' // Bronze
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/50'    // Good ES
                  }`}
                  onClick={() => handleCandidateClick(candidate, index + 1)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-sm font-medium ${
                      index === 0 ? 'text-yellow-800 dark:text-yellow-200' : 
                      index === 1 ? 'text-gray-800 dark:text-gray-200' : 
                      index === 2 ? 'text-orange-800 dark:text-orange-200' : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      #{index + 1} {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '✨'}
                    </span>
                    <Badge 
                      variant="secondary" 
                      className={
                        index === 0 ? 'bg-yellow-200 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-100' : 
                        index === 1 ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100' :
                        index === 2 ? 'bg-orange-200 dark:bg-orange-700 text-orange-800 dark:text-orange-100' : 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                      }
                    >
                      {index === 0 ? 'Best' : getDifferenceFromBest(candidate, candidates[0].es)}
                    </Badge>
                  </div>
                  <div className={`text-sm ${
                    index === 0 ? 'text-yellow-700 dark:text-yellow-300' : 
                    index === 1 ? 'text-gray-700 dark:text-gray-300' : 
                    index === 2 ? 'text-orange-700 dark:text-orange-300' : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    <p>ES: <span className="font-medium">{formatES(candidate.es, candidate.esCi95)}</span></p>
                    <p>Position: <span className="font-mono text-xs">{candidate.lat.toFixed(6)}, {candidate.lon.toFixed(6)}</span></p>
                    {index === 0 && candidate.conditionBreakdown && (
                      <div className="mt-2 p-2 bg-black/5 dark:bg-white/5 rounded text-xs">
                        <p className="font-medium mb-1">🔍 Debug: Landing Conditions</p>
                        {Object.entries(candidate.conditionBreakdown)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 5)
                          .map(([classId, count]) => {
                            const className = getClassIdName(Number(classId));
                            const percent = Math.round((count / Object.values(candidate.conditionBreakdown!).reduce((a,b) => a+b, 0)) * 100);
                            return (
                              <span key={classId} className="mr-2">
                                {className}: {count} ({percent}%)
                              </span>
                            );
                          })}
                        {start && skill && (
                          <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10">
                            <p className="font-medium mb-1">📏 Debug: Ellipse Dimensions</p>
                            {(() => {
                              const distance = calculateDistance(start, { lat: candidate.lat, lon: candidate.lon }) / 0.9144; // yards
                              const width = 2 * distance * Math.tan(skill.offlineDeg * Math.PI / 180); // lateral - doubled
                              const length = 2 * distance * (skill.distPct / 100); // distance - doubled
                              return (
                                <>
                                  <span className="mr-4">Width: {width.toFixed(1)}y</span>
                                  <span className="mr-4">Length: {length.toFixed(1)}y</span>
                                  <span>Distance: {distance.toFixed(1)}y</span>
                                </>
                              );
                            })()} 
                          </div>
                        )}
                      </div>
                    )}
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
});

OptimizerPanel.displayName = 'OptimizerPanel';

export default OptimizerPanel;