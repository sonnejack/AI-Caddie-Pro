import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ESResult } from '@shared/types';

interface ShotMetricsProps {
  esResult?: ESResult & { 
    samplePoints?: Array<{point: any, classId: number}>, 
    avgProximity?: number, 
    avgProximityInPlay?: number 
  };
  status?: 'idle' | 'sampling' | 'converged';
}

export default function ShotMetrics({ esResult, status }: ShotMetricsProps) {
  const formatDistance = (yds: number) => yds.toFixed(1);
  
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
            {/* Expected Strokes */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Expected Strokes</h4>
              <p className="text-lg font-bold text-primary">
                {esResult.mean.toFixed(3)} ± {esResult.ci95.toFixed(3)}
              </p>
              <p className="text-xs text-gray-600">n={esResult.n.toLocaleString()}</p>
            </div>

            {/* Average Proximity */}
            <div className="p-3 bg-slate-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-1">Average Proximity</h4>
              <p className="text-lg font-bold text-primary">
                {esResult.avgProximity ? formatDistance(esResult.avgProximity) : '---'} yds
              </p>
              {esResult.avgProximityInPlay && (
                <p className="text-xs text-gray-600">
                  In-Play: {formatDistance(esResult.avgProximityInPlay)} yds
                </p>
              )}
            </div>

            {/* Sample Breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded">
                <p className="font-medium">{esResult.countsByClass?.[6] || 0}</p>
                <p className="text-gray-600">Fairway</p>
              </div>
              <div className="text-center p-2 bg-emerald-50 rounded">
                <p className="font-medium">{esResult.countsByClass?.[5] || 0}</p>
                <p className="text-gray-600">Green</p>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded">
                <p className="font-medium">{esResult.countsByClass?.[4] || 0}</p>
                <p className="text-gray-600">Bunker</p>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <p className="font-medium">{esResult.countsByClass?.[2] || 0}</p>
                <p className="text-gray-600">Water</p>
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