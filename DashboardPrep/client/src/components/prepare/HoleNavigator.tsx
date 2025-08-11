import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { type Hole } from '@shared/schema';
import type { LatLon } from '@shared/types';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { autoSetHolePoints, calculateHoleCameraPosition } from '@/lib/holeNavigation';

interface HoleNavigatorProps {
  currentHole: number;
  onHoleChange: (holeNumber: number) => void;
  onAutoNavigate?: (points: { start: LatLon | null, aim: LatLon | null, pin: LatLon | null }) => void;
  onCameraPosition?: (camera: { position: LatLon, heading: number, pitch: number, height: number }) => void;
  maskBuffer?: MaskBuffer;
}

export default function HoleNavigator({ currentHole, onHoleChange, onAutoNavigate, onCameraPosition, maskBuffer }: HoleNavigatorProps) {
  // For demo, using St. Andrews data
  const { data: holes, isLoading } = useQuery<Hole[]>({
    queryKey: ['/api/courses', 'st-andrews-old-1', 'holes'],
  });

  const currentHoleData = holes?.find(h => h.number === currentHole);

  const handlePrevHole = () => {
    if (currentHole > 1) {
      onHoleChange(currentHole - 1);
    }
  };

  const handleNextHole = () => {
    if (currentHole < 18) {
      onHoleChange(currentHole + 1);
    }
  };

  const handleAutoNavigate = () => {
    if (!maskBuffer || !onAutoNavigate) return;
    
    // For now, we'll use a simple approach since we don't have direct access to hole features
    // In a full implementation, this would extract features from the mask buffer
    // For demo purposes, create sample points based on hole data
    if (currentHoleData) {
      // Create approximate points based on typical hole layout
      const samplePoints = createSampleHolePoints(currentHoleData);
      onAutoNavigate(samplePoints);
      
      // Calculate camera position
      if (samplePoints.start && samplePoints.pin && onCameraPosition) {
        const cameraPos = calculateHoleCameraPosition(samplePoints.start, samplePoints.pin);
        if (cameraPos) {
          onCameraPosition(cameraPos);
        }
      }
    }
  };

  // Helper function to create sample hole points (simplified for demo)
  const createSampleHolePoints = (hole: Hole): { start: LatLon | null, aim: LatLon | null, pin: LatLon | null } => {
    // This is a simplified approach - in reality, you'd analyze the mask buffer
    // For now, create points based on St. Andrews Old Course approximate positions
    const holePositions: Record<number, { start: LatLon, aim: LatLon, pin: LatLon }> = {
      1: {
        start: { lat: 56.3487, lon: -2.8192 },
        aim: { lat: 56.3490, lon: -2.8180 },
        pin: { lat: 56.3495, lon: -2.8185 }
      },
      // Add more holes as needed - this is demo data
    };
    
    const positions = holePositions[hole.number];
    if (positions) {
      return {
        start: positions.start,
        aim: positions.aim,
        pin: positions.pin
      };
    }
    
    return { start: null, aim: null, pin: null };
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
        {/* Hole Grid */}
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
            <Button
              key={hole}
              variant={hole === currentHole ? 'default' : 'outline'}
              size="sm"
              className="hole-grid w-8 h-8 text-xs font-medium p-0"
              onClick={() => onHoleChange(hole)}
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
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-4">
            No hole data available
          </div>
        )}

        {/* Auto Navigation Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAutoNavigate}
          disabled={!maskBuffer}
        >
          <i className="fas fa-route mr-2"></i>
          Auto Navigate Hole
        </Button>
      </CardContent>
    </Card>
  );
}
