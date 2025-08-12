import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface VectorLayerPanelProps {
  onLayerToggle: (layerType: string, enabled: boolean) => void;
  availableFeatures?: Record<string, any>;
}

interface LayerConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

const LAYER_CONFIGS: LayerConfig[] = [
  {
    id: 'polylines',
    name: 'Hole Polylines',
    icon: 'fas fa-route',
    color: '#FF6B00',
    description: 'Golf hole centerlines'
  },
  {
    id: 'greens',
    name: 'Greens',
    icon: 'fas fa-flag',
    color: '#28B43C',
    description: 'Putting surfaces'
  },
  {
    id: 'fairways',
    name: 'Fairways',
    icon: 'fas fa-leaf',
    color: '#4CAF50',
    description: 'Primary landing areas'
  },
  {
    id: 'bunkers',
    name: 'Bunkers',
    icon: 'fas fa-mountain',
    color: '#D2B48C',
    description: 'Sand traps'
  },
  {
    id: 'water',
    name: 'Water',
    icon: 'fas fa-tint',
    color: '#0078FF',
    description: 'Water hazards'
  },
  {
    id: 'hazards',
    name: 'Hazards',
    icon: 'fas fa-exclamation-triangle',
    color: '#E74C3C',
    description: 'Natural hazards'
  },
  {
    id: 'ob',
    name: 'Out of Bounds',
    icon: 'fas fa-ban',
    color: '#8E44AD',
    description: 'Boundary markers'
  }
];

export default function VectorLayerPanel({ onLayerToggle, availableFeatures }: VectorLayerPanelProps) {
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({
    polylines: true, // Default to showing polylines
    greens: false,
    fairways: false,
    bunkers: false,
    water: false,
    hazards: false,
    ob: false
  });

  const handleToggle = (layerId: string, enabled: boolean) => {
    setLayerStates(prev => ({
      ...prev,
      [layerId]: enabled
    }));
    onLayerToggle(layerId, enabled);
  };

  // Count available features for each layer
  const getFeatureCount = (layerId: string): number => {
    if (!availableFeatures || !availableFeatures[layerId]) return 0;
    return availableFeatures[layerId].features?.length || 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center">
          <i className="fas fa-vector-square mr-2 text-primary"></i>
          Vector Layers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {LAYER_CONFIGS.map((config) => {
          const featureCount = getFeatureCount(config.id);
          const hasFeatures = featureCount > 0;
          const isEnabled = layerStates[config.id];
          
          return (
            <div key={config.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  <i 
                    className={`${config.icon} text-sm`} 
                    style={{ color: isEnabled ? config.color : '#9CA3AF' }}
                  ></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-gray-700 truncate">
                      {config.name}
                    </span>
                    {hasFeatures && (
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        {featureCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {config.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={(checked) => handleToggle(config.id, checked)}
                disabled={!hasFeatures}
                className="flex-shrink-0"
              />
            </div>
          );
        })}
        
        {/* Summary */}
        <div className="pt-2 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            {Object.values(layerStates).filter(Boolean).length} of {LAYER_CONFIGS.length} layers visible
          </p>
        </div>
      </CardContent>
    </Card>
  );
}