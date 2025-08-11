import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrepareState } from '../../lib/types';
import { strokesEngine } from '../../lib/expectedStrokes';

interface MetricsBarProps {
  state: PrepareState;
}

export default function MetricsBar({ state }: MetricsBarProps) {
  // Helper function to calculate distance between two points
  const calculateDistance = (p1: { lat: number; lon: number }, p2: { lat: number; lon: number }) => {
    const R = 6371000; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.09361; // Convert to yards
  };

  // Calculate distances and metrics
  const metrics = useMemo(() => {
    if (!state.start || !state.pin) {
      return {
        totalDistance: 0,
        aimDistance: 0,
        expectedStrokes: 0,
        avgProximity: 0,
        conditionBreakdown: []
      };
    }

    const totalDistance = calculateDistance(state.start, state.pin);
    const aimDistance = state.aim ? calculateDistance(state.start, state.aim) : totalDistance * 0.9;
    
    // Calculate Expected Strokes using the engine
    const expectedStrokes = strokesEngine.calculateExpectedStrokes(aimDistance, 'fairway');
    
    // Mock proximity calculation (in real implementation, this would come from dispersion analysis)
    const avgProximity = 8 + Math.random() * 8;

    // Mock condition breakdown (in real implementation, this would come from mask analysis)
    const conditionBreakdown = [
      { condition: 'Fairway', percentage: 65, color: 'golf-condition-fairway' },
      { condition: 'Rough', percentage: 25, color: 'golf-condition-rough' },
      { condition: 'Bunker', percentage: 8, color: 'golf-condition-sand' },
      { condition: 'Water', percentage: 2, color: 'golf-condition-water' },
    ];

    return {
      totalDistance: Math.round(totalDistance),
      aimDistance: Math.round(aimDistance),
      expectedStrokes: expectedStrokes,
      avgProximity: avgProximity,
      conditionBreakdown
    };
  }, [state.start, state.pin, state.aim]);

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
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-accent">{metrics.aimDistance}</p>
            <p className="text-xs text-gray-600">Aim Distance (yds)</p>
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
                    {condition.condition} {condition.percentage}%
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
