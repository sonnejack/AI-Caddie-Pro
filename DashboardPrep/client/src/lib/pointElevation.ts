// pointElevation.ts
// Simple, accurate elevation sampling for specific points (start, aim, pin)

import type { MaskBuffer } from './maskBuffer';
import { sampleBakedHeight } from './maskBuffer';

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
let currentMaskBuffer: MaskBuffer | null = null;

// Simple callback system for elevation updates
let elevationUpdateCallbacks: (() => void)[] = [];

export function subscribeToElevationUpdates(callback: () => void): () => void {
  elevationUpdateCallbacks.push(callback);
  return () => {
    elevationUpdateCallbacks = elevationUpdateCallbacks.filter(cb => cb !== callback);
  };
}

function notifyElevationUpdate() {
  elevationUpdateCallbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.warn('Error in elevation update callback:', error);
    }
  });
}

/**
 * Initialize the elevation sampling system with Cesium viewer
 */
export function initPointElevation(viewer: any) {
  cesiumViewer = viewer;
  console.log('📏 Point elevation system initialized');
}

/**
 * Set the mask buffer for baked elevation sampling
 */
export function setMaskBuffer(maskBuffer: MaskBuffer | null) {
  currentMaskBuffer = maskBuffer;
  if (maskBuffer?.elevationBake) {
    console.log('📏 Baked elevation data available for point sampling');
  }
}

/**
 * Sample elevation for a specific point using baked heights when available, fallback to Cesium terrain
 */
export async function samplePointElevation(
  point: LatLon,
  pointType: 'start' | 'aim' | 'pin'
): Promise<number> {
  try {
    console.log(`📏 Sampling elevation for ${pointType} at (${point.lat.toFixed(6)}, ${point.lon.toFixed(6)})`);
    
    let elevation = 0;
    let source = 'none';

    // Try baked height first if available
    if (currentMaskBuffer?.elevationBake) {
      const bakedHeight = sampleBakedHeight(point.lon, point.lat, currentMaskBuffer.elevationBake);
      if (bakedHeight !== null) {
        elevation = bakedHeight;
        source = 'baked';
        console.log(`🏔️ Using baked elevation for ${pointType}: ${elevation.toFixed(2)}m`);
      }
    }

    // Fallback to live Cesium sampling if no baked height or outside bake area
    if (source === 'none' && cesiumViewer) {
      const Cesium = getCesium();
      const cartographic = Cesium.Cartographic.fromDegrees(point.lon, point.lat);
      
      // Use most detailed terrain sampling
      const samples = await Cesium.sampleTerrainMostDetailed(
        cesiumViewer.terrainProvider, 
        [cartographic]
      );
      
      elevation = samples[0].height || 0;
      source = 'live';
      console.log(`🌐 Using live terrain sampling for ${pointType}: ${elevation.toFixed(2)}m`);
    } else if (source === 'none') {
      console.warn('No elevation source available (no baked data and no Cesium viewer)');
    }
    
    // Store the elevation and the point it was sampled for
    currentElevations[pointType] = elevation;
    elevationPoints[pointType] = { ...point };
    
    // Notify subscribers that elevation data has been updated
    notifyElevationUpdate();
    
    console.log(`✅ ${pointType} elevation: ${elevation.toFixed(2)}m (${source}) for point (${point.lat.toFixed(6)}, ${point.lon.toFixed(6)})`);
    return elevation;
  } catch (error) {
    console.warn(`❌ Failed to sample elevation for ${pointType}:`, error);
    currentElevations[pointType] = 0;
    return 0;
  }
}

/**
 * Sample elevation for optimization aim point (doesn't store in currentElevations)
 * Uses baked heights when available for faster, more stable results
 */
export async function sampleOptimizationElevation(point: LatLon): Promise<number> {
  try {
    // Try baked height first if available
    if (currentMaskBuffer?.elevationBake) {
      const bakedHeight = sampleBakedHeight(point.lon, point.lat, currentMaskBuffer.elevationBake);
      if (bakedHeight !== null) {
        return bakedHeight;
      }
    }

    // Fallback to live Cesium sampling if no baked height or outside bake area
    if (!cesiumViewer) {
      console.warn('No elevation source available for optimization (no baked data and no Cesium viewer)');
      return 0;
    }

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
  
  // Apply elevation adjustment to distance with different factors for up/downhill
  // Uphill (positive elevation): k = 1.105 (shots play slightly longer than straight addition)
  // Downhill (negative elevation): k = 0.90 (shots play slightly less than straight subtraction)
  const elevationFactor = elevationChangeYds > 0 ? 1.105 : 0.90;
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
  notifyElevationUpdate();
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