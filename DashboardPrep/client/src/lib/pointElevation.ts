// pointElevation.ts
// Simple, accurate elevation sampling for specific points (start, aim, pin)

declare const window: any;
const getCesium = () => (window as any).Cesium;

export interface PointElevations {
  start?: number;
  aim?: number;
  pin?: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

// Global state for point elevations with point tracking
let currentElevations: PointElevations = {};
let elevationPoints: { start?: LatLon; aim?: LatLon; pin?: LatLon } = {};
let cesiumViewer: any = null;

/**
 * Initialize the elevation sampling system with Cesium viewer
 */
export function initPointElevation(viewer: any) {
  cesiumViewer = viewer;
  console.log('📏 Point elevation system initialized');
}

/**
 * Sample elevation for a specific point using Cesium's most detailed terrain
 */
export async function samplePointElevation(
  point: LatLon,
  pointType: 'start' | 'aim' | 'pin'
): Promise<number> {
  if (!cesiumViewer) {
    console.warn('Cesium viewer not initialized for elevation sampling');
    return 0;
  }

  try {
    console.log(`📏 Sampling elevation for ${pointType} at (${point.lat.toFixed(6)}, ${point.lon.toFixed(6)})`);
    
    const Cesium = getCesium();
    const cartographic = Cesium.Cartographic.fromDegrees(point.lon, point.lat);
    
    // Use most detailed terrain sampling
    const samples = await Cesium.sampleTerrainMostDetailed(
      cesiumViewer.terrainProvider, 
      [cartographic]
    );
    
    const elevation = samples[0].height || 0;
    
    // Store the elevation and the point it was sampled for
    currentElevations[pointType] = elevation;
    elevationPoints[pointType] = { ...point };
    
    console.log(`✅ ${pointType} elevation: ${elevation.toFixed(2)}m for point (${point.lat.toFixed(6)}, ${point.lon.toFixed(6)})`);
    return elevation;
  } catch (error) {
    console.warn(`❌ Failed to sample elevation for ${pointType}:`, error);
    currentElevations[pointType] = 0;
    return 0;
  }
}

/**
 * Sample elevation for optimization aim point (doesn't store in currentElevations)
 */
export async function sampleOptimizationElevation(point: LatLon): Promise<number> {
  if (!cesiumViewer) {
    console.warn('Cesium viewer not initialized for elevation sampling');
    return 0;
  }

  try {
    const Cesium = getCesium();
    const cartographic = Cesium.Cartographic.fromDegrees(point.lon, point.lat);
    
    const samples = await Cesium.sampleTerrainMostDetailed(
      cesiumViewer.terrainProvider, 
      [cartographic]
    );
    
    return samples[0].height || 0;
  } catch (error) {
    console.warn('❌ Failed to sample optimization elevation:', error);
    return 0;
  }
}

/**
 * Get current elevations for all points, with validation
 */
export function getCurrentElevations(): PointElevations {
  return { ...currentElevations };
}

/**
 * Get elevations only if they match the current points (prevents stale data)
 */
export function getValidatedElevations(
  currentPoints: { start?: LatLon; aim?: LatLon; pin?: LatLon }
): PointElevations {
  const validElevations: PointElevations = {};
  
  // Only return elevation if it matches the current point location
  for (const pointType of ['start', 'aim', 'pin'] as const) {
    const currentPoint = currentPoints[pointType];
    const elevationPoint = elevationPoints[pointType];
    const elevation = currentElevations[pointType];
    
    if (currentPoint && elevationPoint && elevation !== undefined) {
      // Check if points match (within small tolerance for floating point)
      const latMatch = Math.abs(currentPoint.lat - elevationPoint.lat) < 0.000001;
      const lonMatch = Math.abs(currentPoint.lon - elevationPoint.lon) < 0.000001;
      
      if (latMatch && lonMatch) {
        validElevations[pointType] = elevation;
      } else {
        console.log(`🚫 Stale elevation for ${pointType} - point moved from (${elevationPoint.lat.toFixed(6)}, ${elevationPoint.lon.toFixed(6)}) to (${currentPoint.lat.toFixed(6)}, ${currentPoint.lon.toFixed(6)})`);
      }
    }
  }
  
  return validElevations;
}

/**
 * Get elevation for a specific point
 */
export function getPointElevation(pointType: 'start' | 'aim' | 'pin'): number | undefined {
  return currentElevations[pointType];
}

/**
 * Calculate plays-like distance with elevation adjustment
 */
export function calculatePlaysLikeDistance(
  actualDistance: number,
  startElevation: number | undefined,
  endElevation: number | undefined
): { playsLike: number; elevationChange: number } {
  if (startElevation === undefined || endElevation === undefined) {
    return { playsLike: Math.round(actualDistance), elevationChange: 0 };
  }

  // Calculate elevation change in meters, then convert to yards
  const elevationChangeM = endElevation - startElevation;
  const elevationChangeYds = elevationChangeM * 1.09361;
  
  // Apply elevation adjustment to distance
  // Simple rule: uphill adds distance, downhill subtracts distance
  // Use a factor to convert elevation change to distance adjustment
  const elevationFactor = 1.0; // 1 yard of elevation = 1 yard of distance adjustment
  const playsLikeDistance = actualDistance + (elevationChangeYds * elevationFactor);
  
  return {
    playsLike: Math.round(playsLikeDistance),
    elevationChange: Math.round(elevationChangeYds)
  };
}

/**
 * Clear all stored elevations (useful when switching courses)
 */
export function clearElevations() {
  const prevElevations = { ...currentElevations };
  currentElevations = {};
  elevationPoints = {};
  console.log('📏 Point elevations cleared', { previous: prevElevations, now: currentElevations });
}

/**
 * Dispose of the elevation system
 */
export function disposePointElevation() {
  currentElevations = {};
  cesiumViewer = null;
  console.log('📏 Point elevation system disposed');
}