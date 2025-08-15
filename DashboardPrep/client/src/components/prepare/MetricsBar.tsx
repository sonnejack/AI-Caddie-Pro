import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrepareState } from '../../lib/types';
import { ES } from '@shared/expectedStrokesAdapter';
import { getValidatedElevations, calculatePlaysLikeDistance, subscribeToElevationUpdates } from '@/lib/pointElevation';

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

interface MetricsBarProps {
  state: PrepareState;
  esResult?: ESResult;
}

export default function MetricsBar({ state, esResult }: MetricsBarProps) {
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

  // Get in-play proximity - use new format if available, fallback to legacy
  const getInPlayProximity = (esResult?: ESResult): number | null => {
    if (esResult?.avgProximityInPlay !== undefined) {
      return esResult.avgProximityInPlay;
    }
    
    // Fallback to legacy calculation
    if (!esResult || !esResult.distsYds || !esResult.classes || esResult.distsYds.length === 0) return null;
    
    let total = 0;
    let count = 0;
    
    for (let i = 0; i < esResult.distsYds.length; i++) {
      const classId = esResult.classes[i];
      // Exclude OB (1) and Water (2)
      if (classId !== 1 && classId !== 2) {
        total += esResult.distsYds[i];
        count++;
      }
    }
    
    return count > 0 ? total / count : null;
  };

  // Get class counts for breakdown - use new format if available, fallback to legacy
  const getClassCounts = (esResult?: ESResult) => {
    if (esResult?.countsByClass) {
      return esResult.countsByClass;
    }
    
    // Fallback to legacy calculation
    if (!esResult || !esResult.classes) return {};
    
    const counts: Record<number, number> = {};
    for (let i = 0; i < esResult.classes.length; i++) {
      const classId = esResult.classes[i];
      counts[classId] = (counts[classId] || 0) + 1;
    }
    return counts;
  };

  // Calculate condition breakdown from ES result
  const calculateConditionBreakdown = (esResult?: ESResult) => {
    const counts = getClassCounts(esResult);
    const totalSamples = esResult ? (esResult.n || 0) : 0;
    
    if (totalSamples === 0) {
      return [];
    }
    
    // Map class IDs to conditions with updated colors
    const conditionMapping = [
      { classId: 6, condition: 'Fairway', color: 'bg-lime-500' },
      { classId: 5, condition: 'Green', color: 'bg-green-400' },
      { classId: 8, condition: 'Rough', color: 'bg-yellow-600' },
      { classId: 4, condition: 'Bunker', color: 'bg-yellow-300' },
      { classId: 2, condition: 'Water', color: 'bg-blue-500' },
      { classId: 3, condition: 'Hazard', color: 'bg-red-500' },
      { classId: 1, condition: 'OB', color: 'bg-gray-400' },
      { classId: 7, condition: 'Recovery', color: 'bg-purple-500' },
      { classId: 9, condition: 'Tee', color: 'bg-cyan-400' },
      { classId: 0, condition: 'Unknown', color: 'bg-gray-500' },
    ];

    return conditionMapping
      .map(({ classId, condition, color }) => {
        const count = counts[classId] || 0;
        const percentage = totalSamples > 0 ? Math.round((count / totalSamples) * 100) : 0;
        return { condition, percentage, count, color };
      })
      .filter(item => item.count > 0) // Only show conditions that have samples
      .sort((a, b) => b.percentage - a.percentage); // Sort by percentage descending
  };


  // Calculate distances and metrics
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
        inPlayProximity: null,
        sampleCount: 0,
        conditionBreakdown: []
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
    
    // Calculate plays-like distances with elevation using point elevation system
    const totalPlaysLike = calculatePlaysLikeDistance(totalDistance, elevations.start, elevations.pin);
    const aimPlaysLike = state.aim ? 
      calculatePlaysLikeDistance(aimDistance, elevations.start, elevations.aim) :
      { playsLike: Math.round(aimDistance), elevationChange: 0 };
    
    // Use Expected Strokes from ES result if available, otherwise calculate for fairway
    const expectedStrokes = esResult?.mean || ES.calculate(aimDistance, 'fairway');
    const expectedStrokesCI = esResult?.ci95 || 0;
    
    // Get proximity values
    const avgProximity = getAvgProximity(esResult);
    const inPlayProximity = getInPlayProximity(esResult);

    // Calculate condition breakdown from ES result
    const conditionBreakdown = calculateConditionBreakdown(esResult);

    return {
      totalDistance: Math.round(totalDistance),
      aimDistance: Math.round(aimDistance),
      totalPlaysLike,
      aimPlaysLike,
      expectedStrokes: expectedStrokes,
      expectedStrokesCI: expectedStrokesCI,
      avgProximity: avgProximity,
      inPlayProximity: inPlayProximity,
      sampleCount: esResult?.n || 0,
      conditionBreakdown
    };
  }, [state.start, state.pin, state.aim, elevationUpdateTrigger, esResult]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-secondary">Shot Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{metrics.totalDistance}</p>
            <p className="text-xs text-gray-600">Total Distance (yds)</p>
            {/* Plays-like distance with elevation indicator */}
            {state.start && state.pin && (
              <div className="mt-1">
                <div className="flex items-center justify-center space-x-1">
                  {metrics.totalPlaysLike.elevationChange !== 0 && (
                    <span className={`text-sm font-medium ${
                      metrics.totalPlaysLike.elevationChange < 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {metrics.totalPlaysLike.elevationChange > 0 ? '+' : ''}{metrics.totalPlaysLike.elevationChange}
                    </span>
                  )}
                  <span className="text-sm font-bold text-gray-700">{metrics.totalPlaysLike.playsLike}</span>
                </div>
                <p className="text-xs text-gray-600">Plays like (yds)</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-accent">{metrics.aimDistance}</p>
            <p className="text-xs text-gray-600">Aim Distance (yds)</p>
            {/* Plays-like distance with elevation indicator */}
            {state.start && (state.aim || state.pin) && (
              <div className="mt-1">
                <div className="flex items-center justify-center space-x-1">
                  {metrics.aimPlaysLike.elevationChange !== 0 && (
                    <span className={`text-sm font-medium ${
                      metrics.aimPlaysLike.elevationChange < 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {metrics.aimPlaysLike.elevationChange > 0 ? '+' : ''}{metrics.aimPlaysLike.elevationChange}
                    </span>
                  )}
                  <span className="text-sm font-bold text-gray-700">{metrics.aimPlaysLike.playsLike}</span>
                </div>
                <p className="text-xs text-gray-600">Plays like (yds)</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {metrics.expectedStrokes.toFixed(3)}
              {metrics.expectedStrokesCI > 0 && (
                <span className="text-sm text-gray-500"> ±{metrics.expectedStrokesCI.toFixed(3)}</span>
              )}
            </p>
            <p className="text-xs text-gray-600">
              Expected Strokes {metrics.sampleCount > 0 && `(n=${metrics.sampleCount})`}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {metrics.avgProximity !== null ? formatDistance(metrics.avgProximity) : '---'}
            </p>
            <p className="text-xs text-gray-600">Avg Proximity to Pin</p>
            {metrics.inPlayProximity !== null && metrics.inPlayProximity !== metrics.avgProximity && (
              <p className="text-xs text-gray-500 mt-1">
                In-Play: {formatDistance(metrics.inPlayProximity!)}
              </p>
            )}
          </div>
        </div>


      </CardContent>
    </Card>
  );
}
