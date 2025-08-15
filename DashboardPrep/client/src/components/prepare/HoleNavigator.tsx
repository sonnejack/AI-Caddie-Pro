import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type Hole } from '@shared/schema';
import type { LatLon } from '@shared/types';
import { 
  validateHolePolyline, 
  assignEndpoints, 
  centroidOfPolygon,
  pointAlongPolylineYds,
  bearingDeg,
  offsetLL,
  findGreenContainingPoint,
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
  cesiumViewer?: any; // Viewer with camera functions
  pinLocation?: LatLon | null; // Current pin location
}

export default function HoleNavigator({ 
  currentHole, 
  onHoleChange, 
  onAutoNavigate,
  holePolylinesByRef,
  holeFeatures,
  cesiumViewer,
  pinLocation
}: HoleNavigatorProps) {
  const [navigationError, setNavigationError] = useState<string | null>(null);
  
  
  // No longer need to query for holes - using real OSM data
  const holes = holePolylinesByRef ? Array.from(holePolylinesByRef.keys()).map((ref, index) => ({
    number: parseInt(ref) || (index + 1),
    par: holePolylinesByRef.get(ref)?.par || 4,
    yards: holePolylinesByRef.get(ref)?.dist || null,
    handicap: null
  })) : [];

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
          message: `Hole polyline for hole ${holeNumber} not found. Have you selected a course?`
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
      
      // Aim point is along the polyline at 100% distance or 300 yards, whichever is smaller
      let aimDistance = 300; // default
      if (polylineData.dist) {
        const totalDistance = parseFloat(polylineData.dist);
        aimDistance = Math.min(totalDistance * 1, 150);
      }
      const aimPoint = pointAlongPolylineYds(holePolyline.positions, aimDistance);
      
      if (onAutoNavigate) {
        onAutoNavigate({
          start: startPoint,
          aim: aimPoint,
          pin: pinPoint
        });
      }
      
      // Fly to hole using custom formula
      if (cesiumViewer) {
        const Cesium = (window as any).Cesium;
        
        // Get hole length from polyline data (already in correct units)
        const holeLen = polylineData.dist ? parseFloat(polylineData.dist) : 400; // fallback to 400 if no distance
        
        // Calculate offset behind tee
        const hole_offset = (holeLen ** 0.87) * 0.7 + 50;
        
        // Calculate heading from tee to pin
        const heading = bearingDeg(startPoint.lon, startPoint.lat, pinPoint.lon, pinPoint.lat);
        
        // Calculate camera position offset behind tee (opposite direction from pin)
        const offsetHeading = (heading + 180) % 360;
        const offsetPosition = offsetLL(startPoint.lon, startPoint.lat, hole_offset, offsetHeading);
        
        // Destination is behind the tee position
        const destLon = Cesium.Math.toRadians(offsetPosition.lon);
        const destLat = Cesium.Math.toRadians(offsetPosition.lat);
        
        // Sample terrain height at camera position
        const cartographic = Cesium.Cartographic.fromDegrees(offsetPosition.lon, offsetPosition.lat);
        
        Cesium.sampleTerrainMostDetailed(cesiumViewer.terrainProvider, [cartographic])
          .then(() => {
            const terrainHeight = cartographic.height || 0;
            const hole_height = Math.max((holeLen ** 0.83) * 0.7 + terrainHeight, 300);
            
            // Fly to hole
            cesiumViewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromRadians(destLon, destLat, hole_height),
              orientation: {
                heading: Cesium.Math.toRadians(heading),
                pitch: Cesium.Math.toRadians(-30 + (holeLen ** 0.38)),
                roll: 0
              },
              duration: 0.5
            });
          })
          .catch(() => {
            // Fallback without terrain sampling
            const hole_height = Math.max((holeLen ** 0.83) * 0.7, 300);
            
            cesiumViewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromRadians(destLon, destLat, hole_height),
              orientation: {
                heading: Cesium.Math.toRadians(heading),
                pitch: Cesium.Math.toRadians(-30 + (holeLen ** 0.38)),
                roll: 0
              },
              duration: 0.5
            });
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
            <div className="text-center min-w-[60px]">
              <span className="text-sm font-medium text-secondary">
                Hole {currentHole}
              </span>
              {currentHoleData && (
                <div className="text-xs text-gray-500">
                  Par {currentHoleData.par}
                </div>
              )}
            </div>
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

      </CardContent>
    </Card>
  );
}
