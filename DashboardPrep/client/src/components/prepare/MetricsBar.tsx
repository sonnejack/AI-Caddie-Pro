import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrepareState } from '../../lib/types';
import { strokesEngine } from '../../lib/expectedStrokes';
import { getValidatedElevations, calculatePlaysLikeDistance, subscribeToElevationUpdates } from '@/lib/pointElevation';

interface ESResult {
  mean: number;
  ci95: number;
  n: number;
  pointsLL: Float64Array;
  distsYds: Float32Array;
  classes: Uint8Array;
  samplePoints?: Array<{point: { lat: number; lon: number }, classId: number}>;
  avgProximity?: number;
  avgProximityInPlay?: number;
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

  // Calculate condition breakdown from ES result
  const calculateConditionBreakdown = (esResult?: ESResult) => {
    if (!esResult || !esResult.classes || esResult.classes.length === 0) {
      // Fallback to mock data if no ES result
      return [
        { condition: 'Fairway', percentage: 65, count: 0, color: 'bg-green-500' },
        { condition: 'Rough', percentage: 25, count: 0, color: 'bg-yellow-600' },
        { condition: 'Bunker', percentage: 8, count: 0, color: 'bg-yellow-300' },
        { condition: 'Water', percentage: 2, count: 0, color: 'bg-blue-500' },
      ];
    }

    // Count classes from ES result
    const counts: Record<number, number> = {};
    for (let i = 0; i < esResult.classes.length; i++) {
      const classId = esResult.classes[i];
      counts[classId] = (counts[classId] || 0) + 1;
    }

    const totalSamples = esResult.classes.length;
    
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
        avgProximity: 0,
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
    
    // Calculate Expected Strokes using the engine
    const expectedStrokes = strokesEngine.calculateExpectedStrokes(aimDistance, 'fairway');
    
    // Use proximity from ES result if available, otherwise mock calculation
    const avgProximity = esResult?.avgProximity || (8 + Math.random() * 8);

    // Calculate condition breakdown from ES result
    const conditionBreakdown = calculateConditionBreakdown(esResult);

    return {
      totalDistance: Math.round(totalDistance),
      aimDistance: Math.round(aimDistance),
      totalPlaysLike,
      aimPlaysLike,
      expectedStrokes: expectedStrokes,
      avgProximity: avgProximity,
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
            <p className="text-2xl font-bold text-orange-600">{metrics.expectedStrokes.toFixed(2)}</p>
            <p className="text-xs text-gray-600">Expected Strokes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{metrics.avgProximity.toFixed(1)}</p>
            <p className="text-xs text-gray-600">Avg Proximity (ft)</p>
          </div>
        </div>

        {/* Condition Breakdown */}
        {metrics.conditionBreakdown.length > 0 && (
          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-sm font-medium text-secondary mb-3">Landing Conditions</h4>
            <div className="flex flex-wrap items-center gap-4">
              {metrics.conditionBreakdown.map((condition, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded ${condition.color}`} />
                  <span className="text-sm text-gray-600">
                    {condition.condition} {condition.percentage}% ({condition.count})
                  </span>
                </div>
              ))}
            </div>

            {/* Visual Condition Bar */}
            <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              {metrics.conditionBreakdown.map((condition, index) => (
                <div
                  key={index}
                  className={`h-full ${condition.color} inline-block`}
                  style={{ width: `${condition.percentage}%` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {metrics.totalDistance === 0 && (
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-chart-bar text-4xl mb-4 opacity-30"></i>
            <p className="text-sm">Set start and pin positions to view metrics</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
