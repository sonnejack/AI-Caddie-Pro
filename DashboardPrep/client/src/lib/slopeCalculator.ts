// client/src/lib/slopeCalculator.ts
// Slope calculation engine with raster baking for advanced short game analysis

import type { LatLon } from '@shared/types';
import type { MaskBuffer } from './maskBuffer';
import { CesiumHeightProvider } from './heightProvider';

export interface SlopeData {
  percentage: number;  // 0-25.5%
  direction: number;   // 0-360 degrees (compass bearing)
}

export interface EnhancedMaskBuffer extends MaskBuffer {
  hasSlopeData: boolean;
}

export interface GreenInfo {
  center: LatLon;
  radius: number; // meters
}

/**
 * Calculate slope percentage and direction from elevation grid
 */
export function calculateSlope(
  elevationGrid: number[][],
  x: number,
  y: number,
  metersPerPixel: number
): SlopeData {
  const height = elevationGrid.length;
  const width = elevationGrid[0]?.length || 0;
  
  // Ensure we're within bounds
  if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) {
    return { percentage: 0, direction: 0 };
  }
  
  // Calculate gradients using finite difference method
  const dz_dx = (elevationGrid[y][x + 1] - elevationGrid[y][x - 1]) / (2 * metersPerPixel);
  const dz_dy = (elevationGrid[y + 1][x] - elevationGrid[y - 1][x]) / (2 * metersPerPixel);
  
  // Calculate slope percentage
  const slopeRadians = Math.atan(Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy));
  const slopePercentage = Math.tan(slopeRadians) * 100;
  
  // Calculate slope direction (aspect)
  let direction = Math.atan2(-dz_dy, -dz_dx) * 180 / Math.PI;
  if (direction < 0) direction += 360;
  
  return {
    percentage: Math.min(slopePercentage, 25.5), // Cap at 25.5%
    direction: direction
  };
}

/**
 * Find all green centers from course features
 */
export function findGreenCenters(features: any): GreenInfo[] {
  if (!features?.greens?.features) {
    return [];
  }
  
  const greens: GreenInfo[] = [];
  
  for (const feature of features.greens.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const center = calculatePolygonCentroid(feature.geometry);
      const radius = estimateGreenRadius(feature.geometry);
      
      greens.push({ center, radius });
    }
  }
  
  return greens;
}

/**
 * Calculate polygon centroid
 */
function calculatePolygonCentroid(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): LatLon {
  if (geometry.type === 'Polygon') {
    return calculateRingCentroid(geometry.coordinates[0]);
  } else {
    // For MultiPolygon, use the largest polygon
    let largestRing = geometry.coordinates[0][0];
    let largestArea = 0;
    
    for (const polygon of geometry.coordinates) {
      const area = calculateRingArea(polygon[0]);
      if (area > largestArea) {
        largestArea = area;
        largestRing = polygon[0];
      }
    }
    
    return calculateRingCentroid(largestRing);
  }
}

function calculateRingCentroid(ring: number[][]): LatLon {
  let sumLat = 0;
  let sumLon = 0;
  
  for (const coord of ring) {
    sumLon += coord[0];
    sumLat += coord[1];
  }
  
  return {
    lat: sumLat / ring.length,
    lon: sumLon / ring.length
  };
}

function calculateRingArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

function estimateGreenRadius(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  // Simple estimation based on bounding box
  const bbox = calculateBoundingBox(geometry);
  const width = (bbox.east - bbox.west) * 111320; // Rough meters conversion
  const height = (bbox.north - bbox.south) * 111320;
  return Math.max(width, height) / 2;
}

function calculateBoundingBox(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  
  const processRing = (ring: number[][]) => {
    for (const coord of ring) {
      minLon = Math.min(minLon, coord[0]);
      maxLon = Math.max(maxLon, coord[0]);
      minLat = Math.min(minLat, coord[1]);
      maxLat = Math.max(maxLat, coord[1]);
    }
  };
  
  if (geometry.type === 'Polygon') {
    processRing(geometry.coordinates[0]);
  } else {
    for (const polygon of geometry.coordinates) {
      processRing(polygon[0]);
    }
  }
  
  return { west: minLon, east: maxLon, south: minLat, north: maxLat };
}

/**
 * Sample elevations in a grid pattern around green centers
 */
export async function sampleElevationGrid(
  greens: GreenInfo[],
  maskBuffer: MaskBuffer,
  heightProvider: CesiumHeightProvider,
  radiusYards: number = 50,
  resolutionMeters: number = 2
): Promise<Map<string, { elevations: number[][], width: number, height: number, bbox: any }>> {
  const results = new Map();
  const radiusMeters = radiusYards * 0.9144; // Convert to meters
  
  for (let i = 0; i < greens.length; i++) {
    const green = greens[i];
    console.log(`🎯 Sampling elevation grid for green ${i + 1}/${greens.length}`);
    
    // Calculate grid bounds
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos(green.center.lat * Math.PI / 180);
    
    const latOffset = radiusMeters / metersPerDegreeLat;
    const lonOffset = radiusMeters / metersPerDegreeLon;
    
    const bbox = {
      west: green.center.lon - lonOffset,
      east: green.center.lon + lonOffset,
      south: green.center.lat - latOffset,
      north: green.center.lat + latOffset
    };
    
    // Calculate grid dimensions
    const width = Math.ceil((bbox.east - bbox.west) * metersPerDegreeLon / resolutionMeters);
    const height = Math.ceil((bbox.north - bbox.south) * metersPerDegreeLat / resolutionMeters);
    
    // Sample elevations in batches
    const elevations: number[][] = Array(height).fill(null).map(() => Array(width).fill(0));
    const requests: any[] = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const lat = bbox.north - (y / height) * (bbox.north - bbox.south);
        const lon = bbox.west + (x / width) * (bbox.east - bbox.west);
        
        // Check if point is within radius
        const distance = calculateDistance(green.center, { lat, lon });
        if (distance <= radiusYards) {
          requests.push({
            idx: y * width + x,
            lon,
            lat,
            gen: 1,
            gridX: x,
            gridY: y
          });
        }
      }
    }
    
    // Batch process elevation requests
    console.log(`📏 Sampling ${requests.length} elevation points for green ${i + 1}`);
    
    await new Promise<void>((resolve) => {
      let completedRequests = 0;
      
      heightProvider.sampleHeightsAsync(requests, (idx, height, gen) => {
        const request = requests.find(r => r.idx === idx);
        if (request) {
          elevations[request.gridY][request.gridX] = height;
        }
        
        completedRequests++;
        if (completedRequests >= requests.length) {
          resolve();
        }
      });
    });
    
    results.set(`green_${i}`, {
      elevations,
      width,
      height,
      bbox,
      metersPerPixel: resolutionMeters
    });
  }
  
  return results;
}

/**
 * Bake slope data into existing mask buffer
 */
export function bakeSlopeIntoMask(
  maskBuffer: MaskBuffer,
  elevationGrids: Map<string, any>,
  greens: GreenInfo[]
): EnhancedMaskBuffer {
  console.log('🎨 Baking slope data into mask buffer...');
  
  const enhancedData = new Uint8ClampedArray(maskBuffer.data);
  
  for (let i = 0; i < greens.length; i++) {
    const gridData = elevationGrids.get(`green_${i}`);
    if (!gridData) continue;
    
    const { elevations, width: gridWidth, height: gridHeight, bbox, metersPerPixel } = gridData;
    
    // Map grid coordinates to mask coordinates
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        // Convert grid position to lat/lon
        const lat = bbox.north - (gy / gridHeight) * (bbox.north - bbox.south);
        const lon = bbox.west + (gx / gridWidth) * (bbox.east - bbox.west);
        
        // Convert to mask pixel coordinates
        const maskX = Math.floor((lon - maskBuffer.bbox.west) / 
          (maskBuffer.bbox.east - maskBuffer.bbox.west) * maskBuffer.width);
        const maskY = Math.floor((maskBuffer.bbox.north - lat) / 
          (maskBuffer.bbox.north - maskBuffer.bbox.south) * maskBuffer.height);
        
        if (maskX >= 0 && maskX < maskBuffer.width && maskY >= 0 && maskY < maskBuffer.height) {
          const slope = calculateSlope(elevations, gx, gy, metersPerPixel);
          
          const pixelIndex = (maskY * maskBuffer.width + maskX) * 4;
          
          // Store slope data in G and B channels
          enhancedData[pixelIndex + 1] = Math.round(slope.percentage * 10); // G: slope % * 10
          enhancedData[pixelIndex + 2] = Math.round(slope.direction * 255 / 360); // B: direction 0-360 -> 0-255
        }
      }
    }
  }
  
  console.log('✅ Slope data baked into mask buffer');
  
  return {
    ...maskBuffer,
    data: enhancedData,
    hasSlopeData: true
  };
}

/**
 * Read slope data from enhanced mask buffer
 */
export function readSlopeFromMask(
  lon: number,
  lat: number,
  maskBuffer: EnhancedMaskBuffer
): SlopeData | null {
  if (!maskBuffer.hasSlopeData) return null;
  
  const x = Math.floor((lon - maskBuffer.bbox.west) / 
    (maskBuffer.bbox.east - maskBuffer.bbox.west) * maskBuffer.width);
  const y = Math.floor((maskBuffer.bbox.north - lat) / 
    (maskBuffer.bbox.north - maskBuffer.bbox.south) * maskBuffer.height);
  
  if (x < 0 || x >= maskBuffer.width || y < 0 || y >= maskBuffer.height) {
    return null;
  }
  
  const pixelIndex = (y * maskBuffer.width + x) * 4;
  const slopePercentage = maskBuffer.data[pixelIndex + 1] / 10; // G channel
  const slopeDirection = (maskBuffer.data[pixelIndex + 2] * 360) / 255; // B channel
  
  return {
    percentage: slopePercentage,
    direction: slopeDirection
  };
}

/**
 * Calculate distance between two points in yards
 */
function calculateDistance(p1: LatLon, p2: LatLon): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1.09361; // Convert to yards
}