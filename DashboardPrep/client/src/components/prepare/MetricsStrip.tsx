import { useMemo, useState, useEffect } from 'react';
import { getValidatedElevations, calculatePlaysLikeDistance, subscribeToElevationUpdates } from '@/lib/pointElevation';
import { ES } from '@shared/expectedStrokesAdapter';

interface ESResult {
  mean: number;
  ci95: number;
  n: number;
  countsByClass?: Record<number, number>;
  avgProximity?: number;
  avgProximityInPlay?: number;
  // Legacy format support
  pointsLL?: Float64Array;   
  distsYds?: Float32Array;   
  classes?: Uint8Array;
}

interface MetricsStripProps {
  state: any;
  esResult?: ESResult;
  maskBuffer?: any;
}

export default function MetricsStrip({ state, esResult, maskBuffer }: MetricsStripProps) {
  // Force re-render when elevation data changes
  const [elevationUpdateTrigger, setElevationUpdateTrigger] = useState(0);
  
  useEffect(() => {
    const unsubscribe = subscribeToElevationUpdates(() => {
      setElevationUpdateTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, []);

  // Helper function to calculate distance between two points
  const calculateDistance = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }) => {
    const R = 6371000; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.09361; // Convert to yards
  };

  // Format distance: feet up to 100ft, then yards
  const formatDistance = (yards: number): string => {
    const feet = yards * 3;
    if (feet <= 100) {
      return `${feet.toFixed(0)} ft`;
    } else {
      return `${yards.toFixed(1)} yds`;
    }
  };

  // Get average proximity - use new format if available, fallback to legacy
  const getAvgProximity = (esResult?: ESResult): number | null => {
    if (esResult?.avgProximity !== undefined) {
      return esResult.avgProximity;
    }
    
    // Fallback to legacy calculation
    if (!esResult || !esResult.distsYds || esResult.distsYds.length === 0) return null;
    
    let total = 0;
    for (let i = 0; i < esResult.distsYds.length; i++) {
      total += esResult.distsYds[i];
    }
    return total / esResult.distsYds.length;
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!state.start || !state.pin) {
      return {
        totalDistance: 0,
        aimDistance: 0,
        totalPlaysLike: { playsLike: 0, elevationChange: 0 },
        aimPlaysLike: { playsLike: 0, elevationChange: 0 },
        expectedStrokes: 0,
        expectedStrokesCI: 0,
        avgProximity: null,
        sampleCount: 0
      };
    }

    const totalDistance = calculateDistance(state.start, state.pin);
    const aimDistance = state.aim ? calculateDistance(state.start, state.aim) : totalDistance * 0.9;
    
    // Get validated point elevations (only if they match current points)
    const elevations = getValidatedElevations({
      start: state.start || undefined,
      aim: state.aim || undefined,
      pin: state.pin || undefined
    });
    
    // Calculate plays-like distances with elevation using point elevation system (live terrain)
    const totalPlaysLike = calculatePlaysLikeDistance(totalDistance, elevations.start, elevations.pin);
    const aimPlaysLike = state.aim ? 
      calculatePlaysLikeDistance(aimDistance, elevations.start, elevations.aim) :
      { playsLike: Math.round(aimDistance), elevationChange: 0 };
    
    // Use Expected Strokes from ES result if available, otherwise calculate for fairway
    const expectedStrokes = esResult?.mean || ES.calculate(aimDistance, 'fairway');
    const expectedStrokesCI = esResult?.ci95 || 0;
    
    // Get proximity values
    const avgProximity = getAvgProximity(esResult);

    return {
      totalDistance: Math.round(totalDistance),
      aimDistance: Math.round(aimDistance),
      totalPlaysLike,
      aimPlaysLike,
      expectedStrokes: expectedStrokes,
      expectedStrokesCI: expectedStrokesCI,
      avgProximity: avgProximity,
      sampleCount: esResult?.n || 0
    };
  }, [state.start, state.pin, state.aim, elevationUpdateTrigger, esResult, maskBuffer]);

  const metricChips = [
    {
      label: 'Distance',
      value: `${metrics.totalDistance}`,
      subValue: metrics.totalPlaysLike.elevationChange !== 0 
        ? `(${metrics.totalPlaysLike.playsLike})` 
        : null,
      color: 'bg-primary/10 text-primary border-primary/20'
    },
    {
      label: 'Aim',
      value: `${metrics.aimDistance}`,
      subValue: metrics.aimPlaysLike.elevationChange !== 0 
        ? `(${metrics.aimPlaysLike.playsLike})` 
        : null,
      color: 'bg-accent/10 text-accent border-accent/20'
    },
    {
      label: 'ES',
      value: metrics.expectedStrokes.toFixed(3),
      subValue: metrics.expectedStrokesCI > 0 
        ? `±${metrics.expectedStrokesCI.toFixed(3)}` 
        : null,
      color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300'
    },
    {
      label: 'Prox',
      value: metrics.avgProximity !== null ? formatDistance(metrics.avgProximity) : '---',
      subValue: null,
      color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300'
    }
  ];

  return (
    <div className="glass-card-mobile">
      <div className="flex justify-center gap-2 p-2">
        {metricChips.map((chip, index) => (
          <div 
            key={index} 
            className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg border ${chip.color} min-w-[60px]`}
          >
            <div className="text-xs font-bold leading-tight">
              {chip.value}
              {chip.subValue && (
                <span className="text-xs opacity-70 ml-1">{chip.subValue}</span>
              )}
            </div>
            <div className="text-xs opacity-70 leading-tight">{chip.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}