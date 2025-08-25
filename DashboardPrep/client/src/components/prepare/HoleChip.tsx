import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";

interface HoleChipProps {
  currentHole: number;
  onHoleChange: (hole: number) => void;
  holePolylinesByRef?: Map<string, any>;
  holeFeatures?: any;
  onAutoNavigate?: (points: { start: any | null, aim: any | null, pin: any | null }) => void;
  cesiumViewer?: any;
}

export default function HoleChip({ 
  currentHole, 
  onHoleChange, 
  holePolylinesByRef,
  holeFeatures,
  onAutoNavigate,
  cesiumViewer
}: HoleChipProps) {
  const [showHoleSelector, setShowHoleSelector] = useState(false);

  // Get par for current hole from polylines data
  const getCurrentPar = () => {
    if (!holePolylinesByRef) return 4;
    const holeData = holePolylinesByRef.get(currentHole.toString());
    return holeData?.par || 4;
  };

  const currentPar = getCurrentPar();

  // Generate hole grid (3x6 = 18 holes)
  const generateHoleGrid = () => {
    const holes = [];
    const totalHoles = Math.max(18, holePolylinesByRef?.size || 18);
    
    for (let i = 1; i <= totalHoles; i++) {
      const holeData = holePolylinesByRef?.get(i.toString());
      const par = holeData?.par || 4;
      holes.push({ number: i, par });
    }
    
    return holes;
  };

  const holes = generateHoleGrid();

  // Real hole navigation implementation using OSM data (from HoleNavigator)
  const handleHoleNavigation = async (holeNumber: number) => {
    try {
      const holeRef = holeNumber.toString();
      
      if (!holePolylinesByRef || !holePolylinesByRef.has(holeRef)) {
        console.warn(`Hole polyline for hole ${holeNumber} not found`);
        return;
      }
      
      if (!holeFeatures || !holeFeatures.greens || !holeFeatures.tees) {
        console.warn('Missing course features for hole navigation');
        return;
      }

      // Import hole geometry functions dynamically
      const { 
        validateHolePolyline, 
        assignEndpoints, 
        pointAlongPolylineYds,
        bearingDeg,
        offsetLL
      } = await import('@/lib/holeGeom');
      
      const polylineData = holePolylinesByRef.get(holeRef);
      const holePolyline = {
        holeId: holeRef,
        positions: polylineData.positions,
        ref: holeRef
      };
      
      // Validate and get endpoints
      validateHolePolyline(holePolyline);
      const endpoints = assignEndpoints(holePolyline, holeFeatures.tees, holeFeatures.greens);
      
      // Set navigation points
      const startPoint = endpoints.teeLL;
      const pinPoint = endpoints.greenLL;
      
      // Aim point is along the polyline
      let aimDistance = 300;
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
      
      // Fly to hole using Cesium viewer
      if (cesiumViewer) {
        const Cesium = (window as any).Cesium;
        
        const holeLen = polylineData.dist ? parseFloat(polylineData.dist) : 400;
        const hole_offset = (holeLen ** 0.87) * 0.7 + 50;
        
        const heading = bearingDeg(startPoint.lon, startPoint.lat, pinPoint.lon, pinPoint.lat);
        const offsetHeading = (heading + 180) % 360;
        const offsetPosition = offsetLL(startPoint.lon, startPoint.lat, hole_offset, offsetHeading);
        
        const destLon = Cesium.Math.toRadians(offsetPosition.lon);
        const destLat = Cesium.Math.toRadians(offsetPosition.lat);
        
        const cartographic = Cesium.Cartographic.fromDegrees(offsetPosition.lon, offsetPosition.lat);
        
        Cesium.sampleTerrainMostDetailed(cesiumViewer.terrainProvider, [cartographic])
          .then(() => {
            const terrainHeight = cartographic.height || 0;
            const hole_height = Math.max((holeLen ** 0.83) * 0.7 + terrainHeight, 300);
            
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
      
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  const handlePrevHole = () => {
    const newHole = currentHole > 1 ? currentHole - 1 : holes.length;
    onHoleChange(newHole);
    handleHoleNavigation(newHole);
  };

  const handleNextHole = () => {
    const newHole = currentHole < holes.length ? currentHole + 1 : 1;
    onHoleChange(newHole);
    handleHoleNavigation(newHole);
  };

  return (
    <div className="glass-card-mobile">
      <div className="flex items-center gap-0.5 px-1 py-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 text-white hover:bg-primary/20"
          onClick={handlePrevHole}
        >
          <i className="fas fa-chevron-left text-xs"></i>
        </Button>

        <Dialog open={showHoleSelector} onOpenChange={setShowHoleSelector}>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              className="px-1 py-0 h-4 text-xs font-medium hover:bg-primary/10"
            >
              Hole {currentHole}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4 text-center">Select Hole</h3>
              <div className="grid grid-cols-3 gap-2">
                {holes.map(hole => (
                  <Button
                    key={hole.number}
                    variant={hole.number === currentHole ? "default" : "outline"}
                    size="sm"
                    className="h-12 flex flex-col items-center justify-center"
                    onClick={() => {
                      onHoleChange(hole.number);
                      handleHoleNavigation(hole.number);
                      setShowHoleSelector(false);
                    }}
                  >
                    <div className="text-sm font-bold">{hole.number}</div>
                    <div className="text-xs opacity-80">Par {hole.par}</div>
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 text-white hover:bg-primary/20"
          onClick={handleNextHole}
        >
          <i className="fas fa-chevron-right text-xs"></i>
        </Button>
      </div>
    </div>
  );
}