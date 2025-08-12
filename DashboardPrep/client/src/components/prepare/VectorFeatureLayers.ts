// Vector Feature Layers - Render vector polygons on top of raster mask
// Renders outline-only polygons for each feature type with semi-transparent fill

declare const Cesium: any;

let vectorEntitiesMap = new Map<string, any>();

interface FeatureLayerConfig {
  enabled: boolean;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fillOpacity: number;
}

const DEFAULT_LAYER_CONFIGS: Record<string, FeatureLayerConfig> = {
  polylines: {
    enabled: true,
    strokeColor: '#FF6B00',
    fillColor: '#FF6B00',
    strokeWidth: 3,
    fillOpacity: 0.0
  },
  greens: {
    enabled: false,
    strokeColor: '#28B43C',
    fillColor: '#28B43C',
    strokeWidth: 2,
    fillOpacity: 0.15
  },
  fairways: {
    enabled: false,
    strokeColor: '#4CAF50',
    fillColor: '#4CAF50',
    strokeWidth: 2,
    fillOpacity: 0.10
  },
  bunkers: {
    enabled: false,
    strokeColor: '#D2B48C',
    fillColor: '#D2B48C',
    strokeWidth: 2,
    fillOpacity: 0.20
  },
  water: {
    enabled: false,
    strokeColor: '#0078FF',
    fillColor: '#0078FF',
    strokeWidth: 2,
    fillOpacity: 0.25
  },
  hazards: {
    enabled: false,
    strokeColor: '#E74C3C',
    fillColor: '#E74C3C',
    strokeWidth: 2,
    fillOpacity: 0.20
  },
  ob: {
    enabled: false,
    strokeColor: '#8E44AD',
    fillColor: '#8E44AD',
    strokeWidth: 2,
    fillOpacity: 0.15
  }
};

/**
 * Show vector feature layers on top of raster mask
 */
export function showVectorFeatures(
  viewer: any,
  features: any, // ImportResponse['holes'][0]['features']
  layerToggles: Record<string, boolean>
): void {
  if (!viewer || !features) return;
  
  // Clear existing vector entities
  clearVectorFeatures(viewer);
  
  // Render each feature type if enabled
  Object.entries(DEFAULT_LAYER_CONFIGS).forEach(([featureType, config]) => {
    if (layerToggles[featureType] && features[featureType]) {
      renderFeatureCollection(viewer, featureType, features[featureType], config);
    }
  });
}

/**
 * Clear all vector feature entities
 */
export function clearVectorFeatures(viewer: any): void {
  vectorEntitiesMap.forEach((entity, id) => {
    if (viewer.entities.contains(entity)) {
      viewer.entities.remove(entity);
    }
  });
  vectorEntitiesMap.clear();
}

/**
 * Render a single feature collection as vector polygons
 */
function renderFeatureCollection(
  viewer: any,
  featureType: string,
  featureCollection: GeoJSON.FeatureCollection,
  config: FeatureLayerConfig
): void {
  if (!featureCollection.features || featureCollection.features.length === 0) {
    return;
  }
  
  featureCollection.features.forEach((feature, index) => {
    if (!feature.geometry) return;
    
    const entityId = `vector-${featureType}-${index}`;
    
    try {
      let entity;
      
      switch (feature.geometry.type) {
        case 'Polygon':
          entity = createPolygonEntity(viewer, feature.geometry as GeoJSON.Polygon, config);
          break;
        case 'MultiPolygon':
          entity = createMultiPolygonEntity(viewer, feature.geometry as GeoJSON.MultiPolygon, config);
          break;
        case 'LineString':
          // Only render polylines for the 'polylines' layer
          if (featureType === 'polylines') {
            entity = createLineStringEntity(viewer, feature.geometry as GeoJSON.LineString, config);
          }
          break;
        case 'MultiLineString':
          if (featureType === 'polylines') {
            entity = createMultiLineStringEntity(viewer, feature.geometry as GeoJSON.MultiLineString, config);
          }
          break;
      }
      
      if (entity) {
        entity.id = entityId;
        viewer.entities.add(entity);
        vectorEntitiesMap.set(entityId, entity);
      }
      
    } catch (error) {
      console.warn(`[VectorLayers] Failed to render ${featureType} feature ${index}:`, error);
    }
  });
  
  console.log(`[VectorLayers] Rendered ${featureType}: ${featureCollection.features.length} features`);
}

/**
 * Create Cesium entity for Polygon geometry
 */
function createPolygonEntity(viewer: any, geometry: GeoJSON.Polygon, config: FeatureLayerConfig): any {
  const coordinates = geometry.coordinates;
  if (!coordinates || coordinates.length === 0) return null;
  
  // Convert exterior ring to Cesium positions
  const positions = coordinates[0].map((coord: number[]) => 
    Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
  );
  
  const entity = {
    polygon: {
      hierarchy: positions,
      material: Cesium.Color.fromCssColorString(config.fillColor).withAlpha(config.fillOpacity),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(config.strokeColor),
      outlineWidth: config.strokeWidth,
      height: 0,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      classificationType: Cesium.ClassificationType.TERRAIN,
      // Ensure vectors render above raster
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  };
  
  // Handle holes (interior rings)
  if (coordinates.length > 1) {
    const holes = coordinates.slice(1).map((hole: number[][]) => 
      hole.map((coord: number[]) => Cesium.Cartesian3.fromDegrees(coord[0], coord[1]))
    );
    entity.polygon.hierarchy = new Cesium.PolygonHierarchy(positions, holes);
  }
  
  return entity;
}

/**
 * Create Cesium entity for MultiPolygon geometry
 */
function createMultiPolygonEntity(viewer: any, geometry: GeoJSON.MultiPolygon, config: FeatureLayerConfig): any {
  // For MultiPolygon, we'll create multiple entities and return the first one
  // This is a simplified approach - ideally we'd create a collection
  const polygons = geometry.coordinates;
  if (!polygons || polygons.length === 0) return null;
  
  // Use the largest polygon
  const largestPolygon = polygons.reduce((prev, current) => 
    current[0].length > prev[0].length ? current : prev
  );
  
  return createPolygonEntity(viewer, { type: 'Polygon', coordinates: largestPolygon }, config);
}

/**
 * Create Cesium entity for LineString geometry
 */
function createLineStringEntity(viewer: any, geometry: GeoJSON.LineString, config: FeatureLayerConfig): any {
  const coordinates = geometry.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  
  const positions = coordinates.map((coord: number[]) => 
    Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
  );
  
  return {
    polyline: {
      positions,
      width: config.strokeWidth,
      material: Cesium.Color.fromCssColorString(config.strokeColor),
      clampToGround: true,
      classificationType: Cesium.ClassificationType.TERRAIN,
      // Ensure vectors render above raster
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  };
}

/**
 * Create Cesium entity for MultiLineString geometry
 */
function createMultiLineStringEntity(viewer: any, geometry: GeoJSON.MultiLineString, config: FeatureLayerConfig): any {
  // For MultiLineString, combine all lines into one polyline
  const allCoordinates: number[][] = [];
  
  geometry.coordinates.forEach(lineString => {
    allCoordinates.push(...lineString);
  });
  
  if (allCoordinates.length < 2) return null;
  
  return createLineStringEntity(viewer, { type: 'LineString', coordinates: allCoordinates }, config);
}

/**
 * Update visibility of specific layer
 */
export function setVectorLayerVisibility(
  viewer: any,
  layerType: string,
  visible: boolean
): void {
  vectorEntitiesMap.forEach((entity, id) => {
    if (id.includes(`vector-${layerType}-`)) {
      entity.show = visible;
    }
  });
}

/**
 * Get current layer configurations
 */
export function getLayerConfigs(): Record<string, FeatureLayerConfig> {
  return { ...DEFAULT_LAYER_CONFIGS };
}