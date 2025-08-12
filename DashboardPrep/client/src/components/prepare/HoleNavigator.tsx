import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type Hole } from '@shared/schema';
import type { LatLon } from '@shared/types';
import { 
  validateHolePolyline, 
  assignEndpoints, 
  centroidOfPolygon,
  pointAlongPolylineYds,
  bearingDeg,
  HolePolyline,
  Endpoints 
} from '@/lib/holeGeom';
import { useState } from 'react';

interface HoleNavigatorProps {
  currentHole: number;
  onHoleChange: (holeNumber: number) => void;
  onAutoNavigate?: (points: { start: LatLon | null, aim: LatLon | null, pin: LatLon | null }) => void;
  holePolylinesByRef?: Map<string, any>; // Real hole polylines from OSM by ref
  holeFeatures?: any; // All course features (greens, tees, etc.)
}

export default function HoleNavigator({ 
  currentHole, 
  onHoleChange, 
  onAutoNavigate,
  holePolylinesByRef,
  holeFeatures
}: HoleNavigatorProps) {
  const [navigationError, setNavigationError] = useState<string | null>(null);
  
  // No longer need to query for holes - using real OSM data
  const holes = holePolylinesByRef ? Array.from(holePolylinesByRef.keys()).map((ref, index) => ({
    number: parseInt(ref) || (index + 1),
    par: holePolylinesByRef.get(ref)?.par || 4,
    yards: holePolylinesByRef.get(ref)?.dist || null,
    handicap: null
  })) : [];
  const isLoading = false;

  const currentHoleData = holes?.find(h => h.number === currentHole);

  const handlePrevHole = () => {
    if (currentHole > 1) {
      const newHole = currentHole - 1;
      onHoleChange(newHole);
      handleHoleNavigation(newHole);
    }
  };

  const handleNextHole = () => {
    if (currentHole < 18) {
      const newHole = currentHole + 1;
      onHoleChange(newHole);
      handleHoleNavigation(newHole);
    }
  };

  const handleHoleSelect = (holeNumber: number) => {
    onHoleChange(holeNumber);
    handleHoleNavigation(holeNumber);
  };

  // Real hole navigation implementation using OSM data
  const handleHoleNavigation = async (holeNumber: number) => {
    try {
      setNavigationError(null);
      const holeRef = holeNumber.toString();
      
      console.log(`[Nav] Navigating to hole ${holeNumber} (ref=${holeRef})`);
      
      if (!holePolylinesByRef || !holePolylinesByRef.has(holeRef)) {
        throw {
          code: 'MISSING_HOLE_POLYLINE',
          holeId: holeRef,
          message: `Hole polyline for hole ${holeNumber} not found`
        };
      }
      
      if (!holeFeatures || !holeFeatures.greens || !holeFeatures.tees) {
        throw {
          code: 'MISSING_FEATURES',
          missing: ['greens', 'tees'],
          holeId: holeRef,
          message: 'Missing course features for hole navigation'
        };
      }
      
      const polylineData = holePolylinesByRef.get(holeRef);
      const holePolyline: HolePolyline = {
        holeId: holeRef,
        positions: polylineData.positions,
        ref: holeRef
      };
      
      console.log(`[Nav] Hole ref=${holeRef}, polyline points=${holePolyline.positions.length}, length=${polylineData.dist || 'unknown'}y`);
      
      // Validate hole polyline
      validateHolePolyline(holePolyline);
      
      // Assign endpoints using proximity to tees and greens
      const endpoints = assignEndpoints(holePolyline, holeFeatures.tees, holeFeatures.greens);
      
      console.log(`[Nav] TEE: ${JSON.stringify(endpoints.teeLL)} GREEN: ${JSON.stringify(endpoints.greenLL)} GREEN_CENTROID: ${JSON.stringify(centroidOfPolygon(endpoints.primaryGreen))}`);
      
      // Set navigation points
      const startPoint = endpoints.teeLL;
      const pinPoint = endpoints.greenLL;
      
      // Aim point is along the polyline at 40% distance or 150 yards, whichever is smaller
      let aimDistance = 150; // default
      if (polylineData.dist) {
        const totalDistance = parseFloat(polylineData.dist);
        aimDistance = Math.min(totalDistance * 0.4, 150);
      }
      const aimPoint = pointAlongPolylineYds(holePolyline.positions, aimDistance);
      
      if (onAutoNavigate) {
        onAutoNavigate({
          start: startPoint,
          aim: aimPoint,
          pin: pinPoint
        });
      }
      
      console.log(`[Nav] Navigation complete for hole ${holeNumber}`);
      
    } catch (error) {
      console.error('[Nav] Navigation error:', error);
      setNavigationError(typeof error === 'object' && error && 'message' in error 
        ? (error as any).message 
        : String(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-secondary">Hole Navigation</CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevHole}
              disabled={currentHole === 1}
              className="h-8 w-8"
            >
              <i className="fas fa-chevron-left"></i>
            </Button>
            <span className="text-sm font-medium text-secondary min-w-[60px] text-center">
              Hole {currentHole}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextHole}
              disabled={currentHole === 18}
              className="h-8 w-8"
            >
              <i className="fas fa-chevron-right"></i>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Navigation Error Display */}
        {navigationError && (
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-800 text-sm">
              {navigationError}
            </AlertDescription>
          </Alert>
        )}

        {/* Hole Grid */}
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
            <Button
              key={hole}
              variant={hole === currentHole ? 'default' : 'outline'}
              size="sm"
              className="hole-grid w-8 h-8 text-xs font-medium p-0"
              onClick={() => handleHoleSelect(hole)}
            >
              {hole}
            </Button>
          ))}
        </div>

        {/* Hole Details */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        ) : currentHoleData ? (
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Par:</span>
              <span className="font-medium">{currentHoleData.par}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Yards:</span>
              <span className="font-medium">{currentHoleData.yards}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Handicap:</span>
              <span className="font-medium">{currentHoleData.handicap}</span>
            </div>
            
            {/* Polyline Status */}
            <div className="flex justify-between">
              <span className="text-gray-600">Polyline:</span>
              <span className={`font-medium text-xs ${holePolylinesByRef?.has(currentHole.toString()) ? 'text-green-600' : 'text-red-600'}`}>
                {holePolylinesByRef?.has(currentHole.toString()) ? 'Available' : 'Missing'}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-4">
            No hole data available
          </div>
        )}

        {/* Manual Navigation Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => handleHoleNavigation(currentHole)}
          disabled={!holePolylinesByRef?.has(currentHole.toString()) || !holeFeatures}
        >
          <i className="fas fa-route mr-2"></i>
          Navigate to Hole
        </Button>
      </CardContent>
    </Card>
  );
}
