// client/src/lib/greenCoverage.ts
// Green coverage calculator using rasterized line sampling for short-sidedness analysis

import type { LatLon } from '@shared/types';
import type { MaskBuffer } from './maskBuffer';

export interface GreenCoverageResult {
  percentage: number;
  category: 'shortsided' | 'standard' | 'lots';
  totalSamples: number;
  greenSamples: number;
  distanceYards: number;
}

// Cache for similar shot lines to improve performance
const coverageCache = new Map<string, GreenCoverageResult>();
const CACHE_SIZE_LIMIT = 1000;

/**
 * Calculate green coverage percentage along line from sample point to pin
 */
export function calculateGreenCoverage(
  samplePoint: LatLon,
  pinPoint: LatLon,
  maskBuffer: MaskBuffer,
  sampleIntervalYards: number = 0.5
): GreenCoverageResult {
  const cacheKey = createCacheKey(samplePoint, pinPoint, sampleIntervalYards);
  
  // Check cache first
  if (coverageCache.has(cacheKey)) {
    return coverageCache.get(cacheKey)!;
  }
  
  const totalDistance = calculateDistance(samplePoint, pinPoint);
  const numSamples = Math.max(1, Math.floor(totalDistance / sampleIntervalYards));
  
  let greenSamples = 0;
  const linePoints = generateLinePoints(samplePoint, pinPoint, numSamples);
  
  // Batch process all points for better performance
  for (const point of linePoints) {
    const classId = sampleClassAtPoint(point, maskBuffer);
    if (classId === 5) { // Class 5 = green
      greenSamples++;
    }
  }
  
  const percentage = (greenSamples / numSamples) * 100;
  const category = categorizeGreenCoverage(percentage);
  
  const result: GreenCoverageResult = {
    percentage,
    category,
    totalSamples: numSamples,
    greenSamples,
    distanceYards: totalDistance
  };
  
  // Cache the result (with size limit)
  if (coverageCache.size >= CACHE_SIZE_LIMIT) {
    const firstKey = coverageCache.keys().next().value;
    coverageCache.delete(firstKey);
  }
  coverageCache.set(cacheKey, result);
  
  return result;
}

/**
 * Batch calculate green coverage for multiple sample points
 */
export function batchCalculateGreenCoverage(
  samplePoints: LatLon[],
  pinPoint: LatLon,
  maskBuffer: MaskBuffer,
  sampleIntervalYards: number = 0.5
): GreenCoverageResult[] {
  console.log(`🎯 Batch calculating green coverage for ${samplePoints.length} points`);
  
  const results: GreenCoverageResult[] = [];
  const startTime = performance.now();
  
  for (const samplePoint of samplePoints) {
    results.push(calculateGreenCoverage(samplePoint, pinPoint, maskBuffer, sampleIntervalYards));
  }
  
  const endTime = performance.now();
  console.log(`✅ Green coverage calculated in ${(endTime - startTime).toFixed(1)}ms`);
  
  return results;
}

/**
 * Generate evenly spaced points along a line
 */
function generateLinePoints(start: LatLon, end: LatLon, numSamples: number): LatLon[] {
  const points: LatLon[] = [];
  
  for (let i = 0; i <= numSamples; i++) {
    const progress = i / numSamples;
    const lat = start.lat + (end.lat - start.lat) * progress;
    const lon = start.lon + (end.lon - start.lon) * progress;
    points.push({ lat, lon });
  }
  
  return points;
}

/**
 * Sample class ID at a specific point in the mask buffer
 */
function sampleClassAtPoint(point: LatLon, maskBuffer: MaskBuffer): number {
  const x = Math.floor((point.lon - maskBuffer.bbox.west) / 
    (maskBuffer.bbox.east - maskBuffer.bbox.west) * maskBuffer.width);
  const y = Math.floor((maskBuffer.bbox.north - point.lat) / 
    (maskBuffer.bbox.north - maskBuffer.bbox.south) * maskBuffer.height);
  
  // Check bounds
  if (x < 0 || x >= maskBuffer.width || y < 0 || y >= maskBuffer.height) {
    return 0; // Unknown/outside bounds
  }
  
  const pixelIndex = (y * maskBuffer.width + x) * 4;
  return maskBuffer.data[pixelIndex]; // R channel = class ID
}

/**
 * Categorize green coverage percentage
 */
function categorizeGreenCoverage(percentage: number): 'shortsided' | 'standard' | 'lots' {
  if (percentage < 20) return 'shortsided';
  if (percentage <= 45) return 'standard';
  return 'lots';
}

/**
 * Convert green coverage category to lookup key format
 */
export function coverageCategoryToKey(category: 'shortsided' | 'standard' | 'lots'): string {
  switch (category) {
    case 'shortsided': return '<20%';
    case 'standard': return '20-45%';
    case 'lots': return '>45%';
  }
}

/**
 * Create cache key for line segment
 */
function createCacheKey(start: LatLon, end: LatLon, interval: number): string {
  // Round to reasonable precision to improve cache hits
  const startLat = Math.round(start.lat * 100000) / 100000;
  const startLon = Math.round(start.lon * 100000) / 100000;
  const endLat = Math.round(end.lat * 100000) / 100000;
  const endLon = Math.round(end.lon * 100000) / 100000;
  
  return `${startLat},${startLon}-${endLat},${endLon}-${interval}`;
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

/**
 * Clear coverage cache (useful when switching courses)
 */
export function clearGreenCoverageCache(): void {
  coverageCache.clear();
  console.log('🗑️ Green coverage cache cleared');
}

/**
 * Get cache statistics for debugging
 */
export function getCoverageeCacheStats(): { size: number; maxSize: number } {
  return {
    size: coverageCache.size,
    maxSize: CACHE_SIZE_LIMIT
  };
}