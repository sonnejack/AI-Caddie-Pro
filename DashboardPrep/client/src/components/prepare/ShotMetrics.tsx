import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

interface ShotMetricsProps {
  esResult?: ESResult;
  status?: 'idle' | 'sampling' | 'converged';
}

export default function ShotMetrics({ esResult, status }: ShotMetricsProps) {
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
  const getAvgProximity = (): number | null => {
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
  const getInPlayProximity = (): number | null => {
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
  const getClassCounts = () => {
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
  
  const getStatusBadge = () => {
    switch (status) {
      case 'sampling':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Sampling</Badge>;
      case 'converged':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Complete</Badge>;
      default:
        return <Badge variant="secondary" className="bg-gray-100 text-gray-600">Idle</Badge>;
    }
  };

  const avgProximity = getAvgProximity();
  const inPlayProximity = getInPlayProximity();
  const classCounts = getClassCounts();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-secondary">Shot Metrics</CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {esResult ? (
          <>
            {/* Expected Strokes - Average stroke count for sampled shots */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Expected Strokes</h4>
              <p className="text-lg font-bold text-primary">
                {esResult.mean.toFixed(3)} ± {esResult.ci95.toFixed(3)}
              </p>
              <p className="text-xs text-gray-600">Average strokes to hole (n={esResult.n})</p>
            </div>

            {/* Average Proximity - Average distance from sampled shots to pin */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Avg Proximity to Pin</h4>
              <p className="text-lg font-bold text-primary">
                {avgProximity !== null ? formatDistance(avgProximity) : '---'}
              </p>
              <p className="text-xs text-gray-600">Distance from sampled shots to pin</p>
              {/* In-Play Proximity - excluding OB and Water */}
              {inPlayProximity !== null && (
                <p className="text-xs text-gray-600 mt-1">
                  In-Play: {formatDistance(inPlayProximity)}
                </p>
              )}
            </div>

            {/* Sample Breakdown by Class */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded">
                <p className="font-medium">{classCounts[6] || 0}</p>
                <p className="text-gray-600">Fairway</p>
              </div>
              <div className="text-center p-2 bg-emerald-50 rounded">
                <p className="font-medium">{classCounts[5] || 0}</p>
                <p className="text-gray-600">Green</p>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded">
                <p className="font-medium">{classCounts[4] || 0}</p>
                <p className="text-gray-600">Bunker</p>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <p className="font-medium">{classCounts[2] || 0}</p>
                <p className="text-gray-600">Water</p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <p className="font-medium">{classCounts[1] || 0}</p>
                <p className="text-gray-600">OB</p>
              </div>
              <div className="text-center p-2 bg-orange-50 rounded">
                <p className="font-medium">{classCounts[8] || 0}</p>
                <p className="text-gray-600">Rough</p>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-sm text-gray-500">
            <i className="fas fa-chart-bar text-3xl mb-3 opacity-30"></i>
            <p>Run ES evaluation to see metrics</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}